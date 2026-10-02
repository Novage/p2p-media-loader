import { P2PLoader } from "./loader.js";
import debug from "debug";
import {
  CoreEventMap,
  Stream,
  StreamConfig,
  SegmentStorage,
} from "../index.js";
import { StreamWithSegments } from "../internal-types.js";
import { RequestsContainer } from "../requests/request-container.js";
import * as LoggerUtils from "../utils/logger.js";
import { EventTarget } from "../utils/event-target.js";
import { WebTorrentSocketPool } from "../webtorrent/webtorrent-socket-pool/index.js";

type P2PLoaderContainerItem = {
  stream: Stream;
  loader: P2PLoader;
  destroyTimeoutId?: number;
  loggerInfo: string;
};

export class P2PLoadersContainer {
  readonly #loaders = new Map<string, P2PLoaderContainerItem>();
  #currentLoaderItem: P2PLoaderContainerItem;
  readonly #logger = debug("p2pml-core:p2p-loaders-container");
  readonly #requests: RequestsContainer;
  readonly #segmentStorage: SegmentStorage;
  readonly #config: StreamConfig;
  readonly #webTorrentSocketPool: WebTorrentSocketPool;
  readonly #eventTarget: EventTarget<CoreEventMap>;
  readonly #peerId: string;
  readonly #onSegmentAnnouncement: () => void;

  constructor(
    stream: StreamWithSegments,
    requests: RequestsContainer,
    segmentStorage: SegmentStorage,
    config: StreamConfig,
    webTorrentSocketPool: WebTorrentSocketPool,
    eventTarget: EventTarget<CoreEventMap>,
    peerId: string,
    onSegmentAnnouncement: () => void,
  ) {
    this.#requests = requests;
    this.#segmentStorage = segmentStorage;
    this.#config = config;
    this.#webTorrentSocketPool = webTorrentSocketPool;
    this.#eventTarget = eventTarget;
    this.#peerId = peerId;
    this.#onSegmentAnnouncement = onSegmentAnnouncement;

    this.#currentLoaderItem = this.#findOrCreateLoaderForStream(stream);
    this.#logger(
      `set current p2p loader: ${LoggerUtils.getStreamString(stream)}`,
    );
  }

  #createLoader(stream: StreamWithSegments): P2PLoaderContainerItem {
    if (this.#loaders.has(stream.runtimeId)) {
      throw new Error("Loader for this stream already exists");
    }
    const loader = new P2PLoader(
      stream,
      this.#requests,
      this.#segmentStorage,
      this.#config,
      this.#webTorrentSocketPool,
      this.#eventTarget,
      this.#peerId,
      () => {
        if (this.#currentLoaderItem.loader === loader) {
          this.#onSegmentAnnouncement();
        }
      },
    );
    const loggerInfo = LoggerUtils.getStreamString(stream);
    this.#logger(`created new loader: ${loggerInfo}`);
    return {
      loader,
      stream,
      loggerInfo,
    };
  }

  #findOrCreateLoaderForStream(stream: StreamWithSegments) {
    const loaderItem = this.#loaders.get(stream.runtimeId);
    if (loaderItem) {
      clearTimeout(loaderItem.destroyTimeoutId);
      loaderItem.destroyTimeoutId = undefined;
      return loaderItem;
    } else {
      const loader = this.#createLoader(stream);
      this.#loaders.set(stream.runtimeId, loader);
      return loader;
    }
  }

  /**
   * Makes `stream`'s loader the current one, and lets the previous one go: at
   * once when nothing of its stream is stored, after a grace period otherwise.
   *
   * The next loader is in place before the previous one is let go. Loaders
   * share tracker sockets through the pool, which closes a socket the moment
   * its last holder releases it, so letting go first would close and reopen
   * the connection — a TLS handshake per tracker, and no announce for the new
   * swarm until it completes — on every switch made before anything was
   * stored, which is a player settling on a rendition at startup. And a
   * loader that fails to build leaves the previous one current and intact,
   * rather than current and destroyed.
   */
  changeCurrentLoader(stream: StreamWithSegments) {
    const previous = this.#currentLoaderItem;
    const next = this.#findOrCreateLoaderForStream(stream);
    if (next === previous) return;
    this.#currentLoaderItem = next;

    const ids = this.#segmentStorage.getStoredSegmentIds(
      previous.stream.swarmId,
      previous.stream.streamSwarmId,
    );
    if (!ids.length) this.#destroyAndRemoveLoader(previous);
    else this.#setLoaderDestroyTimeout(previous);

    this.#logger(
      `change current p2p loader: ${LoggerUtils.getStreamString(stream)}`,
    );
  }

  #setLoaderDestroyTimeout(item: P2PLoaderContainerItem) {
    item.destroyTimeoutId = window.setTimeout(
      () => this.#destroyAndRemoveLoader(item),
      this.#config.p2pInactiveLoaderDestroyTimeoutMs,
    );
  }

  #destroyAndRemoveLoader(item: P2PLoaderContainerItem) {
    item.loader.destroy();
    this.#loaders.delete(item.stream.runtimeId);
    this.#logger(`destroy p2p loader: `, item.loggerInfo);
  }

  get currentLoader() {
    return this.#currentLoaderItem.loader;
  }

  destroy() {
    for (const { loader, destroyTimeoutId } of this.#loaders.values()) {
      loader.destroy();
      clearTimeout(destroyTimeoutId);
    }
    this.#loaders.clear();
  }
}
