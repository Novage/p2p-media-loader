module.exports = {
  root: true,
  extends: ["../../.eslintrc.common.cjs"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: "tsconfig.json",
    ecmaVersion: "latest",
    sourceType: "module",
  },
};
