import { Segment } from "./segment";
import { SegmentManager } from "./segment-manager";
import { StreamInfo } from "../types/types";
import { Debugger } from "debug";
import { Shaka } from "../types/types";

export function getLoadingHandler(
  shaka: Shaka,
  segmentManager: SegmentManager,
  streamInfo: StreamInfo,
  debug: Debugger
): shaka.extern.SchemePlugin {
  return (url, request, requestType, progressUpdated, receivedHeaders) => {
    const xhrPlugin = shaka.net.HttpFetchPlugin;
    const result = xhrPlugin.parse(
      url,
      request,
      requestType,
      progressUpdated,
      receivedHeaders
    );
    if (requestType === shaka.net.NetworkingEngine.RequestType.MANIFEST) {
      if (
        streamInfo.protocol === "hls" &&
        segmentManager.urlStreamMap.has(url)
      ) {
        (async () => {
          await result.promise;
          // Waiting for the playlist to be parsed
          setTimeout(() => segmentManager.updateHLSStreamByUrl(url), 0);
        })();
      }
    }
    if (requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      const segmentId = Segment.getLocalId(url, request.headers.Range);
      const stream = segmentManager.getStreamBySegmentLocalId(segmentId);
      const segment = stream?.segments.get(segmentId);
      debug(`\n\nLoading segment with id: ${segmentId}`);
      debug(`Stream id: ${stream?.id}`);
      debug(`Segment: ${segment?.index}`);
    }

    return result;
  };
}
