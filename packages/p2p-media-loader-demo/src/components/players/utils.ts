import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerEvents } from "./../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

type UIEventsProps = PlayerEvents & {
  engine: HlsJsP2PEngine | ShakaP2PEngine;
};

export const subscribeToUiEvents = ({
  engine,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: UIEventsProps) => {
  if (onPeerConnect) engine.addEventListener("onPeerConnect", onPeerConnect);
  if (onPeerDisconnect) {
    engine.addEventListener("onPeerClose", onPeerDisconnect);
  }
  if (onChunkDownloaded) {
    engine.addEventListener("onChunkDownloaded", onChunkDownloaded);
  }
  if (onChunkUploaded) {
    engine.addEventListener("onChunkUploaded", onChunkUploaded);
  }
};
