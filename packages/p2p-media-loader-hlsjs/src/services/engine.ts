import { HybridLoader, Math } from "p2p-media-loader-core";

export class Engine {
  static isSupported() {
    return HybridLoader.isSupported();
  }

  getSettings() {
    return { opt1: 1, opt2: 2 };
  }

  createLoaderClass() {
    return { name: "loader class" };
  }

  increment(num: number) {
    return Math.add(num, 1);
  }
}
