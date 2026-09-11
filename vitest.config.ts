import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Automatic JSX runtime for the handful of .tsx component tests (e.g.
  // tests/components/*) — without this, esbuild defaults to the classic
  // transform, which needs `React` in scope even though Next.js's own
  // compiler (SWC) never requires that in app code.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['app/api/**/*.ts', 'lib/**/*.ts'],
      exclude: ['lib/prisma.ts', 'lib/auth.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
