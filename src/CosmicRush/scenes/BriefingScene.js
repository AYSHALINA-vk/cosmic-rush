import Phaser from "phaser";
import CosmicBackground, { PALETTE } from "./background";
import { preloadAudio } from "./audio";
import { makeGlassTexture } from "./GameScene";
import { makeNebby, makeStella, makeVoidling, makeCometFox, makeLuma } from "./characters";
import { MODES, RANKS, getMode, setMode, getXp, rankFor, getDaily, getAchievements } from "../data/progress";

const FONT = "Orbitron, sans-serif";
const ADD = Phaser.BlendModes.ADD;
const css = (n) => "#" + n.toString(16).padStart(6, "0");
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const PW = 360; // panel size
const PH = 560;
const TOP = -PH / 2;
const GLASS_SCALE = 0.5; // makeGlassTexture draws at 2x
const SEEN_KEY = "cosmicRushBriefingSeenV1";

// keep these in step with GameScene.js
const BOOST_SECONDS = 6;
const SHIELD_SECONDS = 12;
const STELLA_POINTS = 250;
const SUPERNOVA_CLOCK = 1.35;

// EDIT ME: seconds per threat level and what each level feels like
const THREAT_STEP = 25;
const THREAT_LEVELS = [
  { name: "CALM", color: 0x4dffb8, text: "Slow, spaced-out asteroids." },
  { name: "ALERT", color: 0x19ddf5, text: "Faster, more frequent asteroids." },
  { name: "DANGER", color: 0xffd56a, text: "Tight waves with gaps to thread." },
  { name: "SEVERE", color: 0xff9f45, text: "Dense formations, little recovery time." },
  { name: "CRITICAL", color: 0xff5bc8, text: "Fast, crowded fields. Stay sharp." },
  { name: "MAXIMUM", color: 0xff4d6d, text: "Everything at full speed. Survive!" },
];

const PAGES = [
  { title: "MISSION BRIEFING" },
  { title: "CONTROLS" },
  { title: "COLLECT" },
  { title: "DANGERS & RULES" },
  { title: "THREAT LEVELS" },
  { title: "SCORING & RANKS" },
];

const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch (e) {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch (e) {
    /* ignore */
  }
};

export default class BriefingScene extends Phaser.Scene {
  constructor() {
    super("BriefingScene");
  }

  preload() {
    preloadAudio(this); // the game sounds load while the player reads
  }

  create() {
    this.reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(350, 7, 9, 20);

    this.bg = new CosmicBackground(this);

    this.page = 0;
    this.busy = false;
    this.launching = false;
    this.seen = readSeen();
    this.pageTweens = [];
    this.pageChars = [];
    this.pageTick = null;
    this.swipe = null;

    this.root = this.add.container(0, 0).setDepth(10);
    this.inner = this.add.container(0, 0);
    this.root.add(this.inner);

    // glass body
    const key = `br_glass_${PW}x${PH}`;
    if (makeGlassTexture(this, key, PW, PH, false)) {
      this.inner.add(this.add.image(0, 0, key).setScale(GLASS_SCALE));
    } else {
      const fb = this.add.graphics(); // fallback if canvas textures are unavailable
      fb.fillStyle(0x0b1030, 0.9);
      fb.fillRoundedRect(-PW / 2, TOP, PW, PH, 20);
      fb.lineStyle(2, PALETTE.cyan, 0.7);
      fb.strokeRoundedRect(-PW / 2, TOP, PW, PH, 20);
      this.inner.add(fb);
    }

    this.buildChrome();
    this.pageC = this.buildPage(0);
    this.refreshChrome();

    // input: keyboard + swipe
    this.keys = this.input.keyboard.addKeys("A,D,LEFT,RIGHT,SPACE,ENTER");
    this.input.on("pointerdown", (p) => {
      this.swipe = { x: p.x, y: p.y, t: this.time.now };
    });
    this.input.on("pointerup", (p) => {
      const s = this.swipe;
      this.swipe = null;
      if (!s || this.launching) return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 70 && this.time.now - s.t < 700) {
        if (dx < 0) this.next();
        else this.back();
      }
    });

    // layout + entrance
    this.layout();
    this.onResize = () => this.layout();
    this.scale.on("resize", this.onResize);
    this.events.once("shutdown", () => this.scale.off("resize", this.onResize));
    if (!this.reduceMotion) {
      this.inner.setAlpha(0).setScale(0.94);
      this.tweens.add({ targets: this.inner, alpha: 1, scale: 1, duration: 500, delay: 150, ease: "Back.easeOut" });
    }
  }

  layout() {
    const { width, height } = this.scale;
    const k = Math.min(1, (width - 16) / PW, (height - 16) / PH);
    this.root.setScale(k).setPosition(width / 2, height / 2);
  }

  // ---------- small helpers ----------
  txt(parent, x, y, s, size, color, o = {}) {
    const t = this.add
      .text(x, y, s, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: o.bold ? "bold" : "normal",
        align: o.align || "left",
        letterSpacing: o.spacing || 0,
        lineSpacing: o.line || 0,
        wordWrap: o.wrap ? { width: o.wrap } : undefined,
      })
      .setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);
    parent.add(t);
    return t;
  }

  pt(tw) {
    this.pageTweens.push(tw);
    return tw;
  }

  stopPageTweens() {
    for (const tw of this.pageTweens) tw.stop();
    this.pageTweens = [];
  }

  // rise + fade in, staggered (skipped with reduced motion)
  reveal(objs, delay = 0, step = 70) {
    if (this.reduceMotion) return;
    objs.forEach((o, i) => {
      const y = o.y;
      o.setAlpha(0);
      o.y = y + 12;
      this.pt(
        this.tweens.add({ targets: o, alpha: 1, y, duration: 380, delay: delay + i * step, ease: "Cubic.easeOut" })
      );
    });
  }

  rowCard(parent, y, h, color) {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.violet, 0.12);
    g.fillRoundedRect(-160, y - h / 2, 320, h, 10);
    g.lineStyle(1.2, color, 0.32);
    g.strokeRoundedRect(-160, y - h / 2, 320, h, 10);
    parent.add(g);
    return g;
  }

  keyCap(parent, x, y, label, w = 34, h = 34, size = 13) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const t = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: `${size}px`, color: "#e8fdff", fontStyle: "bold" })
      .setOrigin(0.5);
    c.add([g, t]);
    c.lit = null;
    c.lightUp = (on) => {
      if (c.lit === on) return;
      c.lit = on;
      g.clear();
      g.fillStyle(PALETTE.cyan, on ? 0.38 : 0.1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      g.lineStyle(on ? 2 : 1.4, PALETTE.cyan, on ? 1 : 0.5);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
      t.setAlpha(on ? 1 : 0.75);
    };
    c.lightUp(false);
    parent.add(c);
    return c;
  }

  makeButton(x, y, w, h, color) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const label = this.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "12px", color: "#e8fdff", fontStyle: "bold" })
      .setOrigin(0.5);
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    c.add([g, label, hit]);
    const btn = { c, g, label, hover: false, primary: false, onClick: null };
    btn.draw = () => {
      g.clear();
      g.fillStyle(color, btn.hover ? 0.34 : btn.primary ? 0.2 : 0.1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      g.lineStyle(btn.primary ? 2 : 1.5, color, btn.hover ? 1 : btn.primary ? 0.85 : 0.55);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    };
    hit.on("pointerover", () => {
      btn.hover = true;
      btn.draw();
      this.tweens.add({ targets: c, scale: 1.05, duration: this.reduceMotion ? 1 : 120 });
    });
    hit.on("pointerout", () => {
      btn.hover = false;
      btn.draw();
      this.tweens.add({ targets: c, scale: 1, duration: this.reduceMotion ? 1 : 120 });
    });
    hit.on("pointerdown", () => btn.onClick && btn.onClick());
    btn.draw();
    this.inner.add(c);
    return btn;
  }

  // ---------- persistent chrome: title, skip, dots, footer buttons ----------
  buildChrome() {
    const inner = this.inner;
    const cyan = css(PALETTE.cyan);

    this.txt(inner, -PW / 2 + 22, TOP + 26, "COSMIC RUSH", 10, cyan, { bold: true, ox: 0, spacing: 2 });
    this.skip = this.txt(inner, PW / 2 - 22, TOP + 26, "SKIP ▸", 10, "#9bb7ff", { bold: true, ox: 1, spacing: 1 });
    this.skip.setPadding(10, 8, 10, 8).setInteractive({ useHandCursor: true });
    this.skip.on("pointerdown", () => this.launch());

    this.titleText = this.txt(inner, 0, TOP + 62, "", 18, "#eafcff", { bold: true, spacing: 3 });
    this.titleText.setShadow(0, 0, cyan, 12, false, true);
    const line = this.add.graphics();
    line.lineStyle(1, PALETTE.violet, 0.6);
    line.lineBetween(-130, TOP + 84, 130, TOP + 84);
    inner.add(line);

    this.dots = PAGES.map((_, i) => {
      const d = this.add.circle((i - (PAGES.length - 1) / 2) * 18, 186, 3.5, 0x39406e);
      inner.add(d);
      return d;
    });

    this.left = this.makeButton(-88, 238, 150, 40, PALETTE.violet);
    this.right = this.makeButton(88, 238, 150, 40, PALETTE.cyan);
    this.right.primary = true;
    this.right.draw();
    if (!this.reduceMotion) {
      this.tweens.add({ targets: this.right.g, alpha: 0.65, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  refreshChrome() {
    const last = PAGES.length - 1;
    this.titleText.setText(PAGES[this.page].title);
    this.dots.forEach((d, i) => {
      const on = i === this.page;
      d.setFillStyle(on ? PALETTE.cyan : 0x39406e, on ? 1 : 0.8).setRadius(on ? 5 : 3.5);
    });
    this.skip.setVisible(this.page > 0);

    const set = (btn, label, fn) => {
      btn.label.setText(label);
      btn.onClick = fn;
    };
    if (this.page === 0) {
      if (this.seen) {
        set(this.left, "HOW TO PLAY", () => this.goTo(1));
        set(this.right, "START MISSION", () => this.launch());
      } else {
        set(this.left, "SKIP BRIEFING", () => this.launch());
        set(this.right, "HOW TO PLAY", () => this.goTo(1));
      }
    } else if (this.page === last) {
      set(this.left, "◂ BACK", () => this.back());
      set(this.right, "LAUNCH ▸", () => this.launch());
    } else {
      set(this.left, "◂ BACK", () => this.back());
      set(this.right, "NEXT ▸", () => this.next());
    }
  }

  // ---------- navigation ----------
  next() {
    if (this.page < PAGES.length - 1) this.goTo(this.page + 1);
  }

  back() {
    if (this.page > 0) this.goTo(this.page - 1);
  }

  goTo(n) {
    if (this.busy || this.launching || n === this.page || n < 0 || n >= PAGES.length) return;
    const dir = n > this.page ? 1 : -1;
    const old = this.pageC;
    this.stopPageTweens();
    this.pageTick = null;
    this.page = n;
    this.refreshChrome();
    const fresh = this.buildPage(n);
    this.pageC = fresh;
    if (this.reduceMotion) {
      old.destroy();
      return;
    }
    this.busy = true;
    this.tweens.add({ targets: old, alpha: 0, x: -dir * 40, duration: 200, onComplete: () => old.destroy() });
    fresh.setAlpha(0);
    fresh.x = dir * 40;
    this.tweens.add({
      targets: fresh,
      alpha: 1,
      x: 0,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.busy = false;
      },
    });
  }

  launch() {
    if (this.launching) return;
    this.launching = true;
    markSeen();
    const go = () => this.scene.start("GameScene", { fromBriefing: true });
    if (this.reduceMotion) {
      go();
    } else {
      this.cameras.main.fadeOut(300, 7, 9, 20);
      this.time.delayedCall(320, go);
    }
  }

  buildPage(n) {
    const c = this.add.container(0, 0);
    this.inner.add(c);
    this.pageChars = [];
    this.pageTick = null;
    [this.pageWelcome, this.pageControls, this.pageCollect, this.pageDangers, this.pageThreat, this.pageScoring][n].call(this, c);
    return c;
  }

  // ---------- page 1: welcome ----------
  pageWelcome(c) {
    const cyan = css(PALETTE.cyan);
    const info = rankFor(getXp());
    const d = getDaily();

    const logo = this.txt(c, 0, -150, "COSMIC RUSH", 30, "#ffffff", { bold: true, spacing: 2 });
    logo.setShadow(0, 0, cyan, 16, false, true);
    const sub = this.txt(c, 0, -122, "NOVA SPACE ARCADE", 10, cyan, { spacing: 4 });

    // floating ship in the player's rank colour
    const col = info.rank.color;
    const ship = this.add.container(0, -78);
    const glow = this.add.circle(0, 4, 40, col, 0.14).setBlendMode(ADD);
    const flameO = this.add.triangle(0, 37, 0, 0, 16, 0, 8, 34, 0xff8a2b).setBlendMode(ADD);
    const flameI = this.add.triangle(0, 30, 0, 0, 8, 0, 4, 20, 0x7df9ff).setBlendMode(ADD);
    const body = this.add.triangle(0, 0, 20, 0, 0, 40, 40, 40, col).setStrokeStyle(2, 0xffffff);
    ship.add([glow, flameO, flameI, body]);
    c.add(ship);
    const orbit = [PALETTE.gold, PALETTE.cyan, PALETTE.pink].map((cl) => {
      const o = this.add.circle(0, -78, 3, cl).setBlendMode(ADD);
      c.add(o);
      return o;
    });

    const mission = this.txt(
      c,
      0,
      6,
      "Survive the cosmic storm. Dodge asteroids, collect stardust and your astro crew, and complete constellations.",
      11,
      "#b9c6ff",
      { wrap: 300, align: "center", line: 4 }
    );
    const rankLine = this.txt(
      c,
      0,
      66,
      `GALACTIC RANK  ·  ${info.rank.name}  ·  ${getXp().toLocaleString()} XP`,
      10,
      css(info.rank.color),
      { bold: true }
    );
    const dailyLine = this.txt(
      c,
      0,
      86,
      `DAILY MISSIONS ${d.doneCount}/${d.challenges.length}  ·  STREAK ${d.streak}`,
      10,
      "#9bb7ff"
    );

    // mode picker (saved immediately, used by the game)
    const modeBtns = {};
    const blurb = this.txt(c, 0, 156, "", 8, "#9bb7ff", { wrap: 320, align: "center" });
    const refreshModes = () => {
      const cur = getMode();
      for (const [key, b] of Object.entries(modeBtns)) b.draw(key === cur);
      blurb.setText(MODES[cur].blurb);
      blurb.setColor(css(MODES[cur].color));
    };
    const modeObjs = [];
    ["classic", "supernova"].forEach((key, i) => {
      const m = MODES[key];
      const b = this.add.container(i === 0 ? -72 : 72, 122);
      const g = this.add.graphics();
      b.add(g);
      const lt = this.txt(b, 0, 0, key === "supernova" ? `${m.label} ⚡` : m.label, 10, "#ffffff", { bold: true, spacing: 1 });
      const hit = this.add.rectangle(0, 0, 138, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      b.add(hit);
      b.draw = (on) => {
        g.clear();
        g.fillStyle(m.color, on ? 0.3 : 0.06);
        g.fillRoundedRect(-69, -15, 138, 30, 9);
        g.lineStyle(on ? 1.8 : 1.2, m.color, on ? 1 : 0.4);
        g.strokeRoundedRect(-69, -15, 138, 30, 9);
        lt.setAlpha(on ? 1 : 0.6);
      };
      hit.on("pointerdown", () => {
        setMode(key);
        refreshModes();
      });
      modeBtns[key] = b;
      c.add(b);
      modeObjs.push(b);
    });
    refreshModes();

    this.reveal([logo, sub, mission, rankLine, dailyLine], 150, 90);
    this.reveal([...modeObjs, blurb], 600, 90);

    this.pageTick = (time) => {
      ship.y = -78 + Math.sin(time / 500) * 6;
      ship.rotation = Math.sin(time / 900) * 0.08;
      flameO.setScale(1, 0.8 + Math.random() * 0.45);
      flameO.y = 18 + (34 * flameO.scaleY) / 2;
      flameI.setScale(1, 0.8 + Math.random() * 0.45);
      flameI.y = 18 + (20 * flameI.scaleY) / 2;
      glow.setScale(1 + 0.08 * Math.sin(time / 180));
      orbit.forEach((o, k) => {
        const a = time / 900 + k * 2.09;
        o.setPosition(Math.cos(a) * 74, -78 + Math.sin(a) * 18);
        o.setAlpha(0.5 + 0.5 * Math.sin(a + 1));
      });
    };
  }

  // ---------- page 2: controls ----------
  pageControls(c) {
    const shipCol = rankFor(getXp()).rank.color;
    const LX = -150;
    const LW = 300;
    const LT = -186;
    const LH = 104;

    // live demo lane
    const box = this.add.graphics();
    box.fillStyle(0x070914, 0.55);
    box.fillRoundedRect(LX, LT, LW, LH, 10);
    box.lineStyle(1.2, PALETTE.cyan, 0.45);
    box.strokeRoundedRect(LX, LT, LW, LH, 10);
    c.add(box);
    this.txt(c, LX + 10, LT + 12, "LIVE DEMO", 8, "#7a86b8", { ox: 0, spacing: 2 });
    const demoShip = this.add
      .triangle(0, LT + LH - 22, 20, 0, 0, 40, 40, 40, shipCol)
      .setScale(0.5)
      .setStrokeStyle(2, 0xffffff);
    const asts = [0, 1, 2].map(() => {
      const a = this.add.circle(0, LT, 9, 0x6b5b4b).setStrokeStyle(2, 0xb59b86);
      c.add(a);
      return a;
    });
    c.add(demoShip);

    // keyboard
    const kLabel = this.txt(c, 0, -62, "KEYBOARD", 9, "#7a86b8", { spacing: 3 });
    const capL = this.keyCap(c, -93, -38, "◀");
    const capR = this.keyCap(c, -53, -38, "▶");
    this.txt(c, 0, -38, "OR", 10, "#7a86b8", { bold: true });
    const capA = this.keyCap(c, 53, -38, "A");
    const capD = this.keyCap(c, 93, -38, "D");

    // touch
    const tLabel = this.txt(c, 0, -6, "TOUCH", 9, "#7a86b8", { spacing: 3 });
    const track = this.add.graphics();
    track.lineStyle(1.5, PALETTE.cyan, 0.3);
    track.lineBetween(-110, 24, 110, 24);
    c.add(track);
    const finger = this.add.container(0, 24);
    const rip = this.add.circle(0, 0, 16).setStrokeStyle(1.5, PALETTE.cyan, 0.6);
    const ring = this.add.circle(0, 0, 10).setStrokeStyle(2, PALETTE.cyan, 0.95);
    const dot = this.add.circle(0, 0, 4, PALETTE.cyan);
    finger.add([rip, ring, dot]);
    c.add(finger);
    const miniShip = this.add
      .triangle(0, 58, 20, 0, 0, 40, 40, 40, shipCol)
      .setScale(0.5)
      .setStrokeStyle(2, 0xffffff);
    c.add(miniShip);
    const dragTxt = this.txt(c, 0, 88, "DRAG LEFT OR RIGHT BELOW THE TOP BAR", 10, "#ffffff", { bold: true, wrap: 320, align: "center" });

    // extras
    this.keyCap(c, -112, 124, "M", 40, 26, 11);
    const mTxt = this.txt(c, -80, 124, "MUTE SOUND", 11, "#ffffff", { ox: 0 });
    this.keyCap(c, -112, 152, "SPACE", 58, 26, 8);
    const sTxt = this.txt(c, -72, 152, "OR ENTER  ·  PLAY AGAIN", 11, "#ffffff", { ox: 0 });

    this.reveal([kLabel, tLabel, dragTxt, mTxt, sTxt], 200, 90);

    const SHIP_X = (t) => Math.sin(t / 650) * 100;
    const FALL = 1300;
    const PERIOD = 1800;
    this.pageTick = (time, dt) => {
      // demo: asteroids are timed to arrive beside the ship, never on it
      const sx = SHIP_X(time);
      demoShip.x = sx;
      demoShip.rotation = Math.cos(time / 650) * 0.2;
      asts.forEach((a, k) => {
        const off = k * 600;
        const cycle = Math.floor((time - off) / PERIOD);
        const t0 = cycle * PERIOD + off;
        const u = (time - t0) / FALL;
        if (cycle < 0 || u > 1) {
          a.setVisible(false);
          return;
        }
        a.setVisible(true);
        const side = cycle % 2 === 0 ? 1 : -1;
        a.x = Phaser.Math.Clamp(SHIP_X(t0 + FALL) + side * 55, -135, 135);
        a.y = LT + 20 + u * (LH - 30);
      });

      // keycaps light up with the direction of travel
      const left = Math.cos(time / 650) < 0;
      capL.lightUp(left);
      capA.lightUp(left);
      capR.lightUp(!left);
      capD.lightUp(!left);

      // finger drags, ship follows
      const fx = Math.sin(time / 800 + 1) * 100;
      finger.x = fx;
      rip.setScale(1 + 0.3 * Math.sin(time / 250));
      rip.setAlpha(0.5 + 0.3 * Math.sin(time / 250));
      miniShip.x += (fx - miniShip.x) * Math.min(1, 8 * dt);
      miniShip.rotation = Phaser.Math.Clamp((fx - miniShip.x) / 40, -1, 1) * 0.25;
    };
  }

  // ---------- page 3: collect ----------
  pageCollect(c) {
    const gold = css(PALETTE.gold);
    const spins = [];
    const mkStardust = () => {
      const k = this.add.container(0, 0);
      const s1 = this.add.star(-5, 4, 5, 4, 9, 0xffd54a).setBlendMode(ADD);
      const s2 = this.add.star(7, -5, 4, 3, 7, 0xff4df0).setBlendMode(ADD);
      k.add([s1, s2]);
      spins.push(s1, s2);
      return k;
    };
    const mkConStar = () => {
      const k = this.add.container(0, 0);
      const ring = this.add.circle(0, 0, 15).setStrokeStyle(1.5, 0x7df9ff, 0.9);
      const st = this.add.star(0, 0, 5, 5, 11, 0x7df9ff).setStrokeStyle(1.5, 0xffffff);
      k.add([ring, st]);
      spins.push(st);
      return k;
    };
    const rows = [
      { make: mkStardust, name: "STARDUST", desc: "Golden stars. Rare pink crystals pay more.", tag: "+10 / +100", tc: gold },
      { make: makeStella, char: true, name: "STELLA", desc: "Golden star spirit. Big bonus points.", tag: `+${STELLA_POINTS}`, tc: gold },
      { make: makeCometFox, char: true, name: "COMET FOX", desc: `Speed boost for ${BOOST_SECONDS} seconds.`, tag: "FAST", tc: css(PALETTE.cyan) },
      { make: makeLuma, char: true, name: "LUMA", desc: "Rainbow shield. Blocks one hit.", tag: "SHIELD", tc: "#ffffff" },
      { make: makeNebby, char: true, name: "NEBBY", desc: "Friendly buddy. Follows you, never hurts.", tag: "BUDDY", tc: "#c9a8ff" },
      { make: mkConStar, name: "CONSTELLATION STAR", desc: "Catch named stars in order for bonuses.", tag: "BONUS", tc: css(PALETTE.cyan) },
    ];
    const groups = [];
    rows.forEach((r, i) => {
      const y = -168 + i * 54;
      const rc = this.add.container(0, 0);
      c.add(rc);
      this.rowCard(rc, y, 48, PALETTE.cyan);
      const icon = r.make(this);
      icon.setPosition(-128, y).setScale(r.char ? 0.62 : 1);
      rc.add(icon);
      if (r.char) this.pageChars.push(icon);
      this.txt(rc, -96, y - 11, r.name, 11, "#ffffff", { bold: true, ox: 0 });
      this.txt(rc, -96, y + 9, r.desc, 9, "#9bb7ff", { ox: 0, wrap: 170, line: 2 });
      this.txt(rc, 150, y, r.tag, 11, r.tc, { bold: true, ox: 1 });
      groups.push(rc);
    });
    this.reveal(groups, 120, 90);
    this.pageTick = (time, dt) => {
      for (const s of spins) s.rotation += dt * 1.5;
    };
  }

  // ---------- page 4: dangers & rules ----------
  pageDangers(c) {
    const pink = css(PALETTE.pink);
    const cyan = css(PALETTE.cyan);
    const lives = getMode() === "supernova" ? 2 : 3;

    const groups = [];
    // asteroids
    {
      const y = -170;
      const rc = this.add.container(0, 0);
      c.add(rc);
      this.rowCard(rc, y, 48, PALETTE.pink);
      const icon = this.add.container(-128, y);
      icon.add([
        this.add.circle(0, 0, 14, 0x6b5b4b).setStrokeStyle(2, 0xb59b86),
        this.add.circle(-4, -3, 3, 0x4d4036),
        this.add.circle(5, 4, 2.5, 0x4d4036),
      ]);
      rc.add(icon);
      this.txt(rc, -96, y - 11, "ASTEROIDS", 11, "#ffffff", { bold: true, ox: 0 });
      this.txt(rc, -96, y + 9, "Brown rocks. Any hit costs 1 life.", 9, "#9bb7ff", { ox: 0, wrap: 170, line: 2 });
      this.txt(rc, 150, y, "−1 ♥", 12, pink, { bold: true, ox: 1 });
      groups.push(rc);
    }
    // voidling
    const y2 = -116;
    const rc2 = this.add.container(0, 0);
    c.add(rc2);
    this.rowCard(rc2, y2, 48, PALETTE.pink);
    const vi = makeVoidling(this).setScale(0.5).setPosition(-126, y2);
    rc2.add(vi);
    this.pageChars.push(vi);
    const bang = this.txt(rc2, -152, y2, "!", 18, pink, { bold: true });
    this.txt(rc2, -96, y2 - 11, "VOIDLING", 11, "#ffffff", { bold: true, ox: 0 });
    this.txt(rc2, -96, y2 + 9, "A pink ! lane warns you first, then it drops in.", 9, "#9bb7ff", { ox: 0, wrap: 170, line: 2 });
    this.txt(rc2, 150, y2, "−1 ♥", 12, pink, { bold: true, ox: 1 });
    groups.push(rc2);

    // rules
    const head = this.txt(c, 0, -72, "RULES OF THE RUN", 10, cyan, { bold: true, spacing: 2 });
    const rules = [
      `You start with ${lives} lives (${lives === 3 ? "2" : "3"} in ${lives === 3 ? "SUPERNOVA" : "CLASSIC"} mode).`,
      "After a hit you blink for about a second and can't be hit again.",
      `A shield blocks exactly one hit, then it's gone.`,
      "Lose every life and the mission ends.",
      "Survive: +50 every 10 s. Travel: +200 every 500 m.",
    ];
    const marks = [];
    rules.forEach((r, i) => {
      const y = -44 + i * 36;
      const rc = this.add.container(0, 0);
      c.add(rc);
      const ring = this.add.circle(-146, y, 9, PALETTE.cyan, 0.05).setStrokeStyle(1.5, PALETTE.cyan, 0.8);
      rc.add(ring);
      this.txt(rc, -146, y, String(i + 1), 10, cyan, { bold: true });
      this.txt(rc, -128, y, r, 10, "#ffffff", { ox: 0, wrap: 275, line: 2 });
      marks.push(ring);
      groups.push(rc);
    });

    // current lives
    const lbl = this.txt(c, 0, 132, `YOUR LIVES  ·  ${MODES[getMode()].label}`, 8, "#7a86b8", { spacing: 2 });
    const hearts = this.txt(c, 0, 154, Array(lives).fill("♥").join(" "), 20, "#ff5c8a", { bold: true });
    groups.push(head, lbl, hearts);

    this.reveal(groups, 100, 80);
    let cur = -1;
    this.pageTick = (time) => {
      bang.setAlpha(0.5 + 0.5 * Math.sin(time / 120));
      hearts.setScale(1 + 0.06 * Math.sin(time / 300));
      const idx = Math.floor(time / 1500) % marks.length;
      if (idx !== cur) {
        if (cur >= 0) marks[cur].setFillStyle(PALETTE.cyan, 0.05);
        marks[idx].setFillStyle(PALETTE.cyan, 0.35);
        cur = idx;
      }
    };
  }

  // ---------- page 5: threat levels ----------
  pageThreat(c) {
    const pink = css(PALETTE.pink);
    const cyan = css(PALETTE.cyan);

    const intro = this.txt(
      c,
      0,
      -172,
      `Every ${THREAT_STEP} seconds the THREAT LEVEL rises and a pink banner warns you.`,
      10,
      "#b9c6ff",
      { wrap: 310, align: "center", line: 3 }
    );

    const rows = THREAT_LEVELS.map((lv, i) => {
      const y = -128 + i * 38;
      const rc = this.add.container(0, 0);
      c.add(rc);
      const g = this.add.graphics();
      rc.add(g);
      const draw = (on) => {
        g.clear();
        g.fillStyle(lv.color, on ? 0.22 : 0.07);
        g.fillRoundedRect(-160, y - 17, 320, 34, 9);
        g.lineStyle(on ? 1.8 : 1, lv.color, on ? 0.95 : 0.3);
        g.strokeRoundedRect(-160, y - 17, 320, 34, 9);
      };
      draw(false);
      const chip = this.add.circle(-144, y, 6, lv.color);
      rc.add(chip);
      this.txt(rc, -130, y - 8, `THREAT ${i + 1}  ·  ${lv.name}`, 11, css(lv.color), { bold: true, ox: 0 });
      this.txt(rc, -130, y + 8, lv.text, 9, "#9bb7ff", { ox: 0 });
      this.txt(rc, 150, y - 8, i === 0 ? "START" : `FROM ${fmtTime(i * THREAT_STEP)}`, 10, "#cfe3ff", { bold: true, ox: 1 });
      return { rc, draw, chip };
    });

    const note = this.txt(c, 0, 104, "HIGHER THREAT  =  FASTER ASTEROIDS  ·  MORE VOIDLINGS", 9, cyan, { wrap: 310, align: "center", line: 3 });

    const sn = this.add.container(0, 0);
    c.add(sn);
    const sg = this.add.graphics();
    sg.fillStyle(PALETTE.pink, 0.1);
    sg.fillRoundedRect(-160, 118, 320, 42, 10);
    sg.lineStyle(1.4, PALETTE.pink, 0.7);
    sg.strokeRoundedRect(-160, 118, 320, 42, 10);
    sn.add(sg);
    this.txt(
      sn,
      0,
      139,
      `SUPERNOVA starts at THREAT 2 and climbs about ${Math.round((SUPERNOVA_CLOCK - 1) * 100)}% faster.`,
      9,
      pink,
      { bold: true, wrap: 300, align: "center", line: 3 }
    );

    this.reveal([intro, ...rows.map((r) => r.rc), note, sn], 100, 70);

    let cur = -1;
    this.pageTick = (time) => {
      const idx = Math.floor(time / 1100) % rows.length;
      if (idx !== cur) {
        if (cur >= 0) {
          rows[cur].draw(false);
          rows[cur].chip.setScale(1);
        }
        rows[idx].draw(true);
        cur = idx;
      }
      rows[idx].chip.setScale(1 + 0.25 * Math.sin(time / 150));
    };
  }

  // ---------- page 6: scoring & ranks ----------
  pageScoring(c) {
    const gold = css(PALETTE.gold);
    const cyan = css(PALETTE.cyan);

    const table = [
      ["STARDUST", "+10"],
      ["RARE PINK CRYSTAL", "+100"],
      ["STELLA", `+${STELLA_POINTS}`],
      ["SURVIVE 10 SECONDS", "+50"],
      ["EVERY 500 METRES", "+200"],
      ["CONSTELLATION STAR", "BONUS"],
      ["FIGURE COMPLETE", "BIG BONUS"],
    ];
    const objs = [];
    table.forEach(([label, value], i) => {
      const y = -176 + i * 27;
      const rc = this.add.container(0, 0);
      c.add(rc);
      this.txt(rc, -150, y, label, 11, "#ffffff", { ox: 0 });
      this.txt(rc, 150, y, value, 12, gold, { bold: true, ox: 1 });
      const sep = this.add.graphics();
      sep.lineStyle(1, 0xffffff, 0.07);
      sep.lineBetween(-150, y + 13, 150, y + 13);
      rc.add(sep);
      objs.push(rc);
    });

    const divider = this.add.graphics();
    divider.lineStyle(1, PALETTE.violet, 0.6);
    divider.lineBetween(-130, 6, 130, 6);
    c.add(divider);
    const head = this.txt(c, 0, 26, "PROGRESSION", 10, cyan, { bold: true, spacing: 2 });
    const lines = [
      [`★  Earn XP every run to climb ${RANKS.length} GALACTIC RANKS`, gold],
      ["✔  3 DAILY MISSIONS reset every day", "#7dffb0"],
      [`◆  ${getAchievements().length} BADGES to unlock`, "#c9a8ff"],
      ["▲  SUPERNOVA mode for the brave", css(PALETTE.pink)],
    ].map(([s, col], i) => this.txt(c, -150, 52 + i * 26, s, 10, col, { ox: 0, bold: true, wrap: 300 }));
    const foot = this.txt(c, 0, 158, "ALL PROGRESS IS SAVED ON THIS DEVICE ONLY", 8, "#58628f", { spacing: 1 });

    this.reveal(objs, 100, 70);
    this.reveal([head, ...lines, foot], 650, 90);
  }

  // ---------- main loop ----------
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.bg.update(time, delta, dt, 0);
    if (this.pageTick) this.pageTick(time, dt);
    for (const ch of this.pageChars) ch.tick(time);

    if (this.launching) return;
    const J = Phaser.Input.Keyboard.JustDown;
    if (J(this.keys.RIGHT) || J(this.keys.D)) this.next();
    if (J(this.keys.LEFT) || J(this.keys.A)) this.back();
    if (J(this.keys.SPACE) || J(this.keys.ENTER)) {
      if (this.right.onClick) this.right.onClick();
    }
  }
}