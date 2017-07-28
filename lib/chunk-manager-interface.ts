interface ChunkManagerInterface {

    processHlsPlaylist(url: string, content: string): void;
    loadHlsPlaylist(url: string): Promise<string>;
    loadChunk(url: string, onSuccess?: Function, onError?: Function): void;
    abortChunk(url: string): void;
    setCurrentChunk(url?: string): void;

}

export default ChunkManagerInterface;
