// @ts-check

import globals from "globals";
import eslint from "@eslint/js";
import tsEslint from "typescript-eslint";
import { flatConfigs as importPlugin } from "eslint-plugin-import";

export const CommonConfig =
  /** @type {(typeof tsEslint.configs.eslintRecommended)[]} */ ([
    eslint.configs.recommended,
    importPlugin.recommended,
    tsEslint.configs.eslintRecommended,
    ...tsEslint.configs.strictTypeChecked,
    ...tsEslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: {
          ...globals.browser,
        },

        ecmaVersion: 2022,
        sourceType: "module",

        parserOptions: {
          project: ["tsconfig.json", "tsconfig.node.json"],
        },
      },

      rules: {
        "@typescript-eslint/consistent-type-definitions": "off",
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/restrict-template-expressions": [
          "error",
          { allowNumber: true },
        ],
        "@typescript-eslint/no-confusing-void-expression": [
          "error",
          { ignoreArrowShorthand: true },
        ],
        "@typescript-eslint/no-unnecessary-condition": [
          "error",
          { allowConstantLoopConditions: true },
        ],

        "no-var": "error",
        "no-alert": "warn",
        "prefer-const": "error",
        "prefer-spread": "error",
        "no-multi-assign": "error",
        "prefer-template": "error",
        "object-shorthand": "error",
        "no-nested-ternary": "error",
        "no-array-constructor": "error",
        "prefer-object-spread": "error",
        "prefer-arrow-callback": "error",
        "prefer-destructuring": ["error", { object: true, array: false }],
        "no-console": "warn",
        curly: ["warn", "multi-line", "consistent"],
        "no-debugger": "warn",
        "spaced-comment": ["warn", "always", { markers: ["/"] }],

        "import/no-unresolved": "off",
        "import/named": "off",
        "import/no-named-as-default": "off",
        "import/namespace": "off",
        "import/no-named-as-default-member": "off",
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
      },
    },
  ]);
