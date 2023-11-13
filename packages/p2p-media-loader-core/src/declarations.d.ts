declare module "bittorrent-tracker" {
  export default class Client {
    constructor(options: {
      infoHash: string;
      peerId: string;
      announce: string[];
      port: number;
      rtcConfig?: RTCConfiguration;
      getAnnounceOpts?: () => object;
    });

    on<E extends keyof TrackerClientEvents>(
      event: E,
      handler: TrackerClientEvents[E]
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
    data: (data: Uint8Array) => void;
    close: () => void;
    error: (error: { code: string }) => void;
  };

  export type PeerConnection = {
    id: string;
    initiator: boolean;
    _channel: RTCDataChannel;
    on<E extends keyof PeerEvents>(event: E, handler: PeerEvents[E]): void;
    send(data: string | ArrayBuffer): void;
    write(data: string | ArrayBuffer): void;
    destroy(): void;
  };
}
