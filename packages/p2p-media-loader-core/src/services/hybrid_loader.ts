type ByteRange = { rangeStart: number; rangeEnd: number };

export class HybridLoader {
  abortController?: AbortController;

  async loadSegment(segmentUrl: string, byteRange: Partial<ByteRange>) {
    const headers = new Headers();
    if (
      byteRange &&
      byteRange.rangeStart !== undefined &&
      byteRange.rangeEnd !== undefined
    ) {
      headers.append("Range", getByteRangeHeaderString(byteRange as ByteRange));
    }
    this.abortController = new AbortController();
    const requestInit: RequestInit = {
      method: "GET",
      mode: "cors",
      credentials: "same-origin",
      signal: this.abortController.signal,
      headers,
    };
    const response = await fetch(segmentUrl, requestInit);
    const segmentData = await response.arrayBuffer();
    const { status, statusText, url, ok } = response;
    return {
      segmentData,
      responseUrl: url,
      status,
      statusText,
      ok,
    };
  }

  abort() {
    this.abortController?.abort();
  }
}

function getByteRangeHeaderString(byteRange: ByteRange) {
  const { rangeStart, rangeEnd } = byteRange;
  return `bytes=${rangeStart}-${rangeEnd - 1}`;
}
