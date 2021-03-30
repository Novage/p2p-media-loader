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

import { EventEmitter } from "events";
import { Events, LoaderInterface, HybridLoader, HybridLoaderSettings } from "p2p-media-loader-core";
import { SegmentManager, SegmentManagerSettings } from "./segment-manager";
import * as integration from "./integration";

export interface ShakaEngineSettings {
    loader: Partial<HybridLoaderSettings>;
    segments: Partial<SegmentManagerSettings>;
}

export class Engine extends EventEmitter {

    public static isSupported(): boolean {
        return HybridLoader.isSupported();
    }

    private readonly loader: LoaderInterface;
    private readonly segmentManager: SegmentManager;

    public constructor(settings: Partial<ShakaEngineSettings> = {}) {
        super();

        this.loader = new HybridLoader(settings.loader);
        this.segmentManager = new SegmentManager(this.loader, settings.segments);

        Object.keys(Events)
            .map(eventKey => Events[eventKey as keyof typeof Events])
            .forEach(event => this.loader.on(event, (...args: unknown[]) => this.emit(event, ...args)));
    }

    public async destroy(): Promise<void> {
        await this.segmentManager.destroy();
    }

    public getSettings(): {
        segments: SegmentManagerSettings;
        loader: unknown;
    } {
        return {
            segments: this.segmentManager.getSettings(),
            loader: this.loader.getSettings()
        };
    }

    public getDetails(): { loader: unknown; } {
        return {
            loader: this.loader.getDetails()
        };
    }

    public initShakaPlayer(player: shaka.Player): void {
        integration.initShakaPlayer(player, this.segmentManager);
    }

}

export interface Asset {
    masterSwarmId: string;
    masterManifestUri: string;
    requestUri: string;
    requestRange?: string;
    responseUri: string;
    data: ArrayBuffer;
}

export interface AssetsStorage {
    storeAsset(asset: Asset): Promise<void>;
    getAsset(requestUri: string, requestRange: string | undefined, masterSwarmId: string): Promise<Asset | undefined>;
    destroy(): Promise<void>;
}
