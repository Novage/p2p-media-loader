import type { Core } from "../src/core.js";
import type { SegmentStorage } from "../src/segment-storage/index.js";

/**
 * A segment storage that stores nothing and records the segment ids it is
 * told have left a live window, unless `onSegmentsRemoved` replaces that.
 */
export function recordingStorage(
  onSegmentsRemoved?: SegmentStorage["onSegmentsRemoved"],
) {
  const removed: number[][] = [];
  const storage = {
    initialize: () => Promise.resolve(),
    onPlaybackUpdated: () => undefined,
    onSegmentRequested: () => undefined,
    storeSegment: () => Promise.resolve(),
    getSegmentData: () => Promise.resolve(undefined),
    getUsage: () => ({ totalCapacity: 1, usedCapacity: 0 }),
    hasSegment: () => false,
    getStoredSegmentIds: () => [],
    setSegmentChangeCallback: () => undefined,
    destroy: () => undefined,
    onSegmentsRemoved:
      onSegmentsRemoved ??
      ((_swarmId: string, _streamSwarmId: string, ids: readonly number[]) => {
        removed.push([...ids]);
      }),
  } satisfies SegmentStorage;
  return { storage, removed };
}

/**
 * Makes the core's segment storage. The core makes it on the first segment
 * request; a test makes it directly, which is all that request would do.
 */
export function initializeSegmentStorage(core: Core): Promise<void> {
  return (
    core as unknown as { initializeSegmentStorage(): Promise<void> }
  ).initializeSegmentStorage();
}
