const SMOOTH_INTERVAL = 5 * 1000;
const MEASURE_INTERVAL = 60 * 1000;

class NumberWithTime {
    constructor (readonly value: number, readonly timePoint: number) {}
}

export class SpeedApproximator {
    private lastBytes: NumberWithTime[] = [];
    private currentBytesSum = 0;
    private lastSpeed: NumberWithTime[] = [];

    public addBytes(bytes: number, timeStamp: number): void {
        this.lastBytes.push(new NumberWithTime(bytes, timeStamp));
        this.currentBytesSum += bytes;

        while (timeStamp - this.lastBytes[0].timePoint > SMOOTH_INTERVAL) {
            this.currentBytesSum -= this.lastBytes.shift()!.value;
        }

        this.lastSpeed.push(new NumberWithTime(this.currentBytesSum / SMOOTH_INTERVAL, timeStamp));
    }

    // in bytes/ms
    public getSpeed(timeStamp: number): number {
        while (this.lastSpeed.length != 0 && timeStamp - this.lastSpeed[0].timePoint > MEASURE_INTERVAL) {
            this.lastSpeed.shift();
        }

        let maxSpeed = 0;
        for (const speed of this.lastSpeed) {
            if (speed.value > maxSpeed) {
                maxSpeed = speed.value;
            }
        }

        return maxSpeed;
    }

    public getSmoothInterval(): number {
        return SMOOTH_INTERVAL;
    }

    public getMeasureInterval(): number {
        return MEASURE_INTERVAL;
    }
}
