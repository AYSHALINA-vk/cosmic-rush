# 🚀 Cosmic Rush

**An arcade space-survival game for NOVA, the All-Kerala Astro Society Fest.**

Pilot a tiny cyan spaceship through an endless asteroid field, collect stardust and friendly cosmic crew, trace real constellations one star at a time, and see how long you can survive. It runs in any modern browser, on desktop and on phones, with nothing to install for players.

> You always lose in the end: there is no finish line, only a higher score. The question is how far you get.

---

## Contents

- [How to play](#how-to-play)
- [Controls](#controls)
- [Scoring](#scoring)
- [The cosmic crew](#the-cosmic-crew)
- [Constellations](#constellations)
- [Threat levels](#threat-levels)
- [Game over and the leaderboard](#game-over-and-the-leaderboard)
- [Tips](#tips)
- [Run it locally](#run-it-locally)
- [Project structure](#project-structure)
- [Tuning the game](#tuning-the-game)
- [Tech stack](#tech-stack)
- [Troubleshooting](#troubleshooting)

---

## How to play

1. **Dodge.** Asteroids fall from the top of the screen. Touching one costs a life.
2. **Collect.** Grab golden stardust for points, and catch friendly characters for score, speed and shields.
3. **Trace constellations.** Special named stars fall one at a time. Collect them in order to light up a real constellation and earn a big bonus.
4. **Survive.** You have **3 lives** (♥ ♥ ♥). When the last one is gone, the run ends. The longer you last, the faster and trickier the asteroids get.

Your ship stays inside a central play lane (up to 480 px wide, so on a big monitor the sides are just scenery). You only move left and right.

## Controls

| Input | Action |
| --- | --- |
| **← / →** or **A / D** | Move left / right |
| **Mouse** (hold the button) | Steer towards the pointer |
| **Touch** (hold and drag) | Steer towards your finger |
| **M** | Mute / unmute |
| 🔊 button (top centre) | Mute / unmute |
| **SPACE** or **ENTER** | Play again (on the results screen) |

Notes for touch screens:

- Touches that begin in the HUD strip at the top (score, lives, speaker button) never steer the ship, so tapping the speaker won't make you swerve.
- Sound starts after your first key press or tap. That's a browser rule, not a bug.

## Scoring

| Event | Points |
| --- | --- |
| Golden stardust ✦ | **10** |
| Rare magenta crystal (about 1 in 7 pickups) | **100** |
| Catch **Stella** | **250** |
| Survive another 10 seconds | **+50** |
| Travel another 500 m | **+200** |
| Each constellation star | **50 to 80** (depends on the figure) |
| Complete a constellation | **900 to 1,400** bonus (see the table below) |

Distance builds up automatically as you survive, and the pace picks up at higher threat levels.

## The cosmic crew

| Character | What it does | How to handle it |
| --- | --- | --- |
| **Nebby** (purple companion) | Floats beside your ship and pulses when you collect something. Purely cosmetic and never hurts you. | Enjoy the company. |
| **Stella** ⭐ | Worth **250 points**. | Catch her. |
| **Comet Fox** 🦊 | **Speed boost for 6 seconds** (ship speed goes from 380 to 560 px/s). | Catch it, then use the speed to line up tricky pickups. |
| **Luma** 🌈 | A **shield for 12 seconds** that absorbs exactly one hit. The shield ring blinks in its last 2 seconds. | Catch it and keep going. A blocked hit also gives you a brief moment of safety. |
| **Voidling** 👾 | **Dangerous.** Touching it costs a life. | A pink **!** and a purple warning lane appear about 1.4 seconds before it drops. Leave that lane. |

When you take a hit, the screen shakes, your ship flashes, and you are invulnerable for about 1.2 seconds. Damage never resets your constellation progress.

## Constellations

This is the astronomy part of the game. A small holographic **constellation guide** sits in the top-left of the HUD, under your hearts. It shows the figure you're working on, how many stars you have (for example `ORION 3/7`), and a pulsing ring on the **next** star you need.

How it works:

- Stars appear **one at a time and always in the right order**: a gold star with a cyan ring and its **real name** underneath (Alnitak, Betelgeuse, Rigel…). There's no wrong star to hit.
- The first star falls about **9 seconds** into a run. After you collect one, the next arrives in **6 to 9 seconds**.
- They fall **slower than asteroids** and spawn where you can reach them without crossing an asteroid.
- **Miss one?** The same star is sent again after a couple of seconds.
- Each star lights up its place in the guide and draws a glowing connecting line. Finish the figure and you get **`<NAME> COMPLETE`** plus a bonus, without the game pausing.
- Every run shuffles the order of the figures, and the figure that opened your last run never opens the next one.

| Constellation | Stars | Per star | Completion bonus |
| --- | :---: | :---: | :---: |
| Orion | 7 | 50 | 1,000 |
| Ursa Major | 7 | 50 | 1,000 |
| Cassiopeia | 5 | 80 | 900 |
| Scorpius | 9 | 60 | 1,400 |
| Leo | 8 | 60 | 1,200 |

Constellations you complete are listed on your results screen.

## Threat levels

The game gets harder every **25 seconds**. The current level shows in the HUD as `THREAT LEVEL n`, and a pink **THREAT LEVEL INCREASED** banner flashes when it goes up. Changes blend in over about 5 seconds, so there are no sudden jumps.

| Level | Survival time | Asteroid speed | What to expect |
| :---: | --- | :---: | --- |
| 1 | 0 – 25 s | ×1.00 | Slow, scattered rocks and generous gaps |
| 2 | 25 – 50 s | ×1.10 | Faster, more frequent |
| 3 | 50 – 75 s | ×1.18 | **Rows of asteroids with one gap** that alternate sides |
| 4 | 75 – 100 s | ×1.28 | Adds **diagonal meteors** crossing the lane |
| 5 | 100 – 125 s | ×1.36 | Two diagonal meteors at a time |
| 6 | 125 s + | ×1.45 | Maximum difficulty, held for the rest of the run |

The game is built to be fair: gaps are always wide enough for your ship and reachable at normal speed, nothing spawns on top of you, and speeds are capped. Voidlings also appear more often at higher levels.

## Game over and the leaderboard

When your last heart goes, the ship explodes, the action freezes, and a **MISSION FAILED** results panel appears with:

- **Final score**, counted up on screen
- **Personal best**, with a **★ NEW PERSONAL BEST!** celebration when you beat it, or how many points you still need to beat it
- **Distance**, **time survived** and **stardust collected**
- **Crew collected** this run (Stella, Comet Fox, Luma)
- **Constellations completed** this run
- A random **Cosmic Fact** (there are 25 of them)

Buttons: **PLAY AGAIN** (or press **SPACE / ENTER**) and **LEADERBOARD**, which shows the top 8 pilots and highlights your row, even if you're ranked lower.

### Where scores are stored

The leaderboard is **local only**. Scores are saved in your browser's `localStorage` on your device and are never sent anywhere. That means:

- Rankings are per browser and per device. Clearing site data or using a private window resets them.
- There is one entry per pilot name (their best score). The default name is `PILOT`. Names are up to 12 characters, upper-case, letters/numbers/spaces/`_ . -`.
- If two scores tie, the earlier one ranks higher. Up to 50 entries are kept.

| Key | Purpose |
| --- | --- |
| `cosmicRushLeaderboardV1` | The ranked scores |
| `cosmicRushPlayerNameV1` | Your pilot name |
| `cosmicRushBestScoreV1` / `cosmicRushBest` | Older single-best records (still read, so nothing is lost) |
| `cosmicRushMuted` | Your mute setting |

## Tips

- **Stay near the middle** at first. You can reach either side quickly and see rows coming.
- **At level 3 and above, look for the gap**, not the rocks. Move toward it early.
- **Save Comet Fox's boost** for a tricky constellation star that's far from you.
- **Never chase a pickup into a falling formation.** Stardust is worth 10 points. A life is worth far more.
- **Respect the pink `!`.** A Voidling lane is a free warning, so use it.
- **Constellation bonuses are huge.** One completed Scorpius is worth 1,400 points, about 28 survival bonuses. Plan your route around the next star.
- **Grab Luma early** and let the shield cover you through a risky stretch.

## Run it locally

You need [Node.js](https://nodejs.org/) (a current LTS release; Vite 8 needs a recent version) and npm.

```bash
git clone https://github.com/AYSHALINA-vk/cosmic-rush.git
cd cosmic-rush
npm install
npm run dev
```

Then open the address Vite prints (normally <http://localhost:5173>).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run [oxlint](https://oxc.rs) |

The build is a static site, so `dist/` can be hosted on any static host (Vercel, Netlify, GitHub Pages…).

## Project structure

```text
src/
├── main.jsx                      # React entry point
└── CosmicRush/
    ├── CosmicRushPage.jsx        # Full-screen page: game canvas + leaderboard overlay
    ├── components/
    │   ├── GameCanvas.jsx        # Mounts Phaser, handles resize and rotation
    │   └── LeaderboardOverlay.jsx
    ├── scenes/
    │   ├── GameScene.js          # Main game loop: ship, hazards, scoring, HUD, results
    │   ├── difficulty.js         # DifficultyDirector: levels, spawn timing, safe gaps
    │   ├── background.js         # Procedural nebula / star background
    │   ├── characters.js         # Nebby, Stella, Voidling, Comet Fox, Luma
    │   ├── audio.js              # Music, engine and impact sounds, mute handling
    │   ├── constellations.js     # Constellation list, helpers and per-run shuffle
    │   └── orion.js, ursaMajor.js, cassiopeia.js, scorpius.js, leo.js
    ├── data/
    │   ├── leaderboard.js        # Local leaderboard (localStorage)
    │   └── astroFacts.js         # The "Cosmic Fact" cards
    └── assets/                   # Sound effects and background music
```

## Tuning the game

Most balance numbers live in plain constants:

| What | Where |
| --- | --- |
| Ship speed, boost and shield durations, Stella's points | top of `scenes/GameScene.js` (`BASE_SPEED`, `BOOST_SECONDS`, `SHIELD_SECONDS`, `STELLA_POINTS`) |
| When characters first appear and how often | `SCHEDULE` in `scenes/GameScene.js` |
| Constellation timing | `CON_FIRST_SPAWN`, `CON_RESPAWN`, `CON_RETRY` in `scenes/GameScene.js` |
| Difficulty curve | `LEVELS` and `LEVEL_SECONDS` in `scenes/difficulty.js` |
| Constellation points | the `reward` field in each constellation file |

**Adding a constellation:** copy one of the existing files (for example `scenes/leo.js`). Give it an `id`, `name`, `stars` (positions from 0 to 1), `links` (which stars connect), the collection `order`, `reward` and `visuals`, then add it to the `CONSTELLATIONS` list in `scenes/constellations.js`. In development, the console warns if a definition has a typo.

## Tech stack

- [Phaser](https://phaser.io/) for the game engine, rendering and collisions
- [React](https://react.dev/) and [Vite](https://vite.dev/) for the page and tooling
- Procedurally drawn graphics, with no image files for the game art
- `localStorage` for scores, name and mute setting
- [oxlint](https://oxc.rs) for linting

## Troubleshooting

| Problem | Fix |
| --- | --- |
| **No sound** | Press a key or tap the screen first (browsers block audio until you interact). Check the 🔊 button isn't muted (**M**). |
| **Blank black screen** | Open the browser console (F12) and check for errors. Try `npm install` again and restart `npm run dev`. |
| **My score disappeared** | Scores live in your browser's storage. Private windows, cleared site data, or a different browser or device start fresh. |
| **The ship won't steer on my phone** | Start the touch below the top HUD strip, then hold and drag. |
| **Choppy on an older phone** | Close other tabs, and use the browser's normal (not battery-saver) mode. |

## Credits

Built for NOVA. Add your team's names here. Please check the licence terms of the audio files in `src/CosmicRush/assets/` before redistributing the project.

---

*Made for NOVA, the All-Kerala Astro Society Fest. Clear skies and good luck, pilot.* ✨