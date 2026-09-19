import "@videojs/react/video/skin.css";
import "./videojs10.css";
import { useMemo, useState } from "react";
import { useAttachMedia, useDestroy, useMediaInstance } from "@videojs/react";
import { VideoPlayer, VideoSkin } from "@videojs/react/video";
import {
  Hls,
  HlsJsAdapter,
  PlaybackTypes,
  type HlsEngineConfig,
  type HlsSource,
} from "@videojs/hlsjs-video";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

type P2PLoaders = NonNullable<HlsEngineConfig["hlsJs"]>;

/**
 * Video.js 10 on the HLS.js P2P engine. v10 has no streaming layer of its
 * own to hook: its `HlsJsAdapter` constructs HLS.js from the config in
 * `source.engine.hlsJs`, handed over untouched, so the engine's loaders go in
 * there; and it exposes the instance as `engine`, which `bindHls` takes as a
 * getter and resolves at the first playlist load. Nothing in the packages
 * changes for this — the two calls in `P2PHlsVideo` are the whole integration.
 *
 * Quality selection is the skin's own, from the renditions HLS.js reports;
 * the other demo players carry a `<select>` because their skins have none.
 */
export const VideoJs10Hls = (props: PlayerProps) => {
  // A new adapter, HLS.js and engine per stream and per set of options, the
  // way the other players tear down and rebuild.
  const playerKey = useMemo(
    () => JSON.stringify([props.streamUrl, props.coreOptions]),
    [props.streamUrl, props.coreOptions],
  );
  return Hls.isSupported() ? (
    <div className="video-container">
      <div className="videojs10-player">
        <VideoPlayer key={playerKey}>
          <VideoSkin>
            <P2PHlsVideo {...props} />
          </VideoSkin>
        </VideoPlayer>
      </div>
    </div>
  ) : (
    <div className="error-message">
      <h3>HLS.js is not supported in this browser</h3>
    </div>
  );
};

// The adapter is driven imperatively, as v10's own media components drive
// it; a plain function keeps that out of the component body.
const setSource = (media: HlsJsAdapter, source: HlsSource) => {
  media.source = source;
};

const P2PHlsVideo = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  // Created once with the media instance and destroyed with it: `useDestroy`
  // is what v10 uses for its own adapters, and it survives StrictMode's
  // simulated unmount, which a plain effect cleanup would not — a second
  // engine bound to the same player would be one too many.
  const [engine] = useState(() => new HlsJsP2PEngine({ core: coreOptions }));
  useDestroy(engine);

  // `setup` runs once per adapter, before it is attached. Setting the source
  // is what constructs HLS.js — with the engine's loaders in its config.
  const media = useMediaInstance(HlsJsAdapter, (media) => {
    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });
    // The adapter defaults to `preload: "metadata"` and holds HLS.js at
    // `maxBufferLength: 1` until the element fires `play`, widening the
    // limits only then — and it writes that default onto the element, so the
    // attribute cannot say otherwise. Firefox starts an autoplaying element
    // at HAVE_ENOUGH_DATA, which a live stream of two second segments never
    // reaches on one fragment, so nothing ever plays and nothing ever asks
    // for more. Asking for the whole buffer up front is what autoplay means.
    media.preload = "auto";
    // Resolved when HLS.js constructs the playlist loader, by which time the
    // adapter has its instance.
    engine.bindHls(() => media.engine);
    setSource(media, {
      src: streamUrl,
      // Native HLS on Safari would bypass HLS.js, and with it the core.
      preferPlayback: PlaybackTypes.MSE,
      engine: { hlsJs: engine.getConfigForHlsJs() as P2PLoaders },
    });
  });
  const attachRef = useAttachMedia<HTMLVideoElement>(media);

  return <video ref={attachRef} autoPlay muted playsInline />;
};
