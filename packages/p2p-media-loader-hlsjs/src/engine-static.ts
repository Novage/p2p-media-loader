import {
  HlsJsP2PEngine,
  PartialHlsJsP2PEngineConfig,
  HlsWithP2PInstance,
  HlsWithP2PConfig,
} from "./engine";

export function injectMixin<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HlsJsConstructor extends new (...args: any[]) => any,
>(HlsJsClass: HlsJsConstructor) {
  return class HlsJsWithP2PClass extends HlsJsClass {
    #p2pEngine: HlsJsP2PEngine;

    get p2pEngine() {
      return this.#p2pEngine;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      const config = args[0] as {
        p2p?: PartialHlsJsP2PEngineConfig & {
          onHlsJsCreated?: (hls: InstanceType<HlsJsConstructor>) => void;
        };
      } & Record<string, unknown>;

      const { p2p, ...hlsJsConfig } = config ?? {};

      const p2pEngine = new HlsJsP2PEngine(p2p);

      super({ ...hlsJsConfig, ...p2pEngine.getHlsJsConfig() });

      p2pEngine.setHls(this);

      this.#p2pEngine = p2pEngine;
      p2p?.onHlsJsCreated?.(this as InstanceType<HlsJsConstructor>);
    }
  } as new (
    config?: HlsWithP2PConfig<HlsJsConstructor>,
  ) => HlsWithP2PInstance<InstanceType<HlsJsConstructor>>;
}
