/**
 * mpd-parser's build calls `Object.values` once, an ES2017 builtin that
 * Chromium gained in 54, while the IIFE builds serve Chromium 49-era devices.
 *
 * Installed by an explicit call from the DASH tokenizer rather than by a bare
 * side-effect import: this package declares `sideEffects: false`, which lets a
 * consumer's bundler drop an import that exports nothing. A call inside a
 * module the consumer uses cannot be dropped. HLS bundles never carry it.
 *
 * Shaka Player's compiled build installs the same builtin through Closure's
 * `$jscomp.polyfill` runtime at script load, so on a page with Shaka this
 * shim finds it present and does nothing. It is kept for deployments without
 * Shaka — a custom integration playing DASH, or the standalone core in a
 * WebView — and because another library's load order is not ours to rely on.
 */
export function ensureObjectValues(): void {
  const target = Object as ObjectConstructor & {
    values?: (source: object) => unknown[];
  };
  if (typeof target.values === "function") return;
  target.values = (source: object) =>
    Object.keys(source).map((key) => (source as Record<string, unknown>)[key]);
}
