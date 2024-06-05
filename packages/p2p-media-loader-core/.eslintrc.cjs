module.exports = {
  root: true,
  extends: ["../../.eslintrc.common.cjs"],
  parser: "@typescript-eslint/parser",
  exclude: ["test/**/*"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json", "tsconfig.node.json"],
    ecmaVersion: "latest",
    sourceType: "module",
  },
};
