import {EventEmitter} from "events";
import {LoaderEvents} from "./loader-interface";
import * as Debug from "debug";
import {Buffer} from "buffer";

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
    SegmentError = "peer_segment_error",
    SegmentTimeout = "peer_segment_timeout"
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

export class MediaPeer extends EventEmitter {

    public id: string;
    public remoteAddress: string;
    private downloadingSegmentId: string | null = null;
    private downloadingSegment: DownloadingSegment | null = null;
    private segmentsMap: Map<string, MediaPeerSegmentStatus> = new Map();
    private debug = Debug("p2pml:media-peer");
    private timer: number | null = null;

    constructor(readonly peer: any,
            readonly settings: {
                p2pSegmentDownloadTimeout: number,
                webRtcMaxMessageSize: number
            }) {
        super();

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
        this.terminateSegmentRequest();
        this.emit(MediaPeerEvents.Close, this);
    }

    private onPeerError(error: any): void {
        this.emit(MediaPeerEvents.Error, this, error);
    }

    private receiveSegmentPiece(data: ArrayBuffer): void {
        if (!this.downloadingSegment) {
            // The segment was not requested or canceled
            return;
        }

        this.downloadingSegment.bytesDownloaded += data.byteLength;
        this.downloadingSegment.pieces.push(data);
        this.emit(LoaderEvents.PieceBytesDownloaded, "p2p", data.byteLength);

        const segmentId = this.downloadingSegment.id;

        if (this.downloadingSegment.bytesDownloaded == this.downloadingSegment.size) {
            const segmentData = new Uint8Array(this.downloadingSegment.size);
            let offset = 0;
            for (const piece of this.downloadingSegment.pieces) {
                segmentData.set(new Uint8Array(piece), offset);
                offset += piece.byteLength;
            }

            this.terminateSegmentRequest();
            this.emit(MediaPeerEvents.SegmentLoaded, this, segmentId, segmentData.buffer);
        } else if (this.downloadingSegment.bytesDownloaded > this.downloadingSegment.size) {
            this.terminateSegmentRequest();
            this.emit(MediaPeerEvents.SegmentError, this, segmentId, "Too many bytes received for segment");
        }
    }

    private getJsonCommand(data: ArrayBuffer): any {
        const bytes = new Uint8Array(data);

        // Serialized JSON string check by first, second and last characters: '{" .... }'
        if (bytes[0] == 123 && bytes[1] == 34 && bytes[data.byteLength - 1] == 125) {
            try {
                return JSON.parse(new TextDecoder("utf-8").decode(data));
            } catch {
            }
        }

        return null;
    }

    private onPeerData(data: ArrayBuffer): void {
        const command = this.getJsonCommand(data);

        if (command == null) {
            this.receiveSegmentPiece(data);
            return;
        }

        if (this.downloadingSegment) {
            const segmentId = this.downloadingSegment.id;
            this.terminateSegmentRequest();
            this.emit(MediaPeerEvents.SegmentError, this, segmentId, "Segment download is interrupted by a command");
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
                if (this.downloadingSegmentId === command.segment_id) {
                    this.downloadingSegment = new DownloadingSegment(command.segment_id, command.segment_size);
                    this.cancelResponseTimeoutTimer();
                }
                break;

            case MediaPeerCommands.SegmentAbsent:
                if (this.downloadingSegmentId === command.segment_id) {
                    this.terminateSegmentRequest();
                    this.segmentsMap.delete(command.segment_id);
                    this.emit(MediaPeerEvents.SegmentAbsent, this, command.segment_id);
                }
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
        this.terminateSegmentRequest();
        this.peer.destroy();
    }

    public getDownloadingSegmentId(): string | null {
        return this.downloadingSegmentId;
    }

    public getSegmentsMap(): Map<string, MediaPeerSegmentStatus> {
        return this.segmentsMap;
    }

    public sendSegmentsMap(segments: string[][]): void {
        this.sendCommand({"command": MediaPeerCommands.SegmentsMap, "segments": segments});
    }

    public sendSegmentData(segmentId: string, data: ArrayBuffer): void {
        this.sendCommand({
            "command": MediaPeerCommands.SegmentData,
            "segment_id": segmentId,
            "segment_size": data.byteLength
        });

        let bytesLeft = data.byteLength;
        while (bytesLeft > 0) {
            const bytesToSend = (bytesLeft >= this.settings.webRtcMaxMessageSize ? this.settings.webRtcMaxMessageSize : bytesLeft);
            // Using Buffer.from because TypedArrays as input to this function cause memory copying
            this.peer.write(Buffer.from(data, data.byteLength - bytesLeft, bytesToSend));
            bytesLeft -= bytesToSend;
        }

        this.emit(LoaderEvents.PieceBytesUploaded, "p2p", data.byteLength);
    }

    public sendSegmentAbsent(segmentId: string): void {
        this.sendCommand({"command": MediaPeerCommands.SegmentAbsent, "segment_id": segmentId});
    }

    public requestSegment(segmentId: string): boolean {
        if (this.downloadingSegmentId) {
            throw new Error("A segment is already downloading: " + this.downloadingSegmentId);
        }

        if (this.sendCommand({"command": MediaPeerCommands.SegmentRequest, "segment_id": segmentId})) {
            this.downloadingSegmentId = segmentId;
            this.runResponseTimeoutTimer();
            return true;
        }

        return false;
    }

    public cancelSegmentRequest(): void {
        if (this.downloadingSegmentId) {
            const segmentId = this.downloadingSegmentId;
            this.terminateSegmentRequest();
            this.sendCommand({"command": MediaPeerCommands.CancelSegmentRequest, "segment_id": segmentId});
        }
    }

    private runResponseTimeoutTimer(): void {
        this.timer = window.setTimeout(() => {
            this.timer = null;
            if (!this.downloadingSegmentId) {
                return;
            }
            const segmentId = this.downloadingSegmentId;
            this.cancelSegmentRequest();
            this.emit(MediaPeerEvents.SegmentTimeout, this, segmentId); // TODO: send peer not responding event
        }, this.settings.p2pSegmentDownloadTimeout);
    }

    private cancelResponseTimeoutTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private terminateSegmentRequest() {
        this.downloadingSegmentId = null;
        this.downloadingSegment = null;
        this.cancelResponseTimeoutTimer();
    }

}
