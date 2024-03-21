import { Engine, PartialHlsJsEngineConfig } from "./engine";
import { DeepReadonly } from "ts-essentials";

type P2PConfig<T> = {
  p2p?: DeepReadonly<PartialHlsJsEngineConfig> & {
    onHlsJsCreated?: (
      hls: T & {
        readonly p2pEngine: Engine;
      },
    ) => void;
  };
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
      const config = args[0] as P2PConfig<InstanceType<HlsJsConstructor>>;
      const { p2p, ...hlsJsConfig } = config ?? {};

      const p2pEngine = new Engine(p2p);

      super({ ...hlsJsConfig, ...p2pEngine.getHlsJsConfig() });

      p2pEngine.setHls(this);

      this.#p2pEngine = p2pEngine;
      p2p?.onHlsJsCreated?.(this as InstanceType<HlsJsConstructor>);
    }
  } as new (
    config?: ConstructorParameters<HlsJsConstructor>[0] &
      P2PConfig<InstanceType<HlsJsConstructor>>,
  ) => InstanceType<HlsJsConstructor> & {
    readonly p2pEngine: Engine;
  };
}
