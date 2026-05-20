import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    // Exclude compiled output and build artifacts — only run source specs
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
    ],
  },
});
