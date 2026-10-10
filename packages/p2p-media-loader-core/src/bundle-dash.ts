/**
 * Entry for the prebuilt `dist/` bundle carrying core plus the DASH parser only, for
 * script-tag and WebView consumers who resolve no exports map. `src/index.ts`
 * deliberately imports no parser; this module composes them.
 * See specs/packaging.md.
 */
export * from "./index.js";
export { dashManifestParser } from "./manifest/dash.js";
export { stripPatchLocation } from "./manifest/patch-location.js";
