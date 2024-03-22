import { UserConfig, defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const getESMConfig = ({ minify }: { minify: boolean }): UserConfig => {
  return {
    plugins: [react()],
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
      sourcemap: true,
      lib: {
        name: "p2pml.demo",
        fileName: (format) =>
          `p2p-media-loader-demo.${format}${minify ? ".min" : ""}.js`,
        formats: ["es"],
        entry: "src/index.ts",
      },
      rollupOptions: {
        external: ["react", "react-dom"],
      },
    },
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
