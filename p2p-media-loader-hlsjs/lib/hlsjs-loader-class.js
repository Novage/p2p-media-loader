function createHlsJsLoaderClass(HlsJsLoader, engine) {
    function HlsJsLoaderClass() {
        this.impl = new HlsJsLoader(engine.segmentManager);
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

    HlsJsLoaderClass.getEngine = function () {
        return engine;
    };

    return HlsJsLoaderClass;
}

module.exports.createHlsJsLoaderClass = createHlsJsLoaderClass;
