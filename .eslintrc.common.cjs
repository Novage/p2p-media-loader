module.exports = {
  root: true,
  env: {
    es2021: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["@typescript-eslint", "prettier"],
  ignorePatterns: ["/.eslintrc.cjs", "/lib", "/dist"],
  rules: {
    "prettier/prettier": "error",
  },
};
