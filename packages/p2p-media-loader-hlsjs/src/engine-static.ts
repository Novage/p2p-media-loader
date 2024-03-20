import { Engine, PartialHlsJsEngineConfig } from "./engine";
import { DeepReadonly } from "ts-essentials";

export type HlsJsConfigWithP2P<HlsConfig> = HlsConfig & {
  p2p?: DeepReadonly<PartialHlsJsEngineConfig>;
};

export function injectP2PMixin<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HlsJsConstructor extends new (...args: any[]) => any,
>(HlsJsClass: HlsJsConstructor) {
  return class P2PHlsJsClass extends HlsJsClass {
    #p2pEngine: Engine;

    get p2pEngine() {
      return this.#p2pEngine;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      const config = args[0] as HlsJsConfigWithP2P<unknown> | undefined;
      const { p2p, ...hlsJsConfig } = config ?? {};

      const p2pEngine = new Engine(p2p);

      super({ ...hlsJsConfig, ...p2pEngine.getHlsJsConfig() });

      p2pEngine.setHls(this);

      this.#p2pEngine = p2pEngine;
    }
  };
}
