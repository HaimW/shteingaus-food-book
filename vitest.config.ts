import { defineConfig } from 'vitest/config';

// Unit tests for pure modules (no Astro runtime needed).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
