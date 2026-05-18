import tseslint from "typescript-eslint";
import eslintConfigNext from "eslint-config-next";

// ---------------------------------------------------------------------------
// API — NestJS / CommonJS TypeScript
// ---------------------------------------------------------------------------
// Strategy: disable overly-strict TypeScript recommended rules globally (off),
// then selectively re-enable them as warnings only for API source files.
// ---------------------------------------------------------------------------
const apiConfig = tseslint.config(
  tseslint.configs.recommended[1],
  {
    // Register @typescript-eslint plugin and disable the strict rules globally.
    // They will be re-enabled selectively per-file below.
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...tseslint.configs.recommended[2].rules,
      // Global off for rules we want to soften
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      // Also off for prefer-const globally — will re-enable per-file
      "prefer-const": "off",
    },
  },
  {
    // Per-file: re-enable as warnings for API source files.
    files: ["apps/api/src/**/*.ts"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  }
);

// ---------------------------------------------------------------------------
// Web — Next.js (flat config) + TypeScript layered on top
// eslint-config-next (v16) provides React/JSX/Next.js/a11y rules.
// eslint-config-next's "next" config sets prefer-const: error globally via
// tseslint.configs.recommended[1].  To override it as warn per-file we must
// also set it to off globally in the plugin-bearing config, then warn per-file.
// ---------------------------------------------------------------------------
const webConfig = tseslint.config(
  // 1. Next.js / React / a11y base rules (eslint-config-next flat config)
  ...eslintConfigNext,
  // 2. Base ESLint recommended rules
  tseslint.configs.recommended[1],
  // 3. @typescript-eslint/* rules — off globally
  {
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...tseslint.configs.recommended[2].rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      // eslint-config-next inherits prefer-const: error from recommended[1].
      // Disable it globally here, then warn per-file below.
      "prefer-const": "off",
    },
  },
  // 4. Per-file: re-enable as warnings for web source
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: { sourceType: "module" },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  }
);

// ---------------------------------------------------------------------------
// Shared packages
// ---------------------------------------------------------------------------
const packagesConfig = tseslint.config(
  {
    files: ["packages/**/*.ts"],
    languageOptions: { sourceType: "module" },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-unused-vars": "off",
      "prefer-const": "warn",
    },
  },
  tseslint.configs.recommended[1],
  {
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...tseslint.configs.recommended[2].rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
    },
  }
);

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/out/**",
      "**/*.min.js",
      "**/vendor/**",
      "apps/api/prisma/**",
    ],
  },
  ...apiConfig,
  {
    // JS scripts in api root — no TS rules needed
    files: ["apps/api/*.js"],
    ...(tseslint.configs.recommended[1]?.rules
      ? { rules: tseslint.configs.recommended[1].rules }
      : {}),
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  ...webConfig,
  ...packagesConfig
);
