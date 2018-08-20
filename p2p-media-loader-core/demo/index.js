var DemoApp = (function () {

    // patching globals for compatibility
    window.p2pml = {
        core: P2pMediaLoaderCore,
        hlsjs: P2pMediaLoaderHlsjs,
        shaka: P2pMediaLoaderShaka
    };

    var P2PGraphClass = require("p2p-graph");

    function DemoApp() {
        if (!Hls.isSupported()) {
            document.querySelector("#error-hls-js").classList.remove("hide");
        }

        if (!p2pml.core.HybridLoader.isSupported()) {
            document.querySelector("#error-webrtc-data-channels").classList.remove("hide");
        }

        if (location.protocol == "https:") {
            document.querySelector("#https-only").classList.remove("hide");
        }

        this.liveSyncDurationCount = 7;

        this.initForm();

        var videoUrlForm = document.getElementById("videoUrlForm");
        this.videoUrl = videoUrlForm.url.value.trim();
        this.playerType = videoUrlForm.type.value;
        this.videoContainer = document.getElementById("video_container");

        this.loadSpeedTimespan = 10; // seconds

        this.graph = new P2PGraphClass("#graph");
        this.graph.add({ id: "me", name: "You", me: true });
        this.initChart();
        this.restartDemo();
    }

    DemoApp.prototype.initForm = function () {
        var form = document.getElementById("videoUrlForm");
        window.location.search.substr(1).split("&").forEach(function (e) {
            var p = e.split("=");
            if (p.length === 2) {
                var name = p[0];
                var value = window.decodeURIComponent(p[1]);
                switch (name) {
                    case "url":
                        form.url.value = value;
                        break;
                    case "type":
                        form.type.value = value;
                        break;
                }
            }
        });
    };

    DemoApp.prototype.restartDemo = function () {
        this.downloadStats = [];
        this.downloadTotals = { http: 0, p2p: 0 };
        this.uploadStats = [];
        this.uploadTotal = 0;

        while (this.videoContainer.hasChildNodes()) {
            this.videoContainer.removeChild(this.videoContainer.lastChild);
        }

        switch (this.playerType) {
            case "hlsjs":
                this.engine = new p2pml.hlsjs.Engine();
                this.initHlsJsPlayer();
                break;

            case "clappr":
                this.engine = new p2pml.hlsjs.Engine();
                this.initClapprPlayer();
                break;

            case "flowplayer":
                this.engine = new p2pml.hlsjs.Engine();
                this.initFlowplayerPlayer();
                break;

            case "mediaelement":
                this.engine = new p2pml.hlsjs.Engine();
                this.initMediaElementPlayer();
                break;

            case "videojs-contrib-hlsjs":
                this.engine = new p2pml.hlsjs.Engine();
                this.initVideoJsContribHlsJsPlayer();
                break;

            case "jwplayer":
                this.engine = new p2pml.hlsjs.Engine();
                this.initJwPlayer();
                break;

            case "shakaplayer":
                this.engine = new p2pml.shaka.Engine();
                this.initShakaPlayer();
                break;

            default:
                console.error('Unexpected player type: ', this.playerType);
                return;
        }

        this.engine.on(p2pml.core.Events.PieceBytesDownloaded, this.onBytesDownloaded.bind(this));
        this.engine.on(p2pml.core.Events.PieceBytesUploaded, this.onBytesUploaded.bind(this));

        var trackerAnnounce = this.engine.getSettings().loader.trackerAnnounce;
        if (Array.isArray(trackerAnnounce)) {
            document.getElementById("announce").innerHTML = trackerAnnounce.join("<br />");
        }

        this.refreshChart();
        this.refreshGraph();
    };

    DemoApp.prototype.initHlsJsPlayer = function () {
        if (Hls.isSupported()) {
            var video = document.createElement("video");
            video.id = "video";
            video.volume = 0;
            video.setAttribute("playsinline", "");
            video.setAttribute("muted", "");
            video.setAttribute("autoplay", "");
            video.setAttribute("controls", "");
            this.videoContainer.appendChild(video);

            var level = document.createElement("select");
            level.id = "level";
            level.classList.add("form-control");
            this.videoContainer.appendChild(level);

            var hls = new Hls({
                liveSyncDurationCount: this.liveSyncDurationCount,
                loader: this.engine.createLoaderClass()
            });

            p2pml.hlsjs.initHlsJsPlayer(hls);

            hls.loadSource(this.videoUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
                this.hlsLevelSwitcher.init(hls, level);
            }.bind(this));
        }
    };

    DemoApp.prototype.initClapprPlayer = function () {
        var outer = document.createElement("div");
        outer.className = "embed-responsive embed-responsive-16by9";
        var video = document.createElement("div");
        video.id = "video";
        video.className = "embed-responsive-item";
        outer.appendChild(video);
        this.videoContainer.appendChild(outer);

        var player = new Clappr.Player({
            parentId: "#video",
            plugins: {
                "core": [LevelSelector]
            },
            hlsjsConfig: {
                liveSyncDurationCount: this.liveSyncDurationCount,
                loader: this.engine.createLoaderClass()
            },
            source: this.videoUrl,
            width: "100%",
            height: "100%",
            muted: true,
            mute: true,
            autoPlay: true
        });

        p2pml.hlsjs.initClapprPlayer(player);
    };

    DemoApp.prototype.initMediaElementPlayer = function () {
        // allow only one supported renderer
        mejs.Renderers.order = [ "native_hls" ];

        var video = document.createElement("video");
        video.id = "video";
        video.volume = 0;
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        this.videoContainer.appendChild(video);

        var player = new MediaElementPlayer("video", {
            stretching: "responsive",
            startVolume: 0,
            hls: {
                liveSyncDurationCount: this.liveSyncDurationCount,
                loader: this.engine.createLoaderClass()
            },
            success: function (mediaElement) {
                p2pml.hlsjs.initMediaElementJsPlayer(mediaElement);
            }
        });

        player.setSrc(this.videoUrl);
        //player.options.forceLive = true;

        player.load();
        player.play();
    };

    DemoApp.prototype.initFlowplayerPlayer = function () {
        var video = document.createElement("div");
        video.id = "video";
        video.className = "fp-slim";
        video.volume = 0;
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        this.videoContainer.appendChild(video);

        var player = flowplayer("#video", {
            volume: 0,
            clip: {
                sources: [{
                    type: "application/x-mpegurl",
                    //live: true,
                    src: this.videoUrl
                }]
            },
            hlsjs: {
                liveSyncDurationCount: this.liveSyncDurationCount,
                loader: this.engine.createLoaderClass()
            }
        });

        p2pml.hlsjs.initFlowplayerHlsJsPlayer(player);

        player.on("ready", function () {
            player.play();
        });
    };

    DemoApp.prototype.initVideoJsContribHlsJsPlayer = function () {
        var outer = document.createElement("div");
        outer.className = "embed-responsive embed-responsive-16by9";
        var video = document.createElement("video");
        video.id = "video";
        video.preload = "none";
        video.className = "embed-responsive-item video-js vjs-default-skin";
        video.volume = 0;
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        video.setAttribute("controls", "");
        outer.appendChild(video);
        this.videoContainer.appendChild(outer);

        var player = videojs("video", {
            html5: {
                hlsjsConfig: {
                    liveSyncDurationCount: this.liveSyncDurationCount,
                    loader: this.engine.createLoaderClass()
                }
            }
        });

        p2pml.hlsjs.initVideoJsContribHlsJsPlayer(player);

        player.src({
            type: "application/x-mpegURL",
            src: this.videoUrl
        });

        player.ready(function() {
            player.volume(0);
            player.play();
        });
    };

    DemoApp.prototype.initJwPlayer = function () {
        var video = document.createElement("div");
        video.id = "video";
        video.volume = 0;
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        this.videoContainer.appendChild(video);

        var player = jwplayer("video");
        player.setup({ file: this.videoUrl, autostart: true, mute: true });

        var provider = require("@hola.org/jwplayer-hlsjs");
        provider.attach();

        p2pml.hlsjs.initJwPlayer(player, {
            liveSyncDurationCount: this.liveSyncDurationCount,
            loader: this.engine.createLoaderClass()
        });
    };

    DemoApp.prototype.initShakaPlayer = function () {
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported()) {
            var video = document.createElement("video");
            video.id = "video";
            video.volume = 0;
            video.setAttribute("playsinline", "");
            video.setAttribute("muted", "");
            video.setAttribute("autoplay", "");
            video.setAttribute("controls", "");
            this.videoContainer.appendChild(video);

            var level = document.createElement("select");
            level.id = "level";
            level.classList.add("form-control");
            this.videoContainer.appendChild(level);

            var player = new shaka.Player(video);
            this.engine.initShakaPlayer(player);
            this.shakaLevelSwitcher.init(player, level);
            player.load(this.videoUrl);
        } else {
            document.querySelector("#error-shakaplayer").classList.remove("hide");
        }
    };

    DemoApp.prototype.initChart = function (event) {
        var chartConf = {
            element: document.querySelector("#chart"),
            renderer: 'multi',
            interpolation: "basis",
            stack: false,
            min: 'auto',
            strokeWidth: 1,
            series: [
                {name: "Upload P2P", color: "#88eab9", data: [], renderer: 'area'},
                {name: " - P2P", color: "#88b9ea", data: [], renderer: 'area'},
                {name: " - HTTP", color: "#eae288", data: [], renderer: 'area'},
                {name: "Download", color: "#f64", data: [], renderer: 'line'}
            ]
        };

        this.chart = new Rickshaw.Graph(chartConf);

        new Rickshaw.Graph.Axis.X({
            graph: this.chart,
            tickFormat: function() { return ''; }
        });

        new Rickshaw.Graph.Axis.Y({
            graph: this.chart,
            orientation: 'left',
            element: document.getElementById('y_axis')
        });

        this.legend = new Rickshaw.Graph.Legend({
            graph: this.chart,
            element: document.getElementById('legend')
        });

        this.legendTotals = new Rickshaw.Graph.Legend({
            graph: this.chart,
            element: document.getElementById("legend-totals")
        });

        this.chart.render();
        setInterval(this.updateChartData.bind(this), 500);

        var chartResize = function () {
            chartConf.width = this.chart.element.clientWidth;
            this.chart.configure(chartConf);
            this.chart.render();
        }.bind(this);

        chartResize();
        window.addEventListener("resize", chartResize);
    };

    DemoApp.prototype.refreshChart = function () {
        if (!this.chart) {
            return;
        }

        var data0 = this.chart.series[0].data;
        var data1 = this.chart.series[1].data;
        var data2 = this.chart.series[2].data;
        var data3 = this.chart.series[3].data;
        var lastX = data0.length > 0 ? data0[data0.length - 1].x : -1;

        var seriesDataMapper = function(currentValue, index) {
            return {x: index + lastX + 1, y: 0};
        };

        data0.length = 0;
        data1.length = 0;
        data2.length = 0;
        data3.length = 0;

        var stubData = Array.apply(null, Array(200)).map(seriesDataMapper);
        data0.push.apply(data0, stubData.slice(0));
        data1.push.apply(data1, stubData.slice(0));
        data2.push.apply(data2, stubData.slice(0));
        data3.push.apply(data3, stubData.slice(0));

        this.chart.update();
    };

    DemoApp.prototype.updateChartData = function () {
        var downloadSpeed = this.getDownloadSpeed();
        var http = Number((downloadSpeed.http * 8 / 1000000).toFixed(2));
        var p2p = Number((downloadSpeed.p2p * 8 / 1000000).toFixed(2));
        var total = Number((http + p2p).toFixed(2));
        var upload = Number(this.getUploadSpeed() * 8 / 1000000).toFixed(2);

        var data0 = this.chart.series[0].data;
        var data1 = this.chart.series[1].data;
        var data2 = this.chart.series[2].data;
        var data3 = this.chart.series[3].data;
        var x = data0.length > 0 ? data0[data0.length - 1].x + 1 : 0;

        data0.shift();
        data1.shift();
        data2.shift();
        data3.shift();
        data0.push({x: x, y: -upload});
        data1.push({x: x, y: total});
        data2.push({x: x, y: http});
        data3.push({x: x, y: total});
        this.chart.update();

        this.formatChartLegendLine(0, total);
        this.formatChartLegendLine(1, http);
        this.formatChartLegendLine(2, p2p);
        this.formatChartLegendLine(3, upload);

        this.updateLegendTotals();
    };

    DemoApp.prototype.formatChartLegendLine = function (index, speed) {
        if (this.legend) {
            var line = this.legend.lines[index];
            line.element.childNodes[1].textContent = line.series.name + ' - ' + speed + ' Mbit/s';
        }
    };

    DemoApp.prototype.updateLegendTotals = function () {
        if (!this.legendTotals) {
            return;
        }

        var httpMb = this.downloadTotals.http / 1048576;
        var p2pMb = this.downloadTotals.p2p / 1048576;
        var totalMb = httpMb + p2pMb;
        var uploadMb = this.uploadTotal / 1048576;

        if (totalMb != 0) {
            this.legendTotals.lines[0].element.childNodes[1].textContent
                = "Download - "
                + Number(totalMb).toFixed(1) + " MiB";

            this.legendTotals.lines[1].element.childNodes[1].textContent
                = " - HTTP - "
                + Number(httpMb).toFixed(1) + " MiB - "
                + Number((httpMb * 100) / totalMb).toFixed(0) + "%";

            this.legendTotals.lines[2].element.childNodes[1].textContent
                = " - P2P - "
                + Number(p2pMb).toFixed(1) + " MiB - "
                + Number((p2pMb * 100) / totalMb).toFixed(0) + "%";

            this.legendTotals.lines[3].element.childNodes[1].textContent
                = "Upload P2P - "
                + Number(uploadMb).toFixed(1) + " MiB";
        }
    };

    DemoApp.prototype.getDownloadSpeed = function () {
        var startingPoint = performance.now() - (this.loadSpeedTimespan * 1000);
        var httpSize = 0;
        var p2pSize = 0;

        var i = this.downloadStats.length;
        while (i--) {
            var stat = this.downloadStats[i];
            if (stat.timestamp < startingPoint) {
                break;
            }

            if (stat.method === "p2p") {
                p2pSize += stat.size;
            } else if (stat.method === "http") {
                httpSize += stat.size;
            }
        }

        this.downloadStats.splice(0, i + 1);

        return {p2p: p2pSize / this.loadSpeedTimespan, http: httpSize / this.loadSpeedTimespan};
    };

    DemoApp.prototype.getUploadSpeed = function () {
        var startingPoint = performance.now() - (this.loadSpeedTimespan * 1000);
        var size = 0;

        var i = this.uploadStats.length;
        while (i--) {
            var stat = this.uploadStats[i];
            if (stat.timestamp < startingPoint) {
                break;
            }

            size += stat.size;
        }

        this.uploadStats.splice(0, i + 1);

        return size / this.loadSpeedTimespan;
    };

    DemoApp.prototype.onBytesDownloaded = function (method, size) {
        this.downloadStats.push({method: method, size: size, timestamp: performance.now()});
        this.downloadTotals[method] += size;
    };

    DemoApp.prototype.onBytesUploaded = function (method, size) {
        this.uploadStats.push({size: size, timestamp: performance.now()});
        this.uploadTotal += size;
    };

    DemoApp.prototype.refreshGraph = function (p2pLoader) {
        if (!this.graph) {
            return;
        }

        var nodes = this.graph.list();
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id !== "me") {
                this.graph.disconnect("me", nodes[i].id);
                this.graph.remove(nodes[i].id);
            }
        }

        this.engine.on(p2pml.core.Events.PeerConnect, this.onPeerConnect.bind(this));
        this.engine.on(p2pml.core.Events.PeerClose, this.onPeerClose.bind(this));
    };

    DemoApp.prototype.onPeerConnect = function (peer) {
        if (!this.graph.hasPeer(peer.id)) {
            this.graph.add({id: peer.id, name: peer.remoteAddress || 'Unknown'});
            this.graph.connect("me", peer.id);
        }
    };

    DemoApp.prototype.onPeerClose = function (id) {
        if (this.graph.hasPeer(id)) {
            this.graph.disconnect("me", id);
            this.graph.remove(id);
        }
    };

    DemoApp.prototype.hlsLevelSwitcher = {

        auto: "Auto",
        hls: undefined,
        select: undefined,

        init: function (hls, select) {
            if (hls.levelController.levels.length < 2) {
                select.style.display = "none";
                return;
            } else {
                select.style.display = "block";
            }

            this.hls = hls;
            this.select = select;

            this._clearOptions();
            this._addOption(this.auto);
            hls.levelController.levels.forEach(function (e, i) {
                var name = [];
                if (e.height) {
                    name.push(e.height + "p");
                }
                if (e.bitrate) {
                    name.push(Math.round(e.bitrate / 1000) + "k");
                }
                if (name.length === 0) {
                    name.push("Quality #" + i);
                }
                this._addOption(name.join(" / "), i);
            }.bind(this));

            hls.on(Hls.Events.LEVEL_SWITCHED, this._hlsLevelSwitch.bind(this));

            this.select.addEventListener("change", function (event) {
                hls.nextLevel = event.target.selectedIndex - 1;
                this._hlsLevelSwitch();
            }.bind(this));
        },

        _hlsLevelSwitch: function () {
            var auto = this.select.querySelector("option:not([data-index])");
            var curr = this.select.querySelector("option[data-index='" + this.hls.currentLevel + "']");
            if (this.hls.autoLevelEnabled || this.hls.currentLevel === -1) {
                auto.selected = true;
                auto.text = curr ? curr.text + " (" + this.auto + ")" : this.auto;
            } else {
                curr.selected = true;
                auto.text = this.auto;
            }
        },

        _clearOptions: function () {
            while (this.select.options.length) {
                this.select.remove(0);
            }
        },

        _addOption: function (text, index) {
            var option = document.createElement("option");
            option.text = text;
            if (index !== undefined) {
                option.dataset.index = index;
            }
            this.select.add(option);
        }

    }; // end of hlsLevelSwitcher

    DemoApp.prototype.shakaLevelSwitcher = {

        auto: "Auto",
        player: undefined,
        select: undefined,

        init: function (player, select) {
            this.player = player;
            this.select = select;

            player.addEventListener("trackschanged", () => {
                this._clearOptions();
                this._addOption(this.auto);
                this.player.getVariantTracks().forEach((e, i) => {
                    var name = [];

                    if (e.height) {
                        name.push(e.height + "p");
                    }

                    if (e.bandwidth) {
                        name.push(Math.round(e.bandwidth / 1000) + "k");
                    }

                    if (e.label) {
                        name.push(e.label);
                    } else if (e.language) {
                        name.push(e.language);
                    }

                    if (name.length === 0) {
                        name.push("Variant #" + i);
                    }

                    this._addOption(name.join(" / "), e.id);
                });
            });

            player.addEventListener("adaptation", () => {
                var variantId = this.player.getVariantTracks().find(i => i.active === true).id;
                var curr = this.select.querySelector("option[data-variant-id='" + variantId + "']");
                var auto = this.select.querySelector("option:not([data-variant-id])");
                auto.text = curr ? curr.text + " (" + this.auto + ")" : this.auto;
            });

            select.addEventListener("change", () => {
                var variantId = this.select.selectedOptions[ 0 ].dataset.variantId;
                if (variantId) {
                    var variant = this.player.getVariantTracks().find(i => i.id == variantId);
                    this.player.configure({ abr: { enabled: false } });
                    this.player.selectVariantTrack(variant);
                    var auto = this.select.querySelector("option:not([data-variant-id])");
                    auto.text = this.auto;
                } else {
                    this.player.configure({ abr: { enabled: true } });
                }
            });
        },

        _clearOptions: function () {
            while (this.select.options.length) {
                this.select.remove(0);
            }
        },

        _addOption: function (text, variantId) {
            var option = document.createElement("option");
            option.text = text;
            if (variantId) {
                option.dataset.variantId = variantId;
            }
            this.select.add(option);
        }

    }; // end of shakaLevelSwitcher

    return DemoApp;
}());

var demo = new DemoApp();