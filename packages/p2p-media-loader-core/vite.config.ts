import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import { browserBundleAliases } from "../../vite.common.config.ts";

type Variant = "all" | "hls" | "dash";

/**
 * One self-contained bundle per parser combination, for consumers who resolve
 * no exports map. The unprefixed name carries both parsers, keeping the
 * `p2pml:core-as-bundle` export condition meaningful. See specs/packaging.md.
 */
const getESMConfig = ({
  minify,
  variant,
  isBuild,
}: {
  minify: boolean;
  variant: Variant;
  isBuild: boolean;
}): UserConfig => {
  const suffix = variant === "all" ? "" : `-${variant}`;
  return {
    // Build only: tests run in Node and need the real packages.
    resolve: { alias: isBuild ? browserBundleAliases : undefined },
    build: {
      emptyOutDir: false,
      minify,
      sourcemap: true,
      lib: {
        name: "p2pml.core",
        fileName: (format) =>
          `p2p-media-loader-core${suffix}.${format}${minify ? ".min" : ""}.js`,
        formats: ["es"],
        entry: `src/bundle-${variant}.ts`,
      },
    },
  };
};

export default defineConfig(({ mode, command }) => {
  const minify = mode.endsWith("-min");
  const base = minify ? mode.slice(0, -"-min".length) : mode;
  const variant: Variant =
    base === "esm-hls" ? "hls" : base === "esm-dash" ? "dash" : "all";
  return getESMConfig({ minify, variant, isBuild: command === "build" });
});
