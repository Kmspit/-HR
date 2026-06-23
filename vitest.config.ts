import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
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
