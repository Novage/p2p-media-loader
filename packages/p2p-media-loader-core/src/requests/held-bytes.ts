import * as Utils from "../utils/utils.js";

/** Who sent bytes, or gave a size: HTTP, which is trusted, or one peer. */
export type ByteSource =
  | { readonly downloadSource: "http" }
  | { readonly downloadSource: "p2p"; readonly peerId: string };

/**
 * What the rules for joining bytes from HTTP and peers ask of the bytes a
 * request holds. See specs/playback-contract.md, "Urgency".
 */
export type HeldBytesView = Pick<
  HeldBytes,
  | "length"
  | "size"
  | "sizePeer"
  | "owner"
  | "hasPeerBytes"
  | "hasBytesFrom"
  | "isComplete"
  | "isOverflow"
  | "isShort"
  | "wouldOverflowWith"
  | "completionSource"
  | "otherPeerThan"
  | "peerForExcessBytes"
>;

/**
 * The bytes a request holds, in order, with who sent them, and the
 * segment's total size, with who gave it.
 *
 * A download belongs to the peer whose bytes it holds, however many HTTP
 * bytes follow them; HTTP is trusted and the source of truth. Every field
 * changes only through the operations here, so that a clear, a new chunk or
 * a new size leaves no field behind.
 */
export class HeldBytes {
  private chunks: Uint8Array[] = [];
  private joined?: ArrayBuffer;
  private _length = 0;
  /** The peers that sent some of the bytes. HTTP bytes add none. */
  private readonly peers = new Set<string>();
  /**
   * The latest peer that sent some of the bytes. HTTP bytes do not change
   * it, on purpose: the download stays that peer's.
   */
  private latestPeer?: string;
  private _size?: number;
  /** The peer whose message gave the size; none for HTTP or a byte range. */
  private _sizePeer?: string;

  /** @param rangeSize - The size a segment's byte range gives, if it has one. */
  constructor(private readonly rangeSize: number | undefined) {
    this._size = rangeSize;
  }

  get length(): number {
    return this._length;
  }

  /** The segment's total size, where known. */
  get size(): number | undefined {
    return this._size;
  }

  /** The peer that gave the size, if a peer did and HTTP has not agreed. */
  get sizePeer(): string | undefined {
    return this._sizePeer;
  }

  get data(): ArrayBuffer {
    if (!this.joined) {
      // Keep only the joined bytes, so that they are not held twice.
      const joined = Utils.joinChunks(this.chunks, this._length);
      this.chunks = [joined];
      this.joined = joined.buffer;
    }
    return this.joined;
  }

  /**
   * The peer the download belongs to: the one whose bytes it holds. None for
   * HTTP bytes only, and none where several peers sent bytes, which happens
   * only when nothing validates peers' bytes.
   */
  get owner(): string | undefined {
    if (this.peers.size !== 1) return undefined;
    return this.peers.values().next().value;
  }

  /** Whether a peer sent some of the bytes. */
  get hasPeerBytes(): boolean {
    return this.peers.size > 0;
  }

  /** Whether `peerId` sent some of the bytes. */
  hasBytesFrom(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  /** Whether every byte of a segment of known size is held. */
  get isComplete(): boolean {
    return !!this._size && this._length === this._size;
  }

  /** Whether more bytes are held than the size: a state to clear. */
  get isOverflow(): boolean {
    return this._size !== undefined && this._length > this._size;
  }

  /** Whether fewer bytes are held than the size. */
  get isShort(): boolean {
    return this._size !== undefined && this._length < this._size;
  }

  /** Whether `byteLength` more bytes would be more than the size. */
  wouldOverflowWith(byteLength: number): boolean {
    return this._size !== undefined && this._length + byteLength > this._size;
  }

  /**
   * The source a download that holds every byte completes as: HTTP for HTTP
   * bytes only; otherwise the latest peer that sent bytes, so the download
   * is validated as that peer's.
   */
  get completionSource(): ByteSource {
    return this.latestPeer === undefined
      ? { downloadSource: "http" }
      : { downloadSource: "p2p", peerId: this.latestPeer };
  }

  /**
   * A peer other than `peerId` that sent some of the bytes, if any. Where
   * peers' bytes are validated, `peerId` must not go on from them: the
   * validation of the whole segment would blame it for that peer's bytes.
   */
  otherPeerThan(peerId: string): string | undefined {
    for (const peer of this.peers) {
      if (peer !== peerId) return peer;
    }
    return undefined;
  }

  /**
   * The peer at fault when the bytes go past the end of the segment HTTP
   * has: the one that gave the size, or else the one that sent them.
   */
  get peerForExcessBytes(): string | undefined {
    return this._sizePeer ?? this.owner;
  }

  /** Adds a chunk. An empty chunk adds nothing, and records no peer. */
  add(chunk: Uint8Array, source: ByteSource) {
    if (chunk.byteLength === 0) return;
    this.chunks.push(chunk);
    this._length += chunk.byteLength;
    this.joined = undefined;
    if (source.downloadSource === "p2p") {
      this.peers.add(source.peerId);
      this.latestPeer = source.peerId;
    }
  }

  /**
   * Drops every byte, and a size a source gave. A byte range's size stays:
   * without it, every later HTTP attempt would fail its Content-Range check.
   */
  clear() {
    this.chunks = [];
    this.joined = undefined;
    this._length = 0;
    this.peers.clear();
    this.latestPeer = undefined;
    this._size = this.rangeSize;
    this._sizePeer = undefined;
  }

  /** Sets the size that `source` gave; a peer's can be wrong. */
  setSize(value: number, source: ByteSource) {
    if (this._size !== undefined) {
      throw new Error("Request total bytes value is already set");
    }
    this._size = value;
    this._sizePeer =
      source.downloadSource === "p2p" ? source.peerId : undefined;
  }

  /** HTTP agreed with the size: it is HTTP's now. */
  confirmSize() {
    this._sizePeer = undefined;
  }

  /** The download completed: its size is the bytes held, which no peer gave. */
  settleSize() {
    this._size = this._length;
    this._sizePeer = undefined;
  }
}
