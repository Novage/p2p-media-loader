import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: { open: true, host: true },
  plugins: [react()],
});
