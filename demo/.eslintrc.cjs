module.exports = {
  env: { es2020: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
    project: ["tsconfig.json", "tsconfig.node.json"],
    tsconfigRootDir: __dirname,
  },
  plugins: ["react", "react-hooks", "react-refresh"],
  extends: [
    "../.eslintrc.common.cjs",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["public/*"],
  rules: {
    "import/extensions": "off",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
