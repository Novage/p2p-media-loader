import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerEvents } from "./../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

type ConfigureHlsP2PEngineEventsProps = PlayerEvents & {
  engine: HlsJsP2PEngine;
};

export const configureHlsP2PEngineEvents = ({
  engine,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: ConfigureHlsP2PEngineEventsProps) => {
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

type ConfigureShakaP2PEngineEvents = PlayerEvents & {
  engine: ShakaP2PEngine;
};

export const configureShakaP2PEngineEvents = ({
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
  engine,
}: ConfigureShakaP2PEngineEvents) => {
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
