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

    on<E extends TrackerEvent>(event: E, handler: TrackerEventHandler<E>): void;

    start(): void;

    complete(): void;

    update(data?: object): void;

    destroy(): void;
  }

  export type TrackerEvent = "update" | "peer" | "warning" | "error";

  export type TrackerEventHandler<E extends TrackerEvent> = E extends "update"
    ? (data: object) => void
    : E extends "peer"
    ? (peer: PeerConnection) => void
    : E extends "warning"
    ? (warning: unknown) => void
    : E extends "error"
    ? (error: unknown) => void
    : never;

  type PeerEvent = "connect" | "data" | "close" | "error";

  export type PeerConnectionEventHandler<E extends PeerEvent> =
    E extends "connect"
      ? () => void
      : E extends "data"
      ? (data: ArrayBuffer) => void
      : E extends "close"
      ? () => void
      : E extends "error"
      ? (error?: unknown) => void
      : never;

  export type PeerConnection = {
    id: string;
    initiator: boolean;
    on<E extends PeerEvent>(
      event: E,
      handler: PeerConnectionEventHandler<E>
    ): void;
    send(data: string | ArrayBuffer): void;
    write(data: string | ArrayBuffer): void;
    destroy(): void;
  };
}
