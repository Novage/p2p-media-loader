import { sha1 } from "./hash.js";
import { PACKAGE_VERSION } from "./version.js";

export const TRACKER_CLIENT_VERSION_PREFIX = `-PM${formatVersion(PACKAGE_VERSION)}-`;

const HASH_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PEER_ID_LENGTH = 20;

export function getStreamHash(streamId: string): string {
  // We use exactly 15 bytes of entropy because 15 bytes encoded 
  // as Base64 results in exactly 20 characters (with no padding).
  // BitTorrent tracker `infoHash` MUST be exactly 20 characters/bytes.
  return btoa(sha1(streamId).slice(0, 15));
}

export function generatePeerId(trackerClientVersionPrefix: string): string {
  const trackerClientId = [trackerClientVersionPrefix];
  const randomCharsCount = PEER_ID_LENGTH - trackerClientVersionPrefix.length;

  for (let i = 0; i < randomCharsCount; i++) {
    trackerClientId.push(
      HASH_SYMBOLS[Math.floor(Math.random() * HASH_SYMBOLS.length)],
    );
  }

  return trackerClientId.join("");
}

function formatVersion(versionString: string) {
  const splittedVersion = versionString.split(".");

  return `${splittedVersion[0].padStart(2, "0")}${splittedVersion[1].padStart(2, "0")}`;
}
