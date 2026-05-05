import { sha1 } from "./hash.js";
import { PACKAGE_VERSION } from "./version.js";

export const TRACKER_CLIENT_VERSION_PREFIX = `-PM${formatVersion(PACKAGE_VERSION)}-`;

const HASH_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PEER_ID_LENGTH = 20;

export function getStreamHash(streamId: string): string {
  // A BitTorrent tracker `infoHash` MUST be exactly 20 bytes.
  // We take 15 bytes of the binary SHA-1 and encode it to Base64.
  // This produces exactly a 20-character ASCII string (no padding).
  // In this codebase, the tracker client uses utf8ToUintArray() on this string,
  // so it correctly receives exactly 20 bytes. Note: this is a 20-byte ASCII
  // representation, not a standard 20-byte binary SHA-1 infoHash.
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
