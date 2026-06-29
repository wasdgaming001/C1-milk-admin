

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/*.test.{js,jsx}', 
      'public/**/*.test.{js,jsx}', 
      'netlify/**/*.test.{js,jsx}'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.js'],
      exclude: ['src/lib/**/*.test.js'],
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') && /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor';
          }
        },
      },
    },
  },
})