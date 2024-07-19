- [GitHub](https://github.com/Novage/p2p-media-loader)
- NPM Packages
  - [Core](https://npmjs.com/package/p2p-media-loader-core)
  - [Hls.js integration](https://npmjs.com/package/p2p-media-loader-hlsjs)
  - [Shaka Player integration](https://npmjs.com/package/p2p-media-loader-shaka)

**P2P Media Loader** is an open-source JavaScript library that leverages modern web browser features, such as HTML5 video and WebRTC, to enable media delivery over peer-to-peer (P2P) networks. It integrates smoothly with many popular HTML5 video players and works entirely without browser plugins or add-ons. Experience it in action with the [demo](http://novage.com.ua/p2p-media-loader/demo.html).

**P2P Media Loader** can be bundled in your project as an npm package or used through a CDN. Below are examples of both methods.

## Using P2P Media Loader with npm

To include **P2P Media Loader** in your project using npm, follow these steps:

1. Install the package via npm:

   - For HLS.js integration:

     ```bash
     npm install p2p-media-loader-hlsjs
     ```

   - For Shaka Player integration:
     ```bash
     npm install p2p-media-loader-shaka
     ```

2. Provide Node.js polyfills

   To ensure the P2P Media Loader works correctly in a browser environment, you must provide Node.js polyfills required by [bittorrent-tracker](https://www.npmjs.com/package/bittorrent-tracker) dependency.

   - Vite configuration example:

     ```typescript
     // vite.config.ts
     import { defineConfig } from "vite";
     import { nodePolyfills } from "vite-plugin-node-polyfills";

     export default defineConfig({
       plugins: [nodePolyfills()],
     });
     ```

   - Webpack configuration example:

     ```javascript
     // webpack.config.mjs
     import NodePolyfillPlugin from "node-polyfill-webpack-plugin";

     export default {
       plugins: [new NodePolyfillPlugin({ additionalAliases: ["process"] })],
     };
     ```

3. Import and use it in your project:

   - HLS.js integration:

     ```typescript
     import Hls from "hls.js";
     import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

     const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
     ```

   - Shaka Player integration:

     ```typescript
     import shaka from "shaka-player/dist/shaka-player.ui";
     import { ShakaP2PEngine } from "p2p-media-loader-shaka";

     ShakaP2PEngine.registerPlugins(shaka);
     ```

For more examples with npm packages, you may check our [React demo](https://github.com/Novage/p2p-media-loader/tree/main/packages/p2p-media-loader-demo/src/components/players)

## Using P2P Media Loader with CDN via JavaScript Modules

**P2P Media Loader** supports many players that use Hls.js as media engine. Lets pick [Vidstack](https://www.vidstack.io/) player for extended hlsjs example:

### Integrating P2P with Vidstack and Hls.js

```html
<!doctype html>
<html>
  <head>
    <!-- Include Hls.js library from CDN -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@~1/dist/hls.min.js"></script>

    <!-- Import map for P2P Media Loader modules -->
    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^1/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-hlsjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@^1/dist/p2p-media-loader-hlsjs.es.min.js"
        }
      }
    </script>

    <!-- Include Vidstack player stylesheets -->
    <link rel="stylesheet" href="https://cdn.vidstack.io/player/theme.css" />
    <link rel="stylesheet" href="https://cdn.vidstack.io/player/video.css" />

    <!-- Include Vidstack player library from CDN -->
    <script src="https://cdn.vidstack.io/player" type="module"></script>

    <!-- Module script to initialize Vidstack player with P2P Media Loader -->
    <script type="module">
      import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

      const player = document.querySelector("media-player");
      // Inject P2P capabilities into Hls.js
      const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

      player.addEventListener("provider-change", (event) => {
        const provider = event.detail;

        // Check if the provider is HLS
        if (provider?.type === "hls") {
          provider.library = HlsWithP2P;

          provider.config = {
            p2p: {
              core: {
                swarmId: "Optional custom swarm ID for stream",
                // other P2P engine config parameters go here
              },
              onHlsJsCreated: (hls) => {
                hls.p2pEngine.addEventListener("onPeerConnect", (params) => {
                  console.log("Peer connected:", params.peerId);
                });
                // Subscribe to P2P engine and Hls.js events here
              },
            },
          };
        }
      });
    </script>
  </head>

  <body>
    <div style="width: 800px">
      <!-- Vidstack media player with HLS stream -->
      <media-player src="streamUrl">
        <media-provider></media-provider>
        <media-video-layout></media-video-layout>
      </media-player>
    </div>
  </body>
</html>
```

### **Integrating P2P with raw Hls.js player**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoElement = document.querySelector("#video");

  const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

  const hls = new HlsWithP2P({
    p2p: {
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine config parameters go here
      },
      onHlsJsCreated(hls) {
        hls.p2pEngine.addEventListener("onPeerConnect", (params) => {
          console.log("Peer connected:", params.peerId);
        });
        // Subscribe to P2P engine and Hls.js events here
      },
    },
  });

  hls.attachMedia(videoElement);
  hls.loadSource(streamUrl);
</script>
```

### **Integrating P2P with PlayerJS and Hls.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  window.Hls = HlsJsP2PEngine.injectMixin(window.Hls);

  const player = new Playerjs({
    id: "player",
    hlsconfig: {
      p2p: {
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine config parameters go here
        },
        onHlsJsCreated: (hls) => {
          // Subscribe to P2P engine and Hls.js events here
          hls.p2pEngine.addEventListener("onPeerConnect", (details) => {
            console.log(`Connected to peer ${details.peerId})`);
          });
        },
      },
    },
  });
</script>
```

### **Integrating P2P with DPlayer and Hls.js**

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
                // Other P2P engine config parameters go here
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

### **Integrating P2P with Clappr and Hls.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const engine = new HlsJsP2PEngine({
    p2p: {
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine config parameters go here
      },
    },
  });

  const player = new Clappr.Player({
    source: streamUrl,
    plugins: [LevelSelector], // https://cdn.jsdelivr.net/gh/clappr/clappr-level-selector-plugin@~0/dist/level-selector.min.js
    height: "100%",
    width: "100%",
    parentId: `#player`,
    playback: {
      hlsjsConfig: {
        ...engine.getConfigForHlsJs(),
      },
    },
  });

  engine.bindHls(() => clapprPlayer.core.getCurrentPlayback()?._hls);
</script>
```

### **Integrating P2P with MediaElement and Hls.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoElement = document.querySelector("#video");

  window.Hls = HlsJsP2PEngine.injectMixin(window.Hls);

  const player = new MediaElementPlayer(videoElement.id, {
    videoHeight: "100%",
    hls: {
      p2p: {
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine config parameters go here
        },
        onHlsJsCreated: (hls) => {
          // Subscribe to P2P engine and Hls.js events here
        },
      },
    },
  });

  player.setSrc(streamUrl);
  player.load();
</script>
```

### **Integrating P2P with Plyr and Hls.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoElement = document.querySelector("#video");

  const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

  const hls = new HlsWithP2P({
    p2p: {
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine config parameters go here
      },
      onHlsJsCreated(hls) {
        // Subscribe to P2P engine and Hls.js events here
      },
    },
  });

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    const levels = hls.levels;

    const quality = {
      default: levels[levels.length - 1].height,
      options: levels.map((level) => level.height),
      forced: true,
      onChange: (newQuality) => {
        levels.forEach((level, levelIndex) => {
          if (level.height === newQuality) {
            hls.currentLevel = levelIndex;
          }
        });
      },
    };

    player = new Plyr(videoElement, {
      quality,
      autoplay: true,
      muted: true,
    });
  });

  hls.attachMedia(videoElement);
  hls.loadSource(streamUrl);
</script>
```

### **Integrating P2P with OpenPlayerJS and Hls.js**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

  const videoElement = document.querySelector("#video");
  const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

  const player = new OpenPlayerJS(videoElement, {
    hls: {
      p2p: {
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine config parameters go here
        },
        onHlsJsCreated: (hls) => {
          // Subscribe to P2P engine and Hls.js events here
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

[Shaka](https://shaka-player-demo.appspot.com/demo/) player is used for an extended example:

```html
<!doctype html>
<html>
  <head>
    <!-- Link to Shaka Player's CSS for controls -->
    <link
      rel="stylesheet"
      type="text/css"
      href="https://unpkg.com/shaka-player/dist/controls.css"
    />

    <!-- Link to Shaka Player's compiled UI script -->
    <script src="https://unpkg.com/shaka-player/dist/shaka-player.ui.js"></script>

    <!-- Import map for P2P Media Loader modules -->
    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^1/dist/p2p-media-loader-core.es.min.js",
          "p2p-media-loader-shaka": "https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@^1/dist/p2p-media-loader-shaka.es.min.js"
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

        // Initialize P2P Media Loader with custom config
        const shakaP2PEngine = new ShakaP2PEngine({
          core: {
            swarmId: "Optional custom swarm ID for stream",
            // Other P2P engine config parameters go here
          },
        });

        //Subscribe to P2P engine events here
        shakaP2PEngine.addEventListener("onPeerConnect", (params) => {
          console.log("Peer connected:", params.peerId);
        });

        // Configure and initialize Shaka Player with P2P Media Loader
        shakaP2PEngine.bindShakaPlayer(player);

        // Load the stream URL into the player
        player.load(streamUrl);
      }

      // Add event listener for Shaka UI loaded event to trigger initialization
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

  const player = new Clappr.Player({
    parentId: `#${container.id}`,
    source: streamUrl,
    plugins: [window.DashShakaPlayback, window.LevelSelector],
    shakaOnBeforeLoad: (shakaPlayerInstance) => {
      subscribeToUiEvents({
        engine: shakaP2PEngine,
        onPeerConnect,
        onPeerDisconnect,
        onChunkDownloaded,
        onChunkUploaded,
      });

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

### **Integrating P2P with Plyr and Shaka Player**

```html
<script type="module">
  import { ShakaP2PEngine } from "p2p-media-loader-shaka";

  ShakaP2PEngine.registerPlugins();

  const videoElement = document.getElementById("video");

  const initPlayer = () => {
    const shakaP2PEngine = new ShakaP2PEngine({
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P Media Loader Core options
      },
    });
    const shakaPlayer = new shaka.Player();

    shakaPlayer.attach(videoElement);

    shakaP2PEngine.bindShakaPlayer(shakaPlayer);

    shakaPlayer.load(streamUrl);

    const plyrPlayer = new Plyr(videoElement);
  };

  initPlayer();
</script>
```
