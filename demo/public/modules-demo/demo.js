import { Engine as ShakaEngine } from "p2p-media-loader-shaka";
import { Engine as HlsEngine } from "p2p-media-loader-hlsjs";

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
  const engine = new HlsEngine();

  const player = new Hls({ ...engine.getHlsJsConfig() });
  player.attachMedia(document.getElementById("hls-video"));
  player.on(Hls.Events.ERROR, function (event, data) {
    console.error("Error code", data.details, "object", data);
  });

  engine.setHls(player);

  try {
    player.loadSource(manifestUri);
  } catch (e) {
    onError(e);
  }
}

async function initShakaPlayer() {
  const videoElement = document.getElementById("shaka-video");
  const videoContainer = document.getElementById("shaka-container");

  ShakaEngine.setGlobalSettings();
  const engine = new ShakaEngine();

  const player = new shaka.Player();
  await player.attach(videoElement);
  player.addEventListener("error", onErrorEvent);

  const ui = new shaka.ui.Overlay(player, videoContainer, videoElement);
  ui.getControls();

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
