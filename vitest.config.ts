import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    // Unit tests — fast, no DB, all external calls mocked
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['**/__tests__/**/*.integration.test.ts', 'node_modules'],
  },
})