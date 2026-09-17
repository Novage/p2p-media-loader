import type { ByteRange } from "../types.js";
import type { ParsedInitSegment } from "./types.js";

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
 *
 * What survives is carried over as the manifest wrote it, character for
 * character. Parsing the query and serializing it again would re-encode it —
 * the `~` and `=` inside an Akamai token, the `:` in an Azure expiry, a space
 * as `+` — and only the request carries a parameter to strip, so the key built
 * from it would no longer match the key built from the manifest.
 */
export function normalizeUrl(url: string): string {
  const query = url.indexOf("?");
  if (query === -1) return url;

  const params = url.slice(query + 1).split("&");
  const kept = params.filter((param) => {
    const equals = param.indexOf("=");
    const name = equals === -1 ? param : param.slice(0, equals);
    return !PER_REQUEST_QUERY_PARAMS.has(name);
  });
  if (kept.length === params.length) return url;

  return kept.length
    ? `${url.slice(0, query)}?${kept.join("&")}`
    : url.slice(0, query);
}

/**
 * A URL with its entire query string discarded. Stricter than `normalizeUrl`,
 * which removes named parameters only: this is for naming a swarm and for
 * matching a playlist whose signed token rotates, where every parameter is
 * suspect. See specs/segment-identity.md.
 */
export function stripQuery(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

/** `url|start-end` with an inclusive end, matching the engines' runtime IDs. */
export function segmentKey(url: string, byteRange?: ByteRange): string {
  const normalized = normalizeUrl(url);
  if (!byteRange) return normalized;
  return `${normalized}|${byteRange.start}-${byteRange.end}`;
}

/**
 * m3u8 `{ offset, length }` → inclusive `[start, end]`.
 *
 * A byte range written as a bare length — an `EXT-X-MAP` with
 * `BYTERANGE="600"` — starts at the beginning of the resource, which is what
 * a player requests for it. Nothing here may produce a key holding `NaN`: it
 * would match no request ever made, and the segment would look unknown.
 */
export function byteRangeFromOffsetLength(range?: {
  offset?: number;
  length: number;
}): ByteRange | undefined {
  if (!range || !Number.isFinite(range.length) || range.length <= 0) {
    return undefined;
  }
  const { offset } = range;
  const start =
    typeof offset === "number" && Number.isFinite(offset) ? offset : 0;
  return { start, end: start + range.length - 1 };
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

/**
 * The initialization segments of a stream, each kept once. A playlist repeats
 * the same reference on every segment it applies to, and carries more than one
 * where its media changes mid-stream: an HLS discontinuity with a new
 * `EXT-X-MAP`, or a period boundary in DASH.
 */
export function distinctInitSegments(
  list: readonly ParsedInitSegment[],
): ParsedInitSegment[] {
  const seen = new Set<string>();
  const result: ParsedInitSegment[] = [];
  for (const initSegment of list) {
    const key = segmentKey(initSegment.url, initSegment.byteRange);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(initSegment);
  }
  return result;
}
