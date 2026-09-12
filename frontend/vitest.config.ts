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
    // Vitest's default is 5s, which is marginal for this suite: jsdom plus
    // React Query plus `waitFor` means a slow machine misses the deadline
    // before it misses the assertion.
    //
    // Measured on 2026-09-12 at load average ~16 (the API, Vite, a browser and
    // another editor all running — i.e. exactly a demo laptop): four
    // consecutive full runs failed 1, 7, 4 and 2 DIFFERENT tests, every one a
    // timeout at 5-13s, while each failing file passed in isolation. That is
    // the machine, not the assertions.
    //
    // Raising the deadline weakens nothing. A passing test still passes at the
    // same speed and a genuinely broken one still fails; only the point at
    // which a slow machine is mistaken for a broken one moves.
    //
    // It is a mitigation, not the cure. The cure is
    //
    //     npx vitest run --no-file-parallelism
    //
    // which was green at 302/302 on the same loaded machine where four
    // parallel runs each failed a different test. Vitest runs files across
    // all cores by default, and on a box that is already saturated the
    // workers contend rather than parallelise. Parallelism is left ON here
    // because it is 12s against 154s on a healthy machine and that is the
    // right default for a dev loop — but before a demo, or in CI on a shared
    // runner, use the sequential flag and trust it.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
