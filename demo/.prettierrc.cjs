const common = require("../.prettierrc.common.cjs");

module.exports = {
  ...common,
  overrides: [
    {
      // The IIFE pages exist for browsers without ES module support — old
      // Smart TVs — whose parsers reject trailing commas in argument lists
      // (ES2017). "es5" keeps them out of calls while allowing them in
      // arrays and objects.
      files: ["public/modules-demo/*-iife.html"],
      options: { trailingComma: "es5" },
    },
  ],
};
