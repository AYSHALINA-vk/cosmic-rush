// Local-only leaderboard. Scores live in this browser's localStorage and are
// never sent anywhere. One entry per player name (their best score).

const BOARD_KEY = "cosmicRushLeaderboardV1";
const NAME_KEY = "cosmicRushPlayerNameV1";
const BEST_KEY = "cosmicRushBestScoreV1"; // older single-best keys, migrated once
const LEGACY_BEST_KEY = "cosmicRushBest";

export const DEFAULT_NAME = "PILOT";
export const MAX_NAME = 12;
const MAX_ENTRIES = 50;

// fallbacks if localStorage is blocked (private mode, some iframes)
let memBoard = null;
let memName = null;

export function cleanName(raw) {
  return String(raw ?? "")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .toUpperCase();
}

export function getPlayerName() {
  try {
    const n = cleanName(localStorage.getItem(NAME_KEY) || "");
    if (n) return n;
  } catch (e) {
    /* storage blocked */
  }
  return cleanName(memName || "") || DEFAULT_NAME;
}

function setPlayerName(name) {
  memName = name;
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    /* ignore */
  }
}

// highest value from the older single-score keys, so existing records are not lost
function legacyBest() {
  let best = 0;
  try {
    for (const key of [BEST_KEY, LEGACY_BEST_KEY]) {
      const n = Number(localStorage.getItem(key));
      if (Number.isFinite(n) && n > best) best = Math.floor(n);
    }
  } catch (e) {
    /* ignore */
  }
  return best;
}

// null = nothing stored yet
function readStored() {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return memBoard;
  }
}

function saveBoard(arr) {
  memBoard = arr;
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(arr));
  } catch (e) {
    /* ignore */
  }
}

function loadBoard() {
  let arr = readStored();
  if (arr === null) {
    const legacy = legacyBest();
    arr = legacy > 0 ? [{ name: getPlayerName(), score: legacy, at: Date.now() }] : [];
  }
  return arr
    .filter((e) => e && typeof e.name === "string" && Number.isFinite(e.score) && e.score > 0)
    .map((e) => ({ name: e.name, score: Math.floor(e.score), at: Number(e.at) || 0 }));
}

// highest score first; on a tie the earlier score ranks higher
const sorted = (arr) => [...arr].sort((a, b) => b.score - a.score || a.at - b.at);

export function getPersonalBest(name) {
  const e = loadBoard().find((x) => x.name === name);
  return e ? e.score : 0;
}

// Saves only when the score beats this player's best.
// Returns { prevBest, best, isNewBest }.
export function submitScore(name, score) {
  score = Math.floor(score) || 0;
  const board = loadBoard();
  const i = board.findIndex((e) => e.name === name);
  const prevBest = i >= 0 ? board[i].score : 0;
  const isNewBest = score > prevBest;

  if (isNewBest) {
    if (i >= 0) board[i] = { ...board[i], score, at: Date.now() };
    else board.push({ name, score, at: Date.now() });
    saveBoard(sorted(board).slice(0, MAX_ENTRIES));

    // keep the older single-best key in step, for any other code that still reads it
    try {
      if (score > legacyBest()) localStorage.setItem(BEST_KEY, String(score));
    } catch (e) {
      /* ignore */
    }
  } else if (board.length && readStored() === null) {
    saveBoard(sorted(board)); // persist a migrated old record
  }
  return { prevBest, best: Math.max(prevBest, score), isNewBest };
}

// [{ rank, name, score }], best first
export function getRankedScores() {
  return sorted(loadBoard()).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score }));
}

// Renames the current player and moves their record. Returns the new name, or null if invalid.
export function renamePlayer(oldName, rawNew) {
  const name = cleanName(rawNew);
  if (!name) return null;
  if (name !== oldName) {
    const board = loadBoard();
    const mine = board.find((e) => e.name === oldName);
    const existing = board.find((e) => e.name === name);
    let next = board.filter((e) => e.name !== oldName);
    if (mine) {
      if (existing) {
        existing.score = Math.max(existing.score, mine.score);
      } else {
        next.push({ name, score: mine.score, at: mine.at });
      }
    }
    saveBoard(sorted(next).slice(0, MAX_ENTRIES));
  }
  setPlayerName(name);
  return name;
}