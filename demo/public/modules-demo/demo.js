import { Engine as ShakaEngine } from "p2p-media-loader-shaka";
import { Engine as HlsEngine } from "p2p-media-loader-hls";

const manifestUri = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

function initApp() {
  if (shaka.Player.isBrowserSupported()) {
    initShakaPlayer();
    initHlsPlayer();
  } else {
    console.error("Browser not supported!");
  }
}

async function initHlsPlayer() {
  const engine = new HlsEngine();

  const video = document.getElementById("video2");
  const player = new Hls();
  player.attachMedia(video);

  player.on(Hls.Events.ERROR, function (event, data) {
    console.error("Error code", data.details, "object", data);
  });

  engine.setHls(player);

  try {
    player.loadSource(manifestUri);
    console.log("The video has now been loaded!", engine, Hls, HlsEngine);
  } catch (e) {
    onError(e);
  }
}

async function initShakaPlayer() {
  ShakaEngine.setGlobalSettings();
  const engine = new ShakaEngine();

  const video = document.getElementById("video");
  const player = new shaka.Player();
  await player.attach(video);

  window.player = player;

  player.addEventListener("error", onErrorEvent);

  engine.configureAndInitShakaPlayer(player);

  try {
    await player.load(manifestUri);
    console.log("The video has now been loaded!", engine, shaka, ShakaEngine);
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
