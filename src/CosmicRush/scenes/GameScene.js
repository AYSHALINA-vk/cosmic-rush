import Phaser from "phaser";
import { makeNebby, makeStella, makeVoidling, makeCometFox, makeLuma, RAINBOW } from "./characters";
import CosmicBackground, { PALETTE } from "./background";
import DifficultyDirector from "./difficulty";
import CosmicAudio, { preloadAudio } from "./audio";
import { pickRandomFact } from "../data/astroFacts";
import { getPlayerName, getRankedScores, submitScore } from "../data/leaderboard";
import {
  MODES,
  getMode,
  setMode,
  getRank,
  recordRun,
  submitSupernovaScore,
  getSupernovaRanked,
} from "../data/progress";

import ProgressPanel from "./progressPanel";
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
// Supernova mode: a harder run with its own high scores
const SUPERNOVA = { lives: 2, clock: 1.35, startT: 25, fall: 1.2 };

// asteroid tuning (difficulty.js multiplies BASE_FALL per level)
const BASE_FALL = 220; // level-1 asteroid fall speed (px/s)
const ASTEROID_SIZE = 48; // diameter used for formation spacing

// constellation tuning
const CON_FIRST_SPAWN = 9; // seconds before the first constellation star falls
const CON_RESPAWN = [6, 9]; // seconds between a collected star and the next target
const CON_RETRY = 2.5; // seconds before a missed star is sent again
const CON_W = 56; // preview drawing area
const CON_H = 62;
const CON_HUD_Y = 72; // top of the constellation preview (regular layout)
const CON_HUD_Y_COMPACT = 60; // top of the constellation preview (compact layout)
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

// leaderboard overlay
const LB_W = 360;
const LB_ROW_H = 34;
const LB_MAX_ROWS = 8;
const LB_TEX_S = 2; // glass texture is drawn at 2x for crisp edges
const LB_TEX_PAD = 24; // room around the panel for the outer glow
const LB_HEADER_DIV = 64; // y of the gradient divider, measured from the panel top

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------- constellation order per run ----------
// All constellations (Orion included) are shuffled for every run. The figure that opened the
// previous run never opens the next one, so consecutive runs always start differently.
let lastFirstConId = null;

function shuffledConstellations() {
  const q = [...CONSTELLATIONS];
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  if (q.length > 1 && q[0].id === lastFirstConId) {
    const k = 1 + Math.floor(Math.random() * (q.length - 1));
    [q[0], q[k]] = [q[k], q[0]];
  }
  lastFirstConId = q[0].id;
  return q;
}

// ---------- leaderboard glass texture (drawn once on an offscreen canvas) ----------
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// translucent glass panel: gradient fill, nebula glows, top sheen, optional divider, gradient neon border
function makeGlassTexture(scene, key, w, h, withDivider = true) {
  if (scene.textures.exists(key)) return true;
  try {
    const S = LB_TEX_S;
    const P = LB_TEX_PAD;
    const R = 22;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((w + P * 2) * S);
    canvas.height = Math.ceil((h + P * 2) * S);
    const ctx = canvas.getContext("2d");
    ctx.scale(S, S);
    ctx.translate(P, P);

    // soft outer glow
    ctx.save();
    roundRectPath(ctx, 0, 0, w, h, R);
    ctx.shadowColor = "rgba(130,90,255,0.6)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(8,10,30,0.7)";
    ctx.fill();
    ctx.restore();

    // glass body
    const body = ctx.createLinearGradient(0, 0, w, h);
    body.addColorStop(0, "rgba(22,32,84,0.80)");
    body.addColorStop(0.55, "rgba(12,14,46,0.84)");
    body.addColorStop(1, "rgba(30,14,66,0.82)");
    roundRectPath(ctx, 0, 0, w, h, R);
    ctx.fillStyle = body;
    ctx.fill();

    // everything below is clipped to the panel shape
    ctx.save();
    roundRectPath(ctx, 0, 0, w, h, R);
    ctx.clip();

    const glow = (cx, cy, r, c) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    glow(w * 0.88, h * 0.06, w * 0.75, "rgba(150,90,255,0.32)"); // violet nebula, top right
    glow(w * 0.08, h * 0.96, w * 0.75, "rgba(25,221,245,0.22)"); // cyan nebula, bottom left
    glow(w * 0.5, h * 0.5, w * 0.55, "rgba(255,91,200,0.07)"); // faint pink core

    // top sheen
    const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    sheen.addColorStop(0, "rgba(255,255,255,0.11)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h * 0.35);

    // header divider (leaderboard only)
    if (withDivider) {
      const div = ctx.createLinearGradient(24, 0, w - 24, 0);
      div.addColorStop(0, "rgba(25,221,245,0)");
      div.addColorStop(0.3, "rgba(25,221,245,0.7)");
      div.addColorStop(0.7, "rgba(150,90,255,0.7)");
      div.addColorStop(1, "rgba(150,90,255,0)");
      ctx.fillStyle = div;
      ctx.fillRect(24, LB_HEADER_DIV, w - 48, 1.2);
    }
    ctx.restore();

    // gradient neon border (with glow)
    const edge = ctx.createLinearGradient(0, 0, w, h);
    edge.addColorStop(0, "rgba(25,221,245,0.95)");
    edge.addColorStop(0.5, "rgba(130,90,255,0.95)");
    edge.addColorStop(1, "rgba(255,91,200,0.9)");
    ctx.save();
    roundRectPath(ctx, 1, 1, w - 2, h - 2, R - 1);
    ctx.shadowColor = "rgba(25,221,245,0.6)";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.restore();

    // inner hairline
    roundRectPath(ctx, 3.5, 3.5, w - 7, h - 7, R - 3);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.stroke();

    scene.textures.addCanvas(key, canvas);
    return true;
  } catch (e) {
    return false;
  }
}

// point at distance d along the border of a rounded rectangle centred on (0,0), clockwise
function borderPoint(d, w, h, r) {
  const sw = w - 2 * r;
  const sh = h - 2 * r;
  const arc = (Math.PI * r) / 2;
  const total = 2 * sw + 2 * sh + 4 * arc;
  d = ((d % total) + total) % total;
  if (d < sw) return { x: -w / 2 + r + d, y: -h / 2 };
  d -= sw;
  if (d < arc) {
    const a = -Math.PI / 2 + d / r;
    return { x: w / 2 - r + Math.cos(a) * r, y: -h / 2 + r + Math.sin(a) * r };
  }
  d -= arc;
  if (d < sh) return { x: w / 2, y: -h / 2 + r + d };
  d -= sh;
  if (d < arc) {
    const a = d / r;
    return { x: w / 2 - r + Math.cos(a) * r, y: h / 2 - r + Math.sin(a) * r };
  }
  d -= arc;
  if (d < sw) return { x: w / 2 - r - d, y: h / 2 };
  d -= sw;
  if (d < arc) {
    const a = Math.PI / 2 + d / r;
    return { x: -w / 2 + r + Math.cos(a) * r, y: h / 2 - r + Math.sin(a) * r };
  }
  d -= arc;
  if (d < sh) return { x: -w / 2, y: h / 2 - r - d };
  d -= sh;
  const a = Math.PI + d / r;
  return { x: -w / 2 + r + Math.cos(a) * r, y: -h / 2 + r + Math.sin(a) * r };
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    preloadAudio(this);
  }

  create() {
    const { width, height } = this.scale;

    // dev-only: catches a constellations.js that only exports one figure
    if (import.meta.env.DEV && CONSTELLATIONS.length < 2) {
      console.warn(
        `[Cosmic Rush] CONSTELLATIONS has ${CONSTELLATIONS.length} entry. Check constellations.js exports all eight figures.`
      );
    }

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
    this.mode = getMode();
    this.supernova = this.mode === "supernova";

    // --- ship + effects ---
    this.glow = this.add.circle(width / 2, height - 90, 34, 0x00e5ff, 0.14).setBlendMode(ADD).setDepth(4);
    this.flameOuter = this.add.triangle(0, 0, 0, 0, 16, 0, 8, 34, 0xff8a2b).setBlendMode(ADD).setDepth(4);
    this.flameInner = this.add.triangle(0, 0, 0, 0, 8, 0, 4, 20, 0x7df9ff).setBlendMode(ADD).setDepth(4);
    this.ship = this.add.triangle(width / 2, height - 90, 20, 0, 0, 40, 40, 40, 0x00e5ff).setDepth(5);
    this.ship.setStrokeStyle(2, 0xffffff);
    this.shipRadius = 16;
    this.trailTimer = 0;
    this.shipColor = getRank().color; // unlocked through Galactic Rank
    this.ship.setFillStyle(this.shipColor);
    this.glow.setFillStyle(this.shipColor, 0.14);

    // --- Nebby follows the ship (no collisions) ---
    this.nebby = makeNebby(this).setDepth(4);
    this.nebby.setPosition(width / 2 - 48, height - 76);
    this.nebby.pulse = 0;

    // --- shield visual ---
    this.shieldRing = this.add.circle(0, 0, 32, 0xffffff, 0.08).setDepth(6).setVisible(false);

    // --- controls ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("A,D,SPACE,ENTER,N");
    // --- game state (everything here is rebuilt on every restart) ---
    this.lives = this.supernova ? SUPERNOVA.lives : 3;
    this.lastHitAt = 0; // for the "no hit" streak
    this.noHitBest = 0;
    this.runConStars = 0;
    this.invulnUntil = 0;
    this.boostUntil = 0;
    this.shieldUntil = 0;
    this.isGameOver = false;
    this.restarting = false;
    this.resultsReady = false;
    this.asteroids = [];
    this.collectibles = [];
    this.collectTimer = 0;
    this.hudMode = null; // forces the HUD fonts to be restyled for the new text objects on restart
    this.hudBottom = 74;

    // --- constellation state ---
    this.conIndex = 0;
    this.conQueue = shuffledConstellations(); // fresh random order every run
    this.conDef = this.conQueue[this.conIndex];
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
    this.planetRing = null;
    this.borderComet = null;
    this.modeRowRefresh = null;
    this.resultOrbit = null;
    this.driftDots = [];
    this.resultChars = [];
    this._rw = 0;
    this._rh = 0;

    // leaderboard overlay (created lazily in showLeaderboard)
    this.lbPanel = null;
    this.lbDim = null;
    this.lbH = 0;
    this.lbStars = [];

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
    // Supernova begins at Threat 2 (assumes the director's clock is the numeric property `t`)
    if (this.supernova && typeof this.difficulty.t === "number") this.difficulty.t = SUPERNOVA.startT;
    this.shownLevel = 1;

    this.next = {};
    for (const k of Object.keys(SCHEDULE)) this.next[k] = SCHEDULE[k][0];

    // --- HUD ---
    this.livesText = this.add
      .text(0, 14, Array(this.lives).fill("♥").join(" "), { fontSize: "24px", color: "#ff5c8a" })
      .setDepth(10);
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
    
     .text(0, 14, this.threatLabel(1), {
      
        fontFamily: FONT,
        fontSize: "12px",
        color: "#9fefff",
      })
      
      .setOrigin(1, 0) // right-aligned, third row under the score and distance
      .setDepth(10)
      .setAlpha(0.7);
      if (this.supernova) this.threatText.setColor("#ff5bc8");
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

    // touches that start in the HUD strip never steer the ship
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
      this.input.off("pointerdown", onDown);
      this.input.keyboard.off("keydown-M", onM);
      this.input.keyboard.off("keydown", startAudio);
      this.audio.destroy();
    });

    this.progressUi = new ProgressPanel(this, {
      glass: (key, w, h) => makeGlassTexture(this, key, w, h, false),
      glassScale: 1 / LB_TEX_S,
      onMode: () => this.modeRowRefresh && this.modeRowRefresh(),
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

  // expanding ring where the ship was destroyed
  shockwave(x, y) {
    if (this.reduceMotion) return;
    const ring = this.add.circle(x, y, 12).setStrokeStyle(3, PALETTE.cyan, 0.9).setBlendMode(ADD).setDepth(7);
    const to = Math.max(this.scale.width, this.scale.height) * 0.55;
    this.tweens.addCounter({
      from: 12,
      to,
      duration: 850,
      ease: "Cubic.easeOut",
      onUpdate: (tw) => {
        const v = tw.getValue();
        ring.setRadius(v);
        ring.setAlpha(Math.max(0, 1 - (v - 12) / (to - 12)));
      },
      onComplete: () => ring.destroy(),
    });
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
      this.threatText.setFontSize(compact ? 11 : 12);
    }
    if (this.soundBtn && this.soundBtn.compactMode !== compact) {
      this.soundBtn.compactMode = compact;
      this.soundBtn.setFontSize(compact ? 18 : 22);
    }

    const m = compact ? 10 : 16; // side margin
    const row1 = compact ? 6 : 12;
    const row2 = compact ? 38 : 48;
    const row3 = compact ? 53 : 69;
    this.livesText.setPosition(laneX + m, row1 + 2);
    this.statusText.setPosition(laneX + m, row2);
    this.scoreText.setPosition(laneX + laneW - m, row1);
    this.infoText.setPosition(laneX + laneW - m, row2);
    this.threatText.setPosition(laneX + laneW - m, row3);
    if (this.conHud) this.conHud.setPosition(laneX + m, compact ? CON_HUD_Y_COMPACT : CON_HUD_Y);
    if (this.soundBtn) this.soundBtn.setPosition(laneX + laneW / 2, compact ? 20 : 26);

    this.hudBottom = compact ? 58 : 74; // touches above this line never steer the ship
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
    const compact = this.isCompact();
    const t = this.add
      .text(laneX + laneW / 2, this.hudBottom + 10, "THREAT LEVEL INCREASED", {
        fontFamily: FONT,
        fontSize: compact ? "13px" : "16px",
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
    this.conNext.setStrokeStyle(1.5, vis.next, 1); // keep the marker in this figure's colour
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
      // wider side margin so long star names (e.g. "Akhfa al Farkadain") stay on screen
      const cx = Phaser.Math.Between(laneX + 72, laneX + laneW - 72);
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
    this.runConStars += 1;
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
    if (nextIdx < this.conQueue.length) {
      this.conIndex = nextIdx;
      this.conDef = this.conQueue[nextIdx];
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
    this.noHitBest = Math.max(this.noHitBest, this.elapsed - this.lastHitAt);
    this.lastHitAt = this.elapsed;

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
    this.shockwave(this.ship.x, this.ship.y);
    this.ship.setVisible(false);
    this.glow.setVisible(false);
    this.flameOuter.setVisible(false);
    this.flameInner.setVisible(false);
    this.nebby.setVisible(false);
    this.shieldRing.setVisible(false);
    this.statusText.setText("");

    // compares against this player's PREVIOUS best, then saves to the local leaderboard
        // saves to the matching local board: the classic leaderboard or the separate Supernova one
    const name = getPlayerName();
    const { prevBest, best, isNewBest } = this.supernova
      ? submitSupernovaScore(name, this.score)
      : submitScore(name, this.score);

    // ranks, daily missions, badges and lifetime stats (all local)
    const progress = recordRun({
      mode: this.mode,
      score: this.score,
      survival: this.elapsed,
      distance: Math.floor(this.distance),
      stardust: this.stardust,
      crew: { ...this.collected },
      constellationIds: [...this.conDone],
      conStars: this.runConStars,
      noHit: Math.floor(this.noHitBest),
      threat: this.difficulty.level,
    });

    const result = {
      mode: this.mode,
      score: this.score,
      prevBest,
      best,
      isNewBest,
      needed: Math.max(1, best - this.score + 1), // points required to beat the record
      distance: Math.floor(this.distance),
      time: this.elapsed,
      stardust: this.stardust,
      threat: this.difficulty.level,
      collected: { ...this.collected },
      constellations: [...this.conDoneNames],
      fact: pickRandomFact(), // chosen exactly once per Game Over (endGame is guarded above)
      progress,
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
    threatLabel(n) {
    return this.supernova ? `SUPERNOVA · THREAT ${n}` : `THREAT LEVEL ${n}`;
  }

  buildToasts(P) {
    const out = [];
    const gold = PALETTE.gold;
    if (P.rankedUp) {
      out.push({ msg: `RANK UP  ·  ${P.rankInfo.rank.name}`, sub: "NEW SHIP COLOUR UNLOCKED", col: P.rankInfo.rank.color });
    }
    for (const c of P.challenges) {
      if (c.justCompleted) out.push({ msg: "MISSION COMPLETE", sub: `${c.text}  ·  +${c.reward} XP`, col: 0x7dffb0 });
    }
    if (P.streakBonus > 0) out.push({ msg: `${P.streak}-DAY STREAK`, sub: `+${P.streakBonus} XP`, col: gold });
    if (P.sweepNow) out.push({ msg: "DAILY SWEEP", sub: `ALL MISSIONS DONE  ·  +${P.sweepXp} XP`, col: gold });
    for (const b of P.newBadges) out.push({ msg: `${b.icon}  BADGE UNLOCKED`, sub: b.name.toUpperCase(), col: gold });
    return out;
  }

  queueToasts(list, startMs) {
    list.slice(0, 6).forEach((t, i) => {
      this.time.delayedCall(startMs + i * 1700, () => this.resultToast(t));
    });
  }

  // reward banner above the results screen; gameplay is already over, nothing is paused
  resultToast(t) {
    if (!this.panel) return;
    const { width, height } = this.scale;
    const color = css(t.col);
    const c = this.add.container(width / 2, Math.max(54, height * 0.1)).setDepth(40).setAlpha(0);
    const msg = this.add
      .text(0, -9, t.msg, { fontFamily: FONT, fontSize: "14px", color, fontStyle: "bold" })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 11, t.sub || "", {
        fontFamily: FONT,
        fontSize: "10px",
        color: "#cfe3ff",
        align: "center",
        wordWrap: { width: Math.min(300, width - 40) },
      })
      .setOrigin(0.5);
    const w = Math.min(Math.max(msg.width, sub.width) + 40, width - 16);
    const bg = this.add.graphics();
    bg.fillStyle(0x070914, 0.94);
    bg.fillRoundedRect(-w / 2, -26, w, 52, 14);
    bg.lineStyle(1.5, t.col, 0.9);
    bg.strokeRoundedRect(-w / 2, -26, w, 52, 14);
    c.add([bg, msg, sub]);
    this.tweens.add({
      targets: c,
      alpha: 1,
      duration: 280,
      hold: 1300,
      yoyo: true,
      onComplete: () => c.destroy(),
    });
  }

  showResults(r) {
    const { width, height } = this.scale;
    const rm = this.reduceMotion;
    const fadeMs = rm ? 1 : 600;
    const cyan = css(PALETTE.cyan);
    const pink = css(PALETTE.pink);
    const gold = css(PALETTE.gold);
    const sn = r.mode === "supernova";
    const P = r.progress;

    // --- dim layer (lighter so the living background shows through), planet + ring, drifting particles ---
    this.dim = this.add.rectangle(0, 0, width, height, 0x070914, 1).setOrigin(0).setDepth(20).setAlpha(0);
    this.tweens.add({ targets: this.dim, alpha: 0.64, duration: fadeMs });

    const backdrop = [];
    if (this.textures.exists("bg_glow")) {
      this.planetGlow = this.add.image(0, 0, "bg_glow").setTint(PALETTE.cyan).setBlendMode(ADD).setDepth(21);
      backdrop.push(this.planetGlow);
    }
    this.planet = this.add.circle(0, 0, 10, PALETTE.violet, 0.45).setStrokeStyle(2, PALETTE.cyan, 0.35).setDepth(21);
    this.planetShade = this.add.circle(0, 0, 10, PALETTE.pink, 0.12).setDepth(21);
    this.planetRing = this.add.ellipse(0, 0, 10, 10).setStrokeStyle(2, PALETTE.cyan, 0.4).setRotation(-0.32).setDepth(21);
    backdrop.push(this.planet, this.planetShade, this.planetRing);
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
    // The glass image is added last (index 0), once the final height is known.
    // `content` y=0 is the top of the panel shifted by 260, so the layout coordinates below still apply.
    const panel = this.add.container(0, 0).setDepth(23).setAlpha(0);
    const content = this.add.container(0, 0);
    panel.add(content);

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

    // rise + fade in (skipped with reduced motion)
    const revealUp = (objs, delay) => {
      if (rm) return;
      for (const o of objs) {
        const y = o.y;
        o.setAlpha(0);
        o.y = y + 10;
        this.tweens.add({ targets: o, alpha: 1, y, duration: 420, delay, ease: "Cubic.easeOut" });
      }
    };

    // a thin ring around the score with a small moon orbiting it (behind the score text)
    this.resultOrbit = null;
    if (!rm) {
      const orbit = this.add.container(0, -100).setRotation(-0.1).setAlpha(0);
      const ringLine = this.add.ellipse(0, 0, 292, 62).setStrokeStyle(1.2, PALETTE.cyan, 0.4);
      const halo = this.add.circle(0, 0, 8, PALETTE.gold, 0.28).setBlendMode(ADD);
      const moon = this.add.circle(0, 0, 3, 0xfff3b0);
      orbit.add([ringLine, halo, moon]);
      content.add(orbit);
      this.tweens.add({ targets: orbit, alpha: 1, duration: 700, delay: 800 });
      this.resultOrbit = { moon, halo };
    }

    txt(0, -218, "COSMIC RUSH", 13, cyan).setAlpha(0.85);

    // title with a chromatic glitch reveal
    const ghostA = txt(0, -186, MISSION_TITLE, 26, cyan, true).setBlendMode(ADD).setAlpha(0);
    const ghostB = txt(0, -186, MISSION_TITLE, 26, css(PALETTE.violet), true).setBlendMode(ADD).setAlpha(0);
    const title = txt(0, -186, MISSION_TITLE, 26, pink, true);
    title.setShadow(0, 0, pink, 14, false, true);
    const sub = txt(
      0,
      -162,
      `${sn ? "SUPERNOVA  ·  " : ""}${r.threat ? `REACHED THREAT LEVEL ${r.threat}` : "RUN COMPLETE"}`,
      10,
      sn ? pink : cyan
    );
    if (!rm) {
      title.setAlpha(0).setScale(1.12);
      sub.setAlpha(0);
      this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 420, delay: 500, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: sub, alpha: 0.85, duration: 500, delay: 800 });
      this.tweens.add({
        targets: ghostA,
        x: { from: -10, to: -1.5 },
        alpha: { from: 0.7, to: 0.3 },
        duration: 650,
        delay: 500,
        ease: "Cubic.easeOut",
      });
      this.tweens.add({
        targets: ghostB,
        x: { from: 10, to: 1.5 },
        alpha: { from: 0.7, to: 0.3 },
        duration: 650,
        delay: 500,
        ease: "Cubic.easeOut",
      });
      // a brief glitch every few seconds (the scene clock cleans this up on restart)
      this.time.addEvent({
        delay: 3600,
        loop: true,
        callback: () => {
          if (!this.panel || this.restarting) return;
          this.tweens.add({ targets: ghostA, x: -6, alpha: 0.7, duration: 70, yoyo: true });
          this.tweens.add({ targets: ghostB, x: 6, alpha: 0.7, duration: 70, yoyo: true });
        },
      });
    }

    txt(0, -138, "FINAL SCORE", 11, "#9bb7ff");
    const scoreTxt = txt(0, -100, "0", 48, gold, true);
    scoreTxt.setShadow(0, 0, gold, 10, false, true);

    let badge = null;
    if (r.isNewBest) {
      badge = txt(0, -58, "★ NEW PERSONAL BEST! ★", 15, gold, true);
      badge.setShadow(0, 0, gold, 12, false, true).setAlpha(0);
      if (r.prevBest > 0) txt(0, -34, `previous best ${r.prevBest.toLocaleString()}`, 10, "#7a86b8");
    } else {
      txt(0, -58, `YOUR BEST  ${r.best.toLocaleString()}`, 15, "#9bb7ff", true);
      txt(0, -34, `${r.needed.toLocaleString()} MORE POINT${r.needed === 1 ? "" : "S"} TO BEAT IT`, 10, cyan);
    }

    // stats row (staggered)
    [
      [-115, "DISTANCE", `${r.distance.toLocaleString()} m`, "#ffffff"],
      [0, "SURVIVED", fmtTime(r.time), "#ffffff"],
      [115, "STARDUST", `${r.stardust}`, gold],
    ].forEach(([x, label, value, color], i) => {
      const a = txt(x, 14, label, 10, "#7a86b8");
      const b = txt(x, 38, value, 18, color, true);
      revealUp([a, b], 700 + i * 140);
    });

    // characters collected this run (they bounce in one after another)
    revealUp([txt(0, 86, "CREW COLLECTED", 10, "#7a86b8")], 900);
    const kinds = ["stella", "fox", "luma"].filter((k) => r.collected[k] > 0);
    if (kinds.length === 0) {
      revealUp([txt(0, 128, "none this run", 12, "#7a86b8")], 1000);
    } else {
      const spacing = 100;
      kinds.forEach((k, i) => {
        const x = (i - (kinds.length - 1) / 2) * spacing;
        const ch = CHAR_CONFIG[k].make(this).setPosition(x, 126);
        content.add(ch); // moves it from the scene display list into the panel
        this.resultChars.push(ch);
        if (rm) {
          ch.setScale(0.8);
        } else {
          ch.setScale(0);
          this.tweens.add({ targets: ch, scale: 0.8, duration: 450, delay: 1000 + i * 160, ease: "Back.easeOut" });
        }
        revealUp([txt(x, 160, `${CREW_NAMES[k]} ×${r.collected[k]}`, 11, "#ffffff")], 1100 + i * 160);
      });
    }

    // constellations completed this run (only shown when there is one)
    if (r.constellations.length > 0) {
      revealUp([txt(0, 176, `★ ${r.constellations.join(", ").toUpperCase()} COMPLETE`, 10, gold)], 1200);
    }

    // --- Galactic Rank progress (real local data) ---
    if (P) {
      const info = P.rankInfo;
      const rc = css(info.rank.color);
      const rankLine = txt(0, 198, `${info.rank.name}  ·  +${P.xpGained.toLocaleString()} XP`, 11, rc, true);
      rankLine.setShadow(0, 0, rc, 8, false, true);
      const barBg = this.add.graphics();
      barBg.fillStyle(0xffffff, 0.1);
      barBg.fillRoundedRect(-130, 211, 260, 7, 3.5);
      content.add(barBg);
      const barFill = this.add.graphics();
      content.add(barFill);
      const toPct = info.next ? info.pct : 1;
      const fromPct = P.rankedUp ? 0 : P.pctBefore;
      const drawBar = (pct) => {
        barFill.clear();
        const w = Math.max(0, Math.min(1, pct)) * 260;
        if (w < 1) return;
        barFill.fillStyle(info.rank.color, 1);
        barFill.fillRoundedRect(-130, 211, w, 7, 3.5);
      };
      drawBar(rm ? toPct : fromPct);
      const barLabel = info.next
        ? txt(
            0,
            229,
            P.rankedUp
              ? `★ RANK UP · ${info.rank.name} ★`
              : `${info.into.toLocaleString()} / ${info.span.toLocaleString()} XP TO ${info.next.name}`,
            9,
            P.rankedUp ? gold : "#9bb7ff",
            P.rankedUp
          )
        : txt(0, 229, "MAX RANK REACHED", 9, gold, true);
      const nb = P.newBadges[0];
      const dailyLine = txt(
        0,
        246,
        `DAILY ${P.doneCount}/${P.challenges.length}` +
          (nb ? `  ·  NEW BADGE: ${nb.name.toUpperCase()}${P.newBadges.length > 1 ? ` +${P.newBadges.length - 1}` : ""}` : ""),
        10,
        nb ? gold : cyan
      );
      revealUp([rankLine, barBg, barFill, barLabel, dailyLine], 1250);
      if (!rm) {
        this.tweens.addCounter({
          from: fromPct,
          to: toPct,
          duration: 900,
          delay: 1450,
          ease: "Cubic.easeOut",
          onUpdate: (tw) => drawBar(tw.getValue()),
        });
        if (P.rankedUp) this.time.delayedCall(1700, () => this.panel && this.celebrate());
      }
    }

    // --- COSMIC FACT card (height measured from the text, so nothing can overlap) ---
    const cardTop = 258;
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
    if (!rm) card.y = 14;
    this.tweens.add({ targets: card, alpha: 1, y: 0, duration: fadeMs, delay: rm ? 0 : 1000, ease: "Cubic.easeOut" });

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

    // LEADERBOARD + PROGRESS (two half-width buttons)
    const lbY = btnY + 52;
    const smallBtn = (x, y, w, text, color, onClick) => {
      const b = this.add.container(x, y);
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(color, hover ? 0.34 : 0.18);
        g.fillRoundedRect(-w / 2, -18, w, 36, 10);
        g.lineStyle(1.5, color, hover ? 1 : 0.7);
        g.strokeRoundedRect(-w / 2, -18, w, 36, 10);
      };
      draw(false);
      const t = this.add
        .text(0, 0, text, { fontFamily: FONT, fontSize: "11px", color: "#e3dcff", fontStyle: "bold" })
        .setOrigin(0.5);
      const h = this.add.rectangle(0, 0, w, 36, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      b.add([g, t, h]);
      content.add(b);
      h.on("pointerover", () => {
        draw(true);
        this.tweens.add({ targets: b, scale: 1.05, duration: rm ? 1 : 120 });
      });
      h.on("pointerout", () => {
        draw(false);
        this.tweens.add({ targets: b, scale: 1, duration: rm ? 1 : 120 });
      });
      h.on("pointerdown", () => {
        if (this.resultsReady) onClick();
      });
      return b;
    };
    const lbBtn = smallBtn(-78, lbY, 148, "LEADERBOARD", PALETTE.violet, () => this.showLeaderboard());
    const pgBtn = smallBtn(78, lbY, 148, "PROGRESS", PALETTE.cyan, () => this.progressUi.open("rank"));

    // next-run mode toggle (Classic <-> Supernova). Keyboard: N
    const modeBtn = this.add.container(0, lbY + 34);
    const modeText = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "11px", color: cyan, fontStyle: "bold" })
      .setOrigin(0.5)
      .setPadding(14, 8, 14, 8)
      .setInteractive({ useHandCursor: true });
    const drawMode = () => {
      const m = MODES[getMode()];
      modeText.setText(`NEXT RUN  ·  ${m.label}  ⇄`);
      modeText.setColor(css(m.color));
    };
    drawMode();
    modeText.on("pointerdown", () => {
      if (!this.resultsReady) return;
      setMode(getMode() === "classic" ? "supernova" : "classic");
      drawMode();
    });
    modeBtn.add(modeText);
    content.add(modeBtn);
    this.modeRowRefresh = drawMode;

    // buttons fade in just before input goes live, so nothing invisible can be clicked
    if (!rm) {
      [btn, lbBtn, pgBtn, modeBtn].forEach((o, i) => {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, duration: 350, delay: 800 + i * 110 });
      });
    }

    // final panel height: original bottom margin (12px) below the last row
    const panelH = Math.max(PANEL_H, lbY + 34 + 12 + 260);
    this.panelH = panelH;
    const contentY = -panelH / 2 + 260;
    content.setPosition(0, contentY);

    // glass body (index 0 = behind the content)
    const glassKey = `go_glass_${PANEL_W}x${panelH}`;
    let glass;
    let glassBase = 1; // scale of the finished glass (the texture is drawn at 2x)
    if (makeGlassTexture(this, glassKey, PANEL_W, panelH, false)) {
      glassBase = 1 / LB_TEX_S;
      glass = this.add.image(0, 0, glassKey).setScale(glassBase);
    } else {
      glass = this.add.graphics(); // fallback if canvas textures are unavailable
      glass.fillStyle(0x0b1030, 0.78);
      glass.fillRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 18);
      glass.lineStyle(1.5, PALETTE.cyan, 0.4);
      glass.strokeRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 18);
    }
    panel.addAt(glass, 0);

    // a comet of light that circles the panel border
    this.borderComet = null;
    if (!rm) {
      const dots = [];
      for (let i = 0; i < 10; i++) {
        const dot = this.add
          .circle(0, 0, 3.2 - i * 0.25, i < 3 ? PALETTE.cyan : PALETTE.violet)
          .setBlendMode(ADD)
          .setAlpha(0);
        panel.add(dot);
        dots.push(dot);
      }
      this.borderComet = { d: 0, dots, w: PANEL_W - 2, h: panelH - 2 };
    }

    this.panel = panel;
    this.layoutResults(true);

    // --- entrance: the glass unfolds and the content settles into place ---
    this.tweens.add({ targets: panel, alpha: 1, duration: fadeMs, delay: rm ? 0 : 350 });
    if (!rm) {
      glass.setScale(glassBase * 0.94);
      this.tweens.add({
        targets: glass,
        scaleX: glassBase,
        scaleY: glassBase,
        duration: 650,
        delay: 350,
        ease: "Back.easeOut",
      });
      content.y = contentY + 16;
      this.tweens.add({ targets: content, y: contentY, duration: 650, delay: 350, ease: "Cubic.easeOut" });
    }

    const showFinal = () => {
      scoreTxt.setText(r.score.toLocaleString());
      if (!rm) {
        // score pop + gold ripple
        this.tweens.add({ targets: scoreTxt, scale: 1.16, duration: 150, yoyo: true, ease: "Quad.easeOut" });
        const ripple = this.add.circle(0, -100, 24).setStrokeStyle(2, PALETTE.gold, 0.9).setBlendMode(ADD);
        content.add(ripple);
        this.tweens.addCounter({
          from: 24,
          to: 160,
          duration: 700,
          ease: "Cubic.easeOut",
          onUpdate: (tw) => {
            const v = tw.getValue();
            ripple.setRadius(v);
            ripple.setAlpha(Math.max(0, 1 - (v - 24) / 136));
          },
          onComplete: () => ripple.destroy(),
        });
      }
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

    // reward banners: rank up, missions, streak, sweep, badges (one after another)
    if (P) this.queueToasts(this.buildToasts(P), rm ? 400 : 2400);

    // input becomes live once the buttons have appeared
    this.time.delayedCall(rm ? 0 : 900, () => {
      // flush key presses made during play so they cannot trigger an instant restart
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
      Phaser.Input.Keyboard.JustDown(this.keys.ENTER);
      this.resultsReady = true;
    });
  }

  // ---------- leaderboard overlay (local scores) ----------
  // golden trophy badge for rank #1
  makeTrophyBadge() {
    const rm = this.reduceMotion;
    const c = this.add.container(0, 0);
    const halo = this.add.circle(0, 0, 17, 0xffd56a, 0.2).setBlendMode(ADD);
    const disc = this.add.circle(0, 0, 12, 0xffd56a).setStrokeStyle(1.5, 0xfff3b0);
    const g = this.add.graphics();
    g.fillStyle(0x3a2a00, 1);
    g.fillRect(-4.5, -6.5, 9, 4); // cup rim
    g.fillTriangle(-4.5, -2.5, 4.5, -2.5, 0, 3); // cup body
    g.fillRect(-0.8, 2.5, 1.6, 3); // stem
    g.fillRect(-3.5, 5.5, 7, 1.6); // base
    g.lineStyle(1.2, 0x3a2a00, 1);
    g.strokeCircle(-5.5, -3.5, 2); // handles
    g.strokeCircle(5.5, -3.5, 2);
    c.add([halo, disc, g]);
    if (!rm) {
      this.tweens.add({
        targets: halo,
        alpha: 0.42,
        scale: 1.18,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    return c;
  }

  showLeaderboard(boardMode = getMode()) {
    if (this.lbPanel) return; // already open
    const rm = this.reduceMotion;
    const cyan = css(PALETTE.cyan);
    const gold = css(PALETTE.gold);
    const me = getPlayerName();

    const all = boardMode === "supernova" ? getSupernovaRanked() : getRankedScores();
    const top = all.slice(0, LB_MAX_ROWS);
    const myIdx = all.findIndex((e) => e.name === me);
    const extra = myIdx >= LB_MAX_ROWS ? all[myIdx] : null; // my row when I'm outside the top list

    const listH = all.length === 0 ? 60 : top.length * LB_ROW_H + (extra ? 16 + LB_ROW_H : 0);
    const H = listH + 184;
    this.lbH = H;
    const topY = -H / 2;
    const rowsTop = topY + 102;

    // dim layer: the game stays visible behind it, and it swallows clicks meant for the results screen
    this.lbDim = this.add
      .rectangle(0, 0, 4000, 4000, 0x04060f, 0.62)
      .setDepth(30)
      .setInteractive();

    // outer container is positioned/scaled by layoutResults; inner one plays the entrance animation
    const panel = this.add.container(0, 0).setDepth(31);
    const inner = this.add.container(0, 0);
    panel.add(inner);
    this.lbPanel = panel;

    // glass body
    const texKey = `lb_glass_${LB_W}x${H}`;
    if (makeGlassTexture(this, texKey, LB_W, H)) {
      inner.add(this.add.image(0, 0, texKey).setScale(1 / LB_TEX_S));
    } else {
      const fb = this.add.graphics(); // fallback if canvas textures are unavailable
      fb.fillStyle(0x0b1030, 0.9);
      fb.fillRoundedRect(-LB_W / 2, topY, LB_W, H, 20);
      fb.lineStyle(2, PALETTE.cyan, 0.7);
      fb.strokeRoundedRect(-LB_W / 2, topY, LB_W, H, 20);
      inner.add(fb);
    }

    // floating stars (behind the content)
    this.lbStars = [];
    const starColors = [0xffffff, PALETTE.cyan, PALETTE.gold, PALETTE.violet];
    for (let i = 0; i < 16; i++) {
      const s = this.add
        .circle(
          Phaser.Math.Between(-LB_W / 2 + 14, LB_W / 2 - 14),
          Phaser.Math.Between(topY + 12, topY + H - 12),
          Phaser.Math.FloatBetween(0.8, 1.8),
          Phaser.Utils.Array.GetRandom(starColors)
        )
        .setBlendMode(ADD);
      s.vy = Phaser.Math.FloatBetween(3, 10);
      s.minY = topY + 12;
      s.maxY = topY + H - 12;
      s.base = Phaser.Math.FloatBetween(0.25, 0.8);
      s.tw = Phaser.Math.Between(500, 1400);
      s.ph = Math.random() * 6.28;
      s.setAlpha(s.base);
      inner.add(s);
      this.lbStars.push(s);
    }

    const mk = (x, y, s, size, color, bold, ox = 0.5, spacing = 0) => {
      const o = this.add
        .text(x, y, s, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
          letterSpacing: spacing,
        })
        .setOrigin(ox, 0.5);
      inner.add(o);
      return o;
    };

    // header
    const sn = boardMode === "supernova";
    const accent = css(sn ? PALETTE.pink : PALETTE.cyan);
    const title = mk(0, topY + 36, sn ? "SUPERNOVA BOARD" : "LEADERBOARD", sn ? 17 : 20, "#eafcff", true, 0.5, 4);
    title.setShadow(0, 0, accent, 12, false, true);

    // switch to the other mode's board
    const other = sn ? "classic" : "supernova";
    const sw = mk(LB_W / 2 - 16, topY + 14, `${MODES[other].label} ▸`, 9, css(MODES[other].color), true, 1, 1);
    sw.setPadding(8).setInteractive({ useHandCursor: true });
    sw.on("pointerdown", () => {
      this.hideLeaderboard();
      this.showLeaderboard(other);
    });
    mk(0, topY + H - 11, "SCORES ARE SAVED ON THIS DEVICE ONLY", 8, "#58628f");

    // column headers
    mk(-128, topY + 84, "RANK", 9, "#7a86b8", false, 0.5, 2);
    mk(-100, topY + 84, "PILOT", 9, "#7a86b8", false, 0, 2);
    mk(148, topY + 84, "SCORE", 9, "#7a86b8", false, 1, 2);

    // rows
    const addRow = (e, y, i) => {
      const mine = e.name === me;
      const row = this.add.container(0, y);
      inner.add(row);

      if (mine) {
        const hl = this.add.graphics();
        hl.lineStyle(5, PALETTE.cyan, 0.12); // soft glow
        hl.strokeRoundedRect(-158, -16, 316, 32, 11);
        hl.fillStyle(PALETTE.violet, 0.2);
        hl.fillRoundedRect(-158, -16, 316, 32, 11);
        hl.lineStyle(1.4, PALETTE.cyan, 0.95);
        hl.strokeRoundedRect(-158, -16, 316, 32, 11);
        row.add(hl);
      } else if (i < top.length - 1) {
        const sep = this.add.graphics(); // faint hairline between rows
        sep.lineStyle(1, 0xffffff, 0.05);
        sep.lineBetween(-146, LB_ROW_H / 2, 146, LB_ROW_H / 2);
        row.add(sep);
      }

      // rank badge
      if (e.rank === 1) {
        const tb = this.makeTrophyBadge();
        tb.setPosition(-128, 0);
        row.add(tb);
      } else if (e.rank === 2 || e.rank === 3) {
        const col = e.rank === 2 ? 0xcfd8ea : 0xd99a6c;
        const ring = this.add.circle(-128, 0, 11, col, 0.95).setStrokeStyle(1.2, 0xffffff, 0.6);
        const num = this.add
          .text(-128, 0, String(e.rank), { fontFamily: FONT, fontSize: "12px", color: "#1a1330", fontStyle: "bold" })
          .setOrigin(0.5);
        row.add([ring, num]);
      } else {
        const num = this.add
          .text(-128, 0, String(e.rank), { fontFamily: FONT, fontSize: "12px", color: "#7f8cc0", fontStyle: "bold" })
          .setOrigin(0.5);
        row.add(num);
      }

      // name (+ YOU tag) and score
      const name = this.add
        .text(-100, 0, e.name, {
          fontFamily: FONT,
          fontSize: "13px",
          color: mine ? gold : "#ffffff",
          fontStyle: mine ? "bold" : "normal",
        })
        .setOrigin(0, 0.5);
      row.add(name);
      if (mine) {
        const px = -100 + name.width + 8;
        const pill = this.add.graphics();
        pill.fillStyle(PALETTE.cyan, 0.2);
        pill.fillRoundedRect(px, -8, 30, 16, 8);
        pill.lineStyle(1, PALETTE.cyan, 0.85);
        pill.strokeRoundedRect(px, -8, 30, 16, 8);
        const you = this.add
          .text(px + 15, 0, "YOU", { fontFamily: FONT, fontSize: "8px", color: cyan, fontStyle: "bold" })
          .setOrigin(0.5);
        row.add([pill, you]);
      }
      const score = this.add
        .text(148, 0, e.score.toLocaleString(), {
          fontFamily: FONT,
          fontSize: "13px",
          color: mine || e.rank === 1 ? gold : "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      if (e.rank === 1) score.setShadow(0, 0, gold, 8, false, true);
      row.add(score);

      // staggered entrance
      if (!rm) {
        row.setAlpha(0);
        row.x = -14;
        this.tweens.add({
          targets: row,
          alpha: 1,
          x: 0,
          duration: 320,
          delay: 200 + i * 55,
          ease: "Cubic.easeOut",
        });
      }
    };

    if (all.length === 0) {
      mk(0, rowsTop + 26, "No scores yet. Play a round!", 12, "#9bb7ff", false);
    } else {
      top.forEach((e, i) => addRow(e, rowsTop + LB_ROW_H * i + LB_ROW_H / 2, i));
      if (extra) {
        const sepY = rowsTop + LB_ROW_H * top.length + 8;
        mk(0, sepY, "· · ·", 12, "#7a86b8", false);
        addRow(extra, sepY + 8 + LB_ROW_H / 2, top.length);
      }
    }

    // neon CLOSE button
    const btnY = rowsTop + listH + 38;
    const closeBtn = this.add.container(0, btnY);
    const cg = this.add.graphics();
    const drawClose = (hover) => {
      cg.clear();
      cg.lineStyle(6, PALETTE.cyan, hover ? 0.22 : 0.1); // outer glow
      cg.strokeRoundedRect(-75, -19, 150, 38, 19);
      cg.fillStyle(PALETTE.cyan, hover ? 0.24 : 0.1);
      cg.fillRoundedRect(-75, -19, 150, 38, 19);
      cg.lineStyle(1.6, PALETTE.cyan, hover ? 1 : 0.8);
      cg.strokeRoundedRect(-75, -19, 150, 38, 19);
    };
    drawClose(false);
    const closeLabel = this.add
      .text(0, 0, "CLOSE", {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#d8fbff",
        fontStyle: "bold",
        letterSpacing: 3,
      })
      .setOrigin(0.5);
    closeLabel.setShadow(0, 0, cyan, 8, false, true);
    const closeHit = this.add.rectangle(0, 0, 150, 38, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    closeBtn.add([cg, closeLabel, closeHit]);
    inner.add(closeBtn);
    closeHit.on("pointerover", () => {
      drawClose(true);
      this.tweens.add({ targets: closeBtn, scale: 1.05, duration: rm ? 1 : 120 });
    });
    closeHit.on("pointerout", () => {
      drawClose(false);
      this.tweens.add({ targets: closeBtn, scale: 1, duration: rm ? 1 : 120 });
    });
    closeHit.on("pointerdown", () => this.hideLeaderboard());

    // fade the results screen back so the modal reads clearly, and animate the modal in
    if (this.panel) {
      this.tweens.killTweensOf(this.panel);
      this.tweens.add({ targets: this.panel, alpha: 0.2, duration: rm ? 1 : 220 });
    }
    if (!rm) {
      this.lbDim.setAlpha(0);
      this.tweens.add({ targets: this.lbDim, alpha: 0.62, duration: 220 });
      inner.setAlpha(0).setScale(0.93);
      this.tweens.add({
        targets: inner,
        alpha: 1,
        scale: 1,
        duration: 320,
        ease: "Back.easeOut",
      });
    }
    this.layoutResults(true);
  }

  hideLeaderboard() {
    if (this.lbPanel) {
      this.lbPanel.destroy();
      this.lbPanel = null;
    }
    if (this.lbDim) {
      this.lbDim.destroy();
      this.lbDim = null;
    }
    this.lbStars = [];
    if (this.panel) {
      this.tweens.killTweensOf(this.panel);
      this.tweens.add({ targets: this.panel, alpha: 1, duration: this.reduceMotion ? 1 : 200 });
    }
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

    // leaderboard overlay (same idea: scale to fit, centered)
    if (this.lbDim) this.lbDim.setPosition(width / 2, height / 2);
    if (this.lbPanel) {
      const ls = Math.min(1, (width - 16) / LB_W, (height - 16) / this.lbH);
      this.lbPanel.setScale(ls).setPosition(width / 2, height / 2);
    }

    const r = Math.min(width, height) * 0.3;
    const px = width * 0.82;
    const py = height * 0.88;
    if (this.planet) this.planet.setPosition(px, py).setRadius(r);
    if (this.planetShade) this.planetShade.setPosition(px - r * 0.2, py - r * 0.2).setRadius(r * 0.78);
    if (this.planetGlow) this.planetGlow.setPosition(px, py).setScale((r * 3) / 64);
    if (this.planetRing) this.planetRing.setPosition(px, py).setSize(r * 2.9, r * 0.62);
    if (this.progressUi) this.progressUi.layout();
  }

  updateResults(time, dt) {
    this.layoutResults();
    for (const ch of this.resultChars) ch.tick(time);
    if (this.reduceMotion) return;
    const { width, height } = this.scale;

    // comet of light circling the panel border
    const bc = this.borderComet;
    if (bc) {
      bc.d += 170 * dt;
      bc.dots.forEach((dot, i) => {
        const p = borderPoint(bc.d - i * 9, bc.w, bc.h, 21);
        dot.setPosition(p.x, p.y).setAlpha(0.95 * (1 - i / bc.dots.length));
      });
    }

    // moon orbiting the score
    const o = this.resultOrbit;
    if (o) {
      const a = time / 1100;
      const x = Math.cos(a) * 146;
      const y = Math.sin(a) * 31;
      o.moon.setPosition(x, y);
      o.halo.setPosition(x, y);
    }

    // floating stars inside the leaderboard glass
    for (const s of this.lbStars) {
      s.y -= s.vy * dt;
      if (s.y < s.minY) {
        s.y = s.maxY;
        s.x = Phaser.Math.Between(-LB_W / 2 + 14, LB_W / 2 - 14);
      }
      s.setAlpha(s.base * (0.6 + 0.4 * Math.sin(time / s.tw + s.ph)));
    }

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
      if (this.resultsReady && Phaser.Input.Keyboard.JustDown(this.keys.N)) {
        setMode(getMode() === "classic" ? "supernova" : "classic");
        if (this.modeRowRefresh) this.modeRowRefresh();
      }
      if (
        this.resultsReady &&
        !this.restarting &&
        (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER))
      ) {
        // with the leaderboard open, SPACE/ENTER closes it instead of restarting behind it
        if (this.lbPanel) this.hideLeaderboard();
        else if (this.progressUi.isOpen) this.progressUi.close();
        else this.restartGame();
      }
      return;
    }

    // --- difficulty: owns asteroid spawning (position + speed per formation) ---
    const spawns = this.difficulty.update(delta * (this.supernova ? SUPERNOVA.clock : 1),{
      minX: laneX,
      maxX: laneX + laneW,
      size: ASTEROID_SIZE,
      shipX: this.ship.x,
      shipY: this.ship.y,
      shipW: this.ship.displayWidth,
      shipSpeed: BASE_SPEED, // un-boosted speed: conservative for gap reachability
      baseSpeed: BASE_FALL * (this.supernova ? SUPERNOVA.fall : 1),
      active: this.asteroids.length,
    });
    for (const s of spawns) this.spawnAsteroid(s.x, s.y, s.vx, s.vy);
    if (this.difficulty.consumeLevelUp()) this.showThreatBanner();

    const lvl = this.difficulty.level;
    if (lvl !== this.shownLevel) {
      this.shownLevel = lvl;
      this.threatText.setText(this.threatLabel(lvl));
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