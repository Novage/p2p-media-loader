// @ts-check

import { CommonConfig } from "../../eslint.common.config.js";
import tsEslint from "typescript-eslint";

export default tsEslint.config(...CommonConfig);
