- [GitHub](https://github.com/Novage/p2p-media-loader)
- NPM Packages
  - [Core](https://npmjs.com/package/p2p-media-loader-core)
  - [HLS.js integration](https://npmjs.com/package/p2p-media-loader-hlsjs)
  - [Shaka Player integration](https://npmjs.com/package/p2p-media-loader-shaka)
  - [dash.js integration](https://npmjs.com/package/p2p-media-loader-dashjs)
  - [Video.js 8 integration](https://npmjs.com/package/p2p-media-loader-videojs)

**P2P Media Loader** is an open-source JavaScript library that leverages modern web browser features, such as HTML5 video and WebRTC, to enable media delivery over peer-to-peer (P2P) networks. It integrates smoothly with many popular HTML5 video players and works entirely without browser plugins or add-ons. Experience it in action with our [demo](http://novage.com.ua/p2p-media-loader/demo.html).

**P2P Media Loader** can be bundled into your project via an npm package or loaded directly from a CDN. Below are examples of both methods.

## Using P2P Media Loader with npm

To include **P2P Media Loader** in your project using npm, follow these steps:

1. Install the package via npm, together with its player. The engine
   packages declare no dependency on the player they integrate, so the player
   is yours to install:
   - For HLS.js integration:

     ```bash
     npm install p2p-media-loader-hlsjs hls.js
     ```

   - For Shaka Player integration:

     ```bash
     npm install p2p-media-loader-shaka shaka-player
     ```

   - For dash.js integration:

     ```bash
     npm install p2p-media-loader-dashjs dashjs
     ```

   - For Video.js 8 integration:

     ```bash
     npm install p2p-media-loader-videojs video.js@8
     ```

   Install `p2p-media-loader-core` as well, at the same version, when your
   code imports from it: its types (`CoreConfig`, `CoreEventMap` and others),
   the `p2p-media-loader-core/shims/xmldom` alias in
   [Reduce the Bundle Size](README.md#reduce-the-bundle-size), or a custom
   integration as [MIGRATION.md](MIGRATION.md) shows one. The engine packages
   depend on it, but a package manager that does not hoist dependencies, such
   as pnpm, lets your code import only what you installed yourself:

   ```bash
   npm install p2p-media-loader-hlsjs p2p-media-loader-core
   ```

   - Video.js 10 needs no package of ours: it plays HLS and MPEG-DASH through
     media adapters powered by HLS.js and dash.js, so it uses the HLS.js and
     dash.js integrations above.

1. Import and use it in your project. The TypeScript examples assume
   `"moduleResolution": "bundler"`, as Vite's project templates set it. Under
   `node16` or `nodenext`, the default imports of Shaka Player and Video.js do
   not type-check, and neither do the declarations of
   `p2p-media-loader-shaka`, which refer to Shaka's types.
   - HLS.js integration — the engine is mixed into the `Hls` class, so the
     player is created and used exactly as without P2P:

     ```typescript
     import Hls from "hls.js";
     import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

     const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

     const hls = new HlsWithP2P({
       // Any HLS.js option goes here as usual, plus:
       p2p: {
         core: {
           swarmId: "Optional custom swarm ID for stream",
           // Other P2P engine configuration parameters go here
         },
         onHlsJsCreated: (hls) => {
           // The engine lives on the HLS.js instance
           hls.p2pEngine.addEventListener("onPeerConnect", (params) => {
             console.log("Peer connected:", params.peerId);
           });
           // Subscribe to other P2P engine and HLS.js events here
         },
       },
     });

     hls.attachMedia(videoElement);
     hls.loadSource(streamUrl);
     ```

   - Shaka Player integration — the engine registers Shaka's networking
     scheme plugins once per page, then binds to each player before it loads:

     ```typescript
     import shaka from "shaka-player";
     import { ShakaP2PEngine } from "p2p-media-loader-shaka";

     // Once per page, before any player is created
     ShakaP2PEngine.registerPlugins(shaka);

     const engine = new ShakaP2PEngine(
       {
         core: {
           swarmId: "Optional custom swarm ID for stream",
           // Other P2P engine configuration parameters go here
         },
       },
       shaka,
     );
     engine.addEventListener("onPeerConnect", (params) => {
       console.log("Peer connected:", params.peerId);
     });

     const player = new shaka.Player();
     await player.attach(videoElement);
     engine.bindShakaPlayer(player); // before load()
     await player.load(streamUrl);
     ```

     The engine's types are those of Shaka's compiled build, which
     `"shaka-player"` resolves to. Shaka's types are nominal, so its UI build,
     `shaka-player/dist/shaka-player.ui`, does not type-check against them,
     although it is the same library with the UI added. Pass it with a cast:

     ```typescript
     import shakaUI from "shaka-player/dist/shaka-player.ui";
     import type shakaCompiled from "shaka-player";

     const shaka = shakaUI as unknown as typeof shakaCompiled;
     ```

   - dash.js integration — the engine replaces the player's loader through
     `player.extend`, so it binds before `initialize()`:

     ```typescript
     import { MediaPlayer } from "dashjs";
     import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

     const engine = new DashJsP2PEngine({
       core: {
         swarmId: "Optional custom swarm ID for stream",
         // Other P2P engine configuration parameters go here
       },
     });
     engine.addEventListener("onPeerConnect", (params) => {
       console.log("Peer connected:", params.peerId);
     });

     const player = MediaPlayer().create();
     engine.bindPlayer(player); // before initialize()
     player.initialize(videoElement, streamUrl, true);
     ```

   - Video.js 8 integration — the engine serves the player, through the
     request and response hooks VHS gives that player; HLS and MPEG-DASH both
     play through VHS:

     ```typescript
     import videojs from "video.js";
     import "video.js/dist/video-js.css";
     import { VideoJsP2PEngine } from "p2p-media-loader-videojs";

     const player = videojs(videoElement, {
       html5: {
         vhs: {
           // VHS stands aside for native HLS on Safari and iOS unless told
           // otherwise
           overrideNative: true,
           // Choose the rendition on bandwidth, as other players do: a
           // rendition is a swarm
           limitRenditionByPlayerDimensions: false,
         },
         nativeAudioTracks: false,
         nativeVideoTracks: false,
       },
     });

     const engine = new VideoJsP2PEngine(
       {
         core: {
           swarmId: "Optional custom swarm ID for stream",
           // Other P2P engine configuration parameters go here
         },
       },
       // The Video.js you imported. Only a page that loads Video.js with a
       // <script> tag, as `window.videojs`, can leave it out.
       videojs,
     );
     engine.addEventListener("onPeerConnect", (params) => {
       console.log("Peer connected:", params.peerId);
     });
     engine.bindPlayer(player);

     // or "application/dash+xml" for an MPD
     player.src({ src: streamUrl, type: "application/x-mpegURL" });
     ```

     Bind the engine before the player loads a source, and several players can
     run side by side, each with its own engine and its own swarm. The same
     integration is available as a Video.js plugin. Video.js's types do not
     know the plugin, so TypeScript code names the player type it adds:

     ```typescript
     import videojs from "video.js";
     import {
       VideoJsP2PEngine,
       type PartialVideoJsP2PEngineConfig,
     } from "p2p-media-loader-videojs";

     type PlayerWithP2P = ReturnType<typeof videojs> & {
       p2pMediaLoader(config?: PartialVideoJsP2PEngineConfig): VideoJsP2PEngine;
     };

     // Once per page, before any player loads a source
     VideoJsP2PEngine.registerPlugins(videojs);

     const player = videojs(videoElement, {
       html5: {
         vhs: { overrideNative: true, limitRenditionByPlayerDimensions: false },
         nativeAudioTracks: false,
         nativeVideoTracks: false,
       },
     }) as PlayerWithP2P;
     const engine = player.p2pMediaLoader({
       core: { swarmId: "Optional custom swarm ID for stream" },
     });
     player.src({ src: streamUrl, type: "application/x-mpegURL" });
     ```

     The examples set `limitRenditionByPlayerDimensions: false` because VHS
     otherwise caps the rendition it plays by the size the player is rendered
     at, which no other engine does, and a rendition is a swarm: without it, a
     small Video.js player picks a lower rendition than viewers on other
     players and shares with none of them.

   - Video.js 10 — there is no Video.js engine to hook here. v10 dropped VHS
     and plays through media adapters powered by HLS.js
     (`@videojs/hlsjs-video`) and dash.js (`@videojs/dash-video`), so the
     HLS.js and dash.js integrations drive it directly and no
     `p2p-media-loader-videojs` is involved.

     With HLS.js, the adapter hands `source.engine.hlsJs` to HLS.js untouched
     — that is where the engine's loaders go — and exposes the instance it
     built as `engine`:

     ```tsx
     import "@videojs/react/video/skin.css";
     import { useState } from "react";
     import {
       useAttachMedia,
       useDestroy,
       useMediaInstance,
     } from "@videojs/react";
     import { VideoPlayer, VideoSkin } from "@videojs/react/video";
     import {
       HlsJsAdapter,
       PlaybackTypes,
       type HlsEngineConfig,
     } from "@videojs/hlsjs-video";
     import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

     function P2PHlsVideo({ streamUrl }: { streamUrl: string }) {
       // Destroyed with the media instance. `useDestroy` is what Video.js
       // uses for its own adapters and survives StrictMode's remount, so
       // there is only ever one engine per player.
       const [engine] = useState(
         () =>
           new HlsJsP2PEngine({
             core: {
               swarmId: "Optional custom swarm ID for stream",
               // Other P2P engine configuration parameters go here
             },
           }),
       );
       useDestroy(engine);

       // `setup` runs once, before the adapter is attached.
       const media = useMediaInstance(HlsJsAdapter, (media) => {
         engine.addEventListener("onPeerConnect", (params) => {
           console.log("Peer connected:", params.peerId);
         });
         // The adapter defaults to "metadata" and holds HLS.js to a 1 s
         // buffer until playback starts; Firefox then never autoplays a
         // live stream of 2 s segments.
         media.preload = "auto";
         // A getter: resolved when HLS.js builds its playlist loader, by
         // which time the adapter has its instance.
         engine.bindHls(() => media.engine);
         media.source = {
           src: streamUrl,
           // Native HLS on Safari would bypass HLS.js, and with it P2P
           preferPlayback: PlaybackTypes.MSE,
           // The engine supplies HLS.js's own `fLoader` and `pLoader`
           engine: {
             hlsJs: engine.getConfigForHlsJs() as HlsEngineConfig["hlsJs"],
           },
         };
       });
       const attachRef = useAttachMedia(media);

       return <video ref={attachRef} autoPlay muted playsInline />;
     }

     export const Player = ({ streamUrl }: { streamUrl: string }) => (
       <VideoPlayer>
         <VideoSkin>
           <P2PHlsVideo streamUrl={streamUrl} />
         </VideoSkin>
       </VideoPlayer>
     );
     ```

     With dash.js, the adapter creates its player up front and attaches a
     source only when one is set, so the engine binds in between:

     ```tsx
     import { useState } from "react";
     import type { MediaPlayerClass } from "dashjs";
     import {
       useAttachMedia,
       useDestroy,
       useMediaInstance,
     } from "@videojs/react";
     import { DashAdapter } from "@videojs/dash-video";
     import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

     function P2PDashVideo({ streamUrl }: { streamUrl: string }) {
       const [engine] = useState(
         () =>
           new DashJsP2PEngine({
             core: {
               swarmId: "Optional custom swarm ID for stream",
               // Other P2P engine configuration parameters go here
             },
           }),
       );
       useDestroy(engine);

       const media = useMediaInstance(DashAdapter, (media) => {
         // Before the source, so before dash.js's first request. Bind once
         // per player: dash.js keeps the loader it first resolved.
         engine.bindPlayer(media.engine as unknown as MediaPlayerClass);
         media.source = { src: streamUrl };
       });
       const attachRef = useAttachMedia(media);

       return <video ref={attachRef} autoPlay muted playsInline />;
     }
     ```

     The cast is there because the project has two copies of dash.js: the
     one you installed, whose types the engine takes, and the one
     `@videojs/dash-video` pins for itself (5.2.0 in Video.js 10.0.1).
     TypeScript does not accept one copy's player type as the other's. It is
     the same player either way.

     Quality selection, captions and the rest stay Video.js's own; the engine
     only supplies the bytes.

For additional examples using npm packages, please refer to our [React demo](https://github.com/Novage/p2p-media-loader/tree/main/packages/p2p-media-loader-demo/src/components/players).

## Using P2P Media Loader from a CDN via JavaScript Modules

**P2P Media Loader** supports a wide variety of players that use HLS.js as their underlying media engine. The examples start with a standalone HLS.js player.

Each engine bundle imports the core, and the core's manifest parsers, by bare specifier. So the page needs an import map with an entry for each of them, all mapped to the one core bundle that carries the parsers the engine needs. For HLS.js:

```html
<script type="importmap">
  {
    "imports": {
      "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-hls.es.min.js",
      "p2p-media-loader-core/hls": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-hls.es.min.js",
      "p2p-media-loader-hlsjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@^5/dist/p2p-media-loader-hlsjs.es.min.js"
    }
  }
</script>
```

The dash.js engine maps `p2p-media-loader-core` and `p2p-media-loader-core/dash` to `p2p-media-loader-core-dash.es.min.js` instead; Shaka and Video.js 8 play both protocols and map all three to `p2p-media-loader-core.es.min.js`. See [MIGRATION.md](MIGRATION.md) for the details. The examples below assume such a map, a player loaded by its own `<script>` tag, and a `streamUrl` with the address of the stream.

### **Integrating P2P with a standalone HLS.js player**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const streamUrl = "https://example.com/stream/master.m3u8";
  const videoElement = document.querySelector("#video");

  const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

  const hls = new HlsWithP2P({
    p2p: {
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine configuration parameters go here
      },
      onHlsJsCreated(hls) {
        hls.p2pEngine.addEventListener("onPeerConnect", (params) => {
          console.log("Peer connected:", params.peerId);
        });
        // Subscribe to P2P engine and HLS.js events here
      },
    },
  });

  hls.attachMedia(videoElement);
  hls.loadSource(streamUrl);
</script>
```

### **Integrating P2P with PlayerJS and HLS.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  window.Hls = HlsJsP2PEngine.injectMixin(window.Hls);

  const player = new Playerjs({
    id: "player",
    file: streamUrl,
    hlsconfig: {
      p2p: {
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
        onHlsJsCreated: (hls) => {
          // Subscribe to P2P engine and HLS.js events here
          hls.p2pEngine.addEventListener("onPeerConnect", (details) => {
            console.log(`Connected to peer ${details.peerId}`);
          });
        },
      },
    },
  });
</script>
```

### **Integrating P2P with DPlayer and HLS.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoContainer = document.querySelector("#player");

  const player = new DPlayer({
    container: videoContainer,
    video: {
      url: "",
      type: "customHls",
      customType: {
        customHls: (video) => {
          const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

          const hls = new HlsWithP2P({
            p2p: {
              core: {
                swarmId: "Optional custom swarm ID for stream",
                // Other P2P engine configuration parameters go here
              },
            },
          });

          hls.attachMedia(video);
          hls.loadSource(streamUrl);
        },
      },
    },
  });

  player.play();
</script>
```

### **Integrating P2P with Clappr and HLS.js**

Clappr plays HLS through HLS.js, built into `@clappr/player`; the quality menu is the separate `@clappr/level-selector` package of the Clappr monorepo:

```html
<script src="https://cdn.jsdelivr.net/npm/@clappr/player@~0.14/dist/clappr.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@clappr/level-selector@~1/dist/level-selector.min.js"></script>
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const engine = new HlsJsP2PEngine({
    core: {
      swarmId: "Optional custom swarm ID for stream",
      // Other P2P engine configuration parameters go here
    },
  });

  const player = new Clappr.Player({
    source: streamUrl,
    plugins: [LevelSelector],
    height: "100%",
    width: "100%",
    parentId: `#player`,
    playback: {
      hlsjsConfig: {
        ...engine.getConfigForHlsJs(),
      },
    },
  });

  engine.bindHls(() => player.core.getCurrentPlayback()?._hls);
</script>
```

### **Integrating P2P with MediaElement and HLS.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoElement = document.querySelector("#video");

  window.Hls = HlsJsP2PEngine.injectMixin(window.Hls);

  const player = new MediaElementPlayer(videoElement.id, {
    videoHeight: "100%",
    // HLS.js first: MediaElement prefers the browser's own HLS playback
    // where it is offered, and that bypasses P2P
    renderers: ["native_hls", "html5"],
    hls: {
      p2p: {
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
        onHlsJsCreated: (hls) => {
          // Subscribe to P2P engine and HLS.js events here
        },
      },
    },
  });

  player.setSrc(streamUrl);
  player.load();
</script>
```

### **Integrating P2P with OpenPlayerJS and HLS.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoElement = document.querySelector("#video");

  // OpenPlayerJS creates its HLS.js from window.Hls
  window.Hls = HlsJsP2PEngine.injectMixin(window.Hls);

  const player = new OpenPlayerJS(videoElement, {
    hls: {
      p2p: {
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
        onHlsJsCreated: (hls) => {
          // Subscribe to P2P engine and HLS.js events here
        },
      },
    },
    controls: {
      layers: {
        left: ["play", "time", "volume"],
        right: ["settings", "fullscreen", "levels"],
        middle: ["progress"],
      },
    },
  });

  player.src = [
    {
      src: streamUrl,
      type: "application/x-mpegURL",
    },
  ];

  player.init();
</script>
```

### Integrating P2P with Shaka Player

[Shaka Player](https://shaka-player-demo.appspot.com/demo/) is used below for an extended example:

```html
<!doctype html>
<html>
  <head>
    <!-- Link to Shaka Player's CSS for controls -->
    <link
      rel="stylesheet"
      type="text/css"
      href="https://unpkg.com/shaka-player@5/dist/controls.css"
    />

    <!-- Link to Shaka Player's compiled UI script -->
    <script src="https://unpkg.com/shaka-player@5/dist/shaka-player.ui.js"></script>

    <!-- Import map for the P2P Media Loader modules. The engine imports the
         core and both manifest parsers by bare specifier; all three must
         resolve to the same core bundle, here the one carrying both parsers. -->
    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-core/hls": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-core/dash": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-shaka": "https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@^5/dist/p2p-media-loader-shaka.es.min.js"
        }
      }
    </script>

    <!-- Module script to initialize Shaka Player with P2P Media Loader -->
    <script type="module">
      import { ShakaP2PEngine } from "p2p-media-loader-shaka";

      // Register P2P Media Loader plugins with Shaka
      ShakaP2PEngine.registerPlugins();

      async function init() {
        // Get the video element by its ID
        const video = document.getElementById("video");

        // Get Shaka UI controls and player
        const ui = video["ui"];
        const controls = ui.getControls();
        const player = controls.getPlayer();

        // Initialize P2P Media Loader with a custom config
        const shakaP2PEngine = new ShakaP2PEngine({
          core: {
            swarmId: "Optional custom swarm ID for stream",
            // Other P2P engine configuration parameters go here
          },
        });

        // Subscribe to P2P engine events here
        shakaP2PEngine.addEventListener("onPeerConnect", (params) => {
          console.log("Peer connected:", params.peerId);
        });

        // Configure and initialize Shaka Player with P2P Media Loader
        shakaP2PEngine.bindShakaPlayer(player);

        // Load the stream URL into the player
        player.load(streamUrl);
      }

      // Add event listener for the Shaka UI loaded event to trigger initialization
      document.addEventListener("shaka-ui-loaded", init);
    </script>
  </head>

  <body>
    <div data-shaka-player-container style="max-width:40em">
      <!-- Video element with Shaka Player UI -->
      <video
        autoplay
        data-shaka-player
        id="video"
        style="width:100%;height:100%"
      ></video>
    </div>
  </body>
</html>
```

### **Integrating P2P with Clappr and Shaka Player**

Clappr plays MPEG-DASH through the `dash-shaka-playback` package of the Clappr monorepo, which works with Shaka Player 3 and 4 only:

```html
<script src="https://cdn.jsdelivr.net/npm/shaka-player@~4/dist/shaka-player.compiled.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@clappr/player@~0.14/dist/clappr.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@clappr/level-selector@~1/dist/level-selector.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dash-shaka-playback@~4/dist/dash-shaka-playback.min.js"></script>
<script type="module">
  import { ShakaP2PEngine } from "p2p-media-loader-shaka";

  const container = document.getElementById("container");

  ShakaP2PEngine.registerPlugins();

  const shakaP2PEngine = new ShakaP2PEngine({
    core: {
      swarmId: "Optional custom swarm ID for stream",
      // Other P2P Media Loader Core options
    },
  });
  shakaP2PEngine.addEventListener("onPeerConnect", (params) => {
    console.log("Peer connected:", params.peerId);
  });

  const player = new Clappr.Player({
    parentId: `#${container.id}`,
    source: streamUrl,
    plugins: [window.DashShakaPlayback, window.LevelSelector],
    shakaOnBeforeLoad: (shakaPlayerInstance) => {
      shakaP2PEngine.bindShakaPlayer(shakaPlayerInstance);
    },
  });
</script>
```

### **Integrating P2P with DPlayer and Shaka Player**

```html
<script type="module">
  import { ShakaP2PEngine } from "p2p-media-loader-shaka";

  const container = document.getElementById("container");

  ShakaP2PEngine.registerPlugins();

  const shakaP2PEngine = new ShakaP2PEngine({
    core: {
      swarmId: "Optional custom swarm ID for stream",
      // Other P2P Media Loader Core options
    },
  });

  const player = new DPlayer({
    container,
    video: {
      url: "",
      type: "customHlsOrDash",
      customType: {
        customHlsOrDash: (video) => {
          const shakaPlayer = new shaka.Player();
          void shakaPlayer.attach(video);

          shakaP2PEngine.bindShakaPlayer(shakaPlayer);
          void shakaPlayer.load(streamUrl);
        },
      },
    },
  });
</script>
```

### Integrating P2P with dash.js

```html
<!doctype html>
<html>
  <head>
    <!-- Import map for the P2P Media Loader modules. The engine imports the
         core and the DASH manifest parser by bare specifier; both must resolve
         to the same core bundle, here the one carrying only the DASH parser. -->
    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-dash.es.min.js",
          "p2p-media-loader-core/dash": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-dash.es.min.js",
          "p2p-media-loader-dashjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-dashjs@^5/dist/p2p-media-loader-dashjs.es.min.js",
          "dashjs": "https://cdn.jsdelivr.net/npm/dashjs@^5/dist/modern/esm/dash.all.min.js"
        }
      }
    </script>
  </head>
  <body>
    <video id="video" controls autoplay muted></video>

    <script type="module">
      import { MediaPlayer } from "dashjs";
      import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

      const video = document.getElementById("video");
      const player = MediaPlayer().create();
      const engine = new DashJsP2PEngine({
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
      });

      // Bind before initialize(): the engine replaces the player's loader
      // through player.extend, which dash.js resolves when it first loads.
      engine.bindPlayer(player);
      player.initialize(video, "https://example.com/stream.mpd", true);
    </script>
  </body>
</html>
```

The examples below assume the same import map and reference the dash.js and
P2P Media Loader modules by those specifiers.

### **Integrating P2P with DPlayer and dash.js**

```html
<script type="module">
  import { MediaPlayer } from "dashjs";
  import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

  const container = document.getElementById("container");

  const engine = new DashJsP2PEngine({
    core: {
      swarmId: "Optional custom swarm ID for stream",
      // Other P2P engine configuration parameters go here
    },
  });

  const player = new DPlayer({
    container,
    video: {
      url: "",
      type: "customDash",
      customType: {
        customDash: (video) => {
          const dashPlayer = MediaPlayer().create();
          engine.bindPlayer(dashPlayer); // before initialize()
          dashPlayer.initialize(video, streamUrl, true);
        },
      },
    },
  });
</script>
```

### **Integrating P2P with MediaElement and dash.js**

MediaElement's DASH renderer creates its own dash.js player from the global
`dashjs` and gives no hook between `create()` and `initialize()`, so the
integration wraps that global: every player it creates is bound to the engine
first.

```html
<script type="module">
  import * as dashjs from "dashjs";
  import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

  const videoElement = document.getElementById("video");

  const engine = new DashJsP2PEngine({
    core: {
      swarmId: "Optional custom swarm ID for stream",
      // Other P2P engine configuration parameters go here
    },
  });

  // A dashjs global whose MediaPlayer().create() binds the engine. MediaElement
  // also reads MediaPlayer.events and MediaPlayer.errors from it.
  const MediaPlayer = Object.assign(
    () => ({
      create: () => {
        const player = dashjs.MediaPlayer().create();
        engine.bindPlayer(player);
        return player;
      },
    }),
    { events: dashjs.MediaPlayer.events, errors: dashjs.MediaPlayer.errors },
  );
  window.dashjs = { ...dashjs, MediaPlayer };

  const player = new MediaElementPlayer(videoElement.id, {
    videoHeight: "100%",
  });

  player.setSrc(streamUrl); // an .mpd URL selects the DASH renderer
  player.load();
</script>
```

### Integrating P2P with Video.js 8 (VHS)

Video.js 8 plays HLS and MPEG-DASH through VHS (`@videojs/http-streaming`), so
one import map serves both; it maps the core and both parsers to the core
bundle that carries them. One engine serves one player, through that player's
own VHS hooks; the `p2pMediaLoader` plugin covered in the npm section above is
another way to attach one. For Video.js 10, see the next section.

```html
<!doctype html>
<html>
  <head>
    <link
      href="https://cdn.jsdelivr.net/npm/video.js@^8/dist/video-js.min.css"
      rel="stylesheet"
    />
    <!-- Video.js as a global; its ESM build is not needed here -->
    <script src="https://cdn.jsdelivr.net/npm/video.js@^8/dist/video.min.js"></script>

    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-core/hls": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-core/dash": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-videojs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-videojs@^5/dist/p2p-media-loader-videojs.es.min.js"
        }
      }
    </script>
  </head>
  <body>
    <video
      id="video"
      class="video-js"
      controls
      autoplay
      muted
      playsinline
      style="width: 800px"
    ></video>

    <script type="module">
      import { VideoJsP2PEngine } from "p2p-media-loader-videojs";

      const player = videojs("video", {
        html5: {
          vhs: {
            // VHS stands aside for native HLS on Safari and iOS unless told
            // otherwise
            overrideNative: true,
            // Choose the rendition on bandwidth, as other players do: a
            // rendition is a swarm
            limitRenditionByPlayerDimensions: false,
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      });

      const engine = new VideoJsP2PEngine({
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
      });
      engine.addEventListener("onPeerConnect", (params) => {
        console.log("Peer connected:", params.peerId);
      });
      engine.bindPlayer(player);

      player.src({
        src: "https://example.com/stream.m3u8",
        type: "application/x-mpegURL", // "application/dash+xml" for an MPD
      });
    </script>
  </body>
</html>
```

### Integrating P2P with Video.js 10

Video.js 10 has no streaming engine of its own: `<hlsjs-video>` is HLS.js and
`<dash-video>` is dash.js, each exposing the instance it built as `engine`.
The HLS.js and dash.js integrations therefore drive it directly, with no
`p2p-media-loader-videojs` in sight.

```html
<!doctype html>
<html>
  <head>
    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-core/hls": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-core/dash": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-hlsjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@^5/dist/p2p-media-loader-hlsjs.es.min.js",
          "p2p-media-loader-dashjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-dashjs@^5/dist/p2p-media-loader-dashjs.es.min.js"
        }
      }
    </script>

    <!-- Video.js 10's media elements; pin the version you use -->
    <script
      type="module"
      src="https://cdn.jsdelivr.net/npm/@videojs/cdn@10.0.1/media/hlsjs-video.js"
    ></script>
    <script
      type="module"
      src="https://cdn.jsdelivr.net/npm/@videojs/cdn@10.0.1/media/dash-video.js"
    ></script>
  </head>
  <body>
    <hlsjs-video
      id="hls"
      controls
      autoplay
      muted
      playsinline
      style="width: 800px"
    ></hlsjs-video>

    <dash-video
      id="dash"
      controls
      autoplay
      muted
      playsinline
      style="width: 800px"
    ></dash-video>

    <script type="module">
      import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
      import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

      // HLS — the loaders go into the config the element hands to HLS.js
      const hlsVideo = document.getElementById("hls");
      await customElements.whenDefined("hlsjs-video");

      const hlsEngine = new HlsJsP2PEngine({
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
      });
      hlsEngine.addEventListener("onPeerConnect", (params) => {
        console.log("Peer connected:", params.peerId);
      });
      // The element defaults to "metadata" and holds HLS.js to a 1 s buffer
      // until playback starts; Firefox then never autoplays a live stream of
      // 2 s segments.
      hlsVideo.preload = "auto";
      // A getter: HLS.js is constructed when the source is set below
      hlsEngine.bindHls(() => hlsVideo.engine);

      hlsVideo.source = {
        src: "https://example.com/stream.m3u8",
        // Native HLS on Safari would bypass HLS.js, and with it P2P
        preferPlayback: "mse",
        engine: { hlsJs: hlsEngine.getConfigForHlsJs() },
      };

      // MPEG-DASH — the element's dash.js player exists before any request
      const dashVideo = document.getElementById("dash");
      await customElements.whenDefined("dash-video");

      const dashEngine = new DashJsP2PEngine({
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
      });
      dashEngine.bindPlayer(dashVideo.engine);

      dashVideo.src = "https://example.com/manifest.mpd";
    </script>
  </body>
</html>
```

## Using P2P Media Loader in older browsers and Smart TVs (IIFE)

For legacy environments that lack ES module support (such as older Smart TVs and deprecated browsers), you can utilize our IIFE builds. In these builds, the library components are exposed via global variables instead of ES module imports.

The global namespaces are `window.p2pml.hlsjs`, `window.p2pml.shaka`,
`window.p2pml.dashjs` and `window.p2pml.videojs`.

### Integrating P2P with a standalone HLS.js player (IIFE)

```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@~1/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@^5/dist/p2p-media-loader-hlsjs.iife.min.js"></script>

<script>
  // Wait for the DOM and scripts to load
  document.addEventListener("DOMContentLoaded", function () {
    var videoElement = document.getElementById("video");
    var streamUrl = "https://example.com/stream.m3u8";

    if (Hls.isSupported()) {
      // Access the engine from the global p2pml object
      var HlsJsP2PEngine = window.p2pml.hlsjs.HlsJsP2PEngine;

      var HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);
      var hls = new HlsWithP2P({
        p2p: {
          core: {
            swarmId: "Optional custom swarm ID for stream",
            // Other P2P engine configuration parameters go here
          },
        },
      });

      hls.attachMedia(videoElement);
      hls.loadSource(streamUrl);
    }
  });
</script>
```

### Integrating P2P with Shaka Player (IIFE)

```html
<script src="https://cdn.jsdelivr.net/npm/shaka-player@5/dist/shaka-player.compiled.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@^5/dist/p2p-media-loader-shaka.iife.min.js"></script>

<script>
  // Wait for the DOM and scripts to load. The IIFE bundle targets ES2015 for
  // old Smart TV browsers; keep the page's own script at that level too —
  // promise chains, not async/await, which such browsers fail to parse.
  document.addEventListener("DOMContentLoaded", function () {
    // Install Shaka's polyfills first: old browsers lack MediaCapabilities,
    // which Shaka's variant filtering relies on, and report error 4032
    // (no playable variant) without them.
    shaka.polyfill.installAll();

    if (shaka.Player.isBrowserSupported()) {
      var videoElement = document.getElementById("video");
      var streamUrl = "https://example.com/stream.mpd";

      // Access the engine from the global p2pml object
      var ShakaP2PEngine = window.p2pml.shaka.ShakaP2PEngine;

      ShakaP2PEngine.registerPlugins();
      var shakaP2PEngine = new ShakaP2PEngine({
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
      });

      var player = new shaka.Player();
      player
        .attach(videoElement)
        .then(function () {
          shakaP2PEngine.bindShakaPlayer(player);
          return player.load(streamUrl);
        })
        .catch(function (error) {
          console.error("Shaka error", error);
        });
    }
  });
</script>
```

### Integrating P2P with dash.js (IIFE)

dash.js ships a `legacy` build for browsers without modern JavaScript support;
pair it with the P2P Media Loader IIFE bundle, which targets ES2015.

```html
<script src="https://cdn.jsdelivr.net/npm/dashjs@^5/dist/legacy/umd/dash.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-dashjs@^5/dist/p2p-media-loader-dashjs.iife.min.js"></script>

<script>
  // Keep the page's own script at ES2015 too: no async/await and no trailing
  // commas in argument lists, which old Smart TV browsers fail to parse.
  document.addEventListener("DOMContentLoaded", function () {
    var videoElement = document.getElementById("video");
    var streamUrl = "https://example.com/stream.mpd";

    // Access the engine from the global p2pml object
    var DashJsP2PEngine = window.p2pml.dashjs.DashJsP2PEngine;

    var engine = new DashJsP2PEngine({
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine configuration parameters go here
      },
    });

    var player = dashjs.MediaPlayer().create();
    engine.bindPlayer(player); // before initialize(): it replaces the player's loader
    player.initialize(videoElement, streamUrl, true);
  });
</script>
```

### Integrating P2P with Video.js 8 (IIFE)

```html
<link
  href="https://cdn.jsdelivr.net/npm/video.js@^8/dist/video-js.min.css"
  rel="stylesheet"
/>
<script src="https://cdn.jsdelivr.net/npm/video.js@^8/dist/video.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-videojs@^5/dist/p2p-media-loader-videojs.iife.min.js"></script>

<script>
  // Keep the page's own script at ES2015: no async/await and no trailing
  // commas in argument lists, which old Smart TV browsers fail to parse.
  document.addEventListener("DOMContentLoaded", function () {
    var VideoJsP2PEngine = window.p2pml.videojs.VideoJsP2PEngine;

    var player = videojs("video", {
      html5: {
        vhs: { overrideNative: true, limitRenditionByPlayerDimensions: false },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    var engine = new VideoJsP2PEngine({
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine configuration parameters go here
      },
    });
    engine.bindPlayer(player);

    player.src({
      src: "https://example.com/stream.m3u8",
      type: "application/x-mpegURL", // "application/dash+xml" for an MPD
    });
  });
</script>
```

## Predicting swarm infohashes on a server

Each stream (media quality) is downloaded through its own P2P swarm, identified on trackers by an **infohash**. The infohash is the hash of the **stream swarm ID**, `` `${PEER_PROTOCOL_VERSION}-${swarmId}-${streamId}` ``. The `swarmId` is the configured one, or the URL the player requested the master manifest at, without its query string. The `streamId` tells the stream from the content's other streams, and by default comes from its place in the manifest:

- **HLS:** the stream's type and its index among the master's streams of that type, in the order of the master. The variants are `main0`, `main1`, …, then the alternate video renditions with a playlist of their own; the audio renditions with a playlist of their own are `secondary0`, `secondary1`, …. A playlist listed under several variants counts once. A media playlist played with no master is `main`.
- **DASH:** the stream's type and its Representation `@id`: `main-video-720`, `secondary-audio-en`.

No attribute of the stream — bitrate, frame rate, codecs — enters the default `streamId`, so an origin that rewrites them per request does not split a swarm. See [`specs/segment-identity.md`](specs/segment-identity.md), "Stream identity", for the exact rule.

A server can compute the exact infohashes clients will announce — for example, to ask a tracker for the statistics of each quality, or to allowlist them on a private tracker. The Node-safe helpers are exported from the `p2p-media-loader-core/server` subpath (Node.js 16+). The package is published as ESM only — from a CommonJS project, load it with a dynamic `import()` (or `require()` on Node.js 20.17+):

```typescript
import {
  buildStreamSwarmId,
  computeInfoHash,
} from "p2p-media-loader-core/server";

// With the default client configuration, for an HLS master with three
// variants and two audio renditions.
const streamIds = ["main0", "main1", "main2", "secondary0", "secondary1"];
const infoHashes = streamIds.map((streamId) =>
  computeInfoHash(buildStreamSwarmId(swarmId, streamId)),
);

// The tracker allowlist entries (hex of the announced 20-byte ASCII string):
const allowlist = infoHashes.map((h) => Buffer.from(h, "utf8").toString("hex"));
```

**One master URL must give every viewer the same streams.** The default `swarmId` discards the query, so an origin that gives different streams under one URL — an A/B test of the ladder, a query parameter that selects the streams, renditions filtered by device — puts different renditions in one swarm, and peers exchange segments of the wrong one. Configure a different `swarmId` for each set of streams, for example the content's identifier with the A/B group or the device class added.

**When the default is wrong** in other ways, configure a `streamIdBuilder` on the client. The index is the wrong default for an HLS master that lists its streams in another order for each request or each viewer, or one that adds or removes a variant during a live stream: viewers then count differently, and one index names different streams for them. The `@id` is the wrong default for DASH `@id`s that differ from viewer to viewer. The builder returns the stream ID, and the server applies the same rule to the manifest it publishes:

```typescript
import type { CoreConfig } from "p2p-media-loader-core";
import {
  buildStreamSwarmId,
  computeInfoHash,
  type StreamProperties,
  type StreamType,
} from "p2p-media-loader-core/server";

// One function for the client and the server, so that both build one ID. A
// master that shuffles its variants: name each stream by what it carries.
const streamIdOf = (streamType: StreamType, p: StreamProperties) =>
  [streamType, p.codecs, p.width, p.height, p.name, p.language, p.channels]
    .map((value) => value ?? "")
    .join("-");

// Client: the engine's `core` configuration.
const config: CoreConfig = {
  swarmId: videoUuid,
  streamIdBuilder: ({ streamType, properties }) =>
    streamIdOf(streamType, properties),
};

// Server: each stream's properties as the client reads them from the master —
// a variant's video codecs only, for one (see specs/segment-identity.md, "The
// properties a builder receives").
const infoHash = computeInfoHash(
  buildStreamSwarmId(
    videoUuid,
    streamIdOf("main", { codecs: "avc1.64001f", width: 1280, height: 720 }),
  ),
);
```

Streams equal in all of these values — two rungs that differ only in bitrate, say — would get one ID. Tell them apart by something every viewer reads alike, such as an unsigned file name in the playlist URL (`runtimeId`), or keep the default for that master.

The builder receives the stream's `runtimeId` (the media playlist URL for HLS, the Representation id for DASH; a URL can differ from viewer to viewer, so use only a part they share), its type and properties, its `defaultStreamId`, its HLS `index`, and the `manifest` that declared it — its URL and every stream with key, type, default stream ID and properties — so that it can tell what the ID must be unique among. It returns `undefined` to keep the default.

The stream ID must be deterministic and identical across all peers of a swarm, and **every distinct stream must map to a distinct ID**. Build it from properties every viewer reads alike — not `bitrate`, which an origin may recompute per request — and from enough of them: resolution alone collides on ladders with several bitrates at the same resolution. The core does not check this: two different streams with one ID are one swarm, and their peers exchange segments of the wrong stream. One rendition listed twice, for two CDNs, may take one ID: viewers on the two copies then share one swarm. A failover from one copy to the other in one player is not tested with a shared ID (see `KNOWN-ISSUES.md`). A builder that returns no usable ID fails the stream's registration (reported through the `onStreamRegistrationError` core event), and the stream plays without P2P. The builder cannot be changed at runtime. Clients can also observe each registered stream's `streamId` and `infoHash` through the `onStreamAdded` core event.
