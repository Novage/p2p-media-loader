/**
 * Stands in for `@xmldom/xmldom` in browser bundles. mpd-parser imports a
 * full XML parser so it can run in Node; every browser and WebView already has
 * one. Substituting the platform implementation removes ~70 KB minified from
 * the DASH bundle. Node test runs are not aliased and keep the real package.
 * See specs/packaging.md.
 *
 * `window`, not `globalThis`: the IIFE builds serve Chromium 49-era devices,
 * and `globalThis` only arrived in Chromium 71.
 */
export const { DOMParser } = window;
