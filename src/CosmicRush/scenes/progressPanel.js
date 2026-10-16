import Phaser from "phaser";
import { PALETTE } from "./background";
import {
  RANKS,
  MODES,
  BADGE_XP,
  SWEEP_XP,
  getMode,
  setMode,
  getXp,
  rankFor,
  getDaily,
  getAchievements,
  getStats,
} from "../data/progress";

const FONT = "Orbitron, sans-serif";
const css = (n) => "#" + n.toString(16).padStart(6, "0");
const W = 360;
const H = 560;
const BODY_TOP = -H / 2 + 128; // content starts below the tabs and the mode switch
const TABS = [
  ["rank", "RANK"],
  ["daily", "DAILY"],
  ["badges", "BADGES"],
  ["stats", "STATS"],
];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Rank / daily missions / badges / stats, drawn in the same glass style as the leaderboard.
export default class ProgressPanel {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.glass = opts.glass;
    this.glassScale = opts.glassScale || 0.5;
    this.onMode = opts.onMode || (() => {});
    this.dim = null;
    this.root = null;
    this.inner = null;
    this.body = null;
    this.note = null;
    this.tab = "rank";
    this.tweenList = [];
    this.tabBtns = {};
    this.modeBtns = {};
  }

  get isOpen() {
    return !!this.root;
  }

  text(parent, x, y, s, size, color, o = {}) {
    const t = this.scene.add
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

  track(tw) {
    this.tweenList.push(tw);
    return tw;
  }

  open(tab = "rank") {
    if (this.root) return;
    const s = this.scene;
    const rm = s.reduceMotion;
    this.tab = tab;

    this.dim = s.add.rectangle(0, 0, 4000, 4000, 0x04060f, 1).setAlpha(rm ? 0.66 : 0).setDepth(32).setInteractive();
    this.root = s.add.container(0, 0).setDepth(33);
    this.inner = s.add.container(0, 0);
    this.root.add(this.inner);

    const key = `pg_glass_${W}x${H}`;
    if (this.glass && this.glass(key, W, H)) {
      this.inner.add(s.add.image(0, 0, key).setScale(this.glassScale));
    } else {
      const fb = s.add.graphics(); // fallback if canvas textures are unavailable
      fb.fillStyle(0x0b1030, 0.92);
      fb.fillRoundedRect(-W / 2, -H / 2, W, H, 20);
      fb.lineStyle(2, PALETTE.cyan, 0.7);
      fb.strokeRoundedRect(-W / 2, -H / 2, W, H, 20);
      this.inner.add(fb);
    }

    this.buildChrome();
    this.body = s.add.container(0, BODY_TOP);
    this.inner.add(this.body);
    this.renderTab();
    this.layout();

    if (!rm) {
      s.tweens.add({ targets: this.dim, alpha: 0.66, duration: 220 });
      this.inner.setAlpha(0).setScale(0.94);
      s.tweens.add({ targets: this.inner, alpha: 1, scale: 1, duration: 320, ease: "Back.easeOut" });
    }
  }

  close() {
    if (!this.root) return;
    for (const tw of this.tweenList) tw.stop();
    this.tweenList = [];
    this.scene.tweens.killTweensOf(this.inner);
    this.scene.tweens.killTweensOf(this.dim);
    this.root.destroy();
    this.dim.destroy();
    this.root = this.dim = this.inner = this.body = this.note = null;
  }

  layout() {
    if (!this.root) return;
    const { width, height } = this.scene.scale;
    const k = Math.min(1, (width - 16) / W, (height - 16) / H);
    this.root.setScale(k).setPosition(width / 2, height / 2);
    this.dim.setPosition(width / 2, height / 2);
  }

  // ---------- header: title, tabs, mode switch, close ----------
  buildChrome() {
    const s = this.scene;
    const inner = this.inner;
    const top = -H / 2;

    const title = this.text(inner, 0, top + 30, "GALACTIC PROGRESS", 17, "#eafcff", { bold: true, spacing: 3 });
    title.setShadow(0, 0, css(PALETTE.cyan), 12, false, true);

    this.tabBtns = {};
    TABS.forEach(([key, label], i) => {
      const c = s.add.container(-117 + i * 78, top + 68);
      const g = s.add.graphics();
      c.add(g);
      const t = this.text(c, 0, 0, label, 10, "#9bb7ff", { bold: true, spacing: 1 });
      const hit = s.add.rectangle(0, 0, 74, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      c.add(hit);
      const draw = (on) => {
        g.clear();
        g.fillStyle(PALETTE.cyan, on ? 0.28 : 0.08);
        g.fillRoundedRect(-37, -14, 74, 28, 9);
        g.lineStyle(1.4, PALETTE.cyan, on ? 1 : 0.45);
        g.strokeRoundedRect(-37, -14, 74, 28, 9);
        t.setColor(on ? "#ffffff" : "#9bb7ff");
      };
      hit.on("pointerdown", () => this.setTab(key));
      this.tabBtns[key] = draw;
      inner.add(c);
    });

    this.modeBtns = {};
    ["classic", "supernova"].forEach((key, i) => {
      const m = MODES[key];
      const c = s.add.container(i === 0 ? -72 : 72, top + 104);
      const g = s.add.graphics();
      c.add(g);
      const t = this.text(c, 0, 0, key === "supernova" ? `${m.label} ⚡` : m.label, 10, "#ffffff", {
        bold: true,
        spacing: 1,
      });
      const hit = s.add.rectangle(0, 0, 138, 28, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      c.add(hit);
      const draw = (on) => {
        g.clear();
        g.fillStyle(m.color, on ? 0.3 : 0.06);
        g.fillRoundedRect(-69, -14, 138, 28, 9);
        g.lineStyle(on ? 1.8 : 1.2, m.color, on ? 1 : 0.4);
        g.strokeRoundedRect(-69, -14, 138, 28, 9);
        t.setAlpha(on ? 1 : 0.6);
      };
      hit.on("pointerdown", () => {
        setMode(key);
        this.refreshModes();
        this.onMode(key);
      });
      this.modeBtns[key] = draw;
      inner.add(c);
    });

    // one-line description of the selected mode
    this.note = this.text(inner, 0, H / 2 - 64, "", 9, "#9bb7ff", { wrap: 320, align: "center" });
    this.refreshTabs();
    this.refreshModes();

    // CLOSE
    const cb = s.add.container(0, H / 2 - 30);
    const cg = s.add.graphics();
    const drawClose = (hover) => {
      cg.clear();
      cg.fillStyle(PALETTE.cyan, hover ? 0.24 : 0.1);
      cg.fillRoundedRect(-75, -17, 150, 34, 17);
      cg.lineStyle(1.6, PALETTE.cyan, hover ? 1 : 0.8);
      cg.strokeRoundedRect(-75, -17, 150, 34, 17);
    };
    drawClose(false);
    cb.add(cg);
    this.text(cb, 0, 0, "CLOSE", 12, "#d8fbff", { bold: true, spacing: 3 });
    const ch = s.add.rectangle(0, 0, 150, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    cb.add(ch);
    ch.on("pointerover", () => drawClose(true));
    ch.on("pointerout", () => drawClose(false));
    ch.on("pointerdown", () => this.close());
    inner.add(cb);
  }

  refreshTabs() {
    for (const [key, draw] of Object.entries(this.tabBtns)) draw(key === this.tab);
  }

  refreshModes() {
    const cur = getMode();
    for (const [key, draw] of Object.entries(this.modeBtns)) draw(key === cur);
    if (this.note) {
      this.note.setText(MODES[cur].blurb);
      this.note.setColor(css(MODES[cur].color));
    }
  }

  setTab(key) {
    if (this.tab === key) return;
    this.tab = key;
    this.refreshTabs();
    this.renderTab();
  }

  renderTab() {
    for (const tw of this.tweenList) tw.stop();
    this.tweenList = [];
    this.body.removeAll(true);
    if (this.tab === "rank") this.renderRank();
    else if (this.tab === "daily") this.renderDaily();
    else if (this.tab === "badges") this.renderBadges();
    else this.renderStats();
  }

  // ---------- RANK ----------
  renderRank() {
    const s = this.scene;
    const b = this.body;
    const rm = s.reduceMotion;
    const xp = getXp();
    const info = rankFor(xp);
    const col = info.rank.color;
    const c = css(col);

    const glow = s.add.circle(0, 36, 40, col, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    const disc = s.add.circle(0, 36, 28, col).setStrokeStyle(2, 0xffffff, 0.8);
    b.add([glow, disc]);
    this.text(b, 0, 36, String(info.index + 1), 22, "#10102a", { bold: true });
    if (!rm) {
      this.track(
        s.tweens.add({ targets: glow, alpha: 0.32, scale: 1.2, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" })
      );
    }
    const name = this.text(b, 0, 86, info.rank.name, 20, c, { bold: true, spacing: 2 });
    name.setShadow(0, 0, c, 10, false, true);
    this.text(b, 0, 110, `${xp.toLocaleString()} XP`, 11, "#9bb7ff");

    const barG = s.add.graphics();
    b.add(barG);
    const draw = (pct) => {
      barG.clear();
      barG.fillStyle(0xffffff, 0.1);
      barG.fillRoundedRect(-140, 128, 280, 10, 5);
      const w = Math.max(0, Math.min(1, pct)) * 280;
      if (w >= 1) {
        barG.fillStyle(col, 1);
        barG.fillRoundedRect(-140, 128, w, 10, 5);
      }
    };
    const to = info.next ? info.pct : 1;
    if (rm) draw(to);
    else {
      draw(0);
      this.track(
        s.tweens.addCounter({ from: 0, to, duration: 800, ease: "Cubic.easeOut", onUpdate: (tw) => draw(tw.getValue()) })
      );
    }
    this.text(
      b,
      0,
      154,
      info.next ? `${(info.next.xp - xp).toLocaleString()} XP TO ${info.next.name}` : "MAX RANK REACHED",
      10,
      info.next ? css(info.next.color) : "#ffd56a",
      { bold: true }
    );

    // rank ladder
    RANKS.forEach((rk, i) => {
      const y = 186 + i * 25;
      const reached = xp >= rk.xp;
      const cur = i === info.index;
      if (cur) {
        const hl = s.add.graphics();
        hl.fillStyle(rk.color, 0.14);
        hl.fillRoundedRect(-150, y - 11, 300, 22, 8);
        hl.lineStyle(1.2, rk.color, 0.9);
        hl.strokeRoundedRect(-150, y - 11, 300, 22, 8);
        b.add(hl);
      }
      const dot = s.add.circle(-132, y, 6, reached ? rk.color : 0x2a3158).setStrokeStyle(1, 0xffffff, reached ? 0.7 : 0.15);
      b.add(dot);
      this.text(b, -116, y, rk.name, 11, reached ? "#ffffff" : "#6b76a8", { bold: cur, ox: 0 });
      this.text(b, 142, y, i === 0 ? "START" : `${rk.xp.toLocaleString()} XP`, 10, reached ? "#9bb7ff" : "#58628f", { ox: 1 });
    });
    this.text(b, 0, 362, "EACH RANK UNLOCKS A NEW SHIP COLOUR", 9, "#7a86b8");
  }

  // ---------- DAILY ----------
  renderDaily() {
    const s = this.scene;
    const b = this.body;
    const rm = s.reduceMotion;
    const d = getDaily();
    const h = Math.floor(d.resetMs / 3600000);
    const m = Math.floor((d.resetMs % 3600000) / 60000);

    this.text(b, -150, 8, `STREAK  ${d.streak} DAY${d.streak === 1 ? "" : "S"}`, 10, "#ffd56a", { bold: true, ox: 0 });
    this.text(b, 150, 8, `RESETS IN ${h}h ${m}m`, 10, "#9bb7ff", { ox: 1 });

    d.challenges.forEach((c, i) => {
      const y0 = 26 + i * 90;
      const edge = c.done ? 0x7dffb0 : PALETTE.cyan;
      const g = s.add.graphics();
      g.fillStyle(PALETTE.violet, c.done ? 0.1 : 0.16);
      g.fillRoundedRect(-160, y0, 320, 80, 12);
      g.lineStyle(1.4, edge, c.done ? 0.8 : 0.4);
      g.strokeRoundedRect(-160, y0, 320, 80, 12);
      b.add(g);

      this.text(b, -148, y0 + 11, c.tierName, 8, css(edge), { bold: true, ox: 0, spacing: 1 });
      this.text(b, 148, y0 + 11, `+${c.reward} XP`, 11, "#ffd56a", { bold: true, ox: 1 });
      this.text(b, -148, y0 + 34, c.text, 12, c.done ? "#9fb7c9" : "#ffffff", { bold: true, ox: 0, wrap: 296 });

      const pct = Math.min(1, c.value / c.target);
      const bg = s.add.graphics();
      bg.fillStyle(0xffffff, 0.1);
      bg.fillRoundedRect(-148, y0 + 58, 296, 6, 3);
      b.add(bg);
      const bar = s.add.graphics();
      b.add(bar);
      const drawBar = (p) => {
        bar.clear();
        if (p * 296 >= 1) {
          bar.fillStyle(c.done ? 0x7dffb0 : PALETTE.cyan, 1);
          bar.fillRoundedRect(-148, y0 + 58, p * 296, 6, 3);
        }
      };
      if (rm) drawBar(pct);
      else {
        drawBar(0);
        this.track(
          s.tweens.addCounter({
            from: 0,
            to: pct,
            duration: 650,
            delay: 120 + i * 120,
            ease: "Cubic.easeOut",
            onUpdate: (tw) => drawBar(tw.getValue()),
          })
        );
      }
      this.text(b, -148, y0 + 71, `${Math.min(c.value, c.target).toLocaleString()} / ${c.target.toLocaleString()}`, 9, "#9bb7ff", { ox: 0 });
      if (c.done) this.text(b, 148, y0 + 71, "✔ COMPLETE", 9, "#7dffb0", { bold: true, ox: 1 });
    });

    this.text(
      b,
      0,
      306,
      d.sweep ? `✔ DAILY SWEEP COMPLETE · +${SWEEP_XP} XP EARNED` : `COMPLETE ALL 3 FOR A +${SWEEP_XP} XP BONUS`,
      10,
      d.sweep ? "#7dffb0" : "#ffd56a",
      { bold: true }
    );
    this.text(b, 0, 326, "NEW MISSIONS EVERY DAY · PROGRESS IS SAVED ON THIS DEVICE", 8, "#58628f");
  }

  // ---------- BADGES ----------
  renderBadges() {
    const s = this.scene;
    const b = this.body;
    const list = getAchievements();
    const got = list.filter((x) => x.unlocked).length;
    this.text(b, 0, 8, `BADGES  ${got} / ${list.length}`, 11, "#ffd56a", { bold: true, spacing: 1 });
    const foot = this.text(b, 0, 354, `TAP A BADGE FOR DETAILS · EACH UNLOCK EARNS +${BADGE_XP} XP`, 9, "#9bb7ff", {
      wrap: 310,
      align: "center",
      line: 3,
    });

    list.forEach((a, i) => {
      const x = ((i % 3) - 1) * 106;
      const y = 52 + Math.floor(i / 3) * 82;
      const c = s.add.container(x, y);
      b.add(c);
      const g = s.add.graphics();
      g.fillStyle(a.unlocked ? PALETTE.violet : 0x0c1030, a.unlocked ? 0.34 : 0.55);
      g.fillRoundedRect(-50, -36, 100, 72, 12);
      g.lineStyle(1.4, a.unlocked ? PALETTE.gold : 0x39406e, a.unlocked ? 0.9 : 0.6);
      g.strokeRoundedRect(-50, -36, 100, 72, 12);
      c.add(g);
      const icon = this.text(c, 0, -12, a.unlocked ? a.icon : "🔒", 22, "#ffffff");
      if (!a.unlocked) icon.setAlpha(0.45);
      this.text(c, 0, 20, a.name.toUpperCase(), 8, a.unlocked ? "#ffffff" : "#6b76a8", { bold: true, wrap: 92, align: "center" });
      const hit = s.add.rectangle(0, 0, 100, 72, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      c.add(hit);
      hit.on("pointerdown", () => {
        foot.setText(`${a.name.toUpperCase()}\n${a.desc}  ·  ${a.unlocked ? "UNLOCKED" : "LOCKED"}`);
        foot.setColor(a.unlocked ? "#ffd56a" : "#9bb7ff");
      });
    });
  }

  // ---------- STATS ----------
  renderStats() {
    const s = this.scene;
    const b = this.body;
    const st = getStats();
    const rows = [
      ["RUNS PLAYED", st.games.toLocaleString()],
      ["CLASSIC BEST SCORE", st.best.classic.score.toLocaleString(), css(MODES.classic.color)],
      ["SUPERNOVA BEST SCORE", st.best.supernova.score.toLocaleString(), css(MODES.supernova.color)],
      ["LONGEST SURVIVAL", fmtTime(st.longest)],
      ["BEST DISTANCE", `${st.bestDistance.toLocaleString()} m`],
      ["STARDUST COLLECTED", st.totals.stardust.toLocaleString(), "#ffd56a"],
      ["CONSTELLATIONS COMPLETED", `${st.totals.constellations}  (${st.conUnique}/${st.conTotal} figures)`],
      ["CREW COLLECTED", st.totals.crew.toLocaleString()],
      ["DAILY MISSIONS DONE", st.totals.dailyDone.toLocaleString()],
      ["TOTAL XP", st.xp.toLocaleString(), "#9fefff"],
    ];
    rows.forEach(([label, value, color], i) => {
      const y = 14 + i * 34;
      this.text(b, -150, y, label, 9, "#8ea4d6", { ox: 0, spacing: 1 });
      this.text(b, 150, y, String(value), 13, color || "#ffffff", { bold: true, ox: 1 });
      if (i < rows.length - 1) {
        const sep = s.add.graphics();
        sep.lineStyle(1, 0xffffff, 0.06);
        sep.lineBetween(-150, y + 17, 150, y + 17);
        b.add(sep);
      }
    });
  }
}