import { describe, expect, it } from "vitest";
import {
  computeStreamIdentityHash,
  identityProperties,
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
  // What the registry hashes for a rung no other rung shares a resolution with.
  hls1080pNoBitrate: {
    codecs: "avc1.64002a",
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
 * v3: the manifest-driven core. Properties are hashed as the manifest states
 * them — every peer reads the same manifest with the same parser, so the v2
 * normalization (codec case and order, decimal avc1 profiles, language and
 * channel trimming) is gone — and `bitrate` enters only where a manifest needs
 * it to tell two same-type streams apart (see specs/segment-identity.md).
 */
const GOLDEN_VECTORS = [
  {
    name: "hls 1080p video variant, bitrate kept",
    props: PROPS.hls1080p,
    streamType: "main" as StreamType,
    identityHash: "iNz0Nm5CRoj3CPnATwZbzOR36hg=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-iNz0Nm5CRoj3CPnATwZbzOR36hg=",
    infoHash: "jAztisioAey83yeI5VCy",
  },
  {
    name: "hls 1080p video variant, bitrate dropped",
    props: PROPS.hls1080pNoBitrate,
    streamType: "main" as StreamType,
    identityHash: "SwyTBJzxGFOXIbAZMJWKG3nnIwc=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-SwyTBJzxGFOXIbAZMJWKG3nnIwc=",
    infoHash: "CS1X23XIwC3hMelxmX8z",
  },
  {
    name: "decimal RFC 4281 avc1 codec (hashed as written)",
    props: PROPS.decimalAvc1,
    streamType: "main" as StreamType,
    identityHash: "rKuBJ2P4nH1VBYsYeEcZ8JUn3NI=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-rKuBJ2P4nH1VBYsYeEcZ8JUn3NI=",
    infoHash: "uXQspfYQVGGZBRkck6tA",
  },
  {
    name: "audio track",
    props: PROPS.audio,
    streamType: "secondary" as StreamType,
    identityHash: "GT17s2lVP9juJlJgLa8S/8amjhI=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-secondary-GT17s2lVP9juJlJgLa8S/8amjhI=",
    infoHash: "A6g5A9j7J9F2myVq+nOB",
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
    identityHash: "LWIaIik9Y/3BYajY+Nhh6FZBt70=",
    streamSwarmId:
      "v3-https://example.com/hls/master.m3u8-main-LWIaIik9Y/3BYajY+Nhh6FZBt70=",
    infoHash: "8j/DDr/IBPiF9kRGBJRV",
  },
];

/**
 * v2: the previous protocol, kept as the record of what those peers announce.
 * The identity hashes were derived from normalized properties, which v3 no
 * longer reproduces; a v3 client must never produce these swarm IDs.
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

describe("stream identity hashes the manifest's properties as given", () => {
  it("treats a missing bitrate as 0 and null, undefined and empty strings alike", () => {
    const zero = computeIdentityHash({ bitrate: 0 });
    expect(computeIdentityHash({})).toBe(zero);
    expect(computeIdentityHash({ bitrate: undefined, codecs: null })).toBe(
      zero,
    );
    expect(computeIdentityHash({ codecs: "", name: undefined })).toBe(zero);
  });

  it("does not normalize: codec order, case and number formatting all count", () => {
    const base = computeIdentityHash({ codecs: "avc1.64002a,mp4a.40.2" });
    expect(computeIdentityHash({ codecs: "mp4a.40.2,avc1.64002a" })).not.toBe(
      base,
    );
    expect(computeIdentityHash({ codecs: "AVC1.64002A,MP4A.40.2" })).not.toBe(
      base,
    );
    expect(computeIdentityHash({ frameRate: "29.970" })).not.toBe(
      computeIdentityHash({ frameRate: 29.97 }),
    );
    expect(computeIdentityHash({ language: "en-US" })).not.toBe(
      computeIdentityHash({ language: "en" }),
    );
  });
});

describe("identityProperties: bitrate only where a manifest needs it", () => {
  const rung = (height: number, bitrate: number): StreamProperties => ({
    bitrate,
    codecs: "avc1.64002a",
    width: (height * 16) / 9,
    height,
    frameRate: 24,
  });
  const main = (properties: StreamProperties) => ({
    type: "main" as StreamType,
    properties,
  });

  it("drops bitrate from a single rendition, so a recomputed BANDWIDTH cannot split its swarm", () => {
    const [a] = identityProperties([main(rung(1080, 4390000))]);
    const [b] = identityProperties([main(rung(1080, 5630000))]);
    expect(a.bitrate).toBeUndefined();
    expect(computeIdentityHash(a)).toBe(computeIdentityHash(b));
  });

  it("drops bitrate across a ladder whose rungs differ in resolution", () => {
    const ladder = [rung(360, 800000), rung(720, 2500000), rung(1080, 5000000)];
    const inputs = identityProperties(ladder.map(main));
    expect(inputs.map((p) => p.bitrate)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(inputs[2]).toEqual({ ...rung(1080, 5000000), bitrate: undefined });
  });

  it("keeps bitrate only for the rungs that would otherwise be indistinguishable", () => {
    const ladder = [
      rung(720, 2500000),
      rung(1080, 5000000),
      rung(1080, 8000000),
    ];
    const inputs = identityProperties(ladder.map(main));
    expect(inputs.map((p) => p.bitrate)).toEqual([undefined, 5000000, 8000000]);
    expect(computeIdentityHash(inputs[1])).not.toBe(
      computeIdentityHash(inputs[2]),
    );
  });

  it("scopes the comparison to a stream type", () => {
    // Identical properties on a main and a secondary stream are no clash: the
    // stream type is part of the swarm ID.
    const shared = { codecs: "mp4a.40.2", bitrate: 128000 };
    const inputs = identityProperties([
      main(shared),
      { type: "secondary" as StreamType, properties: shared },
    ]);
    expect(inputs.map((p) => p.bitrate)).toEqual([undefined, undefined]);
  });

  it("leaves properties otherwise untouched", () => {
    const [a] = identityProperties([main(PROPS.audio)]);
    expect(a).toEqual({ ...PROPS.audio, bitrate: undefined });
  });
});
