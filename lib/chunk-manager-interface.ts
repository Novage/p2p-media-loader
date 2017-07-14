interface ChunkManagerInterface {

    //on(eventName: string | symbol, listener: Function): this;

    loadHlsPlaylist(url: string): void;
    loadChunk(name: string): void;

}

export default ChunkManagerInterface;
