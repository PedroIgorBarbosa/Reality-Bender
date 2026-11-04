import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@client': resolve(process.cwd(), 'src/client'),
      '@server': resolve(process.cwd(), 'src/server'),
      '@shared': resolve(process.cwd(), 'src/shared'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
