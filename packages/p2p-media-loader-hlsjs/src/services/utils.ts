export type ByteRange = { start: number; end: number };

export function getSegmentLocalId(
  segmentRequestUrl: string,
  byteRange?: ByteRange
) {
  if (!byteRange) return segmentRequestUrl;
  return `${segmentRequestUrl}|${byteRange.start}-${byteRange.end}`;
}

export function getByteRange(
  rangeStart: number | undefined,
  rangeEnd: number | undefined
): ByteRange | undefined {
  if (rangeStart !== undefined && rangeEnd !== undefined) {
    return { start: rangeStart, end: rangeEnd };
  }
}
