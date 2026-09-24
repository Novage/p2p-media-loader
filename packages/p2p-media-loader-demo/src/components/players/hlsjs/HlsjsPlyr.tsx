import "plyr/dist/plyr.css";
import * as PlyrModule from "plyr";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const HlsjsPlyr = ({
  streamUrl,
  coreOptions,
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
        core: coreOptions,
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

      const plyrOptions: PlyrModule.Options = {
        autoplay: true,
        muted: true,
      };

      if (levels.length > 0) {
        plyrOptions.quality = {
          default: levels[levels.length - 1].height,
          options: levels.map((level) => level.height),
          forced: true,
          onChange: (newQuality: number) => {
            levels.forEach((level, levelIndex) => {
              if (level.height === newQuality) {
                // Switch at the next fragment; an immediate switch flushes
                // the buffer and lands the player on the live edge.
                hls.nextLevel = levelIndex;
              }
            });
          },
        };
      }

      player = new PlyrModule.default(videoElement, plyrOptions);
    });

    hls.attachMedia(videoElement);
    hls.loadSource(streamUrl);

    return () => {
      player?.destroy();
      videoContainer.remove();
      hls.destroy();
    };
  }, [
    coreOptions,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return Hls.isSupported() ? (
    <div ref={containerRef} />
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
