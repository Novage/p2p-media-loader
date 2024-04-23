import { HlsJsP2PEngine, HlsWithP2PType } from "p2p-media-loader-hlsjs";
import { PlayerEvents, PlayerProps } from "./../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

export const getConfiguredHlsInstance = ({
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: Partial<PlayerProps>) => {
  onPeerConnect &&
    hls.p2pEngine.addEventListener("onPeerConnect", onPeerConnect);
  onPeerDisconnect &&
    hls.p2pEngine.addEventListener("onPeerClose", onPeerDisconnect);
  onChunkDownloaded &&
    hls.p2pEngine.addEventListener("onChunkDownloaded", onChunkDownloaded);
  onChunkUploaded &&
    hls.p2pEngine.addEventListener("onChunkUploaded", onChunkUploaded);

  return hls;
};

type configureHlsP2PEngineEventsProps = PlayerEvents & {
  engine: HlsJsP2PEngine;
};

export const configureHlsP2PEngineEvents = ({
  engine,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: configureHlsP2PEngineEventsProps) => {
  onPeerConnect && engine.addEventListener("onPeerConnect", onPeerConnect);
  onPeerDisconnect && engine.addEventListener("onPeerClose", onPeerDisconnect);
  onChunkDownloaded &&
    engine.addEventListener("onChunkDownloaded", onChunkDownloaded);
  onChunkUploaded &&
    engine.addEventListener("onChunkUploaded", onChunkUploaded);
};

type ShakaP2PEngineProps = Partial<PlayerProps> & {
  shaka?: typeof shaka;
};

export const getConfiguredShakaP2PEngine = ({
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
  shaka,
}: ShakaP2PEngineProps) => {
  const shakaP2PEngine = new ShakaP2PEngine(
    {
      core: {
        announceTrackers,
      },
    },
    shaka,
  );

  onPeerConnect &&
    shakaP2PEngine.addEventListener("onPeerConnect", onPeerConnect);
  onPeerDisconnect &&
    shakaP2PEngine.addEventListener("onPeerClose", onPeerDisconnect);
  onChunkDownloaded &&
    shakaP2PEngine.addEventListener("onChunkDownloaded", onChunkDownloaded);
  onChunkUploaded &&
    shakaP2PEngine.addEventListener("onChunkUploaded", onChunkUploaded);

  return shakaP2PEngine;
};
