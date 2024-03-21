import React, { useCallback, useEffect, useRef, useState } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import DPlayer from "dplayer";
import muxjs from "mux.js";
import { SegmentLoadDetails, debug } from "p2p-media-loader-core";
import type Hls from "hls.js";

declare global {
  interface Window {
    muxjs: typeof muxjs;
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

const HlsWithP2P = HlsJsP2PEngine.injectP2PMixin(window.Hls);
ShakaP2PEngine.registerP2PPlugins();

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
window.muxjs = muxjs;

const players = [
  "hlsjs",
  "hlsjs-dplayer",
  "hlsjs-clappr",
  "shaka",
  "shaka-dplayer",
  "shaka-clappr",
] as const;

type Player = (typeof players)[number];

const streamUrls = {
  radioStream:
    "https://streamvideo.luxnet.ua/maximum/smil:maximum.stream.smil/playlist.m3u8",
  hlsBigBunnyBuck: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  hlsByteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
  hlsOneLevelByteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/gear1/prog_index.m3u8",
  hlsBasicExample:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
  hlsAdvancedVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8",
  hlsAdvancedVideo2:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
  hlsLive1:
    "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8",
  hlsLive2:
    "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
  hlsLive2Level4Only:
    "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/level_4.m3u8",
  hlsAudioOnly:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/a1/prog_index.m3u8",
  bigBunnyBuckDash: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
  dashLiveBigBunnyBuck:
    "https://livesim.dashif.org/livesim/testpic_2s/Manifest.mpd",
  dashVODBigBunnyBuck:
    "https://dash.akamaized.net/dash264/TestCases/5b/nomor/6.mpd",
  dashLiveHokey:
    "https://d24rwxnt7vw9qb.cloudfront.net/v1/dash/e6d234965645b411ad572802b6c9d5a10799c9c1/All_Reference_Streams/4577dca5f8a44756875ab5cc913cd1f1/index.mpd",
};

function App() {
  const [playerType, setPlayerType] = useState(
    localStorage.player as Player | undefined,
  );
  const [streamUrl, setStreamUrl] = useState(localStorage.streamUrl as string);
  const shakaInstance = useRef<shaka.Player>();
  const hlsInstance = useRef<Hls>();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [httpLoaded, setHttpLoaded] = useState<number>(0);
  const [p2pLoaded, setP2PLoaded] = useState<number>(0);
  const [httpLoadedGlob, setHttpLoadedGlob] = useLocalStorageItem<number>(
    "httpLoaded",
    0,
    numberToStorageItem,
    storageItemToNumber,
  );
  const [p2pLoadedGlob, setP2PLoadedGlob] = useLocalStorageItem<number>(
    "p2pLoaded",
    0,
    numberToStorageItem,
    storageItemToNumber,
  );

  const onSegmentLoaded = useCallback(
    (params: SegmentLoadDetails) => {
      const { bytesLength, downloadSource } = params;
      const MBytes = getMBFromBytes(bytesLength);
      if (downloadSource === "http") {
        setHttpLoaded((prev) => round(prev + MBytes));
        setHttpLoadedGlob((prev) => round(prev + MBytes));
      } else if (downloadSource === "p2p") {
        setP2PLoaded((prev) => round(prev + MBytes));
        setP2PLoadedGlob((prev) => round(prev + MBytes));
      }
    },
    [setHttpLoadedGlob, setP2PLoadedGlob],
  );

  const createNewPlayer = useCallback(() => {
    const initHlsJsPlayer = (url: string) => {
      if (!videoRef.current) return;

      const hls = new HlsWithP2P();

      hls.p2pEngine.addEventListener("onSegmentLoaded", onSegmentLoaded);

      hls.attachMedia(videoRef.current);
      hls.loadSource(url);

      window.videoPlayer = hls;
    };

    const initHlsDPlayer = (url: string) => {
      const player = new DPlayer({
        container: containerRef.current,
        video: {
          url: "",
          type: "customHls",
          customType: {
            customHls: (video: HTMLVideoElement) => {
              const hls = new HlsWithP2P();

              hls.p2pEngine.addEventListener(
                "onSegmentLoaded",
                onSegmentLoaded,
              );
              hls.attachMedia(video);
              hls.loadSource(url);
            },
          },
        },
      });
      player.play();
      window.videoPlayer = player;
    };

    const initHlsClapprPlayer = (url: string) => {
      const p2pEngine = new HlsJsP2PEngine();
      /* eslint-disable */

      const clapprPlayer = new window.Clappr.Player({
        parentId: "#player-container",
        source: url,
        playback: {
          hlsjsConfig: {
            ...p2pEngine.getHlsJsConfig(),
          },
        },
        plugins: [window.LevelSelector],
      });

      p2pEngine.initClapprPlayer(clapprPlayer);

      window.videoPlayer = clapprPlayer;

      /* eslint-enable */
    };

    const initShakaDPlayer = (url: string) => {
      const shakaP2PEngine = new ShakaP2PEngine();
      shakaP2PEngine.addEventListener("onSegmentLoaded", onSegmentLoaded);

      const player = new DPlayer({
        container: containerRef.current,
        video: {
          url: "",
          type: "customHlsOrDash",
          customType: {
            customHlsOrDash: (video: HTMLVideoElement) => {
              /* eslint-disable */

              const shakaPlayer = new window.shaka.Player();
              shakaPlayer.attach(video);

              const onError = (error: unknown) => {
                console.error("Shaka error", error);
              };

              shakaPlayer.addEventListener("error", onError);

              shakaP2PEngine.configureAndInitShakaPlayer(shakaPlayer);
              shakaPlayer.load(url).catch(onError);

              shakaInstance.current = shakaPlayer;

              /* eslint-enable */
            },
          },
        },
      });
      window.videoPlayer = player;
    };

    const initShakaPlayer = (url: string) => {
      if (!videoRef.current) return;

      const shakaP2PEngine = new ShakaP2PEngine();
      shakaP2PEngine.addEventListener("onSegmentLoaded", onSegmentLoaded);

      /* eslint-disable */

      const player = new shaka.Player();
      player.attach(videoRef.current);

      const onError = (error: shaka.util.Error) => {
        console.error("Error code", error.code, "object", error);
      };

      player.addEventListener("error", (event) => {
        onError((event as any).detail);
      });

      shakaP2PEngine.configureAndInitShakaPlayer(player);
      player.load(url).catch(onError);
      shakaInstance.current = player;
      window.videoPlayer = player;

      /* eslint-enable */
    };

    const initShakaClapprPlayer = (url: string) => {
      const shakaP2PEngine = new ShakaP2PEngine();
      shakaP2PEngine.addEventListener("onSegmentLoaded", onSegmentLoaded);
      /* eslint-disable */

      const clapprPlayer = new window.Clappr.Player({
        parentId: "#player-container",
        source: url,
        plugins: [window.DashShakaPlayback, window.LevelSelector],
        shakaOnBeforeLoad: (shakaPlayerInstance: any) => {
          shakaP2PEngine.configureAndInitShakaPlayer(shakaPlayerInstance);
        },
      });

      window.videoPlayer = clapprPlayer;

      /* eslint-enable */
    };

    setHttpLoadedGlob(0);
    setP2PLoadedGlob(0);

    window.videoPlayer?.destroy?.();
    hlsInstance.current?.destroy();
    void shakaInstance.current?.destroy();

    switch (playerType) {
      case "hlsjs-dplayer":
        initHlsDPlayer(streamUrl);
        break;
      case "hlsjs":
        initHlsJsPlayer(streamUrl);
        break;
      case "hlsjs-clappr":
        initHlsClapprPlayer(streamUrl);
        break;
      case "shaka":
        initShakaPlayer(streamUrl);
        break;
      case "shaka-dplayer":
        initShakaDPlayer(streamUrl);
        break;
      case "shaka-clappr":
        initShakaClapprPlayer(streamUrl);
        break;
    }
  }, [
    onSegmentLoaded,
    playerType,
    setHttpLoadedGlob,
    setP2PLoadedGlob,
    streamUrl,
  ]);

  useEffect(() => {
    if (!window.Hls.isSupported() || window.videoPlayer) {
      return;
    }
    if (!localStorage.player) {
      localStorage.player = "hls-dplayer";
      setPlayerType("hlsjs-dplayer");
    }
    if (!localStorage.streamUrl) {
      localStorage.streamUrl = streamUrls.hlsLive2;
      setStreamUrl(streamUrls.hlsLive2);
    }
    createNewPlayer();
  }, [createNewPlayer]);

  const destroyWindowPlayer = () => {
    window.videoPlayer?.destroy?.();
    window.videoPlayer = undefined;
  };

  const onPlayerTypeChange = (newPlayer: Player) => {
    localStorage.player = newPlayer;
    setPlayerType(newPlayer);
    destroyWindowPlayer();
  };

  const onVideoUrlChange = (streamUrl: string) => {
    localStorage.streamUrl = streamUrl;
    setStreamUrl(streamUrl);
  };

  const loadStreamWithExistingInstance = () => {
    switch (playerType) {
      case "hlsjs-dplayer":
      case "hlsjs":
      case "hlsjs-clappr":
        hlsInstance.current?.loadSource(streamUrl);
        break;
      case "shaka":
      case "shaka-dplayer":
      case "shaka-clappr":
        shakaInstance.current?.load(streamUrl).catch(() => undefined);
        break;
    }
  };

  const createInNewTab = () => {
    window.open(window.location.href, "_blank");
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
            <button onClick={createInNewTab}>Create in new tab</button>
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
          <video
            ref={videoRef}
            controls
            muted
            playsInline
            style={{ width: 800 }}
          />
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
      <a href="modules-demo/index.html">ES modules demo</a>
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
    loggersToStorageItem,
    storageItemToLoggers,
  );

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveLoggers(
      Array.from(event.target.selectedOptions, (option) => option.value),
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
  storageItemToValue: (storageItem: string | null) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(
    storageItemToValue(localStorage[prop] as string | null) ?? initValue,
  );
  const setValueExternal = useCallback(
    (value: T | ((prev: T) => T)) => {
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
    },
    [prop, storageItemToValue, valueToStorageItem],
  );

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
  }, [prop, storageItemToValue]);

  return [value, setValueExternal];
}

const loggers = [
  "p2pml-core:hybrid-loader-main",
  "p2pml-core:hybrid-loader-secondary",
  "p2pml-core:p2p-tracker-client",
  "p2pml-core:peer",
  "p2pml-core:p2p-loaders-container",
  "p2pml-core:request-main",
  "p2pml-core:request-secondary",
  "p2pml-core:segment-memory-storage",
  "p2pml-hlsjs:*",
  "p2pml-shaka:*",
] as const;

const numberToStorageItem = (v: number) => v.toString();
const storageItemToNumber = (v: string | null) => (v !== null ? +v : 0);

const loggersToStorageItem = (list: string[]) => {
  setTimeout(() => debug.enable(localStorage.debug as string), 0);
  if (list.length === 0) return null;
  return list.join(",");
};

const storageItemToLoggers = (storageItem: string | null) => {
  setTimeout(() => debug.enable(localStorage.debug as string), 0);
  if (!storageItem) return [];
  return storageItem.split(",");
};
