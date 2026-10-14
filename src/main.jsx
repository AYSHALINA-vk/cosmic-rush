import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CosmicRushPage from "./CosmicRush/CosmicRushPage";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CosmicRushPage />
  </StrictMode>
);