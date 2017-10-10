import {EventEmitter} from "events";
import {LoaderEvents} from "./loader-interface";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";
let Buffer = require('buffer').Buffer;

enum MediaPeerCommands {
    SegmentData = "segment_data",
    SegmentAbsent = "segment_absent",
    SegmentsMap = "segments_map",
    SegmentRequest = "segment_request",
    CancelSegmentRequest = "cancel_segment_request",
}

export enum MediaPeerEvents {
    Connect = "peer_connect",
    Close = "peer_close",
    Error = "peer_error",
    SegmentsMap = "peer_segments_map",
    SegmentRequest = "peer_segment_request",
    SegmentLoaded = "peer_segment_loaded",
    SegmentAbsent = "peer_segment_absent",
    SegmentError = "peer_segment_error"
}

export enum MediaPeerSegmentStatus {
    Loaded = "loaded",
    LoadingByHttp = "loading_by_http"
}

class DownloadingSegment {
    public bytesDownloaded = 0;
    public pieces: ArrayBuffer[] = [];
    constructor(readonly id: string, readonly size: number) {}
}

const MAX_MESSAGE_SIZE = 16 * 1024;

export class MediaPeer extends EventEmitter {

    public id: string;
    public remoteAddress: string;
    private peer: any;
    private downloadingSegment: DownloadingSegment | null = null;
    private segmentsForDownload: Set<string> = new Set();
    private segmentsMap: Map<string, MediaPeerSegmentStatus> = new Map();
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

    private onPeerData(data: ArrayBuffer): void {
        const bytes = new Uint8Array(data);
        let command: any = null;

        // JSON string check by first, second and last characters: '{" .... }'
        if (bytes[0] == 123 && bytes[1] == 34 && bytes[data.byteLength - 1] == 125) {
            try {
                command = JSON.parse(new TextDecoder("utf-8").decode(data));
            } catch {
            }
        }

        if (command == null) {
            if (!this.downloadingSegment) {
                // The segment was not requested or canceled
                return;
            }

            this.downloadingSegment.bytesDownloaded += data.byteLength;
            this.downloadingSegment.pieces.push(data);
            this.emit(LoaderEvents.PieceBytesLoaded, "p2p", data.byteLength, Date.now());

            if (this.downloadingSegment.bytesDownloaded == this.downloadingSegment.size) {
                const segmentData = new Uint8Array(this.downloadingSegment.size);
                let offset = 0;
                for (const piece of this.downloadingSegment.pieces) {
                    segmentData.set(new Uint8Array(piece), offset);
                    offset += piece.byteLength;
                }

                this.emit(MediaPeerEvents.SegmentLoaded, this, this.downloadingSegment.id, segmentData.buffer);
                this.downloadingSegment = null;
            } else if (this.downloadingSegment.bytesDownloaded > this.downloadingSegment.size) {
                this.emit(MediaPeerEvents.SegmentError, this, this.downloadingSegment.id, "Too many bytes received for segment");
                this.downloadingSegment = null;
            }

            return;
        }

        if (this.downloadingSegment) {
            this.emit(MediaPeerEvents.SegmentError, this, this.downloadingSegment.id, "Segment download interrupted by a command");
            this.downloadingSegment = null;
            return;
        }

        switch (command.command) {

            case MediaPeerCommands.SegmentsMap:
                this.segmentsMap = new Map(command.segments);
                this.emit(MediaPeerEvents.SegmentsMap);
                break;

            case MediaPeerCommands.SegmentRequest:
                this.emit(MediaPeerEvents.SegmentRequest, this, command.segment_id);
                break;

            case MediaPeerCommands.SegmentData:
                if (this.segmentsForDownload.has(command.segment_id)) {
                    this.downloadingSegment = new DownloadingSegment(command.segment_id, command.segment_size);
                    this.segmentsForDownload.delete(command.segment_id);
                }
                break;

            case MediaPeerCommands.SegmentAbsent:
                this.segmentsForDownload.delete(command.segment_id);
                this.segmentsMap.delete(command.segment_id);
                this.emit(MediaPeerEvents.SegmentAbsent, this, command.segment_id);
                break;

            case MediaPeerCommands.CancelSegmentRequest:
                // TODO: peer stop sending buffer
                break;

            default:
                break;
        }
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

    public getSegmentsMap(): Map<string, MediaPeerSegmentStatus> {
        return this.segmentsMap;
    }

    public sendSegmentsMap(segments: string[][]): void {
        this.sendCommand({"command": MediaPeerCommands.SegmentsMap, "segments": segments});
    }

    public sendSegmentData(segment: SegmentInternal): void {
        this.sendCommand({
            "command": MediaPeerCommands.SegmentData,
            "segment_id": segment.id,
            "segment_size": segment.data.byteLength
        });

        let bytesLeft = segment.data.byteLength;
        while (bytesLeft > 0) {
            const bytesToSend = (bytesLeft >= MAX_MESSAGE_SIZE ? MAX_MESSAGE_SIZE : bytesLeft);
            // Using Buffer.from because TypedArrays as input to this function cause memory copying
            this.peer.write(Buffer.from(segment.data, segment.data.byteLength - bytesLeft, bytesToSend));
            bytesLeft -= bytesToSend;
        }
    }

    public sendSegmentAbsent(segmentId: string): void {
        this.sendCommand({"command": MediaPeerCommands.SegmentAbsent, "segment_id": segmentId});
    }

    public requestSegment(segmentId: string): boolean {
        if (this.sendCommand({"command": MediaPeerCommands.SegmentRequest, "segment_id": segmentId})) {
            this.segmentsForDownload.add(segmentId);
            return true;
        }

        return false;
    }

    public cancelSegmentRequest(segmentId: string): boolean {
        this.segmentsForDownload.delete(segmentId);
        if (this.downloadingSegment && this.downloadingSegment.id == segmentId) {
            this.downloadingSegment = null;
        }
        return this.sendCommand({"command": MediaPeerCommands.CancelSegmentRequest, "segment_id": segmentId});
    }

}
