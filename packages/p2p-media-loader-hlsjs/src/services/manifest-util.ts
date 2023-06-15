import { MasterManifest, PlaylistManifest } from "m3u8-parser";
import { Playlist } from "./playlist";

export function isMasterManifest(
  manifest: PlaylistManifest | MasterManifest
): manifest is MasterManifest {
  const { mediaGroups, playlists } = manifest as MasterManifest;
  return (
    playlists !== undefined &&
    Array.isArray(playlists) &&
    mediaGroups !== undefined &&
    typeof mediaGroups === "object"
  );
}

export function isPlaylistManifest(
  manifest: PlaylistManifest | MasterManifest
) {
  const { mediaSequence, segments } = manifest as PlaylistManifest;
  return (
    mediaSequence !== undefined &&
    typeof mediaSequence === "number" &&
    segments !== undefined &&
    Array.isArray(segments)
  );
}

export function getAudioPlaylistsFromMasterManifest(
  masterManifestUrl: { request: string; response: string },
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
            sequence: 0,
            index: playlists.length,
          })
        );
      });
    });
  }

  return playlists;
}

export function getVideoPlaylistsFromMasterManifest(
  masterManifestUrl: { request: string; response: string },
  masterManifest: MasterManifest
): Playlist[] {
  const uriSet = new Set<string>();
  return masterManifest.playlists.reduce<Playlist[]>((list, p) => {
    if (!uriSet.has(p.uri)) {
      const playlist = new Playlist({
        type: "video",
        url: p.uri,
        manifestUrl: masterManifestUrl,
        sequence: 0,
        index: list.length,
      });
      list.push(playlist);
    }
    uriSet.add(p.uri);

    return list;
  }, []);
}
