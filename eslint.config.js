// ─────────────────────────────────────────────────────────────────────────────
// FILE: eslint.config.js
// ─────────────────────────────────────────────────────────────────────────────
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // ✅ Added 'coverage' here so ESLint ignores the auto-generated test files
  globalIgnores(["dist", ".netlify", ".tmp", ".vite", "coverage"]),

  // Browser-facing code: React app + plain-JS queue/SW
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Flag stray console.log but allow warn/error
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Netlify serverless functions — Node environment
  {
    files: ["functions/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
]);
