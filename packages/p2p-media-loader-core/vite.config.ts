import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import packageJson from "./package.json";

const getUMDConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    define: {
      __VERSION__: JSON.stringify(packageJson.version),
    },
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
      sourcemap: true,
      lib: {
        name: "p2pml.core",
        fileName: (format) =>
          `p2p-media-loader-core.${format}${minify ? ".min" : ""}.js`,
        formats: ["umd"],
        entry: "src/index.ts",
      },
    },
  };
};

export default defineConfig(({ mode }) => {
  switch (mode) {
    case "umd":
      return getUMDConfig({ minify: false });

    case "umd-min":
    default:
      return getUMDConfig({ minify: true });
  }
});
