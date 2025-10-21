import "./hlsjs.css";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

export const HlsjsPlayer = ({
  streamUrl,
  announceTrackers,
  swarmId,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!videoRef.current || !Hls.isSupported() || !qualityRef.current) return;

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
    const hls = new HlsWithP2P({
      p2p: {
        core: {
          announceTrackers,
          swarmId,
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

    const qualityElement = qualityRef.current;
    const updateQualityOptions = () => {
      if (hls.levels.length < 2) {
        qualityElement.style.display = "none";
      } else {
        qualityElement.style.display = "block";
        qualityElement.options.length = 0;
        qualityElement.add(new Option("Auto", "-1"));

        hls.levels.forEach((level, index) => {
          const label = `${level.height}p (${Math.round(level.bitrate / 1000)}k)`;
          qualityElement.add(new Option(label, index.toString()));
        });
      }
    };
    const onQualityChange = () =>
      (hls.currentLevel = parseInt(qualityElement.value, 10));

    qualityElement.addEventListener("change", onQualityChange);
    hls.on(Hls.Events.MANIFEST_PARSED, updateQualityOptions);

    return () => {
      hls.off(Hls.Events.MANIFEST_PARSED, updateQualityOptions);
      hls.destroy();
      qualityElement.removeEventListener("change", onQualityChange);
    };
  }, [
    onPeerConnect,
    onPeerClose,
    onChunkDownloaded,
    onChunkUploaded,
    streamUrl,
    announceTrackers,
    swarmId,
  ]);

  return Hls.isSupported() ? (
    <div className="video-container">
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
