function createHlsJsLoaderClass(HlsJsLoader, segmentManager) {
    function HlsJsLoaderClass(settings) {
        this.impl = new HlsJsLoader(segmentManager, settings);
        this.stats = this.impl.stats;
    }

    HlsJsLoaderClass.prototype.load = function (context, config, callbacks) {
        return this.impl.load(context, config, callbacks);
    };

    HlsJsLoaderClass.prototype.abort = function () {
        return this.impl.abort();
    };

    HlsJsLoaderClass.prototype.destroy = function () {
        return this.impl.destroy();
    };

    HlsJsLoaderClass.getSegmentManager = function () {
        return segmentManager;
    };

    return HlsJsLoaderClass;
}

module.exports.createHlsJsLoaderClass = createHlsJsLoaderClass;
