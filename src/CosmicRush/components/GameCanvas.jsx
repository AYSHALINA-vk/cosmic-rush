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
      width: el.clientWidth,
      height: el.clientHeight,
      backgroundColor: "#05070f",
      physics: { default: "arcade" },
      scale: { mode: Phaser.Scale.RESIZE },
      scene: [GameScene],
    });

    return () => game.destroy(true);
  }, []);

  return <div ref={parentRef} style={{ width: "100%", height: "100%" }} />;
}