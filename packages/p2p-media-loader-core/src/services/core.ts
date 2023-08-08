import { Segment, Stream, StreamsContainer } from "./streams-container";
import { Loader } from "./loader";

export class Core<
  Sgm extends Segment = Segment,
  Str extends Stream<Sgm> = Stream<Sgm>
> {
  readonly container: StreamsContainer<Sgm, Str> = new StreamsContainer();
  private readonly loader: Loader = new Loader(this.container);
  private readonly playback: Playback = new Playback();

  hasSegment(segmentId: string): boolean {
    return this.container.hasSegment(segmentId);
  }

  loadSegment(segmentId: string) {
    return this.loader.loadSegment(segmentId);
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
