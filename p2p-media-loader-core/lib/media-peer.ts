import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import MediaPeerCommands from "./media-peer-commands";
import Timer = NodeJS.Timer;
import MediaPeerEvents from "./media-peer-events";
import LoaderEvents from "./loader-events";

class LoaderFileChunk {

    constructor(readonly index: number, readonly data: Array<number>) {
    }

}

export default class MediaPeer extends EventEmitter {

    public id: string;
    private peer: any;
    private tmpFileData: Map<string, Array<LoaderFileChunk>> = new Map();
    private files: Set<string> = new Set();
    private chunkSize = 4 * 1024;
    private requestFileResponseTimeout = 3000;
    private requestFileResponseTimers: Map<string, Timer> = new Map();

    // TODO: set according to MediaPeerCommands.Busy
    // TODO: clear by timeout
    private isBusy: boolean = false;

    constructor(peer: any) {
        super();

        this.peer = peer;
        this.peer.on("connect", () => this.onPeerConnect());
        this.peer.on("close", () => this.onPeerClose());
        this.peer.on("error", (error: any) => this.onPeerError(error));
        this.peer.on("data", (data: any) => this.onPeerData(data));

        this.id = peer.id;
    }

    private onPeerConnect(): void {
        this.emit(MediaPeerEvents.Connect, this);
    }

    private onPeerClose(): void {
        this.emit(MediaPeerEvents.Close, this);
    }

    private onPeerError(error: any): void {
        this.emit(MediaPeerEvents.Error, this, error);
    }

    private onPeerData(data: any): void {
        //console.log("data byte lengh", data.byteLength);
        const dataString = new TextDecoder("utf-8").decode(data);
        let dataObject;
        try {
            dataObject = JSON.parse(dataString);
        } catch (err) {
            debugger;
        }

        switch (dataObject.command) {

            case MediaPeerCommands.FilesMap:
                //console.info(dataObject.command, dataObject, this.id);
                this.files = new Set(dataObject.files);
                this.emit(MediaPeerEvents.DataFilesMap);
                break;

            case MediaPeerCommands.FileRequest:
                //console.info(dataObject.command, dataObject, this.id);
                this.emit(MediaPeerEvents.DataFileRequest, this, dataObject.url);
                break;

            case MediaPeerCommands.FileData:
                this.setResponseTimer(dataObject.url);
                const tmpFileData = this.tmpFileData.get(dataObject.url);

                if (tmpFileData) {
                    const chunk = new LoaderFileChunk(dataObject.chunkIndex,  dataObject.data);
                    tmpFileData.push(chunk);

                    if (dataObject.chunksCount === tmpFileData.length) {
                        this.removeResponseTimer(dataObject.url);
                        tmpFileData.sort((a, b) => a.index - b.index);

                        const stringData = new Array<number>();
                        tmpFileData.forEach((chunk) => {
                            stringData.push(...chunk.data);
                        });

                        const file = new LoaderFile(dataObject.url);
                        file.data = Buffer.from(stringData).buffer;

                        this.tmpFileData.delete(file.url);
                        this.emit(MediaPeerEvents.DataFileLoaded, this, file);
                    }
                    this.emit(LoaderEvents.ChunkBytesLoaded, {"method": "p2p", "size": chunk.data.length, timestamp: Date.now()});
                }

                break;

            case MediaPeerCommands.FileAbsent:
                //console.info(dataObject.command, dataObject, this.id);
                this.removeResponseTimer(dataObject.url);
                this.tmpFileData.delete(dataObject.url);
                this.files.delete(dataObject.url);
                this.emit(MediaPeerEvents.DataFileAbsent, this, dataObject.url);
                break;

            case MediaPeerCommands.CancelFileRequest:
                //console.info(dataObject.command, dataObject, this.id, this.peer.bufferSize);
                // TODO: peer stop sending buffer
                break;

            default:
                break;
        }
    }

    // TODO: move to LoaderFile
    private getLoaderFileChunks(file: LoaderFile): Array<LoaderFileChunk> {
        const jsonBufferData = new Buffer(file.data).toJSON().data;
        const chunks = new Array<LoaderFileChunk>();

        if (jsonBufferData.length > this.chunkSize) {
            const initialChunksCount = Math.floor(jsonBufferData.length / this.chunkSize);
            const hasFinalChunk = jsonBufferData.length % this.chunkSize > 0;

            for (let i = 0; i < initialChunksCount; i++) {
                const start = i * this.chunkSize;
                const end = start + this.chunkSize;
                //console.log("chunk size", jsonBufferData.slice(start, end).length);
                chunks.push(new LoaderFileChunk(i, jsonBufferData.slice(start, end)));
            }

            if (hasFinalChunk) {
                chunks.push(new LoaderFileChunk(initialChunksCount, jsonBufferData.slice(initialChunksCount * this.chunkSize)));
            }

        } else {
            chunks.push(new LoaderFileChunk(0, jsonBufferData));
        }

        return chunks;
    }

    private sendCommand(command: any): boolean {
        if (this.peer.bufferSize > 0) {
            //console.warn("bufferSize: ", this.peer.bufferSize);
        }
        try {
            if (this.peer.connected) {
                this.peer.write(JSON.stringify(command));
                return true;
            } else {
                //console.warn("peer is not connected");
            }
        } catch (error) {
            //console.warn("sendCommand failed", error, command);
        }

        return false;
    }

    public hasFile(url: string): boolean {
        return this.files.has(url);
    }

    public sendFilesMap(files: Array<string>) {
        this.sendCommand({"command": MediaPeerCommands.FilesMap, "files": files});
    }

    public sendFileData(file: LoaderFile): void {
        //console.info("sending file...", file.url);
        const fileChunks = this.getLoaderFileChunks(file);

        for (let i = 0; i < fileChunks.length; i++) {
            this.sendCommand(
                {
                    "command": MediaPeerCommands.FileData,
                    "url": file.url,
                    "data": fileChunks[i].data,
                    "chunkIndex": fileChunks[i].index,
                    "chunksCount": fileChunks.length
                });
        }
    }

    public sendFileAbsent(url: string): void {
        this.sendCommand({"command": MediaPeerCommands.FileAbsent, "url": url});
    }

    public sendFileRequest(url: string): boolean {
        //console.info("sending file request...", url);
        if (this.sendCommand({"command": MediaPeerCommands.FileRequest, "url": url})) {
            this.setResponseTimer(url);
            this.tmpFileData.set(url, new Array<LoaderFileChunk>());
            return true;
        }

        return false;
    }

    public sendCancelFileRequest(url: string): boolean {
        //console.log("sending cancel...", url);
        return this.sendCommand({"command": MediaPeerCommands.CancelFileRequest, "url": url});
    }

    private setResponseTimer(url: string) {

        let timer = this.requestFileResponseTimers.get(url);
        if (timer) {
            clearTimeout(timer);
        }

        timer = setTimeout(() => {
                this.sendCancelFileRequest(url);
                this.files.delete(url);
                this.emit(MediaPeerEvents.DataFileAbsent, this, url);
            },
            this.requestFileResponseTimeout);

        this.requestFileResponseTimers.set(url, timer);
    }

    private removeResponseTimer(url: string) {
        const timer = this.requestFileResponseTimers.get(url);
        if (timer) {
            clearTimeout(timer);
        }
    }

}
