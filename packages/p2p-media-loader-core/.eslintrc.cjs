module.exports = {
  root: true,
  extends: ["../../.eslintrc.common.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: "tsconfig.json",
    ecmaVersion: "latest",
    sourceType: "module",
  },
};
