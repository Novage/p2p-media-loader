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

/// <reference path="../lib/declarations.d.ts" />
/// <reference types="mocha" />

import { BandwidthApproximator } from "../lib/bandwidth-approximator";
import * as assert from "assert";

describe("SpeedApproximator", () => {
    it("should calculate bandwidth correctly", () => {
        const bandwidthApp = new BandwidthApproximator();
        const smoothInterval = bandwidthApp.getSmoothInterval();
        const measureInterval = bandwidthApp.getMeasureInterval();

        assert.equal(bandwidthApp.getBandwidth(1), 0);
        assert.equal(bandwidthApp.getBandwidth(1), 0);

        bandwidthApp.addBytes(1, 1);
        assert.equal(bandwidthApp.getBandwidth(1), 1 / smoothInterval);

        bandwidthApp.addBytes(1, 2);
        assert.equal(bandwidthApp.getBandwidth(2), 2 / smoothInterval);

        bandwidthApp.addBytes(1, 3);
        assert.equal(bandwidthApp.getBandwidth(4), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(4), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(5), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(5), 3 / smoothInterval);

        bandwidthApp.addBytes(1, smoothInterval + 3);
        assert.equal(bandwidthApp.getBandwidth(smoothInterval + 3), 3 / smoothInterval);

        assert.equal(bandwidthApp.getBandwidth(measureInterval), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + 1), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + 2), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + 3), 3 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + 4), 2 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + 5), 2 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + smoothInterval + 3), 2 / smoothInterval);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + smoothInterval + 4), 0);
        assert.equal(bandwidthApp.getBandwidth(measureInterval + smoothInterval + 5), 0);
    });
});
