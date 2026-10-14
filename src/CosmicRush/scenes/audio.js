import Phaser from "phaser";

// Vite bundles every audio file in ../assets and gives us its final URL.
// If you later add .mp3 versions with the same base name, they are used automatically
// (needed for iPhones, which may not play .ogg).
const files = import.meta.glob("../assets/*.{ogg,mp3,m4a,wav}", {
  eager: true,
  query: "?url",
  import: "default",
});

const byName = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop().replace(/\.[^.]+$/, "");
  (byName[name] ||= []).push(url);
}
const find = (prefix) => {
  const k = Object.keys(byName).find((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
  return k ? byName[k] : null;
};

const SOURCES = {
  engine: find("spaceEngine_002"),
  impact: find("impactMetal_000"),
  explosion: find("lowFrequency_explosion_000"),
  ambient: find("freesound_community-sci-fi-survival") || find("freesound"),
};

const VOL = { engine: 0.1, engineBoost: 0.16, ambient: 0.2, impact: 0.55, explosion: 0.8 };
const MUTE_KEY = "cosmicRushMuted";

export function preloadAudio(scene) {
  for (const [key, urls] of Object.entries(SOURCES)) {
    if (urls && !scene.cache.audio.exists(key)) scene.load.audio(key, urls);
  }
}

export default class CosmicAudio {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this.boosted = false;
    this.last = {};
    this.sounds = {};
    this.muted = this.loadMuted();
    scene.sound.mute = this.muted;

    for (const key of Object.keys(SOURCES)) {
      if (scene.cache.audio.exists(key)) this.sounds[key] = scene.sound.add(key);
    }
        console.log("[audio] sources", SOURCES);
    console.log("[audio] loaded", Object.keys(SOURCES).map((k) => [k, scene.cache.audio.exists(k)]));
    console.log("[audio] locked:", scene.sound.locked, "context:", scene.sound.context && scene.sound.context.state, "muted:", this.muted);
  }

  loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  fadeTo(snd, volume, duration, onDone) {
    if (!snd) return;
    this.scene.tweens.killTweensOf(snd);
    this.scene.tweens.add({ targets: snd, volume, duration, onComplete: onDone });
  }

  // call after the first user interaction (browser autoplay rules)
  start() {
    if (this.started) return;
    console.log("[audio] start() called");
    this.started = true;
    const { ambient, engine } = this.sounds;
    if (ambient) {
      ambient.play({ loop: true, volume: 0 });
      this.fadeTo(ambient, VOL.ambient, 2500);
    }
    if (engine) {
      engine.play({ loop: true, volume: 0 });
      this.fadeTo(engine, VOL.engine, 1500);
    }
    setTimeout(() => {
      console.log(
        "[audio] after 3s:",
        Object.entries(this.sounds).map(([k, s]) => [k, "playing:", s.isPlaying, "vol:", s.volume])
      );
    }, 3000);
  }

  setBoost(on) {
    if (on === this.boosted) return;
    this.boosted = on;
    const { engine } = this.sounds;
    if (!engine || !this.started) return;
    this.fadeTo(engine, on ? VOL.engineBoost : VOL.engine, 300);
    engine.setRate(on ? 1.12 : 1);
  }

    // one-shot effect; replaying restarts the same sound, so hits never pile up
  sfx(key, { volume = VOL[key], rate = 1, gap = 150 } = {}) {
    console.log("[audio] sfx", key, "started:", this.started);
    const snd = this.sounds[key];
    if (!snd || !this.started) return;
    const now = this.scene.time.now;
    if (now - (this.last[key] ?? -1e9) < gap) return;
    this.last[key] = now;
    snd.play({ volume, rate });
  }

  
  onGameOver() {
    const { engine, ambient } = this.sounds;
    this.fadeTo(engine, 0, 600, () => engine && engine.stop());
    this.fadeTo(ambient, 0.08, 1200);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.scene.sound.mute = this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
    return this.muted;
  }

  destroy() {
    for (const s of Object.values(this.sounds)) {
      try {
        this.scene.tweens.killTweensOf(s);
        s.stop();
        s.destroy();
      } catch (e) {
        /* already destroyed */
      }
    }
    this.sounds = {};
  }
}