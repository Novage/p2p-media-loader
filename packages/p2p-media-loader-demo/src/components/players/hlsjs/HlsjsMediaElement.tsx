import "mediaelement";
import "mediaelement/build/mediaelementplayer.min.css";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { HlsJsP2PEngine, HlsWithP2PInstance } from "p2p-media-loader-hlsjs";
import { createVideoElements, subscribeToUiEvents } from "../utils";
import { PlayerProps } from "../../../types";

export const HlsjsMediaElement = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable  */
  // @ts-ignore
  useEffect(() => {
    if (!containerRef.current) return;
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    const { videoContainer, videoElement } = createVideoElements();

    containerRef.current.appendChild(videoContainer);

    window.Hls = HlsJsP2PEngine.injectMixin(Hls);

    // @ts-ignore
    const player = new MediaElementPlayer(videoElement.id, {
      iconSprite: "/mejs-controls.svg",
      videoHeight: "100%",
      hls: {
        p2p: {
          onHlsJsCreated: (hls: HlsWithP2PInstance<Hls>) => {
            subscribeToUiEvents({
              engine: hls.p2pEngine,
              onPeerConnect,
              onPeerDisconnect,
              onChunkDownloaded,
              onChunkUploaded,
            });
          },
          core: {
            swarmId: "custom swarm ID for stream 2000341",
            announceTrackers,
          },
        },
      },
    });

    player.setSrc(streamUrl);
    player.load();

    return () => {
      window.Hls = undefined;
      player?.remove();
      videoContainer.remove();
    };
    /* eslint-enable  */
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return isHlsSupported ? (
    <div ref={containerRef} />
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
