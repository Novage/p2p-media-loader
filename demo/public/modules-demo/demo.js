import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

const manifestUri = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

async function initApp() {
  if (shaka.Player.isBrowserSupported()) {
    initHlsPlayer();
    await initShakaPlayer();
  } else {
    console.error("Browser not supported!");
  }
}

function initHlsPlayer() {
  const p2pEngine = new HlsJsP2PEngine();

  const hls = new Hls({ ...p2pEngine.getHlsJsConfig() });
  hls.attachMedia(document.getElementById("video1"));
  hls.on(Hls.Events.ERROR, function (event, data) {
    console.error("Error code", data.details, "object", data);
  });

  p2pEngine.setHls(hls);

  try {
    hls.loadSource(manifestUri);
  } catch (e) {
    onError(e);
  }
}

async function initShakaPlayer() {
  ShakaP2PEngine.registerPlugins();
  const engine = new ShakaP2PEngine();

  const player = new shaka.Player();
  await player.attach(document.getElementById("video2"));
  player.addEventListener("error", onErrorEvent);

  engine.configureAndInitShakaPlayer(player);

  try {
    await player.load(manifestUri);
  } catch (e) {
    onError(e);
  }
}

function onErrorEvent(event) {
  onError(event.detail);
}

function onError(error) {
  console.error("Error code", error.code, "object", error);
}

document.addEventListener("DOMContentLoaded", initApp);
