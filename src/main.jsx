import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { AppShell } from "./components/AppShell.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("app-root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </React.StrictMode>,
);
