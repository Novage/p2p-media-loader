import { CommonConfig } from "./eslint.common.config.ts";
import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";
import react from "@eslint-react/eslint-plugin";
import { defineConfig } from "eslint/config";

export const CommonReactConfig = defineConfig([
  CommonConfig,
  reactHooks.configs.flat.redommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  reactRefresh.configs.vite,
  react.configs["recommended-typescript"],
  {
    rules: {
      "import/extensions": "off",
      "@eslint-react/avoid-shorthand-fragment": "off",
      "@eslint-react/avoid-shorthand-boolean": "off",
      "@eslint-react/naming-convention/filename": "off",
      "@eslint-react/prefer-namespace-import": "off",
      "@eslint-react/dom/prefer-namespace-import": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
]);
