/// <reference path="../node_modules/@types/mocha/index.d.ts" />
/// <reference path="../node_modules/typescript/lib/lib.es2015.d.ts" />
/// <reference path="../node_modules/typescript/lib/lib.dom.d.ts" />

import {SpeedApproximator} from "../lib/speed-approximator";
import * as assert from "assert";

describe("SpeedApproximator", () => {
    it("should calculate speed correctly", () => {
        const speedApp = new SpeedApproximator();
        const smoothInterval = speedApp.getSmoothInterval();
        const measureInterval = speedApp.getMeasureInterval();

        assert.equal(speedApp.getSpeed(1), 0);
        assert.equal(speedApp.getSpeed(1), 0);

        speedApp.addBytes(1, 1);
        assert.equal(speedApp.getSpeed(1), 1 / smoothInterval);

        speedApp.addBytes(1, 2);
        assert.equal(speedApp.getSpeed(2), 2 / smoothInterval);

        speedApp.addBytes(1, 3);
        assert.equal(speedApp.getSpeed(4), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(4), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(5), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(5), 3 / smoothInterval);

        speedApp.addBytes(1, smoothInterval + 3);
        assert.equal(speedApp.getSpeed(smoothInterval + 3), 3 / smoothInterval);

        assert.equal(speedApp.getSpeed(measureInterval), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + 1), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + 2), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + 3), 3 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + 4), 2 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + 5), 2 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + smoothInterval + 3), 2 / smoothInterval);
        assert.equal(speedApp.getSpeed(measureInterval + smoothInterval + 4), 0);
        assert.equal(speedApp.getSpeed(measureInterval + smoothInterval + 5), 0);
    });
});
