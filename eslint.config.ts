import tseslint from 'typescript-eslint';
import next from 'eslint-config-next';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', 'work/**', 'packages/db/prisma/**'] },
  ...next,
  ...tseslint.configs.recommended,
  {
    settings: { next: { rootDir: 'apps/web/' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },
);
