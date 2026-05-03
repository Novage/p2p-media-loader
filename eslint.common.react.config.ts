import { CommonConfig } from "./eslint.common.config.ts";
import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export const CommonReactConfig = defineConfig([
  CommonConfig,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    rules: {
      "import/extensions": "off",
      "@eslint-react/avoid-shorthand-fragment": "off",
      "@eslint-react/avoid-shorthand-boolean": "off",
      "@eslint-react/naming-convention/filename": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
]);
