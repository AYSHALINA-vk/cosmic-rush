// Beginner-friendly astronomy facts shown on the Game Over screen.
// No network, API or database: this is just a static list.

export const ASTRO_FACTS = Object.freeze([
  {
    title: "A Day on Venus Is Longer Than Its Year",
    fact: "Venus takes about 243 Earth days to rotate once, but only about 225 Earth days to orbit the Sun.",
  },
  {
    title: "Saturn Is Less Dense Than Water",
    fact: "Saturn's average density is about 0.69 g/cm³, lower than water's. It would float in a bathtub big enough to hold it, though no such bathtub exists.",
  },
  {
    title: "The Sun Contains Almost All the Solar System's Mass",
    fact: "The Sun accounts for about 99.86% of the total mass of the Solar System.",
  },
  {
    title: "Jupiter Has a Giant Storm",
    fact: "Jupiter's Great Red Spot is a massive storm that has been observed for well over a century, and possibly much longer.",
  },
  {
    title: "Mars Has the Tallest Known Volcano in the Solar System",
    fact: "Olympus Mons is a gigantic shield volcano on Mars, about 22 kilometres high.",
  },
  {
    title: "Light from the Sun Takes About Eight Minutes to Reach Earth",
    fact: "On average, sunlight takes about 8 minutes and 20 seconds to travel from the Sun to Earth.",
  },
  {
    title: "The Moon Is Slowly Moving Away from Earth",
    fact: "The Moon recedes from Earth at approximately 3.8 centimetres per year.",
  },
  {
    title: "Neutron Stars Are Extremely Dense",
    fact: "A neutron star packs one to two times the Sun's mass into a ball only about 20 kilometres across, roughly the size of a city.",
  },
  {
    title: "Black Holes Can Bend Light",
    fact: "Gravity curves spacetime and bends the path of light. Near a black hole this effect is extreme.",
  },
  {
    title: "The Milky Way Is a Barred Spiral Galaxy",
    fact: "Our Solar System lies in the Milky Way, a galaxy with a central bar and spiral arms.",
  },
  {
    title: "There Are Other Planets Beyond Our Solar System",
    fact: "Planets orbiting stars other than the Sun are called exoplanets. Thousands have been confirmed.",
  },
  {
    title: "Uranus Rotates on Its Side",
    fact: "Uranus has an extreme axial tilt of about 98 degrees, so it spins almost on its side.",
  },
  {
    title: "A Solar Eclipse Happens When the Moon Blocks the Sun",
    fact: "A total solar eclipse occurs when the Moon completely covers the Sun as seen from a location on Earth.",
  },
  {
    title: "A Lunar Eclipse Happens When Earth Blocks Sunlight from the Moon",
    fact: "During a lunar eclipse, Earth passes between the Sun and the Moon, casting its shadow on the Moon.",
  },
  {
    title: "Stars Have Different Colours",
    fact: "A star's colour is related to its surface temperature. Blue stars are hotter than red stars.",
  },
  {
    title: "The Universe Is Expanding",
    fact: "On large scales, the universe has been expanding since the Big Bang.",
  },
  {
    title: "The International Space Station Orbits Earth",
    fact: "The ISS travels around Earth roughly once every 90 minutes.",
  },
  {
    title: "Comets Develop Tails Near the Sun",
    fact: "Solar heating releases gas and dust from a comet, forming a coma and often a tail that points generally away from the Sun.",
  },
  {
    title: "Mercury Has Extreme Temperature Changes",
    fact: "Mercury has almost no atmosphere to redistribute heat, so its surface swings between extreme heat by day and extreme cold at night.",
  },
  {
    title: "The Observable Universe Is Enormous",
    fact: "The observable universe is about 93 billion light-years across, based on current cosmological estimates.",
  },
  {
    title: "A Light-Year Measures Distance",
    fact: "A light-year is the distance light travels in one year, approximately 9.46 trillion kilometres.",
  },
  {
    title: "The Sun Will Eventually Become a White Dwarf",
    fact: "In roughly 5 billion years the Sun will expand into a red giant, and it will eventually leave behind a white dwarf.",
  },
  {
    title: "Space Is Not Completely Empty",
    fact: "Interplanetary and interstellar space contain gas, dust, particles, radiation and magnetic fields.",
  },
  {
    title: "Some Moons Have Subsurface Oceans",
    fact: "Evidence suggests that moons such as Europa and Enceladus have oceans beneath their icy surfaces.",
  },
  {
    title: "A Supernova Can Outshine Its Host Galaxy",
    fact: "Some supernova explosions can briefly outshine the combined visible light of their host galaxies.",
  },
]);

// Module-level, so it survives scene restarts and the next Game Over can avoid a repeat.
let lastIndex = -1;

// Call once per Game Over. Returns { title, fact }, never the same one twice in a row
// (as long as there is more than one fact).
export function pickRandomFact() {
  const n = ASTRO_FACTS.length;
  let i = Math.floor(Math.random() * n);
  if (n > 1 && i === lastIndex) {
    i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n; // any index except lastIndex
  }
  lastIndex = i;
  return ASTRO_FACTS[i];
}