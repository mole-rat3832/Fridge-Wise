import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The edge functions import npm packages with Deno specifiers; map them for Node.
    alias: [{ find: /^npm:zod@[\d.]+$/, replacement: 'zod' }],
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
