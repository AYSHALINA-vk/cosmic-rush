import Phaser from "phaser";

const ADD = Phaser.BlendModes.ADD;
const LANE_MAX = 480;

export const PALETTE = {
  space: "#03040a",
  violet: 0x7651e8,
  cyan: 0x19ddf5,
  pink: 0xff5bc8,
  gold: 0xffd56a,
  teal: 0x00cfc1,
};

// Everything here sits at negative depth: ships, asteroids, HUD (depth 2+) and the
// game-over screen (depth 20+) always draw on top.
const DEPTH = { space: -60, farNeb: -45, midNeb: -40, wisp: -38, nearNeb: -35, dust: -12, streak: -10, vignette: -8 };

// outer = colour of the thin gas, inner = colour of the luminous core
const NEBULA_DEFS = [
  { key: "cr_neb_violet", outer: 0x6a18ff, inner: 0xc77dff, seed: 11 },
  { key: "cr_neb_blue", outer: 0x1038ff, inner: 0x4aa8ff, seed: 23 },
  { key: "cr_neb_cyan", outer: 0x00a2ff, inner: 0x5ffaff, seed: 37 },
  { key: "cr_neb_magenta", outer: 0xd810c8, inner: 0xff6ad8, seed: 51 },
  { key: "cr_neb_indigo", outer: 0x3a1fb0, inner: 0xa085ff, seed: 67 },
];
const WISP_DEFS = [
  { key: "cr_wisp_a", outer: 0x8a4dff, inner: 0xd9a8ff, seed: 83 },
  { key: "cr_wisp_b", outer: 0x10c0ff, inner: 0xa8f4ff, seed: 97 },
];

// each layer drifts at its own speed: far = slow & huge, near = faster & smaller (parallax)
const NEBULA_LAYERS = [
  { kind: "cloud", keys: ["cr_neb_indigo", "cr_neb_blue", "cr_neb_violet"], size: [950, 1350], speed: [3, 6], alpha: 0.78, depth: DEPTH.farNeb, spin: 0.006 },
  { kind: "cloud", keys: ["cr_neb_magenta", "cr_neb_cyan", "cr_neb_violet"], size: [620, 900], speed: [8, 13], alpha: 0.68, depth: DEPTH.midNeb, spin: 0.01 },
  { kind: "wisp", keys: ["cr_wisp_a", "cr_wisp_b", "cr_wisp_a"], size: [700, 1000], speed: [6, 11], alpha: 0.5, depth: DEPTH.wisp, spin: -0.02 },
  { kind: "cloud", keys: ["cr_neb_cyan", "cr_neb_magenta", "cr_neb_blue"], size: [380, 560], speed: [15, 24], alpha: 0.58, depth: DEPTH.nearNeb, spin: 0.015 },
];

const LANE_DIM = 0.55; // clouds crossing the play lane are slightly calmer so gameplay stays readable
const TEX = 256; // nebula texture size (scaled up ~4x: gas is soft, so it stays smooth)

const STAR_COLORS = [0xffffff, 0xffffff, 0xcfe8ff, 0x9fefff, 0xd6c8ff, 0xffd9f0, 0xffe39a];
const STAR_LAYERS = [
  { count: 70, speed: [8, 16], size: [0.6, 1.0], alpha: [0.25, 0.5], twinkle: 0.2 },
  { count: 55, speed: [24, 45], size: [0.9, 1.4], alpha: [0.4, 0.7], twinkle: 0.3 },
  { count: 35, speed: [70, 120], size: [1.2, 1.9], alpha: [0.6, 0.9], twinkle: 0.4 },
  { count: 14, speed: [160, 260], size: [1.8, 2.6], alpha: [0.8, 1], twinkle: 0.5, halo: true },
];

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);

// ---------- procedural noise (pure maths, no Phaser: easy to test) ----------
function makeNoise(seed) {
  const N = 64;
  let s = seed >>> 0 || 1;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    grid[i] = s / 4294967296;
  }
  const val = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const x0 = xi & (N - 1);
    const x1 = (xi + 1) & (N - 1);
    const y0 = yi & (N - 1);
    const y1 = (yi + 1) & (N - 1);
    const top = grid[y0 * N + x0] + (grid[y0 * N + x1] - grid[y0 * N + x0]) * xf;
    const bot = grid[y1 * N + x0] + (grid[y1 * N + x1] - grid[y1 * N + x0]) * xf;
    return top + (bot - top) * yf;
  };
  // fractal Brownian motion: layered octaves give wispy, gas-like detail
  return (x, y, oct) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * val(x * f, y * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

// Returns RGBA bytes for one nebula sprite: a domain-warped cloud with a hot luminous core
// ("cloud"), or thin swirling filaments ("wisp").
export function renderNebulaPixels(size, def, kind) {
  const fbm = makeNoise(def.seed);
  const out = new Uint8ClampedArray(size * size * 4);
  const [or, og, ob] = rgb(def.outer);
  const [ir, ig, ib] = rgb(def.inner);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(u, v);
      if (r >= 1) continue;
      const edge = 1 - smooth(clamp((r - 0.5) / 0.5, 0, 1)); // fades to nothing before the texture edge

      let a;
      let k; // 0 = outer colour, 1 = inner colour
      let white = 0;
      if (kind === "cloud") {
        const wx = fbm(u * 1.6 + 3.1, v * 1.6 + 7.7, 3);
        const wy = fbm(u * 1.6 + 9.3, v * 1.6 + 1.9, 3);
        const n = fbm(u * 2.4 + wx * 1.8, v * 2.4 + wy * 1.8, 5);
        const dens = clamp((n - 0.3) * 2.4, 0, 1);
        const core = Math.exp(-r * r * 14);
        a = Math.min(1, dens * edge * 0.92 + core * 0.4 * edge);
        k = clamp(dens * 0.6 + core * 0.9, 0, 1);
        white = core * 0.08;
      } else {
        const ang = Math.atan2(v, u) + r * 2.8; // spiral twist
        const su = Math.cos(ang) * r;
        const sv = Math.sin(ang) * r;
        const wx = fbm(su * 2 + 5.2, sv * 2 + 1.3, 3);
        const n = fbm(su * 3.2 + wx * 1.4, sv * 3.2 + wx * 1.1, 4);
        const ridge = Math.pow(1 - Math.abs(2 * n - 1), 5);
        a = clamp(ridge * edge * 0.8, 0, 1);
        k = clamp(ridge * 1.2, 0, 1);
        white = ridge * 0.06;
      }

      const i = (y * size + x) * 4;
      let R = or + (ir - or) * k;
      let G = og + (ig - og) * k;
      let B = ob + (ib - ob) * k;
      R += (255 - R) * white;
      G += (255 - G) * white;
      B += (255 - B) * white;
      out[i] = R;
      out[i + 1] = G;
      out[i + 2] = B;
      out[i + 3] = a * 255;
    }
  }
  return out;
}

// ---------- textures (each is drawn once, then only moved/scaled/faded) ----------
function makeNebulaTexture(scene, def, kind) {
  if (scene.textures.exists(def.key)) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = TEX;
    canvas.height = TEX;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(TEX, TEX);
    img.data.set(renderNebulaPixels(TEX, def, kind));
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(def.key, canvas);
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

// deep-space base: near-black with a hint of indigo toward the bottom
function makeSpaceTexture(scene) {
  if (scene.textures.exists("cr_space")) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#02030a");
    grad.addColorStop(0.55, "#05071a");
    grad.addColorStop(1, "#0a0824");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    scene.textures.addCanvas("cr_space", canvas);
    return true;
  } catch (e) {
    return false;
  }
}

// dark edges pull the eye to the centre and blend the clouds into black space
function makeVignetteTexture(scene) {
  if (scene.textures.exists("cr_vignette")) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
    grad.addColorStop(0, "rgba(2,3,10,0)");
    grad.addColorStop(1, "rgba(2,3,10,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    scene.textures.addCanvas("cr_vignette", canvas);
    return true;
  } catch (e) {
    return false;
  }
}

export default class CosmicBackground {
  constructor(scene) {
    this.scene = scene;
    scene.cameras.main.setBackgroundColor(PALETTE.space);

    this.reduceMotion = !!scene.reduceMotion;
    this.motion = this.reduceMotion ? 0.3 : 1; // reduced-motion players still get a gentle drift
    const { width, height } = scene.scale;
    this.small = Math.min(width, height) < 700; // phones: fewer sprites for steady frame rate

    this.nebOk = NEBULA_DEFS.every((d) => makeNebulaTexture(scene, d, "cloud")) && WISP_DEFS.every((d) => makeNebulaTexture(scene, d, "wisp"));
    this.glowOk = makeGlowTexture(scene);
    this.streakOk = makeStreakTexture(scene);
    this.spaceOk = makeSpaceTexture(scene);
    this.vignetteOk = makeVignetteTexture(scene);

    this.createBackdrop();
    this.createNebulae();
    this.createStars();
    this.createDust();
    this.shootTimer = Phaser.Math.Between(1500, 4000);
    this.streaks = [];

    this.onResize = () => this.handleResize();
    scene.scale.on("resize", this.onResize);
    scene.events.once("shutdown", () => scene.scale.off("resize", this.onResize));
  }

  getLane() {
    const w = this.scene.scale.width;
    const laneW = Math.min(w, LANE_MAX);
    return { laneX: (w - laneW) / 2, laneW, w, wide: w > laneW + 240 };
  }

  // ---------- base + vignette ----------
  createBackdrop() {
    const { width, height } = this.scene.scale;
    if (this.spaceOk) {
      this.space = this.scene.add.image(0, 0, "cr_space").setOrigin(0).setDisplaySize(width, height).setDepth(DEPTH.space);
    }
    if (this.vignetteOk) {
      this.vignette = this.scene.add.image(0, 0, "cr_vignette").setOrigin(0).setDisplaySize(width, height).setDepth(DEPTH.vignette);
    }
  }

  // ---------- nebulae ----------
  createNebulae() {
    const { width, height } = this.scene.scale;
    this.nebulae = [];
    this.sizeScale = clamp(Math.max(width, height) / 1000, 0.75, 1.3);

    for (const L of NEBULA_LAYERS) {
      const count = this.small ? Math.max(2, L.keys.length - 1) : L.keys.length;
      for (let i = 0; i < count; i++) {
        const key = L.keys[i % L.keys.length];
        const size = Phaser.Math.Between(L.size[0], L.size[1]) * this.sizeScale;
        let obj;
        if (this.nebOk) {
          obj = this.scene.add.image(0, 0, key).setAngle(Phaser.Math.Between(0, 360));
          obj.setFlipX(Math.random() < 0.5);
        } else {
          obj = this.scene.add.circle(0, 0, size / 4, PALETTE.violet, 0.08); // fallback if textures failed
        }
        obj.setBlendMode(ADD).setDepth(L.depth);
        const baseScale = this.nebOk ? size / TEX : 1;
        obj.setScale(baseScale);
        const neb = {
          obj,
          half: size / 2,
          baseScale,
          base: L.alpha,
          lane: 1,
          vy: Phaser.Math.FloatBetween(L.speed[0], L.speed[1]),
          vx: Phaser.Math.FloatBetween(-4, 4),
          spin: L.spin * Phaser.Math.FloatBetween(0.7, 1.3),
          ph: Math.random() * 6.28,
          breath: Phaser.Math.FloatBetween(5000, 8500), // ms per breathing cycle
          x: Phaser.Math.Between(0, width),
          y: Phaser.Math.Between(-size / 2, height + size / 4),
        };
        this.nebulae.push(neb);
      }
    }
  }

  // re-enter from a fresh spot after drifting off the bottom
  respawnNebula(neb) {
    const { width } = this.scene.scale;
    neb.x = Phaser.Math.Between(0, width);
    neb.y = -neb.half;
  }

  // ---------- stars ----------
  createStars() {
    const { width, height } = this.scene.scale;
    // fewer stars on small screens
    const density = clamp((width * height) / (1280 * 720), 0.45, 1);
    this.stars = [];
    for (const L of STAR_LAYERS) {
      const count = Math.round(L.count * density);
      for (let i = 0; i < count; i++) {
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
    const count = this.small ? 12 : 20;
    for (let i = 0; i < count; i++) {
      const color = Phaser.Utils.Array.GetRandom(colors);
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const d = this.glowOk
        ? this.scene.add.image(x, y, "bg_glow").setTint(color).setScale(Phaser.Math.FloatBetween(0.12, 0.3))
        : this.scene.add.circle(x, y, 2, color);
      d.setBlendMode(ADD).setDepth(DEPTH.dust);
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
    for (const o of objs) o.setBlendMode(ADD).setDepth(DEPTH.streak);
    this.streaks.push({ objs, vx, vy, life: 1.1, max: 1.1 });
  }

  // ---------- resize ----------
  handleResize() {
    const { width, height } = this.scene.scale;
    if (this.space) this.space.setDisplaySize(width, height);
    if (this.vignette) this.vignette.setDisplaySize(width, height);
    // anything now outside the new width is respread so the screen is never half-empty
    for (const s of this.stars) {
      if (s.x > width) s.x = Phaser.Math.Between(0, width);
      if (s.y > height) s.y = Phaser.Math.Between(0, height);
    }
    for (const d of this.dust) {
      if (d.baseX > width) d.baseX = Phaser.Math.Between(0, width);
    }
    for (const n of this.nebulae) {
      if (n.x > width) n.x = Phaser.Math.Between(0, width);
    }
  }

  // ---------- update ----------
  update(time, delta, dt, level = 0) {
    const { width, height } = this.scene.scale;
    dt = Math.min(dt, 0.05); // a tab returning from the background must not make clouds jump
    const m = this.motion;
    const nebMul = (1 + level * 0.05) * m;
    const starMul = 1 + level * 0.12;
    const { laneW } = this.getLane();
    const laneHalf = laneW / 2;
    const cx = width / 2;

    for (const n of this.nebulae) {
      n.x += n.vx * dt * m;
      n.y += n.vy * dt * nebMul;
      if (n.y - n.half > height) this.respawnNebula(n);

      // slow breathing: glow swells and fades, size swells very slightly
      const b = Math.sin((time / n.breath) * 6.2832 + n.ph);
      // calmer where a cloud sits over the play lane, full strength on the sides
      const t = clamp((Math.abs(n.x - cx) - laneHalf * 0.4) / (laneHalf * 0.9), 0, 1);
      const lane = LANE_DIM + (1 - LANE_DIM) * smooth(t);

      n.obj.setPosition(n.x, n.y);
      n.obj.setRotation(n.obj.rotation + n.spin * dt * m);
      n.obj.setScale(n.baseScale * (1 + 0.035 * b));
      n.obj.setAlpha(n.base * lane * (0.85 + 0.15 * b));
    }

    for (const s of this.stars) {
      s.y += s.speed * starMul * dt;
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
      if (!this.reduceMotion) this.spawnShootingStar();
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