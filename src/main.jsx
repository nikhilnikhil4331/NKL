import "@fontsource-variable/inter";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
const root = createRoot(document.getElementById("root"));
if (window.wattwiseDesktop) {
  root.render(
    <div className="desktop-loading">Starting Wattwise desktop…</div>,
  );
  window.wattwiseDesktop
    .getState()
    .then((state) => root.render(<App desktopInitial={state} />))
    .catch(() =>
      root.render(
        <div className="desktop-loading">
          <h1>Desktop connection unavailable</h1>
          <p>
            Please quit Wattwise from the tray and reopen it. Saved readings
            will not be replaced.
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>,
      ),
    );
} else root.render(<App />);
