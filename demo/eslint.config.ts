import { CommonReactConfig } from "../eslint.common.react.config.ts";
import { defineConfig } from "eslint/config";

export default defineConfig(CommonReactConfig, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
