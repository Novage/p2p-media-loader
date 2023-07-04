module.exports = {
  env: {es2020: true},
  extends: ["../.eslintrc.common.cjs", "plugin:react-hooks/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": "warn",
    "@typescript-eslint/ban-ts-comment": 0,
  },
};
