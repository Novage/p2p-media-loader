import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import terser from "@rollup/plugin-terser";

const getESMConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
      sourcemap: true,
      lib: {
        name: "p2pml.hlsjs",
        fileName: (format) =>
          `p2p-media-loader-hlsjs.${format}${minify ? ".min" : ""}.js`,
        formats: ["es"],
        entry: "src/index.ts",
      },
      rollupOptions: {
        external: ["p2p-media-loader-core"],
      },
    },
    plugins: [
      minify
        ? terser({
            format: {
              comments: false,
            },
          })
        : undefined,
    ],
  };
};

export default defineConfig(({ mode }) => {
  switch (mode) {
    case "esm":
      return getESMConfig({ minify: false });

    case "esm-min":
    default:
      return getESMConfig({ minify: true });
  }
});
