// Procedural astro characters. Each factory returns a container with a .tick(time) animator.
export const RAINBOW = [0xff4d6d, 0xff9f45, 0xffe14d, 0x5df08a, 0x4db8ff, 0xb06bff];

// Nebby: purple alien companion
export function makeNebby(scene) {
  const c = scene.add.container(0, 0);
  const glow = scene.add.circle(0, 0, 28, 0xb36bff, 0.22);
  const body = scene.add.ellipse(0, 2, 30, 26, 0x9b5de5).setStrokeStyle(2, 0xd9b8ff);
  const stalkL = scene.add.rectangle(-7, -16, 2, 9, 0xd9b8ff);
  const stalkR = scene.add.rectangle(7, -16, 2, 9, 0xd9b8ff);
  const tipL = scene.add.circle(-7, -22, 3, 0xffe66d);
  const tipR = scene.add.circle(7, -22, 3, 0xffe66d);
  const eyeL = scene.add.ellipse(-6, -1, 9, 11, 0x7df9ff);
  const eyeR = scene.add.ellipse(6, -1, 9, 11, 0x7df9ff);
  const pupL = scene.add.circle(-6, 0, 2, 0x1b1035);
  const pupR = scene.add.circle(6, 0, 2, 0x1b1035);
  const mouth = scene.add.ellipse(0, 9, 7, 3, 0x4a2a7a);
  c.add([glow, body, stalkL, stalkR, tipL, tipR, eyeL, eyeR, pupL, pupR, mouth]);
  c.tick = (t) => {
    glow.setAlpha(0.18 + 0.08 * Math.sin(t / 250));
    const blink = t % 3200 < 120;
    eyeL.setScale(1, blink ? 0.1 : 1);
    eyeR.setScale(1, blink ? 0.1 : 1);
    pupL.setVisible(!blink);
    pupR.setVisible(!blink);
    tipL.y = -22 + Math.sin(t / 200) * 1.5;
    tipR.y = -22 + Math.sin(t / 200 + 1) * 1.5;
  };
  return c;
}

// Stella: golden star spirit (bonus points)
export function makeStella(scene) {
  const c = scene.add.container(0, 0);
  const glow = scene.add.circle(0, 0, 30, 0xffd54a, 0.22);
  const outer = scene.add.star(0, 0, 5, 11, 24, 0xffc400);
  const inner = scene.add.star(0, 0, 5, 6, 14, 0xfff3a0);
  const eyeL = scene.add.circle(-5, -2, 2.2, 0x3a2a00);
  const eyeR = scene.add.circle(5, -2, 2.2, 0x3a2a00);
  const cheekL = scene.add.circle(-9, 3, 2.5, 0xff9a7a, 0.8);
  const cheekR = scene.add.circle(9, 3, 2.5, 0xff9a7a, 0.8);
  const mouth = scene.add.ellipse(0, 5, 7, 4, 0x3a2a00);
  c.add([glow, outer, inner, cheekL, cheekR, eyeL, eyeR, mouth]);
  c.tick = (t) => {
    outer.rotation = t / 900;
    inner.rotation = -t / 700;
    glow.setScale(1 + 0.12 * Math.sin(t / 200));
    glow.setAlpha(0.2 + 0.1 * Math.sin(t / 200));
  };
  return c;
}

// Voidling: dark hazard with glowing purple eyes
export function makeVoidling(scene) {
  const c = scene.add.container(0, 0);
  const aura = scene.add.circle(0, 0, 34, 0x8a2be2, 0.18);
  const t1 = scene.add.circle(-10, 18, 5, 0x1a0b2e);
  const t2 = scene.add.circle(0, 22, 5, 0x1a0b2e);
  const t3 = scene.add.circle(10, 18, 5, 0x1a0b2e);
  const body = scene.add.circle(0, 0, 20, 0x22103d).setStrokeStyle(2, 0x7b2cff);
  const eyeL = scene.add.ellipse(-7, -3, 8, 12, 0xd36bff);
  const eyeR = scene.add.ellipse(7, -3, 8, 12, 0xd36bff);
  const coreL = scene.add.circle(-7, -3, 2.5, 0xffffff);
  const coreR = scene.add.circle(7, -3, 2.5, 0xffffff);
  c.add([aura, t1, t2, t3, body, eyeL, eyeR, coreL, coreR]);
  c.tick = (t) => {
    aura.setAlpha(0.14 + 0.1 * Math.sin(t / 180));
    aura.setScale(1 + 0.1 * Math.sin(t / 260));
    t1.y = 18 + Math.sin(t / 150) * 3;
    t2.y = 22 + Math.sin(t / 150 + 2) * 3;
    t3.y = 18 + Math.sin(t / 150 + 4) * 3;
    eyeL.setAlpha(0.75 + 0.25 * Math.sin(t / 120));
    eyeR.setAlpha(0.75 + 0.25 * Math.sin(t / 120));
  };
  return c;
}

// Comet Fox: blue fox with a glowing tail (speed boost)
export function makeCometFox(scene) {
  const c = scene.add.container(0, 0);
  const glow = scene.add.circle(0, 0, 28, 0x4db8ff, 0.18);
  const tail = scene.add.ellipse(14, -2, 26, 10, 0x7df9ff, 0.85);
  tail.rotation = -0.7;
  const tip = scene.add.circle(24, -10, 5, 0xffffff, 0.95);
  const body = scene.add.ellipse(0, 6, 22, 20, 0x3aa0ff).setStrokeStyle(1.5, 0x9fd8ff);
  const head = scene.add.circle(0, -7, 10, 0x5cc0ff);
  const earL = scene.add.triangle(-6, -19, 4, 0, 0, 9, 8, 9, 0x5cc0ff);
  const earR = scene.add.triangle(6, -19, 4, 0, 0, 9, 8, 9, 0x5cc0ff);
  const muzzle = scene.add.ellipse(0, -3, 8, 5, 0xd9f2ff);
  const nose = scene.add.circle(0, -4, 1.5, 0x10243f);
  const eyeL = scene.add.circle(-4, -9, 2, 0x10243f);
  const eyeR = scene.add.circle(4, -9, 2, 0x10243f);
  c.add([glow, tail, tip, body, head, earL, earR, muzzle, nose, eyeL, eyeR]);
  c.tick = (t) => {
    const rot = -0.7 + 0.15 * Math.sin(t / 150);
    tail.rotation = rot;
    tip.x = 14 + Math.cos(rot) * 13;
    tip.y = -2 + Math.sin(rot) * 13;
    glow.setAlpha(0.15 + 0.08 * Math.sin(t / 200));
  };
  return c;
}

// Luma: rare rainbow guardian (shield)
export function makeLuma(scene) {
  const c = scene.add.container(0, 0);
  const glow = scene.add.circle(0, 0, 32, 0xffffff, 0.22);
  const orbs = RAINBOW.map((col) => scene.add.circle(0, 0, 4.5, col));
  const body = scene.add.circle(0, 0, 12, 0xfff8ff).setStrokeStyle(2, 0xffffff);
  const eyeL = scene.add.circle(-4, -2, 1.8, 0x3a2a5a);
  const eyeR = scene.add.circle(4, -2, 1.8, 0x3a2a5a);
  const blushL = scene.add.circle(-7, 3, 2.2, 0xff9ec2, 0.9);
  const blushR = scene.add.circle(7, 3, 2.2, 0xff9ec2, 0.9);
  const mouth = scene.add.ellipse(0, 4.5, 5, 2.5, 0x3a2a5a);
  c.add([glow, ...orbs, body, eyeL, eyeR, blushL, blushR, mouth]);
  c.tick = (t) => {
    orbs.forEach((o, i) => {
      const a = t / 500 + (i * Math.PI) / 3;
      o.x = Math.cos(a) * 19;
      o.y = Math.sin(a) * 19;
    });
    glow.setFillStyle(RAINBOW[Math.floor(t / 150) % RAINBOW.length], 0.25);
  };
  return c;
}