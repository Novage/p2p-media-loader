
/**
 * The `sidx` box of an ISO BMFF file: a DASH `SegmentBase` stream's segment
 * index. See specs/manifest-registry.md, "Resolving an external index".
 */
type SidxReference = {
  /** 0 references media; 1 references another `sidx` box (not followed). */
  readonly referenceType: 0 | 1;
  readonly referencedSize: number;
  /** In the box's timescale. */
  readonly subsegmentDuration: number;
};

export type SidxBox = {
  /** Where the box starts in the parsed data, and its size in bytes. */
  readonly boxOffset: number;
  readonly boxSize: number;
  readonly timescale: number;
  /**
   * Read because the cursor must step over it — its width depends on the box
   * version — and deliberately not used for identity: subsegments are laid
   * out from the start of their period, not from this. See
   * specs/segment-identity.md, "Where a `SegmentBase` subsegment sits on that
   * timeline".
   */
  readonly earliestPresentationTime: number;
  /** Bytes from the end of the box to the first referenced subsegment. */
  readonly firstOffset: number;
  readonly references: readonly SidxReference[];
};

const MAX_SAFE_HIGH_WORD = 0x1fffff; // 2^53 / 2^32

/**
 * Finds and parses the `sidx` box in a response. The response may be wider
 * than the index alone — a player often fetches initialization and index
 * together — so the box is located by walking the box structure, never assumed
 * to sit at the start. Returns `undefined` for truncated data, for values
 * beyond the safe integer range, and when there is no `sidx` box at all.
 */
export function parseSidx(
  data: ArrayBuffer | ArrayBufferView,
): SidxBox | undefined {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  let offset = 0;
  while (offset + 8 <= view.byteLength) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    let headerSize = 8;
    if (size === 1) {
      const large = readUint64(view, offset + 8);
      if (large === undefined) return undefined;
      size = large;
      headerSize = 16;
    } else if (size === 0) {
      size = view.byteLength - offset;
    }
    if (size < headerSize) return undefined;
    if (type === "sidx") {
      const payload = parseSidxPayload(
        view,
        offset + headerSize,
        Math.min(offset + size, view.byteLength),
      );
      return payload && { boxOffset: offset, boxSize: size, ...payload };
    }
    offset += size;
  }
  return undefined;
}

function parseSidxPayload(
  view: DataView,
  start: number,
  end: number,
): Omit<SidxBox, "boxOffset" | "boxSize"> | undefined {
  // version(1) flags(3) reference_ID(4) timescale(4)
  if (start + 12 > end) return undefined;
  const version = view.getUint8(start);
  const timescale = view.getUint32(start + 8);
  let pos = start + 12;

  let earliestPresentationTime: number | undefined;
  let firstOffset: number | undefined;
  if (version === 0) {
    if (pos + 8 > end) return undefined;
    earliestPresentationTime = view.getUint32(pos);
    firstOffset = view.getUint32(pos + 4);
    pos += 8;
  } else {
    earliestPresentationTime = readUint64(view, pos);
    firstOffset = readUint64(view, pos + 8);
    pos += 16;
    if (earliestPresentationTime === undefined || firstOffset === undefined) {
      return undefined;
    }
  }

  // reserved(2) reference_count(2)
  if (pos + 4 > end) return undefined;
  const referenceCount = view.getUint16(pos + 2);
  pos += 4;

  if (timescale === 0) return undefined;

  const references: SidxReference[] = [];
  for (let i = 0; i < referenceCount; i++) {
    if (pos + 12 > end) return undefined;
    const word = view.getUint32(pos);
    references.push({
      referenceType: word >>> 31 === 1 ? 1 : 0,
      referencedSize: word & 0x7fffffff,
      subsegmentDuration: view.getUint32(pos + 4),
    });
    pos += 12;
  }

  return { timescale, earliestPresentationTime, firstOffset, references };
}

function readUint64(view: DataView, pos: number): number | undefined {
  if (pos + 8 > view.byteLength) return undefined;
  const high = view.getUint32(pos);
  if (high > MAX_SAFE_HIGH_WORD) return undefined;
  return high * 0x100000000 + view.getUint32(pos + 4);
}
