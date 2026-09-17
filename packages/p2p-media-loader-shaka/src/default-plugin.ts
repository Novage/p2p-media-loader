import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import { Shaka } from "./types.js";

type SchemePlugin = { parse: shaka.extern.SchemePlugin };

/**
 * The plugin Shaka itself would have used for a request, for the two paths
 * that have to load one without the core: a request no engine claimed, and a
 * request of a type the adapter passes through.
 *
 * Shaka registers its own http(s) plugins by support and priority — fetch as
 * preferred, and only where `fetch`, `AbortController` and `ReadableStream`
 * all exist, XHR as the fallback — and a data URI to a plugin that decodes it
 * with no network stack at all. The adapter's own scheme registration wins
 * over every one of those (no priority is the highest priority), so it has to
 * make the same choice on their behalf. Old Smart TV browsers are where this
 * is not academic: forcing the fetch plugin there throws inside Shaka on the
 * first request, before anything plays.
 */
export function defaultPluginFor(shakaLib: Shaka, uri: string): SchemePlugin {
  const { DataUriPlugin, HttpFetchPlugin, HttpXHRPlugin } = shakaLib.net;
  if (uri.startsWith("data:")) return DataUriPlugin;
  return HttpFetchPlugin.isSupported() ? HttpFetchPlugin : HttpXHRPlugin;
}
