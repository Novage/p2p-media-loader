import type HlsType from "hls.js";
import { Engine, PartialHlsJsEngineConfig } from "./engine";
import { DeepReadonly } from "ts-essentials";

export type HlsWithP2PConfig<HlsConfig> = HlsConfig & {
  p2p?: DeepReadonly<PartialHlsJsEngineConfig>;
};

export function createP2PHlsClass<Hls, HlsConfig>(
  HlsBaseClass?: new (config?: HlsConfig) => Hls,
): new (config?: HlsWithP2PConfig<HlsConfig>) => Hls {
  return class P2PHlsJsClass extends ((HlsBaseClass ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).Hls) as new (
    config?: HlsConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => any) {
    #p2pEngine: Engine;

    get p2pEngine() {
      return this.#p2pEngine;
    }

    constructor(config?: HlsWithP2PConfig<HlsConfig>) {
      const p2pEngine = new Engine(config?.p2p);

      super({ ...config, ...p2pEngine.getHlsConfig() } as HlsConfig);

      this.#p2pEngine = p2pEngine;
      p2pEngine.setHls(this as unknown as HlsType);
    }
  } as new (config?: HlsWithP2PConfig<HlsConfig>) => Hls;
}
