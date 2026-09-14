import { describe, expect, it } from "vitest";
import {
  computeStreamIdentityHash,
  buildStreamSwarmId,
  computeInfoHash,
  computeStreamSwarmId as computeStreamSwarmIdFromProperties,
  PEER_PROTOCOL_VERSION,
} from "../src/stream-identity.js";
import { StreamProperties, StreamType } from "../src/types.js";

// Golden vectors freezing the wire protocol. These literals were generated
// by executing the implementation itself and MUST NOT change: any difference
// splits every existing default swarm between client versions.
// If a change to the derivation is ever intended, it requires a major version
// bump AND a peer protocol version bump — and a new block of vectors, keeping
// the old ones as the record of what the previous version produced.

const SWARM_ID = "https://example.com/hls/master.m3u8";

const computeIdentityHash = (props: StreamProperties) =>
  computeStreamIdentityHash(props);

const computeStreamSwarmId = (streamType: StreamType, identityHash: string) =>
  buildStreamSwarmId(SWARM_ID, streamType, identityHash);

const PROPS = {
  hls1080p: {
    bitrate: 4521000,
    codecs: "avc1.64002a,mp4a.40.2",
    width: 1920,
    height: 1080,
    frameRate: "29.970",
    videoRange: "SDR",
  },
  decimalAvc1: {
    bitrate: 800000,
    codecs: "avc1.66.30",
    width: 640,
    height: 360,
  },
  audio: {
    bitrate: 0,
    codecs: "mp4a.40.2",
    language: "en-US",
    channels: "2/0",
    name: "English",
  },
  missing: { bitrate: 0 },
  dashHdr: {
    bitrate: 6000000,
    codecs: "hvc1.2.4.L153.B0",
    width: 3840,
    height: 2160,
    frameRate: 25,
    videoRange: "hlg",
  },
} satisfies Record<string, StreamProperties>;

/**
 * v3: the manifest-driven core. `identityHash` is derived exactly as in v2;
 * the version in the stream swarm ID changed because `externalId` did (see
 * specs/segment-identity.md, "Version discipline").
 */
const GOLDEN_VECTORS = [
  {
    name: "hls 1080p video variant",
    props: PROPS.hls1080p,
    streamType: "main" as StreamType,
    identityHash: "mskAojmI+F5YyLLvSP3sdMO5nII=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-mskAojmI+F5YyLLvSP3sdMO5nII=",
    infoHash: "fvh4iuUKMgvVHaqNX5Fs",
  },
  {
    name: "decimal RFC 4281 avc1 codec (normalized to hex)",
    props: PROPS.decimalAvc1,
    streamType: "main" as StreamType,
    identityHash: "NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    infoHash: "sBRCOubk+lCjZMykUr0W",
  },
  {
    name: "audio track",
    props: PROPS.audio,
    streamType: "secondary" as StreamType,
    identityHash: "bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-secondary-bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    infoHash: "5eeweTwwBbybnzYjxP3r",
  },
  {
    name: "missing metadata (bitrate 0 only)",
    props: PROPS.missing,
    streamType: "main" as StreamType,
    identityHash: "UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    infoHash: "s/SEXqQzSgMtVKrBDDMm",
  },
  {
    name: "dash hdr video variant",
    props: PROPS.dashHdr,
    streamType: "main" as StreamType,
    identityHash: "xRZQlAX26agaIEVBIZ0SppKubi0=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-xRZQlAX26agaIEVBIZ0SppKubi0=",
    infoHash: "eRIJD/hDDWmtWqLgTHyw",
  },
];

/**
 * v2: the previous protocol, kept as the record of what those peers announce.
 * The identity hashes are unchanged in v3; the swarm IDs and infohashes are
 * what a v2 client still computes, and a v3 client must never produce them.
 */
const V2_VECTORS = [
  {
    props: PROPS.hls1080p,
    identityHash: "mskAojmI+F5YyLLvSP3sdMO5nII=",
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-mskAojmI+F5YyLLvSP3sdMO5nII=",
    infoHash: "aEnMPupzZeID9k+gkk5Y",
  },
  {
    props: PROPS.decimalAvc1,
    identityHash: "NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    infoHash: "KyXU7oYavEYFE/jxdEBu",
  },
  {
    props: PROPS.audio,
    identityHash: "bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-secondary-bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    infoHash: "Brw7M7eJYTdtKRTVLdah",
  },
  {
    props: PROPS.missing,
    identityHash: "UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    infoHash: "P78ZUY66tgmtYL6JoePW",
  },
  {
    props: PROPS.dashHdr,
    identityHash: "xRZQlAX26agaIEVBIZ0SppKubi0=",
    streamSwarmId:
      "v2-https://example.com/hls/master.m3u8-main-xRZQlAX26agaIEVBIZ0SppKubi0=",
    infoHash: "HC9QZIUjD8lNeTcsspkz",
  },
];

describe("stream identity golden vectors (v3 wire protocol)", () => {
  for (const vector of GOLDEN_VECTORS) {
    it(vector.name, () => {
      const identityHash = computeIdentityHash(vector.props);
      expect(identityHash).toBe(vector.identityHash);

      const streamSwarmId = computeStreamSwarmId(
        vector.streamType,
        identityHash,
      );
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

  it("composes the default stream swarm ID from raw properties", () => {
    for (const vector of GOLDEN_VECTORS) {
      expect(
        computeStreamSwarmIdFromProperties({
          swarmId: SWARM_ID,
          streamType: vector.streamType,
          properties: vector.props,
        }),
      ).toBe(vector.streamSwarmId);
    }
  });

  it("uses peer protocol version v3", () => {
    expect(PEER_PROTOCOL_VERSION).toBe("v3");
  });
});

describe("stream identity golden vectors (v2, historical)", () => {
  it("still derives the same identity hashes", () => {
    for (const vector of V2_VECTORS) {
      expect(computeIdentityHash(vector.props)).toBe(vector.identityHash);
    }
  });

  it("v2 swarm IDs hash to the infohashes v2 peers announce", () => {
    for (const vector of V2_VECTORS) {
      expect(computeInfoHash(vector.streamSwarmId)).toBe(vector.infoHash);
    }
  });

  it("a v3 peer never joins a v2 swarm", () => {
    for (const [i, vector] of V2_VECTORS.entries()) {
      expect(GOLDEN_VECTORS[i].infoHash).not.toBe(vector.infoHash);
    }
  });
});

describe("stream identity normalization semantics", () => {
  it("treats bitrate 0, undefined, and empty props as the same identity", () => {
    const zero = computeIdentityHash({ bitrate: 0 });
    expect(computeIdentityHash({})).toBe(zero);
    expect(computeIdentityHash({ bitrate: undefined })).toBe(zero);
  });

  it("is insensitive to codec order and case", () => {
    const base = computeIdentityHash({ codecs: "avc1.64002a,mp4a.40.2" });
    expect(computeIdentityHash({ codecs: "mp4a.40.2,avc1.64002a" })).toBe(base);
    expect(computeIdentityHash({ codecs: "AVC1.64002A,MP4A.40.2" })).toBe(base);
  });

  it("normalizes frame rate representations", () => {
    const base = computeIdentityHash({ frameRate: 29.97 });
    expect(computeIdentityHash({ frameRate: "29.970" })).toBe(base);
  });

  it("normalizes language to a two-letter lowercase code", () => {
    const base = computeIdentityHash({ language: "en" });
    expect(computeIdentityHash({ language: "en-US" })).toBe(base);
    expect(computeIdentityHash({ language: "EN" })).toBe(base);
    expect(computeIdentityHash({ language: "und" })).toBe(
      computeIdentityHash({}),
    );
  });

  it("normalizes channels to the count before the slash", () => {
    const base = computeIdentityHash({ channels: 2 });
    expect(computeIdentityHash({ channels: "2/0" })).toBe(base);
    expect(computeIdentityHash({ channels: "2" })).toBe(base);
  });

  it("normalizes video range case", () => {
    expect(computeIdentityHash({ videoRange: "hlg" })).toBe(
      computeIdentityHash({ videoRange: "HLG" }),
    );
  });

  it("normalizes name case and whitespace", () => {
    expect(computeIdentityHash({ name: " English " })).toBe(
      computeIdentityHash({ name: "english" }),
    );
  });
});
