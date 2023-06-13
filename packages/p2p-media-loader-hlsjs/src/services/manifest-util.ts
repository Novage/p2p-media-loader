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
      languages.forEach((i) => {
        playlists.push(new Playlist("audio", i.uri, masterManifestUrl, 0));
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
    (p) => new Playlist("video", p.uri, masterManifestUrl, 0)
  );
}
