import RIPEMD160 from "ripemd160";

const HASH_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PEER_ID_LENGTH = 20;

export function getStreamHash(streamId: string): string {
  const symbolsCount = HASH_SYMBOLS.length;
  const bytes = new RIPEMD160().update(streamId).digest();
  let hash = "";

  for (const byte of bytes) {
    hash += HASH_SYMBOLS[byte % symbolsCount];
  }

  return hash;
}

export function generatePeerId(): string {
  let peerId = "PEER:";
  const randomCharsAmount = PEER_ID_LENGTH - peerId.length;

  for (let i = 0; i < randomCharsAmount; i++) {
    peerId += HASH_SYMBOLS.charAt(
      Math.floor(Math.random() * HASH_SYMBOLS.length)
    );
  }

  return peerId;
}
