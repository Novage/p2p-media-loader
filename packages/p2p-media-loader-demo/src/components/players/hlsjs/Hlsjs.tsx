import "./Hlsjs.css";
import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

export const HlsjsPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    if (!videoRef.current) return;

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
    const hls = new HlsWithP2P({
      p2p: {
        core: {
          swarmId: "custom swarm ID for stream 2000341",
          announceTrackers,
        },
        onHlsJsCreated(hls) {
          subscribeToUiEvents({
            engine: hls.p2pEngine,
            onPeerConnect,
            onPeerDisconnect,
            onChunkDownloaded,
            onChunkUploaded,
          });
        },
      },
    });

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!qualityRef.current) return;
      updateQualityOptions(hls, qualityRef.current);
    });

    return () => hls.destroy();
  }, [
    onPeerConnect,
    onPeerDisconnect,
    onChunkDownloaded,
    onChunkUploaded,
    streamUrl,
    announceTrackers,
  ]);

  const updateQualityOptions = (hls: Hls, selectElement: HTMLSelectElement) => {
    if (hls.levels.length < 2) {
      selectElement.style.display = "none";
    } else {
      selectElement.style.display = "block";
      selectElement.options.length = 0;
      selectElement.add(new Option("Auto", "-1"));
      hls.levels.forEach((level, index) => {
        const label = `${level.height}p (${Math.round(level.bitrate / 1000)}k)`;
        selectElement.add(new Option(label, index.toString()));
      });

      selectElement.addEventListener("change", () => {
        hls.currentLevel = parseInt(selectElement.value);
      });
    }
  };

  return isHlsSupported ? (
    <div className="video-container">
      <video ref={videoRef} controls playsInline autoPlay muted />
      <div className="select-container">
        <select ref={qualityRef} className="quality-selector" />
      </div>
    </div>
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
