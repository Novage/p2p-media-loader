import { Parser } from "m3u8-parser";
import type { Playlist } from "m3u8-parser";

export class SegmentManager {
  masterManifest: MasterPlaylist | null = null;

  public parsePlaylist(content: string) {
    const parser = new Parser();
    parser.push(content);
    parser.end();

    const manifest = parser.manifest;
    if (manifest.playlists) {
      this.masterManifest = new MasterPlaylist(manifest.playlists);
    }
  }
}

class MasterPlaylist {
  mediaPlaylists: Playlist[];

  constructor(mediaPlaylists: Playlist[]) {
    this.mediaPlaylists = mediaPlaylists;
    this.mediaPlaylists.sort(
      (a, b) => a.attributes.BANDWIDTH - b.attributes.BANDWIDTH
    );
  }

  getBitrateList() {
    return this.mediaPlaylists.map((i) => i.attributes.BANDWIDTH);
  }

  getBitrateOfLevel(level: number) {
    const bitrateList = this.getBitrateList();
    const levelIndex = Math.min(Math.max(0, level), bitrateList.length - 1);
    return bitrateList[levelIndex];
  }
}
