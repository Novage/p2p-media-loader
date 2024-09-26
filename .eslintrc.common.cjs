module.exports = {
  root: true,
  env: {
    es2021: true,
  },
  extends: [
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
  ],
  plugins: ["@typescript-eslint", "import"],
  ignorePatterns: ["/.eslintrc.cjs", "/lib", "/dist"],
  rules: {
    "no-console": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    curly: ["warn", "multi-line", "consistent"],
    "spaced-comment": ["warn", "always", { markers: ["/"] }],
    "no-debugger": "warn",
    "@typescript-eslint/no-non-null-assertion": "error",
    "import/extensions": [
      "error",
      "always",
      {
        js: "ignorePackages",
        jsx: "never",
        ts: "never",
        tsx: "never",
      },
    ],
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
