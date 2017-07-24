interface ChunkManagerInterface {

    processHlsPlaylist(url: string, content: string): void;
    loadHlsPlaylist(url: string): Promise<string>;
    loadChunk(url: string, onSuccess: Function, onError: Function): void;
    abortChunk(url: string): void;
    setCurrentFragment(url: string): void;

}

export default ChunkManagerInterface;
