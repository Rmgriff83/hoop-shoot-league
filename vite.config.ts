import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Capacitor serves from a relative base so the built assets resolve on device.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
