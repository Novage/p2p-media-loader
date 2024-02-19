module.exports = {
  root: true,
  env: {
    es2021: true,
  },
  extends: [
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
  ],
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["/lib", "/dist", "/vite.config.ts"],
  rules: {
    "no-console": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    curly: ["warn", "multi-line", "consistent"],
    "spaced-comment": ["warn", "always", { markers: ["/"] }],
    "no-debugger": "warn",
  },
};
