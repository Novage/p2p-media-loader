import "video.js/dist/video-js.css";
import "../hlsjs/hlsjs.css";
import { useEffect, useRef } from "react";
import videojs from "video.js";
import { VideoJsP2PEngine } from "p2p-media-loader-videojs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

const AUTO_QUALITY = "auto";

export type VhsRepresentation = {
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
        vhs: {
          // VHS stands aside for native HLS on Safari and iOS unless told
          // otherwise; there is nothing to route through the core natively.
          overrideNative: true,
          // VHS alone caps the rendition by the size the player is rendered
          // at, so in a small window it picks a lower one than hls.js,
          // dash.js and Shaka do and shares with none of them: a rendition is
          // a swarm. Every engine in this demo chooses on bandwidth alone.
          limitRenditionByPlayerDimensions: false,
        },
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
    // A rendition is named by what it is rather than by its VHS id, which
    // carries the playlist URL: a live stream whose CDN signs those per
    // response renames every rendition each time the manifest is refreshed.
    const labelOf = (r: VhsRepresentation) =>
      `${r.height ?? "?"}p (${Math.round((r.bandwidth ?? 0) / 1000)}k)`;
    let chosen: string = AUTO_QUALITY;
    // Enabling a single representation pins it; enabling all restores ABR.
    const applyChoice = () => {
      for (const r of representations()) {
        r.enabled(chosen === AUTO_QUALITY || labelOf(r) === chosen);
      }
    };

    // VHS fills its rendition list as it parses the manifest, and builds it
    // again on a refresh, so the list is rebuilt whenever it has changed —
    // and the viewer's choice is carried over and applied to the new one.
    let listed = "";
    const updateQualityOptions = () => {
      const reps = representations();
      const ids = reps.map((r) => r.id).join();
      if (ids === listed) return;
      listed = ids;
      if (reps.length < 2) {
        qualityElement.style.display = "none";
        return;
      }
      qualityElement.style.display = "block";
      qualityElement.options.length = 0;
      qualityElement.add(new Option("Auto", AUTO_QUALITY));
      for (const r of reps) {
        qualityElement.add(new Option(labelOf(r)));
      }
      qualityElement.value = chosen;
      applyChoice();
    };
    const onQualityChange = () => {
      chosen = qualityElement.value;
      applyChoice();
    };
    qualityElement.addEventListener("change", onQualityChange);
    const QUALITY_EVENTS = [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "progress",
    ];
    for (const event of QUALITY_EVENTS) player.on(event, updateQualityOptions);

    const isDash = /\.mpd(\?|#|$)/i.test(streamUrl);
    player.src({
      src: streamUrl,
      type: isDash ? "application/dash+xml" : "application/x-mpegURL",
    });

    return () => {
      for (const event of QUALITY_EVENTS) {
        player.off(event, updateQualityOptions);
      }
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
