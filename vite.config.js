// ─────────────────────────────────────────────────────────────────────────────
// FILE: vite.config.js
// Fix #13: added build.manifest so .vite/manifest.json is emitted. This lets
// a future workbox/build-time SW know the exact hashed filenames without
// hard-coding them. Also sets a modern browser target to keep bundle lean.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Emit .vite/manifest.json — maps logical names → hashed output filenames.
    // Useful if you later adopt a build-time service-worker plugin (e.g. workbox).
    manifest: true,
    // Target modern browsers that support ESM, crypto.randomUUID, etc.
    // Keeps the bundle ~10-15% smaller by skipping legacy polyfills.
    target: ['chrome92', 'firefox95', 'safari15'],
  },
})