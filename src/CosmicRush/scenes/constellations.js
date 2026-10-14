// constellations.js
import { ORION } from "./orion";

export const CONSTELLATIONS = [ORION];

export const starById = (def, id) => def.stars.find((s) => s.id === id);
export const nextStarId = (def, got) => def.order[got.length] ?? null;
export const isNextStar = (def, got, id) => !got.includes(id) && nextStarId(def, got) === id;
export const isComplete = (def, got) => def.order.every((id) => got.includes(id));
export const completedLinks = (def, got) =>
  def.links.filter(([a, b]) => got.includes(a) && got.includes(b));