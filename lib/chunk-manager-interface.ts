interface ChunkManagerInterface {

    on(eventName: string | symbol, listener: Function): this;

    loadHlsPlaylist(url: string): void;
    loadChunk(url: string): void;
    abortChunk(url: string): void;

}

export default ChunkManagerInterface;
