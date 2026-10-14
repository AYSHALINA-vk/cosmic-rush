import Phaser from "phaser";

const ADD = Phaser.BlendModes.ADD;
const LANE_MAX = 480;
const TAU = Math.PI * 2;

export const PALETTE = {
  space: "#070914",
  violet: 0x7651e8,
  cyan: 0x19ddf5,
  pink: 0xff5bc8,
  gold: 0xffd56a,
  teal: 0x00cfc1,
};

// ---------------------------------------------------------------------------------------
// Nebula cloud textures. Each one mixes 2-3 related hues, so a single cloud already has
// internal colour variation instead of looking like one flat tint.
// ---------------------------------------------------------------------------------------
const NEBULA_TEXTURES = [
  { key: "neb2_violet", colors: [0x7651e8, 0x9a6bff, 0x5b3fd0] },
  { key: "neb2_indigo", colors: [0x4a4ad8, 0x6a5cff, 0x2f35a8] },
  { key: "neb2_blue", colors: [0x2c6bff, 0x4aa0ff, 0x1e4fd8] },
  { key: "neb2_cyan", colors: [0x19ddf5, 0x00cfc1, 0x2c8fff] },
  { key: "neb2_magenta", colors: [0xff5bc8, 0xd83aa8, 0xb23cff] },
  { key: "neb2_rose", colors: [0xff7ad9, 0xb06bff, 0xff5bc8] },
];

// ---------------------------------------------------------------------------------------
// Parallax layers (far -> near). TUNING KNOBS:
//   size    : rendered cloud diameter in px (random within range)
//   speed   : drift speed in px/s (far layers crawl, near layers move a little faster)
//   alpha   : base opacity of each cloud
//   dir     : range of drift angles in radians (0 = right, PI/2 = down)
//   breathe : +/- scale breathing amplitude (0.06 = grows/shrinks 6%)
//   period  : seconds for one breathing cycle
//   wobble  : px of slow sideways sway added on top of the drift
// Cloud count per layer = keys.length. Fewer / smaller clouds = cheaper on weak phones.
// ---------------------------------------------------------------------------------------
const NEBULA_LAYERS = [
  {
    keys: ["neb2_indigo", "neb2_violet", "neb2_blue"],
    size: [1000, 1400],
    speed: [3, 6],
    alpha: [0.42, 0.55],
    depth: -46,
    dir: [0, TAU],
    breathe: [0.05, 0.09],
    period: [24, 38],
    wobble: [30, 60],
    spin: 0.006,
  },
  {
    keys: ["neb2_violet", "neb2_magenta", "neb2_blue"],
    size: [700, 980],
    speed: [6, 11],
    alpha: [0.34, 0.46],
    depth: -42,
    dir: [0, TAU],
    breathe: [0.06, 0.1],
    period: [18, 30],
    wobble: [24, 50],
    spin: 0.01,
  },
  {
    keys: ["neb2_cyan", "neb2_rose", "neb2_magenta"],
    size: [440, 680],
    speed: [11, 18],
    alpha: [0.26, 0.38],
    depth: -38,
    dir: [Math.PI * 0.25, Math.PI * 0.75], // near clouds lean downward, like the falling stars
    breathe: [0.07, 0.12],
    period: [14, 24],
    wobble: [16, 36],
    spin: 0.016,
  },
];

const STAR_COLORS = [0xffffff, 0xffffff, 0xcfe8ff, 0x9fefff, 0xd6c8ff, 0xffd9f0, 0xffe39a];
const STAR_LAYERS = [
  { count: 70, speed: [8, 16], size: [0.6, 1.0], alpha: [0.25, 0.5], twinkle: 0.2 },
  { count: 55, speed: [24, 45], size: [0.9, 1.4], alpha: [0.4, 0.7], twinkle: 0.3 },
  { count: 35, speed: [70, 120], size: [1.2, 1.9], alpha: [0.6, 0.9], twinkle: 0.4 },
  { count: 14, speed: [160, 260], size: [1.8, 2.6], alpha: [0.8, 1], twinkle: 0.5, halo: true },
];

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const wrap01 = (v) => v - Math.floor(v);

// ---- procedural textures (drawn once on an offscreen canvas) ----
function makeNebulaTexture(scene, def) {
  if (scene.textures.exists(def.key)) return true;
  try {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // 'lighter' accumulates light the way real emission nebulae do
    ctx.globalCompositeOperation = "lighter";
    const pick = () => rgb(Phaser.Utils.Array.GetRandom(def.colors));

    // one soft gaussian-ish blob; squash/rot turn it into a stretched wisp of gas
    const blob = (cx, cy, rad, a, squash = 1, rot = 0) => {
      const [r, g, b] = pick();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(1, squash);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(0.3, `rgba(${r},${g},${b},${a * 0.62})`);
      grad.addColorStop(0.6, `rgba(${r},${g},${b},${a * 0.2})`);
      grad.addColorStop(0.85, `rgba(${r},${g},${b},${a * 0.05})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    };

    const c = size / 2;
    for (let i = 0; i < 9; i++) {
      blob(
        c + Phaser.Math.Between(-110, 110),
        c + Phaser.Math.Between(-110, 110),
        Phaser.Math.Between(90, 190),
        Phaser.Math.FloatBetween(0.16, 0.3)
      );
    }
    for (let i = 0; i < 5; i++) {
      blob(
        c + Phaser.Math.Between(-100, 100),
        c + Phaser.Math.Between(-100, 100),
        Phaser.Math.Between(120, 220),
        Phaser.Math.FloatBetween(0.1, 0.2),
        Phaser.Math.FloatBetween(0.28, 0.4),
        Math.random() * TAU
      );
    }
    blob(c + Phaser.Math.Between(-40, 40), c + Phaser.Math.Between(-40, 40), 75, 0.3); // luminous core

    // fade everything to zero well before the texture edge: no square outlines, ever
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(c, c, 0, c, c, c);
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(0.45, "rgba(0,0,0,0.9)");
    mask.addColorStop(0.7, "rgba(0,0,0,0.35)");
    mask.addColorStop(0.9, "rgba(0,0,0,0.05)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);

    // tiny alpha grain: 8-bit gradients on near-black backgrounds otherwise show banding
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 0) d[i] = Math.max(0, Math.min(255, d[i] + Math.random() * 6 - 3));
    }
    ctx.putImageData(img, 0, 0);

    scene.textures.addCanvas(def.key, canvas);
    return true;
  } catch (e) {
    return false;
  }
}

// deep navy at the top fading to near-black at the bottom
function makeBaseTexture(scene) {
  if (scene.textures.exists("bg_base")) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#0b1030");
    grad.addColorStop(0.5, "#070914");
    grad.addColorStop(1, "#03040a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    scene.textures.addCanvas("bg_base", canvas);
    return true;
  } catch (e) {
    return false;
  }
}

// soft horizontal band that keeps the centre play lane calm on wide screens
function makeLaneShadeTexture(scene) {
  if (scene.textures.exists("bg_laneshade")) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, "rgba(3,5,14,0)");
    grad.addColorStop(0.28, "rgba(3,5,14,0.38)");
    grad.addColorStop(0.72, "rgba(3,5,14,0.38)");
    grad.addColorStop(1, "rgba(3,5,14,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 4);
    scene.textures.addCanvas("bg_laneshade", canvas);
    return true;
  } catch (e) {
    return false;
  }
}

function makeGlowTexture(scene) {
  if (scene.textures.exists("bg_glow")) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    scene.textures.addCanvas("bg_glow", canvas);
    return true;
  } catch (e) {
    return false;
  }
}

function makeStreakTexture(scene) {
  if (scene.textures.exists("bg_streak")) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 6;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 6);
    scene.textures.addCanvas("bg_streak", canvas);
    return true;
  } catch (e) {
    return false;
  }
}

export default class CosmicBackground {
  constructor(scene) {
    this.scene = scene;
    scene.cameras.main.setBackgroundColor(PALETTE.space);

    this.nebOk = NEBULA_TEXTURES.map((d) => makeNebulaTexture(scene, d)).every(Boolean);
    this.baseOk = makeBaseTexture(scene);
    this.shadeOk = makeLaneShadeTexture(scene);
    this.glowOk = makeGlowTexture(scene);
    this.streakOk = makeStreakTexture(scene);

    this.createBase();
    this.createNebulae();
    this.createStars();
    this.createDust();
    this.shootTimer = Phaser.Math.Between(1500, 4000);
    this.streaks = [];
  }

  getLane() {
    const w = this.scene.scale.width;
    const laneW = Math.min(w, LANE_MAX);
    return { laneX: (w - laneW) / 2, laneW, w, wide: w > laneW + 240 };
  }

  // ---------- base + lane shade ----------
  createBase() {
    this.base = this.baseOk ? this.scene.add.image(0, 0, "bg_base").setOrigin(0).setDepth(-50) : null;
    this.shade = this.shadeOk ? this.scene.add.image(0, 0, "bg_laneshade").setDepth(-30) : null;
    this.dimNow = 1; // cloud opacity multiplier (eases toward 0.72 on narrow screens)
    this.shadeNow = 0; // lane shade opacity (eases toward 1 on wide screens)
    this.driftMul = 1; // drift speed multiplier (eases up with difficulty level)
  }

  // ---------- nebulae ----------
  // Every cloud follows a straight drift on a torus (it leaves one side and re-enters the
  // opposite side only once it is completely invisible), plus a slow sway, breathing scale,
  // breathing opacity and a tiny rotation. Nothing is ever reset, so nothing can pop.
  createNebulae() {
    this.nebulae = [];
    for (const L of NEBULA_LAYERS) {
      const count = L.keys.length;
      const keys = Phaser.Utils.Array.Shuffle([...L.keys]);
      for (let i = 0; i < count; i++) {
        const key = keys[i];
        const def = NEBULA_TEXTURES.find((d) => d.key === key);
        const size = Phaser.Math.FloatBetween(L.size[0], L.size[1]);

        let obj;
        let baseScale;
        if (this.nebOk) {
          baseScale = size / 512;
          obj = this.scene.add.image(0, 0, key).setScale(baseScale).setAngle(Phaser.Math.Between(0, 360));
          obj.setFlipX(Math.random() < 0.5);
        } else {
          baseScale = 1;
          obj = this.scene.add.circle(0, 0, size / 4, def.colors[0], 0.05); // fallback
        }
        obj.setBlendMode(ADD).setDepth(L.depth);

        // spread the drift directions inside a layer so neighbouring clouds never move together
        const frac = (i + Math.random() * 0.6) / count;
        const ang = L.dir[0] + (L.dir[1] - L.dir[0]) * frac;
        const spd = Phaser.Math.FloatBetween(L.speed[0], L.speed[1]);
        const wob = Phaser.Math.FloatBetween(L.wobble[0], L.wobble[1]);
        const per = Phaser.Math.FloatBetween(L.period[0], L.period[1]);

        this.nebulae.push({
          obj,
          half: size / 2,
          baseScale,
          base: Phaser.Math.FloatBetween(L.alpha[0], L.alpha[1]),
          u: Math.random(), // position along the wrap span, 0..1 (resize-proof)
          v: Math.random(),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          ax: wob,
          ay: wob * Phaser.Math.FloatBetween(0.6, 1),
          wx: TAU / Phaser.Math.FloatBetween(40, 80),
          wy: TAU / Phaser.Math.FloatBetween(50, 95),
          px: Math.random() * TAU,
          py: Math.random() * TAU,
          bs: Phaser.Math.FloatBetween(L.breathe[0], L.breathe[1]),
          bw: TAU / per,
          bp: Math.random() * TAU,
          ba: Phaser.Math.FloatBetween(0.12, 0.22),
          aw: TAU / (per * Phaser.Math.FloatBetween(0.8, 1.2)),
          ap: Math.random() * TAU,
          spin: Phaser.Math.FloatBetween(-L.spin, L.spin),
        });
      }
    }
  }

  updateNebulae(time, dt, level) {
    const { width: w, height: h } = this.scene.scale;
    const { laneW, wide } = this.getLane();
    const t = time / 1000;
    const step = Math.min(dt, 0.1); // a stalled tab must not teleport the clouds

    // ease these instead of switching them: no sudden change on level-up or window resize
    const k = Math.min(1, step * 0.8);
    this.driftMul += (1 + level * 0.06 - this.driftMul) * k;
    this.dimNow += ((wide ? 1 : 0.72) - this.dimNow) * k;
    this.shadeNow += ((wide ? 1 : 0) - this.shadeNow) * k;

    if (this.base) this.base.setDisplaySize(w, h);
    if (this.shade) {
      this.shade.setPosition(w / 2, h / 2).setDisplaySize(laneW * 1.3, h).setAlpha(this.shadeNow);
    }

    for (const n of this.nebulae) {
      // wrap margin: big enough that the cloud (max breathing + sway) is fully off-screen
      const m = n.half * 1.2 + Math.max(n.ax, n.ay);
      const spanX = w + 2 * m;
      const spanY = h + 2 * m;
      n.u = wrap01(n.u + (n.vx * this.driftMul * step) / spanX);
      n.v = wrap01(n.v + (n.vy * this.driftMul * step) / spanY);

      const x = -m + n.u * spanX + Math.sin(t * n.wx + n.px) * n.ax;
      const y = -m + n.v * spanY + Math.cos(t * n.wy + n.py) * n.ay;
      const scale = n.baseScale * (1 + n.bs * Math.sin(t * n.bw + n.bp));
      const alpha = n.base * this.dimNow * (1 + n.ba * Math.sin(t * n.aw + n.ap));

      n.obj.setPosition(x, y);
      n.obj.setScale(scale);
      n.obj.setRotation(n.obj.rotation + n.spin * step);
      n.obj.setAlpha(alpha);
    }
  }

  // ---------- stars ----------
  createStars() {
    const { width, height } = this.scene.scale;
    this.stars = [];
    for (const L of STAR_LAYERS) {
      for (let i = 0; i < L.count; i++) {
        const color = Phaser.Utils.Array.GetRandom(STAR_COLORS);
        const s = this.scene.add
          .circle(
            Phaser.Math.Between(0, width),
            Phaser.Math.Between(0, height),
            Phaser.Math.FloatBetween(L.size[0], L.size[1]),
            color
          )
          .setDepth(-20);
        s.speed = Phaser.Math.FloatBetween(L.speed[0], L.speed[1]);
        s.base = Phaser.Math.FloatBetween(L.alpha[0], L.alpha[1]);
        s.twinkles = Math.random() < L.twinkle;
        s.ph = Math.random() * 6.28;
        s.tw = Phaser.Math.Between(500, 1500);
        if (L.halo && this.glowOk) {
          s.halo = this.scene.add
            .image(s.x, s.y, "bg_glow")
            .setTint(color)
            .setScale(0.45)
            .setBlendMode(ADD)
            .setDepth(-21);
        }
        this.stars.push(s);
      }
    }
  }

  // ---------- golden stardust ----------
  createDust() {
    const { width, height } = this.scene.scale;
    this.dust = [];
    const colors = [PALETTE.gold, PALETTE.gold, PALETTE.gold, PALETTE.pink, PALETTE.cyan];
    for (let i = 0; i < 20; i++) {
      const color = Phaser.Utils.Array.GetRandom(colors);
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const d = this.glowOk
        ? this.scene.add.image(x, y, "bg_glow").setTint(color).setScale(Phaser.Math.FloatBetween(0.12, 0.3))
        : this.scene.add.circle(x, y, 2, color);
      d.setBlendMode(ADD).setDepth(-12);
      d.vy = Phaser.Math.FloatBetween(20, 55);
      d.sway = Phaser.Math.FloatBetween(8, 24);
      d.ph = Math.random() * 6.28;
      d.baseX = x;
      d.base = Phaser.Math.FloatBetween(0.3, 0.7);
      this.dust.push(d);
    }
  }

  // ---------- shooting stars ----------
  spawnShootingStar() {
    const { width, height } = this.scene.scale;
    const speed = Phaser.Math.Between(600, 1000);
    const ang = Phaser.Math.FloatBetween(0.6, 1.1);
    const dirX = Math.random() < 0.5 ? 1 : -1;
    const vx = Math.cos(ang) * speed * dirX;
    const vy = Math.sin(ang) * speed;
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(-40, height * 0.4);
    const color = Phaser.Utils.Array.GetRandom([0xffffff, PALETTE.cyan, PALETTE.gold, PALETTE.pink]);
    const rot = Math.atan2(vy, vx);
    const objs = [];

    if (this.streakOk && this.glowOk) {
      const trail = this.scene.add
        .image(x, y, "bg_streak")
        .setOrigin(1, 0.5)
        .setRotation(rot)
        .setScale(Phaser.Math.FloatBetween(0.6, 1.1), 1)
        .setTint(color);
      const head = this.scene.add.image(x, y, "bg_glow").setScale(0.35).setTint(color);
      objs.push(trail, head);
    } else {
      objs.push(this.scene.add.rectangle(x, y, 90, 2, color).setRotation(rot));
    }
    for (const o of objs) o.setBlendMode(ADD).setDepth(-10);
    this.streaks.push({ objs, vx, vy, life: 1.1, max: 1.1 });
  }

  // ---------- update ----------
  update(time, delta, dt, level = 0) {
    const { width, height } = this.scene.scale;
    const speedMul = 1 + level * 0.12;

    this.updateNebulae(time, dt, level);

    for (const s of this.stars) {
      s.y += s.speed * speedMul * dt;
      if (s.y > height + 4) {
        s.y = -4;
        s.x = Phaser.Math.Between(0, width);
      }
      const a = s.twinkles ? s.base * (0.55 + 0.45 * Math.sin(time / s.tw + s.ph)) : s.base;
      s.setAlpha(a);
      if (s.halo) {
        s.halo.setPosition(s.x, s.y);
        s.halo.setAlpha(a * 0.5);
      }
    }

    for (const d of this.dust) {
      d.y += d.vy * dt;
      if (d.y > height + 10) {
        d.y = -10;
        d.baseX = Phaser.Math.Between(0, width);
      }
      d.x = d.baseX + Math.sin(time / 1500 + d.ph) * d.sway;
      d.setAlpha(d.base * (0.6 + 0.4 * Math.sin(time / 600 + d.ph)));
    }

    this.shootTimer -= delta;
    if (this.shootTimer <= 0) {
      this.spawnShootingStar();
      this.shootTimer = Phaser.Math.Between(2500, 6000);
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const st = this.streaks[i];
      st.life -= dt;
      if (st.life <= 0) {
        for (const o of st.objs) o.destroy();
        this.streaks.splice(i, 1);
        continue;
      }
      const a = Math.sin(Math.PI * (1 - st.life / st.max));
      for (const o of st.objs) {
        o.x += st.vx * dt;
        o.y += st.vy * dt;
        o.setAlpha(a * 0.95);
      }
    }
  }
}