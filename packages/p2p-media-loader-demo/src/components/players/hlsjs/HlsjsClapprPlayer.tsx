import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { getConfiguredHlsInstance } from "../utils";

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
    const hls = getConfiguredHlsInstance({
      announceTrackers,
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
          ...hls.p2pEngine.getHlsJsConfig(),
        },
      },
      plugins: [window.LevelSelector],
      width: "100%",
      height: "100%",
    });

    hls.p2pEngine.initClapprPlayer(clapprPlayer);

    return () => {
      clapprPlayer.destroy();
      hls.destroy();
    };
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
