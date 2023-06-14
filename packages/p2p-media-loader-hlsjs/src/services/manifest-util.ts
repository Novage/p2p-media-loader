import { MasterManifest, PlaylistManifest } from "m3u8-parser";
import { Playlist } from "./playlist";

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
      languages.forEach((item) => {
        playlists.push(
          new Playlist({
            type: "audio",
            url: item.uri,
            manifestUrl: masterManifestUrl,
            mediaSequence: 0,
            index: playlists.length,
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
  const uriSet = new Set<string>();
  return masterManifest.playlists.reduce<Playlist[]>((list, p) => {
    if (!uriSet.has(p.uri)) {
      const playlist = new Playlist({
        type: "video",
        url: p.uri,
        manifestUrl: masterManifestUrl,
        mediaSequence: 0,
        index: list.length,
      });
      list.push(playlist);
    }
    uriSet.add(p.uri);

    return list;
  }, []);
}
