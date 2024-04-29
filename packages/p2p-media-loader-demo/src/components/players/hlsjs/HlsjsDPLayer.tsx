import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import DPlayer from "dplayer";
import { configureHlsP2PEngineEvents } from "../utils";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

export const HlsjsDPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
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
          swarmId: "custom swarm ID for stream 2000341",
          announceTrackers,
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
            configureHlsP2PEngineEvents({
              engine: hls.p2pEngine,
              onPeerConnect,
              onPeerDisconnect,
              onChunkDownloaded,
              onChunkUploaded,
            });

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
    onPeerDisconnect,
    onChunkDownloaded,
    onChunkUploaded,
  ]);

  return isHlsSupported ? (
    <div ref={containerRef} className="video-container"></div>
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
