import "plyr/dist/plyr.css";
import Plyr, { Options } from "plyr";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const HlsjsPlyr = ({
  streamUrl,
  announceTrackers,
  swarmId,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !Hls.isSupported()) return;

    let player: Plyr | undefined;

    const { videoContainer, videoElement } = createVideoElements();

    containerRef.current.appendChild(videoContainer);

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

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const { levels } = hls;

      const quality: Options["quality"] = {
        default: levels[levels.length - 1].height,
        options: levels.map((level) => level.height),
        forced: true,
        onChange: (newQuality: number) => {
          levels.forEach((level, levelIndex) => {
            if (level.height === newQuality) {
              hls.currentLevel = levelIndex;
            }
          });
        },
      };

      player = new Plyr(videoElement, {
        quality,
        autoplay: true,
        muted: true,
      });
    });

    hls.attachMedia(videoElement);
    hls.loadSource(streamUrl);

    return () => {
      player?.destroy();
      videoContainer.remove();
      hls.destroy();
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
    swarmId,
  ]);

  return Hls.isSupported() ? (
    <div ref={containerRef} />
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
