import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import corePackageJson from "../packages/p2p-media-loader-core/package.json";

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(corePackageJson.version),
  },
  server: { open: true, host: true },
  plugins: [nodePolyfills(), react()],
});
