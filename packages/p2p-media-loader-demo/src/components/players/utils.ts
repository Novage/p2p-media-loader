import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerProps } from "./../../types";
import Hls from "hls.js";

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
