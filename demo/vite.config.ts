import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  server: { open: true, host: true },
  plugins: [nodePolyfills(), react()],
});
