// Centralized difficulty for Cosmic Rush. All tuning lives in LEVELS.
// The scene calls director.update() every frame and spawns whatever it returns.

export const LEVEL_SECONDS = 25; // new level every 25 s of survival time
const BLEND_SECONDS = 5;         // ease into new values (no sudden jumps)
const MAX_SPEED = 620;           // hard cap on hazard fall speed (px/s)
const MIN_INTERVAL = 600;        // hard cap on spawn rate (ms between formations)

// speed: multiplier on base fall speed | interval: ms between formations
// gap: safe gap as a fraction of lane width | maxActive: hazards alive at once
export const LEVELS = [
  { speed: 1.0,  interval: 1300, gap: 0.40, maxActive: 8,  patterns: { scatter: 1 } },
  { speed: 1.1,  interval: 1150, gap: 0.38, maxActive: 9,  patterns: { scatter: 1 } },
  { speed: 1.18, interval: 1000, gap: 0.36, maxActive: 16, patterns: { scatter: 2, alternate: 1 } },
  { speed: 1.28, interval: 900,  gap: 0.34, maxActive: 18, patterns: { scatter: 2, alternate: 1, diagonal: 1 } },
  { speed: 1.36, interval: 820,  gap: 0.31, maxActive: 20, patterns: { scatter: 1, alternate: 1, diagonal: 1 } },
  { speed: 1.45, interval: 760,  gap: 0.30, maxActive: 22, patterns: { scatter: 1, alternate: 1, diagonal: 1 } },
]; // last entry = maximum difficulty, held forever

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

export default class DifficultyDirector {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;            // survival seconds (only advances when update() is called)
    this.cooldown = 1200;  // grace period before the first hazard
    this.lastLevel = 1;
    this.leveledUp = false;
    this.side = 1;
    this.lastGap = null;   // x of the previous row's gap
    this.lastRowT = -99;
  }

  get level() {
    return Math.min(Math.floor(this.t / LEVEL_SECONDS), LEVELS.length - 1) + 1;
  }

  // Returns true once after each level increase (use it to show the banner).
  consumeLevelUp() {
    const v = this.leveledUp;
    this.leveledUp = false;
    return v;
  }

  params() {
    const i = this.level - 1;
    const cur = LEVELS[i];
    if (i === 0) return cur;
    const prev = LEVELS[i - 1];
    const k = clamp((this.t - i * LEVEL_SECONDS) / BLEND_SECONDS, 0, 1);
    return {
      speed: lerp(prev.speed, cur.speed, k),
      interval: Math.max(MIN_INTERVAL, lerp(prev.interval, cur.interval, k)),
      gap: lerp(prev.gap, cur.gap, k),
      maxActive: cur.maxActive,
      patterns: cur.patterns,
    };
  }

  pick(weights) {
    const entries = Object.entries(weights);
    let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [name, w] of entries) {
      if ((r -= w) <= 0) return name;
    }
    return entries[0][0];
  }

  /**
   * ctx = { minX, maxX, size, shipX, shipY, shipW, shipSpeed, baseSpeed, active }
   * Returns an array of { x, y, vx, vy } to spawn (usually empty).
   */
  update(deltaMs, ctx) {
    this.t += deltaMs / 1000;
    const lvl = this.level;
    if (lvl > this.lastLevel) this.leveledUp = true;
    this.lastLevel = lvl;

    this.cooldown -= deltaMs;
    if (this.cooldown > 0) return [];

    const p = this.params();
    const vy = Math.min(ctx.baseSpeed * p.speed, MAX_SPEED);
    const pattern = this.pick(p.patterns);
    const snap = { lastGap: this.lastGap, lastRowT: this.lastRowT, side: this.side };

    let wait = p.interval * rand(0.9, 1.1);
    let out;
    if (pattern === "diagonal") out = this.diagonal(ctx, p, vy);
    else if (pattern === "alternate") {
      out = this.row(ctx, p, vy, true);
      wait *= 1.4;
    } else out = this.scatter(ctx, p, vy);

    // Hazard cap counts the whole formation. If it doesn't fit, skip it and retry soon.
    if (ctx.active + out.length > p.maxActive) {
      Object.assign(this, snap);
      this.cooldown = 250;
      return [];
    }
    this.cooldown = wait;
    return out;
  }

  // 1-2 hazards, always spawned above the screen (never on the ship).
  // Never lands in the gap of a row that is still falling.
  scatter(ctx, p, vy) {
    const { minX, maxX, size } = ctx;
    const gapPx = Math.max((maxX - minX) * p.gap, ctx.shipW * 2.4);
    const recentRow = this.lastGap !== null && this.t - this.lastRowT < 2;
    const clear = (x) => !recentRow || Math.abs(x - this.lastGap) > gapPx / 2 + size;

    let x1 = null;
    for (let i = 0; i < 6 && x1 === null; i++) {
      const x = rand(minX + size / 2, maxX - size / 2);
      if (clear(x)) x1 = x;
    }
    if (x1 === null) return [];

    const out = [{ x: x1, y: -size, vx: 0, vy }];
    if (this.level >= 3 && Math.random() < 0.35) {
      const x2 = rand(minX + size / 2, maxX - size / 2);
      if (Math.abs(x2 - x1) >= gapPx * 0.6 && clear(x2)) {
        out.push({ x: x2, y: -size - 140, vx: 0, vy });
      }
    }
    return out;
  }

  // Row of hazards with one gap. The gap is always wide enough for the ship
  // and always reachable at the ship's speed.
  row(ctx, p, vy, alternate) {
    const { minX, maxX, size, shipX, shipY, shipW, shipSpeed } = ctx;
    const laneW = maxX - minX;
    const gapW = Math.max(laneW * p.gap, shipW * 2.4);

    let c;
    if (alternate) {
      this.side *= -1;
      c = this.side < 0 ? minX + gapW / 2 + laneW * 0.08 : maxX - gapW / 2 - laneW * 0.08;
    } else {
      c = rand(minX + gapW / 2, maxX - gapW / 2);
    }

    const fallTime = (shipY + size) / vy;
    const sinceRow = this.t - this.lastRowT;
    const inFlight = this.lastGap !== null && sinceRow < fallTime;
    const ref = inFlight ? this.lastGap : shipX;
    const travelTime = inFlight ? sinceRow : fallTime;
    const maxShift = Math.max(shipW * 1.5, shipSpeed * travelTime * 0.6);
    c = clamp(c, ref - maxShift, ref + maxShift);
    c = clamp(c, minX + gapW / 2, maxX - gapW / 2);

    this.lastGap = c;
    this.lastRowT = this.t;

    const out = [];
    for (let x = minX + size / 2; x <= maxX - size / 2; x += size * 1.05) {
      if (Math.abs(x - c) > gapW / 2 + size / 2) out.push({ x, y: -size, vx: 0, vy });
    }
    return out;
  }

  // Meteors crossing at an angle. Not allowed right after a row (no overlap),
  // and skipped if they would land on the ship's current position.
  diagonal(ctx, p, vy) {
    if (this.t - this.lastRowT < 1.4) return this.scatter(ctx, p, vy);
    const { minX, maxX, size, shipX, shipY, shipW } = ctx;
    const count = this.level >= 5 ? 2 : 1;
    const gapPx = Math.max((maxX - minX) * p.gap, shipW * 2.4);
    const out = [];
    for (let i = 0; i < count; i++) {
      this.side *= -1;
      const dir = this.side;
      const vx = dir * vy * rand(0.35, 0.5);
      const y0 = -size - i * 220;
      const x0 =
        dir > 0
          ? rand(minX, minX + (maxX - minX) * 0.4)
          : rand(maxX - (maxX - minX) * 0.4, maxX);
      const t = (shipY - y0) / vy;
      if (Math.abs(x0 + vx * t - shipX) < gapPx * 0.6) continue;
      out.push({ x: x0, y: y0, vx, vy });
    }
    return out;
  }
}