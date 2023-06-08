declare module "m3u8-parser" {
  export class Parser {
    constructor();
    push(m3u8: string): void;
    end(): void;
    manifest: Manifest;
  }

  export type Manifest = {
    mediaSequence?: number;
    segments: Segment[];
    playlists?: Playlist[];
  };

  export type Segment = {
    uri: string;
    byteRange?: { length: number; offset: number };
  };

  export type Playlist = {
    uri: string;
  };
}
