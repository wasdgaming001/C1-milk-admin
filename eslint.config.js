// ─────────────────────────────────────────────────────────────────────────────
// FILE: eslint.config.js
// Fix #12: added no-console rule.
//   - warn on console.log (debug traces shouldn't ship to production)
//   - allow console.warn / console.error (legitimate runtime diagnostics)
// Applied to both the browser block (App.jsx, app.js, sw.js) and the Node
// block (proxy.js). Both files already use only warn/error — zero new lint
// errors introduced; only future console.log calls will be caught.
// ─────────────────────────────────────────────────────────────────────────────
import js            from '@eslint/js'
import globals        from 'globals'
import reactHooks     from 'eslint-plugin-react-hooks'
import reactRefresh   from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.netlify', '.tmp', '.vite']),

  // Browser-facing code: React app + plain-JS queue/SW
  {
    files: ['**/*.{js,jsx}'],
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
      // Fix #12 — flag stray console.log but allow warn/error
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Netlify serverless functions — Node environment
  {
    files: ['netlify/functions/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
])