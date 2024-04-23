import "plyr/dist/plyr.css";
import Plyr, { Options } from "plyr";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { configureHlsP2PEngineEvents } from "../utils";

export const HlsjsPlyr = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);

  useEffect(() => {
    return () => {
      playerRef.current && playerRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

    const hls = new HlsWithP2P({
      p2p: {
        core: {
          swarmId: "custom swarm ID for stream 2000341",
          announceTrackers,
        },
      },
    });

    configureHlsP2PEngineEvents({
      engine: hls.p2pEngine,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!videoRef.current) return;

      const levels = hls.levels;

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

      playerRef.current = new Plyr(videoRef.current, {
        quality,
        autoplay: true,
      });
    });

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    return () => hls.destroy();
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return (
    <div className="video-container">
      <video ref={videoRef} />
    </div>
  );
};
