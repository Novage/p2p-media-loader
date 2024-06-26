import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import terser from "@rollup/plugin-terser";

const getESMConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
      sourcemap: true,
      lib: {
        name: "p2pml.core",
        fileName: (format) =>
          `p2p-media-loader-core.${format}${minify ? ".min" : ""}.js`,
        formats: ["es"],
        entry: "src/index.ts",
      },
    },
    plugins: [
      nodePolyfills(),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      terser({
        format: {
          comments: false,
        },
      }),
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
