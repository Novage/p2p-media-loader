import { Parser, type Manifest } from "m3u8-parser";

export class SegmentManager {
  manifest?: Manifest;

  processPlaylist(content: string, requestUrl: string, responseUrl: string) {
    const parser = new Parser();
    parser.push(content);
    parser.end();

    this.manifest = parser.manifest;
  }
}
