import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import DPlayer from "dplayer";
import { subscribeToUiEvents } from "../utils";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

export const HlsjsDPlayer = ({
  streamUrl,
  announceTrackers,
  swarmId,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

    const hls = new HlsWithP2P({
      p2p: {
        core: {
          announceTrackers,
          swarmId,
        },
        onHlsJsCreated(hls) {
          subscribeToUiEvents({
            engine: hls.p2pEngine,
            onPeerConnect,
            onPeerClose,
            onChunkDownloaded,
            onChunkUploaded,
          });
        },
      },
    });

    const player = new DPlayer({
      container: containerRef.current,

      video: {
        url: "",
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            hls.attachMedia(video);
            hls.loadSource(streamUrl);
          },
        },
      },
    });

    player.play();

    return () => {
      player.destroy();
      hls.destroy();
    };
  }, [
    streamUrl,
    announceTrackers,
    onPeerConnect,
    onPeerClose,
    onChunkDownloaded,
    onChunkUploaded,
    swarmId,
  ]);

  return isHlsSupported ? (
    <div ref={containerRef} className="video-container">
      <video playsInline autoPlay muted />
    </div>
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
