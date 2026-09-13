import type { ByteRange } from "../types.js";

/**
 * Registry keys. A segment is looked up by the URL the player will request
 * plus its byte range, so a key must be built identically from a manifest and
 * from an intercepted request. See specs/manifest-registry.md.
 */

/**
 * Query parameters that vary per request without changing what is fetched.
 * Only these are removed from keys: stripping anything else risks collapsing
 * two distinct segments onto one key, which would serve wrong bytes.
 */
const PER_REQUEST_QUERY_PARAMS: ReadonlySet<string> = new Set(["CMCD"]);

/** Resolves a manifest URI against the document that declared it. */
export function resolveUrl(uri: string, baseUrl: string): string {
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    return uri;
  }
}

/**
 * Removes per-request telemetry parameters and nothing else. Signed URLs keep
 * their tokens, so a normalized URL is still fetchable — but the core never
 * fetches a normalized URL; it fetches what the player asked for.
 */
export function normalizeUrl(url: string): string {
  const query = url.indexOf("?");
  if (query === -1) return url;

  const params = new URLSearchParams(url.slice(query + 1));
  let changed = false;
  for (const name of PER_REQUEST_QUERY_PARAMS) {
    if (params.has(name)) {
      params.delete(name);
      changed = true;
    }
  }
  if (!changed) return url;

  const rest = params.toString();
  return rest ? `${url.slice(0, query)}?${rest}` : url.slice(0, query);
}

/** `url|start-end` with an inclusive end, matching the engines' runtime IDs. */
export function segmentKey(url: string, byteRange?: ByteRange): string {
  const normalized = normalizeUrl(url);
  if (!byteRange) return normalized;
  return `${normalized}|${byteRange.start}-${byteRange.end}`;
}

/** m3u8 `{ offset, length }` → inclusive `[start, end]`. */
export function byteRangeFromOffsetLength(range?: {
  offset: number;
  length: number;
}): ByteRange | undefined {
  if (!range || range.length <= 0) return undefined;
  return { start: range.offset, end: range.offset + range.length - 1 };
}

/** `Range: bytes=a-b` → inclusive `[a, b]`; open-ended ranges are not keys. */
export function byteRangeFromRangeHeader(
  header: string | undefined,
): ByteRange | undefined {
  if (!header) return undefined;
  const match = /^\s*bytes=(\d+)-(\d+)\s*$/i.exec(header);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start <= end ? { start, end } : undefined;
}

/** Half-open `[start, end)` from a player → inclusive `[start, end - 1]`. */
export function byteRangeFromHalfOpen(
  start: number | undefined,
  end: number | undefined,
): ByteRange | undefined {
  if (start === undefined || end === undefined || end <= start) {
    return undefined;
  }
  return { start, end: end - 1 };
}
