import { HybridLoader } from "p2p-media-loader-core";

export class Engine {
  static isSupported() {
    return HybridLoader.isSupported();
  }

  static getText(): string {
    return "Some stupid text with no sence. " + HybridLoader.text();
  }

  getSettings() {
    return { opt1: 1, opt2: 2 };
  }

  createLoaderClass() {
    return { name: "loader class" };
  }
}
