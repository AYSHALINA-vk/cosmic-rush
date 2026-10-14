// orion.js
export const ORION = {
  id: "orion",
  name: "Orion",
  stars: [
    { id: "alnitak", name: "Alnitak", x: 0.4, y: 0.55 },
    { id: "alnilam", name: "Alnilam", x: 0.5, y: 0.5 },
    { id: "mintaka", name: "Mintaka", x: 0.6, y: 0.45 },
    { id: "betelgeuse", name: "Betelgeuse", x: 0.22, y: 0.08 },
    { id: "bellatrix", name: "Bellatrix", x: 0.78, y: 0.12 },
    { id: "saiph", name: "Saiph", x: 0.3, y: 0.97 },
    { id: "rigel", name: "Rigel", x: 0.82, y: 0.92 },
  ],
  links: [
    ["alnitak", "alnilam"],
    ["alnilam", "mintaka"],
    ["betelgeuse", "alnitak"],
    ["bellatrix", "mintaka"],
    ["betelgeuse", "bellatrix"],
    ["saiph", "alnitak"],
    ["rigel", "mintaka"],
  ],
  order: ["alnitak", "alnilam", "mintaka", "betelgeuse", "bellatrix", "saiph", "rigel"],
  reward: { perStar: 50, completion: 1000 },
  visuals: {
    guideLine: 0x7651e8,
    litLine: 0x9fefff,
    litGlow: 0x19ddf5,
    starLit: 0xffd56a,
    starDim: 0x6f7fb8,
    next: 0x19ddf5,
    complete: 0xff5bc8,
  },
};