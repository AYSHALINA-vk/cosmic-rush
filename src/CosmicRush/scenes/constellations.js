import { ORION } from "./orion";
import { URSA_MAJOR } from "./ursaMajor";
import { CASSIOPEIA } from "./cassiopeia";
import { SCORPIUS } from "./scorpius";
import { LEO } from "./leo";



export const CONSTELLATIONS = [ORION, URSA_MAJOR,  CASSIOPEIA, SCORPIUS, LEO];

export const starById = (def, id) => def.stars.find((s) => s.id === id);
export const nextStarId = (def, got) => def.order[got.length] ?? null;
export const isNextStar = (def, got, id) => !got.includes(id) && nextStarId(def, got) === id;
export const isComplete = (def, got) => def.order.every((id) => got.includes(id));
export const completedLinks = (def, got) =>
  def.links.filter(([a, b]) => got.includes(a) && got.includes(b));

// Per-run order: Orion first, then every other constellation in a fresh random order,
// so different runs discover different figures.
// Remembers which figure opened the previous run, so two runs in a row never start the same way.
let lastFirstId = null;

// Per-run order: all constellations in a fresh random order.
export function makeConstellationQueue() {
  const q = [...CONSTELLATIONS];
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  if (q.length > 1 && q[0].id === lastFirstId) {
    const k = 1 + Math.floor(Math.random() * (q.length - 1));
    [q[0], q[k]] = [q[k], q[0]];
  }
  lastFirstId = q[0].id;
  return q;
}

// Dev-only sanity check: warns in the console if a definition has a typo.
if (import.meta.env.DEV) {
  for (const def of CONSTELLATIONS) {
    const ids = new Set(def.stars.map((s) => s.id));
    const bad =
      def.order.length !== def.stars.length ||
      def.order.some((id) => !ids.has(id)) ||
      def.links.some(([a, b]) => !ids.has(a) || !ids.has(b)) ||
      def.stars.some((s) => s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1);
    if (bad) console.warn(`[constellations] check "${def.id}": order, links or coordinates look wrong`);
  }
}