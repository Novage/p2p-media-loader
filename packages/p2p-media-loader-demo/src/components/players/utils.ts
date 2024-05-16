import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerEvents } from "./../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

type UIEventsProps = PlayerEvents & {
  engine: HlsJsP2PEngine | ShakaP2PEngine;
};

export const subscribeToUiEvents = ({
  engine,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: UIEventsProps) => {
  if (onPeerConnect) engine.addEventListener("onPeerConnect", onPeerConnect);
  if (onPeerDisconnect) {
    engine.addEventListener("onPeerClose", onPeerDisconnect);
  }
  if (onChunkDownloaded) {
    engine.addEventListener("onChunkDownloaded", onChunkDownloaded);
  }
  if (onChunkUploaded) {
    engine.addEventListener("onChunkUploaded", onChunkUploaded);
  }
};

interface VideoElementsOptions {
  videoId?: string;
  videoClassName?: string;
  containerClassName?: string;
  playIsInline?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  aspectRatio?: string | null;
}

export const createVideoElements = (options: VideoElementsOptions = {}) => {
  const {
    videoId = "player",
    videoClassName = "",
    containerClassName = "video-container",
    playIsInline = true,
    autoplay = true,
    muted = true,
    aspectRatio = null,
  } = options;

  const videoContainer = document.createElement("div");
  videoContainer.className = containerClassName;

  const videoElement = document.createElement("video");
  videoElement.className = videoClassName;
  videoElement.id = videoId;
  videoElement.playsInline = playIsInline;
  videoElement.autoplay = autoplay;
  videoElement.muted = muted;

  if (aspectRatio) {
    videoElement.style.aspectRatio = aspectRatio;
  }

  videoContainer.appendChild(videoElement);

  return { videoContainer, videoElement };
};
