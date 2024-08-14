import "../clappr.css";
import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { subscribeToUiEvents } from "../utils";
import Hls from "hls.js";
import { useScripts } from "../../../hooks/useScripts";

const SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/@clappr/player@~0/dist/clappr.min.js",
  "https://cdn.jsdelivr.net/gh/clappr/clappr-level-selector-plugin@~0/dist/level-selector.min.js",
];

export const HlsjsClapprPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const areScriptsLoaded = useScripts(SCRIPTS);

  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !areScriptsLoaded) return;
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    const engine = new HlsJsP2PEngine({
      core: {
        announceTrackers,
      },
    });

    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });

    /* eslint-disable  */
    // @ts-ignore
    const clapprPlayer = new Clappr.Player({
      parentId: `#${containerRef.current.id}`,
      source: streamUrl,
      mute: true,
      autoPlay: true,
      playback: {
        playInline: true,
        hlsjsConfig: {
          ...engine.getConfigForHlsJs(),
        },
      },
      plugins: [window.LevelSelector],
      width: "100%",
      height: "100%",
    });

    engine.bindHls(() => clapprPlayer.core.getCurrentPlayback()?._hls);

    return () => {
      clapprPlayer.destroy();
      engine.destroy();
    };
    /* eslint-enable  */
  }, [
    areScriptsLoaded,
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return isHlsSupported ? (
    <div ref={containerRef} id="clappr-player" />
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
