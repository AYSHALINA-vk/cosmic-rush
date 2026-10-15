export const CASSIOPEIA = {
  id: "cassiopeia",
  name: "Cassiopeia",
  stars: [
    { id: "caph", name: "Caph", x: 0.06, y: 0.3 },
    { id: "schedar", name: "Schedar", x: 0.28, y: 0.72 },
    { id: "navi", name: "Navi", x: 0.5, y: 0.4 },
    { id: "ruchbah", name: "Ruchbah", x: 0.72, y: 0.78 },
    { id: "segin", name: "Segin", x: 0.94, y: 0.26 },
  ],
  links: [
    ["caph", "schedar"],
    ["schedar", "navi"],
    ["navi", "ruchbah"],
    ["ruchbah", "segin"],
  ],
  order: ["caph", "schedar", "navi", "ruchbah", "segin"],
  reward: { perStar: 80, completion: 900 },
  visuals: {
    guideLine: 0xb03a7a,
    litLine: 0xffd0ea,
    litGlow: 0xff5bc8,
    starLit: 0xff9ad8,
    starDim: 0xa06a90,
    next: 0xff5bc8,
    complete: 0xffd56a,
  },
};