import { P2PLoader } from "./loader";
import debug from "debug";
import { CoreConfig, CoreEventMap, Stream, StreamWithSegments } from "../index";
import { RequestsContainer } from "../requests/request-container";
import { SegmentsMemoryStorage } from "../segments-storage";
import * as LoggerUtils from "../utils/logger";
import { EventTarget } from "../utils/event-target";

type P2PLoaderContainerItem = {
  stream: Stream;
  loader: P2PLoader;
  destroyTimeoutId?: number;
  loggerInfo: string;
};

export class P2PLoadersContainer {
  private readonly loaders = new Map<string, P2PLoaderContainerItem>();
  private _currentLoaderItem!: P2PLoaderContainerItem;
  private readonly logger = debug("p2pml-core:p2p-loaders-container");

  constructor(
    private readonly streamManifestUrl: string,
    stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly config: CoreConfig,
    private readonly eventTarget: EventTarget<CoreEventMap>,
  ) {
    this.changeCurrentLoader(stream);
  }

  private createLoader(stream: StreamWithSegments): P2PLoaderContainerItem {
    if (this.loaders.has(stream.localId)) {
      throw new Error("Loader for this stream already exists");
    }
    const loader = new P2PLoader(
      this.streamManifestUrl,
      stream,
      this.requests,
      this.segmentStorage,
      this.config,
      this.eventTarget,
    );
    const loggerInfo = LoggerUtils.getStreamString(stream);
    this.logger(`created new loader: ${loggerInfo}`);
    return {
      loader,
      stream,
      loggerInfo: LoggerUtils.getStreamString(stream),
    };
  }

  changeCurrentLoader(stream: StreamWithSegments) {
    const loaderItem = this.loaders.get(stream.localId);
    if (this._currentLoaderItem) {
      const ids = this.segmentStorage.getStoredSegmentExternalIdsOfStream(
        this._currentLoaderItem.stream,
      );
      if (!ids.length) this.destroyAndRemoveLoader(this._currentLoaderItem);
      else this.setLoaderDestroyTimeout(this._currentLoaderItem);
    }
    if (loaderItem) {
      this._currentLoaderItem = loaderItem;
      clearTimeout(loaderItem.destroyTimeoutId);
      loaderItem.destroyTimeoutId = undefined;
    } else {
      const loader = this.createLoader(stream);
      this.loaders.set(stream.localId, loader);
      this._currentLoaderItem = loader;
    }
    this.logger(
      `change current p2p loader: ${LoggerUtils.getStreamString(stream)}`,
    );
  }

  private setLoaderDestroyTimeout(item: P2PLoaderContainerItem) {
    item.destroyTimeoutId = window.setTimeout(
      () => this.destroyAndRemoveLoader(item),
      this.config.p2pInactiveLoaderDestroyTimeoutMs,
    );
  }

  private destroyAndRemoveLoader(item: P2PLoaderContainerItem) {
    item.loader.destroy();
    this.loaders.delete(item.stream.localId);
    this.logger(`destroy p2p loader: `, item.loggerInfo);
  }

  get currentLoader() {
    return this._currentLoaderItem.loader;
  }

  destroy() {
    for (const { loader, destroyTimeoutId } of this.loaders.values()) {
      loader.destroy();
      clearTimeout(destroyTimeoutId);
    }
    this.loaders.clear();
  }
}
