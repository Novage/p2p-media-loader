import { MasterManifest, PlaylistManifest } from "m3u8-parser";
import { Playlist } from "./segment-mananger";

export function isMasterManifest(
  manifest: PlaylistManifest | MasterManifest
): manifest is MasterManifest {
  return (
    !!(manifest as MasterManifest).playlists &&
    !!(manifest as MasterManifest).mediaGroups
  );
}

export function getAudioPlaylistsFromMasterManifest(
  masterManifestUrl: string,
  masterManifest: MasterManifest
): Playlist[] {
  const { mediaGroups } = masterManifest;

  const audio = Object.values(mediaGroups.AUDIO);
  const playlists: Playlist[] = [];
  if (audio.length) {
    audio.forEach((languageMap) => {
      const languages = Object.values(languageMap);
      languages.forEach((item, index) => {
        playlists.push(
          new Playlist({
            type: "audio",
            url: item.uri,
            manifestUrl: masterManifestUrl,
            mediaSequence: 0,
            index,
          })
        );
      });
    });
  }

  return playlists;
}

export function getVideoPlaylistsFromMasterManifest(
  masterManifestUrl: string,
  masterManifest: MasterManifest
): Playlist[] {
  return masterManifest.playlists.map(
    (p, index) =>
      new Playlist({
        type: "video",
        url: p.uri,
        manifestUrl: masterManifestUrl,
        mediaSequence: 0,
        index,
      })
  );
}
