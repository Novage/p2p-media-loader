import "../clappr.css";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { configureHlsP2PEngineEvents } from "../utils";

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
    const engine = new HlsJsP2PEngine({
      core: {
        swarmId: "custom swarm ID for stream 2000341",
        announceTrackers,
      },
    });

    configureHlsP2PEngineEvents({
      engine,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    const clapprPlayer = new Clappr.Player({
      parentId: `#${containerRef.current?.id}`,
      source: streamUrl,
      playback: {
        hlsjsConfig: {
          ...engine.getHlsJsConfig(),
        },
      },
      plugins: [window.LevelSelector],
      width: "100%",
      height: "100%",
    });

    engine.initClapprPlayer(clapprPlayer);

    return () => {
      clapprPlayer.destroy();
      engine.destroy();
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return <div ref={containerRef} id="clappr-player" />;
};
