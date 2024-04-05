// vite.config.ts
import { defineConfig } from "file:///home/dmytro/Documents/projects/p2p-media-loader/node_modules/.pnpm/vite@5.1.6/node_modules/vite/dist/node/index.js";
import { nodePolyfills } from "file:///home/dmytro/Documents/projects/p2p-media-loader/node_modules/.pnpm/vite-plugin-node-polyfills@0.21.0_vite@5.1.6/node_modules/vite-plugin-node-polyfills/dist/index.js";
var getESMConfig = ({ minify }) => {
  return {
    build: {
      emptyOutDir: false,
      minify: minify ? "esbuild" : false,
      sourcemap: true,
      lib: {
        name: "p2pml.core",
        fileName: (format) => `p2p-media-loader-core.${format}${minify ? ".min" : ""}.js`,
        formats: ["es"],
        entry: "src/index.ts"
      }
    },
    plugins: [nodePolyfills()]
  };
};
var vite_config_default = defineConfig(({ mode }) => {
  switch (mode) {
    case "esm":
      return getESMConfig({ minify: false });
    case "esm-min":
    default:
      return getESMConfig({ minify: true });
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9kbXl0cm8vRG9jdW1lbnRzL3Byb2plY3RzL3AycC1tZWRpYS1sb2FkZXIvcGFja2FnZXMvcDJwLW1lZGlhLWxvYWRlci1jb3JlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9kbXl0cm8vRG9jdW1lbnRzL3Byb2plY3RzL3AycC1tZWRpYS1sb2FkZXIvcGFja2FnZXMvcDJwLW1lZGlhLWxvYWRlci1jb3JlL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL2RteXRyby9Eb2N1bWVudHMvcHJvamVjdHMvcDJwLW1lZGlhLWxvYWRlci9wYWNrYWdlcy9wMnAtbWVkaWEtbG9hZGVyLWNvcmUvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHR5cGUgeyBVc2VyQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCB7IG5vZGVQb2x5ZmlsbHMgfSBmcm9tIFwidml0ZS1wbHVnaW4tbm9kZS1wb2x5ZmlsbHNcIjtcblxuY29uc3QgZ2V0RVNNQ29uZmlnID0gKHsgbWluaWZ5IH06IHsgbWluaWZ5OiBib29sZWFuIH0pOiBVc2VyQ29uZmlnID0+IHtcbiAgcmV0dXJuIHtcbiAgICBidWlsZDoge1xuICAgICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgICAgbWluaWZ5OiBtaW5pZnkgPyBcImVzYnVpbGRcIiA6IGZhbHNlLFxuICAgICAgc291cmNlbWFwOiB0cnVlLFxuICAgICAgbGliOiB7XG4gICAgICAgIG5hbWU6IFwicDJwbWwuY29yZVwiLFxuICAgICAgICBmaWxlTmFtZTogKGZvcm1hdCkgPT5cbiAgICAgICAgICBgcDJwLW1lZGlhLWxvYWRlci1jb3JlLiR7Zm9ybWF0fSR7bWluaWZ5ID8gXCIubWluXCIgOiBcIlwifS5qc2AsXG4gICAgICAgIGZvcm1hdHM6IFtcImVzXCJdLFxuICAgICAgICBlbnRyeTogXCJzcmMvaW5kZXgudHNcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbbm9kZVBvbHlmaWxscygpXSxcbiAgfTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcbiAgc3dpdGNoIChtb2RlKSB7XG4gICAgY2FzZSBcImVzbVwiOlxuICAgICAgcmV0dXJuIGdldEVTTUNvbmZpZyh7IG1pbmlmeTogZmFsc2UgfSk7XG5cbiAgICBjYXNlIFwiZXNtLW1pblwiOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZ2V0RVNNQ29uZmlnKHsgbWluaWZ5OiB0cnVlIH0pO1xuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1osU0FBUyxvQkFBb0I7QUFFNWIsU0FBUyxxQkFBcUI7QUFFOUIsSUFBTSxlQUFlLENBQUMsRUFBRSxPQUFPLE1BQXVDO0FBQ3BFLFNBQU87QUFBQSxJQUNMLE9BQU87QUFBQSxNQUNMLGFBQWE7QUFBQSxNQUNiLFFBQVEsU0FBUyxZQUFZO0FBQUEsTUFDN0IsV0FBVztBQUFBLE1BQ1gsS0FBSztBQUFBLFFBQ0gsTUFBTTtBQUFBLFFBQ04sVUFBVSxDQUFDLFdBQ1QseUJBQXlCLE1BQU0sR0FBRyxTQUFTLFNBQVMsRUFBRTtBQUFBLFFBQ3hELFNBQVMsQ0FBQyxJQUFJO0FBQUEsUUFDZCxPQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVMsQ0FBQyxjQUFjLENBQUM7QUFBQSxFQUMzQjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDeEMsVUFBUSxNQUFNO0FBQUEsSUFDWixLQUFLO0FBQ0gsYUFBTyxhQUFhLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFBQSxJQUV2QyxLQUFLO0FBQUEsSUFDTDtBQUNFLGFBQU8sYUFBYSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsRUFDeEM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
