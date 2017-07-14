function getHlsJsLoaderMaker(HlsJsLoader, p2pml) {
    return (function () {
        function HlsJsLoaderMaker(settings) {
            this.impl = new HlsJsLoader(p2pml, settings);
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

        return HlsJsLoaderMaker;
    })();
}

module.exports = getHlsJsLoaderMaker;
