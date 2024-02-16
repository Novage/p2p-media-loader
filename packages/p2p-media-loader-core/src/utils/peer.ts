import md5 from "nano-md5";
import { utf8ToUintArray } from "./utils";
import packageJson from "../../../../package.json";

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

export function generatePeerId(clientAzId: string): {
  string: string;
  bytes: Uint8Array;
} {
  const clientVersion = formatVersion(packageJson.version);

  let peerId = `-${clientAzId}${clientVersion}-`;
  const randomCharsAmount = PEER_ID_LENGTH - peerId.length;
  for (let i = 0; i < randomCharsAmount; i++) {
    peerId += HASH_SYMBOLS.charAt(
      Math.floor(Math.random() * HASH_SYMBOLS.length),
    );
  }

  return { string: peerId, bytes: utf8ToUintArray(peerId) };
}

function formatVersion(versionString: string) {
  const replacedString = versionString.replace(/\./g, "");

  return replacedString.length < 4 ? replacedString + "0" : replacedString;
}
