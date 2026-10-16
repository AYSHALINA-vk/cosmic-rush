// Local-only progression: ranks, daily missions, badges, Supernova scores.
// Everything lives in this browser's localStorage. Nothing is sent anywhere.
import { CONSTELLATIONS } from "../scenes/constellations";

const KEY = "cosmicRushProgressV1";
const SN_KEY = "cosmicRushSupernovaBoardV1";
const MAX_ENTRIES = 50;

export const SWEEP_XP = 200; // all three daily missions done
export const BADGE_XP = 75;
const STREAK_XP = 25; // per streak day (max 5), paid on the first mission completed each day
const SUPERNOVA_XP_MULT = 1.5;

export const MODES = {
  classic: {
    key: "classic",
    label: "CLASSIC",
    color: 0x19ddf5,
    blurb: "CLASSIC · 3 LIVES · STANDARD THREAT CURVE",
  },
  supernova: {
    key: "supernova",
    label: "SUPERNOVA",
    color: 0xff5bc8,
    blurb: "SUPERNOVA · 2 LIVES · FASTER THREATS · 1.5× XP · OWN LEADERBOARD",
  },
};

export const RANKS = [
  { name: "CADET", xp: 0, color: 0x00e5ff },
  { name: "PILOT", xp: 400, color: 0x4dffb8 },
  { name: "NAVIGATOR", xp: 1200, color: 0xa58bff },
  { name: "COMMANDER", xp: 2600, color: 0xffd56a },
  { name: "CAPTAIN", xp: 4800, color: 0xff5bc8 },
  { name: "ADMIRAL", xp: 8000, color: 0xfff3b0 },
  { name: "GALACTIC LEGEND", xp: 13000, color: 0xffffff },
];

export function rankFor(xp) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  const rank = RANKS[index];
  const next = RANKS[index + 1] || null;
  const into = xp - rank.xp;
  const span = next ? next.xp - rank.xp : 0;
  return { index, rank, next, into, span, pct: next ? Math.min(1, into / span) : 1 };
}

// ---------- storage ----------
const blank = () => ({
  v: 1,
  xp: 0,
  games: 0,
  mode: "classic",
  totals: { stardust: 0, constellations: 0, crew: 0, survival: 0, distance: 0, dailyDone: 0 },
  best: {
    classic: { score: 0, survival: 0, distance: 0 },
    supernova: { score: 0, survival: 0, distance: 0 },
  },
  conSeen: [],
  badges: {},
  daily: { date: "", vals: {}, done: {}, sweep: false },
  streak: { count: 0, last: "" },
});

// fills in anything missing so older saves keep working
function merge(base, saved) {
  if (!saved || typeof saved !== "object") return base;
  const out = { ...base };
  for (const k of Object.keys(base)) {
    const b = base[k];
    const s = saved[k];
    if (s === undefined) continue;
    if (Array.isArray(b)) out[k] = Array.isArray(s) ? s : b;
    else if (b && typeof b === "object") {
      if (Object.keys(b).length) out[k] = merge(b, s);
      else out[k] = s && typeof s === "object" ? s : b; // free-form maps (vals, done, badges)
    } else out[k] = s;
  }
  return out;
}

let mem = null; // fallback when localStorage is blocked

function load() {
  let saved = mem;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) {
    /* storage blocked or corrupt: use memory copy */
  }
  return merge(blank(), saved);
}

function save(p) {
  mem = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    /* ignore */
  }
}

// ---------- dates (the player's local calendar day) ----------
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yesterdayKey = () => {
  const d = new Date();
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
};
export function msUntilReset() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
}

// seeded random numbers: the same date always gives the same missions
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- daily missions ----------
const fmt = (n) => n.toLocaleString();
const crewCount = (r) => ((r.crew && r.crew.stella) || 0) + ((r.crew && r.crew.fox) || 0) + ((r.crew && r.crew.luma) || 0);
const TIER_NAMES = ["EASY", "MEDIUM", "HARD"];
const TIER_XP = [60, 110, 200];

// kind "max" = best value in a single run today, "sum" = running total today
const POOL = [
  { metric: "score", kind: "max", targets: [1500, 3000, 5000], text: (n) => `Score ${fmt(n)} in one run`, get: (r) => r.score },
  { metric: "survive", kind: "max", targets: [45, 80, 120], text: (n) => `Survive ${n} seconds in one run`, get: (r) => r.survival },
  { metric: "distance", kind: "max", targets: [2500, 4500, 7500], text: (n) => `Travel ${fmt(n)} m in one run`, get: (r) => r.distance },
  { metric: "threat", kind: "max", targets: [3, 4, 5], text: (n) => `Reach Threat Level ${n}`, get: (r) => r.threat },
  { metric: "noHit", kind: "max", targets: [25, 45, 70], text: (n) => `Fly ${n} seconds without taking a hit`, get: (r) => r.noHit },
  { metric: "stardust", kind: "sum", targets: [15, 35, 60], text: (n) => `Collect ${n} stardust today`, get: (r) => r.stardust },
  { metric: "crew", kind: "sum", targets: [2, 4, 7], text: (n) => `Collect ${n} crew members today`, get: (r) => crewCount(r) },
  { metric: "conStars", kind: "sum", targets: [3, 6, 10], text: (n) => `Collect ${n} constellation stars today`, get: (r) => r.conStars },
  { metric: "conDone", kind: "sum", targets: [1, 2, 3], text: (n) => `Complete ${n} constellation${n > 1 ? "s" : ""} today`, get: (r) => r.constellationIds.length },
  { metric: "superScore", kind: "max", targets: [1500, 3000, 4500], text: (n) => `Score ${fmt(n)} in Supernova mode`, get: (r) => (r.mode === "supernova" ? r.score : 0) },
];
const BY_METRIC = Object.fromEntries(POOL.map((m) => [m.metric, m]));

export function buildDaily(day = dayKey()) {
  const rnd = mulberry32(hashSeed(`${day}|cosmic-rush`));
  const pool = [...POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [0, 1, 2].map((tier) => {
    const d = pool[tier];
    const target = d.targets[tier];
    return {
      id: `${day}:${d.metric}`,
      metric: d.metric,
      tier,
      tierName: TIER_NAMES[tier],
      target,
      reward: TIER_XP[tier],
      text: d.text(target),
    };
  });
}

const liveStreak = (p, day) => (p.streak.last === day || p.streak.last === yesterdayKey() ? p.streak.count : 0);

export function getDaily() {
  const p = load();
  const day = dayKey();
  const fresh = p.daily.date === day;
  const vals = fresh ? p.daily.vals : {};
  const done = fresh ? p.daily.done : {};
  const challenges = buildDaily(day).map((c) => ({
    ...c,
    value: vals[c.metric] || 0,
    done: !!done[c.id],
  }));
  return {
    date: day,
    challenges,
    doneCount: challenges.filter((c) => c.done).length,
    sweep: fresh && !!p.daily.sweep,
    streak: liveStreak(p, day),
    resetMs: msUntilReset(),
  };
}

// ---------- badges ----------
const bestOf = (p, key) => Math.max(p.best.classic[key], p.best.supernova[key]);
const BADGES = [
  { id: "first_flight", icon: "🚀", name: "First Flight", desc: "Finish your first run.", test: (p) => p.games >= 1 },
  { id: "dust_100", icon: "✨", name: "Stardust Collector", desc: "Collect 100 stardust in total.", test: (p) => p.totals.stardust >= 100 },
  { id: "marathon", icon: "⏱️", name: "Marathon Pilot", desc: "Survive 120 seconds in one run.", test: (p) => bestOf(p, "survival") >= 120 },
  { id: "deep_space", icon: "🌌", name: "Deep Space Explorer", desc: "Travel 8,000 m in one run.", test: (p) => bestOf(p, "distance") >= 8000 },
  { id: "starmapper", icon: "🧭", name: "Starmapper", desc: "Complete a constellation.", test: (p) => p.totals.constellations >= 1 },
  { id: "cartographer", icon: "🗺️", name: "Cartographer", desc: "Complete every constellation at least once.", test: (p) => p.conSeen.length >= CONSTELLATIONS.length },
  { id: "full_crew", icon: "🦊", name: "Full Crew", desc: "Collect Stella, Comet Fox and Luma in one run.", test: (p, r) => !!r && r.crew.stella > 0 && r.crew.fox > 0 && r.crew.luma > 0 },
  { id: "untouchable", icon: "🛡️", name: "Untouchable", desc: "Fly 60 seconds without taking a hit.", test: (p, r) => !!r && r.noHit >= 60 },
  { id: "nova_survivor", icon: "💥", name: "Supernova Survivor", desc: "Survive 60 seconds in Supernova.", test: (p) => p.best.supernova.survival >= 60 },
  { id: "nova_legend", icon: "☄️", name: "Supernova Legend", desc: "Score 5,000 in Supernova.", test: (p) => p.best.supernova.score >= 5000 },
  { id: "devoted", icon: "📅", name: "Daily Devotee", desc: "Complete 7 daily missions in total.", test: (p) => p.totals.dailyDone >= 7 },
  { id: "admiral", icon: "👑", name: "Admiral's Path", desc: "Reach the Admiral rank.", test: (p) => rankFor(p.xp).index >= 5 },
];

export function getAchievements() {
  const p = load();
  return BADGES.map((b) => ({
    id: b.id,
    icon: b.icon,
    name: b.name,
    desc: b.desc,
    unlocked: !!p.badges[b.id],
    at: p.badges[b.id] || 0,
  }));
}

// ---------- simple getters / setters ----------
export function getMode() {
  const m = load().mode;
  return MODES[m] ? m : "classic";
}
export function setMode(m) {
  if (!MODES[m]) return;
  const p = load();
  p.mode = m;
  save(p);
}
export const getXp = () => load().xp;
export const getRank = () => rankFor(getXp()).rank;

export function getStats() {
  const p = load();
  return {
    games: p.games,
    xp: p.xp,
    totals: p.totals,
    best: p.best,
    longest: bestOf(p, "survival"),
    bestDistance: bestOf(p, "distance"),
    conUnique: p.conSeen.length,
    conTotal: CONSTELLATIONS.length,
  };
}

// ---------- end of run ----------
// run = { mode, score, survival, distance, stardust, crew:{stella,fox,luma},
//         constellationIds:[], conStars, noHit, threat }
export function recordRun(run) {
  const p = load();
  const day = dayKey();
  if (p.daily.date !== day) p.daily = { date: day, vals: {}, done: {}, sweep: false };

  const mk = run.mode === "supernova" ? "supernova" : "classic";
  const before = rankFor(p.xp);
  const ids = Array.isArray(run.constellationIds) ? run.constellationIds : [];
  const r = {
    ...run,
    score: Math.floor(run.score || 0),
    survival: Math.floor(run.survival || 0),
    distance: Math.floor(run.distance || 0),
    stardust: run.stardust || 0,
    crew: run.crew || {},
    constellationIds: ids,
    conStars: run.conStars || 0,
    noHit: run.noHit || 0,
    threat: run.threat || 1,
  };
  const crew = crewCount(r);

  // lifetime stats and personal bests
  p.games += 1;
  p.totals.stardust += r.stardust;
  p.totals.constellations += ids.length;
  p.totals.crew += crew;
  p.totals.survival += r.survival;
  p.totals.distance += r.distance;
  const best = p.best[mk];
  best.score = Math.max(best.score, r.score);
  best.survival = Math.max(best.survival, r.survival);
  best.distance = Math.max(best.distance, r.distance);
  for (const id of ids) if (!p.conSeen.includes(id)) p.conSeen.push(id);

  // XP for the run itself
  const mult = mk === "supernova" ? SUPERNOVA_XP_MULT : 1;
  let gained = Math.round(
    (r.score / 12 + r.stardust * 2 + r.survival * 0.8 + ids.length * 120 + r.conStars * 10 + crew * 15) * mult
  );

  // daily missions
  const defs = buildDaily(day);
  for (const c of defs) {
    const spec = BY_METRIC[c.metric];
    const add = spec.get(r) || 0;
    const cur = p.daily.vals[c.metric] || 0;
    p.daily.vals[c.metric] = spec.kind === "sum" ? cur + add : Math.max(cur, add);
  }
  const justDone = [];
  for (const c of defs) {
    if (!p.daily.done[c.id] && (p.daily.vals[c.metric] || 0) >= c.target) {
      p.daily.done[c.id] = true;
      justDone.push(c.id);
      gained += c.reward;
    }
  }
  p.totals.dailyDone += justDone.length;

  let streakBonus = 0;
  if (justDone.length && p.streak.last !== day) {
    p.streak.count = p.streak.last === yesterdayKey() ? p.streak.count + 1 : 1;
    p.streak.last = day;
    streakBonus = Math.min(p.streak.count, 5) * STREAK_XP;
    gained += streakBonus;
  }
  const doneCount = defs.filter((c) => p.daily.done[c.id]).length;
  let sweepNow = false;
  if (doneCount === defs.length && !p.daily.sweep) {
    p.daily.sweep = true;
    sweepNow = true;
    gained += SWEEP_XP;
  }

  // badges (two passes so a badge that depends on rank can see XP from the first pass)
  p.xp += gained;
  const newBadges = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const b of BADGES) {
      if (!p.badges[b.id] && b.test(p, r)) {
        p.badges[b.id] = Date.now();
        p.xp += BADGE_XP;
        gained += BADGE_XP;
        newBadges.push({ id: b.id, icon: b.icon, name: b.name, desc: b.desc });
      }
    }
  }

  const after = rankFor(p.xp);
  const out = {
    xpGained: gained,
    xpTotal: p.xp,
    rankInfo: after,
    pctBefore: before.pct,
    rankedUp: after.index > before.index,
    challenges: defs.map((c) => ({
      ...c,
      value: p.daily.vals[c.metric] || 0,
      done: !!p.daily.done[c.id],
      justCompleted: justDone.includes(c.id),
    })),
    doneCount,
    sweepNow,
    sweepXp: SWEEP_XP,
    streak: liveStreak(p, day),
    streakBonus,
    newBadges,
  };
  save(p);
  return out;
}

// ---------- Supernova leaderboard (separate from the classic one) ----------
let snMem = [];

function readSn() {
  let arr = snMem;
  try {
    const raw = localStorage.getItem(SN_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    }
  } catch (e) {
    /* use memory copy */
  }
  return arr
    .filter((e) => e && typeof e.name === "string" && Number.isFinite(e.score) && e.score > 0)
    .map((e) => ({ name: e.name, score: Math.floor(e.score), at: Number(e.at) || 0 }));
}

function writeSn(arr) {
  snMem = arr;
  try {
    localStorage.setItem(SN_KEY, JSON.stringify(arr));
  } catch (e) {
    /* ignore */
  }
}

const sortSn = (arr) => [...arr].sort((a, b) => b.score - a.score || a.at - b.at);

// one entry per player name (their best); returns { prevBest, best, isNewBest }
export function submitSupernovaScore(name, score) {
  score = Math.floor(score) || 0;
  const board = readSn();
  const i = board.findIndex((e) => e.name === name);
  const prevBest = i >= 0 ? board[i].score : 0;
  const isNewBest = score > prevBest;
  if (isNewBest) {
    if (i >= 0) board[i] = { ...board[i], score, at: Date.now() };
    else board.push({ name, score, at: Date.now() });
    writeSn(sortSn(board).slice(0, MAX_ENTRIES));
  }
  return { prevBest, best: Math.max(prevBest, score), isNewBest };
}

export function getSupernovaRanked() {
  return sortSn(readSn()).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score }));
}