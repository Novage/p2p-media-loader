import { utf8ToUintArray } from "./utils.js";

export function sha1(str: string): string {
  const bytes = utf8ToUintArray(str);
  const words: number[] = [];
  const msgLen = bytes.length * 8;

  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
  }
  words[msgLen >> 5] |= 0x80 << (24 - (msgLen % 32));
  words[(((msgLen + 64) >> 9) << 4) + 15] = msgLen;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w: number[] = [];
  for (let i = 0; i < words.length; i += 16) {
    const a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let j = 0; j < 80; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
        w[j] = (n << 1) | (n >>> 31);
      }
      let f: number;
      if (j < 20) {
        f = ((h1 & h2) | (~h1 & h3)) + 0x5a827999;
      } else if (j < 40) {
        f = (h1 ^ h2 ^ h3) + 0x6ed9eba1;
      } else if (j < 60) {
        f = ((h1 & h2) | (h1 & h3) | (h2 & h3)) - 0x70e44324;
      } else {
        f = (h1 ^ h2 ^ h3) - 0x359d3e2a;
      }

      const t = (((h0 << 5) | (h0 >>> 27)) + h4 + (w[j] >>> 0) + f) | 0;
      h4 = h3;
      h3 = h2;
      h2 = (h1 << 30) | (h1 >>> 2);
      h1 = h0;
      h0 = t;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  let bin = "";
  const wordsOut = [h0, h1, h2, h3, h4];
  for (let i = 0; i < 20; i++) {
    const shift = 24 - (i % 4) * 8;
    const word = wordsOut[i >> 2];
    bin += String.fromCharCode((word >>> shift) & 0xff);
  }
  return bin;
}
