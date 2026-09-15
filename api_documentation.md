- [GitHub](https://github.com/Novage/p2p-media-loader)
- NPM Packages
  - [Core](https://npmjs.com/package/p2p-media-loader-core)
  - [Hls.js integration](https://npmjs.com/package/p2p-media-loader-hlsjs)
  - [Shaka Player integration](https://npmjs.com/package/p2p-media-loader-shaka)
  - [dash.js integration](https://npmjs.com/package/p2p-media-loader-dashjs)
  - [video.js integration](https://npmjs.com/package/p2p-media-loader-videojs)

**P2P Media Loader** is an open-source JavaScript library that leverages modern web browser features, such as HTML5 video and WebRTC, to enable media delivery over peer-to-peer (P2P) networks. It integrates smoothly with many popular HTML5 video players and works entirely without browser plugins or add-ons. Experience it in action with our [demo](http://novage.com.ua/p2p-media-loader/demo.html).

**P2P Media Loader** can be bundled into your project via an npm package or loaded directly from a CDN. Below are examples of both methods.

## Using P2P Media Loader with npm

To include **P2P Media Loader** in your project using npm, follow these steps:

1. Install the package via npm:
   - For Hls.js integration:

     ```bash
     npm install p2p-media-loader-hlsjs
     ```

   - For Shaka Player integration:

     ```bash
     npm install p2p-media-loader-shaka
     ```

   - For dash.js integration:

     ```bash
     npm install p2p-media-loader-dashjs
     ```

   - For video.js integration:
     ```bash
     npm install p2p-media-loader-videojs
     ```

1. Import and use it in your project:
   - Hls.js integration — the engine is mixed into the `Hls` class, so the
     player is created and used exactly as without P2P:

     ```typescript
     import Hls from "hls.js";
     import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

     const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

     const hls = new HlsWithP2P({
       // Any Hls.js option goes here as usual, plus:
       p2p: {
         core: {
           swarmId: "Optional custom swarm ID for stream",
           // Other P2P engine configuration parameters go here
         },
         onHlsJsCreated: (hls) => {
           // The engine lives on the Hls.js instance
           hls.p2pEngine.addEventListener("onPeerConnect", (params) => {
             console.log("Peer connected:", params.peerId);
           });
           // Subscribe to other P2P engine and Hls.js events here
         },
       },
     });

     hls.attachMedia(videoElement);
     hls.loadSource(streamUrl);
     ```

   - Shaka Player integration — the engine registers Shaka's networking
     scheme plugins once per page, then binds to each player before it loads:

     ```typescript
     import shaka from "shaka-player/dist/shaka-player.ui";
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
     player.initialize(videoElement, manifestUrl, true);
     ```

   - video.js integration — the engine replaces `videojs.Vhs.xhr` once per
     page and registers a `p2pMediaLoader` plugin; HLS and MPEG-DASH both
     play through VHS:

     ```typescript
     import videojs from "video.js";
     import "video.js/dist/video-js.css";
     import { VideoJsP2PEngine } from "p2p-media-loader-videojs";

     // Once per page, before any player loads a source
     VideoJsP2PEngine.registerPlugins(videojs);

     const player = videojs(videoElement, {
       // VHS stands aside for native HLS on Safari and iOS unless told otherwise
       html5: {
         vhs: { overrideNative: true },
         nativeAudioTracks: false,
         nativeVideoTracks: false,
       },
     });
     const engine = player.p2pMediaLoader({
       core: {
         swarmId: "Optional custom swarm ID for stream",
         // Other P2P engine configuration parameters go here
       },
     });
     engine.addEventListener("onPeerConnect", (params) => {
       console.log("Peer connected:", params.peerId);
     });

     // or "application/dash+xml" for an MPD
     player.src({ src: streamUrl, type: "application/x-mpegURL" });
     ```

For additional examples using npm packages, please refer to our [React demo](https://github.com/Novage/p2p-media-loader/tree/main/packages/p2p-media-loader-demo/src/components/players).

## Using P2P Media Loader from a CDN via JavaScript Modules

**P2P Media Loader** supports a wide variety of players that use Hls.js as their underlying media engine. Let's use the [Vidstack](https://www.vidstack.io/) player for a comprehensive Hls.js example:

### Integrating P2P with Vidstack and Hls.js

```html
<!doctype html>
<html>
  <head>
    <!-- Include the Hls.js library from a CDN -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@~1/dist/hls.min.js"></script>

    <!-- Import map for the P2P Media Loader modules. The engine imports the
         core and its HLS manifest parser by bare specifier; both must resolve
         to the same core bundle, here the one carrying only the HLS parser. -->
    <script type="importmap">
      {
        "imports": {
          "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-hls.es.min.js",
          "p2p-media-loader-core/hls": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-hls.es.min.js",
          "p2p-media-loader-hlsjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@^5/dist/p2p-media-loader-hlsjs.es.min.js"
        }
      }
    </script>

    <!-- Include Vidstack player stylesheets -->
    <link rel="stylesheet" href="https://cdn.vidstack.io/player/theme.css" />
    <link rel="stylesheet" href="https://cdn.vidstack.io/player/video.css" />

    <!-- Include the Vidstack player library from a CDN -->
    <script src="https://cdn.vidstack.io/player" type="module"></script>

    <!-- Module script to initialize the Vidstack player with P2P Media Loader -->
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
                // other P2P engine configuration parameters go here
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
      <!-- Vidstack media player with an HLS stream -->
      <media-player src="streamUrl">
        <media-provider></media-provider>
        <media-video-layout></media-video-layout>
      </media-player>
    </div>
  </body>
</html>
```

### **Integrating P2P with a standalone Hls.js player**

```html
<script type="module">
  import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

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
          // Other P2P engine configuration parameters go here
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

### **Integrating P2P with Clappr and Hls.js**

```html
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
          // Other P2P engine configuration parameters go here
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
        // Other P2P engine configuration parameters go here
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
          // Other P2P engine configuration parameters go here
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

[Shaka Player](https://shaka-player-demo.appspot.com/demo/) is used below for an extended example:

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

### **Integrating P2P with Vidstack and dash.js**

```html
<!doctype html>
<html>
  <head>
    <!-- Import map: the core with the DASH parser, the engine, and dash.js -->
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

    <!-- Include Vidstack player stylesheets -->
    <link rel="stylesheet" href="https://cdn.vidstack.io/player/theme.css" />
    <link rel="stylesheet" href="https://cdn.vidstack.io/player/video.css" />

    <!-- Include the Vidstack player library from a CDN -->
    <script src="https://cdn.vidstack.io/player" type="module"></script>

    <script type="module">
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

      const player = document.querySelector("media-player");
      player.addEventListener("provider-change", (event) => {
        const provider = event.detail;
        if (provider?.type !== "dash") return;

        // Use the dash.js from the import map rather than Vidstack's CDN default
        provider.library = MediaPlayer;

        // Vidstack invokes this with each new dash.js instance right before
        // attaching it to the media — the point at which the engine must bind.
        provider.onInstance((instance) => {
          engine.bindPlayer(instance);
        });
      });
    </script>
  </head>

  <body>
    <div style="width: 800px">
      <!-- Vidstack media player with an MPEG-DASH stream -->
      <media-player src="https://example.com/stream.mpd" autoplay muted>
        <media-provider></media-provider>
        <media-video-layout></media-video-layout>
      </media-player>
    </div>
  </body>
</html>
```

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

### **Integrating P2P with Plyr and dash.js**

```html
<script type="module">
  import { MediaPlayer } from "dashjs";
  import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

  const videoElement = document.getElementById("video");

  const engine = new DashJsP2PEngine({
    core: {
      swarmId: "Optional custom swarm ID for stream",
      // Other P2P engine configuration parameters go here
    },
  });

  const dashPlayer = MediaPlayer().create();
  engine.bindPlayer(dashPlayer); // before initialize()

  // Build Plyr's quality menu once dash.js knows the renditions
  dashPlayer.on("streamInitialized", () => {
    const representations = dashPlayer.getRepresentationsByType("video");
    const heights = [...new Set(representations.map((r) => r.height))].sort(
      (a, b) => a - b,
    );

    const quality = {
      default: heights[heights.length - 1],
      options: heights,
      forced: true,
      onChange: (newQuality) => {
        const target = representations.find((r) => r.height === newQuality);
        if (!target) return;
        dashPlayer.updateSettings({
          streaming: { abr: { autoSwitchBitrate: { video: false } } },
        });
        // Keep the buffer: replacing it lands the player on the live edge
        // with nothing ahead for peers to fill
        dashPlayer.setRepresentationForTypeById("video", target.id, false);
      },
    };

    const plyrPlayer = new Plyr(videoElement, {
      quality,
      autoplay: true,
      muted: true,
    });
  });

  dashPlayer.initialize(videoElement, streamUrl, true);
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

### Integrating P2P with video.js

video.js plays HLS and MPEG-DASH through VHS (`@videojs/http-streaming`), so
one import map serves both; it maps the core and both parsers to the core
bundle that carries them.

```html
<!doctype html>
<html>
  <head>
    <link
      href="https://cdn.jsdelivr.net/npm/video.js@^8/dist/video-js.min.css"
      rel="stylesheet"
    />
    <!-- video.js as a global; its ESM build is not needed here -->
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

      // Once per page, before any player loads a source
      VideoJsP2PEngine.registerPlugins(videojs);

      const player = videojs("video", {
        html5: {
          // VHS stands aside for native HLS on Safari and iOS unless told otherwise
          vhs: { overrideNative: true },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      });

      const engine = player.p2pMediaLoader({
        core: {
          swarmId: "Optional custom swarm ID for stream",
          // Other P2P engine configuration parameters go here
        },
      });
      engine.addEventListener("onPeerConnect", (params) => {
        console.log("Peer connected:", params.peerId);
      });

      player.src({
        src: "https://example.com/stream.m3u8",
        type: "application/x-mpegURL", // "application/dash+xml" for an MPD
      });
    </script>
  </body>
</html>
```

## Using P2P Media Loader in older browsers and Smart TVs (IIFE)

For legacy environments that lack ES module support (such as older Smart TVs and deprecated browsers), you can utilize our IIFE builds. In these builds, the library components are exposed via global variables instead of ES module imports.

The global namespaces are `window.p2pml.hlsjs`, `window.p2pml.shaka`,
`window.p2pml.dashjs` and `window.p2pml.videojs`.

### Integrating P2P with a standalone Hls.js player (IIFE)

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
<script src="https://unpkg.com/shaka-player/dist/shaka-player.compiled.min.js"></script>
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

### Integrating P2P with video.js (IIFE)

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

    // Once per page, before any player loads a source
    VideoJsP2PEngine.registerPlugins(videojs);

    var player = videojs("video", {
      html5: {
        vhs: { overrideNative: true },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    player.p2pMediaLoader({
      core: {
        swarmId: "Optional custom swarm ID for stream",
        // Other P2P engine configuration parameters go here
      },
    });

    player.src({
      src: "https://example.com/stream.m3u8",
      type: "application/x-mpegURL", // "application/dash+xml" for an MPD
    });
  });
</script>
```

## Predicting swarm infohashes on a server

Each stream (media quality) is downloaded through its own P2P swarm, identified on trackers by an **infohash**. The infohash is the hash of the **stream swarm ID** — a string derived from the swarm ID, the stream type, and the stream's identity hash (a hash of its manifest properties — codecs, resolution, frame rate, video range, language, channels, name — with bitrate included only where the manifest needs it to tell two streams of the same type apart).

A server can compute the exact infohashes clients will announce — for example, to allowlist them on a private tracker. The Node-safe helpers are exported from the `p2p-media-loader-core/server` subpath (Node.js 16+). The package is published as ESM only — from a CommonJS project, load it with a dynamic `import()` (or `require()` on Node.js 20.17+):

```typescript
import {
  identityProperties,
  computeStreamSwarmId,
  computeInfoHash,
} from "p2p-media-loader-core/server";

// With the default client configuration. `streams` lists every variant and
// rendition of the master manifest, with the properties exactly as the
// manifest states them (see specs/segment-identity.md for which those are per
// protocol) — the client does not normalize them. `identityProperties` applies
// the client's rule for bitrate: it is dropped unless another stream of the
// same type would otherwise be indistinguishable, so an origin that recomputes
// BANDWIDTH per request does not split a swarm.
const inputs = identityProperties(streams); // streams: { type, properties }[]
const infoHashes = streams.map((stream, i) =>
  computeInfoHash(
    computeStreamSwarmId({
      swarmId, // the configured swarmId, or the master manifest's URL without its query string
      streamType: stream.type,
      properties: inputs[i],
    }),
  ),
);

// The tracker allowlist entries (hex of the announced 20-byte ASCII string):
const allowlist = infoHashes.map((h) => Buffer.from(h, "utf8").toString("hex"));
```

For full control, configure a custom `streamSwarmIdBuilder` on the client and apply `computeInfoHash` to the same string on the server. This way the infohash depends only on values the server authors itself:

```typescript
// Client
const config = {
  swarmId: videoUuid,
  streamSwarmIdBuilder: ({ swarmId, streamType, properties }) =>
    `my-app-${swarmId}-${streamType}-${properties.height ?? 0}-${properties.bitrate ?? 0}`,
};

// Server (per quality, at transcode time)
const infoHash = computeInfoHash(
  `my-app-${videoUuid}-main-${height}-${bitrate}`,
);
```

The stream swarm ID must be deterministic and identical across all peers of a swarm, and **every distinct stream must map to a distinct ID**. Include enough properties to guarantee that: resolution alone collides on ladders with several bitrates at the same resolution, so the example above adds `bitrate`. If your ladder can have several renditions sharing those fields (e.g. different codecs at the same resolution and bitrate), add the distinguishing property too, or incorporate the stream's `identityHash` (reproduce it server-side with `computeStreamIdentityHash` over the input `identityProperties` yields for that stream). Two different streams resolving to the same ID fail to register (reported through the `onStreamRegistrationError` core event) and play without P2P. The builder cannot be changed at runtime. Clients can also observe each registered stream's computed identity through the `onStreamAdded` core event.

The builder context also provides `defaultStreamSwarmId` — the ID the default derivation would produce — which is guaranteed unique per stream and convenient as a base for custom IDs (e.g. `` `${tenant}-${defaultStreamSwarmId}` ``; reproduce it server-side with `computeStreamSwarmId` or compose it with `buildStreamSwarmId(swarmId, streamType, identityHash)`).
