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
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);
  const p2pEngineRef = useRef<HlsJsP2PEngine | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
    const hls = new HlsWithP2P({
      p2p: {
        core: {
          announceTrackers,
        },
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

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    /*hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!qualityRef.current) return;
      updateQualityOptions(hls, qualityRef.current);
    });*/
    hls.currentLevel = 4;
    p2pEngineRef.current = hls.p2pEngine;

    return () => hls.destroy();
  }, [
    onPeerConnect,
    onPeerClose,
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
      <button
        onClick={() => {
          if (!p2pEngineRef.current) return;
          p2pEngineRef.current.applyDynamicConfig({
            core: {
              isP2PDisabled: true,
            },
          });
        }}
      >
        Disable p2p
      </button>
      <video
        ref={videoRef}
        style={{ aspectRatio: "auto" }}
        controls
        playsInline
        autoPlay
        muted
      />
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
