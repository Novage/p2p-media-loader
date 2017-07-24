interface ChunkManagerInterface {

    processHlsPlaylist(url: string, content: string): void;
    loadHlsPlaylist(url: string): void;
    loadChunk(url: string, onSuccess: Function, onError: Function): void;
    abortChunk(url: string): void;

}

export default ChunkManagerInterface;
