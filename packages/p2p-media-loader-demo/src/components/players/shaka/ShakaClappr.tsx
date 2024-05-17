import "../clappr.css";
import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { subscribeToUiEvents } from "../utils";

export const ShakaClappr = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isShakaSupported, setIsShakaSupported] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins();
    return () => ShakaP2PEngine.unregisterPlugins();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!window.shaka.Player.isBrowserSupported()) {
      setIsShakaSupported(false);
      return;
    }

    const shakaP2PEngine = new ShakaP2PEngine(
      {
        core: {
          announceTrackers,
        },
      },
      window.shaka,
    );

    /* eslint-disable  */
    // @ts-ignore
    const clapprPlayer = new Clappr.Player({
      parentId: `#${containerRef.current.id}`,
      source: streamUrl,
      plugins: [window.DashShakaPlayback, window.LevelSelector],
      mute: true,
      autoPlay: true,
      playback: {
        playInline: true,
      },
      shakaOnBeforeLoad: (shakaPlayerInstance: shaka.Player) => {
        subscribeToUiEvents({
          engine: shakaP2PEngine,
          onPeerConnect,
          onPeerClose,
          onChunkDownloaded,
          onChunkUploaded,
        });

        shakaP2PEngine.configureAndInitShakaPlayer(shakaPlayerInstance);
      },
      width: "100%",
      height: "100%",
    });

    return () => {
      shakaP2PEngine.destroy();
      clapprPlayer.destroy();
    };
    /* eslint-enable  */
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return isShakaSupported ? (
    <div ref={containerRef} id="clappr-player" />
  ) : (
    <div className="error-message">
      <h3>Shaka Player is not supported in this browser</h3>
    </div>
  );
};
