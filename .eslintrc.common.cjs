module.exports = {
  root: true,
  env: {
    es2021: true
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  plugins: ["@typescript-eslint", "prettier"],
  ignorePatterns: ["/.eslintrc.cjs", "/lib", "/dist", "/vite.config.ts"],
  rules: {
    "prettier/prettier": "error",
    "no-console": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "curly": ["warn", "multi-line", "consistent"],
    "spaced-comment": ["warn", "always", { "markers": ["/"] }],
    "@typescript-eslint/no-non-null-assertion": 0
  }
};
