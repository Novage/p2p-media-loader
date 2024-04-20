import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerProps } from "./../../types";
import Hls from "hls.js";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

export const getConfiguredHlsInstance = ({
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: Partial<PlayerProps>) => {
  const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

  const hls = new HlsWithP2P({
    p2p: {
      core: {
        announceTrackers,
      },
    },
  });

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

export const getConfiguredShakaP2PEngine = ({
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: Partial<PlayerProps>) => {
  const shakaP2PEngine = new ShakaP2PEngine({
    core: {
      announceTrackers,
    },
  });

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
