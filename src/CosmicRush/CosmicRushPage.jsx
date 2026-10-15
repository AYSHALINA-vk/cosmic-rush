import GameCanvas from "./components/GameCanvas";
import LeaderboardOverlay from "./components/LeaderboardOverlay";

export default function CosmicRushPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
        boxSizing: "border-box",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <GameCanvas />
      <LeaderboardOverlay />
    </div>
  );
}