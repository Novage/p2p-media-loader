interface ChunkManagerInterface {

    onHlsPlaylist(url: string): void;
    onChunk(name: string): void;

}

export default ChunkManagerInterface;
