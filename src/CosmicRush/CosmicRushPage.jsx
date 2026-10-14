import GameCanvas from "./components/GameCanvas";

export default function CosmicRushPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0, // follows the visible viewport as the mobile address bar shows/hides
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
    </div>
  );
}