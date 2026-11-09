// Minimal placeholder shell. Task 15 replaces it with the App_Shell and
// injects crypto.randomUUID and window.localStorage into the app.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function PlaceholderShell() {
  return (
    <>
      <header>
        <h1>NecroCard</h1>
      </header>
      <main></main>
    </>
  );
}

const container = document.getElementById("root");
if (container === null) {
  throw new Error("NecroCard: #root element not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <PlaceholderShell />
  </StrictMode>,
);
