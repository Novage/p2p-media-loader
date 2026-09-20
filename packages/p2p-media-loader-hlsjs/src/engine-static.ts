import {
  HlsJsP2PEngine,
  PartialHlsJsP2PEngineConfig,
  HlsWithP2PInstance,
  HlsWithP2PConfig,
} from "./engine.js";

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
      const config = args[0] as
        | ({
            p2p?: PartialHlsJsP2PEngineConfig & {
              onHlsJsCreated?: (hls: InstanceType<HlsJsConstructor>) => void;
            };
          } & Record<string, unknown>)
        | undefined;

      const { p2p, ...hlsJsConfig } = config ?? {};

      const p2pEngine = new HlsJsP2PEngine(p2p);

      // The engine's defaults first, the integrator's config over them —
      // low-latency mode stays off unless they ask for it — and the loaders
      // last: they are what makes this HLS.js a P2P one.
      const { fLoader, pLoader, ...defaults } = p2pEngine.getConfigForHlsJs();
      super({ ...defaults, ...hlsJsConfig, fLoader, pLoader });

      p2pEngine.bindHls(this);

      this.#p2pEngine = p2pEngine;
      p2p?.onHlsJsCreated?.(this as InstanceType<HlsJsConstructor>);
    }
  } as new (
    config?: HlsWithP2PConfig<HlsJsConstructor>,
  ) => HlsWithP2PInstance<InstanceType<HlsJsConstructor>>;
}
