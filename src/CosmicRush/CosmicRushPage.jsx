import GameCanvas from "./components/GameCanvas";

export default function CosmicRushPage() {
  return (
    <div style={{ height: "100vh", background: "#000", overflow: "hidden" }}>
      <GameCanvas />
    </div>
  );
}