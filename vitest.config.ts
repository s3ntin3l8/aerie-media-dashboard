import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['app/**', 'components/**', 'lib/**'],
      exclude: ['node_modules/', 'tests/setup.ts'],
    },
  },
})
