/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const SMOOTH_INTERVAL = 4 * 1000;
const MEASURE_INTERVAL = 60 * 1000;

class NumberWithTime {
    constructor (readonly value: number, readonly timeStamp: number) {}
}

export class SpeedApproximator {
    private lastBytes: NumberWithTime[] = [];
    private currentBytesSum = 0;
    private lastSpeed: NumberWithTime[] = [];

    public addBytes(bytes: number, timeStamp: number): void {
        this.lastBytes.push(new NumberWithTime(bytes, timeStamp));
        this.currentBytesSum += bytes;

        while (timeStamp - this.lastBytes[0].timeStamp > SMOOTH_INTERVAL) {
            this.currentBytesSum -= this.lastBytes.shift()!.value;
        }

        this.lastSpeed.push(new NumberWithTime(this.currentBytesSum / SMOOTH_INTERVAL, timeStamp));
    }

    // in bytes per millisecond
    public getSpeed(timeStamp: number): number {
        while (this.lastSpeed.length != 0 && timeStamp - this.lastSpeed[0].timeStamp > MEASURE_INTERVAL) {
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
