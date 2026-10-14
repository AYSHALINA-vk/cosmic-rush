import Phaser from "phaser";
import { makeNebby, makeStella, makeVoidling, makeCometFox, makeLuma, RAINBOW } from "./characters";
import CosmicBackground, { PALETTE } from "./background";
import DifficultyDirector from "./difficulty";
import CosmicAudio, { preloadAudio } from "./audio";
import { pickRandomFact } from "../data/astroFacts";
import {
  CONSTELLATIONS,
  starById,
  nextStarId,
  isNextStar,
  isComplete,
  completedLinks,
} from "./constellations";

const DEBUG_KEYS = false; // set to true to use keys 1-4 to spawn characters

const LANE_MAX = 480;
const BEST_KEY = "cosmicRushBestScoreV1";
const LEGACY_BEST_KEY = "cosmicRushBest"; // old key: still read so existing records are not lost
const ADD = Phaser.BlendModes.ADD;
const FONT = "Orbitron, sans-serif";
const css = (n) => "#" + n.toString(16).padStart(6, "0");

const NEBULA_COLORS = [0x7b2cff, 0x2c6bff, 0xff3da6, 0x14d6c0];
const STAR_TINTS = [0xffffff, 0xbfd4ff, 0xffe9b8];
const STAR_LAYERS = [
  { count: 60, speed: [15, 30], size: [0.8, 1.2], alpha: 0.45 },
  { count: 40, speed: [50, 90], size: [1.2, 1.8], alpha: 0.75 },
  { count: 20, speed: [120, 200], size: [1.8, 2.6], alpha: 1 },
];

// character spawn schedule in seconds: [first appearance, min gap, max gap]
const SCHEDULE = {
  stella: [6, 9, 14],
  voidling: [10, 9, 14],
  fox: [14, 24, 34],
  luma: [25, 40, 65],
};
const BASE_SPEED = 380;
const BOOST_SPEED = 560;
const BOOST_SECONDS = 6;
const SHIELD_SECONDS = 12;
const STELLA_POINTS = 250;
const WARNING_SECONDS = 1.4;

// asteroid tuning (difficulty.js multiplies BASE_FALL per level)
const BASE_FALL = 220; // level-1 asteroid fall speed (px/s)
const ASTEROID_SIZE = 48; // diameter used for formation spacing

// constellation tuning
const CON_FIRST_SPAWN = 9; // seconds before the first constellation star falls
const CON_RESPAWN = [6, 9]; // seconds between a collected star and the next target
const CON_RETRY = 2.5; // seconds before a missed star is sent again
const CON_W = 56; // preview drawing area
const CON_H = 62;
const CON_HUD_Y = 72; // top of the constellation preview
const CON_TOP = 18; // preview drawing area starts below the label

const CHAR_CONFIG = {
  stella: { vy: 130, amp: 35, freq: 1.6, hitR: 20, make: makeStella },
  fox: { vy: 150, amp: 50, freq: 1.3, hitR: 18, make: makeCometFox },
  luma: { vy: 120, amp: 60, freq: 1.1, hitR: 20, make: makeLuma },
  voidling: { vy: 170, amp: 55, freq: 1.4, hitR: 18, make: makeVoidling },
};

// results screen
const CREW_NAMES = { stella: "Stella", fox: "Comet Fox", luma: "Luma" };
const PANEL_W = 360;
const PANEL_H = 520; // minimum height; the real height grows to fit the fact card
const MISSION_TITLE = "MISSION FAILED"; // survival game: there is no "win" state, so the run always ends in failure
const FACT_CARD_W = 300;

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    preloadAudio(this);
  }

  create() {
    const { width, height } = this.scale;

    // a restarted scene must never inherit a half-finished fade
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(300, 7, 9, 20);

    this.reduceMotion = !!(
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    this.fx = [];
    this.chars = [];
    this.warnings = [];

    this.bg = new CosmicBackground(this);

    // --- ship + effects ---
    this.glow = this.add.circle(width / 2, height - 90, 34, 0x00e5ff, 0.14).setBlendMode(ADD).setDepth(4);
    this.flameOuter = this.add.triangle(0, 0, 0, 0, 16, 0, 8, 34, 0xff8a2b).setBlendMode(ADD).setDepth(4);
    this.flameInner = this.add.triangle(0, 0, 0, 0, 8, 0, 4, 20, 0x7df9ff).setBlendMode(ADD).setDepth(4);
    this.ship = this.add.triangle(width / 2, height - 90, 20, 0, 0, 40, 40, 40, 0x00e5ff).setDepth(5);
    this.ship.setStrokeStyle(2, 0xffffff);
    this.shipRadius = 16;
    this.trailTimer = 0;

    // --- Nebby follows the ship (no collisions) ---
    this.nebby = makeNebby(this).setDepth(4);
    this.nebby.setPosition(width / 2 - 48, height - 76);
    this.nebby.pulse = 0;

    // --- shield visual ---
    this.shieldRing = this.add.circle(0, 0, 32, 0xffffff, 0.08).setDepth(6).setVisible(false);

    // --- controls ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("A,D,SPACE,ENTER");

    // --- game state (everything here is rebuilt on every restart) ---
    this.lives = 3;
    this.invulnUntil = 0;
    this.boostUntil = 0;
    this.shieldUntil = 0;
    this.isGameOver = false;
    this.restarting = false;
    this.resultsReady = false;
    this.asteroids = [];
    this.collectibles = [];
    this.collectTimer = 0;

    // --- constellation state ---
    this.conIndex = 0;
    this.conDef = CONSTELLATIONS[this.conIndex];
    this.conGot = []; // star ids collected so far for the current figure
    this.conDone = []; // ids of constellations completed this run
    this.conDoneNames = []; // display names of constellations completed this run
    this.conStar = null; // the one falling constellation star (or null)
    this.conTimer = CON_FIRST_SPAWN;
    this.conFinished = false;

    // results-screen objects (created lazily in showResults)
    this.panel = null;
    this.panelH = PANEL_H;
    this.dim = null;
    this.planet = null;
    this.planetShade = null;
    this.planetGlow = null;
    this.driftDots = [];
    this.resultChars = [];
    this._rw = 0;
    this._rh = 0;

    this.score = 0;
    this.stardust = 0;
    this.elapsed = 0;
    this.distance = 0;
    this.nextSurviveBonus = 10;
    this.nextMilestone = 500;
    this.level = 0; // 0-based difficulty level, mirrors difficulty.level - 1
    this.collected = { stella: 0, fox: 0, luma: 0 }; // characters picked up this run

    // fresh difficulty director on every (re)start
    this.difficulty = new DifficultyDirector();
    this.shownLevel = 1;

    this.next = {};
    for (const k of Object.keys(SCHEDULE)) this.next[k] = SCHEDULE[k][0];

    // --- HUD ---
    this.livesText = this.add.text(0, 14, "♥ ♥ ♥", { fontSize: "24px", color: "#ff5c8a" }).setDepth(10);
    this.statusText = this.add
      .text(0, 48, "", { fontSize: "14px", color: "#7df9ff", fontStyle: "bold" })
      .setDepth(10);
    this.scoreText = this.add
      .text(0, 12, "0", { fontSize: "28px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(1, 0)
      .setDepth(10);
    this.infoText = this.add
      .text(0, 48, "✦ 0   0 m", { fontSize: "16px", color: "#9bb7ff" })
      .setOrigin(1, 0)
      .setDepth(10);
    this.threatText = this.add
      .text(0, 14, "THREAT LEVEL 1", {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#9fefff",
      })
      .setOrigin(0.5, 0)
      .setDepth(10)
      .setAlpha(0.7);
    this.createConstellationHud(); // must exist before layoutHud positions it
    this.layoutHud();

    // --- debug keys (removed on scene shutdown so restarts don't stack listeners) ---
    if (DEBUG_KEYS) {
      const kb = this.input.keyboard;
      const onOne = () => !this.isGameOver && this.spawnChar("stella");
      const onTwo = () => !this.isGameOver && this.startVoidlingWarning();
      const onThree = () => !this.isGameOver && this.spawnChar("fox");
      const onFour = () => !this.isGameOver && this.spawnChar("luma");
      kb.on("keydown-ONE", onOne);
      kb.on("keydown-TWO", onTwo);
      kb.on("keydown-THREE", onThree);
      kb.on("keydown-FOUR", onFour);
      this.events.once("shutdown", () => {
        kb.off("keydown-ONE", onOne);
        kb.off("keydown-TWO", onTwo);
        kb.off("keydown-THREE", onThree);
        kb.off("keydown-FOUR", onFour);
      });
    }

    // --- audio ---
    this.audio = new CosmicAudio(this);
    this.muteTapActive = false;
    this.soundBtn = this.add
      .text(0, 26, this.audio.muted ? "🔇" : "🔊", { fontSize: "22px" })
      .setOrigin(0.5)
      .setPadding(10)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    this.soundBtn.on("pointerdown", () => {
      this.muteTapActive = true; // so the tap doesn't steer the ship
      this.audio.start();
      this.soundBtn.setText(this.audio.toggleMute() ? "🔇" : "🔊");
    });
    const onUp = () => {
      this.muteTapActive = false;
    };
        this.steerOk = false;
    const onDown = (p) => {
      this.steerOk = p.y > this.hudBottom;
    };
    this.input.on("pointerdown", onDown);

    const onM = () => this.soundBtn.setText(this.audio.toggleMute() ? "🔇" : "🔊");
    const startAudio = () => this.audio.start();
    this.input.on("pointerup", onUp);
    this.input.keyboard.on("keydown-M", onM);
    this.input.keyboard.once("keydown", startAudio);
    this.input.once("pointerdown", startAudio);
    this.layoutHud();

    // stop/destroy sounds and remove listeners on restart, so nothing doubles up
    this.events.once("shutdown", () => {
      this.input.off("pointerup", onUp);
      this.input.off("pointerdown", startAudio);
      this.input.keyboard.off("keydown-M", onM);
      this.input.keyboard.off("keydown", startAudio);
      this.audio.destroy();
      this.input.off("pointerdown", onDown);
    });

    // dev only: in the browser console, set __cr.t = 0 / 25 / 50 / 75 / 100 / 125 to jump levels
    if (import.meta.env.DEV) window.__cr = this.difficulty;
  }

  // ---------- background ----------
  updateBackground(time, delta, dt) {
    this.bg.update(time, delta, dt, this.level);
    this.updateFx(dt);
  }

  // ---------- effects ----------
  addFx(obj, vx, vy, life, opts = {}) {
    this.fx.push({
      obj,
      vx,
      vy,
      life,
      max: life,
      alpha: opts.alpha ?? 1,
      shrink: !!opts.shrink,
      bell: !!opts.bell,
    });
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.obj.destroy();
        this.fx.splice(i, 1);
        continue;
      }
      f.obj.x += f.vx * dt;
      f.obj.y += f.vy * dt;
      const t = f.life / f.max;
      f.obj.setAlpha(f.bell ? f.alpha * Math.sin(Math.PI * (1 - t)) : f.alpha * t);
      if (f.shrink) f.obj.setScale(0.3 + 0.7 * t);
    }
  }

  burst(x, y, color, n = 12, depth = 6) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Phaser.Math.Between(60, 220);
      const p = this.add
        .circle(x, y, Phaser.Math.FloatBetween(2, 4), color)
        .setBlendMode(ADD)
        .setDepth(depth);
      this.addFx(p, Math.cos(ang) * sp, Math.sin(ang) * sp, Phaser.Math.FloatBetween(0.4, 0.8), {
        shrink: true,
      });
    }
  }

  updateShipFx(time, dt) {
    const r = this.ship.rotation;
    const dx = -Math.sin(r);
    const dy = Math.cos(r);
    const boost = this.elapsed < this.boostUntil ? 1.5 : 1;

    const outerLen = 34 * (0.8 + Math.random() * 0.45) * boost;
    const outerOff = 18 + outerLen / 2;
    this.flameOuter.setPosition(this.ship.x + dx * outerOff, this.ship.y + dy * outerOff);
    this.flameOuter.setRotation(r);
    this.flameOuter.setScale(1, outerLen / 34);

    const innerLen = 20 * (0.8 + Math.random() * 0.45) * boost;
    const innerOff = 18 + innerLen / 2;
    this.flameInner.setPosition(this.ship.x + dx * innerOff, this.ship.y + dy * innerOff);
    this.flameInner.setRotation(r);
    this.flameInner.setScale(1, innerLen / 20);

    this.glow.setPosition(this.ship.x, this.ship.y);
    this.glow.setScale(1 + 0.08 * Math.sin(time / 180));

    this.trailTimer += dt;
    if (this.trailTimer >= 0.035) {
      this.trailTimer = 0;
      const t = this.add
        .circle(this.ship.x + dx * 24, this.ship.y + dy * 24, boost > 1 ? 5 : 4, 0x00e5ff)
        .setBlendMode(ADD)
        .setDepth(3);
      this.addFx(t, Phaser.Math.Between(-10, 10), 90, 0.45, { shrink: true, alpha: boost > 1 ? 0.8 : 0.5 });
    }
  }

  // ---------- helpers ----------
  getLane() {
    const { width } = this.scale;
    const laneW = Math.min(width, LANE_MAX);
    return { laneX: (width - laneW) / 2, laneW };
  }

    layoutHud() {
    const { laneX, laneW } = this.getLane();
    const compact = this.isCompact();

    // restyle only when the mode changes (re-rendering text every frame is costly)
    if (this.hudMode !== compact) {
      this.hudMode = compact;
      this.livesText.setFontSize(compact ? 20 : 24);
      this.scoreText.setFontSize(compact ? 22 : 28);
      this.infoText.setFontSize(compact ? 12 : 16);
      this.statusText.setFontSize(compact ? 11 : 14);
    }
    if (this.soundBtn && this.soundBtn.compactMode !== compact) {
      this.soundBtn.compactMode = compact;
      this.soundBtn.setFontSize(compact ? 18 : 22);
    }

    const m = compact ? 10 : 16; // side margin
    const row1 = compact ? 6 : 12;
    const row2 = compact ? 38 : 48;
    this.livesText.setPosition(laneX + m, row1 + (compact ? 2 : 2));
    this.statusText.setPosition(laneX + m, row2);
    this.scoreText.setPosition(laneX + laneW - m, row1);
    this.infoText.setPosition(laneX + laneW - m, row2);
    if (this.soundBtn) this.soundBtn.setPosition(laneX + laneW / 2, compact ? 20 : 26);

    this.hudBottom = compact ? 58 : 74; // touches above this line never steer the ship
  }
    // ---------- responsive helpers ----------
  uiScale() {
    return Phaser.Math.Clamp(this.getLane().laneW / LANE_MAX, 0.72, 1);
  }

  isCompact() {
    return this.getLane().laneW < 420 || this.scale.height < 480;
  }

  getShipY() {
    const { height } = this.scale;
    return height - Phaser.Math.Clamp(height * 0.14, 64, 110);
  }

  addScore(n) {
    this.score += n;
    this.scoreText.setText(this.score.toLocaleString());
  }

  popText(x, y, msg, color = "#ffffff") {
    const t = this.add
      .text(x, y, msg, { fontSize: "20px", color, fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  notify(msg, color) {
    const { width, height } = this.scale;
    const t = this.add
      .text(width / 2, height * 0.22, msg, { fontSize: "24px", color, fontStyle: "bold" })
      .setOrigin(0.5)
      .setStroke("#000000", 4)
      .setDepth(11);
    this.tweens.add({
      targets: t,
      y: t.y - 30,
      alpha: 0,
      duration: 1000,
      delay: 600,
      onComplete: () => t.destroy(),
    });
  }

  // small glowing banner under the HUD; gameplay is never paused
  showThreatBanner() {
    const { laneX, laneW } = this.getLane();
    const t = this.add
      .text(laneX + laneW / 2, 84, "THREAT LEVEL INCREASED", {
        fontFamily: FONT,
        fontSize: "16px",
        color: "#ff5bc8",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setAlpha(0);
    t.setShadow(0, 0, "#ff5bc8", 12, false, true);
    this.tweens.add({
      targets: t,
      alpha: 0.85,
      duration: 250,
      hold: 900,
      yoyo: true,
      onComplete: () => t.destroy(),
    });
  }

  // highest valid value across the versioned key and the legacy key
  getBest() {
    let best = 0;
    try {
      for (const key of [BEST_KEY, LEGACY_BEST_KEY]) {
        const n = Number(localStorage.getItem(key));
        if (Number.isFinite(n) && n > best) best = Math.floor(n);
      }
    } catch (e) {
      /* storage blocked: treat as no record */
    }
    return best;
  }

  saveBest(score) {
    try {
      localStorage.setItem(BEST_KEY, String(Math.floor(score)));
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- spawning ----------
  // position and velocity come from DifficultyDirector
  spawnAsteroid(x, y, vx = 0, vy = BASE_FALL) {
    const r = Math.round(Phaser.Math.Between(14, 34) * this.uiScale());
    const a = this.add.circle(x, y, r, 0x6b5b4b).setDepth(3);
    a.setStrokeStyle(3, 0xb59b86);
    a.hitR = r;
    a.vx = vx;
    a.vy = vy;
    this.asteroids.push(a);
  }

  spawnCollectible() {
    const { laneX, laneW } = this.getLane();
    const x = Phaser.Math.Between(laneX + 30, laneX + laneW - 30);
    const rare = Math.random() < 0.15;
    const c = rare
      ? this.add.star(x, -20, 4, 6, 15, 0xff4df0)
      : this.add.star(x, -20, 5, 4, 10, 0xffd54a);
    c.setDepth(3).setBlendMode(ADD);
    c.hitR = rare ? 15 : 10;
    c.value = rare ? 100 : 10;
    c.rare = rare;
    c.vy = Phaser.Math.Between(120, 200) + this.level * 10;
    this.collectibles.push(c);
  }

  scheduleNext(kind) {
    const [, min, max] = SCHEDULE[kind];
    let gap = Phaser.Math.FloatBetween(min, max);
    if (kind === "voidling") gap *= Math.max(0.55, 1 - this.level * 0.06); // more frequent later
    this.next[kind] = this.elapsed + gap;
  }

  spawnChar(kind, xOverride) {
    const { laneX, laneW } = this.getLane();
    const cfg = CHAR_CONFIG[kind];
    const x = xOverride ?? Phaser.Math.Between(laneX + 50, laneX + laneW - 50);
    const c = cfg.make(this).setPosition(x, -40).setDepth(3);
    c.kind = kind;
    c.baseX = x;
    c.ph = Math.random() * 6.28;
    c.vy = cfg.vy + (kind === "voidling" ? this.level * 10 : 0);
    c.amp = cfg.amp;
    c.freq = cfg.freq;
    c.hitR = cfg.hitR;
    c.lastTrail = 0;
    this.chars.push(c);
  }

  startVoidlingWarning() {
    const { laneX, laneW } = this.getLane();
    const { height } = this.scale;
    const x = Phaser.Math.Between(laneX + 80, laneX + laneW - 80);
    const lane = this.add.rectangle(x, height / 2, 150, height, 0xb44cff, 0.1).setDepth(2);
    const mark = this.add
      .text(x, 70, "!", { fontSize: "44px", color: "#ff4d9a", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(8);
    const label = this.add
      .text(x, 108, "VOIDLING", { fontSize: "14px", color: "#d9a8ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(8);
    this.warnings.push({ x, left: WARNING_SECONDS, lane, mark, label });
  }

  clearWarnings() {
    for (const w of this.warnings) {
      w.lane.destroy();
      w.mark.destroy();
      w.label.destroy();
    }
    this.warnings = [];
  }

  updateWarnings(dt) {
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.left -= dt;
      const pulse = Math.sin(this.elapsed * 18);
      w.mark.setAlpha(0.6 + 0.4 * pulse);
      w.lane.setAlpha(0.1 + 0.05 * pulse);
      if (w.left <= 0) {
        w.lane.destroy();
        w.mark.destroy();
        w.label.destroy();
        this.warnings.splice(i, 1);
        this.spawnChar("voidling", w.x);
      }
    }
  }

  updateSpawns() {
    for (const kind of Object.keys(SCHEDULE)) {
      if (this.elapsed >= this.next[kind]) {
        if (kind === "voidling") this.startVoidlingWarning();
        else this.spawnChar(kind);
        this.scheduleNext(kind);
      }
    }
  }

  // ---------- constellation: HUD preview ----------
  createConstellationHud() {
    this.conHud = this.add.container(0, 0).setDepth(10).setAlpha(0.85);
    this.conGfx = this.add.graphics();
    this.conLabel = this.add.text(0, 0, "", { fontFamily: FONT, fontSize: "10px", color: "#9fefff" });
    this.conNext = this.add.circle(0, 0, 6).setStrokeStyle(1.5, this.conDef.visuals.next, 1).setBlendMode(ADD);
    this.conHud.add([this.conGfx, this.conLabel, this.conNext]);
    this.redrawConstellationHud();
  }

  // redrawn only when progress changes (never per frame)
  redrawConstellationHud() {
    const def = this.conDef;
    const vis = def.visuals;
    const got = this.conGot;
    const g = this.conGfx;
    const P = (s) => ({ x: 2 + s.x * CON_W, y: CON_TOP + s.y * CON_H });
    g.clear();

    // faint outline of the whole figure
    g.lineStyle(1, vis.guideLine, 0.35);
    for (const [a, b] of def.links) {
      const pa = P(starById(def, a));
      const pb = P(starById(def, b));
      g.lineBetween(pa.x, pa.y, pb.x, pb.y);
    }
    // collected connections: soft halo + bright core
    const lit = completedLinks(def, got);
    g.lineStyle(3.5, vis.litGlow, 0.22);
    for (const [a, b] of lit) {
      const pa = P(starById(def, a));
      const pb = P(starById(def, b));
      g.lineBetween(pa.x, pa.y, pb.x, pb.y);
    }
    g.lineStyle(1.2, vis.litLine, 0.95);
    for (const [a, b] of lit) {
      const pa = P(starById(def, a));
      const pb = P(starById(def, b));
      g.lineBetween(pa.x, pa.y, pb.x, pb.y);
    }
    // stars
    for (const s of def.stars) {
      const p = P(s);
      if (got.includes(s.id)) {
        g.fillStyle(vis.starLit, 0.25).fillCircle(p.x, p.y, 5);
        g.fillStyle(vis.starLit, 1).fillCircle(p.x, p.y, 2.4);
      } else {
        g.fillStyle(vis.starDim, 0.6).fillCircle(p.x, p.y, 1.6);
      }
    }
    // label + next-star marker
    const done = isComplete(def, got);
    this.conLabel.setText(
      done ? `${def.name.toUpperCase()} COMPLETE` : `${def.name.toUpperCase()} ${got.length}/${def.stars.length}`
    );
    this.conLabel.setColor(done ? css(vis.starLit) : "#9fefff");
    const nid = nextStarId(def, got);
    const ns = nid ? starById(def, nid) : null;
    this.conNext.setVisible(!!ns);
    if (ns) {
      const p = P(ns);
      this.conNext.setPosition(p.x, p.y);
    }
  }

  // ---------- constellation: falling star ----------
  removeConStar() {
    if (this.conStar) {
      this.conStar.destroy();
      this.conStar = null;
    }
  }

  spawnConstellationStar() {
    if (this.conStar || this.conFinished || this.isGameOver) return;
    const def = this.conDef;
    const id = nextStarId(def, this.conGot);
    if (!id) return;
    const { laneX, laneW } = this.getLane();
    const vy = BASE_FALL * 0.5 + this.level * 8; // slower than hazards: easy to line up
    const fallTime = (this.ship.y + 34) / vy;
    const reach = BASE_SPEED * fallTime * 0.5;

    let x = null;
    for (let i = 0; i < 8 && x === null; i++) {
      const cx = Phaser.Math.Between(laneX + 40, laneX + laneW - 40);
      const blocked = this.asteroids.some((a) => a.y < 220 && Math.abs(a.x - cx) < a.hitR + 44);
      if (!blocked && Math.abs(cx - this.ship.x) <= reach) x = cx;
    }
    if (x === null) {
      this.conTimer = 0.5; // lane is busy right now: try again shortly
      return;
    }

    const vis = def.visuals;
    const parts = [];
    if (this.textures.exists("bg_glow")) {
      parts.push(this.add.image(0, 0, "bg_glow").setTint(vis.starLit).setScale(1.1).setBlendMode(ADD).setAlpha(0.7));
    }
    const ring = this.add.circle(0, 0, 24).setStrokeStyle(2, vis.next, 0.9);
    const star = this.add.star(0, 0, 5, 7, 17, vis.starLit).setStrokeStyle(2, 0xffffff);
    const label = this.add
      .text(0, 32, starById(def, id).name, { fontFamily: FONT, fontSize: "10px", color: css(vis.starLit) })
      .setOrigin(0.5);
    parts.push(ring, star, label);

    const c = this.add.container(x, -34, parts).setDepth(3);
    c.starId = id;
    c.hitR = 20;
    c.vy = vy;
    c.ring = ring;
    c.star = star;
    c.collected = false;
    this.conStar = c;
  }

  updateConstellation(time, dt) {
    const { height } = this.scale;
    if (this.conNext.visible) {
      const p = Math.sin(time / 220);
      this.conNext.setAlpha(0.6 + 0.4 * p).setScale(1 + 0.15 * p);
    }
    const c = this.conStar;
    if (!c) {
      if (!this.conFinished) {
        this.conTimer -= dt;
        if (this.conTimer <= 0) this.spawnConstellationStar();
      }
      return;
    }
    c.y += c.vy * dt;
    c.star.rotation += dt * 1.2;
    c.ring.setScale(1 + 0.12 * Math.sin(time / 200));
    if (c.y > height + 40) {
      this.removeConStar(); // missed: the same star is sent again shortly
      this.conTimer = CON_RETRY;
      return;
    }
    const dist = Phaser.Math.Distance.Between(c.x, c.y, this.ship.x, this.ship.y);
    if (dist < c.hitR + this.shipRadius + 6) this.collectConstellationStar(c);
  }

  collectConstellationStar(c) {
    if (c.collected || this.isGameOver) return;
    const def = this.conDef;
    // Only the next required star is ever spawned, so this should always pass. If it ever
    // does not, the star is simply ignored: no penalty and progress is untouched.
    if (!isNextStar(def, this.conGot, c.starId)) return;
    c.collected = true; // duplicate-event guard

    const { x, y } = c;
    const star = starById(def, c.starId);
    this.conGot.push(c.starId);
    this.removeConStar();
    this.conTimer = Phaser.Math.FloatBetween(CON_RESPAWN[0], CON_RESPAWN[1]);

    this.addScore(def.reward.perStar);
    const { laneX, laneW } = this.getLane();
    this.popText(
      Phaser.Math.Clamp(x, laneX + 90, laneX + laneW - 90),
      y,
      `${star.name.toUpperCase()} +${def.reward.perStar}`,
      css(def.visuals.starLit)
    );
    this.burst(x, y, def.visuals.starLit, 16);
    this.burst(x, y, def.visuals.next, 8);
    this.nebby.pulse = 0.4;

    this.redrawConstellationHud();
    if (!this.reduceMotion) {
      this.tweens.add({ targets: this.conHud, scale: 1.1, duration: 120, yoyo: true });
    }
    if (isComplete(def, this.conGot)) this.completeConstellation();
  }

  completeConstellation() {
    const def = this.conDef;
    if (this.conDone.includes(def.id)) return; // reward only once per run
    this.conDone.push(def.id);
    this.conDoneNames.push(def.name);

    this.addScore(def.reward.completion);
    const { width, height } = this.scale;
    this.notify(`${def.name.toUpperCase()} COMPLETE`, css(def.visuals.complete));
    this.popText(width / 2, height * 0.22 + 36, `+${def.reward.completion.toLocaleString()}`, css(def.visuals.starLit));

    // short celebration around the preview; gameplay keeps running
    const cx = this.conHud.x + CON_W / 2;
    const cy = this.conHud.y + CON_TOP + CON_H / 2;
    const n = this.reduceMotion ? 6 : 14;
    this.burst(cx, cy, def.visuals.starLit, n, 11);
    this.burst(cx, cy, def.visuals.complete, n, 11);
    this.burst(cx, cy, def.visuals.next, n, 11);

    const nextIdx = this.conIndex + 1;
    if (nextIdx < CONSTELLATIONS.length) {
      this.conIndex = nextIdx;
      this.conDef = CONSTELLATIONS[nextIdx];
      this.conGot = [];
      this.conTimer = 5;
      this.time.delayedCall(2500, () => {
        if (!this.isGameOver) this.redrawConstellationHud();
      });
    } else {
      this.conFinished = true; // nothing left to collect: HUD stays fully lit
    }
  }

  // ---------- events ----------
  takeHit(x, y) {
    // shield absorbs exactly one hit
    if (this.elapsed < this.shieldUntil) {
      this.shieldUntil = 0;
      this.invulnUntil = this.elapsed + 0.6;
      this.audio.sfx("impact", { volume: 0.3, rate: 1.6 });
      for (const col of RAINBOW) this.burst(this.ship.x, this.ship.y, col, 3);
      this.popText(this.ship.x, this.ship.y - 52, "Shield blocked!", "#ffffff");
      return;
    }

    this.lives -= 1;
    this.livesText.setText(Array(Math.max(this.lives, 0)).fill("♥").join(" "));
    this.cameras.main.shake(150, 0.012);
    if (this.lives > 0) this.audio.sfx("impact");

    if (this.lives <= 0) {
      this.endGame();
      return;
    }

    this.invulnUntil = this.elapsed + 1.2;
    this.tweens.add({
      targets: this.ship,
      alpha: 0.2,
      duration: 100,
      yoyo: true,
      repeat: 5,
      onComplete: () => this.ship.setAlpha(1),
    });
  }

  collectChar(c) {
    const { x, y, kind } = c;
    this.nebby.pulse = 0.4;
    if (this.collected[kind] !== undefined) this.collected[kind] += 1;
    if (kind === "stella") {
      this.addScore(STELLA_POINTS);
      this.notify(`★ Stella  +${STELLA_POINTS}`, "#ffd54a");
      this.burst(x, y, 0xffd54a, 22);
      this.burst(x, y, 0xfff3a0, 10);
    } else if (kind === "fox") {
      this.boostUntil = this.elapsed + BOOST_SECONDS;
      this.notify("Comet Fox!  SPEED BOOST", "#7df9ff");
      this.burst(x, y, 0x7df9ff, 20);
    } else if (kind === "luma") {
      this.shieldUntil = this.elapsed + SHIELD_SECONDS;
      this.notify("Luma!  SHIELD READY", "#ffffff");
      for (const col of RAINBOW) this.burst(x, y, col, 4);
    }
  }

  // ---------- game over ----------
  endGame() {
    if (this.isGameOver) return; // the sequence must run exactly once
    this.isGameOver = true; // update() now returns early: no spawns, no collisions, no damage
    this.audio.sfx("explosion", { gap: 0 });
    this.audio.onGameOver();

    this.clearWarnings();

    this.burst(this.ship.x, this.ship.y, 0x00e5ff, 24);
    this.ship.setVisible(false);
    this.glow.setVisible(false);
    this.flameOuter.setVisible(false);
    this.flameInner.setVisible(false);
    this.nebby.setVisible(false);
    this.shieldRing.setVisible(false);
    this.statusText.setText("");

    // compare against the PREVIOUS best before saving
    const prevBest = this.getBest();
    const isNewBest = this.score > prevBest;
    if (isNewBest) this.saveBest(this.score);

    const result = {
      score: this.score,
      prevBest,
      best: Math.max(prevBest, this.score),
      isNewBest,
      distance: Math.floor(this.distance),
      time: this.elapsed,
      stardust: this.stardust,
      collected: { ...this.collected },
      constellations: [...this.conDoneNames],
      fact: pickRandomFact(), // chosen exactly once per Game Over (endGame is guarded above)
    };

    // frozen world + HUD fade out while the collision particles (updateFx keeps running) finish
    const world = [...this.asteroids, ...this.collectibles, ...this.chars];
    if (this.conStar) world.push(this.conStar);
    const hud = [this.livesText, this.statusText, this.scoreText, this.infoText, this.threatText, this.conHud];
    this.tweens.add({
      targets: [...world, ...hud],
      alpha: 0,
      duration: this.reduceMotion ? 1 : 600,
      delay: this.reduceMotion ? 0 : 150,
    });

    // scene clock timers are cleared automatically when the scene shuts down
    this.time.delayedCall(this.reduceMotion ? 50 : 750, () => this.showResults(result));
  }

  showResults(r) {
    const { width, height } = this.scale;
    const rm = this.reduceMotion;
    const fadeMs = rm ? 1 : 600;
    const cyan = css(PALETTE.cyan);
    const pink = css(PALETTE.pink);
    const gold = css(PALETTE.gold);

    // --- dim layer, planet, drifting particles ---
    this.dim = this.add.rectangle(0, 0, width, height, 0x070914, 1).setOrigin(0).setDepth(20).setAlpha(0);
    this.tweens.add({ targets: this.dim, alpha: 0.82, duration: fadeMs });

    const backdrop = [];
    if (this.textures.exists("bg_glow")) {
      this.planetGlow = this.add.image(0, 0, "bg_glow").setTint(PALETTE.cyan).setBlendMode(ADD).setDepth(21);
      backdrop.push(this.planetGlow);
    }
    this.planet = this.add.circle(0, 0, 10, PALETTE.violet, 0.45).setStrokeStyle(2, PALETTE.cyan, 0.35).setDepth(21);
    this.planetShade = this.add.circle(0, 0, 10, PALETTE.pink, 0.12).setDepth(21);
    backdrop.push(this.planet, this.planetShade);
    backdrop.forEach((o) => o.setAlpha(0));
    this.tweens.add({
      targets: backdrop,
      alpha: this.planetGlow ? { getEnd: (t) => (t === this.planetGlow ? 0.3 : 1) } : 1,
      duration: fadeMs * 1.4,
    });

    const dotColors = [PALETTE.cyan, PALETTE.gold, 0xffffff, PALETTE.violet];
    for (let i = 0; i < 28; i++) {
      const d = this.add
        .circle(
          Phaser.Math.Between(0, width),
          Phaser.Math.Between(0, height),
          Phaser.Math.FloatBetween(1, 2.2),
          Phaser.Utils.Array.GetRandom(dotColors)
        )
        .setBlendMode(ADD)
        .setDepth(22)
        .setAlpha(0);
      d.vy = Phaser.Math.FloatBetween(8, 26);
      d.base = Phaser.Math.FloatBetween(0.25, 0.7);
      this.driftDots.push(d);
    }
    this.tweens.add({
      targets: this.driftDots,
      alpha: { getStart: () => 0, getEnd: (t) => t.base },
      duration: fadeMs * 1.4,
    });

    // --- panel ---
    // bgG is drawn last, once the final height (which depends on the fact text) is known.
    // `content` holds everything else: its y=0 is the top of the panel, shifted by 260 so
    // the original layout coordinates (title at -218, button at 212, ...) still apply.
    const panel = this.add.container(0, 0).setDepth(23).setAlpha(0);
    const bgG = this.add.graphics();
    const content = this.add.container(0, 0);
    panel.add([bgG, content]);

    const dividers = this.add.graphics();
    dividers.lineStyle(1, PALETTE.violet, 0.5);
    dividers.lineBetween(-140, -12, 140, -12);
    dividers.lineBetween(-140, 66, 140, 66);
    content.add(dividers);

    const txt = (x, y, s, size, color, bold = false) => {
      const t = this.add
        .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" })
        .setOrigin(0.5);
      content.add(t);
      return t;
    };

    txt(0, -218, "COSMIC RUSH", 13, cyan).setAlpha(0.85);
    txt(0, -186, MISSION_TITLE, 26, pink, true).setShadow(0, 0, pink, 14, false, true);
    txt(0, -138, "FINAL SCORE", 11, "#9bb7ff");
    const scoreTxt = txt(0, -100, "0", 48, gold, true);
    scoreTxt.setShadow(0, 0, gold, 10, false, true);

    let badge = null;
    if (r.isNewBest) {
      badge = txt(0, -58, "★ NEW PERSONAL BEST! ★", 15, gold, true);
      badge.setShadow(0, 0, gold, 12, false, true).setAlpha(0);
      if (r.prevBest > 0) txt(0, -34, `previous best ${r.prevBest.toLocaleString()}`, 10, "#7a86b8");
    } else {
      txt(0, -58, `BEST  ${r.best.toLocaleString()}`, 15, "#9bb7ff", true);
    }

    // stats row
    [
      [-115, "DISTANCE", `${r.distance.toLocaleString()} m`, "#ffffff"],
      [0, "SURVIVED", fmtTime(r.time), "#ffffff"],
      [115, "STARDUST", `${r.stardust}`, gold],
    ].forEach(([x, label, value, color]) => {
      txt(x, 14, label, 10, "#7a86b8");
      txt(x, 38, value, 18, color, true);
    });

    // characters collected this run (only those actually collected)
    txt(0, 86, "CREW COLLECTED", 10, "#7a86b8");
    const kinds = ["stella", "fox", "luma"].filter((k) => r.collected[k] > 0);
    if (kinds.length === 0) {
      txt(0, 128, "none this run", 12, "#7a86b8");
    } else {
      const spacing = 100;
      kinds.forEach((k, i) => {
        const x = (i - (kinds.length - 1) / 2) * spacing;
        const ch = CHAR_CONFIG[k].make(this).setScale(0.8).setPosition(x, 126);
        content.add(ch); // moves it from the scene display list into the panel
        this.resultChars.push(ch);
        txt(x, 160, `${CREW_NAMES[k]} ×${r.collected[k]}`, 11, "#ffffff");
      });
    }

    // constellations completed this run (only shown when there is one)
    if (r.constellations.length > 0) {
      txt(0, 176, `★ ${r.constellations.join(", ").toUpperCase()} COMPLETE`, 10, gold);
    }

    // --- COSMIC FACT card (height measured from the text, so nothing can overlap) ---
    const cardTop = 200;
    const textW = FACT_CARD_W - 32;
    const card = this.add.container(0, 0);
    content.add(card);
    const cardBg = this.add.graphics();
    card.add(cardBg);
    const cardText = (y, s, size, color, bold, wrap) => {
      const t = this.add
        .text(0, y, s, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
          align: "center",
          lineSpacing: 3,
          wordWrap: wrap ? { width: wrap } : undefined,
        })
        .setOrigin(0.5, 0);
      card.add(t);
      return t;
    };
    const factLabel = cardText(cardTop + 12, "COSMIC FACT", 10, cyan, true);
    factLabel.setShadow(0, 0, cyan, 8, false, true);
    const factTitle = cardText(cardTop + 38, r.fact.title, 12, "#ffffff", true, textW);
    const factBody = cardText(factTitle.y + factTitle.height + 8, r.fact.fact, 11, "#b9c6ff", false, textW);
    const cardH = Math.ceil(factBody.y + factBody.height + 14 - cardTop);

    cardBg.fillStyle(PALETTE.violet, 0.16);
    cardBg.fillRoundedRect(-FACT_CARD_W / 2, cardTop, FACT_CARD_W, cardH, 12);
    cardBg.lineStyle(1.5, PALETTE.cyan, 0.45);
    cardBg.strokeRoundedRect(-FACT_CARD_W / 2, cardTop, FACT_CARD_W, cardH, 12);
    cardBg.lineStyle(1, PALETTE.cyan, 0.3);
    cardBg.lineBetween(-50, cardTop + 29, 50, cardTop + 29);
    cardBg.fillStyle(PALETTE.gold, 0.8);
    cardBg.fillCircle(-FACT_CARD_W / 2 + 14, cardTop + 18, 1.6);
    cardBg.fillCircle(FACT_CARD_W / 2 - 14, cardTop + 18, 1.6);

    card.setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: fadeMs, delay: rm ? 0 : 900 });

    // PLAY AGAIN button (below the card)
    const btnY = cardTop + cardH + 38;
    const btn = this.add.container(0, btnY);
    const bg = this.add.graphics();
    const drawBtn = (hover) => {
      bg.clear();
      bg.fillStyle(PALETTE.cyan, hover ? 0.28 : 0.14);
      bg.fillRoundedRect(-105, -25, 210, 50, 12);
      bg.lineStyle(2, PALETTE.cyan, hover ? 1 : 0.7);
      bg.strokeRoundedRect(-105, -25, 210, 50, 12);
    };
    drawBtn(false);
    const label = this.add
      .text(0, 0, "PLAY AGAIN", { fontFamily: FONT, fontSize: "18px", color: "#e8fdff", fontStyle: "bold" })
      .setOrigin(0.5);
    label.setShadow(0, 0, cyan, 10, false, true);
    const hit = this.add.rectangle(0, 0, 210, 50, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    btn.add([bg, label, hit]);
    content.add(btn);
    txt(0, btnY + 36, "or press SPACE / ENTER", 10, "#7a86b8");

    hit.on("pointerover", () => {
      drawBtn(true);
      this.tweens.add({ targets: btn, scale: 1.05, duration: rm ? 1 : 120 });
    });
    hit.on("pointerout", () => {
      drawBtn(false);
      this.tweens.add({ targets: btn, scale: 1, duration: rm ? 1 : 120 });
    });
    hit.on("pointerdown", () => {
      if (this.resultsReady) this.restartGame();
    });
    if (!rm) {
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }

    // final panel height: original bottom margin (12px) below the hint text
    const panelH = Math.max(PANEL_H, btnY + 36 + 12 + 260);
    this.panelH = panelH;
    content.setPosition(0, -panelH / 2 + 260);
    bgG.fillStyle(0x0b1030, 0.78);
    bgG.fillRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 18);
    bgG.lineStyle(1.5, PALETTE.cyan, 0.4);
    bgG.strokeRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 18);

    this.panel = panel;
    this.layoutResults(true);

    // --- entrance ---
    this.tweens.add({ targets: panel, alpha: 1, duration: fadeMs, delay: rm ? 0 : 350 });

    const showFinal = () => {
      scoreTxt.setText(r.score.toLocaleString());
      if (badge) {
        badge.setAlpha(1);
        if (!rm) {
          this.tweens.add({ targets: badge, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          this.celebrate();
        }
      }
    };
    if (rm || r.score === 0) {
      showFinal();
    } else {
      this.tweens.addCounter({
        from: 0,
        to: r.score,
        duration: 1300,
        delay: 450,
        ease: "Cubic.easeOut",
        onUpdate: (tw) => scoreTxt.setText(Math.round(tw.getValue()).toLocaleString()),
        onComplete: showFinal,
      });
    }

    // input becomes live a moment after the panel appears
    this.time.delayedCall(rm ? 0 : 700, () => {
      // flush key presses made during play so they cannot trigger an instant restart
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
      Phaser.Input.Keyboard.JustDown(this.keys.ENTER);
      this.resultsReady = true;
    });
  }

  // gold/pink/cyan burst above the dim layer, around the score
  celebrate() {
    if (!this.panel) return;
    const s = this.panel.scaleX;
    const cx = this.panel.x;
    const cy = this.panel.y + (-this.panelH / 2 + 160) * s; // the score sits 160px below the panel top
    const cols = [PALETTE.gold, PALETTE.pink, PALETTE.cyan];
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Phaser.Math.Between(80, 260);
      const p = this.add
        .circle(cx, cy, Phaser.Math.FloatBetween(2, 4), Phaser.Utils.Array.GetRandom(cols))
        .setBlendMode(ADD)
        .setDepth(24);
      this.addFx(p, Math.cos(ang) * sp, Math.sin(ang) * sp, Phaser.Math.FloatBetween(0.6, 1.1), { shrink: true });
    }
  }

  // repositions the results UI; only does work when the viewport size changed
  layoutResults(force = false) {
    const { width, height } = this.scale;
    if (!force && width === this._rw && height === this._rh) return;
    this._rw = width;
    this._rh = height;

    if (this.dim) this.dim.setSize(width, height);

    // scale the whole panel (including the fact card) down so it always fits the screen
    const s = Math.min(1, (width - 16) / PANEL_W, (height - 16) / this.panelH);
    if (this.panel) this.panel.setScale(s).setPosition(width / 2, height / 2);

    const r = Math.min(width, height) * 0.3;
    const px = width * 0.82;
    const py = height * 0.88;
    if (this.planet) this.planet.setPosition(px, py).setRadius(r);
    if (this.planetShade) this.planetShade.setPosition(px - r * 0.2, py - r * 0.2).setRadius(r * 0.78);
    if (this.planetGlow) this.planetGlow.setPosition(px, py).setScale((r * 3) / 64);
  }

  updateResults(time, dt) {
    this.layoutResults();
    for (const ch of this.resultChars) ch.tick(time);
    if (this.reduceMotion) return;
    const { width, height } = this.scale;
    for (const d of this.driftDots) {
      d.y -= d.vy * dt;
      if (d.y < -6) {
        d.y = height + 6;
        d.x = Phaser.Math.Between(0, width);
      }
    }
  }

  restartGame() {
    if (this.restarting) return; // one restart, no matter how many inputs fire
    this.restarting = true;
    if (this.reduceMotion) {
      this.scene.restart();
      return;
    }
    this.cameras.main.fadeOut(280, 7, 9, 20);
    this.time.delayedCall(300, () => this.scene.restart());
  }

  updateNebby(time, dt, laneX) {
    const side = this.ship.x < laneX + 90 ? 48 : -48; // switch sides near the left edge
    const tx = this.ship.x + side;
    const ty = this.ship.y + 14 + Math.sin(time / 300) * 6;
    const k = Math.min(1, 5 * dt);
    this.nebby.x += (tx - this.nebby.x) * k;
    this.nebby.y += (ty - this.nebby.y) * k;
    this.nebby.pulse = Math.max(0, this.nebby.pulse - dt * 1.5);
    this.nebby.setScale(1 + this.nebby.pulse);
    this.nebby.tick(time);
  }

  // ---------- main loop ----------
  update(time, delta) {
    const { width, height } = this.scale;
    const dt = delta / 1000;
    const { laneX, laneW } = this.getLane();

    this.layoutHud();
    this.updateBackground(time, delta, dt);

    if (this.isGameOver) {
      if (this.panel) this.updateResults(time, dt);
      if (
        this.resultsReady &&
        !this.restarting &&
        (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER))
      ) {
        this.restartGame();
      }
      return;
    }

    // --- difficulty: owns asteroid spawning (position + speed per formation) ---
    const spawns = this.difficulty.update(delta, {
      minX: laneX,
      maxX: laneX + laneW,
      size: ASTEROID_SIZE,
      shipX: this.ship.x,
      shipY: this.ship.y,
      shipW: this.ship.displayWidth,
      shipSpeed: BASE_SPEED, // un-boosted speed: conservative for gap reachability
      baseSpeed: BASE_FALL,
      active: this.asteroids.length,
    });
    for (const s of spawns) this.spawnAsteroid(s.x, s.y, s.vx, s.vy);
    if (this.difficulty.consumeLevelUp()) this.showThreatBanner();

    const lvl = this.difficulty.level;
    if (lvl !== this.shownLevel) {
      this.shownLevel = lvl;
      this.threatText.setText(`THREAT LEVEL ${lvl}`);
    }
    this.level = lvl - 1; // drives background speed, Voidling rate, distance rate (capped at 5)

    // --- progress and scoring ---
    this.elapsed += dt;

    this.distance += (60 + this.level * 12) * dt;
    if (this.distance >= this.nextMilestone) {
      this.addScore(200);
      this.popText(width / 2, height / 3, `${this.nextMilestone} m  +200`, "#7dffb0");
      this.nextMilestone += 500;
    }
    if (this.elapsed >= this.nextSurviveBonus) {
      this.addScore(50);
      this.popText(width / 2, height / 3 + 30, "Survived +50", "#9bb7ff");
      this.nextSurviveBonus += 10;
    }
    this.infoText.setText(`✦ ${this.stardust}   ${Math.floor(this.distance)} m`);

    // --- ship movement (speed boost from Comet Fox) ---
    const boosted = this.elapsed < this.boostUntil;
    this.audio.setBoost(boosted);
    const speed = boosted ? BOOST_SPEED : BASE_SPEED;
    let dir = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) dir = -1;
    else if (this.cursors.right.isDown || this.keys.D.isDown) dir = 1;

    const pointer = this.input.activePointer;
    if (pointer.isDown && !this.muteTapActive && this.steerOk) {
      dir = Phaser.Math.Clamp((pointer.x - this.ship.x) / (boosted ? 20 : 30), -1, 1);
    }
    this.ship.x = Phaser.Math.Clamp(this.ship.x + dir * speed * dt, laneX + 24, laneX + laneW - 24);
    this.ship.rotation = dir * 0.25;
    this.ship.y = this.getShipY();
    this.updateShipFx(time, dt);
    this.updateNebby(time, dt, laneX);

    // --- shield ring + status text ---
    const shieldLeft = this.shieldUntil - this.elapsed;
    if (shieldLeft > 0) {
      const blinkOff = shieldLeft < 2 && Math.floor(time / 120) % 2 === 0;
      this.shieldRing.setVisible(!blinkOff);
      this.shieldRing.setPosition(this.ship.x, this.ship.y);
      this.shieldRing.setStrokeStyle(3, RAINBOW[Math.floor(time / 120) % RAINBOW.length]);
    } else {
      this.shieldRing.setVisible(false);
    }
    const status = [];
    if (boosted) status.push(`BOOST ${(this.boostUntil - this.elapsed).toFixed(1)}s`);
    if (shieldLeft > 0) status.push(`SHIELD ${shieldLeft.toFixed(1)}s`);
    this.statusText.setText(status.join("   "));

    // --- collectibles + character spawning ---
    this.collectTimer += delta;
    if (this.collectTimer >= 1100) {
      this.collectTimer = 0;
      this.spawnCollectible();
    }
    this.updateSpawns();
    this.updateWarnings(dt);

    // --- constellation: spawn, fall, miss/retry, collect ---
    this.updateConstellation(time, dt);

    // --- asteroids ---
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;

      if (a.y > height + a.hitR || a.x < -100 || a.x > width + 100) {
        a.destroy();
        this.asteroids.splice(i, 1);
        continue;
      }

      // checked live, so a hit earlier this frame (shield / i-frames) protects against the next
      if (this.elapsed >= this.invulnUntil) {
        const dist = Phaser.Math.Distance.Between(a.x, a.y, this.ship.x, this.ship.y);
        if (dist < a.hitR + this.shipRadius) {
          const ax = a.x;
          const ay = a.y;
          a.destroy();
          this.asteroids.splice(i, 1);
          this.burst(ax, ay, 0xb59b86, 14);
          this.takeHit(ax, ay);
          if (this.isGameOver) return;
        }
      }
    }

    // --- stardust ---
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const c = this.collectibles[i];
      c.y += c.vy * dt;
      c.rotation += dt * 2;

      if (c.y > height + 30) {
        c.destroy();
        this.collectibles.splice(i, 1);
        continue;
      }

      const dist = Phaser.Math.Distance.Between(c.x, c.y, this.ship.x, this.ship.y);
      if (dist < c.hitR + this.shipRadius + 4) {
        this.stardust += 1;
        this.addScore(c.value);
        this.popText(c.x, c.y, `+${c.value}`, c.rare ? "#ff7df5" : "#ffd54a");
        this.burst(c.x, c.y, c.rare ? 0xff4df0 : 0xffd54a, c.rare ? 18 : 10);
        c.destroy();
        this.collectibles.splice(i, 1);
      }
    }

    // --- characters ---
    for (let i = this.chars.length - 1; i >= 0; i--) {
      const c = this.chars[i];
      c.y += c.vy * dt;
      let sway = Math.sin(this.elapsed * c.freq + c.ph) * c.amp;
      if (c.kind === "voidling") sway += Math.sin(this.elapsed * 2.7 + c.ph * 2) * 20;
      c.x = Phaser.Math.Clamp(c.baseX + sway, laneX + 24, laneX + laneW - 24);
      c.tick(time);

      if (c.kind === "fox" && time - c.lastTrail > 60) {
        c.lastTrail = time;
        const p = this.add.circle(c.x + 22, c.y - 8, 3, 0x7df9ff).setBlendMode(ADD).setDepth(3);
        this.addFx(p, Phaser.Math.Between(-8, 8), 0, 0.5, { shrink: true, alpha: 0.8 });
      }

      if (c.y > height + 50) {
        c.destroy();
        this.chars.splice(i, 1);
        continue;
      }

      const dist = Phaser.Math.Distance.Between(c.x, c.y, this.ship.x, this.ship.y);
      if (dist < c.hitR + this.shipRadius) {
        if (c.kind === "voidling") {
          if (this.elapsed < this.invulnUntil) continue; // pass through during i-frames
          const vx = c.x;
          const vy = c.y;
          c.destroy();
          this.chars.splice(i, 1);
          this.burst(vx, vy, 0xb44cff, 16);
          this.takeHit(vx, vy);
          if (this.isGameOver) return;
        } else {
          this.collectChar(c);
          c.destroy();
          this.chars.splice(i, 1);
        }
      }
    }
  }
}