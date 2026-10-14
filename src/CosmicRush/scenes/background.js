import Phaser from "phaser";

const ADD = Phaser.BlendModes.ADD;
const LANE_MAX = 480;

export const PALETTE = {
  space: "#070914",
  violet: 0x7651e8,
  cyan: 0x19ddf5,
  pink: 0xff5bc8,
  gold: 0xffd56a,
  teal: 0x00cfc1,
};

const NEBULA_DEFS = [
  { key: "neb_violet", color: PALETTE.violet },
  { key: "neb_cyan", color: PALETTE.cyan },
  { key: "neb_teal", color: PALETTE.teal },
  { key: "neb_pink", color: PALETTE.pink },
];

const STAR_COLORS = [0xffffff, 0xffffff, 0xcfe8ff, 0x9fefff, 0xd6c8ff, 0xffd9f0, 0xffe39a];
const STAR_LAYERS = [
  { count: 70, speed: [8, 16], size: [0.6, 1.0], alpha: [0.25, 0.5], twinkle: 0.2 },
  { count: 55, speed: [24, 45], size: [0.9, 1.4], alpha: [0.4, 0.7], twinkle: 0.3 },
  { count: 35, speed: [70, 120], size: [1.2, 1.9], alpha: [0.6, 0.9], twinkle: 0.4 },
  { count: 14, speed: [160, 260], size: [1.8, 2.6], alpha: [0.8, 1], twinkle: 0.5, halo: true },
];

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// ---- procedural textures (drawn once on an offscreen canvas) ----
function makeNebulaTexture(scene, key, color) {
  if (scene.textures.exists(key)) return true;
  try {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const [r, g, b] = rgb(color);
    for (let i = 0; i < 6; i++) {
      const cx = size / 2 + Phaser.Math.Between(-90, 90);
      const cy = size / 2 + Phaser.Math.Between(-90, 90);
      const rad = Phaser.Math.Between(110, 210);
      const a = Phaser.Math.FloatBetween(0.16, 0.3);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(0.25, `rgba(${r},${g},${b},${a * 0.7})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.35})`);
      grad.addColorStop(0.75, `rgba(${r},${g},${b},${a * 0.1})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    scene.textures.addCanvas(key, canvas);
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

    this.nebOk = NEBULA_DEFS.map((d) => makeNebulaTexture(scene, d.key, d.color)).every(Boolean);
    this.glowOk = makeGlowTexture(scene);
    this.streakOk = makeStreakTexture(scene);

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

  // ---------- nebulae ----------
  createNebulae() {
    const { height } = this.scene.scale;
    this.nebulae = [];
    // far layer: huge, slow, faint. near layer: smaller, a bit faster
    const layers = [
      { count: 4, size: [750, 1100], speed: [4, 8], alpha: 0.5, depth: -40 },
      { count: 3, size: [420, 650], speed: [10, 18], alpha: 0.4, depth: -35 },
    ];
    let n = 0;
    for (const L of layers) {
      for (let i = 0; i < L.count; i++) {
        const def = NEBULA_DEFS[n++ % NEBULA_DEFS.length];
        const size = Phaser.Math.Between(L.size[0], L.size[1]);
        let obj;
        if (this.nebOk) {
          obj = this.scene.add.image(0, 0, def.key).setScale(size / 512).setAngle(Phaser.Math.Between(0, 360));
          obj.setFlipX(Math.random() < 0.5);
        } else {
          obj = this.scene.add.circle(0, 0, size / 4, def.color, 0.05); // fallback
        }
        obj.setBlendMode(ADD).setDepth(L.depth);
        const neb = {
          obj,
          half: size / 2,
          base: L.alpha,
          dim: 1,
          vy: Phaser.Math.FloatBetween(L.speed[0], L.speed[1]),
          vx: Phaser.Math.FloatBetween(-3, 3),
          spin: Phaser.Math.FloatBetween(-0.012, 0.012),
          ph: Math.random() * 6.28,
          x: 0,
          y: Phaser.Math.Between(-size / 2, height),
        };
        this.placeNebulaX(neb);
        this.nebulae.push(neb);
      }
    }
  }

  // keep the centre lane darker: on wide screens clouds sit on the sides
  placeNebulaX(neb) {
    const { laneX, laneW, w, wide } = this.getLane();
    if (wide) {
      neb.x = Math.random() < 0.5 ? Phaser.Math.Between(0, laneX) : Phaser.Math.Between(laneX + laneW, w);
      neb.dim = 1;
    } else {
      neb.x = Phaser.Math.Between(0, w);
      neb.dim = 0.6; // narrow screens: fainter so gameplay stays readable
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

    for (const n of this.nebulae) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (n.y - n.half > height) {
        n.y = -n.half;
        this.placeNebulaX(n);
      }
      n.obj.setPosition(n.x, n.y);
      n.obj.setRotation(n.obj.rotation + n.spin * dt);
      n.obj.setAlpha(n.base * n.dim * (0.85 + 0.15 * Math.sin(time / 4000 + n.ph)));
    }

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