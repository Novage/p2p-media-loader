import { describe, expect, it } from "vitest";
import {
  buildStreamSwarmId,
  computeInfoHash,
  PEER_PROTOCOL_VERSION,
} from "../src/stream-identity.js";

// Golden vectors freezing the wire protocol. The infohashes were computed
// with Node.js `crypto` apart from the implementation, and checked against it.
// They MUST NOT change: any difference splits every existing default swarm
// between client versions. If a change to the derivation is ever intended, it
// requires a major version bump AND a peer protocol version bump — and a new
// block of vectors, keeping the old ones as the record of what the previous
// version produced. Between releases a derivation may change under one
// version; its pre-release vectors are kept as a record too (AGENTS.md).

const HLS_SWARM_ID = "https://example.com/hls/master.m3u8";
const DASH_SWARM_ID = "https://example.com/dash/manifest.mpd";

/**
 * v3: the stream ID is the stream's place in the manifest — for HLS its type
 * and its index among the master's streams of that type, for DASH its type
 * and its Representation `@id` — and no property of the stream enters it (see
 * specs/segment-identity.md). The 5.0.0 pre-releases hashed the stream's
 * properties under the same `v3`; no stable release did, so the version was
 * not bumped for them (see "Version discipline" there).
 */
const GOLDEN_VECTORS = [
  {
    name: "hls first variant",
    swarmId: HLS_SWARM_ID,
    streamId: "main0",
    streamSwarmId: "v3-https://example.com/hls/master.m3u8-main0",
    infoHash: "W1b9WgA8SSH2c5Dblnh5",
  },
  {
    name: "hls second variant",
    swarmId: HLS_SWARM_ID,
    streamId: "main1",
    streamSwarmId: "v3-https://example.com/hls/master.m3u8-main1",
    infoHash: "fvoqSv5iYPAR/cBJJimo",
  },
  {
    name: "hls first audio rendition",
    swarmId: HLS_SWARM_ID,
    streamId: "secondary0",
    streamSwarmId: "v3-https://example.com/hls/master.m3u8-secondary0",
    infoHash: "MssY0aR7vJXFmU9Ltes7",
  },
  {
    name: "hls media playlist with no master",
    swarmId: HLS_SWARM_ID,
    streamId: "main",
    streamSwarmId: "v3-https://example.com/hls/master.m3u8-main",
    infoHash: "jmr8dWoOf/ND+8KEuSRD",
  },
  {
    name: "dash video Representation",
    swarmId: DASH_SWARM_ID,
    streamId: "main-video-720",
    streamSwarmId: "v3-https://example.com/dash/manifest.mpd-main-video-720",
    infoHash: "y03bo9XKhbkmOc+w4M1i",
  },
  {
    name: "dash audio Representation",
    swarmId: DASH_SWARM_ID,
    streamId: "secondary-audio-en",
    streamSwarmId:
      "v3-https://example.com/dash/manifest.mpd-secondary-audio-en",
    infoHash: "hbbm0kddUqYuAabcWNff",
  },
  {
    name: "a swarm ID that is not ASCII is hashed as UTF-8",
    swarmId: "https://example.com/vidéo/master.m3u8",
    streamId: "main0",
    streamSwarmId: "v3-https://example.com/vidéo/master.m3u8-main0",
    infoHash: "2md7lrTf2S17B9sZBnnr",
  },
];

/**
 * The 5.0.0 pre-releases, also `v3`: the stream part was the hash of the
 * stream's manifest properties, with `bitrate` only where the manifest needed
 * it to tell two same-type streams apart. Kept as the record of what those
 * peers announce; a release peer never derives these swarm IDs.
 */
const V3_ALPHA_VECTORS = [
  {
    // hls 1080p video variant, bitrate kept
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-iNz0Nm5CRoj3CPnATwZbzOR36hg=",
    infoHash: "jAztisioAey83yeI5VCy",
  },
  {
    // hls 1080p video variant, bitrate dropped
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-SwyTBJzxGFOXIbAZMJWKG3nnIwc=",
    infoHash: "CS1X23XIwC3hMelxmX8z",
  },
  {
    // hls alternate video rendition: variant attributes plus NAME and LANGUAGE
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-u00IaR0vBHu1FYRTY6ngVZcd/gg=",
    infoHash: "joEux5p8lWAcP8C0ak25",
  },
  {
    // decimal RFC 4281 avc1 codec (hashed as written)
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-rKuBJ2P4nH1VBYsYeEcZ8JUn3NI=",
    infoHash: "uXQspfYQVGGZBRkck6tA",
  },
  {
    // audio track
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-secondary-GT17s2lVP9juJlJgLa8S/8amjhI=",
    infoHash: "A6g5A9j7J9F2myVq+nOB",
  },
  {
    // missing metadata (bitrate 0 only)
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    infoHash: "s/SEXqQzSgMtVKrBDDMm",
  },
  {
    // dash hdr video variant
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-LWIaIik9Y/3BYajY+Nhh6FZBt70=",
    infoHash: "8j/DDr/IBPiF9kRGBJRV",
  },
];

/**
 * v2: the protocol of 4.x, kept as the record of what those peers announce.
 * The stream part was the hash of normalized properties.
 */
const V2_VECTORS = [
  {
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-mskAojmI+F5YyLLvSP3sdMO5nII=",
    infoHash: "aEnMPupzZeID9k+gkk5Y",
  },
  {
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    infoHash: "KyXU7oYavEYFE/jxdEBu",
  },
  {
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-secondary-bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    infoHash: "Brw7M7eJYTdtKRTVLdah",
  },
  {
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    infoHash: "P78ZUY66tgmtYL6JoePW",
  },
  {
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-xRZQlAX26agaIEVBIZ0SppKubi0=",
    infoHash: "HC9QZIUjD8lNeTcsspkz",
  },
];

describe("stream identity golden vectors (v3 wire protocol)", () => {
  for (const vector of GOLDEN_VECTORS) {
    it(vector.name, () => {
      const streamSwarmId = buildStreamSwarmId(vector.swarmId, vector.streamId);
      expect(streamSwarmId).toBe(vector.streamSwarmId);
      expect(computeInfoHash(streamSwarmId)).toBe(vector.infoHash);
    });
  }

  it("info hash is exactly 20 ASCII characters", () => {
    for (const vector of GOLDEN_VECTORS) {
      const infoHash = computeInfoHash(vector.streamSwarmId);
      expect(infoHash).toHaveLength(20);
      expect(new TextEncoder().encode(infoHash)).toHaveLength(20);
    }
  });

  it("uses peer protocol version v3", () => {
    expect(PEER_PROTOCOL_VERSION).toBe("v3");
  });
});

describe("stream identity golden vectors (v2, historical)", () => {
  it("v2 swarm IDs hash to the infohashes v2 peers announce", () => {
    for (const vector of V2_VECTORS) {
      expect(computeInfoHash(vector.streamSwarmId)).toBe(vector.infoHash);
    }
  });

  it("a v3 peer never joins a v2 swarm", () => {
    const old = new Set(V2_VECTORS.map((vector) => vector.infoHash));
    for (const vector of GOLDEN_VECTORS) {
      expect(vector.streamSwarmId.startsWith("v3-")).toBe(true);
      expect(old.has(vector.infoHash)).toBe(false);
    }
  });
});

describe("stream identity golden vectors (v3 pre-releases, historical)", () => {
  it("their swarm IDs hash to the infohashes those peers announce", () => {
    for (const vector of V3_ALPHA_VECTORS) {
      expect(computeInfoHash(vector.streamSwarmId)).toBe(vector.infoHash);
    }
  });

  it("a release peer never joins a pre-release swarm", () => {
    const old = new Set(V3_ALPHA_VECTORS.map((vector) => vector.infoHash));
    for (const vector of GOLDEN_VECTORS) {
      expect(old.has(vector.infoHash)).toBe(false);
    }
  });
});
