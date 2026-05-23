import { defineConfig } from "vite";
import type { UserConfig } from "vite";

const getESMConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    build: {
      emptyOutDir: false,
      minify,
      sourcemap: true,
      lib: {
        name: "p2pml.hlsjs",
        fileName: (format) =>
          `p2p-media-loader-hlsjs.${format}${minify ? ".min" : ""}.js`,
        formats: ["es"],
        entry: "src/index.ts",
      },
      rolldownOptions: {
        external: ["p2p-media-loader-core"],
      },
    },
  };
};

const getIIFEConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    build: {
      emptyOutDir: false,
      minify,
      sourcemap: true,
      target: "es2015",
      lib: {
        name: "p2pml.hlsjs",
        fileName: (format) =>
          `p2p-media-loader-hlsjs.${format}${minify ? ".min" : ""}.js`,
        formats: ["iife"],
        entry: "src/index.ts",
      },
    },
  };
};

export default defineConfig(({ mode }) => {
  switch (mode) {
    case "esm":
      return getESMConfig({ minify: false });

    case "esm-min":
      return getESMConfig({ minify: true });
    case "iife":
      return getIIFEConfig({ minify: false });
    case "iife-min":
      return getIIFEConfig({ minify: true });
    default:
      return getESMConfig({ minify: true });
  }
});
