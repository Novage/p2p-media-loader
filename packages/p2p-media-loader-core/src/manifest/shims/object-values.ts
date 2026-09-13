/**
 * mpd-parser's build calls `Object.values` once, an ES2017 builtin that
 * Chromium gained in 54, while the IIFE builds serve Chromium 49-era devices.
 *
 * Installed by an explicit call from the DASH tokenizer rather than by a bare
 * side-effect import: this package declares `sideEffects: false`, which lets a
 * consumer's bundler drop an import that exports nothing. A call inside a
 * module the consumer uses cannot be dropped. HLS bundles never carry it.
 */
export function ensureObjectValues(): void {
  const target = Object as ObjectConstructor & {
    values?: (source: object) => unknown[];
  };
  if (typeof target.values === "function") return;
  target.values = (source: object) =>
    Object.keys(source).map((key) => (source as Record<string, unknown>)[key]);
}
