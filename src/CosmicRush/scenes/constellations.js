import { ORION } from "./orion";
import { URSA_MAJOR } from "./ursaMajor";
import { CASSIOPEIA } from "./cassiopeia";
import { SCORPIUS } from "./scorpius";
import { LEO } from "./leo";


// Orion stays first, so the first figure in a run is always the familiar one.
export const CONSTELLATIONS = [ORION, URSA_MAJOR, URSA_MINOR, CASSIOPEIA, SCORPIUS, LEO, CYGNUS, CRUX];

export const starById = (def, id) => def.stars.find((s) => s.id === id);
export const nextStarId = (def, got) => def.order[got.length] ?? null;
export const isNextStar = (def, got, id) => !got.includes(id) && nextStarId(def, got) === id;
export const isComplete = (def, got) => def.order.every((id) => got.includes(id));
export const completedLinks = (def, got) =>
  def.links.filter(([a, b]) => got.includes(a) && got.includes(b));

// Per-run order: Orion first, then every other constellation in a fresh random order,
// so different runs discover different figures.
export function makeConstellationQueue() {
  const [first, ...rest] = CONSTELLATIONS;
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
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