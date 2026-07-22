import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Pure Node run — core physics/league tests need no DOM. Component smoke-tests
    // can opt into jsdom per-file with a `// @vitest-environment jsdom` header.
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    globals: false,
  },
})
