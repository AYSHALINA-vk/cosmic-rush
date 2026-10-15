import Phaser from "phaser";
import { makeNebby, makeStella, makeVoidling, makeCometFox, makeLuma, RAINBOW } from "./characters";
import CosmicBackground, { PALETTE } from "./background";
import DifficultyDirector from "./difficulty";
import CosmicAudio, { preloadAudio } from "./audio";
import { pickRandomFact } from "../data/astroFacts";
import { getPlayerName, submitScore, getRankedScores, renamePlayer, MAX_NAME } from "../data/leaderboard";
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

// ---------- crisp text + shared drawing helpers ----------
const BODY = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"; // readable small text
const LAVENDER = 0xb48cff;
const RES_SCORE_Y = 126; // centre of the score, measured from the top of the results panel
// Canvas text is rasterised once and then scaled. Rendering it at 2-3x keeps it sharp when the panel is scaled.
const TEXT_RES = Math.min(3, Math.ceil(((typeof window !== "undefined" && window.devicePixelRatio) || 1) * 2));

// every scene.add.text(...) after this renders at TEXT_RES (HUD, pop-ups, results, leaderboard)
function enableCrispText(scene) {
  const f = scene.add;
  if (f.__crisp) return;
  const orig = f.text.bind(f);
  f.text = (x, y, s, style) => orig(x, y, s, { resolution: TEXT_RES, ...(style || {}) });
  f.__crisp = true;
}

function fitText(t, maxW) {
  t.setScale(t.width > maxW ? maxW / t.width : 1);
  return t;
}

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function sampleStops(stops, t) {
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return lerpColor(stops[i], stops[i + 1], x - i);
}

// outline of a rounded rectangle as a list of points (clockwise, from the top edge)
function roundedPath(w, h, r) {
  const pts = [];
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let i = 0; i < n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
  };
  const arc = (cx, cy, a0) => {
    for (let i = 0; i < 6; i++) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  const hw = w / 2;
  const hh = h / 2;
  line(-hw + r, -hh, hw - r, -hh);
  arc(hw - r, -hh + r, -Math.PI / 2);
  line(hw, -hh + r, hw, hh - r);
  arc(hw - r, hh - r, 0);
  line(hw - r, hh, -hw + r, hh);
  arc(-hw + r, hh - r, Math.PI / 2);
  line(-hw, hh - r, -hw, -hh + r);
  arc(-hw + r, -hh + r, Math.PI);
  return pts;
}

// multi-colour glowing border (drawn as short coloured segments around the outline), centred on (0,0)
function gradientBorder(scene, w, h, r, stops, lw) {
  const pts = roundedPath(w, h, r);
  const g = scene.add.graphics();
  const n = pts.length;
  for (const pass of [{ width: lw * 3.4, alpha: 0.12 }, { width: lw, alpha: 0.95 }]) {
    for (let i = 0; i < n; i++) {
      g.lineStyle(pass.width, sampleStops(stops, i / n), pass.alpha);
      const p = pts[i];
      const q = pts[(i + 1) % n];
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
  }
  return { gfx: g, pts };
}

// elliptical arc (planet rings)
function ringArc(g, a, b, rot, t0, t1, color, alpha, lw) {
  g.lineStyle(lw, color, alpha);
  const steps = 18;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const x0 = a * Math.cos(t);
    const y0 = b * Math.sin(t);
    const x = x0 * Math.cos(rot) - y0 * Math.sin(rot);
    const y = x0 * Math.sin(rot) + y0 * Math.cos(rot);
    if (i > 0) g.lineBetween(px, py, x, y);
    px = x;
    py = y;
  }
}

function planetIcon(scene) {
  const c = scene.add.container(0, 0);
  const back = scene.add.graphics();
  const front = scene.add.graphics();
  ringArc(back, 25, 7, -0.45, Math.PI, Math.PI * 2, PALETTE.gold, 0.55, 2);
  const body = scene.add.circle(0, 0, 13, 0x3b2f8f).setStrokeStyle(1.5, LAVENDER, 0.9);
  const shine = scene.add.circle(-4, -4, 6, 0xffffff, 0.12);
  ringArc(front, 25, 7, -0.45, 0, Math.PI, PALETTE.gold, 0.95, 2);
  c.add([back, body, shine, front]);
  return c;
}

// small vector icons, roughly 20px square
function makeIcon(scene, kind, color) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.lineStyle(2, color, 1);
  g.fillStyle(color, 1);
  c.add(g);
  if (kind === "distance") {
    g.lineBetween(-7, 1, 0, -6);
    g.lineBetween(0, -6, 7, 1);
    g.lineBetween(-7, 9, 0, 2);
    g.lineBetween(0, 2, 7, 9);
  } else if (kind === "time") {
    g.strokeCircle(0, 0, 9);
    g.lineBetween(0, 0, 0, -5);
    g.lineBetween(0, 0, 4, 2);
    g.lineBetween(-2, -12, 2, -12);
  } else if (kind === "dust") {
    c.add(scene.add.star(0, 0, 5, 4, 9.5, color));
  } else if (kind === "trophy") {
    g.fillTriangle(-8, -9, 8, -9, 6, 2);
    g.fillTriangle(-8, -9, 6, 2, -6, 2);
    g.fillRect(-1.5, 2, 3, 6);
    g.fillRect(-6, 8, 12, 2.5);
    g.lineStyle(1.8, color, 1);
    g.strokeCircle(-9, -5, 3.5);
    g.strokeCircle(9, -5, 3.5);
  }
  return c;
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

// translucent glass panel: gradient fill, nebula glows, top sheen, divider, gradient neon border
function makeGlassTexture(scene, key, w, h, divY = LB_HEADER_DIV) {
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

    // header divider
    const div = ctx.createLinearGradient(24, 0, w - 24, 0);
    div.addColorStop(0, "rgba(25,221,245,0)");
    div.addColorStop(0.3, "rgba(25,221,245,0.7)");
    div.addColorStop(0.7, "rgba(150,90,255,0.7)");
    div.addColorStop(1, "rgba(150,90,255,0)");
    ctx.fillStyle = div;
    if (divY !== null) ctx.fillRect(24, divY, w - 48, 1.2);
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

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    preloadAudio(this);
  }

  create() {
    const { width, height } = this.scale;
    enableCrispText(this); // sharper text everywhere (see TEXT_RES)

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
    this.hudMode = null; // forces the HUD fonts to be restyled for the new text objects on restart
    this.hudBottom = 74;

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
    this.resFx = [];
    this.nebulae = [];
    this.resT = 0;
    this.shootT = 0;
    this.planetRing = null;
    this.planetMoon = null;

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
      .setOrigin(1, 0) // right-aligned, third row under the score and distance
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
    // same 18..24 radius range as before (diameter <= ASTEROID_SIZE, which the director spaces
    // its gaps for), only scaled down a little on narrow lanes
    const r = Math.round(Phaser.Math.Between(18, ASTEROID_SIZE / 2) * this.uiScale());
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

    // compares against this player's PREVIOUS best, then saves to the local leaderboard
    const { prevBest, best, isNewBest } = submitScore(getPlayerName(), this.score);

    const result = {
      score: this.score,
      prevBest,
      best,
      isNewBest,
      needed: Math.max(1, best - this.score + 1), // points required to beat the record
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

    // never let a missing fact stop the Game Over screen from appearing
    const fact =
      r.fact && r.fact.title && r.fact.fact
        ? r.fact
        : { title: "Did you know?", fact: "Sunlight takes about 8 minutes to reach Earth." };

    this.resFx = []; // per-frame animation callbacks, run from updateResults
    this.resT = 0;
    this.shootT = 1.5;

    // ---------- backdrop: deep-space dim, nebulae, ringed planet, twinkling stars ----------
    this.dim = this.add.rectangle(0, 0, width, height, 0x050818, 1).setOrigin(0).setDepth(20).setAlpha(0);
    this.tweens.add({ targets: this.dim, alpha: 0.88, duration: fadeMs });

    this.nebulae = [];
    if (this.textures.exists("bg_glow")) {
      [
        { c: 0x7b2cff, fx: 0.1, fy: 0.14, s: 1.0, a: 0.5 },
        { c: PALETTE.pink, fx: 0.92, fy: 0.45, s: 0.8, a: 0.3 },
        { c: 0x2c6bff, fx: 0.06, fy: 0.9, s: 0.8, a: 0.32 },
        { c: PALETTE.cyan, fx: 0.86, fy: 0.08, s: 0.55, a: 0.24 },
      ].forEach((d) => {
        const o = this.add.image(0, 0, "bg_glow").setTint(d.c).setBlendMode(ADD).setDepth(21).setAlpha(0);
        this.nebulae.push({ o, d });
      });
    }

    const backdrop = [];
    if (this.textures.exists("bg_glow")) {
      this.planetGlow = this.add.image(0, 0, "bg_glow").setTint(PALETTE.cyan).setBlendMode(ADD).setDepth(21);
      backdrop.push(this.planetGlow);
    }
    this.planet = this.add.circle(0, 0, 10, PALETTE.violet, 0.45).setStrokeStyle(2, PALETTE.cyan, 0.35).setDepth(21);
    this.planetShade = this.add.circle(0, 0, 10, PALETTE.pink, 0.12).setDepth(21);
    this.planetRing = this.add.ellipse(0, 0, 10, 10).setStrokeStyle(2.5, PALETTE.gold, 0.5).setRotation(-0.38).setDepth(21);
    this.planetMoon = this.add.circle(0, 0, 6, 0xdff6ff, 0.95).setDepth(21);
    backdrop.push(this.planet, this.planetShade, this.planetRing, this.planetMoon);
    backdrop.forEach((o) => o.setAlpha(0));
    this.tweens.add({
      targets: backdrop,
      alpha: { getEnd: (t) => (t === this.planetGlow ? 0.3 : t === this.planetRing ? 0.7 : 1) },
      duration: fadeMs * 1.4,
    });
    if (!rm) {
      this.resFx.push((time) => {
        if (this._pr === undefined) return;
        const a = this._pr * 1.55;
        const b = this._pr * 0.42;
        const rot = -0.38;
        const t = time / 2600;
        const x0 = a * Math.cos(t);
        const y0 = b * Math.sin(t);
        this.planetMoon.setPosition(
          this._pcx + x0 * Math.cos(rot) - y0 * Math.sin(rot),
          this._pcy + x0 * Math.sin(rot) + y0 * Math.cos(rot)
        );
      });
    }

    const dotColors = [PALETTE.cyan, PALETTE.gold, 0xffffff, PALETTE.violet, PALETTE.pink];
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const col = Phaser.Utils.Array.GetRandom(dotColors);
      const d =
        i % 7 === 0
          ? this.add.star(x, y, 4, 1.1, 4.6, col) // a few four-point sparkles
          : this.add.circle(x, y, Phaser.Math.FloatBetween(1, 2.2), col);
      d.setBlendMode(ADD).setDepth(22);
      d.vy = Phaser.Math.FloatBetween(8, 26);
      d.base = Phaser.Math.FloatBetween(0.25, 0.75);
      d.tw = Phaser.Math.Between(600, 1800);
      d.ph = Math.random() * 6.28;
      d.setAlpha(rm ? d.base : 0);
      this.driftDots.push(d);
    }

    // ---------- panel scaffolding ----------
    const panel = this.add.container(0, 0).setDepth(23).setAlpha(0);
    const bgHolder = this.add.container(0, 0); // glass body is added once the final height is known
    const content = this.add.container(0, 0); // y=0 is the top of the panel
    panel.add([bgHolder, content]);

    const mk = (parent, x, y, s, size, color, o = {}) => {
      const t = this.add
        .text(x, y, s, {
          fontFamily: o.body ? BODY : FONT,
          fontSize: `${size}px`,
          color,
          fontStyle: o.bold ? "bold" : "normal",
        })
        .setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);
      if (o.spacing && t.setLetterSpacing) t.setLetterSpacing(o.spacing);
      if (o.glow) t.setShadow(0, 0, o.glow, o.blur ?? 10, false, true);
      parent.add(t);
      return t;
    };
    const T = (x, y, s, size, color, o) => mk(content, x, y, s, size, color, o);

    const pill = (x, y, w, h, color, text, textColor, size) => {
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      for (let i = 3; i >= 1; i--) {
        g.lineStyle(i * 2.4, color, 0.07);
        g.strokeRoundedRect(-w / 2 - i, -h / 2 - i, w + i * 2, h + i * 2, h / 2 + i);
      }
      g.fillStyle(color, 0.14);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      g.lineStyle(1.4, color, 0.85);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      c.add(g);
      fitText(mk(c, 0, 0, text, size, textColor, { bold: true, glow: css(color), blur: 8, spacing: 1 }), w - 18);
      content.add(c);
      return c;
    };

    const reveal = (obj, delay) => {
      if (rm) return;
      obj.setAlpha(0);
      this.tweens.add({ targets: obj, alpha: 1, duration: 420, delay, ease: "Cubic.easeOut" });
    };

    // ---------- header ----------
    const brand = T(0, 28, "COSMIC RUSH", 12, cyan, { spacing: 4 }).setAlpha(0.9);
    const bw = brand.width / 2;
    const dec = this.add.graphics();
    dec.lineStyle(1, PALETTE.cyan, 0.5);
    dec.lineBetween(-bw - 14, 28, -bw - 56, 28);
    dec.lineBetween(bw + 14, 28, bw + 56, 28);
    dec.fillStyle(PALETTE.cyan, 0.85);
    dec.fillCircle(-bw - 8, 28, 2);
    dec.fillCircle(bw + 8, 28, 2);
    content.add(dec);
    fitText(T(0, 58, MISSION_TITLE, 24, pink, { bold: true, glow: pink, blur: 14 }), 300);
    T(0, 90, "FINAL SCORE", 10, "#9bb7ff", { spacing: 4 });

    // ---------- score: halo, orbit with two moons, golden rays on a new best ----------
    const SY = RES_SCORE_Y;
    const haloBase = r.isNewBest ? 0.4 : 0.18;
    if (this.textures.exists("bg_glow")) {
      const halo = this.add
        .image(0, SY, "bg_glow")
        .setTint(r.isNewBest ? PALETTE.gold : PALETTE.cyan)
        .setScale(300 / 64)
        .setBlendMode(ADD)
        .setAlpha(haloBase);
      content.add(halo);
      if (!rm) this.resFx.push((time) => halo.setAlpha(haloBase * (0.8 + 0.2 * Math.sin(time / 500))));
    }
    let rays = null;
    if (r.isNewBest) {
      rays = this.add.graphics().setBlendMode(ADD).setPosition(0, SY).setAlpha(0);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const L = 120;
        rays.fillStyle(PALETTE.gold, 0.1);
        rays.fillTriangle(0, 0, Math.cos(a - 0.08) * L, Math.sin(a - 0.08) * L, Math.cos(a + 0.08) * L, Math.sin(a + 0.08) * L);
      }
      content.add(rays);
      if (!rm) this.tweens.add({ targets: rays, rotation: Math.PI * 2, duration: 26000, repeat: -1 });
    }
    const orbit = this.add.ellipse(0, SY, 250, 66).setStrokeStyle(1, PALETTE.cyan, 0.3);
    const dotA = this.add.circle(125, SY, 2.8, 0xffffff, 1).setBlendMode(ADD);
    const dotB = this.add.circle(-125, SY, 2, PALETTE.gold, 1).setBlendMode(ADD);
    content.add([orbit, dotA, dotB]);
    if (!rm) {
      this.resFx.push((time) => {
        dotA.setPosition(Math.cos(time / 1400) * 125, SY + Math.sin(time / 1400) * 33);
        dotB.setPosition(Math.cos(-time / 2300 + 2) * 125, SY + Math.sin(-time / 2300 + 2) * 33);
      });
    }
    const scoreTxt = T(0, SY, "0", 46, gold, { bold: true, glow: gold, blur: 14 });
    const setScore = (n) => {
      scoreTxt.setText(n.toLocaleString());
      fitText(scoreTxt, 270);
    };

    // ---------- badge / best ----------
    let badge = null;
    if (r.isNewBest) {
      badge = pill(0, 166, 236, 24, PALETTE.gold, "★ NEW PERSONAL BEST ★", gold, 11).setAlpha(0);
      if (r.prevBest > 0) T(0, 188, `previous best ${r.prevBest.toLocaleString()}`, 10, "#7a86b8", { spacing: 1 });
    } else {
      pill(0, 166, 190, 24, LAVENDER, `YOUR BEST  ${r.best.toLocaleString()}`, "#c9d6ff", 12);
      T(0, 188, `${r.needed.toLocaleString()} MORE POINT${r.needed === 1 ? "" : "S"} TO BEAT IT`, 10, cyan, { spacing: 1 });
    }
    let y = 206;
    if (r.constellations.length > 0) {
      pill(0, y + 10, 250, 20, PALETTE.gold, `✦ ${r.constellations.join(", ").toUpperCase()} COMPLETE`, gold, 10);
      y += 28;
    }

    // ---------- stat tiles ----------
    const tile = (x, ty, kind, color, labelText, value, valueColor) => {
      const c = this.add.container(x, ty);
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.045);
      g.fillRoundedRect(-50, -26, 100, 52, 10);
      g.lineStyle(1, color, 0.4);
      g.strokeRoundedRect(-50, -26, 100, 52, 10);
      g.fillStyle(color, 0.9);
      g.fillRoundedRect(-50, -9, 2.5, 18, 1);
      c.add(g);
      c.add(makeIcon(this, kind, color).setPosition(-36, -12).setScale(0.62));
      fitText(mk(c, -26, -12, labelText, 9, "#7a86b8", { ox: 0, spacing: 1 }), 68);
      fitText(mk(c, 0, 9, value, 16, valueColor, { bold: true }), 88);
      content.add(c);
      return c;
    };
    const tilesY = y + 8 + 26;
    [
      tile(-112, tilesY, "distance", PALETTE.cyan, "DISTANCE", `${r.distance.toLocaleString()} m`, "#ffffff"),
      tile(0, tilesY, "time", LAVENDER, "SURVIVED", fmtTime(r.time), "#ffffff"),
      tile(112, tilesY, "dust", PALETTE.gold, "STARDUST", `${r.stardust}`, gold),
    ].forEach((t, i) => reveal(t, 450 + i * 90));
    y = tilesY + 26 + 10;

    // ---------- crew strip (compact when nobody was collected) ----------
    const kinds = ["stella", "fox", "luma"].filter((k) => r.collected[k] > 0);
    const crewH = kinds.length ? 82 : 34;
    const crew = this.add.container(0, y);
    const cg = this.add.graphics();
    cg.fillStyle(0xffffff, 0.035);
    cg.fillRoundedRect(-162, 0, 324, crewH, 12);
    cg.lineStyle(1, LAVENDER, 0.3);
    cg.strokeRoundedRect(-162, 0, 324, crewH, 12);
    crew.add(cg);
    if (kinds.length === 0) {
      mk(crew, 0, crewH / 2, "NO CREW COLLECTED THIS RUN", 11, "#5d6a9a", { body: true, spacing: 1 });
    } else {
      mk(crew, -150, 13, "CREW COLLECTED", 9, "#7a86b8", { ox: 0, spacing: 2 });
      kinds.forEach((k, i) => {
        const x = (i - (kinds.length - 1) / 2) * 100;
        const ch = CHAR_CONFIG[k].make(this).setScale(0.75).setPosition(x, 44);
        crew.add(ch); // moves it from the scene display list into the panel
        this.resultChars.push(ch);
        mk(crew, x, 70, `${CREW_NAMES[k]} ×${r.collected[k]}`, 11, "#ffffff");
      });
    }
    content.add(crew);
    reveal(crew, 700);
    y += crewH + 12;

    // ---------- COSMIC FACT card: glowing gradient border, planet icon, travelling light ----------
    const card = this.add.container(0, y);
    content.add(card);
    const tx = -84;
    const tw = 236;
    mk(card, tx, 17, "COSMIC FACT", 10, cyan, { ox: 0, bold: true, glow: cyan, spacing: 2 });
    const ftitle = this.add
      .text(tx, 31, fact.title, { fontFamily: FONT, fontSize: "12px", color: "#ffffff", fontStyle: "bold", wordWrap: { width: tw }, lineSpacing: 2 })
      .setOrigin(0, 0);
    const fbody = this.add
      .text(tx, ftitle.y + ftitle.height + 6, fact.fact, { fontFamily: BODY, fontSize: "12px", color: "#c9d6ff", wordWrap: { width: tw }, lineSpacing: 3 })
      .setOrigin(0, 0);
    card.add([ftitle, fbody]);
    const cardH = Math.max(86, Math.ceil(fbody.y + fbody.height + 14));

    const frame = this.add.container(0, cardH / 2);
    const fill = this.add.graphics();
    fill.fillStyle(0x1a1555, 0.55);
    fill.fillRoundedRect(-162, -cardH / 2, 324, cardH, 14);
    frame.add(fill);
    if (this.textures.exists("bg_glow")) {
      frame.add(this.add.image(-124, 0, "bg_glow").setTint(0x7b2cff).setScale(150 / 64).setBlendMode(ADD).setAlpha(0.3));
    }
    const gb = gradientBorder(this, 324, cardH, 14, [PALETTE.cyan, 0x7b2cff, PALETTE.pink, 0x7b2cff, PALETTE.cyan], 1.8);
    frame.add(gb.gfx);
    card.addAt(frame, 0);

    const planet = planetIcon(this).setPosition(-124, cardH / 2);
    const moon = this.add.circle(-124, cardH / 2, 2.4, 0xdff6ff, 0.95).setBlendMode(ADD);
    card.add([this.add.circle(-124, cardH / 2, 31).setStrokeStyle(1, PALETTE.cyan, 0.3), planet, moon]);
    const twinkles = [];
    for (let i = 0; i < 6; i++) {
      const s = this.add
        .star(Phaser.Math.Between(-154, -96), Phaser.Math.Between(10, cardH - 10), 4, 0.8, 3, 0xffffff)
        .setBlendMode(ADD)
        .setAlpha(0.35);
      s.ph = Math.random() * 6.28;
      twinkles.push(s);
      card.add(s);
    }
    const sparks = [1, 0.5, 0.25].map((a) => this.add.circle(0, 0, 2.6, 0xffffff, a).setBlendMode(ADD));
    const sparkHalo = this.add.circle(0, 0, 7, 0xffffff, 0.16).setBlendMode(ADD);
    card.add([sparkHalo, ...sparks]);
    const np = gb.pts.length;
    const placeSparks = (time) => {
      const base = Math.floor(time / 45);
      sparks.forEach((s, i) => {
        const p = gb.pts[(((base - i * 2) % np) + np) % np];
        s.setPosition(p.x, p.y + cardH / 2);
      });
      sparkHalo.setPosition(sparks[0].x, sparks[0].y);
    };
    placeSparks(0);
    if (!rm) {
      this.resFx.push((time) => {
        placeSparks(time);
        planet.y = cardH / 2 + Math.sin(time / 700) * 2;
        planet.rotation = Math.sin(time / 1500) * 0.1;
        moon.setPosition(-124 + Math.cos(time / 900) * 31, cardH / 2 + Math.sin(time / 900) * 11);
        twinkles.forEach((s) => s.setAlpha(0.2 + 0.45 * Math.abs(Math.sin(time / 600 + s.ph))));
      });
    }
    reveal(card, 900);
    y += cardH + 12;

    // ---------- buttons: neon PLAY AGAIN + LEADERBOARD ----------
    const by = y + 25;
    const PW = 200;
    const PH = 50;
    const play = this.add.container(-62, by);
    const ph = this.add.graphics();
    for (let i = 4; i >= 1; i--) {
      ph.lineStyle(i * 3, PALETTE.cyan, 0.05);
      ph.strokeRoundedRect(-PW / 2 - i, -PH / 2 - i, PW + i * 2, PH + i * 2, 13 + i);
    }
    const pbg = this.add.graphics();
    const drawPlay = (hover) => {
      pbg.clear();
      pbg.fillStyle(PALETTE.cyan, hover ? 0.3 : 0.16);
      pbg.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 13);
      pbg.fillStyle(0xffffff, hover ? 0.08 : 0.04);
      pbg.fillRoundedRect(-PW / 2 + 3, -PH / 2 + 3, PW - 6, PH * 0.4, 10);
      pbg.lineStyle(2, PALETTE.cyan, hover ? 1 : 0.8);
      pbg.strokeRoundedRect(-PW / 2, -PH / 2, PW, PH, 13);
    };
    drawPlay(false);
    const picon = this.add.graphics();
    picon.fillStyle(PALETTE.cyan, 1);
    picon.fillTriangle(-80, -8, -80, 8, -67, 0);
    const plabel = this.add
      .text(10, 0, "PLAY AGAIN", { fontFamily: FONT, fontSize: "17px", color: "#e8fdff", fontStyle: "bold" })
      .setOrigin(0.5);
    plabel.setShadow(0, 0, cyan, 10, false, true);
    fitText(plabel, 118);
    const psheen = this.add.rectangle(0, 0, 12, PH - 12, 0xffffff, 1).setAngle(18).setAlpha(0);
    const phit = this.add.rectangle(0, 0, PW, PH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    play.add([ph, pbg, picon, plabel, psheen, phit]);
    content.add(play);
    phit.on("pointerover", () => {
      drawPlay(true);
      this.tweens.add({ targets: play, scale: 1.05, duration: rm ? 1 : 120 });
    });
    phit.on("pointerout", () => {
      drawPlay(false);
      this.tweens.add({ targets: play, scale: 1, duration: rm ? 1 : 120 });
    });
    phit.on("pointerdown", () => {
      if (this.resultsReady) this.restartGame();
    });
    if (!rm) {
      this.tweens.add({ targets: ph, alpha: 0.45, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.resFx.push((time) => {
        const f = (time / 1900) % 1.7;
        if (f > 1) {
          psheen.setAlpha(0);
        } else {
          psheen.setAlpha(0.2 * Math.sin(Math.PI * f));
          psheen.x = -PW / 2 + 24 + f * (PW - 48);
        }
      });
    }

    const lb = this.add.container(106, by);
    const lbg = this.add.graphics();
    const drawLb = (hover) => {
      lbg.clear();
      lbg.fillStyle(PALETTE.violet, hover ? 0.34 : 0.18);
      lbg.fillRoundedRect(-56, -25, 112, 50, 12);
      lbg.lineStyle(1.5, PALETTE.violet, hover ? 1 : 0.7);
      lbg.strokeRoundedRect(-56, -25, 112, 50, 12);
    };
    drawLb(false);
    const lbIcon = makeIcon(this, "trophy", PALETTE.gold).setPosition(0, -9).setScale(0.8);
    const lbLabel = this.add
      .text(0, 14, "LEADERBOARD", { fontFamily: FONT, fontSize: "9px", color: "#d9c8ff", fontStyle: "bold" })
      .setOrigin(0.5);
    fitText(lbLabel, 100);
    const lbHit = this.add.rectangle(0, 0, 112, 50, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    lb.add([lbg, lbIcon, lbLabel, lbHit]);
    content.add(lb);
    lbHit.on("pointerover", () => {
      drawLb(true);
      this.tweens.add({ targets: lb, scale: 1.05, duration: rm ? 1 : 120 });
    });
    lbHit.on("pointerout", () => {
      drawLb(false);
      this.tweens.add({ targets: lb, scale: 1, duration: rm ? 1 : 120 });
    });
    lbHit.on("pointerdown", () => {
      if (this.resultsReady) this.showLeaderboard();
    });

    const hintY = by + PH / 2 + 16;
    T(0, hintY, "or press SPACE / ENTER", 11, "#7a86b8", { body: true, spacing: 1 });

    // ---------- glass body (sized to the content, so nothing is ever clipped) ----------
    const panelH = Math.ceil(hintY + 22);
    this.panelH = panelH;
    content.setPosition(0, -panelH / 2);
    const glassKey = `res_glass_${PANEL_W}x${panelH}`;
    if (makeGlassTexture(this, glassKey, PANEL_W, panelH, null)) {
      bgHolder.add(this.add.image(0, 0, glassKey).setScale(1 / LB_TEX_S));
    } else {
      const fb = this.add.graphics(); // fallback if canvas textures are unavailable
      fb.fillStyle(0x0b1030, 0.85);
      fb.fillRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 20);
      fb.lineStyle(1.5, PALETTE.cyan, 0.5);
      fb.strokeRoundedRect(-PANEL_W / 2, -panelH / 2, PANEL_W, panelH, 20);
      bgHolder.add(fb);
    }
    // tiny stars twinkling inside the glass
    const glassStars = [];
    for (let i = 0; i < 14; i++) {
      const s = this.add
        .circle(
          Phaser.Math.Between(-PANEL_W / 2 + 14, PANEL_W / 2 - 14),
          Phaser.Math.Between(-panelH / 2 + 14, panelH / 2 - 14),
          Phaser.Math.FloatBetween(0.7, 1.5),
          Phaser.Utils.Array.GetRandom([0xffffff, PALETTE.cyan, PALETTE.gold])
        )
        .setBlendMode(ADD);
      s.base = Phaser.Math.FloatBetween(0.2, 0.6);
      s.tw = Phaser.Math.Between(500, 1400);
      s.ph = Math.random() * 6.28;
      s.setAlpha(s.base);
      glassStars.push(s);
      bgHolder.add(s);
    }
    if (!rm) {
      this.resFx.push((time) => glassStars.forEach((s) => s.setAlpha(s.base * (0.5 + 0.5 * Math.sin(time / s.tw + s.ph)))));
    }

    this.panel = panel;
    this.layoutResults(true);

    // ---------- entrance + score reveal ----------
    this.tweens.add({ targets: panel, alpha: 1, duration: fadeMs, delay: rm ? 0 : 350 });

    const showFinal = () => {
      setScore(r.score);
      if (badge) {
        badge.setAlpha(1);
        if (rays) {
          if (rm) rays.setAlpha(1);
          else this.tweens.add({ targets: rays, alpha: 1, duration: 900 });
        }
        if (!rm) {
          badge.setScale(0.6);
          this.tweens.add({
            targets: badge,
            scale: 1,
            duration: 420,
            ease: "Back.easeOut",
            onComplete: () => this.tweens.add({ targets: badge, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }),
          });
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
        onUpdate: (tw) => setScore(Math.round(tw.getValue())),
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

  showLeaderboard() {
    if (this.lbPanel) return; // already open
    const rm = this.reduceMotion;
    const cyan = css(PALETTE.cyan);
    const gold = css(PALETTE.gold);
    const me = getPlayerName();

    const all = getRankedScores();
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
    const title = mk(0, topY + 36, "LEADERBOARD", 20, "#eafcff", true, 0.5, 4);
    title.setShadow(0, 0, cyan, 12, false, true);

    // rename link (top-right): lets the player set the name their scores are saved under
    const rename = mk(LB_W / 2 - 20, topY + 16, "✎ NAME", 9, cyan, true, 1, 1).setPadding(8);
    rename.setInteractive({ useHandCursor: true });
    rename.on("pointerdown", () => {
      const next = window.prompt(`Pilot name (max ${MAX_NAME} characters)`, me);
      if (next === null) return;
      if (renamePlayer(me, next)) {
        this.hideLeaderboard();
        this.showLeaderboard();
      }
    });

    // column headers
    mk(-128, topY + 84, "RANK", 9, "#7a86b8", false, 0.5, 2);
    mk(-104, topY + 84, "PILOT", 9, "#7a86b8", false, 0, 2).setX(-100);
    mk(148, topY + 84, "SCORE", 9, "#7a86b8", false, 1, 2);

    // rows
    const rowObjs = [];
    const addRow = (e, y, i) => {
      const mine = e.name === me;
      const row = this.add.container(0, y);
      inner.add(row);
      rowObjs.push(row);

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
      // long names shrink to fit so they never run into the score
      const maxNameW = mine ? 84 : 112;
      if (name.width > maxNameW) name.setScale(maxNameW / name.width);
      row.add(name);
      if (mine) {
        const px = -100 + name.width * name.scaleX + 8;
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
    // stop every tween on the overlay's objects (rows, trophy halo, buttons) before destroying them,
    // otherwise endless ones such as the trophy glow keep running after each close
    const killDeep = (o) => {
      this.tweens.killTweensOf(o);
      if (o.list) o.list.forEach(killDeep);
    };
    if (this.lbPanel) killDeep(this.lbPanel);

    if (this.lbPanel) {
      this.lbPanel.destroy();
      this.lbPanel = null;
    }
    if (this.lbDim) {
      this.tweens.killTweensOf(this.lbDim);
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
    const cy = this.panel.y + (-this.panelH / 2 + RES_SCORE_Y) * s;
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
    const ring = this.add.circle(cx, cy, 10).setStrokeStyle(3, PALETTE.gold, 1).setDepth(24);
    this.tweens.add({ targets: ring, scale: 12 * s + 2, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
  }

  // an occasional streak across the sky behind the results panel
  spawnShootingStar() {
    const { width, height } = this.scale;
    const sx = Phaser.Math.Between(Math.round(width * 0.1), Math.round(width * 0.9));
    const sy = Phaser.Math.Between(0, Math.round(height * 0.35));
    const ang = Phaser.Math.FloatBetween(0.45, 0.8);
    const len = Phaser.Math.Between(70, 120);
    const g = this.add.rectangle(sx, sy, len, 2, 0xbff6ff, 1).setRotation(ang).setBlendMode(ADD).setDepth(22).setAlpha(0.9);
    this.tweens.add({
      targets: g,
      x: sx + Math.cos(ang) * 280,
      y: sy + Math.sin(ang) * 280,
      alpha: 0,
      duration: 750,
      ease: "Quad.easeIn",
      onComplete: () => g.destroy(),
    });
  }

  // repositions the results UI; only does work when the viewport size changed
  layoutResults(force = false) {
    const { width, height } = this.scale;
    if (!force && width === this._rw && height === this._rh) return;
    this._rw = width;
    this._rh = height;

    if (this.dim) this.dim.setSize(width, height);

    // scale the whole panel down only if it would not otherwise fit the screen
    const s = Math.min(1, (width - 16) / PANEL_W, (height - 16) / this.panelH);
    if (this.panel) this.panel.setScale(s).setPosition(width / 2, height / 2);

    // leaderboard overlay (same idea: scale to fit, centered)
    if (this.lbDim) this.lbDim.setPosition(width / 2, height / 2);
    if (this.lbPanel) {
      const ls = Math.min(1, (width - 16) / LB_W, (height - 16) / this.lbH);
      this.lbPanel.setScale(ls).setPosition(width / 2, height / 2);
    }

    for (const n of this.nebulae || []) {
      const d = Math.max(width, height) * n.d.s;
      n.o.setPosition(width * n.d.fx, height * n.d.fy).setScale(d / 64);
    }

    const r = Math.min(width, height) * 0.3;
    const px = width * 0.82;
    const py = height * 0.88;
    this._pcx = px;
    this._pcy = py;
    this._pr = r;
    if (this.planet) this.planet.setPosition(px, py).setRadius(r);
    if (this.planetShade) this.planetShade.setPosition(px - r * 0.2, py - r * 0.2).setRadius(r * 0.78);
    if (this.planetGlow) this.planetGlow.setPosition(px, py).setScale((r * 3) / 64);
    if (this.planetRing) this.planetRing.setPosition(px, py).setSize(r * 3.1, r * 0.84);
    if (this.planetMoon) this.planetMoon.setPosition(px + r * 1.45, py - r * 0.4); // moved along its orbit by resFx
  }

  updateResults(time, dt) {
    this.layoutResults();
    for (const ch of this.resultChars) ch.tick(time);
    const rm = this.reduceMotion;
    this.resT = (this.resT || 0) + dt;
    const fade = rm ? 1 : Math.min(1, this.resT / 1.4);

    // nebula glows fade in, then slowly breathe
    (this.nebulae || []).forEach((n, i) => {
      n.o.setAlpha(n.d.a * fade * (rm ? 1 : 0.85 + 0.15 * Math.sin(time / (2600 + i * 700))));
    });
    if (rm) return;
    const { width, height } = this.scale;

    for (const f of this.resFx) f(time, dt);

    this.shootT -= dt;
    if (this.shootT <= 0) {
      this.shootT = Phaser.Math.FloatBetween(3.5, 7);
      this.spawnShootingStar();
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
      d.setAlpha(d.base * (0.65 + 0.35 * Math.sin(time / d.tw + d.ph)) * fade);
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