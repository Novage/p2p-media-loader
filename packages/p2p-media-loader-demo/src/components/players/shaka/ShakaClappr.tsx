import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

ShakaP2PEngine.registerPlugins();

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
    if (!containerRef.current) return;

    const shakaP2PEngine = new ShakaP2PEngine({
      core: {
        announceTrackers,
      },
    });

    if (onPeerConnect) {
      shakaP2PEngine.addEventListener("onPeerConnect", onPeerConnect);
    }
    if (onPeerDisconnect) {
      shakaP2PEngine.addEventListener("onPeerClose", onPeerDisconnect);
    }
    if (onChunkDownloaded) {
      shakaP2PEngine.addEventListener("onChunkDownloaded", onChunkDownloaded);
    }
    if (onChunkUploaded) {
      shakaP2PEngine.addEventListener("onChunkUploaded", onChunkUploaded);
    }

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

    return () => clapprPlayer.destroy();
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
