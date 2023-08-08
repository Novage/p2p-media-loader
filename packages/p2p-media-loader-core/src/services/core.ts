import { Segment, Stream, StreamsContainer } from "./streams-container";
import { Loader } from "./loader";

export class Core<
  Sm extends Segment = Segment,
  S extends Stream<Sm> = Stream<Sm>
> {
  readonly container: StreamsContainer<Sm, S> = new StreamsContainer();
  readonly loader: Loader = new Loader(this.container);

  hasSegment(segmentId: string) {
    return this.container.hasSegment(segmentId);
  }

  loadSegment(segmentId: string) {
    return this.loader.loadSegment(segmentId);
  }

  abortSegmentLoading(segmentId: string) {
    return this.loader.abortSegment(segmentId);
  }

  destroy() {
    this.container.clear();
  }
}
