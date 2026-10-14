import { useEffect, useRef } from "react";
import Phaser from "phaser";
import GameScene from "../scenes/GameScene";

export default function GameCanvas() {
  const parentRef = useRef(null);

  useEffect(() => {
    const el = parentRef.current;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      width: Math.max(1, el.clientWidth),
      height: Math.max(1, el.clientHeight),
      backgroundColor: "#070914",
      physics: { default: "arcade" },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
      input: { activePointers: 2 },
      disableContextMenu: true,
      scene: [GameScene],
    });

    // re-measure on any size change: container, address bar, rotation
    const refresh = () => game.scale.refresh();
    const ro = new ResizeObserver(refresh);
    ro.observe(el);
    let t;
    const onOrient = () => {
      clearTimeout(t);
      t = setTimeout(refresh, 250); // phones report the new size slightly late
    };
    window.addEventListener("orientationchange", onOrient);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", refresh);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("orientationchange", onOrient);
      if (vv) vv.removeEventListener("resize", refresh);
      game.destroy(true);
    };
  }, []);

  return <div ref={parentRef} style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}