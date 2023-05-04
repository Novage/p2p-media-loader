import { defineConfig } from "vite";
import type { UserConfig } from "vite";

const getUMDConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
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
  if (mode === "umd") return getUMDConfig({ minify: false });
  if (mode === "umd-min") return getUMDConfig({ minify: true });
});
