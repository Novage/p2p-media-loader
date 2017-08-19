import Segment from "./segment";
import {EventEmitter} from "events";
import MediaPeerCommands from "./media-peer-commands";
import Timer = NodeJS.Timer;
import MediaPeerEvents from "./media-peer-events";
import LoaderEvents from "./loader-events";
import * as Debug from "debug";

class SegmentPiece {

    constructor(readonly index: number, readonly data: Array<number>) {
    }

}

export default class MediaPeer extends EventEmitter {

    public id: string;
    private peer: any;
    private segmentsPiecesData: Map<string, Array<SegmentPiece>> = new Map();
    private segments: Set<string> = new Set();
    private pieceSize = 4 * 1024;
    private requestSegmentResponseTimeout = 3000;
    private requestSegmentResponseTimers: Map<string, Timer> = new Map();
    private debug = Debug("p2pml:media-peer");

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
        const dataString = new TextDecoder("utf-8").decode(data);
        let dataObject;
        try {
            dataObject = JSON.parse(dataString);
        } catch (err) {
            this.debug(err);
            return;
        }

        switch (dataObject.command) {

            case MediaPeerCommands.SegmentsMap:
                this.segments = new Set(dataObject.segments);
                this.emit(MediaPeerEvents.DataSegmentsMap);
                break;

            case MediaPeerCommands.SegmentRequest:
                this.emit(MediaPeerEvents.DataSegmentRequest, this, dataObject.url);
                break;

            case MediaPeerCommands.SegmentData:
                this.setResponseTimer(dataObject.url);
                const segmentPieces = this.segmentsPiecesData.get(dataObject.url);

                if (segmentPieces) {
                    const piece = new SegmentPiece(dataObject.pieceIndex,  dataObject.data);
                    segmentPieces.push(piece);

                    if (dataObject.piecesCount === segmentPieces.length) {
                        this.removeResponseTimer(dataObject.url);
                        segmentPieces.sort((a, b) => a.index - b.index);

                        const stringData = new Array<number>();
                        segmentPieces.forEach((piece) => {
                            stringData.push(...piece.data);
                        });

                        const segment = new Segment(dataObject.url);
                        segment.data = Buffer.from(stringData).buffer;

                        this.segmentsPiecesData.delete(segment.url);
                        this.emit(MediaPeerEvents.DataSegmentLoaded, this, segment);
                    }
                    this.emit(LoaderEvents.PieceBytesLoaded, {"method": "p2p", "size": piece.data.length, timestamp: Date.now()});
                }

                break;

            case MediaPeerCommands.SegmentAbsent:
                this.removeResponseTimer(dataObject.url);
                this.segmentsPiecesData.delete(dataObject.url);
                this.segments.delete(dataObject.url);
                this.emit(MediaPeerEvents.DataSegmentAbsent, this, dataObject.url);
                break;

            case MediaPeerCommands.CancelSegmentRequest:
                // TODO: peer stop sending buffer
                break;

            default:
                break;
        }
    }

    // TODO: move to Segment?
    private getSegmentPieces(segment: Segment): Array<SegmentPiece> {
        const jsonBufferData = new Buffer(segment.data).toJSON().data;
        const pieces = new Array<SegmentPiece>();

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

    public hasSegment(url: string): boolean {
        return this.segments.has(url);
    }

    public sendSegmentsMap(segments: Array<string>) {
        this.sendCommand({"command": MediaPeerCommands.SegmentsMap, "segments": segments});
    }

    public sendSegmentData(segment: Segment): void {
        const segmentPieces = this.getSegmentPieces(segment);

        for (let i = 0; i < segmentPieces.length; i++) {
            this.sendCommand(
                {
                    "command": MediaPeerCommands.SegmentData,
                    "url": segment.url,
                    "data": segmentPieces[i].data,
                    "pieceIndex": segmentPieces[i].index,
                    "piecesCount": segmentPieces.length
                });
        }
    }

    public sendSegmentAbsent(url: string): void {
        this.sendCommand({"command": MediaPeerCommands.SegmentAbsent, "url": url});
    }

    public sendSegmentRequest(url: string): boolean {
        if (this.sendCommand({"command": MediaPeerCommands.SegmentRequest, "url": url})) {
            this.setResponseTimer(url);
            this.segmentsPiecesData.set(url, new Array<SegmentPiece>());
            return true;
        }

        return false;
    }

    public sendCancelSegmentRequest(url: string): boolean {
        return this.sendCommand({"command": MediaPeerCommands.CancelSegmentRequest, "url": url});
    }

    private setResponseTimer(url: string) {

        let timer = this.requestSegmentResponseTimers.get(url);
        if (timer) {
            clearTimeout(timer);
        }

        timer = setTimeout(() => {
                this.sendCancelSegmentRequest(url);
                this.segments.delete(url);
                this.emit(MediaPeerEvents.DataSegmentAbsent, this, url);
            },
            this.requestSegmentResponseTimeout);

        this.requestSegmentResponseTimers.set(url, timer);
    }

    private removeResponseTimer(url: string) {
        const timer = this.requestSegmentResponseTimers.get(url);
        if (timer) {
            clearTimeout(timer);
        }
    }

}
