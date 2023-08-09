import { StreamsContainer } from "./streams-container";
import { Loader } from "./loader";
import { Stream, Segment, ReadonlyStream } from "../types";

export class Core<
  Sgm extends Segment = Segment,
  Str extends Stream<Sgm> = Stream<Sgm>
> {
  private readonly container: StreamsContainer<Sgm, Str> =
    new StreamsContainer();
  private readonly loader: Loader = new Loader(this.container);
  private readonly playback: Playback = new Playback();

  hasSegment(segmentLocalId: string): boolean {
    return this.container.hasSegment(segmentLocalId);
  }

  getStreamByUrl(streamUrl: string): ReadonlyStream<Sgm, Str> | undefined {
    return this.container.getStreamByUrl(streamUrl);
  }

  getStream(streamLocalId: string): ReadonlyStream<Sgm, Str> | undefined {
    return this.container.getStream(streamLocalId);
  }

  addStream(stream: Str) {
    this.container.addStream(stream.localId, stream);
  }

  updateStream(
    streamLocalId: string,
    addSegments?: Sgm[],
    removeSegmentIds?: string[]
  ): void {
    const stream = this.container.getStream(streamLocalId);
    if (!stream) return;

    addSegments?.forEach((s) => stream.segments.set(s.localId, s));
    removeSegmentIds?.forEach((id) => stream.segments.delete(id));
  }

  // TODO: response type
  loadSegment(segmentLocalId: string) {
    return this.loader.loadSegment(segmentLocalId);
  }

  abortSegmentLoading(segmentId: string): void {
    return this.loader.abortSegment(segmentId);
  }

  updatePlayback({
    position,
    rate,
  }: {
    rate?: number;
    position?: number;
  }): void {
    if (position !== undefined) this.playback.position = position;
    if (rate !== undefined) this.playback.rate = rate;
  }

  destroy(): void {
    this.container.clear();
  }
}

class Playback {
  position = 0;
  rate = 1;
}
