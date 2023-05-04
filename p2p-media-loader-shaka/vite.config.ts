import { defineConfig } from "vite";
import type { UserConfig } from "vite";

const getUMDConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
      lib: {
        name: "p2pml.shaka",
        fileName: (format) =>
          `p2p-media-loader-shaka.${format}${minify ? ".min" : ""}.js`,
        formats: ["umd"],
        entry: "src/index.ts",
      },
      rollupOptions: {
        external: ["p2p-media-loader-core"],
        output: {
          globals: {
            "p2p-media-loader-core": "p2pml.core",
          },
        },
      },
    },
  };
};

export default defineConfig(({ mode }) => {
  if (mode === "umd") return getUMDConfig({ minify: false });
  if (mode === "umd-min") return getUMDConfig({ minify: true });
  return getUMDConfig({ minify: true });
});
