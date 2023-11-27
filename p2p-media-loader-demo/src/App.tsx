import React, { useCallback, useEffect, useRef, useState } from "react";
import { Engine as HlsJsEngine } from "p2p-media-loader-hlsjs";
import { Engine as ShakaEngine } from "p2p-media-loader-shaka";
import Hls from "hls.js";
import DPlayer from "dplayer";
import Clappr from "@clappr/player";
import shakaLib from "shaka-player";
import muxjs from "mux.js";
import debug from "debug";

window.muxjs = muxjs;
(window as any).Clappr = Clappr;
(window as any).Hls = Hls;

const players = [
  "hlsjs",
  "hls-dplayer",
  "shaka-dplayer",
  "shaka-player",
  "hls-clappr",
] as const;
type Player = (typeof players)[number];
type ShakaPlayer = shaka.Player;
type ExtendedWindow = Window & { videoPlayer?: { destroy?: () => void } };

const streamUrls = {
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
  mss: "https://playready.directtaps.net/smoothstreaming/SSWSS720H264/SuperSpeedway_720.ism/Manifest",
  audioOnly:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/a1/prog_index.m3u8",
  dash1:
    "http://dash.akamaized.net/dash264/TestCases/1a/qualcomm/1/MultiRate.mpd",
  dash2: "http://dash.akamaized.net/dash264/TestCases/5b/nomor/6.mpd",
};

function App() {
  const [playerType, setPlayerType] = useState<Player | undefined>(
    localStorage.player
  );
  const [streamUrl, setStreamUrl] = useState<string>(localStorage.streamUrl);
  const shakaInstance = useRef<shaka.Player>();
  const hlsInstance = useRef<Hls>();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [httpLoaded, setHttpLoaded] = useState<number>(0);
  const [p2pLoaded, setP2PLoaded] = useState<number>(0);
  const [httpLoadedGlob, setHttpLoadedGlob] = useLocalStorageItem<number>(
    "httpLoaded",
    0,
    (v) => v.toString(),
    (v) => (v !== null ? +v : 0)
  );
  const [p2pLoadedGlob, setP2PLoadedGlob] = useLocalStorageItem<number>(
    "p2pLoaded",
    0,
    (v) => v.toString(),
    (v) => (v !== null ? +v : 0)
  );

  const hlsEngine = useRef<HlsJsEngine>();
  const shakaEngine = useRef<ShakaEngine>();

  const onSegmentLoaded = (byteLength: number, type: "http" | "p2p") => {
    const MBytes = getMBFromBytes(byteLength);
    if (type === "http") {
      setHttpLoaded((prev) => round(prev + MBytes));
      setHttpLoadedGlob((prev) => round(prev + MBytes));
    } else if (type === "p2p") {
      setP2PLoaded((prev) => round(prev + MBytes));
      setP2PLoadedGlob((prev) => round(prev + MBytes));
    }
  };

  if (!hlsEngine.current) {
    hlsEngine.current = new HlsJsEngine({ onSegmentLoaded });
  }

  if (!shakaEngine.current) {
    shakaEngine.current = new ShakaEngine(shakaLib, { onSegmentLoaded });
  }

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
      localStorage.streamUrl = streamUrls.live2;
      setStreamUrl(streamUrls.live2);
    }
    createNewPlayer();
  }, [playerType]);

  const setPlayerToWindow = (player: DPlayer | ShakaPlayer | Hls) => {
    (window as unknown as ExtendedWindow).videoPlayer = player;
  };

  const initShakaDPlayer = (url: string) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const engine = shakaEngine.current!;
    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url,
        type: "customHlsOrDash",
        customType: {
          customHlsOrDash: (video: HTMLVideoElement) => {
            video.autoplay = true;
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const engine = shakaEngine.current!;

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const engine = hlsEngine.current!;
    const hls = new Hls({
      ...engine.getConfig(),
    });
    engine.initHlsJsEvents(hls);
    hls.attachMedia(videoRef.current);
    hls.loadSource(url);
    hlsInstance.current = hls;
    setPlayerToWindow(hls);
  };

  const initHlsDPlayer = (url: string) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const engine = hlsEngine.current!;
    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url,
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            const hls = new Hls({
              ...engine.getConfig(),
              liveSyncDurationCount: 7,
            });
            engine.initHlsJsEvents(hls);
            hls.loadSource(video.src);
            hls.attachMedia(video);
            hlsInstance.current = hls;
          },
        },
      },
    });
    player.play();
    setPlayerToWindow(player);
  };

  const initHlsClapprPlayer = (url: string) => {
    const engine = hlsEngine.current!;
    const clapprPlayer = new Clappr.Player({
      parentId: "#player-container",
      source: url,
      playback: {
        hlsjsConfig: {
          ...engine.getConfig(),
          // enableWorker: true,
        },
      },
    });
    clapprPlayer.play();
    console.log(engine);
    console.log(clapprPlayer);
    initClapprPlayer(clapprPlayer);
    setPlayerToWindow(clapprPlayer);
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

  const onVideoUrlChange = (streamUrl: string) => {
    localStorage.streamUrl = streamUrl;
    setStreamUrl(streamUrl);
  };

  const createNewPlayer = () => {
    setHttpLoadedGlob(0);
    setP2PLoadedGlob(0);
    switch (playerType) {
      case "hls-dplayer":
        initHlsDPlayer(streamUrl);
        break;
      case "hlsjs":
        initHlsJsPlayer(streamUrl);
        break;
      case "shaka-dplayer":
        initShakaDPlayer(streamUrl);
        break;
      case "shaka-player":
        initShakaPlayer(streamUrl);
        break;
      case "hls-clappr":
        initHlsClapprPlayer(streamUrl);
        break;
    }
  };

  const loadStreamWithExistingInstance = () => {
    switch (playerType) {
      case "hls-dplayer":
      case "hlsjs":
        hlsInstance.current?.loadSource(streamUrl);
        break;
      case "shaka-player":
      case "shaka-dplayer":
        shakaInstance.current?.load(streamUrl).catch(() => undefined);
        break;
    }
  };

  return (
    <div style={{ width: 1000, margin: "auto" }}>
      <div style={{ textAlign: "center" }}>
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
              value={streamUrl}
              onChange={(event) => onVideoUrlChange(event.target.value)}
            >
              {Object.entries(streamUrls).map(([name, url]) => {
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
          />
        </div>
        {!!playerType && ["hlsjs", "shaka-player"].includes(playerType) && (
          <video ref={videoRef} controls muted style={{ width: 800 }} />
        )}
      </div>
      <div style={{ display: "flex" }}>
        <div>
          <LoadStat title="Local stat" http={httpLoaded} p2p={p2pLoaded} />
          <LoadStat
            title="Global stat"
            http={httpLoadedGlob}
            p2p={p2pLoadedGlob}
          />
        </div>
        <div style={{ marginLeft: 50 }}>
          <LoggersSelect />
        </div>
      </div>
    </div>
  );
}

export default App;

function LoadStat({
  http,
  p2p,
  title,
}: {
  http: number;
  p2p: number;
  title: string;
}) {
  const sum = http + p2p;
  return (
    <div style={{ textAlign: "left" }}>
      <h4 style={{ marginBottom: 10 }}>{title}</h4>
      <div>
        Http loaded: {http.toFixed(2)} MB; {getPercent(http, sum)}%
      </div>
      <div>
        P2P loaded: {p2p.toFixed(2)} MB; {getPercent(p2p, sum)}%
      </div>
    </div>
  );
}

function LoggersSelect() {
  const [activeLoggers, setActiveLoggers] = useLocalStorageItem<string[]>(
    "debug",
    [],
    (list) => {
      setTimeout(() => debug.enable(localStorage.debug), 0);
      if (list.length === 0) return null;
      return list.join(",");
    },
    (storageItem) => {
      setTimeout(() => debug.enable(localStorage.debug), 0);
      if (!storageItem) return [];
      return storageItem.split(",");
    }
  );

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveLoggers(
      Array.from(event.target.selectedOptions, (option) => option.value)
    );
  };

  return (
    <div>
      <h4 style={{ marginBottom: 10 }}>Loggers: </h4>
      <select
        value={activeLoggers}
        onChange={onChange}
        multiple
        style={{ width: 300, height: 200 }}
      >
        {loggers.map((logger) => (
          <option key={logger} value={logger}>
            {logger}
          </option>
        ))}
      </select>
    </div>
  );
}

function getPercent(a: number, b: number) {
  if (a === 0 && b === 0) return "0";
  if (b === 0) return "100";
  return ((a / b) * 100).toFixed(2);
}

function round(value: number, digitsAfterComma = 2) {
  return Math.round(value * Math.pow(10, digitsAfterComma)) / 100;
}

function getMBFromBytes(bytes: number) {
  return round(bytes / Math.pow(1024, 2));
}

function useLocalStorageItem<T>(
  prop: string,
  initValue: T,
  valueToStorageItem: (value: T) => string | null,
  storageItemToValue: (storageItem: string | null) => T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(
    storageItemToValue(localStorage[prop]) ?? initValue
  );
  const setValueExternal = useCallback((value: T | ((prev: T) => T)) => {
    setValue(value);
    if (typeof value === "function") {
      const prev = storageItemToValue(localStorage.getItem(prop));
      const next = (value as (prev: T) => T)(prev);
      const result = valueToStorageItem(next);
      if (result !== null) localStorage.setItem(prop, result);
      else localStorage.removeItem(prop);
    } else {
      const result = valueToStorageItem(value);
      if (result !== null) localStorage.setItem(prop, result);
      else localStorage.removeItem(prop);
    }
  }, []);

  useEffect(() => {
    const eventHandler = (event: StorageEvent) => {
      if (event.key !== prop) return;
      const value = event.newValue;
      setValue(storageItemToValue(value));
    };
    window.addEventListener("storage", eventHandler);
    return () => {
      window.removeEventListener("storage", eventHandler);
    };
  }, []);

  return [value, setValueExternal];
}

const loggers = [
  "core:hybrid-loader-main",
  "core:hybrid-loader-main-engine",
  "core:hybrid-loader-secondary",
  "core:hybrid-loader-secondary-engine",
  "core:p2p-loader",
  "core:peer",
  "core:p2p-loaders-container",
  "core:requests-container-main",
  "core:requests-container-secondary",
  "core:segment-memory-storage",
] as const;

export function initHlsJsPlayer(hlsInstance: Hls): void {
  if (
    hlsInstance.config?.loader &&
    typeof (hlsInstance.config.fLoader as any).getEngine === "function"
  ) {
    const engine: HlsJsEngine = (hlsInstance.config.fLoader as any).getEngine();
    engine.initHlsJsEvents(hlsInstance);
  }
}

export function initClapprPlayer(clapprPlayer: any): void {
  clapprPlayer.on("play", () => {
    const playback = clapprPlayer.core.getCurrentPlayback();
    if (playback._hls && !playback._hls._p2pm_linitialized) {
      playback._hls._p2pm_linitialized = true;
      initHlsJsPlayer(clapprPlayer.core.getCurrentPlayback()._hls);
    }
  });
}
