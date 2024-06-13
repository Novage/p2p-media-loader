declare module "bittorrent-tracker" {
  import type { Duplex, WritableEvents } from "streamx";

  export default class Client {
    constructor(options: {
      infoHash: Uint8Array;
      peerId: Uint8Array;
      announce: string[];
      rtcConfig?: RTCConfiguration;
      getAnnounceOpts?: () => object;
    });

    on<E extends keyof TrackerClientEvents>(
      event: E,
      handler: TrackerClientEvents[E],
    ): void;

    start(): void;

    complete(): void;

    update(data?: object): void;

    destroy(): void;
  }

  export type TrackerClientEvents = {
    update: (data: object) => void;
    peer: (peer: PeerConnection) => void;
    warning: (warning: unknown) => void;
    error: (error: unknown) => void;
  };

  export type PeerEvents = {
    connect: () => void;
  } & WritableEvents<unknown>;

  export type PeerConnection = Duplex & {
    id: string;
    idUtf8: string;
    initiator: boolean;
    on<E extends keyof PeerEvents>(event: E, handler: PeerEvents[E]): void;
    off<E extends keyof PeerEvents>(event: E, handler: PeerEvents[E]): void;
    send(data: string | ArrayBuffer): void;
  };
}

declare module "nano-md5" {
  type BinaryStringObject = string & { toHex: () => string };
  const md5: {
    (utf8String: string): string; // returns hex string interpretation of binary data
    fromUtf8(utf8String: string): BinaryStringObject;
  };

  export default md5;
}
