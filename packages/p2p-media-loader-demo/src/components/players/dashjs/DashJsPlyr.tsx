import "plyr/dist/plyr.css";
import { useEffect, useRef } from "react";
import * as PlyrModule from "plyr";
import type Plyr from "plyr";
import { MediaPlayer, type MediaPlayerClass } from "dashjs";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { PlayerProps } from "../../../types";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const DashJsPlyr = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { videoContainer, videoElement } = createVideoElements();
    containerRef.current.appendChild(videoContainer);

    const engine = new DashJsP2PEngine({ core: coreOptions });
    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });

    const dashPlayer: MediaPlayerClass = MediaPlayer().create();
    engine.bindPlayer(dashPlayer);

    let plyrPlayer: Plyr | undefined;
    const onStreamInitialized = () => {
      if (plyrPlayer) return;
      const representations = dashPlayer.getRepresentationsByType("video");
      const heights = Array.from(
        new Set(representations.map((r) => r.height).filter((h) => h > 0)),
      ).sort((a, b) => a - b);

      const quality: Plyr.Options["quality"] = {
        default: heights[heights.length - 1] ?? 0,
        options: heights,
        forced: true,
        onChange: (newQuality: number) => {
          const target = representations.find((r) => r.height === newQuality);
          if (!target) return;
          dashPlayer.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: false } } },
          });
          // Keep the buffer: replacing it lands the player on the live edge
          // with nothing ahead for peers to fill.
          dashPlayer.setRepresentationForTypeById("video", target.id, false);
        },
      };

      plyrPlayer = new PlyrModule.default(videoElement, {
        quality,
        autoplay: true,
        muted: true,
      });
    };
    dashPlayer.on("streamInitialized", onStreamInitialized);
    dashPlayer.initialize(videoElement, streamUrl, true);

    return () => {
      dashPlayer.off("streamInitialized", onStreamInitialized);
      engine.destroy();
      dashPlayer.reset();
      dashPlayer.destroy();
      plyrPlayer?.destroy();
      videoContainer.remove();
    };
  }, [
    coreOptions,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return <div ref={containerRef} />;
};
