function createHlsJsLoaderClass(HlsJsLoader, segmentManager) {
	if (!segmentManager.isSupported()) {
		return Hls.DefaultConfig.loader;
	}

    function HlsJsLoaderClass(settings) {
        this.impl = new HlsJsLoader(segmentManager, settings);
        this.stats = this.impl.stats;
    }

    HlsJsLoaderClass.prototype.load = function (context, config, callbacks) {
        this.context = context;
        this.impl.load(context, config, callbacks);
    };

    HlsJsLoaderClass.prototype.abort = function () {
        this.impl.abort(this.context);
    };

    HlsJsLoaderClass.prototype.destroy = function () {
        if (this.context) {
            this.impl.abort(this.context);
        }
    };

    HlsJsLoaderClass.getSegmentManager = function () {
        return segmentManager;
    };

    return HlsJsLoaderClass;
}

module.exports.createHlsJsLoaderClass = createHlsJsLoaderClass;
