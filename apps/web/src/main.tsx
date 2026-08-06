import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";

const rootElement = globalThis.document.getElementById("root");

if (!rootElement) {
  throw new Error("缺少根元素");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
