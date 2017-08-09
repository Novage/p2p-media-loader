import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const getHlsJsLoaderMaker = require("./hlsjs-loader-maker");

export {HybridLoader} from "p2p-media-loader-core";

export function getLoader() {
    const hybridLoader = new HybridLoader();
    const chunkManager = new ChunkManager(hybridLoader);
    return getHlsJsLoaderMaker(HlsJsLoader, chunkManager);
}

export {default as ChunkManager} from "./chunk-manager";
