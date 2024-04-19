import { useEffect, useRef } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

export const HlsjsClapprPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hls = new HlsWithP2P({
      p2p: {
        core: {
          announceTrackers,
        },
      },
    });

    if (onPeerConnect) {
      hls.p2pEngine.addEventListener("onPeerConnect", onPeerConnect);
    }
    if (onPeerDisconnect) {
      hls.p2pEngine.addEventListener("onPeerClose", onPeerDisconnect);
    }
    if (onChunkDownloaded) {
      hls.p2pEngine.addEventListener("onChunkDownloaded", onChunkDownloaded);
    }
    if (onChunkUploaded) {
      hls.p2pEngine.addEventListener("onChunkUploaded", onChunkUploaded);
    }

    /* eslint-disable */
    const clapprPlayer = new window.Clappr.Player({
      parentId: `#${containerRef.current?.id}`,
      source: streamUrl,
      playback: {
        hlsjsConfig: {
          ...hls.p2pEngine.getHlsJsConfig(),
        },
      },
      plugins: [window.LevelSelector],
      width: "100%",
      height: "100%",
    });

    hls.p2pEngine.initClapprPlayer(clapprPlayer);

    window.videoPlayer = clapprPlayer;
    return () => {
      clapprPlayer.destroy();
      hls.destroy();
    };
    /* eslint-enable */
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return (
    <div
      ref={containerRef}
      id="player-container"
      style={{ width: "100%", height: "411px" }}
    />
  );
};
