declare module "m3u8-parser" {
  export class Parser {
    constructor();

    push(m3u8: string): void;

    end(): void;

    manifest: MasterManifest | PlaylistManifest;
  }

  export type MasterManifest = {
    mediaGroups: {
      AUDIO: {
        [codec: string]: {
          [lang: string]: { default: boolean; language: string; uri: string };
        };
      };
      "CLOSED-CAPTIONS": object;
      SUBTITLES: object;
      VIDEO: object;
    };
    playlists: Playlist[];
  };

  export type PlaylistManifest = {
    mediaSequence: number;
    segments: Segment[];
  };

  export type Segment = {
    uri: string;
    byterange?: { length: number; offset: number };
  };

  export type Playlist = {
    uri: string;
    attributes: {
      AUDIO: string;
      "AVERAGE-BANDWIDTH": string;
      BANDWIDTH: string;
      "CLOSED-CAPTIONS": string;
      CODECS: string;
      "FRAME-RATE": number;
      RESOLUTION: { width: number; height: number };
    };
  };
}
