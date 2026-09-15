import "video.js/dist/video-js.css";
import "../hlsjs/hlsjs.css";
import { useEffect, useRef } from "react";
import videojs from "video.js";
import { VideoJsP2PEngine } from "p2p-media-loader-videojs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

const AUTO_QUALITY = "auto";

type VhsRepresentation = {
  id: string;
  height?: number;
  bandwidth?: number;
  enabled(enable?: boolean): unknown;
};
type TechWithVhs = { vhs?: { representations?(): VhsRepresentation[] } };

export const VideoJs = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!containerRef.current || !qualityRef.current) return;

    // video.js replaces the element it is given, so it gets one of its own.
    const videoElement = document.createElement("video");
    videoElement.className = "video-js vjs-default-skin";
    videoElement.style.width = "100%";
    videoElement.style.aspectRatio = "16 / 9";
    containerRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: true,
      muted: true,
      playsinline: true,
      html5: {
        // VHS stands aside for native HLS on Safari and iOS unless told
        // otherwise; there is nothing to route through the core natively.
        vhs: { overrideNative: true },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    const engine = new VideoJsP2PEngine({ core: coreOptions }, videojs);
    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });
    engine.bindPlayer(player);

    const qualityElement = qualityRef.current;
    const representations = () =>
      (player.tech(true) as unknown as TechWithVhs).vhs?.representations?.() ??
      [];
    const updateQualityOptions = () => {
      const reps = representations();
      if (reps.length < 2) {
        qualityElement.style.display = "none";
        return;
      }
      qualityElement.style.display = "block";
      qualityElement.options.length = 0;
      qualityElement.add(new Option("Auto", AUTO_QUALITY));
      for (const r of reps) {
        const label = `${r.height ?? "?"}p (${Math.round((r.bandwidth ?? 0) / 1000)}k)`;
        qualityElement.add(new Option(label, r.id));
      }
    };
    const onQualityChange = () => {
      const chosen = qualityElement.value;
      // Enabling a single representation pins it; enabling all restores ABR.
      for (const r of representations()) {
        r.enabled(chosen === AUTO_QUALITY || r.id === chosen);
      }
    };
    qualityElement.addEventListener("change", onQualityChange);
    player.on("loadedmetadata", updateQualityOptions);

    const isDash = /\.mpd(\?|#|$)/i.test(streamUrl);
    player.src({
      src: streamUrl,
      type: isDash ? "application/dash+xml" : "application/x-mpegURL",
    });

    return () => {
      qualityElement.removeEventListener("change", onQualityChange);
      engine.destroy();
      player.dispose();
    };
  }, [
    coreOptions,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return (
    <div className="video-container">
      <div ref={containerRef} />
      <div className="select-container">
        <select ref={qualityRef} className="quality-selector" />
      </div>
    </div>
  );
};
