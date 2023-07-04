import { useEffect, useRef, useState } from "react";
import { Engine as HlsJsEngine } from "p2p-media-loader-hlsjs";
import { Engine as ShakaEngine } from "p2p-media-loader-shaka";
import Hls from "hls.js";
import DPlayer from "dplayer";
// @ts-ignore
import shaka from "shaka-player";
import muxjs from "mux.js";

window.muxjs = muxjs;

const players = ["hlsjs", "hls-dplayer", "shaka-dplayer"] as const;
type Player = (typeof players)[number];
type ShakaPlayer = object;
type ExtendedWindow = Window & { videoPlayer?: object };

const videoUrl = {
  bigBunnyBuck: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  byteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
  live: "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8",
  advancedVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8",
  advancedVideo2:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
  advancedVideo3:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
  advancedVideo4:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  basicExample:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
  bigBunnyBuckDash: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
  live2: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
  dashLiveWithSeparateVideoAudio:
    "https://livesim.dashif.org/livesim/testpic_2s/Manifest.mpd",
  hlsAkamaiLive:
    "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
  mss: "https://playready.directtaps.net/smoothstreaming/SSWSS720H264/SuperSpeedway_720.ism/Manifest",
};

function App() {
  const [playerType, setPlayerType] = useState<Player | undefined>(
    localStorage.player
  );
  const [engine, setEngine] = useState<HlsJsEngine | ShakaEngine>();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (
      !Hls.isSupported() ||
      (window as unknown as ExtendedWindow).videoPlayer
    ) {
      return;
    }
    if (!localStorage.player) {
      localStorage.player = "hls-dplayer";
      setPlayerType("hls-dplayer");
    }
    const url = videoUrl.live;

    switch (playerType) {
      case "hls-dplayer":
        initHlsDplayer(url);
        break;
      case "shaka-dplayer":
        initShakaDplayer(url);
        break;
      case "hlsjs":
        initHlsJsPlayer(url);
        break;
    }
  }, [playerType]);

  const setPlayerLocalStorage = (player: DPlayer | ShakaPlayer | Hls) => {
    (window as unknown as ExtendedWindow).videoPlayer = player;
  };

  const initShakaDplayer = (url: string) => {
    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url,
        type: "customHlsOrDash",
        customType: {
          customHlsOrDash: (video: HTMLVideoElement) => {
            const engine = new ShakaEngine(shaka);

            const src = video.src;
            const shakaPlayer = new shaka.Player(video);
            const onError = (error: { code: number }) => {
              // eslint-disable-next-line no-console
              console.error("Error code", error.toString(), "object", error);
            };
            shakaPlayer.addEventListener("error", (event: { code: number }) => {
              onError(event);
            });
            engine.initShakaPlayer(shakaPlayer);
            shakaPlayer.load(src).catch(onError);
          },
        },
      },
    });
    setPlayerLocalStorage(player);
  };

  const initHlsJsPlayer = (url: string) => {
    if (!videoRef.current) return;
    const hlsEngine =
      engine instanceof HlsJsEngine ? engine : new HlsJsEngine();
    setEngine(hlsEngine);
    const hls = new Hls({
      ...hlsEngine.getConfig(),
    });
    hlsEngine.initHlsEvents(hls);
    hls.loadSource(url);
    hls.attachMedia(videoRef.current);
    setPlayerLocalStorage(hls);
  };

  const initHlsDplayer = (url: string) => {
    const hlsEngine =
      engine && engine instanceof HlsJsEngine ? engine : new HlsJsEngine();
    setEngine(hlsEngine);

    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url,
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            const hls = new Hls({
              ...hlsEngine.getConfig(),
            });
            hlsEngine.initHlsEvents(hls);
            hls.loadSource(video.src);
            hls.attachMedia(video);
          },
        },
      },
    });
    setPlayerLocalStorage(player);
  };

  const setPlayer = (newPlayer: Player) => {
    localStorage.player = newPlayer;
    setPlayerType(newPlayer);
    if ((window as any).videoPlayer) {
      (window as any).videoPlayer.destroy?.();
      (window as any).videoPlayer = undefined;
    }
  };

  return (
    <div style={{ textAlign: "center", width: 1000, margin: "auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1>This is HLS.JS Player Demo</h1>
        <div style={{ textAlign: "start" }}>
          <select
            value={playerType}
            onChange={(event) => setPlayer(event.target.value as Player)}
          >
            {players.map((player) => {
              return (
                <option key={player} value={player}>
                  {player}
                </option>
              );
            })}
          </select>
          {/*<button onClick={start}>Start</button>*/}
          {/*<button onClick={destroy}>Stop</button>*/}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          ref={containerRef}
          id="player-container"
          style={{ width: 1000 }}
        ></div>
      </div>
      {playerType === "hlsjs" && <video ref={videoRef} controls muted></video>}
    </div>
  );
}

export default App;
