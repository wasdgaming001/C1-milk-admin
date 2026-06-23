import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = build output; .netlify = local functions-serve cache (duplicates of
  // netlify/functions); .tmp = throwaway generators. None should be linted.
  globalIgnores(['dist', '.netlify', '.tmp']),

  // Browser-facing code: the React app, the plain-JS service worker / API client.
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
  },

  // Netlify serverless functions run on Node — they legitimately use
  // `process`, `Buffer`, and ESM `export`. Give them the Node globals so
  // legitimate server-side code isn't flagged as `no-undef`.
  {
    files: ['netlify/functions/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
  },
])
