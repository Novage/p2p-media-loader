import { P2PLoader } from "./loader.js";
import debug from "debug";
import {
  CoreEventMap,
  Stream,
  StreamConfig,
  StreamWithSegments,
  SegmentStorage,
} from "../index.js";
import { RequestsContainer } from "../requests/request-container.js";
import * as LoggerUtils from "../utils/logger.js";
import { EventTarget } from "../utils/event-target.js";
import * as StreamUtils from "../utils/stream.js";

type P2PLoaderContainerItem = {
  stream: Stream;
  loader: P2PLoader;
  destroyTimeoutId?: number;
  loggerInfo: string;
};

export class P2PLoadersContainer {
  private readonly loaders = new Map<string, P2PLoaderContainerItem>();
  private _currentLoaderItem: P2PLoaderContainerItem;
  private readonly logger = debug("p2pml-core:p2p-loaders-container");

  constructor(
    private readonly streamManifestUrl: string,
    stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentStorage,
    private readonly config: StreamConfig,
    private readonly eventTarget: EventTarget<CoreEventMap>,
    private onSegmentAnnouncement: () => void,
  ) {
    this._currentLoaderItem = this.findOrCreateLoaderForStream(stream);
    this.logger(
      `set current p2p loader: ${LoggerUtils.getStreamString(stream)}`,
    );
  }

  private createLoader(stream: StreamWithSegments): P2PLoaderContainerItem {
    if (this.loaders.has(stream.runtimeId)) {
      throw new Error("Loader for this stream already exists");
    }
    const loader = new P2PLoader(
      this.streamManifestUrl,
      stream,
      this.requests,
      this.segmentStorage,
      this.config,
      this.eventTarget,
      () => {
        if (this._currentLoaderItem.loader === loader) {
          this.onSegmentAnnouncement();
        }
      },
    );
    const loggerInfo = LoggerUtils.getStreamString(stream);
    this.logger(`created new loader: ${loggerInfo}`);
    return {
      loader,
      stream,
      loggerInfo: LoggerUtils.getStreamString(stream),
    };
  }

  private findOrCreateLoaderForStream(stream: StreamWithSegments) {
    const loaderItem = this.loaders.get(stream.runtimeId);
    if (loaderItem) {
      clearTimeout(loaderItem.destroyTimeoutId);
      loaderItem.destroyTimeoutId = undefined;
      return loaderItem;
    } else {
      const loader = this.createLoader(stream);
      this.loaders.set(stream.runtimeId, loader);
      return loader;
    }
  }

  changeCurrentLoader(stream: StreamWithSegments) {
    const swarmId = this.config.swarmId ?? this.streamManifestUrl;
    const streamSwarmId = StreamUtils.getStreamSwarmId(
      swarmId,
      this._currentLoaderItem.stream,
    );
    const ids = this.segmentStorage.getStoredSegmentIds(swarmId, streamSwarmId);
    if (!ids.length) this.destroyAndRemoveLoader(this._currentLoaderItem);
    else this.setLoaderDestroyTimeout(this._currentLoaderItem);

    this._currentLoaderItem = this.findOrCreateLoaderForStream(stream);

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
    this.loaders.delete(item.stream.runtimeId);
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
