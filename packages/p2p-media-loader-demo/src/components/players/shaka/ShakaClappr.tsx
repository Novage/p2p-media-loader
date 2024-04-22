import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { getConfiguredShakaP2PEngine } from "../utils";

export const ShakaClappr = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins();
    return () => ShakaP2PEngine.unregisterPlugins();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const shakaP2PEngine = getConfiguredShakaP2PEngine({
      announceTrackers,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
      shaka: window.shaka,
    });

    const clapprPlayer = new Clappr.Player({
      parentId: "#player-container",
      source: streamUrl,
      plugins: [window.DashShakaPlayback, window.LevelSelector],
      shakaOnBeforeLoad: (shakaPlayerInstance: shaka.Player) => {
        shakaP2PEngine.configureAndInitShakaPlayer(shakaPlayerInstance);
      },
      width: "100%",
      height: "100%",
    });

    return () => {
      shakaP2PEngine.destroy();
      clapprPlayer.destroy();
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
