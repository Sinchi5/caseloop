/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths + HashRouter: the same build works on GitHub Pages under /caseloop/ and locally.
  base: './',
  test: { include: ['src/**/*.test.ts'] },
})
