import md5 from "nano-md5";
import { utf8ToUintArray } from "./utils";

const HASH_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PEER_ID_LENGTH = 20;

export function getStreamHash(streamId: string): {
  string: string;
  bytes: Uint8Array;
} {
  // slice one byte to have 15 bytes binary string
  const binary15BytesHashString = md5.fromUtf8(streamId).slice(1);
  const base64Hash20BytesString = btoa(binary15BytesHashString);
  const hashBytes = utf8ToUintArray(base64Hash20BytesString);

  return { string: btoa(binary15BytesHashString), bytes: hashBytes };
}

export function generateTrackerClientId(
  customTrackerClientId?: string,
): Uint8Array {
  let trackerClientId =
    customTrackerClientId &&
    customTrackerClientId.trim() !== "" &&
    customTrackerClientId.length <= 6
      ? customTrackerClientId
      : `-PM${formatVersion(__VERSION__)}-`;

  const randomCharsCount = PEER_ID_LENGTH - trackerClientId.length;
  for (let i = 0; i < randomCharsCount; i++) {
    trackerClientId += HASH_SYMBOLS.charAt(
      Math.floor(Math.random() * HASH_SYMBOLS.length),
    );
  }

  return utf8ToUintArray(trackerClientId);
}

function formatVersion(versionString: string) {
  const splittedVersion = versionString.split(".");

  return `${splittedVersion[0].padStart(2, "0")}${splittedVersion[1].padStart(2, "0")}`;
}
