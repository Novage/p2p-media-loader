export { VideoJsP2PEngine } from "./engine.js";
export { Core } from "p2p-media-loader-core";

export type {
  DynamicVideoJsP2PEngineConfig,
  VideoJsP2PEngineConfig,
  PartialVideoJsP2PEngineConfig,
  VideoJsInput,
} from "./engine.js";
export type {
  VideoJsPlayerLike,
  VideoJsTechLike,
  VideoJsLike,
  VideoJsNamespace,
} from "./types.js";
// The slice of VHS the types above describe. video.js ships no declarations
// for it, so an integrator building a namespace of their own needs these.
export type {
  VhsCallback,
  VhsHandlerLike,
  VhsRepresentation,
  VhsRequest,
  VhsRequestHook,
  VhsRequestOptions,
  VhsResponse,
  VhsResponseHook,
  VhsXhr,
} from "./types.js";
