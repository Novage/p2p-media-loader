import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

const manifestUri = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

async function initApp() {
  if (shaka.Player.isBrowserSupported()) {
    initHlsPlayer("video1");
    await initShakaPlayer("video2");
  } else {
    console.error("Browser not supported!");
  }
}

function initHlsPlayer(videoId) {
  const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);
  const hls = new HlsWithP2P();
  hls.attachMedia(document.getElementById(videoId));
  hls.on(Hls.Events.ERROR, function (event, data) {
    console.error("Error code", data.details, "object", data);
  });

  try {
    hls.loadSource(manifestUri);
  } catch (e) {
    onError(e);
  }
}

async function initShakaPlayer(videoId) {
  ShakaP2PEngine.registerPlugins();
  const engine = new ShakaP2PEngine();

  const player = new shaka.Player();
  await player.attach(document.getElementById(videoId));
  player.addEventListener("error", onErrorEvent);

  engine.bindShakaPlayer(player);

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
