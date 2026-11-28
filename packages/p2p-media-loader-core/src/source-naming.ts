import type { RegistryStream } from "./manifest/registry.js";
import { stripQuery } from "./manifest/url-key.js";
import { buildStreamSwarmId, computeInfoHash } from "./stream-identity.js";
import type {
  StreamConfig,
  StreamProperties,
  SwarmIdContext,
} from "./types.js";

/** A registered stream's identity: its swarm, its stream ID, and their hash. */
export type StreamIdentity = {
  swarmId: string;
  streamId: string;
  streamSwarmId: string;
  infoHash: string;
};

/**
 * What names the swarms of the source playing: the URL its first manifest
 * came from, or one the integration gave, and what each `swarmId` function
 * returned for it. `reset()` forgets it all for the next source. See
 * specs/segment-identity.md.
 */
export class SourceNaming {
  /** The URL that names the source, with its query; the name drops it. */
  private requestedUrl?: string;
  /** What each `swarmId` function returned for the source playing. */
  private readonly swarmIds = new Map<
    (context: SwarmIdContext) => string,
    string
  >();

  /** Names the source by a URL the integration gives; its query is dropped. */
  nameBy(url: string): void {
    this.requestedUrl = url;
  }

  /** Names the source by its first manifest, unless it is named already. */
  noteFirstManifest(url: string): void {
    this.requestedUrl ??= url;
  }

  /**
   * The identity of a stream the registry holds, from its stream type's
   * config. Throws where the stream cannot be named: no swarm name, or a
   * `swarmId` function or `streamIdBuilder` that gave no usable ID.
   */
  identify(
    stream: RegistryStream,
    properties: Readonly<StreamProperties>,
    config: StreamConfig,
  ): StreamIdentity {
    const { requestedUrl } = this;
    const configured = config.swarmId;
    let swarmId: string | undefined;
    if (typeof configured !== "function") {
      swarmId =
        configured ??
        (requestedUrl === undefined ? undefined : stripQuery(requestedUrl));
    } else if (requestedUrl !== undefined) {
      // Once per source, and again for the next one: `reset()`, which
      // `destroy()` calls, forgets both the answer and the URL that names the
      // source. A stream that registers later in the source — a period added
      // on a refresh — gets the answer the source's first stream got.
      swarmId = this.swarmIds.get(configured);
      if (swarmId === undefined) {
        swarmId = configured({
          manifestUrl: stripQuery(requestedUrl),
          requestedUrl,
        });
        if (swarmId === "") {
          throw new Error("swarmId must return a non-empty string");
        }
        this.swarmIds.set(configured, swarmId);
      }
    }
    if (swarmId === undefined) {
      throw new Error(
        "Failed to register stream: no swarmId is configured and no manifest has named the swarm.",
      );
    }

    let { streamId } = stream;
    if (config.streamIdBuilder) {
      const customStreamId = config.streamIdBuilder({
        swarmId,
        runtimeId: stream.key,
        streamType: stream.type,
        properties,
        defaultStreamId: stream.streamId,
        index: stream.index,
        manifest: stream.manifest,
      });

      if (customStreamId !== undefined) {
        if (typeof customStreamId !== "string" || customStreamId === "") {
          throw new Error(
            "streamIdBuilder must return a non-empty string or undefined",
          );
        }
        streamId = customStreamId;
      }
    }
    const streamSwarmId = buildStreamSwarmId(swarmId, streamId);
    return {
      swarmId,
      streamId,
      streamSwarmId,
      infoHash: computeInfoHash(streamSwarmId),
    };
  }

  reset(): void {
    this.requestedUrl = undefined;
    this.swarmIds.clear();
  }
}
