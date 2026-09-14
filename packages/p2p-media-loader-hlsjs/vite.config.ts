import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import { browserBundleAliases } from "../../vite.common.config.ts";

const getESMConfig = ({
  minify,
  isBuild,
}: {
  minify: boolean;
  isBuild: boolean;
}): UserConfig => {
  return {
    resolve: { alias: isBuild ? browserBundleAliases : undefined },
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
      // Core and the parser stay bare imports for the page's import map to
      // resolve — to one core bundle, which carries both. Inlining the parser
      // here would ship it twice. See specs/packaging.md.
      rolldownOptions: {
        external: ["p2p-media-loader-core", "p2p-media-loader-core/hls"],
      },
    },
  };
};

const getIIFEConfig = ({
  minify,
  isBuild,
}: {
  minify: boolean;
  isBuild: boolean;
}): UserConfig => {
  return {
    resolve: { alias: isBuild ? browserBundleAliases : undefined },
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

export default defineConfig(({ mode, command }) => {
  const isBuild = command === "build";
  switch (mode) {
    case "esm":
      return getESMConfig({ minify: false, isBuild });

    case "esm-min":
      return getESMConfig({ minify: true, isBuild });
    case "iife":
      return getIIFEConfig({ minify: false, isBuild });
    case "iife-min":
      return getIIFEConfig({ minify: true, isBuild });
    default:
      return getESMConfig({ minify: true, isBuild });
  }
});
