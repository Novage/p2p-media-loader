import md5 from "nano-md5";
import { PACKAGE_VERSION } from "./version.js";

export const TRACKER_CLIENT_VERSION_PREFIX = `-PM${formatVersion(PACKAGE_VERSION)}-`;

const HASH_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PEER_ID_LENGTH = 20;

export function getStreamHash(streamId: string): string {
  // slice one byte to have 15 bytes binary string
  const binary15BytesHashString = md5.fromUtf8(streamId).slice(1);
  const base64Hash20CharsString = btoa(binary15BytesHashString);
  return base64Hash20CharsString;
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
