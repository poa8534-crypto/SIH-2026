import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The plugin is cast because vitest bundles its own copy of vite: the plugin
// is built against the top-level vite and the two Plugin types are nominally
// different even though they are the same shape at runtime. Confined to this
// config file so no app code carries the cast.
export default defineConfig({
  plugins: [react() as never],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
