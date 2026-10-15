import { useEffect, useRef, useState } from "react";
import { MAX_NAME, getPlayerName, getRankedScores, renamePlayer } from "../data/leaderboard";

// GameScene announces its phase with this window event:
//   { phase: "playing" }  or  { phase: "gameover", score, isNewBest, prevBest, name }
const STATE_EVENT = "cosmicrush:state";
const SHOW_TOP = 10;
const CONFETTI_COLORS = ["#FFD56A", "#19DDF5", "#FF5BC8", "#7651E8", "#ffffff"];

// ------------------------------------------------------------------ icons

const MEDALS = {
  1: { a: "#fff3b0", b: "#ffd56a", c: "#9a6a00", glow: "#ffd56a" },
  2: { a: "#ffffff", b: "#cfd8e8", c: "#66728c", glow: "#cfe3ff" },
  3: { a: "#ffd9b8", b: "#d9904f", c: "#7a3f16", glow: "#ff9a52" },
};

function Medal({ rank }) {
  const m = MEDALS[rank];
  const id = `cc-medal-${rank}`;
  return (
    <svg
      className="cc-medal"
      viewBox="0 0 40 48"
      width="34"
      height="40"
      role="img"
      aria-label={`Rank ${rank}`}
      style={{ filter: `drop-shadow(0 0 6px ${m.glow}cc)` }}
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="28%" r="85%">
          <stop offset="0" stopColor={m.a} />
          <stop offset="0.55" stopColor={m.b} />
          <stop offset="1" stopColor={m.c} />
        </radialGradient>
      </defs>
      <polygon points="9,1 20,21 14,23 2,3" fill="#7651E8" />
      <polygon points="31,1 20,21 26,23 38,3" fill="#19DDF5" />
      <circle cx="20" cy="31" r="14" fill={`url(#${id})`} stroke={m.a} strokeWidth="1.5" />
      <circle cx="20" cy="31" r="10.5" fill="none" stroke={m.c} strokeOpacity="0.45" strokeWidth="1" />
      <ellipse cx="14.5" cy="25" rx="4.5" ry="2.4" fill="#fff" opacity="0.45" transform="rotate(-35 14.5 25)" />
      <text x="20" y="36" textAnchor="middle" fontSize="14" fontWeight="800" fill={m.c} fontFamily="Orbitron, system-ui, sans-serif">
        {rank}
      </text>
    </svg>
  );
}

function Trophy({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" fill="currentColor" fillOpacity="0.25" />
      <path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4" />
      <path d="M12 13v4M10 17h4v3h-4zM8.5 20h7" />
    </svg>
  );
}

// ------------------------------------------------------------------ animated background

const ORION = {
  pts: [[0.4, 0.55], [0.5, 0.5], [0.6, 0.45], [0.22, 0.08], [0.78, 0.12], [0.3, 0.97], [0.82, 0.92]],
  links: [[0, 1], [1, 2], [3, 0], [4, 2], [3, 4], [5, 0], [6, 2]],
};
const CASSIOPEIA = {
  pts: [[0, 0.25], [0.22, 0.85], [0.5, 0.4], [0.76, 0.9], [1, 0.3]],
  links: [[0, 1], [1, 2], [2, 3], [3, 4]],
};

// twinkling stars, two faint constellations and the odd shooting star, drawn on one canvas
function Starfield() {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;
    const host = cv.parentElement;
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let nextShoot = 1500;
    let stars = [];
    const shoots = [];

    const build = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(110, Math.round((w * h) / 6000));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        p: Math.random() * 6.28,
        s: Math.random() * 1.4 + 0.5,
        vy: Math.random() * 5 + 1.5,
      }));
    };

    const figure = (fig, x0, y0, fw, fh, t) => {
      const P = fig.pts.map(([x, y]) => [x0 + x * fw, y0 + y * fh]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(25,221,245,0.24)";
      ctx.beginPath();
      for (const [a, b] of fig.links) {
        ctx.moveTo(P[a][0], P[a][1]);
        ctx.lineTo(P[b][0], P[b][1]);
      }
      ctx.stroke();
      P.forEach(([x, y], i) => {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t / 900 + i * 1.7);
        ctx.shadowColor = "#19DDF5";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#d6fbff";
        ctx.beginPath();
        ctx.arc(x, y, 1.9, 0, 6.283);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    const draw = (t, dt) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (!reduce) {
          s.y += s.vy * dt;
          if (s.y > h + 2) {
            s.y = -2;
            s.x = Math.random() * w;
          }
        }
        ctx.globalAlpha = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin((t / 1000) * s.s + s.p))) * 0.85;
        ctx.fillStyle = "#cfe8ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      figure(ORION, w * 0.7, h * 0.02, w * 0.26, h * 0.2, t);
      figure(CASSIOPEIA, w * 0.05, h * 0.82, w * 0.3, h * 0.08, t);

      if (reduce) return;
      nextShoot -= dt * 1000;
      if (nextShoot <= 0) {
        shoots.push({
          x: Math.random() * w * 0.7,
          y: Math.random() * h * 0.35,
          vx: 420 + Math.random() * 220,
          vy: 210 + Math.random() * 120,
          life: 0.9,
          max: 0.9,
        });
        nextShoot = 3000 + Math.random() * 4000;
      }
      for (let i = shoots.length - 1; i >= 0; i--) {
        const s = shoots[i];
        s.life -= dt;
        if (s.life <= 0) {
          shoots.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const a = Math.sin(Math.PI * (1 - s.life / s.max));
        const tx = s.x - s.vx * 0.18;
        const ty = s.y - s.vy * 0.18;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
        g.addColorStop(1, "rgba(25,221,245,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
    };

    const loop = (now) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      draw(now, dt);
      raf = requestAnimationFrame(loop);
    };

    build();
    const ro = new ResizeObserver(() => {
      build();
      if (reduce) draw(0, 0);
    });
    ro.observe(host);
    if (reduce) draw(0, 0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="cc-canvas" aria-hidden="true" />;
}

// ------------------------------------------------------------------ rows

function Row({ entry, index, isMe, flash }) {
  const cls = ["cc-row", entry.rank <= 3 ? `cc-r${entry.rank}` : "", isMe ? "cc-me" : "", isMe && flash ? "cc-flash" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={cls} style={{ "--d": `${0.3 + index * 0.06}s` }}>
      <div className="cc-rank">{entry.rank <= 3 ? <Medal rank={entry.rank} /> : <span>{entry.rank}</span>}</div>
      <div className="cc-name">
        <span className="cc-nm">{entry.name}</span>
        {isMe && <span className="cc-you">YOU</span>}
      </div>
      <div className="cc-score">{entry.score.toLocaleString()}</div>
    </li>
  );
}

const SPARKS = [
  { top: "6%", left: "9%", d: "0s" },
  { top: "30%", left: "3%", d: "0.9s" },
  { top: "12%", left: "86%", d: "1.4s" },
  { top: "62%", left: "94%", d: "0.5s" },
  { top: "70%", left: "12%", d: "1.9s" },
  { top: "4%", left: "52%", d: "2.2s" },
];

// ------------------------------------------------------------------ the rankings dialog

function Rankings({ lastRun, onClose }) {
  const [name, setName] = useState(() => getPlayerName());
  const [board, setBoard] = useState(() => getRankedScores());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [shake, setShake] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const live = useRef({ editing: false, onClose });

  useEffect(() => {
    live.current = { editing, onClose };
  });

  // Keys typed inside the dialog must never reach Phaser (SPACE/ENTER restart the game and A/D are
  // captured), so they are stopped here with native listeners that work in every React version.
  useEffect(() => {
    const el = rootRef.current;
    el.focus();
    const onKey = (e) => {
      e.stopPropagation();
      if (e.type !== "keydown") return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (live.current.editing) setEditing(false);
        else live.current.onClose();
        return;
      }
      if (e.key === "Tab") {
        const f = [...el.querySelectorAll("button:not([disabled]), input")];
        if (!f.length) return;
        const first = f[0];
        const lastEl = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === el)) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
    };
  }, []);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const [confetti] = useState(() =>
    Array.from({ length: 26 }, (_, i) => ({
      dx: (Math.random() - 0.5) * 320,
      dy: -30 - Math.random() * 140,
      r: (Math.random() - 0.5) * 720,
      d: 0.5 + Math.random() * 0.3,
      c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  );

  const total = board.length;
  const me = board.find((e) => e.name === name) || null;
  const above = me && me.rank > 1 ? board[me.rank - 2] : null;
  const below = me && me.rank < total ? board[me.rank] : null;
  const top = board.slice(0, SHOW_TOP);
  const meOutside = me && me.rank > SHOW_TOP;
  const isPB = !!(lastRun && lastRun.isNewBest && me && me.score === lastRun.score);

  const need = above ? above.score - me.score + 1 : 0; // strictly more than them, ties rank the earlier score first
  const progress = above ? Math.min(1, me.score / above.score) : 1;
  const pilots = total === 1 ? "PILOT" : "PILOTS";

  const submit = (e) => {
    e.preventDefault();
    const next = renamePlayer(name, draft);
    if (!next) {
      setShake(true);
      return;
    }
    setName(next);
    setBoard(getRankedScores());
    setEditing(false);
  };

  return (
    <div
      ref={rootRef}
      className="cc-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Galactic Rankings"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cc-frame">
        <div className="cc-panel">
          <Starfield />

          <header className="cc-head">
            {SPARKS.map((s, i) => (
              <i key={i} className="cc-spark" style={{ top: s.top, left: s.left, animationDelay: s.d }} />
            ))}
            <h2 className="cc-title">GALACTIC RANKINGS</h2>
            <div className="cc-sub">COSMIC CHAMPIONSHIP</div>
          </header>

          <p className="cc-msg">
            {me
              ? me.rank === 1
                ? `YOU ARE #1 · CHAMPION OF ${total} ${pilots}`
                : `YOU ARE RANKED #${me.rank} OF ${total} ${pilots}`
              : `PILOT ${name} · PLAY A RUN TO ENTER THE RANKINGS`}
          </p>

          {isPB && (
            <div className="cc-pb">
              <span className="cc-pb-trophy">
                <Trophy size={26} />
              </span>
              <div>
                <b>NEW PERSONAL BEST!</b>
                <small>
                  {lastRun.score.toLocaleString()} PTS
                  {lastRun.prevBest > 0 ? ` · +${(lastRun.score - lastRun.prevBest).toLocaleString()} OVER YOUR LAST BEST` : ""}
                </small>
              </div>
              {confetti.map((c, i) => (
                <i
                  key={i}
                  className="cc-confetti"
                  style={{ "--dx": `${c.dx}px`, "--dy": `${c.dy}px`, "--r": `${c.r}deg`, "--d": `${c.d}s`, "--c": c.c }}
                />
              ))}
            </div>
          )}

          {me && (
            <div className="cc-next">
              {above ? (
                <>
                  <div className="cc-next-top">
                    <span>NEXT: {above.name}</span>
                    <span>
                      <b>{need.toLocaleString()}</b> PTS TO OVERTAKE
                    </span>
                  </div>
                  <div className="cc-bar">
                    <div className="cc-bar-fill" style={{ "--p": progress }} />
                  </div>
                </>
              ) : (
                <>
                  <div className="cc-next-top">
                    <span>YOU LEAD THE GALAXY</span>
                    <span>
                      {below ? (
                        <>
                          AHEAD OF {below.name} BY <b>{(me.score - below.score).toLocaleString()}</b> PTS
                        </>
                      ) : (
                        "NO RIVALS YET"
                      )}
                    </span>
                  </div>
                  <div className="cc-bar">
                    <div className="cc-bar-fill lead" style={{ "--p": 1 }} />
                  </div>
                </>
              )}
            </div>
          )}

          <ol className="cc-list" aria-label="Leaderboard">
            {top.length === 0 && <li className="cc-empty">NO SCORES YET. BE THE FIRST TO ENTER THE RANKINGS.</li>}
            {top.map((e, i) => (
              <Row key={e.name} entry={e} index={i} isMe={e.name === name} flash={isPB} />
            ))}
            {meOutside && (
              <>
                <li className="cc-gap" aria-hidden="true">
                  · · ·
                </li>
                <Row entry={me} index={top.length + 1} isMe flash={isPB} />
              </>
            )}
          </ol>

          <footer className="cc-foot">
            {editing ? (
              <form className="cc-edit" onSubmit={submit}>
                <input
                  ref={inputRef}
                  className={`cc-input${shake ? " cc-shake" : ""}`}
                  value={draft}
                  maxLength={MAX_NAME}
                  onChange={(e) => setDraft(e.target.value)}
                  onAnimationEnd={() => setShake(false)}
                  placeholder="PILOT NAME"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="Player name"
                />
                <button type="submit" className="cc-btn primary">
                  SAVE
                </button>
                <button type="button" className="cc-btn" onClick={() => setEditing(false)}>
                  CANCEL
                </button>
              </form>
            ) : (
              <div className="cc-actions">
                <button
                  type="button"
                  className="cc-btn"
                  onClick={() => {
                    setDraft(name);
                    setEditing(true);
                  }}
                >
                  CHANGE NAME
                </button>
                <button type="button" className="cc-btn primary" onClick={onClose}>
                  CLOSE
                </button>
              </div>
            )}
            <div className="cc-note">LOCAL RANKINGS · SAVED ON THIS DEVICE</div>
          </footer>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page-level wrapper

export default function LeaderboardOverlay() {
  const [phase, setPhase] = useState("playing");
  const [lastRun, setLastRun] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onState = (e) => {
      const d = e.detail || {};
      if (d.phase === "gameover") {
        setPhase("gameover");
        setLastRun({ score: d.score || 0, isNewBest: !!d.isNewBest, prevBest: d.prevBest || 0 });
      } else {
        setPhase("playing");
        setOpen(false);
      }
    };
    window.addEventListener(STATE_EVENT, onState);
    return () => window.removeEventListener(STATE_EVENT, onState);
  }, []);

  // press L on the game-over screen to open the rankings
  useEffect(() => {
    if (phase !== "gameover" || open) return undefined;
    const onKey = (e) => {
      if (e.key === "l" || e.key === "L") setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, open]);

  return (
    <>
      <style>{CSS}</style>
      {phase === "gameover" && !open && (
        <button type="button" className="cc-open" onClick={() => setOpen(true)} title="Open rankings (L)">
          <Trophy size={16} />
          RANKINGS
        </button>
      )}
      {open && <Rankings lastRun={lastRun} onClose={() => setOpen(false)} />}
    </>
  );
}

// ------------------------------------------------------------------ styles

const CSS = `
.cc-open, .cc-backdrop { --cc-font: "Orbitron", "Segoe UI", system-ui, sans-serif; font-family: var(--cc-font); }

.cc-open {
  position: absolute; z-index: 40;
  top: calc(env(safe-area-inset-top, 0px) + 12px); right: calc(env(safe-area-inset-right, 0px) + 12px);
  display: flex; align-items: center; gap: 8px; padding: 10px 15px; border-radius: 999px;
  border: 1px solid rgba(25,221,245,.6); color: #d9fbff; cursor: pointer;
  font: 800 12px/1 var(--cc-font); letter-spacing: .14em;
  background: linear-gradient(135deg, rgba(118,81,232,.4), rgba(25,221,245,.14));
  box-shadow: 0 0 18px rgba(25,221,245,.28), inset 0 0 12px rgba(118,81,232,.28);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  animation: cc-pop .5s cubic-bezier(.2,.9,.3,1.3) .9s both;
  transition: transform .15s, box-shadow .2s; -webkit-tap-highlight-color: transparent;
}
.cc-open:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 0 28px rgba(25,221,245,.55), inset 0 0 14px rgba(118,81,232,.4); }
.cc-open:focus-visible, .cc-btn:focus-visible { outline: 2px solid #19DDF5; outline-offset: 3px; }

.cc-backdrop {
  position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; padding: 12px; outline: none;
  background: radial-gradient(ellipse at 50% 20%, rgba(70,45,160,.4), rgba(4,5,14,.9) 72%);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  animation: cc-fade .35s ease both;
}

/* animated border: a conic gradient spins behind a 1.5px gap, the panel sits on top */
.cc-frame {
  position: relative; width: min(460px, 100%); display: flex; padding: 1.5px; border-radius: 22px; overflow: hidden;
  max-height: min(calc(100vh - 24px), 760px); max-height: min(calc(100dvh - 24px), 760px);
  box-shadow: 0 0 50px rgba(118,81,232,.35), 0 0 90px rgba(25,221,245,.12);
  animation: cc-rise .6s cubic-bezier(.2,.8,.2,1) both;
}
.cc-frame::before {
  content: ""; position: absolute; inset: -60%;
  background: conic-gradient(from 0deg, transparent 0 55%, #19DDF5 68%, #7651E8 80%, #FF5BC8 90%, transparent 100%);
  animation: cc-spin 7s linear infinite;
}
.cc-panel {
  position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
  padding: 20px 16px 14px; border-radius: 20.5px; color: #e8f2ff;
  background:
    radial-gradient(120% 70% at 85% -10%, rgba(118,81,232,.55), transparent 60%),
    radial-gradient(90% 60% at 0% 40%, rgba(32,70,200,.38), transparent 65%),
    radial-gradient(80% 60% at 100% 100%, rgba(255,91,200,.22), transparent 65%),
    linear-gradient(180deg, rgba(10,14,40,.94), rgba(6,8,24,.96));
}
.cc-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cc-panel > *:not(.cc-canvas) { position: relative; z-index: 1; }

.cc-head { text-align: center; padding: 2px 0 8px; }
.cc-title {
  margin: 0; font-size: clamp(19px, 5.6vw, 29px); font-weight: 800; letter-spacing: .14em; color: #b9f8ff;
  text-shadow: 0 0 6px rgba(25,221,245,.9), 0 0 18px rgba(25,221,245,.55), 0 0 40px rgba(118,81,232,.55);
  animation: cc-glow 3.2s ease-in-out infinite;
}
.cc-sub { margin-top: 6px; font-size: 10px; letter-spacing: .42em; color: #9bb7ff; opacity: .85; }
.cc-spark {
  position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 6px 2px rgba(25,221,245,.8); animation: cc-twinkle 2.6s ease-in-out infinite;
}

.cc-msg {
  margin: 4px 0 10px; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .1em; color: #19DDF5;
  text-shadow: 0 0 10px rgba(25,221,245,.6);
}

.cc-pb {
  display: flex; align-items: center; gap: 12px; margin: 0 2px 12px; padding: 10px 14px; border-radius: 14px;
  border: 1px solid rgba(255,213,106,.6); background: linear-gradient(90deg, rgba(255,213,106,.2), rgba(255,91,200,.12));
  box-shadow: 0 0 26px rgba(255,213,106,.3); animation: cc-pbpop .7s cubic-bezier(.2,.9,.3,1.4) .35s both;
}
.cc-pb b { display: block; font-size: 13px; letter-spacing: .14em; color: #FFD56A; text-shadow: 0 0 12px rgba(255,213,106,.7); }
.cc-pb small { display: block; margin-top: 3px; font-size: 9px; letter-spacing: .06em; color: #ffe9b8; }
.cc-pb-trophy {
  flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; color: #FFD56A;
  background: radial-gradient(circle, rgba(255,213,106,.3), transparent 70%); animation: cc-trophy 1.6s ease-in-out .9s infinite;
}
.cc-confetti {
  position: absolute; left: 30px; top: 50%; width: 6px; height: 10px; border-radius: 2px; background: var(--c);
  opacity: 0; pointer-events: none; animation: cc-confetti 1.4s cubic-bezier(.1,.7,.3,1) var(--d) both;
}

.cc-next { margin: 0 2px 12px; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(118,81,232,.45); background: rgba(10,14,40,.55); }
.cc-next-top { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; letter-spacing: .08em; color: #b9c6ff; }
.cc-next-top b { color: #FFD56A; font-weight: 800; }
.cc-bar { margin-top: 8px; height: 8px; border-radius: 99px; background: rgba(255,255,255,.08); overflow: hidden; }
.cc-bar-fill {
  height: 100%; width: calc(var(--p, 0) * 100%); border-radius: inherit;
  background: linear-gradient(90deg, #7651E8, #19DDF5); box-shadow: 0 0 12px rgba(25,221,245,.7);
  animation: cc-fill 1.2s cubic-bezier(.2,.8,.2,1) .55s both;
}
.cc-bar-fill.lead { background: linear-gradient(90deg, #FFD56A, #FF5BC8); box-shadow: 0 0 12px rgba(255,213,106,.7); }

.cc-list {
  list-style: none; margin: 0; padding: 2px 2px 4px; display: flex; flex-direction: column; gap: 7px;
  flex: 1; min-height: 0; overflow-y: auto; touch-action: pan-y; -webkit-overflow-scrolling: touch;
  scrollbar-width: thin; scrollbar-color: rgba(118,81,232,.6) transparent;
}
.cc-row {
  display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 8px; padding: 8px 12px 8px 8px;
  border-radius: 13px; border: 1px solid rgba(155,183,255,.16); background: rgba(14,20,52,.62);
  animation: cc-row-in .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d, 0s);
}
.cc-rank { display: grid; place-items: center; font-size: 14px; font-weight: 800; color: #9bb7ff; }
.cc-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; font-weight: 700; letter-spacing: .08em; }
.cc-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-score { font-size: 15px; font-weight: 800; color: #FFD56A; font-variant-numeric: tabular-nums; text-shadow: 0 0 10px rgba(255,213,106,.35); }
.cc-you {
  flex: none; padding: 2px 7px; border-radius: 99px; font-size: 9px; font-weight: 800; letter-spacing: .14em; color: #06121a;
  background: linear-gradient(90deg, #19DDF5, #7DF9FF); box-shadow: 0 0 10px rgba(25,221,245,.8);
}
.cc-r1 { border-color: rgba(255,213,106,.55); background: linear-gradient(90deg, rgba(255,213,106,.2), rgba(255,213,106,.04)); box-shadow: 0 0 18px rgba(255,213,106,.22); }
.cc-r2 { border-color: rgba(207,227,255,.5); background: linear-gradient(90deg, rgba(207,227,255,.15), rgba(207,227,255,.03)); box-shadow: 0 0 16px rgba(207,227,255,.16); }
.cc-r3 { border-color: rgba(255,154,82,.5); background: linear-gradient(90deg, rgba(255,154,82,.16), rgba(255,154,82,.03)); box-shadow: 0 0 16px rgba(255,154,82,.16); }
.cc-r1 .cc-medal { animation: cc-medal 2.6s ease-in-out infinite; }
.cc-me {
  border-color: #19DDF5; background: linear-gradient(90deg, rgba(25,221,245,.16), rgba(118,81,232,.14));
  box-shadow: 0 0 0 1px rgba(25,221,245,.35), 0 0 20px rgba(25,221,245,.5), inset 0 0 14px rgba(25,221,245,.14);
  animation: cc-row-in .5s cubic-bezier(.2,.8,.2,1) both, cc-neon 2.4s ease-in-out infinite;
  animation-delay: var(--d, 0s), calc(var(--d, 0s) + .5s);
}
.cc-me.cc-flash {
  animation: cc-row-in .5s cubic-bezier(.2,.8,.2,1) both, cc-neon 2.4s ease-in-out infinite, cc-flash 1.4s ease-out both;
  animation-delay: var(--d, 0s), calc(var(--d, 0s) + .5s), calc(var(--d, 0s) + .5s);
}
.cc-gap { text-align: center; color: #7a86b8; letter-spacing: .5em; font-size: 12px; }
.cc-empty { padding: 26px 12px; text-align: center; font-size: 12px; letter-spacing: .1em; color: #9bb7ff; }

.cc-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.cc-actions { display: flex; gap: 10px; }
.cc-actions .cc-btn { flex: 1; }
.cc-edit { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-btn {
  font: 800 12px/1 var(--cc-font); letter-spacing: .16em; padding: 13px 14px; border-radius: 12px; cursor: pointer; color: #dffaff;
  border: 1px solid rgba(118,81,232,.7); background: linear-gradient(135deg, rgba(118,81,232,.28), rgba(14,20,60,.7));
  box-shadow: 0 0 14px rgba(118,81,232,.3), inset 0 0 10px rgba(118,81,232,.18);
  transition: transform .15s, box-shadow .2s, border-color .2s; -webkit-tap-highlight-color: transparent;
}
.cc-btn:hover { transform: translateY(-1px); border-color: #a98bff; box-shadow: 0 0 22px rgba(118,81,232,.55), inset 0 0 12px rgba(118,81,232,.3); }
.cc-btn:active { transform: scale(.97); }
.cc-btn.primary {
  border-color: #19DDF5; color: #e8fdff; background: linear-gradient(135deg, rgba(25,221,245,.38), rgba(118,81,232,.4));
  box-shadow: 0 0 18px rgba(25,221,245,.4), inset 0 0 12px rgba(25,221,245,.2);
}
.cc-btn.primary:hover { border-color: #7DF9FF; box-shadow: 0 0 30px rgba(25,221,245,.7), inset 0 0 14px rgba(25,221,245,.3); }
.cc-input {
  flex: 1 1 140px; min-width: 0; padding: 12px; border-radius: 12px; border: 1px solid rgba(25,221,245,.6);
  background: rgba(6,10,30,.8); color: #e8fdff; font: 700 16px/1 var(--cc-font); letter-spacing: .12em; text-transform: uppercase;
  outline: none; user-select: text; -webkit-user-select: text; box-shadow: inset 0 0 12px rgba(25,221,245,.12);
}
.cc-input:focus { box-shadow: 0 0 0 2px rgba(25,221,245,.35), 0 0 18px rgba(25,221,245,.4); }
.cc-shake { animation: cc-shake .35s; }
.cc-note { text-align: center; font-size: 9px; letter-spacing: .2em; color: #6f7bab; }

@keyframes cc-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes cc-rise { from { opacity: 0; transform: translateY(24px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes cc-spin { to { transform: rotate(360deg) } }
@keyframes cc-glow {
  0%, 100% { text-shadow: 0 0 6px rgba(25,221,245,.9), 0 0 18px rgba(25,221,245,.55), 0 0 40px rgba(118,81,232,.55) }
  50% { text-shadow: 0 0 9px rgba(25,221,245,1), 0 0 28px rgba(25,221,245,.8), 0 0 56px rgba(118,81,232,.75) }
}
@keyframes cc-twinkle { 0%, 100% { opacity: .15; transform: scale(.6) } 50% { opacity: 1; transform: scale(1.2) } }
@keyframes cc-row-in { from { opacity: 0; transform: translateX(-18px) } to { opacity: 1; transform: none } }
@keyframes cc-neon {
  0%, 100% { box-shadow: 0 0 0 1px rgba(25,221,245,.35), 0 0 16px rgba(25,221,245,.4), inset 0 0 12px rgba(25,221,245,.12) }
  50% { box-shadow: 0 0 0 1px rgba(25,221,245,.6), 0 0 28px rgba(25,221,245,.75), inset 0 0 18px rgba(25,221,245,.22) }
}
@keyframes cc-flash { 0% { filter: brightness(2.2) } 100% { filter: brightness(1) } }
@keyframes cc-fill { from { width: 0 } }
@keyframes cc-pbpop { from { opacity: 0; transform: scale(.85) } to { opacity: 1; transform: none } }
@keyframes cc-trophy { 0%, 100% { transform: translateY(0) rotate(0) } 25% { transform: translateY(-3px) rotate(-6deg) } 75% { transform: translateY(-3px) rotate(6deg) } }
@keyframes cc-confetti {
  0% { opacity: 1; transform: translate(0, 0) rotate(0) }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)) }
}
@keyframes cc-medal { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.1) rotate(-3deg) } }
@keyframes cc-pop { from { opacity: 0; transform: scale(.7) } to { opacity: 1; transform: none } }
@keyframes cc-shake { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(-6px) } 75% { transform: translateX(6px) } }

@media (prefers-reduced-motion: reduce) {
  .cc-open, .cc-backdrop, .cc-backdrop * { animation: none !important; transition: none !important; }
  .cc-frame::before { animation: none !important; }
  .cc-confetti { display: none; }
}
`;
