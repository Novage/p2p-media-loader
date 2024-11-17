// @ts-check

import { CommonConfig } from "../../eslint.common.config.js";
import tsEslint from "typescript-eslint";
import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

export default tsEslint.config(
  ...CommonConfig,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  reactPlugin.configs.flat?.recommended, // This is not a plugin object, but a shareable config object
  reactPlugin.configs.flat?.["jsx-runtime"], // Add this if you are using React 17+
  {
    plugins: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      "react-hooks": reactHooks,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      "react-refresh": reactRefresh,
    },
    rules: {
      .../** @type {Record<string, string>}  */ (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        reactHooks.configs.recommended.rules
      ),
      "import/extensions": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
);
