function getHlsJsLoaderMaker(HlsJsLoader, chunkManager) {
    function HlsJsLoaderMaker(settings) {
        this.impl = new HlsJsLoader(chunkManager, settings);
        this.stats = this.impl.stats;
    }

    HlsJsLoaderMaker.prototype.load = function (context, config, callbacks) {
        return this.impl.load(context, config, callbacks);
    };

    HlsJsLoaderMaker.prototype.abort = function () {
        return this.impl.abort();
    };

    HlsJsLoaderMaker.prototype.destroy = function () {
        return this.impl.destroy();
    };

    HlsJsLoaderMaker.getChunkManager = function () {
        return chunkManager;
    };

    return HlsJsLoaderMaker;
}

module.exports = getHlsJsLoaderMaker;
