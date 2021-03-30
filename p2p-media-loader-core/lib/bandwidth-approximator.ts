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

const SMOOTH_INTERVAL = 15 * 1000;
const MEASURE_INTERVAL = 60 * 1000;

class NumberWithTime {
    constructor(readonly value: number, readonly timeStamp: number) {}
}

export class BandwidthApproximator {
    private lastBytes: NumberWithTime[] = [];
    private currentBytesSum = 0;
    private lastBandwidth: NumberWithTime[] = [];

    public addBytes = (bytes: number, timeStamp: number): void => {
        this.lastBytes.push(new NumberWithTime(bytes, timeStamp));
        this.currentBytesSum += bytes;

        while (timeStamp - this.lastBytes[0].timeStamp > SMOOTH_INTERVAL) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.currentBytesSum -= this.lastBytes.shift()!.value;
        }

        const interval = Math.min(SMOOTH_INTERVAL, timeStamp);
        this.lastBandwidth.push(new NumberWithTime(this.currentBytesSum / interval, timeStamp));
    }

    // in bytes per millisecond
    public getBandwidth = (timeStamp: number): number => {
        while (this.lastBandwidth.length !== 0 && timeStamp - this.lastBandwidth[0].timeStamp > MEASURE_INTERVAL) {
            this.lastBandwidth.shift();
        }

        let maxBandwidth = 0;
        for (const bandwidth of this.lastBandwidth) {
            if (bandwidth.value > maxBandwidth) {
                maxBandwidth = bandwidth.value;
            }
        }

        return maxBandwidth;
    }

    public getSmoothInterval = (): number => {
        return SMOOTH_INTERVAL;
    }

    public getMeasureInterval = (): number => {
        return MEASURE_INTERVAL;
    }
}
