import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("[v0] Starting app...");

class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error("[v0] Error caught:", error);
    console.error("[v0] Error info:", errorInfo);
  }

  render() {
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
