import { CommonConfig } from "./eslint.common.config.js";
import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";
import react from "@eslint-react/eslint-plugin";
import { defineConfig } from "eslint/config";

/** @type {typeof CommonConfig} */
export const CommonReactConfig = defineConfig([
  ...CommonConfig,
  reactPlugin.configs.flat?.recommended,
  reactPlugin.configs.flat?.["jsx-runtime"],
  react.configs.all,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
