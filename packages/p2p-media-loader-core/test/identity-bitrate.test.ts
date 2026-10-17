import { describe, expect, it } from "vitest";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { ManifestRegistry } from "../src/manifest/registry.js";

const MASTER_URL =
  "https://hls-harbor-livepush.akamaized.net/live_cdn/nsqIStpj8PaG-Ev/emcQJ0pGpremocy/index.m3u8";

/**
 * Akamai's live packager rewrites BANDWIDTH and AVERAGE-BANDWIDTH on every
 * master fetch from the encoder's current output; the same rendition read
 * seconds apart as 4390000, 5630000, 3890000, 2260000.
 */
const akamaiMaster = (bandwidth: number, average: number) => `#EXTM3U
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=${average},BANDWIDTH=${bandwidth},RESOLUTION=1920x1080,FRAME-RATE=24.000,CODECS="avc1.4d4028,mp4a.40.2",CLOSED-CAPTIONS=NONE
tracks-v1a1/mono.m3u8
`;

function identityOf(master: string, url = MASTER_URL) {
  const registry = new ManifestRegistry();
  registry.apply(hlsManifestParser.parse(master, url));
  return registry.getStreams().map((s) => ({
    key: s.key,
    identityHash: s.identityHash,
    bitrate: s.properties.bitrate,
  }));
}

describe("stream identity across master fetches", () => {
  it("is stable for a rendition whose BANDWIDTH the origin recomputes per request", () => {
    const first = identityOf(akamaiMaster(4390000, 3510000));
    const later = identityOf(akamaiMaster(2260000, 1810000));
    expect(first).toHaveLength(1);
    expect(later[0].identityHash).toBe(first[0].identityHash);
    // The stream still carries the bandwidth it was read with; only the
    // identity leaves it out.
    expect(first[0].bitrate).toBe(4390000);
    expect(later[0].bitrate).toBe(2260000);
  });

  it("still tells two rungs at one resolution apart by bitrate", () => {
    const ladder = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.64002a,mp4a.40.2"
1080p_5m.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002a,mp4a.40.2"
1080p_8m.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.64002a,mp4a.40.2"
720p.m3u8
`;
    const streams = identityOf(ladder, "https://cdn.example/master.m3u8");
    const hashes = new Set(streams.map((s) => s.identityHash));
    expect(hashes.size).toBe(3);
  });
});
