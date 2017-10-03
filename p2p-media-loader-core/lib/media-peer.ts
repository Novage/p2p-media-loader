import {EventEmitter} from "events";
import MediaPeerCommands from "./media-peer-commands";
import Timer = NodeJS.Timer;
import MediaPeerEvents from "./media-peer-events";
import LoaderEvents from "./loader-events";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";

class SegmentPiece {

    constructor(readonly index: number, readonly data: number[]) {
    }

}

export enum SegmentStatus {
    Loaded = "loaded",
    LoadingByHttp = "loading_by_http"
}

export default class MediaPeer extends EventEmitter {

    public id: string;
    public remoteAddress: string;
    private peer: any;
    private segmentsPiecesData: Map<string, SegmentPiece[]> = new Map();
    private segments: Map<string, SegmentStatus> = new Map();
    private pieceSize = 4 * 1024;
    private requestSegmentResponseTimeout = 3000;
    private requestSegmentResponseTimers: Map<string, Timer> = new Map();
    private debug = Debug("p2pml:media-peer");

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
        this.remoteAddress = this.peer.remoteAddress;
        this.emit(MediaPeerEvents.Connect, this);
    }

    private onPeerClose(): void {
        this.emit(MediaPeerEvents.Close, this);
    }

    private onPeerError(error: any): void {
        this.emit(MediaPeerEvents.Error, this, error);
    }

    private onPeerData(data: any): void {
        // TODO: validate data from peers

        const dataString = new TextDecoder("utf-8").decode(data);
        let dataObject: any;
        try {
            dataObject = JSON.parse(dataString);
        } catch (err) {
            this.debug(err);
            return;
        }

        switch (dataObject.command) {

            case MediaPeerCommands.SegmentsMap:
                this.segments = new Map(dataObject.segments);
                this.emit(MediaPeerEvents.DataSegmentsMap);
                break;

            case MediaPeerCommands.SegmentRequest:
                this.emit(MediaPeerEvents.DataSegmentRequest, this, dataObject.id);
                break;

            case MediaPeerCommands.SegmentData:
                this.setResponseTimer(dataObject.id);
                const segmentPieces = this.segmentsPiecesData.get(dataObject.id);

                if (segmentPieces) {
                    const piece = new SegmentPiece(dataObject.pieceIndex,  dataObject.data);
                    segmentPieces.push(piece);

                    if (dataObject.piecesCount === segmentPieces.length) {
                        this.removeResponseTimer(dataObject.id);
                        segmentPieces.sort((a, b) => a.index - b.index);

                        const stringData: number[] = [];
                        segmentPieces.forEach((piece) => {
                            stringData.push(...piece.data);
                        });

                        this.segmentsPiecesData.delete(dataObject.id);
                        this.emit(MediaPeerEvents.DataSegmentLoaded, this, dataObject.id, Buffer.from(stringData).buffer);
                    }
                    this.emit(LoaderEvents.PieceBytesLoaded, "p2p", piece.data.length, Date.now());
                }

                break;

            case MediaPeerCommands.SegmentAbsent:
                this.removeResponseTimer(dataObject.id);
                this.segmentsPiecesData.delete(dataObject.id);
                this.segments.delete(dataObject.id);
                this.emit(MediaPeerEvents.DataSegmentAbsent, this, dataObject.id);
                break;

            case MediaPeerCommands.CancelSegmentRequest:
                // TODO: peer stop sending buffer
                break;

            default:
                break;
        }
    }

    // TODO: move to Segment?
    private getSegmentPieces(segment: SegmentInternal): SegmentPiece[] {
        const jsonBufferData = new Buffer(segment.data).toJSON().data;
        const pieces: SegmentPiece[] = [];

        if (jsonBufferData.length > this.pieceSize) {
            const initialPiecesCount = Math.floor(jsonBufferData.length / this.pieceSize);
            const hasFinalPiece = jsonBufferData.length % this.pieceSize > 0;

            for (let i = 0; i < initialPiecesCount; i++) {
                const start = i * this.pieceSize;
                const end = start + this.pieceSize;
                pieces.push(new SegmentPiece(i, jsonBufferData.slice(start, end)));
            }

            if (hasFinalPiece) {
                pieces.push(new SegmentPiece(initialPiecesCount, jsonBufferData.slice(initialPiecesCount * this.pieceSize)));
            }

        } else {
            pieces.push(new SegmentPiece(0, jsonBufferData));
        }

        return pieces;
    }

    private sendCommand(command: any): boolean {
        try {
            if (this.peer.connected) {
                this.peer.write(JSON.stringify(command));
                return true;
            }
        } catch (err) {
            this.debug("sendCommand failed", err, command);
        }

        return false;
    }

    public destroy(): void {
        if (this.peer.connected) {
            this.peer.destroy();
        }
    }

    public hasSegment(id: string): boolean {
        const segmentStatus = this.segments.get(id);
        return (segmentStatus != undefined) && (segmentStatus == SegmentStatus.Loaded);
    }

    public sendSegmentsMap(segments: string[][]) {
        this.sendCommand({"command": MediaPeerCommands.SegmentsMap, "segments": segments});
    }

    public sendSegmentData(segment: SegmentInternal): void {
        const segmentPieces = this.getSegmentPieces(segment);

        for (let i = 0; i < segmentPieces.length; i++) {
            this.sendCommand({
                "command": MediaPeerCommands.SegmentData,
                "id": segment.id,
                "data": segmentPieces[i].data,
                "pieceIndex": segmentPieces[i].index,
                "piecesCount": segmentPieces.length
            });
        }
    }

    public sendSegmentAbsent(id: string): void {
        this.sendCommand({"command": MediaPeerCommands.SegmentAbsent, "id": id});
    }

    public sendSegmentRequest(id: string): boolean {
        if (this.sendCommand({"command": MediaPeerCommands.SegmentRequest, "id": id})) {
            this.setResponseTimer(id);
            this.segmentsPiecesData.set(id, []);
            return true;
        }

        return false;
    }

    public sendCancelSegmentRequest(id: string): boolean {
        this.segmentsPiecesData.delete(id);
        return this.sendCommand({"command": MediaPeerCommands.CancelSegmentRequest, "id": id});
    }

    private setResponseTimer(id: string) {

        let timer = this.requestSegmentResponseTimers.get(id);
        if (timer) {
            clearTimeout(timer);
        }

        // TODO: check MediaPeerEvents.DataSegmentAbsent
        timer = setTimeout(() => {
                this.sendCancelSegmentRequest(id);
                this.segments.delete(id);
                this.emit(MediaPeerEvents.DataSegmentAbsent, this, id);
            },
            this.requestSegmentResponseTimeout);

        this.requestSegmentResponseTimers.set(id, timer);
    }

    private removeResponseTimer(url: string) {
        const timer = this.requestSegmentResponseTimers.get(url);
        if (timer) {
            clearTimeout(timer);
        }
    }

}
