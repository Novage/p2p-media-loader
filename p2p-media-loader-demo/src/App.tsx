import { useEffect, useRef, useState } from "react";
import { Engine as HlsJsEngine } from "p2p-media-loader-hlsjs";
import { Engine as ShakaEngine } from "p2p-media-loader-shaka";
import Hls from "hls.js";
import DPlayer from "dplayer";
import shakaLib from "shaka-player";
import muxjs from "mux.js";

window.muxjs = muxjs;

const players = [
  "hlsjs",
  "hls-dplayer",
  "shaka-dplayer",
  "shaka-player",
] as const;
type Player = (typeof players)[number];
type ShakaPlayer = shaka.Player;
type ExtendedWindow = Window & { videoPlayer?: { destroy?: () => void } };

const streamUrl = {
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
  live2OnlyLevel4:
    "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/level_4.m3u8",
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
  const [url, setUrl] = useState<string>(localStorage.streamUrl);
  const shakaEngine = useRef<ShakaEngine>(new ShakaEngine(shakaLib));
  const hlsEngine = useRef<HlsJsEngine>(new HlsJsEngine());
  const shakaInstance = useRef<shaka.Player>();
  const hlsInstance = useRef<Hls>();
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
    if (!localStorage.streamUrl) {
      localStorage.streamUrl = streamUrl.live2;
      setUrl(streamUrl.live2);
    }

    createNewPlayer();
  }, [playerType]);

  const setPlayerToWindow = (player: DPlayer | ShakaPlayer | Hls) => {
    (window as unknown as ExtendedWindow).videoPlayer = player;
  };

  const initShakaDplayer = (url: string) => {
    const engine = shakaEngine.current;
    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url,
        type: "customHlsOrDash",
        customType: {
          customHlsOrDash: (video: HTMLVideoElement) => {
            const src = video.src;
            const shakaPlayer = new shakaLib.Player(video);
            const onError = (error: { code: number }) => {
              // eslint-disable-next-line no-console
              console.error("Error code", error.toString(), "object", error);
            };
            shakaPlayer.addEventListener("error", (event: { code: number }) => {
              onError(event);
            });
            engine.initShakaPlayer(shakaPlayer);
            shakaPlayer.load(src).catch(onError);

            shakaInstance.current = shakaPlayer;
          },
        },
      },
    });
    setPlayerToWindow(player);
  };

  const initShakaPlayer = (url: string) => {
    if (!videoRef.current) return;
    const engine = shakaEngine.current;

    const player = new shakaLib.Player(videoRef.current);
    const onError = (error: { code: unknown }) => {
      // eslint-disable-next-line no-console
      console.error("Error code", error.code, "object", error);
    };
    player.addEventListener("error", (event: { detail: { code: unknown } }) => {
      onError(event.detail);
    });
    engine.initShakaPlayer(player);
    player.load(url).catch(onError);
    shakaInstance.current = player;
    setPlayerToWindow(player);
  };

  const initHlsJsPlayer = (url: string) => {
    if (!videoRef.current) return;
    const engine = hlsEngine.current;
    const hls = new Hls({
      ...engine.getConfig(),
    });
    engine.initHlsJsEvents(hls);
    hls.attachMedia(videoRef.current);
    hls.loadSource(url);
    hlsInstance.current = hls;
    setPlayerToWindow(hls);
  };

  const initHlsDplayer = (url: string) => {
    const engine = hlsEngine.current;
    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url,
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            const hls = new Hls({
              ...engine.getConfig(),
            });
            engine.initHlsJsEvents(hls);
            hls.loadSource(video.src);
            hls.attachMedia(video);
            hlsInstance.current = hls;
          },
        },
      },
    });
    setPlayerToWindow(player);
  };

  const destroyAndWindowPlayer = () => {
    const extendedWindow = window as ExtendedWindow;
    extendedWindow.videoPlayer?.destroy?.();
    extendedWindow.videoPlayer = undefined;
  };

  const onPlayerTypeChange = (newPlayer: Player) => {
    localStorage.player = newPlayer;
    setPlayerType(newPlayer);
    destroyAndWindowPlayer();
  };

  const onVideoUrlChange = (url: string) => {
    localStorage.streamUrl = url;
    setUrl(url);
  };

  const createNewPlayer = () => {
    if (!localStorage.videoUrl) {
      localStorage.streamUrl = streamUrl.live2;
      setUrl(streamUrl.live2);
    }
    switch (playerType) {
      case "hls-dplayer":
        initHlsDplayer(url);
        break;
      case "hlsjs":
        initHlsJsPlayer(url);
        break;
      case "shaka-dplayer":
        initShakaDplayer(url);
        break;
      case "shaka-player":
        initShakaPlayer(url);
        break;
    }
  };

  const loadStreamWithExistingInstance = () => {
    switch (playerType) {
      case "hls-dplayer":
      case "hlsjs":
        hlsInstance.current?.loadSource(url);
        break;
      case "shaka-player":
      case "shaka-dplayer":
        shakaInstance.current?.load(url).catch(() => undefined);
        break;
    }
  };

  return (
    <div style={{ textAlign: "center", width: 1000, margin: "auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1>This is Demo</h1>
        <div style={{ textAlign: "start" }}>
          <select
            value={playerType}
            onChange={(event) =>
              onPlayerTypeChange(event.target.value as Player)
            }
          >
            {players.map((player) => {
              return (
                <option key={player} value={player}>
                  {player}
                </option>
              );
            })}
          </select>
          <select
            value={url}
            onChange={(event) => onVideoUrlChange(event.target.value)}
          >
            {Object.entries(streamUrl).map(([name, url]) => {
              return (
                <option key={name} value={url}>
                  {name}
                </option>
              );
            })}
          </select>
          <button onClick={createNewPlayer}>Create new player</button>
          <button onClick={loadStreamWithExistingInstance}>
            Load stream with existing hls/shaka instance
          </button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          ref={containerRef}
          id="player-container"
          style={{ width: 1000 }}
        ></div>
      </div>
      {!!playerType && ["hlsjs", "shaka-player"].includes(playerType) && (
        <video ref={videoRef} controls muted style={{ width: 800 }} />
      )}
    </div>
  );
}

export default App;
