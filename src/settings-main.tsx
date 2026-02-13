import React from "react";
import ReactDOM from "react-dom/client";
import Settings from "./components/Settings/Settings";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>,
);
