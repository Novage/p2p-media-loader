"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
this.p2pml = this.p2pml || {};
this.p2pml.hlsjs = (function (exports) {
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    //#region \0rolldown/runtime.js
    var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __commonJSMin = function (cb, mod) { return function () { return (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports); }; };
    var __exportAll = function (all, no_symbols) {
        var target = {};
        for (var name in all)
            __defProp(target, name, {
                get: all[name],
                enumerable: true
            });
        if (!no_symbols)
            __defProp(target, Symbol.toStringTag, { value: "Module" });
        return target;
    };
    var __copyProps = function (to, from, except, desc) {
        if (from && typeof from === "object" || typeof from === "function")
            for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
                key = keys[i];
                if (!__hasOwnProp.call(to, key) && key !== except)
                    __defProp(to, key, {
                        get: (function (k) { return from[k]; }).bind(null, key),
                        enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
                    });
            }
        return to;
    };
    var __toESM = function (mod, isNodeMode, target) { return (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
        value: mod,
        enumerable: true
    }) : target, mod)); };
    //#endregion
    //#region src/utils.ts
    function getSegmentRuntimeId(segmentRequestUrl, byteRange) {
        if (!byteRange)
            return segmentRequestUrl;
        return "".concat(segmentRequestUrl, "|").concat(byteRange.start, "-").concat(byteRange.end);
    }
    function getByteRange(rangeStart, rangeEnd) {
        if (rangeStart !== void 0 && rangeEnd !== void 0 && rangeStart <= rangeEnd)
            return {
                start: rangeStart,
                end: rangeEnd
            };
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/typeof.js
    function _typeof(o) {
        "@babel/helpers - typeof";
        return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {
            return typeof o;
        } : function (o) {
            return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
        }, _typeof(o);
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/toPrimitive.js
    function toPrimitive(t, r) {
        if ("object" != _typeof(t) || !t)
            return t;
        var e = t[Symbol.toPrimitive];
        if (void 0 !== e) {
            var i = e.call(t, r || "default");
            if ("object" != _typeof(i))
                return i;
            throw new TypeError("@@toPrimitive must return a primitive value.");
        }
        return ("string" === r ? String : Number)(t);
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/toPropertyKey.js
    function toPropertyKey(t) {
        var i = toPrimitive(t, "string");
        return "symbol" == _typeof(i) ? i : i + "";
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/defineProperty.js
    function _defineProperty(e, r, t) {
        return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
            value: t,
            enumerable: !0,
            configurable: !0,
            writable: !0
        }) : e[r] = t, e;
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/types.ts
    /**
    * Represents an error that can occur during the request process, with a timestamp for when the error occurred.
    * @template T - The specific type of request error.
    */
    var RequestError = /** @class */ (function (_super) {
        __extends(RequestError, _super);
        /**
        * Constructs a new RequestError.
        * @param type - The specific error type.
        * @param message - Optional message describing the error.
        */
        function RequestError(type, message) {
            var _this_1 = _super.call(this, message) || this;
            _defineProperty(_this_1, "type", void 0);
            _defineProperty(_this_1, 
            /** Error timestamp. */
            "timestamp", void 0);
            _this_1.type = type;
            _this_1.timestamp = performance.now();
            return _this_1;
        }
        return RequestError;
    }(Error));
    /** Custom error class for errors that occur during core network requests. */
    var CoreRequestError = /** @class */ (function (_super) {
        __extends(CoreRequestError, _super);
        /**
        * Constructs a new CoreRequestError.
        * @param type - The type of the error, either 'failed' or 'aborted'.
        */
        function CoreRequestError(type) {
            var _this_1 = _super.call(this) || this;
            _defineProperty(_this_1, "type", void 0);
            _this_1.type = type;
            return _this_1;
        }
        return CoreRequestError;
    }(Error));
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/checkPrivateRedeclaration.js
    function _checkPrivateRedeclaration(e, t) {
        if (t.has(e))
            throw new TypeError("Cannot initialize the same private elements twice on an object");
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldInitSpec.js
    function _classPrivateFieldInitSpec(e, t, a) {
        _checkPrivateRedeclaration(e, t), t.set(e, a);
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/assertClassBrand.js
    function _assertClassBrand(e, t, n) {
        if ("function" == typeof e ? e === t : e.has(t))
            return arguments.length < 3 ? t : n;
        throw new TypeError("Private element is not present on this object");
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldGet2.js
    function _classPrivateFieldGet2(s, a) {
        return s.get(_assertClassBrand(s, a));
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/abort-controller.ts
    var _listeners = /* @__PURE__ */ new WeakMap();
    var AbortSignalPolyfill = /** @class */ (function () {
        function AbortSignalPolyfill() {
            _defineProperty(this, "aborted", false);
            _classPrivateFieldInitSpec(this, _listeners, /* @__PURE__ */ new Set());
        }
        AbortSignalPolyfill.prototype.addEventListener = function (_type, listener) {
            _classPrivateFieldGet2(_listeners, this).add(listener);
        };
        AbortSignalPolyfill.prototype.removeEventListener = function (_type, listener) {
            _classPrivateFieldGet2(_listeners, this).delete(listener);
        };
        AbortSignalPolyfill.prototype.dispatchEvent = function (_type) {
            var e_1, _a;
            this.aborted = true;
            try {
                for (var _b = __values(_classPrivateFieldGet2(_listeners, this)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var listener = _c.value;
                    try {
                        listener();
                    }
                    catch (_unused) { }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            _classPrivateFieldGet2(_listeners, this).clear();
        };
        return AbortSignalPolyfill;
    }());
    var AbortControllerPolyfill = /** @class */ (function () {
        function AbortControllerPolyfill() {
            _defineProperty(this, "signal", new AbortSignalPolyfill());
        }
        AbortControllerPolyfill.prototype.abort = function () {
            this.signal.dispatchEvent("abort");
        };
        return AbortControllerPolyfill;
    }());
    var isAbortControllerSupported = typeof AbortController !== "undefined";
    var SafeAbortController = isAbortControllerSupported ? AbortController : AbortControllerPolyfill;
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/objectSpread2.js
    function ownKeys(e, r) {
        var t = Object.keys(e);
        if (Object.getOwnPropertySymbols) {
            var o = Object.getOwnPropertySymbols(e);
            r && (o = o.filter(function (r) {
                return Object.getOwnPropertyDescriptor(e, r).enumerable;
            })), t.push.apply(t, o);
        }
        return t;
    }
    function _objectSpread2(e) {
        for (var r = 1; r < arguments.length; r++) {
            var t = null != arguments[r] ? arguments[r] : {};
            r % 2 ? ownKeys(Object(t), !0).forEach(function (r) {
                _defineProperty(e, r, t[r]);
            }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) {
                Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
            });
        }
        return e;
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/asyncToGenerator.js
    function asyncGeneratorStep(n, t, e, r, o, a, c) {
        try {
            var i = n[a](c), u = i.value;
        }
        catch (n) {
            e(n);
            return;
        }
        i.done ? t(u) : Promise.resolve(u).then(r, o);
    }
    function _asyncToGenerator(n) {
        return function () {
            var t = this, e = arguments;
            return new Promise(function (r, o) {
                var a = n.apply(t, e);
                function _next(n) {
                    asyncGeneratorStep(a, r, o, _next, _throw, "next", n);
                }
                function _throw(n) {
                    asyncGeneratorStep(a, r, o, _next, _throw, "throw", n);
                }
                _next(void 0);
            });
        };
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/http-loader.ts
    var HttpRequestExecutor = /** @class */ (function () {
        function HttpRequestExecutor(request, httpConfig, eventTarget) {
            _defineProperty(this, "request", void 0);
            _defineProperty(this, "httpConfig", void 0);
            _defineProperty(this, "abortController", new SafeAbortController());
            _defineProperty(this, "expectedBytesLength", void 0);
            _defineProperty(this, "requestByteRange", void 0);
            _defineProperty(this, "onChunkDownloaded", void 0);
            this.request = request;
            this.httpConfig = httpConfig;
            this.onChunkDownloaded = eventTarget.getEventDispatcher("onChunkDownloaded");
            var byteRange = this.request.segment.byteRange;
            if (byteRange)
                this.requestByteRange = _objectSpread2({}, byteRange);
        }
        HttpRequestExecutor.prototype.isAborted = function () {
            return this.abortController.signal.aborted;
        };
        HttpRequestExecutor.prototype.execute = function () {
            var _this_1 = this;
            var startControls = {
                abort: function () { return _this_1.abortController.abort(); },
                notReceivingBytesTimeoutMs: this.httpConfig.httpNotReceivingBytesTimeoutMs
            };
            if (this.request.tryCompleteByLoadedBytes({ downloadSource: "http" }, startControls, this.httpConfig.validateHTTPSegment, "http-segment-validation-failed"))
                return;
            if (this.request.loadedBytes !== 0) {
                var _this$requestByteRang;
                this.requestByteRange = (_this$requestByteRang = this.requestByteRange) !== null && _this$requestByteRang !== void 0 ? _this$requestByteRang : { start: 0 };
                this.requestByteRange.start = this.requestByteRange.start + this.request.loadedBytes;
            }
            if (this.request.totalBytes)
                this.expectedBytesLength = this.request.totalBytes - this.request.loadedBytes;
            var requestControls = this.request.start({ downloadSource: "http" }, startControls);
            this.fetch(requestControls);
        };
        HttpRequestExecutor.prototype.fetch = function (requestControls) {
            var _this = this;
            return _asyncToGenerator(function () {
                var segment, activeReader, onAbort, abortSignal, _this$httpConfig$http, _this$httpConfig, request, _this$requestByteRang2, requestOptions, response, reader, _a, done, value, isValid, error_1;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            segment = _this.request.segment;
                            if (_this.isAborted())
                                return [2 /*return*/];
                            onAbort = function () {
                                try {
                                    activeReader === null || activeReader === void 0 || activeReader.cancel().catch(function () { });
                                }
                                catch (_unused) { }
                            };
                            _this.abortController.signal.addEventListener("abort", onAbort);
                            abortSignal = isAbortControllerSupported ? _this.abortController.signal : void 0;
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 9, 10, 11]);
                            return [4 /*yield*/, (_this$httpConfig$http = (_this$httpConfig = _this.httpConfig).httpRequestSetup) === null || _this$httpConfig$http === void 0 ? void 0 : _this$httpConfig$http.call(_this$httpConfig, segment.url, segment.byteRange, abortSignal, _this.requestByteRange)];
                        case 2:
                            request = _b.sent();
                            if (_this.isAborted())
                                throw new DOMException("Request aborted", "AbortError");
                            if (!request) {
                                requestOptions = { headers: new Headers(_this.requestByteRange ? { Range: "bytes=".concat(_this.requestByteRange.start, "-").concat((_this$requestByteRang2 = _this.requestByteRange.end) !== null && _this$requestByteRang2 !== void 0 ? _this$requestByteRang2 : "") } : void 0) };
                                if (abortSignal)
                                    requestOptions.signal = abortSignal;
                                request = new Request(segment.url, requestOptions);
                            }
                            if (_this.isAborted())
                                throw new DOMException("Request aborted before request fetch", "AbortError");
                            return [4 /*yield*/, window.fetch(request)];
                        case 3:
                            response = _b.sent();
                            if (_this.isAborted())
                                throw new DOMException("Request aborted", "AbortError");
                            _this.handleResponseHeaders(response);
                            if (!response.body)
                                throw new RequestError("http-error", "Missing response body");
                            requestControls.firstBytesReceived();
                            reader = response.body.getReader();
                            activeReader = reader;
                            _b.label = 4;
                        case 4:
                            if (_this.isAborted())
                                throw new DOMException("Request aborted", "AbortError");
                            return [4 /*yield*/, reader.read()];
                        case 5:
                            _a = _b.sent(), done = _a.done, value = _a.value;
                            if (done)
                                return [3 /*break*/, 7];
                            if (_this.isAborted())
                                throw new DOMException("Request aborted", "AbortError");
                            requestControls.addLoadedChunk(value);
                            _this.onChunkDownloaded(value.byteLength, "http");
                            _b.label = 6;
                        case 6: return [3 /*break*/, 4];
                        case 7:
                            if (_this.isAborted())
                                throw new DOMException("Request aborted", "AbortError");
                            if (_this.request.totalBytes !== void 0 && _this.request.loadedBytes !== _this.request.totalBytes)
                                throw new RequestError("http-bytes-mismatch", "HTTP response truncated: received ".concat(_this.request.loadedBytes, " of ").concat(_this.request.totalBytes, " bytes"));
                            return [4 /*yield*/, _this.request.validateData(_this.httpConfig.validateHTTPSegment)];
                        case 8:
                            isValid = _b.sent();
                            if (_this.isAborted())
                                throw new DOMException("Request aborted", "AbortError");
                            if (!isValid) {
                                _this.request.clearLoadedBytes();
                                throw new RequestError("http-segment-validation-failed");
                            }
                            requestControls.completeOnSuccess();
                            return [3 /*break*/, 11];
                        case 9:
                            error_1 = _b.sent();
                            _this.handleError(error_1, requestControls);
                            return [3 /*break*/, 11];
                        case 10:
                            _this.abortController.signal.removeEventListener("abort", onAbort);
                            return [7 /*endfinally*/];
                        case 11: return [2 /*return*/];
                    }
                });
            })();
        };
        HttpRequestExecutor.prototype.handleResponseHeaders = function (response) {
            if (!response.ok)
                if (response.status === 406 || response.status === 416) {
                    this.request.clearLoadedBytes();
                    throw new RequestError("http-bytes-mismatch", response.statusText);
                }
                else
                    throw new RequestError("http-error", response.statusText);
            var requestByteRange = this.requestByteRange;
            if (requestByteRange)
                if (response.status === 200)
                    if (this.request.segment.byteRange)
                        throw new RequestError("http-unexpected-status-code");
                    else
                        this.request.clearLoadedBytes();
                else {
                    if (response.status !== 206)
                        throw new RequestError("http-unexpected-status-code", response.statusText);
                    var contentLengthHeader = response.headers.get("Content-Length");
                    if (contentLengthHeader && this.expectedBytesLength !== void 0 && this.expectedBytesLength !== +contentLengthHeader) {
                        this.request.clearLoadedBytes();
                        throw new RequestError("http-bytes-mismatch", response.statusText);
                    }
                    var contentRangeHeader = response.headers.get("Content-Range");
                    var contentRange = contentRangeHeader ? parseContentRangeHeader(contentRangeHeader) : void 0;
                    if (contentRange) {
                        var from = contentRange.from, to = contentRange.to;
                        var responseExpectedBytesLength = to !== void 0 && from !== void 0 ? to - from + 1 : void 0;
                        if (responseExpectedBytesLength !== void 0 && this.expectedBytesLength !== responseExpectedBytesLength || from !== void 0 && requestByteRange.start !== from || to !== void 0 && requestByteRange.end !== void 0 && requestByteRange.end !== to) {
                            this.request.clearLoadedBytes();
                            throw new RequestError("http-bytes-mismatch", response.statusText);
                        }
                    }
                }
            if (response.status === 200 && this.request.totalBytes === void 0) {
                var contentLengthHeader = response.headers.get("Content-Length");
                if (contentLengthHeader)
                    this.request.setTotalBytes(+contentLengthHeader);
            }
        };
        HttpRequestExecutor.prototype.handleError = function (error, requestControls) {
            if (this.isAborted())
                return;
            if (error instanceof Error) {
                var httpLoaderError = error instanceof RequestError ? error : new RequestError("http-error", error.message);
                requestControls.abortOnError(httpLoaderError);
            }
        };
        return HttpRequestExecutor;
    }());
    var rangeHeaderRegex = /^bytes (?:(?:(\d+)|)-(?:(\d+)|)|\*)\/(?:(\d+)|\*)$/;
    function parseContentRangeHeader(headerValue) {
        var match = rangeHeaderRegex.exec(headerValue.trim());
        if (!match)
            return;
        var _a = __read(match, 4), from = _a[1], to = _a[2], total = _a[3];
        return {
            from: from ? parseInt(from) : void 0,
            to: to ? parseInt(to) : void 0,
            total: total ? parseInt(total) : void 0
        };
    }
    //#endregion
    //#region ../../node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js
    var require_ms = /* @__PURE__ */ __commonJSMin((function (exports, module) {
        /**
        * Helpers.
        */
        var s = 1e3;
        var m = s * 60;
        var h = m * 60;
        var d = h * 24;
        var w = d * 7;
        var y = d * 365.25;
        /**
        * Parse or format the given `val`.
        *
        * Options:
        *
        *  - `long` verbose formatting [false]
        *
        * @param {String|Number} val
        * @param {Object} [options]
        * @throws {Error} throw an error if val is not a non-empty string or a number
        * @return {String|Number}
        * @api public
        */
        module.exports = function (val, options) {
            options = options || {};
            var type = typeof val;
            if (type === "string" && val.length > 0)
                return parse(val);
            else if (type === "number" && isFinite(val))
                return options.long ? fmtLong(val) : fmtShort(val);
            throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
        };
        /**
        * Parse the given `str` and return milliseconds.
        *
        * @param {String} str
        * @return {Number}
        * @api private
        */
        function parse(str) {
            str = String(str);
            if (str.length > 100)
                return;
            var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
            if (!match)
                return;
            var n = parseFloat(match[1]);
            switch ((match[2] || "ms").toLowerCase()) {
                case "years":
                case "year":
                case "yrs":
                case "yr":
                case "y": return n * y;
                case "weeks":
                case "week":
                case "w": return n * w;
                case "days":
                case "day":
                case "d": return n * d;
                case "hours":
                case "hour":
                case "hrs":
                case "hr":
                case "h": return n * h;
                case "minutes":
                case "minute":
                case "mins":
                case "min":
                case "m": return n * m;
                case "seconds":
                case "second":
                case "secs":
                case "sec":
                case "s": return n * s;
                case "milliseconds":
                case "millisecond":
                case "msecs":
                case "msec":
                case "ms": return n;
                default: return;
            }
        }
        /**
        * Short format for `ms`.
        *
        * @param {Number} ms
        * @return {String}
        * @api private
        */
        function fmtShort(ms) {
            var msAbs = Math.abs(ms);
            if (msAbs >= d)
                return Math.round(ms / d) + "d";
            if (msAbs >= h)
                return Math.round(ms / h) + "h";
            if (msAbs >= m)
                return Math.round(ms / m) + "m";
            if (msAbs >= s)
                return Math.round(ms / s) + "s";
            return ms + "ms";
        }
        /**
        * Long format for `ms`.
        *
        * @param {Number} ms
        * @return {String}
        * @api private
        */
        function fmtLong(ms) {
            var msAbs = Math.abs(ms);
            if (msAbs >= d)
                return plural(ms, msAbs, d, "day");
            if (msAbs >= h)
                return plural(ms, msAbs, h, "hour");
            if (msAbs >= m)
                return plural(ms, msAbs, m, "minute");
            if (msAbs >= s)
                return plural(ms, msAbs, s, "second");
            return ms + " ms";
        }
        /**
        * Pluralization helper.
        */
        function plural(ms, msAbs, n, name) {
            var isPlural = msAbs >= n * 1.5;
            return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
        }
    }));
    //#endregion
    //#region ../../node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/common.js
    var require_common = /* @__PURE__ */ __commonJSMin((function (exports, module) {
        /**
        * This is the common logic for both the Node.js and web browser
        * implementations of `debug()`.
        */
        function setup(env) {
            createDebug.debug = createDebug;
            createDebug.default = createDebug;
            createDebug.coerce = coerce;
            createDebug.disable = disable;
            createDebug.enable = enable;
            createDebug.enabled = enabled;
            createDebug.humanize = require_ms();
            createDebug.destroy = destroy;
            Object.keys(env).forEach(function (key) {
                createDebug[key] = env[key];
            });
            /**
            * The currently active debug mode names, and names to skip.
            */
            createDebug.names = [];
            createDebug.skips = [];
            /**
            * Map of special "%n" handling functions, for the debug "format" argument.
            *
            * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
            */
            createDebug.formatters = {};
            /**
            * Selects a color for a debug namespace
            * @param {String} namespace The namespace string for the debug instance to be colored
            * @return {Number|String} An ANSI color code for the given namespace
            * @api private
            */
            function selectColor(namespace) {
                var hash = 0;
                for (var i = 0; i < namespace.length; i++) {
                    hash = (hash << 5) - hash + namespace.charCodeAt(i);
                    hash |= 0;
                }
                return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
            }
            createDebug.selectColor = selectColor;
            /**
            * Create a debugger with the given `namespace`.
            *
            * @param {String} namespace
            * @return {Function}
            * @api public
            */
            function createDebug(namespace) {
                var prevTime;
                var enableOverride = null;
                var namespacesCache;
                var enabledCache;
                function debug() {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    if (!debug.enabled)
                        return;
                    var self = debug;
                    var curr = Number(/* @__PURE__ */ new Date());
                    self.diff = curr - (prevTime || curr);
                    self.prev = prevTime;
                    self.curr = curr;
                    prevTime = curr;
                    args[0] = createDebug.coerce(args[0]);
                    if (typeof args[0] !== "string")
                        args.unshift("%O");
                    var index = 0;
                    args[0] = args[0].replace(/%([a-zA-Z%])/g, function (match, format) {
                        if (match === "%%")
                            return "%";
                        index++;
                        var formatter = createDebug.formatters[format];
                        if (typeof formatter === "function") {
                            var val = args[index];
                            match = formatter.call(self, val);
                            args.splice(index, 1);
                            index--;
                        }
                        return match;
                    });
                    createDebug.formatArgs.call(self, args);
                    (self.log || createDebug.log).apply(self, args);
                }
                debug.namespace = namespace;
                debug.useColors = createDebug.useColors();
                debug.color = createDebug.selectColor(namespace);
                debug.extend = extend;
                debug.destroy = createDebug.destroy;
                Object.defineProperty(debug, "enabled", {
                    enumerable: true,
                    configurable: false,
                    get: function () {
                        if (enableOverride !== null)
                            return enableOverride;
                        if (namespacesCache !== createDebug.namespaces) {
                            namespacesCache = createDebug.namespaces;
                            enabledCache = createDebug.enabled(namespace);
                        }
                        return enabledCache;
                    },
                    set: function (v) {
                        enableOverride = v;
                    }
                });
                if (typeof createDebug.init === "function")
                    createDebug.init(debug);
                return debug;
            }
            function extend(namespace, delimiter) {
                var newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
                newDebug.log = this.log;
                return newDebug;
            }
            /**
            * Enables a debug mode by namespaces. This can include modes
            * separated by a colon and wildcards.
            *
            * @param {String} namespaces
            * @api public
            */
            function enable(namespaces) {
                var e_2, _a;
                createDebug.save(namespaces);
                createDebug.namespaces = namespaces;
                createDebug.names = [];
                createDebug.skips = [];
                var split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
                try {
                    for (var split_1 = __values(split), split_1_1 = split_1.next(); !split_1_1.done; split_1_1 = split_1.next()) {
                        var ns = split_1_1.value;
                        if (ns[0] === "-")
                            createDebug.skips.push(ns.slice(1));
                        else
                            createDebug.names.push(ns);
                    }
                }
                catch (e_2_1) { e_2 = { error: e_2_1 }; }
                finally {
                    try {
                        if (split_1_1 && !split_1_1.done && (_a = split_1.return)) _a.call(split_1);
                    }
                    finally { if (e_2) throw e_2.error; }
                }
            }
            /**
            * Checks if the given string matches a namespace template, honoring
            * asterisks as wildcards.
            *
            * @param {String} search
            * @param {String} template
            * @return {Boolean}
            */
            function matchesTemplate(search, template) {
                var searchIndex = 0;
                var templateIndex = 0;
                var starIndex = -1;
                var matchIndex = 0;
                while (searchIndex < search.length)
                    if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*"))
                        if (template[templateIndex] === "*") {
                            starIndex = templateIndex;
                            matchIndex = searchIndex;
                            templateIndex++;
                        }
                        else {
                            searchIndex++;
                            templateIndex++;
                        }
                    else if (starIndex !== -1) {
                        templateIndex = starIndex + 1;
                        matchIndex++;
                        searchIndex = matchIndex;
                    }
                    else
                        return false;
                while (templateIndex < template.length && template[templateIndex] === "*")
                    templateIndex++;
                return templateIndex === template.length;
            }
            /**
            * Disable debug output.
            *
            * @return {String} namespaces
            * @api public
            */
            function disable() {
                var namespaces = __spreadArray(__spreadArray([], __read(createDebug.names), false), __read(createDebug.skips.map(function (namespace) { return "-" + namespace; })), false).join(",");
                createDebug.enable("");
                return namespaces;
            }
            /**
            * Returns true if the given mode name is enabled, false otherwise.
            *
            * @param {String} name
            * @return {Boolean}
            * @api public
            */
            function enabled(name) {
                var e_3, _a, e_4, _b;
                try {
                    for (var _c = __values(createDebug.skips), _d = _c.next(); !_d.done; _d = _c.next()) {
                        var skip = _d.value;
                        if (matchesTemplate(name, skip))
                            return false;
                    }
                }
                catch (e_3_1) { e_3 = { error: e_3_1 }; }
                finally {
                    try {
                        if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                    }
                    finally { if (e_3) throw e_3.error; }
                }
                try {
                    for (var _e = __values(createDebug.names), _f = _e.next(); !_f.done; _f = _e.next()) {
                        var ns = _f.value;
                        if (matchesTemplate(name, ns))
                            return true;
                    }
                }
                catch (e_4_1) { e_4 = { error: e_4_1 }; }
                finally {
                    try {
                        if (_f && !_f.done && (_b = _e.return)) _b.call(_e);
                    }
                    finally { if (e_4) throw e_4.error; }
                }
                return false;
            }
            /**
            * Coerce `val`.
            *
            * @param {Mixed} val
            * @return {Mixed}
            * @api private
            */
            function coerce(val) {
                if (val instanceof Error)
                    return val.stack || val.message;
                return val;
            }
            /**
            * XXX DO NOT USE. This is a temporary stub function.
            * XXX It WILL be removed in the next major release.
            */
            function destroy() {
                console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
            }
            createDebug.enable(createDebug.load());
            return createDebug;
        }
        module.exports = setup;
    }));
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/commands/types.ts
    var import_browser = /* @__PURE__ */ __toESM(( /* @__PURE__ */__commonJSMin((function (exports, module) {
        /**
        * This is the web browser implementation of `debug()`.
        */
        exports.formatArgs = formatArgs;
        exports.save = save;
        exports.load = load;
        exports.useColors = useColors;
        exports.storage = localstorage();
        exports.destroy = (function () {
            var warned = false;
            return function () {
                if (!warned) {
                    warned = true;
                    console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
                }
            };
        })();
        /**
        * Colors.
        */
        exports.colors = [
            "#0000CC",
            "#0000FF",
            "#0033CC",
            "#0033FF",
            "#0066CC",
            "#0066FF",
            "#0099CC",
            "#0099FF",
            "#00CC00",
            "#00CC33",
            "#00CC66",
            "#00CC99",
            "#00CCCC",
            "#00CCFF",
            "#3300CC",
            "#3300FF",
            "#3333CC",
            "#3333FF",
            "#3366CC",
            "#3366FF",
            "#3399CC",
            "#3399FF",
            "#33CC00",
            "#33CC33",
            "#33CC66",
            "#33CC99",
            "#33CCCC",
            "#33CCFF",
            "#6600CC",
            "#6600FF",
            "#6633CC",
            "#6633FF",
            "#66CC00",
            "#66CC33",
            "#9900CC",
            "#9900FF",
            "#9933CC",
            "#9933FF",
            "#99CC00",
            "#99CC33",
            "#CC0000",
            "#CC0033",
            "#CC0066",
            "#CC0099",
            "#CC00CC",
            "#CC00FF",
            "#CC3300",
            "#CC3333",
            "#CC3366",
            "#CC3399",
            "#CC33CC",
            "#CC33FF",
            "#CC6600",
            "#CC6633",
            "#CC9900",
            "#CC9933",
            "#CCCC00",
            "#CCCC33",
            "#FF0000",
            "#FF0033",
            "#FF0066",
            "#FF0099",
            "#FF00CC",
            "#FF00FF",
            "#FF3300",
            "#FF3333",
            "#FF3366",
            "#FF3399",
            "#FF33CC",
            "#FF33FF",
            "#FF6600",
            "#FF6633",
            "#FF9900",
            "#FF9933",
            "#FFCC00",
            "#FFCC33"
        ];
        /**
        * Currently only WebKit-based Web Inspectors, Firefox >= v31,
        * and the Firebug extension (any Firefox version) are known
        * to support "%c" CSS customizations.
        *
        * TODO: add a `localStorage` variable to explicitly enable/disable colors
        */
        function useColors() {
            if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs))
                return true;
            if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))
                return false;
            var m;
            return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
        }
        /**
        * Colorize log arguments if enabled.
        *
        * @api public
        */
        function formatArgs(args) {
            args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
            if (!this.useColors)
                return;
            var c = "color: " + this.color;
            args.splice(1, 0, c, "color: inherit");
            var index = 0;
            var lastC = 0;
            args[0].replace(/%[a-zA-Z%]/g, function (match) {
                if (match === "%%")
                    return;
                index++;
                if (match === "%c")
                    lastC = index;
            });
            args.splice(lastC, 0, c);
        }
        /**
        * Invokes `console.debug()` when available.
        * No-op when `console.debug` is not a "function".
        * If `console.debug` is not available, falls back
        * to `console.log`.
        *
        * @api public
        */
        exports.log = console.debug || console.log || (function () { });
        /**
        * Save `namespaces`.
        *
        * @param {String} namespaces
        * @api private
        */
        function save(namespaces) {
            try {
                if (namespaces)
                    exports.storage.setItem("debug", namespaces);
                else
                    exports.storage.removeItem("debug");
            }
            catch (error) { }
        }
        /**
        * Load `namespaces`.
        *
        * @return {String} returns the previously persisted debug modes
        * @api private
        */
        function load() {
            var r;
            try {
                r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
            }
            catch (error) { }
            if (!r && typeof process !== "undefined" && "env" in process)
                r = process.env.DEBUG;
            return r;
        }
        /**
        * Localstorage attempts to return the localstorage.
        *
        * This is necessary because safari throws
        * when a user disables cookies/localstorage
        * and you attempt to access it.
        *
        * @return {LocalStorage}
        * @api private
        */
        function localstorage() {
            try {
                return localStorage;
            }
            catch (error) { }
        }
        module.exports = require_common()(exports);
        var formatters = module.exports.formatters;
        /**
        * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
        */
        formatters.j = function (v) {
            try {
                return JSON.stringify(v);
            }
            catch (error) {
                return "[UnexpectedJSONParseError]: " + error.message;
            }
        };
    })))(), 1);
    var PeerCommandType$1 = /* @__PURE__ */ function (PeerCommandType) {
        PeerCommandType[PeerCommandType["SegmentsAnnouncement"] = 0] = "SegmentsAnnouncement";
        PeerCommandType[PeerCommandType["SegmentRequest"] = 1] = "SegmentRequest";
        PeerCommandType[PeerCommandType["SegmentData"] = 2] = "SegmentData";
        PeerCommandType[PeerCommandType["SegmentDataSendingCompleted"] = 3] = "SegmentDataSendingCompleted";
        PeerCommandType[PeerCommandType["SegmentAbsent"] = 4] = "SegmentAbsent";
        PeerCommandType[PeerCommandType["CancelSegmentRequest"] = 5] = "CancelSegmentRequest";
        return PeerCommandType;
    }({});
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/utils.ts
    function getPromiseWithResolvers() {
        var resolve;
        var reject;
        return {
            promise: new Promise(function (res, rej) {
                resolve = res;
                reject = rej;
            }),
            resolve: resolve,
            reject: reject
        };
    }
    function queueMicrotask(fn) {
        Promise.resolve().then(fn);
    }
    function joinChunks(chunks, totalBytes) {
        var e_5, _a;
        var _totalBytes;
        (_totalBytes = totalBytes) !== null && _totalBytes !== void 0 || (totalBytes = chunks.reduce(function (sum, chunk) { return sum + chunk.byteLength; }, 0));
        var buffer = new Uint8Array(totalBytes);
        var offset = 0;
        try {
            for (var chunks_1 = __values(chunks), chunks_1_1 = chunks_1.next(); !chunks_1_1.done; chunks_1_1 = chunks_1.next()) {
                var chunk = chunks_1_1.value;
                buffer.set(chunk, offset);
                offset += chunk.byteLength;
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (chunks_1_1 && !chunks_1_1.done && (_a = chunks_1.return)) _a.call(chunks_1);
            }
            finally { if (e_5) throw e_5.error; }
        }
        return buffer;
    }
    function getRandomItem(items) {
        return items[Math.floor(Math.random() * items.length)];
    }
    function getWeightedRandomItem(items, weightAccessor) {
        if (items.length === 0)
            throw new Error("Cannot get item from empty array");
        if (items.length === 1)
            return items[0];
        var totalWeight = 0;
        var weights = items.map(function (item) {
            var weight = weightAccessor(item);
            totalWeight += weight;
            return weight;
        });
        var randomWeight = Math.random() * totalWeight;
        for (var i = 0; i < items.length; i++) {
            randomWeight -= weights[i];
            if (randomWeight <= 0)
                return items[i];
        }
        return items[items.length - 1];
    }
    function utf8ToUintArray(utf8String) {
        return new TextEncoder().encode(utf8String);
    }
    function arrayBackwards(arr) {
        var i;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    i = arr.length - 1;
                    _a.label = 1;
                case 1:
                    if (!(i >= 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, arr[i]];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    i--;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    }
    function isObject(item) {
        return !!item && typeof item === "object" && !Array.isArray(item);
    }
    function isArray(item) {
        return Array.isArray(item);
    }
    function filterUndefinedProps(obj) {
        function filter(obj) {
            if (isObject(obj)) {
                var result_1 = {};
                Object.keys(obj).forEach(function (key) {
                    if (obj[key] !== void 0) {
                        var value = filter(obj[key]);
                        if (value !== void 0)
                            result_1[key] = value;
                    }
                });
                return result_1;
            }
            else
                return obj;
        }
        return filter(obj);
    }
    function deepCopy(item) {
        var e_6, _a;
        if (isArray(item))
            return item.map(function (element) { return deepCopy(element); });
        else if (isObject(item)) {
            var copy = {};
            try {
                for (var _b = __values(Object.keys(item)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var key = _c.value;
                    copy[key] = deepCopy(item[key]);
                }
            }
            catch (e_6_1) { e_6 = { error: e_6_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_6) throw e_6.error; }
            }
            return copy;
        }
        else
            return item;
    }
    function shuffleArray(array) {
        var _a;
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            _a = __read([array[j], array[i]], 2), array[i] = _a[0], array[j] = _a[1];
        }
        return array;
    }
    function overrideConfig(target, updates, defaults) {
        if (defaults === void 0) { defaults = {}; }
        if (typeof target !== "object" || target === null || typeof updates !== "object" || updates === null)
            return target;
        Object.keys(updates).forEach(function (key) {
            var keyStr = typeof key === "symbol" ? key.toString() : String(key);
            if (key === "__proto__" || key === "constructor" || key === "prototype")
                throw new Error("Attempt to modify restricted property '".concat(keyStr, "'"));
            var updateValue = updates[key];
            var defaultValue = defaults[key];
            if (key in target)
                if (updateValue === void 0)
                    target[key] = defaultValue === void 0 ? void 0 : defaultValue;
                else
                    target[key] = updateValue;
        });
        return target;
    }
    function mergeAndFilterConfig(options) {
        var defaultConfig = options.defaultConfig, _a = options.baseConfig, baseConfig = _a === void 0 ? {} : _a, _b = options.specificStreamConfig, specificStreamConfig = _b === void 0 ? {} : _b;
        var mergedConfig = deepCopy(_objectSpread2(_objectSpread2(_objectSpread2({}, defaultConfig), baseConfig), specificStreamConfig));
        var keysOfT = Object.keys(defaultConfig);
        var filteredConfig = {};
        keysOfT.forEach(function (key) {
            if (key in mergedConfig)
                filteredConfig[key] = mergedConfig[key];
        });
        return filteredConfig;
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateMethodInitSpec.js
    function _classPrivateMethodInitSpec(e, a) {
        _checkPrivateRedeclaration(e, a), a.add(e);
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldSet2.js
    function _classPrivateFieldSet2(s, a, r) {
        return s.set(_assertClassBrand(s, a), r), r;
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/commands/binary-serialization.ts
    var textEncoder = new TextEncoder();
    var textDecoder = new TextDecoder("utf8");
    var SerializedItem = /* @__PURE__ */ function (SerializedItem) {
        SerializedItem[SerializedItem["Min"] = -1] = "Min";
        SerializedItem[SerializedItem["Int"] = 1 + SerializedItem["Min"]] = "Int";
        SerializedItem[SerializedItem["SimilarIntArray"] = 1 + SerializedItem["Int"]] = "SimilarIntArray";
        SerializedItem[SerializedItem["String"] = 1 + SerializedItem["SimilarIntArray"]] = "String";
        SerializedItem[SerializedItem["Max"] = 1 + SerializedItem["String"]] = "Max";
        return SerializedItem;
    }({});
    function getRequiredBytesForInt(num) {
        if (num === 0)
            return 1;
        var necessaryBits = Math.floor(Math.log2(Math.abs(num))) + 2;
        return Math.ceil(necessaryBits / 8);
    }
    function intToBytes(num) {
        var isNegative = num < 0;
        var bytesAmountNumber = getRequiredBytesForInt(num);
        var bytes = new Uint8Array(bytesAmountNumber);
        num = Math.abs(num);
        for (var i = 0; i < bytesAmountNumber; i++) {
            var shift = 8 * (bytesAmountNumber - 1 - i);
            bytes[i] = Math.floor(num / Math.pow(2, shift)) & 255;
        }
        if (isNegative)
            bytes[0] = bytes[0] | 128;
        return bytes;
    }
    function bytesToInt(bytes) {
        var byteLength = bytes.length;
        var getNumberPart = function (byte, i) {
            var shift = 8 * (byteLength - 1 - i);
            return byte * Math.pow(2, shift);
        };
        var number = getNumberPart(bytes[0] & 127, 0);
        for (var i = 1; i < byteLength; i++)
            number += getNumberPart(bytes[i], i);
        if ((bytes[0] & 128) >> 7 !== 0)
            number = -number;
        return number;
    }
    function serializeInt(num) {
        var numBytes = intToBytes(num);
        var numberMetadata = SerializedItem.Int << 4 | numBytes.length;
        return new Uint8Array(__spreadArray([numberMetadata], __read(numBytes), false));
    }
    function deserializeInt(bytes) {
        if (bytes.length === 0)
            throw new Error("Buffer is too short");
        var metadata = bytes[0];
        if (metadata >> 4 !== SerializedItem.Int)
            throw new Error("Trying to deserialize integer with invalid serialized item code");
        var numberBytesLength = metadata & 15;
        var start = 1;
        var end = start + numberBytesLength;
        return {
            number: bytesToInt(bytes.subarray(start, end)),
            byteLength: numberBytesLength + 1
        };
    }
    function serializeSimilarIntArray(numbers) {
        var e_7, _a, e_8, _b;
        var commonPartNumbersMap = /* @__PURE__ */ new Map();
        try {
            for (var numbers_1 = __values(numbers), numbers_1_1 = numbers_1.next(); !numbers_1_1.done; numbers_1_1 = numbers_1.next()) {
                var number = numbers_1_1.value;
                var _commonPartNumbersMap;
                var diffByte = number & 255;
                var common = number - diffByte;
                var bytes = (_commonPartNumbersMap = commonPartNumbersMap.get(common)) !== null && _commonPartNumbersMap !== void 0 ? _commonPartNumbersMap : new ResizableUint8Array();
                if (!bytes.length)
                    commonPartNumbersMap.set(common, bytes);
                bytes.push(diffByte);
            }
        }
        catch (e_7_1) { e_7 = { error: e_7_1 }; }
        finally {
            try {
                if (numbers_1_1 && !numbers_1_1.done && (_a = numbers_1.return)) _a.call(numbers_1);
            }
            finally { if (e_7) throw e_7.error; }
        }
        var result = new ResizableUint8Array();
        result.push([SerializedItem.SimilarIntArray << 4, commonPartNumbersMap.size]);
        try {
            for (var commonPartNumbersMap_1 = __values(commonPartNumbersMap), commonPartNumbersMap_1_1 = commonPartNumbersMap_1.next(); !commonPartNumbersMap_1_1.done; commonPartNumbersMap_1_1 = commonPartNumbersMap_1.next()) {
                var _c = __read(commonPartNumbersMap_1_1.value, 2), commonPart = _c[0], binaryArray = _c[1];
                var length = binaryArray.getBytesChunks().length;
                var commonPartWithLength = commonPart + (length & 255);
                binaryArray.unshift(serializeInt(commonPartWithLength));
                result.push(binaryArray.getBuffer());
            }
        }
        catch (e_8_1) { e_8 = { error: e_8_1 }; }
        finally {
            try {
                if (commonPartNumbersMap_1_1 && !commonPartNumbersMap_1_1.done && (_b = commonPartNumbersMap_1.return)) _b.call(commonPartNumbersMap_1);
            }
            finally { if (e_8) throw e_8.error; }
        }
        return result.getBuffer();
    }
    function deserializeSimilarIntArray(bytes) {
        if (bytes.length < 2)
            throw new Error("Buffer is too short");
        var _a = __read(bytes, 2), codeByte = _a[0], commonPartArraysAmount = _a[1];
        if (codeByte >> 4 !== SerializedItem.SimilarIntArray)
            throw new Error("Trying to deserialize similar int array with invalid serialized item code");
        var offset = 2;
        var originalIntArr = [];
        for (var i = 0; i < commonPartArraysAmount; i++) {
            var _b = deserializeInt(bytes.subarray(offset)), commonPartWithLength = _b.number, byteLength = _b.byteLength;
            offset += byteLength;
            var arrayLength = commonPartWithLength & 255;
            var commonPart = commonPartWithLength - arrayLength;
            for (var j = 0; j < arrayLength; j++) {
                var diffPart = bytes[offset];
                originalIntArr.push(commonPart + diffPart);
                offset++;
            }
        }
        return {
            numbers: originalIntArr,
            byteLength: offset
        };
    }
    function serializeString(string) {
        var encoded = textEncoder.encode(string);
        var length = encoded.length;
        if (length > 4095)
            throw new Error("String exceeds maximum length of 4095 bytes");
        var bytes = new ResizableUint8Array();
        bytes.push([SerializedItem.String << 4 | length >> 8 & 15, length & 255]);
        bytes.push(encoded);
        return bytes.getBuffer();
    }
    function deserializeString(bytes) {
        if (bytes.length < 2)
            throw new Error("Buffer is too short");
        var _a = __read(bytes, 2), codeByte = _a[0], lengthByte = _a[1];
        if (codeByte >> 4 !== SerializedItem.String)
            throw new Error("Trying to deserialize bytes (sting) with invalid serialized item code.");
        var length = (codeByte & 15) << 8 | lengthByte;
        var stringBytes = bytes.subarray(2, length + 2);
        return {
            string: textDecoder.decode(stringBytes),
            byteLength: length + 2
        };
    }
    var _bytes$1 = /* @__PURE__ */ new WeakMap();
    var _length = /* @__PURE__ */ new WeakMap();
    var _ResizableUint8Array_brand = /* @__PURE__ */ new WeakSet();
    var ResizableUint8Array = /** @class */ (function () {
        function ResizableUint8Array() {
            _classPrivateMethodInitSpec(this, _ResizableUint8Array_brand);
            _classPrivateFieldInitSpec(this, _bytes$1, []);
            _classPrivateFieldInitSpec(this, _length, 0);
        }
        ResizableUint8Array.prototype.push = function (bytes) {
            _assertClassBrand(_ResizableUint8Array_brand, this, _addBytes).call(this, bytes, "end");
        };
        ResizableUint8Array.prototype.unshift = function (bytes) {
            _assertClassBrand(_ResizableUint8Array_brand, this, _addBytes).call(this, bytes, "start");
        };
        ResizableUint8Array.prototype.getBytesChunks = function () {
            return _classPrivateFieldGet2(_bytes$1, this);
        };
        ResizableUint8Array.prototype.getBuffer = function () {
            return joinChunks(_classPrivateFieldGet2(_bytes$1, this), _classPrivateFieldGet2(_length, this));
        };
        Object.defineProperty(ResizableUint8Array.prototype, "length", {
            get: function () {
                return _classPrivateFieldGet2(_length, this);
            },
            enumerable: false,
            configurable: true
        });
        return ResizableUint8Array;
    }());
    function _addBytes(bytes, position) {
        var bytesToAdd;
        if (bytes instanceof Uint8Array)
            bytesToAdd = bytes;
        else if (Array.isArray(bytes))
            bytesToAdd = new Uint8Array(bytes);
        else
            bytesToAdd = new Uint8Array([bytes]);
        _classPrivateFieldSet2(_length, this, _classPrivateFieldGet2(_length, this) + bytesToAdd.length);
        _classPrivateFieldGet2(_bytes$1, this)[position === "start" ? "unshift" : "push"](bytesToAdd);
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/commands/binary-command-creator.ts
    var FRAME_PART_LENGTH = 4;
    var commandFrameStart = stringToUtf8CodesBuffer("cstr", FRAME_PART_LENGTH);
    var commandFrameEnd = stringToUtf8CodesBuffer("cend", FRAME_PART_LENGTH);
    var commandDivFrameStart = stringToUtf8CodesBuffer("dstr", FRAME_PART_LENGTH);
    var commandDivFrameEnd = stringToUtf8CodesBuffer("dend", FRAME_PART_LENGTH);
    var startFrames = [commandFrameStart, commandDivFrameStart];
    var endFrames = [commandFrameEnd, commandDivFrameEnd];
    var commandFramesLength = commandFrameStart.length + commandFrameEnd.length;
    function isCommandChunk(buffer) {
        if (buffer.length < commandFramesLength)
            return false;
        var length = commandFrameStart.length;
        var bufferEndingToCompare = buffer.subarray(-length);
        return startFrames.some(function (frame) { return areBuffersEqual(buffer, frame, FRAME_PART_LENGTH); }) && endFrames.some(function (frame) { return areBuffersEqual(bufferEndingToCompare, frame, FRAME_PART_LENGTH); });
    }
    function isFirstCommandChunk(buffer) {
        if (buffer.length < commandFramesLength)
            return false;
        return areBuffersEqual(buffer, commandFrameStart, FRAME_PART_LENGTH);
    }
    function isLastCommandChunk(buffer) {
        if (buffer.length < commandFramesLength)
            return false;
        return areBuffersEqual(buffer.subarray(-FRAME_PART_LENGTH), commandFrameEnd, FRAME_PART_LENGTH);
    }
    var BinaryCommandJoiningError = /** @class */ (function (_super) {
        __extends(BinaryCommandJoiningError, _super);
        function BinaryCommandJoiningError(type) {
            var _this_1 = _super.call(this) || this;
            _defineProperty(_this_1, "type", void 0);
            _this_1.type = type;
            return _this_1;
        }
        return BinaryCommandJoiningError;
    }(Error));
    var _chunks = /* @__PURE__ */ new WeakMap();
    var _status = /* @__PURE__ */ new WeakMap();
    var _onComplete = /* @__PURE__ */ new WeakMap();
    var _BinaryCommandChunksJoiner_brand = /* @__PURE__ */ new WeakSet();
    var BinaryCommandChunksJoiner = /** @class */ (function () {
        function BinaryCommandChunksJoiner(onComplete) {
            _classPrivateMethodInitSpec(this, _BinaryCommandChunksJoiner_brand);
            _classPrivateFieldInitSpec(this, _chunks, new ResizableUint8Array());
            _classPrivateFieldInitSpec(this, _status, "joining");
            _classPrivateFieldInitSpec(this, _onComplete, void 0);
            _classPrivateFieldSet2(_onComplete, this, onComplete);
        }
        BinaryCommandChunksJoiner.prototype.addCommandChunk = function (chunk) {
            if (_classPrivateFieldGet2(_status, this) === "completed")
                return;
            var isFirstChunk = isFirstCommandChunk(chunk);
            if (!_classPrivateFieldGet2(_chunks, this).length && !isFirstChunk)
                throw new BinaryCommandJoiningError("no-first-chunk");
            if (_classPrivateFieldGet2(_chunks, this).length && isFirstChunk)
                throw new BinaryCommandJoiningError("incomplete-joining");
            _classPrivateFieldGet2(_chunks, this).push(_assertClassBrand(_BinaryCommandChunksJoiner_brand, this, _unframeCommandChunk).call(this, chunk));
            if (!isLastCommandChunk(chunk))
                return;
            _classPrivateFieldSet2(_status, this, "completed");
            _classPrivateFieldGet2(_onComplete, this).call(this, _classPrivateFieldGet2(_chunks, this).getBuffer());
        };
        return BinaryCommandChunksJoiner;
    }());
    function _unframeCommandChunk(chunk) {
        if (chunk.length < commandFramesLength)
            throw new Error("Command chunk is too short to unframe");
        return chunk.subarray(FRAME_PART_LENGTH, chunk.length - FRAME_PART_LENGTH);
    }
    var _bytes = /* @__PURE__ */ new WeakMap();
    var _resultBuffers = /* @__PURE__ */ new WeakMap();
    var _status2 = /* @__PURE__ */ new WeakMap();
    var _maxChunkLength = /* @__PURE__ */ new WeakMap();
    var BinaryCommandCreator = /** @class */ (function () {
        function BinaryCommandCreator(commandType, maxChunkLength) {
            _classPrivateFieldInitSpec(this, _bytes, new ResizableUint8Array());
            _classPrivateFieldInitSpec(this, _resultBuffers, []);
            _classPrivateFieldInitSpec(this, _status2, "creating");
            _classPrivateFieldInitSpec(this, _maxChunkLength, void 0);
            _classPrivateFieldSet2(_maxChunkLength, this, maxChunkLength);
            _classPrivateFieldGet2(_bytes, this).push(commandType);
        }
        BinaryCommandCreator.prototype.addInteger = function (name, value) {
            _classPrivateFieldGet2(_bytes, this).push(name.charCodeAt(0));
            var bytes = serializeInt(value);
            _classPrivateFieldGet2(_bytes, this).push(bytes);
        };
        BinaryCommandCreator.prototype.addSimilarIntArr = function (name, arr) {
            _classPrivateFieldGet2(_bytes, this).push(name.charCodeAt(0));
            var bytes = serializeSimilarIntArray(arr);
            _classPrivateFieldGet2(_bytes, this).push(bytes);
        };
        BinaryCommandCreator.prototype.addString = function (name, string) {
            _classPrivateFieldGet2(_bytes, this).push(name.charCodeAt(0));
            var bytes = serializeString(string);
            _classPrivateFieldGet2(_bytes, this).push(bytes);
        };
        BinaryCommandCreator.prototype.complete = function () {
            var e_9, _a;
            if (!_classPrivateFieldGet2(_bytes, this).length)
                throw new Error("Buffer is empty");
            if (_classPrivateFieldGet2(_status2, this) === "completed")
                return;
            _classPrivateFieldSet2(_status2, this, "completed");
            var unframedBuffer = _classPrivateFieldGet2(_bytes, this).getBuffer();
            if (unframedBuffer.length + commandFramesLength <= _classPrivateFieldGet2(_maxChunkLength, this)) {
                _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(unframedBuffer, commandFrameStart, commandFrameEnd));
                return;
            }
            var chunksCount = Math.ceil(unframedBuffer.length / _classPrivateFieldGet2(_maxChunkLength, this));
            if (Math.ceil(unframedBuffer.length / chunksCount) + commandFramesLength > _classPrivateFieldGet2(_maxChunkLength, this))
                chunksCount++;
            try {
                for (var _b = __values(splitBufferToEqualChunks(unframedBuffer, chunksCount)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = __read(_c.value, 2), i = _d[0], chunk = _d[1];
                    if (i === 0)
                        _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(chunk, commandFrameStart, commandDivFrameEnd));
                    else if (i === chunksCount - 1)
                        _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(chunk, commandDivFrameStart, commandFrameEnd));
                    else
                        _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(chunk, commandDivFrameStart, commandDivFrameEnd));
                }
            }
            catch (e_9_1) { e_9 = { error: e_9_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_9) throw e_9.error; }
            }
        };
        BinaryCommandCreator.prototype.getResultBuffers = function () {
            if (_classPrivateFieldGet2(_status2, this) === "creating" || !_classPrivateFieldGet2(_resultBuffers, this).length)
                throw new Error("Command is not complete.");
            return _classPrivateFieldGet2(_resultBuffers, this);
        };
        return BinaryCommandCreator;
    }());
    function deserializeCommand(bytes) {
        var _a = __read(bytes, 1), commandCode = _a[0];
        var deserializedCommand = { c: commandCode };
        var offset = 1;
        while (offset < bytes.length) {
            var name = String.fromCharCode(bytes[offset]);
            offset++;
            switch (getDataTypeFromByte(bytes[offset])) {
                case SerializedItem.Int:
                    {
                        var _b = deserializeInt(bytes.subarray(offset)), number = _b.number, byteLength = _b.byteLength;
                        deserializedCommand[name] = number;
                        offset += byteLength;
                    }
                    break;
                case SerializedItem.SimilarIntArray:
                    {
                        var _c = deserializeSimilarIntArray(bytes.subarray(offset)), numbers = _c.numbers, byteLength = _c.byteLength;
                        deserializedCommand[name] = numbers;
                        offset += byteLength;
                    }
                    break;
                case SerializedItem.String:
                    {
                        var _d = deserializeString(bytes.subarray(offset)), string = _d.string, byteLength = _d.byteLength;
                        deserializedCommand[name] = string;
                        offset += byteLength;
                    }
                    break;
            }
        }
        return validateCommand(deserializedCommand);
    }
    function getDataTypeFromByte(byte) {
        var typeCode = byte >> 4;
        if (typeCode <= SerializedItem.Min || typeCode >= SerializedItem.Max)
            throw new Error("Not existing type");
        return typeCode;
    }
    function stringToUtf8CodesBuffer(string, length) {
        if (length && string.length !== length)
            throw new Error("Wrong string length");
        var buffer = new Uint8Array(length !== null && length !== void 0 ? length : string.length);
        for (var i = 0; i < string.length; i++)
            buffer[i] = string.charCodeAt(i);
        return buffer;
    }
    function splitBufferToEqualChunks(buffer, chunksCount) {
        var chunkLength, i;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    chunkLength = Math.ceil(buffer.length / chunksCount);
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < chunksCount)) return [3 /*break*/, 4];
                    return [4 /*yield*/, [i, buffer.subarray(i * chunkLength, (i + 1) * chunkLength)]];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    }
    function frameBuffer(buffer, frameStart, frameEnd) {
        var result = new Uint8Array(buffer.length + frameStart.length + frameEnd.length);
        result.set(frameStart);
        result.set(buffer, frameStart.length);
        result.set(frameEnd, frameStart.length + buffer.length);
        return result;
    }
    function areBuffersEqual(buffer1, buffer2, length) {
        for (var i = 0; i < length; i++)
            if (buffer1[i] !== buffer2[i])
                return false;
        return true;
    }
    function validateCommand(command) {
        switch (command.c) {
            case PeerCommandType$1.SegmentsAnnouncement: return command;
            case PeerCommandType$1.SegmentRequest:
                assertNumberFields(command, "i", "r");
                return command;
            case PeerCommandType$1.SegmentData:
                assertNumberFields(command, "i", "r", "s");
                return command;
            case PeerCommandType$1.SegmentAbsent:
            case PeerCommandType$1.CancelSegmentRequest:
            case PeerCommandType$1.SegmentDataSendingCompleted:
                assertNumberFields(command, "i", "r");
                return command;
            default: throw new Error("Unknown peer command type: ".concat(String(command.c)));
        }
    }
    function assertNumberFields(obj) {
        var e_10, _a;
        var fields = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            fields[_i - 1] = arguments[_i];
        }
        try {
            for (var fields_1 = __values(fields), fields_1_1 = fields_1.next(); !fields_1_1.done; fields_1_1 = fields_1.next()) {
                var field = fields_1_1.value;
                if (typeof obj[field] !== "number")
                    throw new Error("Expected number field \"".concat(field, "\", got ").concat(typeof obj[field]));
            }
        }
        catch (e_10_1) { e_10 = { error: e_10_1 }; }
        finally {
            try {
                if (fields_1_1 && !fields_1_1.done && (_a = fields_1.return)) _a.call(fields_1);
            }
            finally { if (e_10) throw e_10.error; }
        }
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/commands/commands.ts
    function serializeSegmentAnnouncementCommand(command, maxChunkSize) {
        var commandCode = command.c, loadingByHttp = command.p, loaded = command.l;
        var creator = new BinaryCommandCreator(commandCode, maxChunkSize);
        if (loaded === null || loaded === void 0 ? void 0 : loaded.length)
            creator.addSimilarIntArr("l", loaded);
        if (loadingByHttp === null || loadingByHttp === void 0 ? void 0 : loadingByHttp.length)
            creator.addSimilarIntArr("p", loadingByHttp);
        creator.complete();
        return creator.getResultBuffers();
    }
    function serializePeerSegmentCommand(command, maxChunkSize) {
        var creator = new BinaryCommandCreator(command.c, maxChunkSize);
        creator.addInteger("i", command.i);
        creator.addInteger("r", command.r);
        creator.complete();
        return creator.getResultBuffers();
    }
    function serializePeerSendSegmentCommand(command, maxChunkSize) {
        var creator = new BinaryCommandCreator(command.c, maxChunkSize);
        creator.addInteger("i", command.i);
        creator.addInteger("s", command.s);
        creator.addInteger("r", command.r);
        creator.complete();
        return creator.getResultBuffers();
    }
    function serializePeerSegmentRequestCommand(command, maxChunkSize) {
        var creator = new BinaryCommandCreator(command.c, maxChunkSize);
        creator.addInteger("i", command.i);
        creator.addInteger("r", command.r);
        if (command.b)
            creator.addInteger("b", command.b);
        creator.complete();
        return creator.getResultBuffers();
    }
    function serializePeerCommand(command, maxChunkSize) {
        switch (command.c) {
            case PeerCommandType$1.CancelSegmentRequest:
            case PeerCommandType$1.SegmentAbsent:
            case PeerCommandType$1.SegmentDataSendingCompleted: return serializePeerSegmentCommand(command, maxChunkSize);
            case PeerCommandType$1.SegmentRequest: return serializePeerSegmentRequestCommand(command, maxChunkSize);
            case PeerCommandType$1.SegmentsAnnouncement: return serializeSegmentAnnouncementCommand(command, maxChunkSize);
            case PeerCommandType$1.SegmentData: return serializePeerSendSegmentCommand(command, maxChunkSize);
        }
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/commands/index.ts
    var commands_exports = /* @__PURE__ */ __exportAll({
        BinaryCommandChunksJoiner: function () { return BinaryCommandChunksJoiner; },
        BinaryCommandJoiningError: function () { return BinaryCommandJoiningError; },
        PeerCommandType: function () { return PeerCommandType$1; },
        deserializeCommand: function () { return deserializeCommand; },
        isCommandChunk: function () { return isCommandChunk; },
        serializePeerCommand: function () { return serializePeerCommand; }
    });
    //#endregion
    //#region ../p2p-media-loader-core/src/webtorrent/utils.ts
    function getRTCError(event, fallbackMessage) {
        if (fallbackMessage === void 0) { fallbackMessage = "RTC error"; }
        var _errorEvent$error$mes, _errorEvent$error;
        var errorEvent = event;
        if (errorEvent.error instanceof Error)
            return errorEvent.error;
        var msg = (_errorEvent$error$mes = (_errorEvent$error = errorEvent.error) === null || _errorEvent$error === void 0 ? void 0 : _errorEvent$error.message) !== null && _errorEvent$error$mes !== void 0 ? _errorEvent$error$mes : fallbackMessage;
        return new Error(msg);
    }
    function getRTCErrorMessage(event, fallbackMessage) {
        if (fallbackMessage === void 0) { fallbackMessage = "RTC error"; }
        return getRTCError(event, fallbackMessage).message;
    }
    function isTerminalConnectionState(state) {
        return state === "failed" || state === "closed" || state === "disconnected";
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/webtorrent/data-channel-sender.ts
    var MAX_BUFFERED_AMOUNT = 64 * 1024;
    var _currentSendContext = /* @__PURE__ */ new WeakMap();
    var DataChannelSender = /** @class */ (function () {
        function DataChannelSender(channel, maxMessageSize) {
            _defineProperty(this, "channel", void 0);
            _defineProperty(this, "maxMessageSize", void 0);
            _classPrivateFieldInitSpec(this, _currentSendContext, void 0);
            this.channel = channel;
            this.maxMessageSize = maxMessageSize;
        }
        DataChannelSender.prototype.sendData = function (data, onChunkSent) {
            var _this = this;
            return _asyncToGenerator(function () {
                var _a, promise, resolve, reject, offset, isSettled, cleanup, onClose, onError, buffer, byteOffset, sendChunks;
                return __generator(this, function (_b) {
                    if (_classPrivateFieldGet2(_currentSendContext, _this))
                        throw new Error("Already sending data");
                    if (_this.channel.readyState !== "open")
                        throw new Error("Data channel is not open");
                    _this.channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT;
                    _a = getPromiseWithResolvers(), promise = _a.promise, resolve = _a.resolve, reject = _a.reject;
                    offset = 0;
                    isSettled = false;
                    cleanup = function () {
                        if (isSettled)
                            return false;
                        isSettled = true;
                        _classPrivateFieldSet2(_currentSendContext, _this, void 0);
                        _this.channel.removeEventListener("bufferedamountlow", sendChunks);
                        _this.channel.removeEventListener("closing", onClose);
                        _this.channel.removeEventListener("close", onClose);
                        _this.channel.removeEventListener("error", onError);
                        return true;
                    };
                    _classPrivateFieldSet2(_currentSendContext, _this, { cancel: function () {
                            if (cleanup())
                                reject(/* @__PURE__ */ new Error("Send cancelled"));
                        } });
                    onClose = function () {
                        if (cleanup())
                            reject(/* @__PURE__ */ new Error("Data channel closed"));
                    };
                    onError = function (event) {
                        if (!cleanup())
                            return;
                        var message = getRTCErrorMessage(event, "Unknown error");
                        reject(/* @__PURE__ */ new Error("Data channel error: ".concat(message)));
                    };
                    buffer = ArrayBuffer.isView(data) ? data.buffer : data;
                    byteOffset = ArrayBuffer.isView(data) ? data.byteOffset : 0;
                    sendChunks = function () {
                        if (isSettled)
                            return;
                        if (_this.channel.readyState !== "open") {
                            if (cleanup())
                                reject(/* @__PURE__ */ new Error("Data channel not open (state: ".concat(_this.channel.readyState, ")")));
                            return;
                        }
                        try {
                            while (offset < data.byteLength) {
                                if (_this.channel.bufferedAmount > MAX_BUFFERED_AMOUNT)
                                    return;
                                var bytesToSend = Math.min(_this.maxMessageSize, data.byteLength - offset);
                                var chunk = new Uint8Array(buffer, byteOffset + offset, bytesToSend);
                                _this.channel.send(chunk);
                                offset += bytesToSend;
                                onChunkSent === null || onChunkSent === void 0 || onChunkSent(bytesToSend);
                                if (!_classPrivateFieldGet2(_currentSendContext, _this))
                                    return;
                            }
                        }
                        catch (error) {
                            if (cleanup())
                                reject(error instanceof Error ? error : new Error(String(error)));
                            return;
                        }
                        if (cleanup())
                            resolve();
                    };
                    _this.channel.addEventListener("bufferedamountlow", sendChunks);
                    _this.channel.addEventListener("closing", onClose);
                    _this.channel.addEventListener("close", onClose);
                    _this.channel.addEventListener("error", onError);
                    sendChunks();
                    return [2 /*return*/, promise];
                });
            })();
        };
        DataChannelSender.prototype.cancel = function () {
            var _classPrivateFieldGet2$4;
            (_classPrivateFieldGet2$4 = _classPrivateFieldGet2(_currentSendContext, this)) === null || _classPrivateFieldGet2$4 === void 0 || _classPrivateFieldGet2$4.cancel();
        };
        return DataChannelSender;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/peer-protocol.ts
    var logger = (0, import_browser.default)("p2pml-core:peer-protocol");
    var _commandChunks = /* @__PURE__ */ new WeakMap();
    var _dataChannelSender = /* @__PURE__ */ new WeakMap();
    var _uploadingRequestId = /* @__PURE__ */ new WeakMap();
    var _onChunkDownloaded = /* @__PURE__ */ new WeakMap();
    var _onChunkUploaded = /* @__PURE__ */ new WeakMap();
    var _channel = /* @__PURE__ */ new WeakMap();
    var _peerConfig$1 = /* @__PURE__ */ new WeakMap();
    var _eventHandlers$1 = /* @__PURE__ */ new WeakMap();
    var _peerId = /* @__PURE__ */ new WeakMap();
    var _onMessageReceived = /* @__PURE__ */ new WeakMap();
    var _PeerProtocol_brand = /* @__PURE__ */ new WeakSet();
    var PeerProtocol = /** @class */ (function () {
        function PeerProtocol(channel, peerConfig, eventHandlers, eventTarget, peerId) {
            var _this_1 = this;
            _classPrivateMethodInitSpec(this, _PeerProtocol_brand);
            _classPrivateFieldInitSpec(this, _commandChunks, void 0);
            _classPrivateFieldInitSpec(this, _dataChannelSender, void 0);
            _classPrivateFieldInitSpec(this, _uploadingRequestId, void 0);
            _classPrivateFieldInitSpec(this, _onChunkDownloaded, void 0);
            _classPrivateFieldInitSpec(this, _onChunkUploaded, void 0);
            _classPrivateFieldInitSpec(this, _channel, void 0);
            _classPrivateFieldInitSpec(this, _peerConfig$1, void 0);
            _classPrivateFieldInitSpec(this, _eventHandlers$1, void 0);
            _classPrivateFieldInitSpec(this, _peerId, void 0);
            _classPrivateFieldInitSpec(this, _onMessageReceived, function (event) {
                var data = new Uint8Array(event.data);
                if (isCommandChunk(data))
                    _assertClassBrand(_PeerProtocol_brand, _this_1, _receivingCommandBytes).call(_this_1, data);
                else {
                    _classPrivateFieldGet2(_eventHandlers$1, _this_1).onSegmentChunkReceived(data);
                    _classPrivateFieldGet2(_onChunkDownloaded, _this_1).call(_this_1, data.byteLength, "p2p", _classPrivateFieldGet2(_peerId, _this_1));
                }
            });
            _classPrivateFieldSet2(_channel, this, channel);
            _classPrivateFieldSet2(_peerConfig$1, this, peerConfig);
            _classPrivateFieldSet2(_eventHandlers$1, this, eventHandlers);
            _classPrivateFieldSet2(_peerId, this, peerId);
            _classPrivateFieldSet2(_dataChannelSender, this, new DataChannelSender(channel, peerConfig.webRtcMaxMessageSize));
            _classPrivateFieldSet2(_onChunkDownloaded, this, eventTarget.getEventDispatcher("onChunkDownloaded"));
            _classPrivateFieldSet2(_onChunkUploaded, this, eventTarget.getEventDispatcher("onChunkUploaded"));
            if (channel.binaryType !== "arraybuffer")
                throw new Error("Expected binaryType \"arraybuffer\", got \"".concat(channel.binaryType, "\""));
            channel.addEventListener("message", _classPrivateFieldGet2(_onMessageReceived, this));
        }
        PeerProtocol.prototype.sendCommand = function (command) {
            var e_11, _a;
            if (_classPrivateFieldGet2(_channel, this).readyState !== "open") {
                logger("dropping command %d (channel state: %s)", command.c, _classPrivateFieldGet2(_channel, this).readyState);
                return;
            }
            var binaryCommandBuffers = serializePeerCommand(command, _classPrivateFieldGet2(_peerConfig$1, this).webRtcMaxMessageSize);
            try {
                try {
                    for (var binaryCommandBuffers_1 = __values(binaryCommandBuffers), binaryCommandBuffers_1_1 = binaryCommandBuffers_1.next(); !binaryCommandBuffers_1_1.done; binaryCommandBuffers_1_1 = binaryCommandBuffers_1.next()) {
                        var buffer = binaryCommandBuffers_1_1.value;
                        _classPrivateFieldGet2(_channel, this).send(buffer);
                    }
                }
                catch (e_11_1) { e_11 = { error: e_11_1 }; }
                finally {
                    try {
                        if (binaryCommandBuffers_1_1 && !binaryCommandBuffers_1_1.done && (_a = binaryCommandBuffers_1.return)) _a.call(binaryCommandBuffers_1);
                    }
                    finally { if (e_11) throw e_11.error; }
                }
            }
            catch (err) {
                logger("error sending command: %O", err);
            }
        };
        PeerProtocol.prototype.stopUploadingSegmentData = function () {
            _classPrivateFieldGet2(_dataChannelSender, this).cancel();
            _classPrivateFieldSet2(_uploadingRequestId, this, void 0);
        };
        PeerProtocol.prototype.getUploadingRequestId = function () {
            return _classPrivateFieldGet2(_uploadingRequestId, this);
        };
        PeerProtocol.prototype.splitSegmentDataToChunksAndUploadAsync = function (data, requestId) {
            var _this = this;
            return _asyncToGenerator(function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (_classPrivateFieldGet2(_uploadingRequestId, _this) !== void 0)
                                throw new Error("Some segment data is already uploading.");
                            _classPrivateFieldSet2(_uploadingRequestId, _this, requestId);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, , 3, 4]);
                            return [4 /*yield*/, _classPrivateFieldGet2(_dataChannelSender, _this).sendData(data, function (chunkSize) {
                                    _classPrivateFieldGet2(_onChunkUploaded, _this).call(_this, chunkSize, _classPrivateFieldGet2(_peerId, _this));
                                })];
                        case 2:
                            _a.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            if (_classPrivateFieldGet2(_uploadingRequestId, _this) === requestId)
                                _classPrivateFieldSet2(_uploadingRequestId, _this, void 0);
                            return [7 /*endfinally*/];
                        case 4: return [2 /*return*/];
                    }
                });
            })();
        };
        PeerProtocol.prototype.destroy = function () {
            _classPrivateFieldGet2(_channel, this).removeEventListener("message", _classPrivateFieldGet2(_onMessageReceived, this));
            _classPrivateFieldGet2(_dataChannelSender, this).cancel();
            _classPrivateFieldSet2(_commandChunks, this, void 0);
            _classPrivateFieldSet2(_uploadingRequestId, this, void 0);
        };
        return PeerProtocol;
    }());
    function _receivingCommandBytes(buffer) {
        var _this_1 = this;
        var _classPrivateFieldGet2$3;
        (_classPrivateFieldGet2$3 = _classPrivateFieldGet2(_commandChunks, this)) !== null && _classPrivateFieldGet2$3 !== void 0 || _classPrivateFieldSet2(_commandChunks, this, new BinaryCommandChunksJoiner(function (commandBuffer) {
            _classPrivateFieldSet2(_commandChunks, _this_1, void 0);
            try {
                var command = deserializeCommand(commandBuffer);
                _classPrivateFieldGet2(_eventHandlers$1, _this_1).onCommandReceived(command);
            }
            catch (err) {
                logger("error processing command: %O", err);
            }
        }));
        try {
            _classPrivateFieldGet2(_commandChunks, this).addCommandChunk(buffer);
        }
        catch (err) {
            logger("error receiving command chunks: %O", err);
            _classPrivateFieldSet2(_commandChunks, this, void 0);
        }
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/bandwidth-calculator.ts
    var MIN_TIME_DIFF_MS = 1;
    var BandwidthCalculator = /** @class */ (function () {
        function BandwidthCalculator(clearThresholdMs) {
            if (clearThresholdMs === void 0) { clearThresholdMs = 2e4; }
            _defineProperty(this, "clearThresholdMs", void 0);
            _defineProperty(this, "loadingsCount", 0);
            _defineProperty(this, "bytes", []);
            _defineProperty(this, "loadingOnlyTimestamps", []);
            _defineProperty(this, "timestamps", []);
            _defineProperty(this, "noLoadingsTime", 0);
            _defineProperty(this, "loadingsStoppedAt", 0);
            this.clearThresholdMs = clearThresholdMs;
        }
        BandwidthCalculator.prototype.addBytes = function (bytesLength, now) {
            if (now === void 0) { now = performance.now(); }
            this.bytes.push(bytesLength);
            this.loadingOnlyTimestamps.push(now - this.noLoadingsTime);
            this.timestamps.push(now);
        };
        BandwidthCalculator.prototype.startLoading = function (now) {
            if (now === void 0) { now = performance.now(); }
            this.clearStale();
            if (this.loadingsCount === 0 && this.loadingsStoppedAt !== 0)
                this.noLoadingsTime += now - this.loadingsStoppedAt;
            this.loadingsCount++;
        };
        BandwidthCalculator.prototype.stopLoading = function (now) {
            if (now === void 0) { now = performance.now(); }
            if (this.loadingsCount > 0) {
                this.loadingsCount--;
                if (this.loadingsCount === 0)
                    this.loadingsStoppedAt = now;
            }
        };
        BandwidthCalculator.prototype.getBandwidthLoadingOnly = function (seconds, ignoreThresholdTimestamp) {
            if (ignoreThresholdTimestamp === void 0) { ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY; }
            if (!this.loadingOnlyTimestamps.length)
                return 0;
            var milliseconds = seconds * 1e3;
            var lastItemTimestamp = this.loadingOnlyTimestamps[this.loadingOnlyTimestamps.length - 1];
            var lastCountedTimestamp = lastItemTimestamp;
            var threshold = lastItemTimestamp - milliseconds;
            var totalBytes = 0;
            for (var i = this.bytes.length - 1; i >= 0; i--) {
                var timestamp = this.loadingOnlyTimestamps[i];
                if (timestamp < threshold || this.timestamps[i] < ignoreThresholdTimestamp)
                    break;
                lastCountedTimestamp = timestamp;
                totalBytes += this.bytes[i];
            }
            var timeDiff = Math.max(lastItemTimestamp - lastCountedTimestamp, MIN_TIME_DIFF_MS);
            return totalBytes * 8e3 / timeDiff;
        };
        BandwidthCalculator.prototype.getBandwidth = function (seconds, ignoreThresholdTimestamp, now) {
            if (ignoreThresholdTimestamp === void 0) { ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY; }
            if (now === void 0) { now = performance.now(); }
            if (!this.timestamps.length)
                return 0;
            var threshold = now - seconds * 1e3;
            var lastCountedTimestamp = now;
            var totalBytes = 0;
            for (var i = this.bytes.length - 1; i >= 0; i--) {
                var timestamp = this.timestamps[i];
                if (timestamp < threshold || timestamp < ignoreThresholdTimestamp)
                    break;
                lastCountedTimestamp = timestamp;
                totalBytes += this.bytes[i];
            }
            var timeDiff = Math.max(now - lastCountedTimestamp, MIN_TIME_DIFF_MS);
            return totalBytes * 8e3 / timeDiff;
        };
        BandwidthCalculator.prototype.clearStale = function () {
            var e_12, _a;
            if (!this.loadingOnlyTimestamps.length)
                return;
            var threshold = this.loadingOnlyTimestamps[this.loadingOnlyTimestamps.length - 1] - this.clearThresholdMs;
            var samplesToRemove = 0;
            try {
                for (var _b = __values(this.loadingOnlyTimestamps), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var timestamp = _c.value;
                    if (timestamp > threshold)
                        break;
                    samplesToRemove++;
                }
            }
            catch (e_12_1) { e_12 = { error: e_12_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_12) throw e_12.error; }
            }
            this.bytes.splice(0, samplesToRemove);
            this.loadingOnlyTimestamps.splice(0, samplesToRemove);
            this.timestamps.splice(0, samplesToRemove);
        };
        BandwidthCalculator.prototype.clear = function () {
            this.bytes.length = 0;
            this.loadingOnlyTimestamps.length = 0;
            this.timestamps.length = 0;
            this.loadingsCount = 0;
            this.noLoadingsTime = 0;
            this.loadingsStoppedAt = 0;
        };
        return BandwidthCalculator;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/peer.ts
    var PeerCommandType = commands_exports.PeerCommandType;
    var _peerProtocol = /* @__PURE__ */ new WeakMap();
    var _downloadingContext = /* @__PURE__ */ new WeakMap();
    var _loadedSegments = /* @__PURE__ */ new WeakMap();
    var _httpLoadingSegments = /* @__PURE__ */ new WeakMap();
    var _downloadingErrors = /* @__PURE__ */ new WeakMap();
    var _bandwidthCalculator = /* @__PURE__ */ new WeakMap();
    var _cachedDownloadBandwidth = /* @__PURE__ */ new WeakMap();
    var _logger$1 = /* @__PURE__ */ new WeakMap();
    var _nextRequestId = /* @__PURE__ */ new WeakMap();
    var _isDestroyed$1 = /* @__PURE__ */ new WeakMap();
    var _closeConnection = /* @__PURE__ */ new WeakMap();
    var _eventHandlers = /* @__PURE__ */ new WeakMap();
    var _peerConfig = /* @__PURE__ */ new WeakMap();
    var _Peer_brand = /* @__PURE__ */ new WeakSet();
    var _onCommandReceived = /* @__PURE__ */ new WeakMap();
    var Peer = /** @class */ (function () {
        function Peer(id, channel, closeConnection, eventHandlers, peerConfig, eventTarget) {
            var _this_1 = this;
            var _this = this;
            _classPrivateMethodInitSpec(this, _Peer_brand);
            _defineProperty(this, "id", void 0);
            _defineProperty(this, "channel", void 0);
            _defineProperty(this, "eventTarget", void 0);
            _classPrivateFieldInitSpec(this, _peerProtocol, void 0);
            _classPrivateFieldInitSpec(this, _downloadingContext, void 0);
            _classPrivateFieldInitSpec(this, _loadedSegments, /* @__PURE__ */ new Set());
            _classPrivateFieldInitSpec(this, _httpLoadingSegments, /* @__PURE__ */ new Set());
            _classPrivateFieldInitSpec(this, _downloadingErrors, []);
            _classPrivateFieldInitSpec(this, _bandwidthCalculator, new BandwidthCalculator());
            _classPrivateFieldInitSpec(this, _cachedDownloadBandwidth, {
                value: 0,
                timestamp: 0
            });
            _classPrivateFieldInitSpec(this, _logger$1, (0, import_browser.default)("p2pml-core:peer"));
            _classPrivateFieldInitSpec(this, _nextRequestId, 0);
            _classPrivateFieldInitSpec(this, _isDestroyed$1, false);
            _classPrivateFieldInitSpec(this, _closeConnection, void 0);
            _classPrivateFieldInitSpec(this, _eventHandlers, void 0);
            _classPrivateFieldInitSpec(this, _peerConfig, void 0);
            _classPrivateFieldInitSpec(this, _onCommandReceived, function () {
                var _ref = _asyncToGenerator(function (command) {
                    var _a, _b, request, controls, requestId, downloadingContext, request, controls, isValid, _classPrivateFieldGet2$2;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _a = command.c;
                                switch (_a) {
                                    case PeerCommandType.SegmentsAnnouncement: return [3 /*break*/, 1];
                                    case PeerCommandType.SegmentRequest: return [3 /*break*/, 2];
                                    case PeerCommandType.SegmentData: return [3 /*break*/, 3];
                                    case PeerCommandType.SegmentDataSendingCompleted: return [3 /*break*/, 4];
                                    case PeerCommandType.SegmentAbsent: return [3 /*break*/, 6];
                                    case PeerCommandType.CancelSegmentRequest: return [3 /*break*/, 7];
                                }
                                return [3 /*break*/, 8];
                            case 1:
                                _classPrivateFieldSet2(_loadedSegments, _this, new Set(command.l));
                                _classPrivateFieldSet2(_httpLoadingSegments, _this, new Set(command.p));
                                _classPrivateFieldGet2(_eventHandlers, _this).onSegmentsAnnouncement();
                                return [3 /*break*/, 8];
                            case 2:
                                _classPrivateFieldGet2(_peerProtocol, _this).stopUploadingSegmentData();
                                _classPrivateFieldGet2(_eventHandlers, _this).onSegmentRequested(_this, command.i, command.r, command.b);
                                return [3 /*break*/, 8];
                            case 3:
                                {
                                    if (!_classPrivateFieldGet2(_downloadingContext, _this))
                                        return [3 /*break*/, 8];
                                    if (_classPrivateFieldGet2(_downloadingContext, _this).isSegmentDataCommandReceived)
                                        return [3 /*break*/, 8];
                                    _b = _classPrivateFieldGet2(_downloadingContext, _this), request = _b.request, controls = _b.controls, requestId = _b.requestId;
                                    if (request.segment.externalId !== command.i || requestId !== command.r)
                                        return [3 /*break*/, 8];
                                    _classPrivateFieldGet2(_downloadingContext, _this).isSegmentDataCommandReceived = true;
                                    controls.firstBytesReceived();
                                    if (request.totalBytes === void 0)
                                        request.setTotalBytes(command.s);
                                    else if (request.totalBytes - request.loadedBytes !== command.s) {
                                        request.clearLoadedBytes();
                                        _assertClassBrand(_Peer_brand, _this, _sendCancelSegmentRequestCommand).call(_this, request.segment, requestId);
                                        _assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-response-bytes-length-mismatch");
                                        _this.destroy(false, "Peer response bytes length mismatch");
                                    }
                                }
                                return [3 /*break*/, 8];
                            case 4:
                                downloadingContext = _classPrivateFieldGet2(_downloadingContext, _this);
                                if (!(downloadingContext === null || downloadingContext === void 0 ? void 0 : downloadingContext.isSegmentDataCommandReceived))
                                    return [2 /*return*/];
                                request = downloadingContext.request, controls = downloadingContext.controls;
                                if (downloadingContext.request.segment.externalId !== command.i || downloadingContext.requestId !== command.r) {
                                    request.clearLoadedBytes();
                                    _assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-protocol-violation");
                                    _this.destroy(false, "Peer protocol violation");
                                    return [2 /*return*/];
                                }
                                if (request.loadedBytes !== request.totalBytes) {
                                    request.clearLoadedBytes();
                                    _assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-response-bytes-length-mismatch");
                                    _this.destroy(false, "Peer response bytes length mismatch");
                                    return [2 /*return*/];
                                }
                                return [4 /*yield*/, request.validateData(_classPrivateFieldGet2(_peerConfig, _this).validateP2PSegment)];
                            case 5:
                                isValid = _c.sent();
                                if (_classPrivateFieldGet2(_isDestroyed$1, _this))
                                    return [2 /*return*/];
                                if (_classPrivateFieldGet2(_downloadingContext, _this) !== downloadingContext)
                                    return [2 /*return*/];
                                if (!isValid) {
                                    request.clearLoadedBytes();
                                    _assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "p2p-segment-validation-failed");
                                    _this.destroy(false, "P2P segment validation failed");
                                    return [2 /*return*/];
                                }
                                _classPrivateFieldSet2(_downloadingErrors, _this, []);
                                controls.completeOnSuccess();
                                _classPrivateFieldGet2(_bandwidthCalculator, _this).stopLoading();
                                _classPrivateFieldSet2(_downloadingContext, _this, void 0);
                                return [3 /*break*/, 8];
                            case 6:
                                if (((_classPrivateFieldGet2$2 = _classPrivateFieldGet2(_downloadingContext, _this)) === null || _classPrivateFieldGet2$2 === void 0 ? void 0 : _classPrivateFieldGet2$2.request.segment.externalId) === command.i && _classPrivateFieldGet2(_downloadingContext, _this).requestId === command.r) {
                                    _assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-segment-absent");
                                    _classPrivateFieldGet2(_loadedSegments, _this).delete(command.i);
                                }
                                return [3 /*break*/, 8];
                            case 7:
                                if (_classPrivateFieldGet2(_peerProtocol, _this).getUploadingRequestId() !== command.r)
                                    return [3 /*break*/, 8];
                                _classPrivateFieldGet2(_peerProtocol, _this).stopUploadingSegmentData();
                                return [3 /*break*/, 8];
                            case 8: return [2 /*return*/];
                        }
                    });
                });
                return function (_x) {
                    return _ref.apply(this, arguments);
                };
            }());
            _defineProperty(this, "onSegmentChunkReceived", function (chunk) {
                var _classPrivateFieldGet3;
                if (!((_classPrivateFieldGet3 = _classPrivateFieldGet2(_downloadingContext, _this_1)) === null || _classPrivateFieldGet3 === void 0 ? void 0 : _classPrivateFieldGet3.isSegmentDataCommandReceived))
                    return;
                var _a = _classPrivateFieldGet2(_downloadingContext, _this_1), request = _a.request, controls = _a.controls;
                if (request.totalBytes !== void 0 && request.loadedBytes + chunk.byteLength > request.totalBytes) {
                    request.clearLoadedBytes();
                    _assertClassBrand(_Peer_brand, _this_1, _cancelSegmentDownloading).call(_this_1, "peer-response-bytes-length-mismatch");
                    _this_1.destroy(false, "Peer response bytes length mismatch");
                    return;
                }
                _classPrivateFieldGet2(_bandwidthCalculator, _this_1).addBytes(chunk.byteLength);
                _classPrivateFieldGet2(_cachedDownloadBandwidth, _this_1).timestamp = 0;
                controls.addLoadedChunk(chunk);
            });
            _defineProperty(this, "destroy", function (isConnectionClosed, error) {
                if (isConnectionClosed === void 0) { isConnectionClosed = false; }
                if (_classPrivateFieldGet2(_isDestroyed$1, _this_1))
                    return;
                _classPrivateFieldSet2(_isDestroyed$1, _this_1, true);
                _assertClassBrand(_Peer_brand, _this_1, _cancelSegmentDownloading).call(_this_1, "peer-closed");
                _classPrivateFieldGet2(_peerProtocol, _this_1).destroy();
                if (!isConnectionClosed)
                    _classPrivateFieldGet2(_closeConnection, _this_1).call(_this_1, error);
                _classPrivateFieldGet2(_logger$1, _this_1).call(_this_1, "peer closed ".concat(_this_1.id));
            });
            this.id = id;
            this.channel = channel;
            this.eventTarget = eventTarget;
            _classPrivateFieldSet2(_closeConnection, this, closeConnection);
            _classPrivateFieldSet2(_eventHandlers, this, eventHandlers);
            _classPrivateFieldSet2(_peerConfig, this, peerConfig);
            _classPrivateFieldSet2(_peerProtocol, this, new PeerProtocol(channel, peerConfig, {
                onSegmentChunkReceived: this.onSegmentChunkReceived,
                onCommandReceived: function (command) { return void _classPrivateFieldGet2(_onCommandReceived, _this_1).call(_this_1, command).catch(function (error) {
                    _classPrivateFieldGet2(_logger$1, _this_1).call(_this_1, "error processing command %O: %O", command, error);
                }); }
            }, eventTarget, id));
        }
        Object.defineProperty(Peer.prototype, "downloadingSegment", {
            get: function () {
                var _classPrivateFieldGet4;
                return (_classPrivateFieldGet4 = _classPrivateFieldGet2(_downloadingContext, this)) === null || _classPrivateFieldGet4 === void 0 ? void 0 : _classPrivateFieldGet4.request.segment;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Peer.prototype, "downloadBandwidth", {
            get: function () {
                var now = performance.now();
                if (now - _classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp > 1e3) {
                    _classPrivateFieldGet2(_cachedDownloadBandwidth, this).value = _classPrivateFieldGet2(_bandwidthCalculator, this).getBandwidthLoadingOnly(15);
                    _classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp = now;
                }
                return _classPrivateFieldGet2(_cachedDownloadBandwidth, this).value;
            },
            enumerable: false,
            configurable: true
        });
        Peer.prototype.getSegmentStatus = function (segment) {
            var externalId = segment.externalId;
            if (_classPrivateFieldGet2(_loadedSegments, this).has(externalId))
                return "loaded";
            if (_classPrivateFieldGet2(_httpLoadingSegments, this).has(externalId))
                return "http-loading";
        };
        Peer.prototype.downloadSegment = function (segmentRequest) {
            var _this_1 = this;
            if (_classPrivateFieldGet2(_isDestroyed$1, this))
                return;
            if (_classPrivateFieldGet2(_downloadingContext, this))
                throw new Error("Some segment already is downloading");
            if (segmentRequest.tryCompleteByLoadedBytes({
                downloadSource: "p2p",
                peerId: this.id
            }, {
                notReceivingBytesTimeoutMs: _classPrivateFieldGet2(_peerConfig, this).p2pNotReceivingBytesTimeoutMs,
                abort: function () { return void 0; }
            }, _classPrivateFieldGet2(_peerConfig, this).validateP2PSegment, "p2p-segment-validation-failed"))
                return;
            _classPrivateFieldGet2(_bandwidthCalculator, this).startLoading();
            _classPrivateFieldSet2(_downloadingContext, this, {
                request: segmentRequest,
                requestId: _classPrivateFieldSet2(_nextRequestId, this, (_classPrivateFieldGet2(_nextRequestId, this) + 1) % 1e3),
                isSegmentDataCommandReceived: false,
                controls: segmentRequest.start({
                    downloadSource: "p2p",
                    peerId: this.id
                }, {
                    notReceivingBytesTimeoutMs: _classPrivateFieldGet2(_peerConfig, this).p2pNotReceivingBytesTimeoutMs,
                    abort: function (error) {
                        if (!_classPrivateFieldGet2(_downloadingContext, _this_1))
                            return;
                        var _a = _classPrivateFieldGet2(_downloadingContext, _this_1), request = _a.request, requestId = _a.requestId;
                        _assertClassBrand(_Peer_brand, _this_1, _sendCancelSegmentRequestCommand).call(_this_1, request.segment, requestId);
                        _classPrivateFieldGet2(_downloadingErrors, _this_1).push(error);
                        _classPrivateFieldGet2(_bandwidthCalculator, _this_1).stopLoading();
                        if (error.type !== "abort") {
                            _classPrivateFieldGet2(_bandwidthCalculator, _this_1).clear();
                            _classPrivateFieldGet2(_cachedDownloadBandwidth, _this_1).timestamp = 0;
                            _classPrivateFieldGet2(_logger$1, _this_1).call(_this_1, "cleared bandwidth history due to ".concat(error.type));
                        }
                        _classPrivateFieldSet2(_downloadingContext, _this_1, void 0);
                        if (_classPrivateFieldGet2(_downloadingErrors, _this_1).filter(function (error) { return error.type === "bytes-receiving-timeout"; }).length >= _classPrivateFieldGet2(_peerConfig, _this_1).p2pErrorRetries)
                            _this_1.destroy(false, "Too many timeout errors");
                    }
                })
            });
            var command = {
                c: PeerCommandType.SegmentRequest,
                r: _classPrivateFieldGet2(_downloadingContext, this).requestId,
                i: segmentRequest.segment.externalId
            };
            if (segmentRequest.loadedBytes)
                command.b = segmentRequest.loadedBytes;
            _classPrivateFieldGet2(_peerProtocol, this).sendCommand(command);
        };
        Peer.prototype.uploadSegmentData = function (segment, requestId, data) {
            var _this2 = this;
            return _asyncToGenerator(function () {
                var externalId, command, _unused_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (_classPrivateFieldGet2(_isDestroyed$1, _this2))
                                return [2 /*return*/];
                            externalId = segment.externalId;
                            _classPrivateFieldGet2(_logger$1, _this2).call(_this2, "send segment ".concat(segment.externalId, " to ").concat(_this2.id, " (byteLength: ").concat(data.byteLength, ")"));
                            command = {
                                c: PeerCommandType.SegmentData,
                                i: externalId,
                                r: requestId,
                                s: data.byteLength
                            };
                            _classPrivateFieldGet2(_peerProtocol, _this2).sendCommand(command);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, _classPrivateFieldGet2(_peerProtocol, _this2).splitSegmentDataToChunksAndUploadAsync(data, requestId)];
                        case 2:
                            _a.sent();
                            if (_assertClassBrand(_Peer_brand, _this2, _checkIsDestroyed).call(_this2))
                                return [2 /*return*/];
                            _assertClassBrand(_Peer_brand, _this2, _sendSegmentDataSendingCompletedCommand).call(_this2, segment, requestId);
                            _classPrivateFieldGet2(_logger$1, _this2).call(_this2, "segment ".concat(externalId, " has been sent to ").concat(_this2.id));
                            return [3 /*break*/, 4];
                        case 3:
                            _unused_1 = _a.sent();
                            _classPrivateFieldGet2(_logger$1, _this2).call(_this2, "cancel segment uploading ".concat(externalId));
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            })();
        };
        Peer.prototype.sendSegmentsAnnouncementCommand = function (loadedSegmentsIds, httpLoadingSegmentsIds) {
            var command = {
                c: PeerCommandType.SegmentsAnnouncement,
                p: httpLoadingSegmentsIds,
                l: loadedSegmentsIds
            };
            _classPrivateFieldGet2(_peerProtocol, this).sendCommand(command);
        };
        Peer.prototype.sendSegmentAbsentCommand = function (segmentExternalId, requestId) {
            _classPrivateFieldGet2(_peerProtocol, this).sendCommand({
                c: PeerCommandType.SegmentAbsent,
                i: segmentExternalId,
                r: requestId
            });
        };
        return Peer;
    }());
    function _checkIsDestroyed() {
        return _classPrivateFieldGet2(_isDestroyed$1, this);
    }
    function _cancelSegmentDownloading(type) {
        if (!_classPrivateFieldGet2(_downloadingContext, this))
            return;
        var _a = _classPrivateFieldGet2(_downloadingContext, this), request = _a.request, controls = _a.controls;
        var segment = request.segment;
        _classPrivateFieldGet2(_logger$1, this).call(this, "cancel segment request ".concat(segment.externalId, " (").concat(type, ")"));
        var error = new RequestError(type);
        controls.abortOnError(error);
        _classPrivateFieldGet2(_bandwidthCalculator, this).stopLoading();
        _classPrivateFieldGet2(_bandwidthCalculator, this).clear();
        _classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp = 0;
        _classPrivateFieldGet2(_logger$1, this).call(this, "cleared bandwidth history due to ".concat(error.type));
        _classPrivateFieldSet2(_downloadingContext, this, void 0);
        _classPrivateFieldGet2(_downloadingErrors, this).push(error);
    }
    function _sendCancelSegmentRequestCommand(segment, requestId) {
        _classPrivateFieldGet2(_peerProtocol, this).sendCommand({
            c: PeerCommandType.CancelSegmentRequest,
            i: segment.externalId,
            r: requestId
        });
    }
    function _sendSegmentDataSendingCompletedCommand(segment, requestId) {
        _classPrivateFieldGet2(_peerProtocol, this).sendCommand({
            c: PeerCommandType.SegmentDataSendingCompleted,
            r: requestId,
            i: segment.externalId
        });
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/event-target.ts
    var EventTarget = /** @class */ (function () {
        function EventTarget() {
            _defineProperty(this, "events", /* @__PURE__ */ new Map());
        }
        EventTarget.prototype.dispatchEvent = function (eventName) {
            var e_13, _a;
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var listeners = this.events.get(eventName);
            if (!listeners)
                return;
            try {
                for (var listeners_1 = __values(listeners), listeners_1_1 = listeners_1.next(); !listeners_1_1.done; listeners_1_1 = listeners_1.next()) {
                    var listener = listeners_1_1.value;
                    try {
                        listener.apply(void 0, __spreadArray([], __read(args), false));
                    }
                    catch (_unused) { }
                }
            }
            catch (e_13_1) { e_13 = { error: e_13_1 }; }
            finally {
                try {
                    if (listeners_1_1 && !listeners_1_1.done && (_a = listeners_1.return)) _a.call(listeners_1);
                }
                finally { if (e_13) throw e_13.error; }
            }
        };
        EventTarget.prototype.getEventDispatcher = function (eventName) {
            var listeners = this.events.get(eventName);
            if (!listeners) {
                listeners = [];
                this.events.set(eventName, listeners);
            }
            var definedListeners = listeners;
            return function () {
                var e_14, _a;
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                try {
                    for (var definedListeners_1 = __values(definedListeners), definedListeners_1_1 = definedListeners_1.next(); !definedListeners_1_1.done; definedListeners_1_1 = definedListeners_1.next()) {
                        var listener = definedListeners_1_1.value;
                        try {
                            listener.apply(void 0, __spreadArray([], __read(args), false));
                        }
                        catch (_unused2) { }
                    }
                }
                catch (e_14_1) { e_14 = { error: e_14_1 }; }
                finally {
                    try {
                        if (definedListeners_1_1 && !definedListeners_1_1.done && (_a = definedListeners_1.return)) _a.call(definedListeners_1);
                    }
                    finally { if (e_14) throw e_14.error; }
                }
            };
        };
        EventTarget.prototype.addEventListener = function (eventName, listener) {
            var listeners = this.events.get(eventName);
            if (!listeners)
                this.events.set(eventName, [listener]);
            else
                listeners.push(listener);
        };
        EventTarget.prototype.removeEventListener = function (eventName, listener) {
            var listeners = this.events.get(eventName);
            if (listeners) {
                var index = listeners.indexOf(listener);
                if (index !== -1)
                    listeners.splice(index, 1);
            }
        };
        EventTarget.prototype.clear = function () {
            this.events.clear();
        };
        return EventTarget;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/webtorrent/webtorrent-client/index.ts
    var _ref, _globalObject$RTCPeer, _ref2, _globalObject$RTCSess;
    var globalObject = typeof window !== "undefined" ? window : void 0;
    var PeerConnection = (_ref = (_globalObject$RTCPeer = globalObject === null || globalObject === void 0 ? void 0 : globalObject.RTCPeerConnection) !== null && _globalObject$RTCPeer !== void 0 ? _globalObject$RTCPeer : globalObject === null || globalObject === void 0 ? void 0 : globalObject.webkitRTCPeerConnection) !== null && _ref !== void 0 ? _ref : globalObject === null || globalObject === void 0 ? void 0 : globalObject.mozRTCPeerConnection;
    var SessionDescription = (_ref2 = (_globalObject$RTCSess = globalObject === null || globalObject === void 0 ? void 0 : globalObject.RTCSessionDescription) !== null && _globalObject$RTCSess !== void 0 ? _globalObject$RTCSess : globalObject === null || globalObject === void 0 ? void 0 : globalObject.webkitRTCSessionDescription) !== null && _ref2 !== void 0 ? _ref2 : globalObject === null || globalObject === void 0 ? void 0 : globalObject.mozRTCSessionDescription;
    var WEBTORRENT_DEFAULT_OFFER_TIMEOUT = 5e4;
    var WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT = 15e3;
    var WEBTORRENT_DEFAULT_OFFERS_COUNT = 5;
    function generateOfferId() {
        var id = "";
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 20; i++)
            id += chars.charAt(Math.floor(Math.random() * 62));
        return id;
    }
    function isSessionDescriptionInit(value) {
        if (typeof value !== "object" || value === null)
            return false;
        var obj = value;
        return typeof obj.type === "string" && typeof obj.sdp === "string";
    }
    var _config$4 = /* @__PURE__ */ new WeakMap();
    var _wsClient = /* @__PURE__ */ new WeakMap();
    var _eventTarget$5 = /* @__PURE__ */ new WeakMap();
    var _pendingOffers = /* @__PURE__ */ new WeakMap();
    var _negotiatingConnections = /* @__PURE__ */ new WeakMap();
    var _destroyAbortController = /* @__PURE__ */ new WeakMap();
    var _announceTimeoutId = /* @__PURE__ */ new WeakMap();
    var _announceIntervalSeconds = /* @__PURE__ */ new WeakMap();
    var _announceRunId = /* @__PURE__ */ new WeakMap();
    var _trackerId = /* @__PURE__ */ new WeakMap();
    var _started$1 = /* @__PURE__ */ new WeakMap();
    var _WebTorrentClient_brand = /* @__PURE__ */ new WeakSet();
    var _onWsConnected = /* @__PURE__ */ new WeakMap();
    var _onWsDisconnected = /* @__PURE__ */ new WeakMap();
    var _onWsMessage = /* @__PURE__ */ new WeakMap();
    var WebTorrentClient = /** @class */ (function () {
        function WebTorrentClient(config) {
            var _this_1 = this;
            var _config$offerTimeout, _config$offersCount, _config$connectionTim, _config$claimPeer, _config$shouldGenerat;
            _classPrivateMethodInitSpec(this, _WebTorrentClient_brand);
            _classPrivateFieldInitSpec(this, _config$4, void 0);
            _classPrivateFieldInitSpec(this, _wsClient, void 0);
            _classPrivateFieldInitSpec(this, _eventTarget$5, new EventTarget());
            _classPrivateFieldInitSpec(this, _pendingOffers, /* @__PURE__ */ new Map());
            _classPrivateFieldInitSpec(this, _negotiatingConnections, /* @__PURE__ */ new Set());
            _classPrivateFieldInitSpec(this, _destroyAbortController, new SafeAbortController());
            _classPrivateFieldInitSpec(this, _announceTimeoutId, null);
            _classPrivateFieldInitSpec(this, _announceIntervalSeconds, null);
            _classPrivateFieldInitSpec(this, _announceRunId, 0);
            _classPrivateFieldInitSpec(this, _trackerId, null);
            _classPrivateFieldInitSpec(this, _started$1, false);
            _classPrivateFieldInitSpec(this, _onWsConnected, function () {
                _assertClassBrand(_WebTorrentClient_brand, _this_1, _scheduleAnnounce).call(_this_1, _DEFAULT_ANNOUNCE_INTERVAL_SECONDS._);
                _assertClassBrand(_WebTorrentClient_brand, _this_1, _announce).call(_this_1, "started").catch(function (err) {
                    if (_assertClassBrand(_WebTorrentClient_brand, _this_1, _isDestroyed).call(_this_1))
                        return;
                    _classPrivateFieldGet2(_eventTarget$5, _this_1).dispatchEvent("error", "Initial announce failed: ".concat(String(err)));
                });
            });
            _classPrivateFieldInitSpec(this, _onWsDisconnected, function () {
                _assertClassBrand(_WebTorrentClient_brand, _this_1, _clearAnnounceTimeout).call(_this_1);
                _classPrivateFieldSet2(_announceIntervalSeconds, _this_1, null);
            });
            _classPrivateFieldInitSpec(this, _onWsMessage, function (data) {
                if (_assertClassBrand(_WebTorrentClient_brand, _this_1, _isDestroyed).call(_this_1))
                    return;
                var msg;
                try {
                    var text = typeof data === "string" ? data : new TextDecoder().decode(data);
                    msg = JSON.parse(text);
                }
                catch (err) {
                    _classPrivateFieldGet2(_eventTarget$5, _this_1).dispatchEvent("error", "Failed to parse tracker message: ".concat(String(err)));
                    return;
                }
                if (typeof msg !== "object" || msg === null || Array.isArray(msg))
                    return;
                var dataObject = msg;
                var warningMessage = dataObject["warning message"];
                if (typeof warningMessage === "string")
                    _classPrivateFieldGet2(_eventTarget$5, _this_1).dispatchEvent("warning", warningMessage);
                var failureReason = dataObject["failure reason"];
                if (typeof failureReason === "string") {
                    _classPrivateFieldGet2(_eventTarget$5, _this_1).dispatchEvent("error", failureReason);
                    return;
                }
                var interval = dataObject.interval;
                if (typeof interval === "number" && interval > 0) {
                    if (_classPrivateFieldGet2(_announceIntervalSeconds, _this_1) !== interval)
                        _assertClassBrand(_WebTorrentClient_brand, _this_1, _scheduleAnnounce).call(_this_1, interval);
                }
                var trackerId = dataObject["tracker id"];
                if (typeof trackerId === "string")
                    _classPrivateFieldSet2(_trackerId, _this_1, trackerId);
                var infoHash = dataObject.info_hash;
                if (typeof infoHash === "string" && infoHash !== _classPrivateFieldGet2(_config$4, _this_1).infoHash)
                    return;
                var peerId = dataObject.peer_id;
                if (typeof peerId === "string" && peerId === _classPrivateFieldGet2(_config$4, _this_1).peerId)
                    return;
                var offerId = dataObject.offer_id;
                if (typeof peerId !== "string" || typeof offerId !== "string")
                    return;
                if (isSessionDescriptionInit(dataObject.offer))
                    _assertClassBrand(_WebTorrentClient_brand, _this_1, _handleIncomingOffer).call(_this_1, {
                        sdp: dataObject.offer,
                        peerId: peerId,
                        offerId: offerId
                    }).catch(function (err) {
                        if (_assertClassBrand(_WebTorrentClient_brand, _this_1, _isDestroyed).call(_this_1))
                            return;
                        _classPrivateFieldGet2(_eventTarget$5, _this_1).dispatchEvent("error", "Failed to handle offer: ".concat(String(err)));
                    });
                else if (isSessionDescriptionInit(dataObject.answer))
                    _assertClassBrand(_WebTorrentClient_brand, _this_1, _handleIncomingAnswer).call(_this_1, {
                        sdp: dataObject.answer,
                        peerId: peerId,
                        offerId: offerId
                    }).catch(function (err) {
                        if (_assertClassBrand(_WebTorrentClient_brand, _this_1, _isDestroyed).call(_this_1))
                            return;
                        _classPrivateFieldGet2(_eventTarget$5, _this_1).dispatchEvent("error", "Failed to handle answer: ".concat(String(err)));
                    });
            });
            _classPrivateFieldSet2(_config$4, this, {
                infoHash: config.infoHash,
                peerId: config.peerId,
                rtcConfig: config.rtcConfig,
                channelConfig: config.channelConfig,
                offerTimeout: (_config$offerTimeout = config.offerTimeout) !== null && _config$offerTimeout !== void 0 ? _config$offerTimeout : WEBTORRENT_DEFAULT_OFFER_TIMEOUT,
                offersCount: (_config$offersCount = config.offersCount) !== null && _config$offersCount !== void 0 ? _config$offersCount : WEBTORRENT_DEFAULT_OFFERS_COUNT,
                connectionTimeout: (_config$connectionTim = config.connectionTimeout) !== null && _config$connectionTim !== void 0 ? _config$connectionTim : WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT,
                claimPeer: (_config$claimPeer = config.claimPeer) !== null && _config$claimPeer !== void 0 ? _config$claimPeer : (function () { return true; }),
                shouldGenerateOffers: (_config$shouldGenerat = config.shouldGenerateOffers) !== null && _config$shouldGenerat !== void 0 ? _config$shouldGenerat : (function () { return true; })
            });
            _classPrivateFieldSet2(_wsClient, this, config.wsClient);
        }
        WebTorrentClient.prototype.addEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget$5, this).addEventListener(eventName, listener);
        };
        WebTorrentClient.prototype.removeEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget$5, this).removeEventListener(eventName, listener);
        };
        WebTorrentClient.prototype.start = function () {
            if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this) || _classPrivateFieldGet2(_started$1, this))
                return;
            _classPrivateFieldSet2(_started$1, this, true);
            _classPrivateFieldGet2(_wsClient, this).addEventListener("connected", _classPrivateFieldGet2(_onWsConnected, this));
            _classPrivateFieldGet2(_wsClient, this).addEventListener("disconnected", _classPrivateFieldGet2(_onWsDisconnected, this));
            _classPrivateFieldGet2(_wsClient, this).addEventListener("message", _classPrivateFieldGet2(_onWsMessage, this));
            if (_classPrivateFieldGet2(_wsClient, this).state === "connected")
                _classPrivateFieldGet2(_onWsConnected, this).call(this);
        };
        WebTorrentClient.prototype.destroy = function () {
            if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this))
                return;
            _classPrivateFieldGet2(_destroyAbortController, this).abort();
            _assertClassBrand(_WebTorrentClient_brand, this, _clearAnnounceTimeout).call(this);
            _assertClassBrand(_WebTorrentClient_brand, this, _sendStopped).call(this);
            _assertClassBrand(_WebTorrentClient_brand, this, _cleanupPendingOffers).call(this);
            _assertClassBrand(_WebTorrentClient_brand, this, _cleanupNegotiatingConnections).call(this);
            if (_classPrivateFieldGet2(_started$1, this)) {
                _classPrivateFieldGet2(_wsClient, this).removeEventListener("connected", _classPrivateFieldGet2(_onWsConnected, this));
                _classPrivateFieldGet2(_wsClient, this).removeEventListener("disconnected", _classPrivateFieldGet2(_onWsDisconnected, this));
                _classPrivateFieldGet2(_wsClient, this).removeEventListener("message", _classPrivateFieldGet2(_onWsMessage, this));
            }
            _classPrivateFieldGet2(_eventTarget$5, this).clear();
        };
        return WebTorrentClient;
    }());
    function _isDestroyed() {
        return _classPrivateFieldGet2(_destroyAbortController, this).signal.aborted;
    }
    function _throwIfDestroyed() {
        if (_classPrivateFieldGet2(_destroyAbortController, this).signal.aborted)
            throw new Error("Client destroyed");
    }
    function _scheduleAnnounce(intervalSeconds) {
        var _this = this;
        var _this$announceRunId;
        _assertClassBrand(_WebTorrentClient_brand, this, _clearAnnounceTimeout).call(this);
        _classPrivateFieldSet2(_announceIntervalSeconds, this, intervalSeconds);
        var runId = _classPrivateFieldSet2(_announceRunId, this, (_this$announceRunId = _classPrivateFieldGet2(_announceRunId, this), ++_this$announceRunId));
        var run = function () {
            var _ref3 = _asyncToGenerator(function () {
                var err_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, _assertClassBrand(_WebTorrentClient_brand, _this, _announce).call(_this)];
                        case 1:
                            _a.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            err_1 = _a.sent();
                            if (_assertClassBrand(_WebTorrentClient_brand, _this, _isDestroyed).call(_this))
                                return [2 /*return*/];
                            _classPrivateFieldGet2(_eventTarget$5, _this).dispatchEvent("error", "Announce failed: ".concat(String(err_1)));
                            return [3 /*break*/, 3];
                        case 3:
                            if (!_assertClassBrand(_WebTorrentClient_brand, _this, _isDestroyed).call(_this) && _classPrivateFieldGet2(_announceIntervalSeconds, _this) !== null && _classPrivateFieldGet2(_announceRunId, _this) === runId)
                                _classPrivateFieldSet2(_announceTimeoutId, _this, setTimeout(run, _classPrivateFieldGet2(_announceIntervalSeconds, _this) * 1e3));
                            return [2 /*return*/];
                    }
                });
            });
            return function run() {
                return _ref3.apply(this, arguments);
            };
        }();
        _classPrivateFieldSet2(_announceTimeoutId, this, setTimeout(run, intervalSeconds * 1e3));
    }
    function _clearAnnounceTimeout() {
        if (_classPrivateFieldGet2(_announceTimeoutId, this) !== null) {
            clearTimeout(_classPrivateFieldGet2(_announceTimeoutId, this));
            _classPrivateFieldSet2(_announceTimeoutId, this, null);
        }
    }
    function _announce(event) {
        var _this2 = this;
        return _asyncToGenerator(function () {
            var offersCount, results, results_1, results_1_1, result, offers, results_2, results_2_1, result, payload, offers_1, offers_1_1, offer;
            var e_15, _a, e_16, _b, e_17, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (_assertClassBrand(_WebTorrentClient_brand, _this2, _isDestroyed).call(_this2) || _classPrivateFieldGet2(_wsClient, _this2).state !== "connected")
                            return [2 /*return*/];
                        offersCount = _classPrivateFieldGet2(_config$4, _this2).shouldGenerateOffers() ? _classPrivateFieldGet2(_config$4, _this2).offersCount : 0;
                        return [4 /*yield*/, Promise.all(Array.from({ length: offersCount }, function () { return _assertClassBrand(_WebTorrentClient_brand, _this2, _createOffer).call(_this2).then(function (value) { return value; }, function () { return void 0; }); }))];
                    case 1:
                        results = _d.sent();
                        if (_assertClassBrand(_WebTorrentClient_brand, _this2, _isDestroyed).call(_this2)) {
                            try {
                                for (results_1 = __values(results), results_1_1 = results_1.next(); !results_1_1.done; results_1_1 = results_1.next()) {
                                    result = results_1_1.value;
                                    if (result)
                                        _assertClassBrand(_WebTorrentClient_brand, _this2, _cleanupPendingOffer).call(_this2, result.offer_id);
                                }
                            }
                            catch (e_15_1) { e_15 = { error: e_15_1 }; }
                            finally {
                                try {
                                    if (results_1_1 && !results_1_1.done && (_a = results_1.return)) _a.call(results_1);
                                }
                                finally { if (e_15) throw e_15.error; }
                            }
                            return [2 /*return*/];
                        }
                        offers = [];
                        try {
                            for (results_2 = __values(results), results_2_1 = results_2.next(); !results_2_1.done; results_2_1 = results_2.next()) {
                                result = results_2_1.value;
                                if (result)
                                    offers.push(result);
                            }
                        }
                        catch (e_16_1) { e_16 = { error: e_16_1 }; }
                        finally {
                            try {
                                if (results_2_1 && !results_2_1.done && (_b = results_2.return)) _b.call(results_2);
                            }
                            finally { if (e_16) throw e_16.error; }
                        }
                        payload = _assertClassBrand(_WebTorrentClient_brand, _this2, _buildAnnouncePayload).call(_this2, {
                            numwant: offers.length,
                            offers: offers,
                            event: event
                        });
                        try {
                            _classPrivateFieldGet2(_wsClient, _this2).send(JSON.stringify(payload));
                        }
                        catch (err) {
                            try {
                                for (offers_1 = __values(offers), offers_1_1 = offers_1.next(); !offers_1_1.done; offers_1_1 = offers_1.next()) {
                                    offer = offers_1_1.value;
                                    _assertClassBrand(_WebTorrentClient_brand, _this2, _cleanupPendingOffer).call(_this2, offer.offer_id);
                                }
                            }
                            catch (e_17_1) { e_17 = { error: e_17_1 }; }
                            finally {
                                try {
                                    if (offers_1_1 && !offers_1_1.done && (_c = offers_1.return)) _c.call(offers_1);
                                }
                                finally { if (e_17) throw e_17.error; }
                            }
                            throw err;
                        }
                        return [2 /*return*/];
                }
            });
        })();
    }
    function _createOffer() {
        var _this3 = this;
        return _asyncToGenerator(function () {
            var pc, channel, offer, sdp, offerId_1, err_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (_assertClassBrand(_WebTorrentClient_brand, _this3, _isDestroyed).call(_this3))
                            return [2 /*return*/, void 0];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, 6, 7]);
                        pc = new PeerConnection(_classPrivateFieldGet2(_config$4, _this3).rtcConfig);
                        _classPrivateFieldGet2(_negotiatingConnections, _this3).add(pc);
                        channel = pc.createDataChannel("webtorrent", _classPrivateFieldGet2(_config$4, _this3).channelConfig);
                        return [4 /*yield*/, pc.createOffer()];
                    case 2:
                        offer = _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this3, _throwIfDestroyed).call(_this3);
                        return [4 /*yield*/, pc.setLocalDescription(offer)];
                    case 3:
                        _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this3, _throwIfDestroyed).call(_this3);
                        return [4 /*yield*/, _assertClassBrand(_WebTorrentClient_brand, _this3, _waitForIceGathering).call(_this3, pc)];
                    case 4:
                        _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this3, _throwIfDestroyed).call(_this3);
                        sdp = pc.localDescription;
                        if (!(sdp === null || sdp === void 0 ? void 0 : sdp.sdp)) {
                            pc.close();
                            return [2 /*return*/];
                        }
                        offerId_1 = generateOfferId();
                        _classPrivateFieldGet2(_pendingOffers, _this3).set(offerId_1, {
                            connection: pc,
                            channel: channel,
                            timeoutId: setTimeout(function () {
                                _assertClassBrand(_WebTorrentClient_brand, _this3, _cleanupPendingOffer).call(_this3, offerId_1);
                            }, _classPrivateFieldGet2(_config$4, _this3).offerTimeout)
                        });
                        return [2 /*return*/, {
                                offer: {
                                    type: sdp.type,
                                    sdp: sdp.sdp
                                },
                                offer_id: offerId_1
                            }];
                    case 5:
                        err_2 = _a.sent();
                        pc === null || pc === void 0 || pc.close();
                        if (!_assertClassBrand(_WebTorrentClient_brand, _this3, _isDestroyed).call(_this3))
                            _classPrivateFieldGet2(_eventTarget$5, _this3).dispatchEvent("warning", "Failed to create offer: ".concat(err_2 instanceof Error ? err_2.message : String(err_2)));
                        return [2 /*return*/];
                    case 6:
                        if (pc)
                            _classPrivateFieldGet2(_negotiatingConnections, _this3).delete(pc);
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        })();
    }
    function _sendStopped() {
        if (_classPrivateFieldGet2(_wsClient, this).state !== "connected")
            return;
        var payload = _assertClassBrand(_WebTorrentClient_brand, this, _buildAnnouncePayload).call(this, {
            numwant: 0,
            offers: [],
            event: "stopped"
        });
        try {
            _classPrivateFieldGet2(_wsClient, this).send(JSON.stringify(payload));
        }
        catch (_unused) { }
    }
    function _buildAnnouncePayload(_a) {
        var numwant = _a.numwant, offers = _a.offers, event = _a.event;
        var payload = {
            action: "announce",
            info_hash: _classPrivateFieldGet2(_config$4, this).infoHash,
            peer_id: _classPrivateFieldGet2(_config$4, this).peerId,
            numwant: numwant,
            uploaded: 0,
            downloaded: 0,
            offers: offers
        };
        if (event)
            payload.event = event;
        if (_classPrivateFieldGet2(_trackerId, this))
            payload.trackerid = _classPrivateFieldGet2(_trackerId, this);
        return payload;
    }
    function _handleIncomingOffer(_a) {
        var offerSdp = _a.sdp, remotePeerId = _a.peerId, remoteOfferId = _a.offerId;
        var _this4 = this;
        return _asyncToGenerator(function () {
            var pc, answer, sdp, payload, channel, err_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (_assertClassBrand(_WebTorrentClient_brand, _this4, _isDestroyed).call(_this4))
                            return [2 /*return*/];
                        if (!_classPrivateFieldGet2(_config$4, _this4).claimPeer(remotePeerId))
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, 8, 9]);
                        pc = new PeerConnection(_classPrivateFieldGet2(_config$4, _this4).rtcConfig);
                        _classPrivateFieldGet2(_negotiatingConnections, _this4).add(pc);
                        return [4 /*yield*/, pc.setRemoteDescription(new SessionDescription(offerSdp))];
                    case 2:
                        _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
                        return [4 /*yield*/, pc.createAnswer()];
                    case 3:
                        answer = _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
                        return [4 /*yield*/, pc.setLocalDescription(answer)];
                    case 4:
                        _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
                        return [4 /*yield*/, _assertClassBrand(_WebTorrentClient_brand, _this4, _waitForIceGathering).call(_this4, pc)];
                    case 5:
                        _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
                        sdp = pc.localDescription;
                        if (!sdp)
                            throw new Error("Failed to get local description after ICE gathering");
                        payload = {
                            action: "announce",
                            info_hash: _classPrivateFieldGet2(_config$4, _this4).infoHash,
                            peer_id: _classPrivateFieldGet2(_config$4, _this4).peerId,
                            to_peer_id: remotePeerId,
                            offer_id: remoteOfferId,
                            answer: {
                                type: sdp.type,
                                sdp: sdp.sdp
                            }
                        };
                        _classPrivateFieldGet2(_wsClient, _this4).send(JSON.stringify(payload));
                        return [4 /*yield*/, _assertClassBrand(_WebTorrentClient_brand, _this4, _waitForConnection).call(_this4, pc)];
                    case 6:
                        channel = _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
                        _classPrivateFieldGet2(_eventTarget$5, _this4).dispatchEvent("peerConnected", {
                            peerId: remotePeerId,
                            connection: pc,
                            channel: channel
                        });
                        return [3 /*break*/, 9];
                    case 7:
                        err_3 = _a.sent();
                        pc === null || pc === void 0 || pc.close();
                        if (!_assertClassBrand(_WebTorrentClient_brand, _this4, _isDestroyed).call(_this4))
                            _classPrivateFieldGet2(_eventTarget$5, _this4).dispatchEvent("peerConnectFailed", {
                                peerId: remotePeerId,
                                error: err_3 instanceof Error ? err_3.message : String(err_3)
                            });
                        return [3 /*break*/, 9];
                    case 8:
                        if (pc)
                            _classPrivateFieldGet2(_negotiatingConnections, _this4).delete(pc);
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        })();
    }
    function _handleIncomingAnswer(_a) {
        var answerSdp = _a.sdp, remotePeerId = _a.peerId, ourOfferId = _a.offerId;
        var _this5 = this;
        return _asyncToGenerator(function () {
            var pending, channel, err_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (_assertClassBrand(_WebTorrentClient_brand, _this5, _isDestroyed).call(_this5))
                            return [2 /*return*/];
                        pending = _classPrivateFieldGet2(_pendingOffers, _this5).get(ourOfferId);
                        if (!pending)
                            return [2 /*return*/];
                        _classPrivateFieldGet2(_pendingOffers, _this5).delete(ourOfferId);
                        clearTimeout(pending.timeoutId);
                        if (!_classPrivateFieldGet2(_config$4, _this5).claimPeer(remotePeerId)) {
                            pending.connection.close();
                            return [2 /*return*/];
                        }
                        _classPrivateFieldGet2(_negotiatingConnections, _this5).add(pending.connection);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, pending.connection.setRemoteDescription(new SessionDescription(answerSdp))];
                    case 2:
                        _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this5, _throwIfDestroyed).call(_this5);
                        return [4 /*yield*/, _assertClassBrand(_WebTorrentClient_brand, _this5, _waitForConnection).call(_this5, pending.connection, pending.channel)];
                    case 3:
                        channel = _a.sent();
                        _assertClassBrand(_WebTorrentClient_brand, _this5, _throwIfDestroyed).call(_this5);
                        _classPrivateFieldGet2(_eventTarget$5, _this5).dispatchEvent("peerConnected", {
                            peerId: remotePeerId,
                            connection: pending.connection,
                            channel: channel
                        });
                        return [3 /*break*/, 6];
                    case 4:
                        err_4 = _a.sent();
                        pending.connection.close();
                        if (!_assertClassBrand(_WebTorrentClient_brand, _this5, _isDestroyed).call(_this5))
                            _classPrivateFieldGet2(_eventTarget$5, _this5).dispatchEvent("peerConnectFailed", {
                                peerId: remotePeerId,
                                error: err_4 instanceof Error ? err_4.message : String(err_4)
                            });
                        return [3 /*break*/, 6];
                    case 5:
                        _classPrivateFieldGet2(_negotiatingConnections, _this5).delete(pending.connection);
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        })();
    }
    function _waitForIceGathering(pc) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            if (pc.iceGatheringState === "complete") {
                resolve();
                return;
            }
            if (pc.signalingState === "closed") {
                reject(/* @__PURE__ */ new Error("RTCPeerConnection closed"));
                return;
            }
            var timeoutId = void 0;
            var cleanup = function () {
                clearTimeout(timeoutId);
                pc.removeEventListener("icegatheringstatechange", onGatheringChange);
                pc.removeEventListener("icecandidate", onIceCandidate);
                pc.removeEventListener("signalingstatechange", onSignalingChange);
                _classPrivateFieldGet2(_destroyAbortController, _this_1).signal.removeEventListener("abort", onAbort);
            };
            var onGatheringChange = function () {
                if (pc.iceGatheringState === "complete") {
                    cleanup();
                    resolve();
                }
            };
            var onIceCandidate = function (event) {
                if (event.candidate === null) {
                    cleanup();
                    resolve();
                }
            };
            var onSignalingChange = function () {
                if (pc.signalingState === "closed") {
                    cleanup();
                    reject(/* @__PURE__ */ new Error("RTCPeerConnection closed"));
                }
            };
            var onAbort = function () {
                cleanup();
                reject(/* @__PURE__ */ new Error("ICE gathering aborted due to teardown"));
            };
            if (_classPrivateFieldGet2(_destroyAbortController, _this_1).signal.aborted) {
                onAbort();
                return;
            }
            timeoutId = setTimeout(function () {
                cleanup();
                resolve();
            }, _ICE_GATHERING_TIMEOUT._);
            pc.addEventListener("icegatheringstatechange", onGatheringChange);
            pc.addEventListener("icecandidate", onIceCandidate);
            pc.addEventListener("signalingstatechange", onSignalingChange);
            _classPrivateFieldGet2(_destroyAbortController, _this_1).signal.addEventListener("abort", onAbort);
        });
    }
    function _waitForConnection(pc, channel) {
        var _this_1 = this;
        var _a = getPromiseWithResolvers(), promise = _a.promise, resolve = _a.resolve, reject = _a.reject;
        var timeoutId = void 0;
        var boundChannel = channel;
        var rejectIfTerminalState = function () {
            if (isTerminalConnectionState(pc.iceConnectionState)) {
                cleanup();
                reject(/* @__PURE__ */ new Error("ICE connection ".concat(pc.iceConnectionState)));
                return true;
            }
            return false;
        };
        var onChannelOpen = function () {
            cleanup();
            if (boundChannel)
                resolve(boundChannel);
            else
                reject(/* @__PURE__ */ new Error("Data channel missing on open"));
        };
        var onChannelError = function () {
            cleanup();
            reject(/* @__PURE__ */ new Error("Data channel error"));
        };
        var onChannelClose = function () {
            cleanup();
            reject(/* @__PURE__ */ new Error("Data channel closed prematurely"));
        };
        var bindDataChannel = function (dc) {
            boundChannel = dc;
            if (dc.readyState === "open")
                onChannelOpen();
            else if (dc.readyState === "closed" || dc.readyState === "closing")
                onChannelClose();
            else {
                dc.addEventListener("open", onChannelOpen);
                dc.addEventListener("error", onChannelError);
                dc.addEventListener("close", onChannelClose);
                dc.addEventListener("closing", onChannelClose);
            }
        };
        var onDataChannel = function (event) {
            if (!boundChannel)
                bindDataChannel(event.channel);
        };
        var onAbort = function () {
            cleanup();
            reject(/* @__PURE__ */ new Error("Connection aborted due to teardown"));
        };
        var cleanup = function () {
            clearTimeout(timeoutId);
            pc.removeEventListener("iceconnectionstatechange", rejectIfTerminalState);
            pc.removeEventListener("datachannel", onDataChannel);
            if (boundChannel) {
                boundChannel.removeEventListener("open", onChannelOpen);
                boundChannel.removeEventListener("error", onChannelError);
                boundChannel.removeEventListener("close", onChannelClose);
                boundChannel.removeEventListener("closing", onChannelClose);
            }
            _classPrivateFieldGet2(_destroyAbortController, _this_1).signal.removeEventListener("abort", onAbort);
        };
        if (_classPrivateFieldGet2(_destroyAbortController, this).signal.aborted) {
            onAbort();
            return promise;
        }
        if (rejectIfTerminalState())
            return promise;
        timeoutId = setTimeout(function () {
            cleanup();
            reject(/* @__PURE__ */ new Error("Data channel open timeout"));
        }, _classPrivateFieldGet2(_config$4, this).connectionTimeout);
        pc.addEventListener("iceconnectionstatechange", rejectIfTerminalState);
        _classPrivateFieldGet2(_destroyAbortController, this).signal.addEventListener("abort", onAbort);
        if (boundChannel)
            bindDataChannel(boundChannel);
        else
            pc.addEventListener("datachannel", onDataChannel);
        return promise;
    }
    function _cleanupPendingOffer(offerId, pending) {
        var entry = pending !== null && pending !== void 0 ? pending : _classPrivateFieldGet2(_pendingOffers, this).get(offerId);
        if (entry) {
            clearTimeout(entry.timeoutId);
            entry.connection.close();
            _classPrivateFieldGet2(_pendingOffers, this).delete(offerId);
        }
    }
    function _cleanupPendingOffers() {
        var e_18, _a;
        try {
            for (var _b = __values(_classPrivateFieldGet2(_pendingOffers, this)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), offerId = _d[0], pending = _d[1];
                _assertClassBrand(_WebTorrentClient_brand, this, _cleanupPendingOffer).call(this, offerId, pending);
            }
        }
        catch (e_18_1) { e_18 = { error: e_18_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_18) throw e_18.error; }
        }
    }
    function _cleanupNegotiatingConnections() {
        var e_19, _a;
        try {
            for (var _b = __values(_classPrivateFieldGet2(_negotiatingConnections, this)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var pc = _c.value;
                pc.close();
            }
        }
        catch (e_19_1) { e_19 = { error: e_19_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_19) throw e_19.error; }
        }
        _classPrivateFieldGet2(_negotiatingConnections, this).clear();
    }
    var _DEFAULT_ANNOUNCE_INTERVAL_SECONDS = { _: 120 };
    var _ICE_GATHERING_TIMEOUT = { _: 5e3 };
    //#endregion
    //#region ../p2p-media-loader-core/src/webtorrent/webtorrent-manager/index.ts
    var _config$3 = /* @__PURE__ */ new WeakMap();
    var _eventTarget$4 = /* @__PURE__ */ new WeakMap();
    var _connectingPeers = /* @__PURE__ */ new WeakMap();
    var _connectedPeers = /* @__PURE__ */ new WeakMap();
    var _clients = /* @__PURE__ */ new WeakMap();
    var _destroyed = /* @__PURE__ */ new WeakMap();
    var _started = /* @__PURE__ */ new WeakMap();
    var _claimPeer = /* @__PURE__ */ new WeakMap();
    var _WebTorrentManager_brand = /* @__PURE__ */ new WeakSet();
    var WebTorrentManager = /** @class */ (function () {
        function WebTorrentManager(config) {
            var _this_1 = this;
            _classPrivateMethodInitSpec(this, _WebTorrentManager_brand);
            _classPrivateFieldInitSpec(this, _config$3, void 0);
            _classPrivateFieldInitSpec(this, _eventTarget$4, new EventTarget());
            _classPrivateFieldInitSpec(this, _connectingPeers, /* @__PURE__ */ new Set());
            _classPrivateFieldInitSpec(this, _connectedPeers, /* @__PURE__ */ new Map());
            _classPrivateFieldInitSpec(this, _clients, /* @__PURE__ */ new Set());
            _classPrivateFieldInitSpec(this, _destroyed, false);
            _classPrivateFieldInitSpec(this, _started, false);
            _classPrivateFieldInitSpec(this, _claimPeer, function (remotePeerId) {
                if (_classPrivateFieldGet2(_destroyed, _this_1))
                    return false;
                if (_classPrivateFieldGet2(_connectingPeers, _this_1).has(remotePeerId) || _classPrivateFieldGet2(_connectedPeers, _this_1).has(remotePeerId))
                    return false;
                _classPrivateFieldGet2(_connectingPeers, _this_1).add(remotePeerId);
                return true;
            });
            _classPrivateFieldSet2(_config$3, this, config);
        }
        WebTorrentManager.prototype.addEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget$4, this).addEventListener(eventName, listener);
        };
        WebTorrentManager.prototype.removeEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget$4, this).removeEventListener(eventName, listener);
        };
        WebTorrentManager.prototype.start = function () {
            var e_20, _a;
            var _this_1 = this;
            if (_classPrivateFieldGet2(_destroyed, this) || _classPrivateFieldGet2(_started, this))
                return;
            _classPrivateFieldSet2(_started, this, true);
            try {
                var _loop_1 = function (url) {
                    var _d = _classPrivateFieldGet2(_config$3, this_1).socketPool.acquire(url), wsClient = _d.client, release = _d.release;
                    var client;
                    try {
                        client = new WebTorrentClient({
                            infoHash: _classPrivateFieldGet2(_config$3, this_1).infoHash,
                            peerId: _classPrivateFieldGet2(_config$3, this_1).peerId,
                            wsClient: wsClient,
                            rtcConfig: _classPrivateFieldGet2(_config$3, this_1).rtcConfig,
                            channelConfig: _classPrivateFieldGet2(_config$3, this_1).channelConfig,
                            claimPeer: _classPrivateFieldGet2(_claimPeer, this_1)
                        });
                    }
                    catch (error) {
                        release();
                        throw error;
                    }
                    var onPeerConnected = function (event) {
                        _classPrivateFieldGet2(_connectingPeers, _this_1).delete(event.peerId);
                        _assertClassBrand(_WebTorrentManager_brand, _this_1, _addConnectedPeer).call(_this_1, event.peerId, event.connection, event.channel, url);
                    };
                    var onPeerConnectFailed = function (event) {
                        if (_classPrivateFieldGet2(_connectingPeers, _this_1).has(event.peerId)) {
                            _classPrivateFieldGet2(_connectingPeers, _this_1).delete(event.peerId);
                            _classPrivateFieldGet2(_eventTarget$4, _this_1).dispatchEvent("peerConnectFailed", {
                                peerId: event.peerId,
                                trackerUrl: url,
                                error: "Connection failed: ".concat(event.error)
                            });
                        }
                    };
                    var onWarning = function (warning) {
                        _classPrivateFieldGet2(_eventTarget$4, _this_1).dispatchEvent("warning", {
                            trackerUrl: url,
                            warning: warning
                        });
                    };
                    var onError = function (error) {
                        _classPrivateFieldGet2(_eventTarget$4, _this_1).dispatchEvent("error", {
                            trackerUrl: url,
                            error: error
                        });
                    };
                    client.addEventListener("peerConnected", onPeerConnected);
                    client.addEventListener("peerConnectFailed", onPeerConnectFailed);
                    client.addEventListener("warning", onWarning);
                    client.addEventListener("error", onError);
                    var cleanupListeners = function () {
                        client.removeEventListener("peerConnected", onPeerConnected);
                        client.removeEventListener("peerConnectFailed", onPeerConnectFailed);
                        client.removeEventListener("warning", onWarning);
                        client.removeEventListener("error", onError);
                    };
                    _classPrivateFieldGet2(_clients, this_1).add({
                        client: client,
                        releaseSocket: release,
                        cleanupListeners: cleanupListeners
                    });
                    client.start();
                };
                var this_1 = this;
                try {
                    for (var _b = __values(_classPrivateFieldGet2(_config$3, this).trackerUrls), _c = _b.next(); !_c.done; _c = _b.next()) {
                        var url = _c.value;
                        _loop_1(url);
                    }
                }
                catch (e_20_1) { e_20 = { error: e_20_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                    }
                    finally { if (e_20) throw e_20.error; }
                }
            }
            catch (error) {
                this.destroy();
                throw error;
            }
        };
        WebTorrentManager.prototype.destroy = function () {
            var e_21, _a, e_22, _b;
            if (_classPrivateFieldGet2(_destroyed, this))
                return;
            _classPrivateFieldSet2(_destroyed, this, true);
            try {
                for (var _c = __values(_classPrivateFieldGet2(_clients, this)), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var _e = _d.value, client = _e.client, releaseSocket = _e.releaseSocket, cleanupListeners = _e.cleanupListeners;
                    cleanupListeners();
                    client.destroy();
                    releaseSocket();
                }
            }
            catch (e_21_1) { e_21 = { error: e_21_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                }
                finally { if (e_21) throw e_21.error; }
            }
            _classPrivateFieldGet2(_clients, this).clear();
            _classPrivateFieldGet2(_connectingPeers, this).clear();
            var connectedSnapshot = __spreadArray([], __read(_classPrivateFieldGet2(_connectedPeers, this).entries()), false);
            _classPrivateFieldGet2(_connectedPeers, this).clear();
            try {
                for (var connectedSnapshot_1 = __values(connectedSnapshot), connectedSnapshot_1_1 = connectedSnapshot_1.next(); !connectedSnapshot_1_1.done; connectedSnapshot_1_1 = connectedSnapshot_1.next()) {
                    var _f = __read(connectedSnapshot_1_1.value, 2), peerId = _f[0], peer = _f[1];
                    peer.cleanup();
                    peer.connection.close();
                    _classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerDisconnected", {
                        peerId: peerId,
                        trackerUrl: peer.trackerUrl,
                        reason: "Manager destroyed",
                        isError: false
                    });
                }
            }
            catch (e_22_1) { e_22 = { error: e_22_1 }; }
            finally {
                try {
                    if (connectedSnapshot_1_1 && !connectedSnapshot_1_1.done && (_b = connectedSnapshot_1.return)) _b.call(connectedSnapshot_1);
                }
                finally { if (e_22) throw e_22.error; }
            }
            _classPrivateFieldGet2(_eventTarget$4, this).clear();
        };
        return WebTorrentManager;
    }());
    function _closePeer(peerId, reason, isError) {
        if (_classPrivateFieldGet2(_destroyed, this))
            return;
        var connected = _classPrivateFieldGet2(_connectedPeers, this).get(peerId);
        if (connected) {
            connected.cleanup();
            connected.connection.close();
            _classPrivateFieldGet2(_connectedPeers, this).delete(peerId);
            _classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerDisconnected", {
                peerId: peerId,
                trackerUrl: connected.trackerUrl,
                reason: reason,
                isError: isError
            });
        }
    }
    function _addConnectedPeer(peerId, connection, channel, trackerUrl) {
        var _this_1 = this;
        if (isTerminalConnectionState(connection.iceConnectionState)) {
            connection.close();
            _classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerConnectFailed", {
                peerId: peerId,
                trackerUrl: trackerUrl,
                error: "Connection failed during promotion"
            });
            return;
        }
        var onDisconnect = function (reason, isError) { return _assertClassBrand(_WebTorrentManager_brand, _this_1, _closePeer).call(_this_1, peerId, reason, isError); };
        var onIceConnectionStateChange = function () {
            if (isTerminalConnectionState(connection.iceConnectionState))
                onDisconnect("ICE connection state became ".concat(connection.iceConnectionState), true);
        };
        var onChannelClose = function () { return onDisconnect("Data channel closed", false); };
        var onChannelClosing = function () { return onDisconnect("Data channel closing", false); };
        var onChannelError = function (event) {
            onDisconnect("Data channel error: ".concat(getRTCErrorMessage(event, "Data channel error")), true);
        };
        var closeRef = function (error) { return _assertClassBrand(_WebTorrentManager_brand, _this_1, _closePeer).call(_this_1, peerId, error !== null && error !== void 0 ? error : "Closed by consumer", !!error); };
        var cleanup = function () {
            closeRef = null;
            connection.removeEventListener("iceconnectionstatechange", onIceConnectionStateChange);
            channel.removeEventListener("close", onChannelClose);
            channel.removeEventListener("closing", onChannelClosing);
            channel.removeEventListener("error", onChannelError);
        };
        _classPrivateFieldGet2(_connectedPeers, this).set(peerId, {
            connection: connection,
            channel: channel,
            trackerUrl: trackerUrl,
            cleanup: cleanup
        });
        connection.addEventListener("iceconnectionstatechange", onIceConnectionStateChange);
        channel.addEventListener("close", onChannelClose);
        channel.addEventListener("closing", onChannelClosing);
        channel.addEventListener("error", onChannelError);
        _classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerConnected", {
            peerId: peerId,
            connection: connection,
            channel: channel,
            trackerUrl: trackerUrl,
            close: function (error) { return closeRef === null || closeRef === void 0 ? void 0 : closeRef(error); }
        });
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/hash.ts
    function sha1(str) {
        var bytes = utf8ToUintArray(str);
        var words = [];
        var msgLen = bytes.length * 8;
        for (var i = 0; i < bytes.length; i++)
            words[i >> 2] |= (bytes[i] & 255) << 24 - i % 4 * 8;
        words[msgLen >> 5] |= 128 << 24 - msgLen % 32;
        words[(msgLen + 64 >> 9 << 4) + 15] = msgLen;
        var h0 = 1732584193;
        var h1 = 4023233417;
        var h2 = 2562383102;
        var h3 = 271733878;
        var h4 = 3285377520;
        var w = [];
        for (var i = 0; i < words.length; i += 16) {
            var a = h0, b = h1, c = h2, d = h3, e = h4;
            for (var j = 0; j < 80; j++) {
                if (j < 16)
                    w[j] = words[i + j] | 0;
                else {
                    var n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
                    w[j] = n << 1 | n >>> 31;
                }
                var f = void 0;
                if (j < 20)
                    f = (h1 & h2 | ~h1 & h3) + 1518500249;
                else if (j < 40)
                    f = (h1 ^ h2 ^ h3) + 1859775393;
                else if (j < 60)
                    f = (h1 & h2 | h1 & h3 | h2 & h3) - 1894007588;
                else
                    f = (h1 ^ h2 ^ h3) - 899497514;
                var t = (h0 << 5 | h0 >>> 27) + h4 + (w[j] >>> 0) + f | 0;
                h4 = h3;
                h3 = h2;
                h2 = h1 << 30 | h1 >>> 2;
                h1 = h0;
                h0 = t;
            }
            h0 = h0 + a | 0;
            h1 = h1 + b | 0;
            h2 = h2 + c | 0;
            h3 = h3 + d | 0;
            h4 = h4 + e | 0;
        }
        var bin = "";
        var wordsOut = [
            h0,
            h1,
            h2,
            h3,
            h4
        ];
        for (var i = 0; i < 20; i++) {
            var shift = 24 - i % 4 * 8;
            var word = wordsOut[i >> 2];
            bin += String.fromCharCode(word >>> shift & 255);
        }
        return bin;
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/stream.ts
    var PEER_PROTOCOL_VERSION = "v2";
    /**
    * Generates a stable, unique string ID for a stream based on its properties.
    * Uses a SHA-1 hash to avoid collisions and encodes the result to standard Base64.
    */
    function generateStreamShortId(_a) {
        var bitrate = _a.bitrate, codecs = _a.codecs, width = _a.width, height = _a.height, language = _a.language, channels = _a.channels, name = _a.name, frameRate = _a.frameRate, videoRange = _a.videoRange;
        var normalizedCodecs = codecs ? codecs.split(",").map(function (c) {
            c = c.trim().toLowerCase();
            var parts = c.split(".");
            if (parts.length === 3 && (parts[0] === "avc1" || parts[0] === "avc")) {
                var profile = parseInt(parts[1], 10);
                var level = parseInt(parts[2], 10);
                if (!isNaN(profile) && !isNaN(level) && parts[1] === profile.toString() && parts[2] === level.toString()) {
                    var profileHex = "00".concat(profile.toString(16)).slice(-2);
                    var levelHex = "00".concat(level.toString(16)).slice(-2);
                    c = "".concat(parts[0], ".").concat(profileHex, "00").concat(levelHex);
                }
            }
            return c;
        }).sort().join(",") : "";
        var normalizedLanguage = language && language !== "und" ? language.slice(0, 2).toLowerCase() : "";
        var normalizedChannels = channels ? channels.toString().split("/")[0] : "";
        var normalizedName = name ? name.toLowerCase().trim() : "";
        var normalizedFrameRate = frameRate && !isNaN(Number(frameRate)) ? Number(frameRate).toString() : "";
        var normalizedVideoRange = videoRange ? videoRange.toUpperCase().trim() : "";
        var str = "".concat(bitrate !== null && bitrate !== void 0 ? bitrate : 0, "-").concat(normalizedCodecs, "-").concat(width !== null && width !== void 0 ? width : "", "-").concat(height !== null && height !== void 0 ? height : "", "-").concat(normalizedLanguage, "-").concat(normalizedChannels, "-").concat(normalizedName, "-").concat(normalizedFrameRate, "-").concat(normalizedVideoRange);
        return btoa(sha1(str));
    }
    function getStreamSwarmId(swarmId, stream) {
        return "".concat(PEER_PROTOCOL_VERSION, "-").concat(swarmId, "-").concat(getStreamId(stream));
    }
    function getSegmentFromStreamsMap(streams, segmentRuntimeId) {
        var e_23, _a;
        try {
            for (var _b = __values(streams.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var stream = _c.value;
                var segment = stream.segments.get(segmentRuntimeId);
                if (segment)
                    return segment;
            }
        }
        catch (e_23_1) { e_23 = { error: e_23_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_23) throw e_23.error; }
        }
    }
    function getSegmentFromStreamByExternalId(stream, segmentExternalId) {
        var e_24, _a;
        try {
            for (var _b = __values(stream.segments.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var segment = _c.value;
                if (segment.externalId === segmentExternalId)
                    return segment;
            }
        }
        catch (e_24_1) { e_24 = { error: e_24_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_24) throw e_24.error; }
        }
    }
    function getStreamId(stream) {
        return "".concat(stream.type, "-").concat(stream.index);
    }
    function getSegmentAvgDuration(stream) {
        var e_25, _a;
        var segments = stream.segments;
        var sumDuration = 0;
        var size = segments.size;
        try {
            for (var _b = __values(segments.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var segment = _c.value;
                var duration = segment.endTime - segment.startTime;
                sumDuration += duration;
            }
        }
        catch (e_25_1) { e_25 = { error: e_25_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_25) throw e_25.error; }
        }
        return sumDuration / size;
    }
    function calculateTimeWindows(timeWindowsConfig, availableMemoryInPercent) {
        var highDemandTimeWindow = timeWindowsConfig.highDemandTimeWindow, httpDownloadTimeWindow = timeWindowsConfig.httpDownloadTimeWindow, p2pDownloadTimeWindow = timeWindowsConfig.p2pDownloadTimeWindow;
        var result = {
            highDemandTimeWindow: highDemandTimeWindow,
            httpDownloadTimeWindow: httpDownloadTimeWindow,
            p2pDownloadTimeWindow: p2pDownloadTimeWindow
        };
        if (availableMemoryInPercent <= 5) {
            result.httpDownloadTimeWindow = 0;
            result.p2pDownloadTimeWindow = 0;
        }
        else if (availableMemoryInPercent <= 10)
            result.p2pDownloadTimeWindow = result.httpDownloadTimeWindow;
        return result;
    }
    function getSegmentPlaybackStatuses(segment, playback, timeWindowsConfig, currentP2PLoader, availableMemoryPercent) {
        var _a = calculateTimeWindows(timeWindowsConfig, availableMemoryPercent), highDemandTimeWindow = _a.highDemandTimeWindow, httpDownloadTimeWindow = _a.httpDownloadTimeWindow, p2pDownloadTimeWindow = _a.p2pDownloadTimeWindow;
        return {
            isHighDemand: isSegmentInTimeWindow(segment, playback, highDemandTimeWindow),
            isHttpDownloadable: isSegmentInTimeWindow(segment, playback, httpDownloadTimeWindow),
            isP2PDownloadable: isSegmentInTimeWindow(segment, playback, p2pDownloadTimeWindow) && currentP2PLoader.isSegmentLoadingOrLoadedBySomeone(segment)
        };
    }
    function isSegmentInTimeWindow(segment, playback, timeWindowLength) {
        var startTime = segment.startTime, endTime = segment.endTime;
        var position = playback.position, rate = playback.rate;
        return !(position + timeWindowLength * rate < startTime || position > endTime);
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/peer.ts
    var TRACKER_CLIENT_VERSION_PREFIX = "-PM".concat(formatVersion("2.3.0"), "-");
    var HASH_SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var PEER_ID_LENGTH = 20;
    function getStreamHash(streamId) {
        return btoa(sha1(streamId).slice(0, 15));
    }
    function generatePeerId(trackerClientVersionPrefix) {
        var trackerClientId = [trackerClientVersionPrefix];
        var randomCharsCount = PEER_ID_LENGTH - trackerClientVersionPrefix.length;
        for (var i = 0; i < randomCharsCount; i++)
            trackerClientId.push(HASH_SYMBOLS[Math.floor(Math.random() * 62)]);
        return trackerClientId.join("");
    }
    function formatVersion(versionString) {
        var splittedVersion = versionString.split(".");
        return "".concat("00".concat(splittedVersion[0]).slice(-2)).concat("00".concat(splittedVersion[1]).slice(-2));
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/loader.ts
    var _webtorrentManager = /* @__PURE__ */ new WeakMap();
    var _peersMap = /* @__PURE__ */ new WeakMap();
    var _swarmId = /* @__PURE__ */ new WeakMap();
    var _streamSwarmId = /* @__PURE__ */ new WeakMap();
    var _isAnnounceMicrotaskCreated = /* @__PURE__ */ new WeakMap();
    var _webtorrentManagerLogger = /* @__PURE__ */ new WeakMap();
    var _streamManifestUrl$1 = /* @__PURE__ */ new WeakMap();
    var _stream = /* @__PURE__ */ new WeakMap();
    var _requests$1 = /* @__PURE__ */ new WeakMap();
    var _segmentStorage$1 = /* @__PURE__ */ new WeakMap();
    var _config$2 = /* @__PURE__ */ new WeakMap();
    var _webTorrentSocketPool$1 = /* @__PURE__ */ new WeakMap();
    var _eventTarget$3 = /* @__PURE__ */ new WeakMap();
    var _onSegmentAnnouncement$1 = /* @__PURE__ */ new WeakMap();
    var _P2PLoader_brand = /* @__PURE__ */ new WeakSet();
    var _onPeerConnectedWebTorrent = /* @__PURE__ */ new WeakMap();
    var _onPeerDisconnectedWebTorrent = /* @__PURE__ */ new WeakMap();
    var _sendSegmentsAnnouncement = /* @__PURE__ */ new WeakMap();
    var _onSegmentRequested = /* @__PURE__ */ new WeakMap();
    var P2PLoader = /** @class */ (function () {
        function P2PLoader(streamManifestUrl, stream, requests, segmentStorage, config, webTorrentSocketPool, eventTarget, onSegmentAnnouncement) {
            var _this_1 = this;
            var _this = this;
            var _this$config$swarmId;
            _classPrivateMethodInitSpec(this, _P2PLoader_brand);
            _classPrivateFieldInitSpec(this, _webtorrentManager, void 0);
            _classPrivateFieldInitSpec(this, _peersMap, /* @__PURE__ */ new Map());
            _classPrivateFieldInitSpec(this, _swarmId, void 0);
            _classPrivateFieldInitSpec(this, _streamSwarmId, void 0);
            _classPrivateFieldInitSpec(this, _isAnnounceMicrotaskCreated, false);
            _classPrivateFieldInitSpec(this, _webtorrentManagerLogger, (0, import_browser.default)("p2pml-core:webtorrent-manager"));
            _classPrivateFieldInitSpec(this, _streamManifestUrl$1, void 0);
            _classPrivateFieldInitSpec(this, _stream, void 0);
            _classPrivateFieldInitSpec(this, _requests$1, void 0);
            _classPrivateFieldInitSpec(this, _segmentStorage$1, void 0);
            _classPrivateFieldInitSpec(this, _config$2, void 0);
            _classPrivateFieldInitSpec(this, _webTorrentSocketPool$1, void 0);
            _classPrivateFieldInitSpec(this, _eventTarget$3, void 0);
            _classPrivateFieldInitSpec(this, _onSegmentAnnouncement$1, void 0);
            _classPrivateFieldInitSpec(this, _onPeerConnectedWebTorrent, function (event) {
                _classPrivateFieldGet2(_webtorrentManagerLogger, _this_1).call(_this_1, "peerConnected: peerId=".concat(event.peerId));
                if (_classPrivateFieldGet2(_peersMap, _this_1).has(event.peerId)) {
                    event.close();
                    return;
                }
                var peer = new Peer(event.peerId, event.channel, event.close, {
                    onSegmentRequested: function (peer, segmentExternalId, requestId, byteFrom) {
                        _classPrivateFieldGet2(_onSegmentRequested, _this_1).call(_this_1, peer, segmentExternalId, requestId, byteFrom).catch(function (error) {
                            _classPrivateFieldGet2(_webtorrentManagerLogger, _this_1).call(_this_1, "Error in onSegmentRequested ".concat(segmentExternalId, " for peer ").concat(peer.id, ":"), error);
                        });
                    },
                    onSegmentsAnnouncement: _classPrivateFieldGet2(_onSegmentAnnouncement$1, _this_1)
                }, _classPrivateFieldGet2(_config$2, _this_1), _classPrivateFieldGet2(_eventTarget$3, _this_1));
                _classPrivateFieldGet2(_peersMap, _this_1).set(event.peerId, peer);
                _classPrivateFieldGet2(_eventTarget$3, _this_1).getEventDispatcher("onPeerConnect")({
                    peerId: event.peerId,
                    streamType: _classPrivateFieldGet2(_stream, _this_1).type
                });
                if (_classPrivateFieldGet2(_config$2, _this_1).isP2PUploadDisabled)
                    return;
                var _a = _assertClassBrand(_P2PLoader_brand, _this_1, _getSegmentsAnnouncement).call(_this_1), httpLoading = _a.httpLoading, loaded = _a.loaded;
                peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
            });
            _classPrivateFieldInitSpec(this, _onPeerDisconnectedWebTorrent, function (event) {
                _classPrivateFieldGet2(_webtorrentManagerLogger, _this_1).call(_this_1, "peerDisconnected: peerId=".concat(event.peerId, " reason=").concat(event.reason, " isError=").concat(event.isError));
                var peer = _classPrivateFieldGet2(_peersMap, _this_1).get(event.peerId);
                if (!peer)
                    return;
                _classPrivateFieldGet2(_peersMap, _this_1).delete(event.peerId);
                peer.destroy(true);
                if (event.isError)
                    _classPrivateFieldGet2(_eventTarget$3, _this_1).getEventDispatcher("onPeerError")({
                        peerId: event.peerId,
                        streamType: _classPrivateFieldGet2(_stream, _this_1).type,
                        error: new Error(event.reason)
                    });
                _classPrivateFieldGet2(_eventTarget$3, _this_1).getEventDispatcher("onPeerClose")({
                    peerId: peer.id,
                    streamType: _classPrivateFieldGet2(_stream, _this_1).type
                });
            });
            _defineProperty(this, "broadcastAnnouncement", function (sendEmptyAnnouncement) {
                if (sendEmptyAnnouncement === void 0) { sendEmptyAnnouncement = false; }
                if (sendEmptyAnnouncement) {
                    _classPrivateFieldGet2(_sendSegmentsAnnouncement, _this_1).call(_this_1, sendEmptyAnnouncement);
                    return;
                }
                if (_classPrivateFieldGet2(_isAnnounceMicrotaskCreated, _this_1) || _classPrivateFieldGet2(_config$2, _this_1).isP2PUploadDisabled)
                    return;
                _classPrivateFieldGet2(_sendSegmentsAnnouncement, _this_1).call(_this_1);
            });
            _classPrivateFieldInitSpec(this, _sendSegmentsAnnouncement, function (sendEmptyAnnouncement) {
                if (sendEmptyAnnouncement === void 0) { sendEmptyAnnouncement = false; }
                _classPrivateFieldSet2(_isAnnounceMicrotaskCreated, _this_1, true);
                queueMicrotask(function () {
                    var e_26, _a;
                    var _b = sendEmptyAnnouncement ? {} : _assertClassBrand(_P2PLoader_brand, _this_1, _getSegmentsAnnouncement).call(_this_1), _c = _b.loaded, loaded = _c === void 0 ? [] : _c, _d = _b.httpLoading, httpLoading = _d === void 0 ? [] : _d;
                    try {
                        for (var _e = __values(_classPrivateFieldGet2(_peersMap, _this_1).values()), _f = _e.next(); !_f.done; _f = _e.next()) {
                            var peer = _f.value;
                            peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
                        }
                    }
                    catch (e_26_1) { e_26 = { error: e_26_1 }; }
                    finally {
                        try {
                            if (_f && !_f.done && (_a = _e.return)) _a.call(_e);
                        }
                        finally { if (e_26) throw e_26.error; }
                    }
                    _classPrivateFieldSet2(_isAnnounceMicrotaskCreated, _this_1, false);
                });
            });
            _classPrivateFieldInitSpec(this, _onSegmentRequested, function () {
                var _ref = _asyncToGenerator(function (peer, segmentExternalId, requestId, byteFrom) {
                    var segment, segmentData, error_2;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                segment = getSegmentFromStreamByExternalId(_classPrivateFieldGet2(_stream, _this), segmentExternalId);
                                if (!segment)
                                    return [2 /*return*/];
                                if (_classPrivateFieldGet2(_config$2, _this).isP2PUploadDisabled) {
                                    peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
                                    return [2 /*return*/];
                                }
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, _classPrivateFieldGet2(_segmentStorage$1, _this).getSegmentData(_classPrivateFieldGet2(_swarmId, _this), _classPrivateFieldGet2(_streamSwarmId, _this), segment.externalId)];
                            case 2:
                                segmentData = _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_2 = _a.sent();
                                _classPrivateFieldGet2(_webtorrentManagerLogger, _this).call(_this, "Storage error for segment ".concat(segmentExternalId, " requested by peer ").concat(peer.id, ":"), error_2);
                                return [3 /*break*/, 4];
                            case 4:
                                if (!_classPrivateFieldGet2(_peersMap, _this).has(peer.id))
                                    return [2 /*return*/];
                                if (!segmentData) {
                                    peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
                                    return [2 /*return*/];
                                }
                                return [4 /*yield*/, peer.uploadSegmentData(segment, requestId, byteFrom !== void 0 ? new Uint8Array(segmentData).subarray(byteFrom) : segmentData)];
                            case 5:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                });
                return function (_x, _x2, _x3, _x4) {
                    return _ref.apply(this, arguments);
                };
            }());
            _classPrivateFieldSet2(_streamManifestUrl$1, this, streamManifestUrl);
            _classPrivateFieldSet2(_stream, this, stream);
            _classPrivateFieldSet2(_requests$1, this, requests);
            _classPrivateFieldSet2(_segmentStorage$1, this, segmentStorage);
            _classPrivateFieldSet2(_config$2, this, config);
            _classPrivateFieldSet2(_webTorrentSocketPool$1, this, webTorrentSocketPool);
            _classPrivateFieldSet2(_eventTarget$3, this, eventTarget);
            _classPrivateFieldSet2(_onSegmentAnnouncement$1, this, onSegmentAnnouncement);
            _classPrivateFieldSet2(_swarmId, this, (_this$config$swarmId = _classPrivateFieldGet2(_config$2, this).swarmId) !== null && _this$config$swarmId !== void 0 ? _this$config$swarmId : _classPrivateFieldGet2(_streamManifestUrl$1, this));
            _classPrivateFieldSet2(_streamSwarmId, this, getStreamSwarmId(_classPrivateFieldGet2(_swarmId, this), _classPrivateFieldGet2(_stream, this)));
            var streamHash = getStreamHash(_classPrivateFieldGet2(_streamSwarmId, this));
            var peerId = _PEER_ID_BY_INFO_HASH._.get(streamHash);
            if (!peerId) {
                peerId = generatePeerId(_classPrivateFieldGet2(_config$2, this).trackerClientVersionPrefix);
                _PEER_ID_BY_INFO_HASH._.set(streamHash, peerId);
            }
            _classPrivateFieldSet2(_webtorrentManager, this, new WebTorrentManager({
                infoHash: streamHash,
                peerId: peerId,
                trackerUrls: _classPrivateFieldGet2(_config$2, this).announceTrackers,
                rtcConfig: _classPrivateFieldGet2(_config$2, this).rtcConfig,
                socketPool: _classPrivateFieldGet2(_webTorrentSocketPool$1, this)
            }));
            _classPrivateFieldGet2(_webtorrentManager, this).addEventListener("peerConnected", _classPrivateFieldGet2(_onPeerConnectedWebTorrent, this));
            _classPrivateFieldGet2(_webtorrentManager, this).addEventListener("peerDisconnected", _classPrivateFieldGet2(_onPeerDisconnectedWebTorrent, this));
            _classPrivateFieldGet2(_webtorrentManager, this).addEventListener("peerConnectFailed", function (event) {
                _classPrivateFieldGet2(_webtorrentManagerLogger, _this_1).call(_this_1, "Peer connection failed (".concat(event.peerId, ") from tracker ").concat(event.trackerUrl, ":"), event.error);
                _classPrivateFieldGet2(_eventTarget$3, _this_1).getEventDispatcher("onPeerError")({
                    peerId: event.peerId,
                    streamType: _classPrivateFieldGet2(_stream, _this_1).type,
                    error: new Error(event.error)
                });
            });
            _classPrivateFieldGet2(_webtorrentManager, this).addEventListener("warning", function (event) {
                _classPrivateFieldGet2(_webtorrentManagerLogger, _this_1).call(_this_1, "Tracker warning (".concat(event.trackerUrl, "):"), event.warning);
                _classPrivateFieldGet2(_eventTarget$3, _this_1).getEventDispatcher("onTrackerWarning")({
                    streamType: _classPrivateFieldGet2(_stream, _this_1).type,
                    warning: new Error(event.warning)
                });
            });
            _classPrivateFieldGet2(_webtorrentManager, this).addEventListener("error", function (event) {
                _classPrivateFieldGet2(_webtorrentManagerLogger, _this_1).call(_this_1, "Tracker error (".concat(event.trackerUrl, "):"), event.error);
                _classPrivateFieldGet2(_eventTarget$3, _this_1).getEventDispatcher("onTrackerError")({
                    streamType: _classPrivateFieldGet2(_stream, _this_1).type,
                    error: new Error(event.error)
                });
            });
            _classPrivateFieldGet2(_eventTarget$3, this).addEventListener("onStorageUpdated-".concat(_classPrivateFieldGet2(_streamSwarmId, this)), this.broadcastAnnouncement);
            _classPrivateFieldGet2(_webtorrentManager, this).start();
        }
        P2PLoader.prototype.downloadSegment = function (segment) {
            var e_27, _a, e_28, _b, e_29, _c;
            var peersWithSegment = [];
            try {
                for (var _d = __values(_classPrivateFieldGet2(_peersMap, this).values()), _e = _d.next(); !_e.done; _e = _d.next()) {
                    var peer = _e.value;
                    if (!peer.downloadingSegment && peer.getSegmentStatus(segment) === "loaded")
                        peersWithSegment.push(peer);
                }
            }
            catch (e_27_1) { e_27 = { error: e_27_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
                }
                finally { if (e_27) throw e_27.error; }
            }
            if (peersWithSegment.length === 0)
                return;
            var selectedPeer;
            if (peersWithSegment.length === 1)
                selectedPeer = peersWithSegment[0];
            else {
                var maxSpeed = 0;
                try {
                    for (var peersWithSegment_1 = __values(peersWithSegment), peersWithSegment_1_1 = peersWithSegment_1.next(); !peersWithSegment_1_1.done; peersWithSegment_1_1 = peersWithSegment_1.next()) {
                        var peer = peersWithSegment_1_1.value;
                        var speed = peer.downloadBandwidth;
                        if (speed > maxSpeed)
                            maxSpeed = speed;
                    }
                }
                catch (e_28_1) { e_28 = { error: e_28_1 }; }
                finally {
                    try {
                        if (peersWithSegment_1_1 && !peersWithSegment_1_1.done && (_b = peersWithSegment_1.return)) _b.call(peersWithSegment_1);
                    }
                    finally { if (e_28) throw e_28.error; }
                }
                if (maxSpeed > 0) {
                    var baseSpeed = Math.max(1, maxSpeed * .1);
                    var unprovenPeersCount = 0;
                    var provenPeersWeight = 0;
                    try {
                        for (var peersWithSegment_2 = __values(peersWithSegment), peersWithSegment_2_1 = peersWithSegment_2.next(); !peersWithSegment_2_1.done; peersWithSegment_2_1 = peersWithSegment_2.next()) {
                            var peer = peersWithSegment_2_1.value;
                            if (peer.downloadBandwidth <= baseSpeed)
                                unprovenPeersCount++;
                            else
                                provenPeersWeight += peer.downloadBandwidth;
                        }
                    }
                    catch (e_29_1) { e_29 = { error: e_29_1 }; }
                    finally {
                        try {
                            if (peersWithSegment_2_1 && !peersWithSegment_2_1.done && (_c = peersWithSegment_2.return)) _c.call(peersWithSegment_2);
                        }
                        finally { if (e_29) throw e_29.error; }
                    }
                    var adjustedBaseSpeed_1 = baseSpeed;
                    if (unprovenPeersCount > 0 && provenPeersWeight > 0 && unprovenPeersCount * baseSpeed > provenPeersWeight)
                        adjustedBaseSpeed_1 = provenPeersWeight / unprovenPeersCount;
                    selectedPeer = getWeightedRandomItem(peersWithSegment, function (peer) { return Math.max(peer.downloadBandwidth, adjustedBaseSpeed_1); });
                }
                else
                    selectedPeer = getRandomItem(peersWithSegment);
            }
            var request = _classPrivateFieldGet2(_requests$1, this).getOrCreateRequest(segment);
            selectedPeer.downloadSegment(request);
        };
        P2PLoader.prototype.isSegmentLoadingOrLoadedBySomeone = function (segment) {
            var e_30, _a;
            try {
                for (var _b = __values(_classPrivateFieldGet2(_peersMap, this).values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var peer = _c.value;
                    if (peer.getSegmentStatus(segment))
                        return true;
                }
            }
            catch (e_30_1) { e_30 = { error: e_30_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_30) throw e_30.error; }
            }
            return false;
        };
        P2PLoader.prototype.isSegmentLoadedBySomeone = function (segment) {
            var e_31, _a;
            try {
                for (var _b = __values(_classPrivateFieldGet2(_peersMap, this).values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var peer = _c.value;
                    if (peer.getSegmentStatus(segment) === "loaded")
                        return true;
                }
            }
            catch (e_31_1) { e_31 = { error: e_31_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_31) throw e_31.error; }
            }
            return false;
        };
        Object.defineProperty(P2PLoader.prototype, "connectedPeerCount", {
            get: function () {
                return _classPrivateFieldGet2(_peersMap, this).size;
            },
            enumerable: false,
            configurable: true
        });
        P2PLoader.prototype.peers = function () {
            var _a, _b, peer, e_32_1;
            var e_32, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 5, 6, 7]);
                        _a = __values(_classPrivateFieldGet2(_peersMap, this).values()), _b = _a.next();
                        _d.label = 1;
                    case 1:
                        if (!!_b.done) return [3 /*break*/, 4];
                        peer = _b.value;
                        return [4 /*yield*/, peer];
                    case 2:
                        _d.sent();
                        _d.label = 3;
                    case 3:
                        _b = _a.next();
                        return [3 /*break*/, 1];
                    case 4: return [3 /*break*/, 7];
                    case 5:
                        e_32_1 = _d.sent();
                        e_32 = { error: e_32_1 };
                        return [3 /*break*/, 7];
                    case 6:
                        try {
                            if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
                        }
                        finally { if (e_32) throw e_32.error; }
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        };
        P2PLoader.prototype.destroy = function () {
            var e_33, _a;
            _classPrivateFieldGet2(_eventTarget$3, this).removeEventListener("onStorageUpdated-".concat(_classPrivateFieldGet2(_streamSwarmId, this)), this.broadcastAnnouncement);
            try {
                for (var _b = __values(_classPrivateFieldGet2(_peersMap, this).values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var peer = _c.value;
                    peer.destroy();
                }
            }
            catch (e_33_1) { e_33 = { error: e_33_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_33) throw e_33.error; }
            }
            _classPrivateFieldGet2(_peersMap, this).clear();
            _classPrivateFieldGet2(_webtorrentManager, this).destroy();
        };
        return P2PLoader;
    }());
    function _getSegmentsAnnouncement() {
        var e_34, _a;
        var loaded = _classPrivateFieldGet2(_segmentStorage$1, this).getStoredSegmentIds(_classPrivateFieldGet2(_swarmId, this), _classPrivateFieldGet2(_streamSwarmId, this));
        var httpLoading = [];
        try {
            for (var _b = __values(_classPrivateFieldGet2(_requests$1, this).httpRequests()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var request = _c.value;
                var segment = _classPrivateFieldGet2(_stream, this).segments.get(request.segment.runtimeId);
                if (!segment)
                    continue;
                httpLoading.push(segment.externalId);
            }
        }
        catch (e_34_1) { e_34 = { error: e_34_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_34) throw e_34.error; }
        }
        return {
            loaded: loaded,
            httpLoading: httpLoading
        };
    }
    var _PEER_ID_BY_INFO_HASH = { _: /* @__PURE__ */ new Map() };
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/logger.ts
    function getStreamString(stream) {
        return "".concat(stream.type, "-").concat(stream.index);
    }
    function getSegmentString(segment) {
        var externalId = segment.externalId;
        return "(".concat(getStreamString(segment.stream), " | ").concat(externalId, ")");
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/p2p/loaders-container.ts
    var _loaders = /* @__PURE__ */ new WeakMap();
    var _currentLoaderItem = /* @__PURE__ */ new WeakMap();
    var _logger = /* @__PURE__ */ new WeakMap();
    var _streamManifestUrl = /* @__PURE__ */ new WeakMap();
    var _requests = /* @__PURE__ */ new WeakMap();
    var _segmentStorage = /* @__PURE__ */ new WeakMap();
    var _config$1 = /* @__PURE__ */ new WeakMap();
    var _webTorrentSocketPool = /* @__PURE__ */ new WeakMap();
    var _eventTarget$2 = /* @__PURE__ */ new WeakMap();
    var _onSegmentAnnouncement = /* @__PURE__ */ new WeakMap();
    var _P2PLoadersContainer_brand = /* @__PURE__ */ new WeakSet();
    var P2PLoadersContainer = /** @class */ (function () {
        function P2PLoadersContainer(streamManifestUrl, stream, requests, segmentStorage, config, webTorrentSocketPool, eventTarget, onSegmentAnnouncement) {
            _classPrivateMethodInitSpec(this, _P2PLoadersContainer_brand);
            _classPrivateFieldInitSpec(this, _loaders, /* @__PURE__ */ new Map());
            _classPrivateFieldInitSpec(this, _currentLoaderItem, void 0);
            _classPrivateFieldInitSpec(this, _logger, (0, import_browser.default)("p2pml-core:p2p-loaders-container"));
            _classPrivateFieldInitSpec(this, _streamManifestUrl, void 0);
            _classPrivateFieldInitSpec(this, _requests, void 0);
            _classPrivateFieldInitSpec(this, _segmentStorage, void 0);
            _classPrivateFieldInitSpec(this, _config$1, void 0);
            _classPrivateFieldInitSpec(this, _webTorrentSocketPool, void 0);
            _classPrivateFieldInitSpec(this, _eventTarget$2, void 0);
            _classPrivateFieldInitSpec(this, _onSegmentAnnouncement, void 0);
            _classPrivateFieldSet2(_streamManifestUrl, this, streamManifestUrl);
            _classPrivateFieldSet2(_requests, this, requests);
            _classPrivateFieldSet2(_segmentStorage, this, segmentStorage);
            _classPrivateFieldSet2(_config$1, this, config);
            _classPrivateFieldSet2(_webTorrentSocketPool, this, webTorrentSocketPool);
            _classPrivateFieldSet2(_eventTarget$2, this, eventTarget);
            _classPrivateFieldSet2(_onSegmentAnnouncement, this, onSegmentAnnouncement);
            _classPrivateFieldSet2(_currentLoaderItem, this, _assertClassBrand(_P2PLoadersContainer_brand, this, _findOrCreateLoaderForStream).call(this, stream));
            _classPrivateFieldGet2(_logger, this).call(this, "set current p2p loader: ".concat(getStreamString(stream)));
        }
        P2PLoadersContainer.prototype.changeCurrentLoader = function (stream) {
            var _this$config$swarmId;
            var swarmId = (_this$config$swarmId = _classPrivateFieldGet2(_config$1, this).swarmId) !== null && _this$config$swarmId !== void 0 ? _this$config$swarmId : _classPrivateFieldGet2(_streamManifestUrl, this);
            var streamSwarmId = getStreamSwarmId(swarmId, _classPrivateFieldGet2(_currentLoaderItem, this).stream);
            if (!_classPrivateFieldGet2(_segmentStorage, this).getStoredSegmentIds(swarmId, streamSwarmId).length)
                _assertClassBrand(_P2PLoadersContainer_brand, this, _destroyAndRemoveLoader).call(this, _classPrivateFieldGet2(_currentLoaderItem, this));
            else
                _assertClassBrand(_P2PLoadersContainer_brand, this, _setLoaderDestroyTimeout).call(this, _classPrivateFieldGet2(_currentLoaderItem, this));
            _classPrivateFieldSet2(_currentLoaderItem, this, _assertClassBrand(_P2PLoadersContainer_brand, this, _findOrCreateLoaderForStream).call(this, stream));
            _classPrivateFieldGet2(_logger, this).call(this, "change current p2p loader: ".concat(getStreamString(stream)));
        };
        Object.defineProperty(P2PLoadersContainer.prototype, "currentLoader", {
            get: function () {
                return _classPrivateFieldGet2(_currentLoaderItem, this).loader;
            },
            enumerable: false,
            configurable: true
        });
        P2PLoadersContainer.prototype.destroy = function () {
            var e_35, _a;
            try {
                for (var _b = __values(_classPrivateFieldGet2(_loaders, this).values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = _c.value, loader = _d.loader, destroyTimeoutId = _d.destroyTimeoutId;
                    loader.destroy();
                    clearTimeout(destroyTimeoutId);
                }
            }
            catch (e_35_1) { e_35 = { error: e_35_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_35) throw e_35.error; }
            }
            _classPrivateFieldGet2(_loaders, this).clear();
        };
        return P2PLoadersContainer;
    }());
    function _createLoader(stream) {
        var _this_1 = this;
        if (_classPrivateFieldGet2(_loaders, this).has(stream.runtimeId))
            throw new Error("Loader for this stream already exists");
        var loader = new P2PLoader(_classPrivateFieldGet2(_streamManifestUrl, this), stream, _classPrivateFieldGet2(_requests, this), _classPrivateFieldGet2(_segmentStorage, this), _classPrivateFieldGet2(_config$1, this), _classPrivateFieldGet2(_webTorrentSocketPool, this), _classPrivateFieldGet2(_eventTarget$2, this), function () {
            if (_classPrivateFieldGet2(_currentLoaderItem, _this_1).loader === loader)
                _classPrivateFieldGet2(_onSegmentAnnouncement, _this_1).call(_this_1);
        });
        var loggerInfo = getStreamString(stream);
        _classPrivateFieldGet2(_logger, this).call(this, "created new loader: ".concat(loggerInfo));
        return {
            loader: loader,
            stream: stream,
            loggerInfo: getStreamString(stream)
        };
    }
    function _findOrCreateLoaderForStream(stream) {
        var loaderItem = _classPrivateFieldGet2(_loaders, this).get(stream.runtimeId);
        if (loaderItem) {
            clearTimeout(loaderItem.destroyTimeoutId);
            loaderItem.destroyTimeoutId = void 0;
            return loaderItem;
        }
        else {
            var loader = _assertClassBrand(_P2PLoadersContainer_brand, this, _createLoader).call(this, stream);
            _classPrivateFieldGet2(_loaders, this).set(stream.runtimeId, loader);
            return loader;
        }
    }
    function _setLoaderDestroyTimeout(item) {
        var _this_1 = this;
        item.destroyTimeoutId = window.setTimeout(function () { return _assertClassBrand(_P2PLoadersContainer_brand, _this_1, _destroyAndRemoveLoader).call(_this_1, item); }, _classPrivateFieldGet2(_config$1, this).p2pInactiveLoaderDestroyTimeoutMs);
    }
    function _destroyAndRemoveLoader(item) {
        item.loader.destroy();
        _classPrivateFieldGet2(_loaders, this).delete(item.stream.runtimeId);
        _classPrivateFieldGet2(_logger, this).call(this, "destroy p2p loader: ", item.loggerInfo);
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/requests/request.ts
    function mapSegmentWithStreamToSegment(segment) {
        return {
            runtimeId: segment.runtimeId,
            externalId: segment.externalId,
            url: segment.url,
            byteRange: segment.byteRange,
            startTime: segment.startTime,
            endTime: segment.endTime
        };
    }
    var Request$1 = /** @class */ (function () {
        function Request$1(segment, requestProcessQueueCallback, bandwidthCalculators, playback, playbackConfig, eventTarget) {
            var _this_1 = this;
            _defineProperty(this, "segment", void 0);
            _defineProperty(this, "requestProcessQueueCallback", void 0);
            _defineProperty(this, "bandwidthCalculators", void 0);
            _defineProperty(this, "playback", void 0);
            _defineProperty(this, "playbackConfig", void 0);
            _defineProperty(this, "currentAttempt", void 0);
            _defineProperty(this, "_failedAttempts", new FailedRequestAttempts());
            _defineProperty(this, "finalData", void 0);
            _defineProperty(this, "bytes", []);
            _defineProperty(this, "_loadedBytes", 0);
            _defineProperty(this, "_totalBytes", void 0);
            _defineProperty(this, "_status", "not-started");
            _defineProperty(this, "progress", void 0);
            _defineProperty(this, "notReceivingBytesTimeout", void 0);
            _defineProperty(this, "_abortRequestCallback", void 0);
            _defineProperty(this, "_logger", void 0);
            _defineProperty(this, "_isHandledByProcessQueue", false);
            _defineProperty(this, "onSegmentError", void 0);
            _defineProperty(this, "onSegmentAbort", void 0);
            _defineProperty(this, "onSegmentStart", void 0);
            _defineProperty(this, "onSegmentLoaded", void 0);
            _defineProperty(this, "abortOnTimeout", function () {
                var _this$_abortRequestCa;
                _this_1.throwErrorIfNotLoadingStatus();
                if (!_this_1.currentAttempt)
                    return;
                var error = new RequestError("bytes-receiving-timeout");
                (_this$_abortRequestCa = _this_1._abortRequestCallback) === null || _this$_abortRequestCa === void 0 || _this$_abortRequestCa.call(_this_1, error);
                _this_1.handleFailure(error);
            });
            _defineProperty(this, "abortOnError", function (error) {
                _this_1.throwErrorIfNotLoadingStatus();
                if (!_this_1.currentAttempt)
                    return;
                _this_1.handleFailure(error);
            });
            _defineProperty(this, "handleFailure", function (error) {
                if (!_this_1.currentAttempt)
                    return;
                _this_1.setStatus("failed");
                _this_1.logger("".concat(_this_1.downloadSource, " ").concat(_this_1.segment.externalId, " failed ").concat(error.type));
                _this_1._failedAttempts.add(_objectSpread2(_objectSpread2({}, _this_1.currentAttempt), {}, { error: error }));
                _this_1.onSegmentError({
                    segment: mapSegmentWithStreamToSegment(_this_1.segment),
                    error: error,
                    downloadSource: _this_1.currentAttempt.downloadSource,
                    peerId: _this_1.currentAttempt.downloadSource === "p2p" ? _this_1.currentAttempt.peerId : void 0,
                    streamType: _this_1.segment.stream.type
                });
                _this_1.notReceivingBytesTimeout.clear();
                _this_1.manageBandwidthCalculatorsState("stop");
                _this_1.requestProcessQueueCallback();
            });
            _defineProperty(this, "completeOnSuccess", function () {
                _this_1.throwErrorIfNotLoadingStatus();
                if (!_this_1.currentAttempt)
                    return;
                _this_1.manageBandwidthCalculatorsState("stop");
                _this_1.notReceivingBytesTimeout.clear();
                _this_1.setStatus("succeed");
                _this_1._totalBytes = _this_1._loadedBytes;
                _this_1.onSegmentLoaded({
                    segmentUrl: _this_1.segment.url,
                    bytesLength: _this_1.data.byteLength,
                    downloadSource: _this_1.currentAttempt.downloadSource,
                    peerId: _this_1.currentAttempt.downloadSource === "p2p" ? _this_1.currentAttempt.peerId : void 0,
                    streamType: _this_1.segment.stream.type
                });
                _this_1.logger("".concat(_this_1.currentAttempt.downloadSource, " ").concat(_this_1.segment.externalId, " succeed"));
                _this_1.requestProcessQueueCallback();
            });
            _defineProperty(this, "addLoadedChunk", function (chunk) {
                _this_1.throwErrorIfNotLoadingStatus();
                if (!_this_1.currentAttempt || !_this_1.progress)
                    return;
                _this_1.notReceivingBytesTimeout.restart();
                var byteLength = chunk.byteLength;
                var _a = _this_1.bandwidthCalculators, allBC = _a.all, httpBC = _a.http;
                allBC.addBytes(byteLength);
                if (_this_1.currentAttempt.downloadSource === "http")
                    httpBC.addBytes(byteLength);
                _this_1.bytes.push(chunk);
                _this_1.progress.lastLoadedChunkTimestamp = performance.now();
                _this_1.progress.loadedBytes += byteLength;
                _this_1._loadedBytes += byteLength;
            });
            _defineProperty(this, "firstBytesReceived", function () {
                _this_1.throwErrorIfNotLoadingStatus();
                _this_1.notReceivingBytesTimeout.restart();
            });
            this.segment = segment;
            this.requestProcessQueueCallback = requestProcessQueueCallback;
            this.bandwidthCalculators = bandwidthCalculators;
            this.playback = playback;
            this.playbackConfig = playbackConfig;
            this.onSegmentError = eventTarget.getEventDispatcher("onSegmentError");
            this.onSegmentAbort = eventTarget.getEventDispatcher("onSegmentAbort");
            this.onSegmentStart = eventTarget.getEventDispatcher("onSegmentStart");
            this.onSegmentLoaded = eventTarget.getEventDispatcher("onSegmentLoaded");
            var byteRange = this.segment.byteRange;
            if (byteRange) {
                var end = byteRange.end, start = byteRange.start;
                this._totalBytes = end - start + 1;
            }
            this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);
            var type = this.segment.stream.type;
            this._logger = (0, import_browser.default)("p2pml-core:request-".concat(type));
        }
        Request$1.prototype.clearLoadedBytes = function () {
            this._loadedBytes = 0;
            this.bytes = [];
            this._totalBytes = void 0;
            this.finalData = void 0;
        };
        Object.defineProperty(Request$1.prototype, "status", {
            get: function () {
                return this._status;
            },
            enumerable: false,
            configurable: true
        });
        Request$1.prototype.setStatus = function (status) {
            this._status = status;
            this._isHandledByProcessQueue = false;
        };
        Object.defineProperty(Request$1.prototype, "downloadSource", {
            get: function () {
                var _this$currentAttempt;
                return (_this$currentAttempt = this.currentAttempt) === null || _this$currentAttempt === void 0 ? void 0 : _this$currentAttempt.downloadSource;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Request$1.prototype, "loadedBytes", {
            get: function () {
                return this._loadedBytes;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Request$1.prototype, "totalBytes", {
            get: function () {
                return this._totalBytes;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Request$1.prototype, "data", {
            get: function () {
                var _this$finalData;
                (_this$finalData = this.finalData) !== null && _this$finalData !== void 0 || (this.finalData = joinChunks(this.bytes).buffer);
                return this.finalData;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Request$1.prototype, "failedAttempts", {
            get: function () {
                return this._failedAttempts;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Request$1.prototype, "isHandledByProcessQueue", {
            get: function () {
                return this._isHandledByProcessQueue;
            },
            enumerable: false,
            configurable: true
        });
        Request$1.prototype.markHandledByProcessQueue = function () {
            this._isHandledByProcessQueue = true;
        };
        Request$1.prototype.setTotalBytes = function (value) {
            if (this._totalBytes !== void 0)
                throw new Error("Request total bytes value is already set");
            this._totalBytes = value;
        };
        /**
        * Checks if all bytes are already loaded and, if so, starts, validates,
        * and completes the request without making a network request.
        *
        * Handles three cases:
        * - loadedBytes === totalBytes: start → validate → complete (returns true)
        * - loadedBytes > totalBytes: corrupted state → clearLoadedBytes (returns false)
        * - otherwise: no-op (returns false)
        *
        * The request is started synchronously so that processQueue sees
        * it as "loading" immediately. Validation runs as fire-and-forget.
        *
        * @returns true if the request was started and is being handled,
        * false if caller should proceed with a normal download.
        */
        Request$1.prototype.tryCompleteByLoadedBytes = function (requestData, controls, validate, validationErrorType) {
            if (!this._totalBytes)
                return false;
            if (this._loadedBytes > this._totalBytes) {
                this.logger("".concat(requestData.downloadSource, " ").concat(this.segment.externalId, " loaded bytes overflow: ").concat(this._loadedBytes, " > ").concat(this._totalBytes, ", clearing"));
                this.clearLoadedBytes();
                return false;
            }
            if (this._loadedBytes !== this._totalBytes)
                return false;
            var requestControls = this.start(requestData, controls);
            this.notReceivingBytesTimeout.clear();
            if (validate)
                this.validateAndComplete(requestData.downloadSource, requestControls, validate, validationErrorType);
            else
                requestControls.completeOnSuccess();
            return true;
        };
        Request$1.prototype.validateData = function (validate) {
            var _this = this;
            return _asyncToGenerator(function () {
                var err_5;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!validate)
                                return [2 /*return*/, true];
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, validate(_this.segment.url, _this.segment.byteRange, _this.data)];
                        case 2: return [2 /*return*/, _a.sent()];
                        case 3:
                            err_5 = _a.sent();
                            _this.logger("validation threw an error: ".concat(String(err_5)));
                            return [2 /*return*/, false];
                        case 4: return [2 /*return*/];
                    }
                });
            })();
        };
        Request$1.prototype.validateAndComplete = function (downloadSource, requestControls, validate, validationErrorType) {
            var _this2 = this;
            return _asyncToGenerator(function () {
                var isValid;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, _this2.validateData(validate)];
                        case 1:
                            isValid = _a.sent();
                            if (_this2._status !== "loading")
                                return [2 /*return*/];
                            if (!isValid) {
                                _this2.logger("".concat(downloadSource, " ").concat(_this2.segment.externalId, " validation failed for already-loaded bytes, clearing"));
                                _this2.clearLoadedBytes();
                                requestControls.abortOnError(new RequestError(validationErrorType));
                                return [2 /*return*/];
                            }
                            _this2.logger("".concat(downloadSource, " ").concat(_this2.segment.externalId, " validation passed for already-loaded bytes"));
                            requestControls.completeOnSuccess();
                            return [2 /*return*/];
                    }
                });
            })();
        };
        Request$1.prototype.start = function (requestData, controls) {
            if (this._status === "succeed")
                throw new Error("Request ".concat(this.segment.externalId, " has been already succeed."));
            if (this._status === "loading")
                throw new Error("Request ".concat(this.segment.externalId, " has been already started."));
            this.setStatus("loading");
            this.currentAttempt = _objectSpread2({}, requestData);
            this.progress = {
                startFromByte: this._loadedBytes,
                loadedBytes: 0,
                startTimestamp: performance.now()
            };
            this.manageBandwidthCalculatorsState("start");
            var notReceivingBytesTimeoutMs = controls.notReceivingBytesTimeoutMs, abort = controls.abort;
            this._abortRequestCallback = abort;
            if (notReceivingBytesTimeoutMs !== void 0)
                this.notReceivingBytesTimeout.start(notReceivingBytesTimeoutMs);
            this.logger("".concat(requestData.downloadSource, " ").concat(this.segment.externalId, " started"));
            this.onSegmentStart({
                segment: mapSegmentWithStreamToSegment(this.segment),
                downloadSource: requestData.downloadSource,
                peerId: requestData.downloadSource === "p2p" ? requestData.peerId : void 0
            });
            return {
                firstBytesReceived: this.firstBytesReceived,
                addLoadedChunk: this.addLoadedChunk,
                completeOnSuccess: this.completeOnSuccess,
                abortOnError: this.abortOnError
            };
        };
        Request$1.prototype.abortFromProcessQueue = function () {
            var _this$currentAttempt2, _this$_abortRequestCa2, _this$currentAttempt3, _this$currentAttempt4;
            this.throwErrorIfNotLoadingStatus();
            this.setStatus("aborted");
            this.logger("".concat((_this$currentAttempt2 = this.currentAttempt) === null || _this$currentAttempt2 === void 0 ? void 0 : _this$currentAttempt2.downloadSource, " ").concat(this.segment.externalId, " aborted"));
            (_this$_abortRequestCa2 = this._abortRequestCallback) === null || _this$_abortRequestCa2 === void 0 || _this$_abortRequestCa2.call(this, new RequestError("abort"));
            this.onSegmentAbort({
                segment: mapSegmentWithStreamToSegment(this.segment),
                downloadSource: (_this$currentAttempt3 = this.currentAttempt) === null || _this$currentAttempt3 === void 0 ? void 0 : _this$currentAttempt3.downloadSource,
                peerId: ((_this$currentAttempt4 = this.currentAttempt) === null || _this$currentAttempt4 === void 0 ? void 0 : _this$currentAttempt4.downloadSource) === "p2p" ? this.currentAttempt.peerId : void 0,
                streamType: this.segment.stream.type
            });
            this._abortRequestCallback = void 0;
            this.manageBandwidthCalculatorsState("stop");
            this.notReceivingBytesTimeout.clear();
        };
        Request$1.prototype.throwErrorIfNotLoadingStatus = function () {
            if (this._status !== "loading")
                throw new Error("Request has been already ".concat(this.status, "."));
        };
        Request$1.prototype.logger = function (message) {
            var _this$currentAttempt5;
            this._logger.color = ((_this$currentAttempt5 = this.currentAttempt) === null || _this$currentAttempt5 === void 0 ? void 0 : _this$currentAttempt5.downloadSource) === "http" ? "green" : "red";
            this._logger(message);
            this._logger.color = "";
        };
        Request$1.prototype.manageBandwidthCalculatorsState = function (state) {
            var _this$currentAttempt6;
            var _a = this.bandwidthCalculators, all = _a.all, http = _a.http;
            var method = state === "start" ? "startLoading" : "stopLoading";
            if (((_this$currentAttempt6 = this.currentAttempt) === null || _this$currentAttempt6 === void 0 ? void 0 : _this$currentAttempt6.downloadSource) === "http")
                http[method]();
            all[method]();
        };
        return Request$1;
    }());
    var FailedRequestAttempts = /** @class */ (function () {
        function FailedRequestAttempts() {
            _defineProperty(this, "attempts", []);
        }
        FailedRequestAttempts.prototype.add = function (attempt) {
            this.attempts.push(attempt);
        };
        Object.defineProperty(FailedRequestAttempts.prototype, "httpAttemptsCount", {
            get: function () {
                return this.attempts.reduce(function (sum, attempt) { return attempt.downloadSource === "http" ? sum + 1 : sum; }, 0);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(FailedRequestAttempts.prototype, "p2pAttemptsCount", {
            get: function () {
                return this.attempts.reduce(function (sum, attempt) { return attempt.downloadSource === "p2p" ? sum + 1 : sum; }, 0);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(FailedRequestAttempts.prototype, "lastAttempt", {
            get: function () {
                return this.attempts[this.attempts.length - 1];
            },
            enumerable: false,
            configurable: true
        });
        FailedRequestAttempts.prototype.clear = function () {
            this.attempts = [];
        };
        return FailedRequestAttempts;
    }());
    var Timeout = /** @class */ (function () {
        function Timeout(action) {
            _defineProperty(this, "action", void 0);
            _defineProperty(this, "timeoutId", void 0);
            _defineProperty(this, "ms", void 0);
            this.action = action;
        }
        Timeout.prototype.start = function (ms) {
            if (this.timeoutId)
                throw new Error("Timeout is already started.");
            this.ms = ms;
            this.timeoutId = window.setTimeout(this.action, this.ms);
        };
        Timeout.prototype.restart = function (ms) {
            if (this.timeoutId)
                clearTimeout(this.timeoutId);
            if (ms)
                this.ms = ms;
            if (!this.ms)
                return;
            this.timeoutId = window.setTimeout(this.action, this.ms);
        };
        Timeout.prototype.clear = function () {
            clearTimeout(this.timeoutId);
            this.timeoutId = void 0;
        };
        return Timeout;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/requests/request-container.ts
    var RequestsContainer = /** @class */ (function () {
        function RequestsContainer(requestProcessQueueCallback, bandwidthCalculators, playback, config, eventTarget) {
            _defineProperty(this, "requestProcessQueueCallback", void 0);
            _defineProperty(this, "bandwidthCalculators", void 0);
            _defineProperty(this, "playback", void 0);
            _defineProperty(this, "config", void 0);
            _defineProperty(this, "eventTarget", void 0);
            _defineProperty(this, "requests", /* @__PURE__ */ new Map());
            this.requestProcessQueueCallback = requestProcessQueueCallback;
            this.bandwidthCalculators = bandwidthCalculators;
            this.playback = playback;
            this.config = config;
            this.eventTarget = eventTarget;
        }
        Object.defineProperty(RequestsContainer.prototype, "executingHttpCount", {
            get: function () {
                var e_36, _a;
                var count = 0;
                try {
                    for (var _b = __values(this.httpRequests()), _c = _b.next(); !_c.done; _c = _b.next()) {
                        var request = _c.value;
                        if (request.status === "loading")
                            count++;
                    }
                }
                catch (e_36_1) { e_36 = { error: e_36_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                    }
                    finally { if (e_36) throw e_36.error; }
                }
                return count;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(RequestsContainer.prototype, "executingP2PCount", {
            get: function () {
                var e_37, _a;
                var count = 0;
                try {
                    for (var _b = __values(this.p2pRequests()), _c = _b.next(); !_c.done; _c = _b.next()) {
                        var request = _c.value;
                        if (request.status === "loading")
                            count++;
                    }
                }
                catch (e_37_1) { e_37 = { error: e_37_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                    }
                    finally { if (e_37) throw e_37.error; }
                }
                return count;
            },
            enumerable: false,
            configurable: true
        });
        RequestsContainer.prototype.get = function (segment) {
            return this.requests.get(segment);
        };
        RequestsContainer.prototype.getOrCreateRequest = function (segment) {
            var request = this.requests.get(segment);
            if (!request) {
                request = new Request$1(segment, this.requestProcessQueueCallback, this.bandwidthCalculators, this.playback, this.config, this.eventTarget);
                this.requests.set(segment, request);
            }
            return request;
        };
        RequestsContainer.prototype.remove = function (request) {
            this.requests.delete(request.segment);
        };
        RequestsContainer.prototype.items = function () {
            return this.requests.values();
        };
        RequestsContainer.prototype.httpRequests = function () {
            var _a, _b, request, e_38_1;
            var e_38, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 5, 6, 7]);
                        _a = __values(this.requests.values()), _b = _a.next();
                        _d.label = 1;
                    case 1:
                        if (!!_b.done) return [3 /*break*/, 4];
                        request = _b.value;
                        if (!(request.downloadSource === "http")) return [3 /*break*/, 3];
                        return [4 /*yield*/, request];
                    case 2:
                        _d.sent();
                        _d.label = 3;
                    case 3:
                        _b = _a.next();
                        return [3 /*break*/, 1];
                    case 4: return [3 /*break*/, 7];
                    case 5:
                        e_38_1 = _d.sent();
                        e_38 = { error: e_38_1 };
                        return [3 /*break*/, 7];
                    case 6:
                        try {
                            if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
                        }
                        finally { if (e_38) throw e_38.error; }
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        };
        RequestsContainer.prototype.p2pRequests = function () {
            var _a, _b, request, e_39_1;
            var e_39, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 5, 6, 7]);
                        _a = __values(this.requests.values()), _b = _a.next();
                        _d.label = 1;
                    case 1:
                        if (!!_b.done) return [3 /*break*/, 4];
                        request = _b.value;
                        if (!(request.downloadSource === "p2p")) return [3 /*break*/, 3];
                        return [4 /*yield*/, request];
                    case 2:
                        _d.sent();
                        _d.label = 3;
                    case 3:
                        _b = _a.next();
                        return [3 /*break*/, 1];
                    case 4: return [3 /*break*/, 7];
                    case 5:
                        e_39_1 = _d.sent();
                        e_39 = { error: e_39_1 };
                        return [3 /*break*/, 7];
                    case 6:
                        try {
                            if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
                        }
                        finally { if (e_39) throw e_39.error; }
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        };
        RequestsContainer.prototype.destroy = function () {
            var e_40, _a;
            try {
                for (var _b = __values(this.requests.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var request = _c.value;
                    if (request.status !== "loading")
                        continue;
                    request.abortFromProcessQueue();
                }
            }
            catch (e_40_1) { e_40 = { error: e_40_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_40) throw e_40.error; }
            }
            this.requests.clear();
        };
        return RequestsContainer;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/requests/engine-request.ts
    var EngineRequest = /** @class */ (function () {
        function EngineRequest(segment, engineCallbacks) {
            _defineProperty(this, "segment", void 0);
            _defineProperty(this, "engineCallbacks", void 0);
            _defineProperty(this, "_status", "pending");
            _defineProperty(this, "_shouldBeStartedImmediately", false);
            this.segment = segment;
            this.engineCallbacks = engineCallbacks;
        }
        Object.defineProperty(EngineRequest.prototype, "status", {
            get: function () {
                return this._status;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(EngineRequest.prototype, "shouldBeStartedImmediately", {
            get: function () {
                return this._shouldBeStartedImmediately;
            },
            enumerable: false,
            configurable: true
        });
        EngineRequest.prototype.resolve = function (data, bandwidth) {
            if (this._status !== "pending")
                return;
            this._status = "succeed";
            this.engineCallbacks.onSuccess({
                data: data,
                bandwidth: bandwidth
            });
        };
        EngineRequest.prototype.reject = function () {
            if (this._status !== "pending")
                return;
            this._status = "failed";
            this.engineCallbacks.onError(new CoreRequestError("failed"));
        };
        EngineRequest.prototype.abort = function () {
            if (this._status !== "pending")
                return;
            this._status = "aborted";
            this.engineCallbacks.onError(new CoreRequestError("aborted"));
        };
        EngineRequest.prototype.markAsShouldBeStartedImmediately = function () {
            this._shouldBeStartedImmediately = true;
        };
        return EngineRequest;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/utils/queue.ts
    function generateQueue(lastRequestedSegment, playback, playbackConfig, currentP2PLoader, availablePercentMemory) {
        var runtimeId, stream, requestedSegment, queueSegments, first, next, firstStatuses, next, second, secondStatuses, queueSegments_1, queueSegments_1_1, segment, statuses, e_41_1;
        var e_41, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    runtimeId = lastRequestedSegment.runtimeId, stream = lastRequestedSegment.stream;
                    requestedSegment = stream.segments.get(runtimeId);
                    if (!requestedSegment)
                        return [2 /*return*/];
                    queueSegments = stream.segments.values();
                    do {
                        next = queueSegments.next();
                        if (next.done)
                            return [2 /*return*/];
                        first = next.value;
                    } while (first !== requestedSegment);
                    firstStatuses = getSegmentPlaybackStatuses(first, playback, playbackConfig, currentP2PLoader, availablePercentMemory);
                    if (!isNotActualStatuses(firstStatuses)) return [3 /*break*/, 3];
                    next = queueSegments.next();
                    if (next.done)
                        return [2 /*return*/];
                    second = next.value;
                    secondStatuses = getSegmentPlaybackStatuses(second, playback, playbackConfig, currentP2PLoader, availablePercentMemory);
                    if (isNotActualStatuses(secondStatuses))
                        return [2 /*return*/];
                    firstStatuses.isHighDemand = true;
                    return [4 /*yield*/, {
                            segment: first,
                            statuses: firstStatuses
                        }];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, {
                            segment: second,
                            statuses: secondStatuses
                        }];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, {
                        segment: first,
                        statuses: firstStatuses
                    }];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 10, 11, 12]);
                    queueSegments_1 = __values(queueSegments), queueSegments_1_1 = queueSegments_1.next();
                    _b.label = 6;
                case 6:
                    if (!!queueSegments_1_1.done) return [3 /*break*/, 9];
                    segment = queueSegments_1_1.value;
                    statuses = getSegmentPlaybackStatuses(segment, playback, playbackConfig, currentP2PLoader, availablePercentMemory);
                    if (isNotActualStatuses(statuses))
                        return [3 /*break*/, 9];
                    return [4 /*yield*/, {
                            segment: segment,
                            statuses: statuses
                        }];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8:
                    queueSegments_1_1 = queueSegments_1.next();
                    return [3 /*break*/, 6];
                case 9: return [3 /*break*/, 12];
                case 10:
                    e_41_1 = _b.sent();
                    e_41 = { error: e_41_1 };
                    return [3 /*break*/, 12];
                case 11:
                    try {
                        if (queueSegments_1_1 && !queueSegments_1_1.done && (_a = queueSegments_1.return)) _a.call(queueSegments_1);
                    }
                    finally { if (e_41) throw e_41.error; }
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    }
    function isNotActualStatuses(statuses) {
        var isHighDemand = statuses.isHighDemand, isHttpDownloadable = statuses.isHttpDownloadable, isP2PDownloadable = statuses.isP2PDownloadable;
        return !isHighDemand && !isHttpDownloadable && !isP2PDownloadable;
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/hybrid-loader.ts
    var FAILED_ATTEMPTS_CLEAR_INTERVAL = 6e4;
    var PEER_UPDATE_LATENCY = 1e3;
    var HybridLoader = /** @class */ (function () {
        function HybridLoader(streamManifestUrl, lastRequestedSegment, streamDetails, config, bandwidthCalculators, segmentStorage, webTorrentSocketPool, eventTarget) {
            var _this_1 = this;
            var _this$config$swarmId;
            _defineProperty(this, "streamManifestUrl", void 0);
            _defineProperty(this, "lastRequestedSegment", void 0);
            _defineProperty(this, "streamDetails", void 0);
            _defineProperty(this, "config", void 0);
            _defineProperty(this, "bandwidthCalculators", void 0);
            _defineProperty(this, "segmentStorage", void 0);
            _defineProperty(this, "webTorrentSocketPool", void 0);
            _defineProperty(this, "eventTarget", void 0);
            _defineProperty(this, "requests", void 0);
            _defineProperty(this, "engineRequest", void 0);
            _defineProperty(this, "p2pLoaders", void 0);
            _defineProperty(this, "playback", void 0);
            _defineProperty(this, "segmentAvgDuration", void 0);
            _defineProperty(this, "logger", void 0);
            _defineProperty(this, "levelChangedTimestamp", void 0);
            _defineProperty(this, "lastQueueProcessingTimeStamp", void 0);
            _defineProperty(this, "randomHttpDownloadTimeout", void 0);
            _defineProperty(this, "initialHttpDelayTimeoutId", void 0);
            _defineProperty(this, "isProcessQueueMicrotaskCreated", false);
            _defineProperty(this, "swarmId", void 0);
            _defineProperty(this, "createdAt", performance.now());
            _defineProperty(this, "requestProcessQueueMicrotask", function (force) {
                if (force === void 0) { force = true; }
                var now = performance.now();
                if (!force && _this_1.lastQueueProcessingTimeStamp !== void 0 && now - _this_1.lastQueueProcessingTimeStamp <= 1e3 || _this_1.isProcessQueueMicrotaskCreated)
                    return;
                _this_1.isProcessQueueMicrotaskCreated = true;
                queueMicrotask(function () {
                    try {
                        _this_1.processQueue();
                        _this_1.lastQueueProcessingTimeStamp = now;
                    }
                    finally {
                        _this_1.isProcessQueueMicrotaskCreated = false;
                    }
                });
            });
            this.streamManifestUrl = streamManifestUrl;
            this.lastRequestedSegment = lastRequestedSegment;
            this.streamDetails = streamDetails;
            this.config = config;
            this.bandwidthCalculators = bandwidthCalculators;
            this.segmentStorage = segmentStorage;
            this.webTorrentSocketPool = webTorrentSocketPool;
            this.eventTarget = eventTarget;
            var activeStream = this.lastRequestedSegment.stream;
            this.swarmId = (_this$config$swarmId = this.config.swarmId) !== null && _this$config$swarmId !== void 0 ? _this$config$swarmId : this.streamManifestUrl;
            this.playback = {
                position: this.lastRequestedSegment.startTime,
                rate: 1
            };
            this.segmentAvgDuration = getSegmentAvgDuration(activeStream);
            this.requests = new RequestsContainer(this.requestProcessQueueMicrotask, this.bandwidthCalculators, this.playback, this.config, this.eventTarget);
            this.p2pLoaders = new P2PLoadersContainer(this.streamManifestUrl, this.lastRequestedSegment.stream, this.requests, this.segmentStorage, this.config, this.webTorrentSocketPool, this.eventTarget, this.requestProcessQueueMicrotask);
            this.logger = (0, import_browser.default)("p2pml-core:hybrid-loader-".concat(activeStream.type));
            this.logger.color = "coral";
            this.setIntervalLoading();
        }
        HybridLoader.prototype.setIntervalLoading = function () {
            var _this_1 = this;
            var peersCount = this.p2pLoaders.currentLoader.connectedPeerCount;
            var randomTimeout = Math.random() * PEER_UPDATE_LATENCY * peersCount + PEER_UPDATE_LATENCY;
            this.randomHttpDownloadTimeout = window.setTimeout(function () {
                _this_1.loadRandomThroughHttp();
                _this_1.setIntervalLoading();
            }, randomTimeout);
        };
        HybridLoader.prototype.loadSegment = function (segment, callbacks) {
            var _this = this;
            return _asyncToGenerator(function () {
                var stream, streamSwarmId, engineRequest, _this$engineRequest, data, queueDownloadRatio, request, error_3;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _this.logger("requests: ".concat(getSegmentString(segment)));
                            stream = segment.stream;
                            if (stream !== _this.lastRequestedSegment.stream) {
                                _this.logger("stream changed to ".concat(getStreamString(stream)));
                                _this.p2pLoaders.changeCurrentLoader(stream);
                            }
                            _this.lastRequestedSegment = segment;
                            streamSwarmId = getStreamSwarmId(_this.swarmId, stream);
                            _this.segmentStorage.onSegmentRequested(_this.swarmId, streamSwarmId, segment.externalId, segment.startTime, segment.endTime, stream.type, _this.streamDetails.isLive);
                            engineRequest = new EngineRequest(segment, callbacks);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, 5, 6]);
                            if (!_this.segmentStorage.hasSegment(_this.swarmId, streamSwarmId, segment.externalId)) return [3 /*break*/, 3];
                            return [4 /*yield*/, _this.segmentStorage.getSegmentData(_this.swarmId, streamSwarmId, segment.externalId)];
                        case 2:
                            data = _a.sent();
                            if (data) {
                                queueDownloadRatio = _this.generateQueue().queueDownloadRatio;
                                engineRequest.resolve(data, _this.getBandwidth(queueDownloadRatio));
                                return [2 /*return*/];
                            }
                            _a.label = 3;
                        case 3:
                            (_this$engineRequest = _this.engineRequest) === null || _this$engineRequest === void 0 || _this$engineRequest.abort();
                            _this.engineRequest = engineRequest;
                            request = _this.requests.get(segment);
                            if ((request === null || request === void 0 ? void 0 : request.status) === "failed")
                                request.failedAttempts.clear();
                            return [3 /*break*/, 6];
                        case 4:
                            error_3 = _a.sent();
                            _this.logger("request failed for ".concat(getSegmentString(segment), " in ").concat(getStreamString(stream)), error_3);
                            engineRequest.reject();
                            return [3 /*break*/, 6];
                        case 5:
                            _this.requestProcessQueueMicrotask();
                            return [7 /*endfinally*/];
                        case 6: return [2 /*return*/];
                    }
                });
            })();
        };
        HybridLoader.prototype.processRequests = function (queueSegmentIds, queueDownloadRatio) {
            var e_42, _a;
            var stream = this.lastRequestedSegment.stream;
            var httpErrorRetries = this.config.httpErrorRetries;
            var now = performance.now();
            try {
                for (var _b = __values(this.requests.items()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var request = _c.value;
                    var _this$engineRequest2;
                    var type = request.downloadSource, status = request.status, segment = request.segment, isHandledByProcessQueue = request.isHandledByProcessQueue;
                    var engineRequest = ((_this$engineRequest2 = this.engineRequest) === null || _this$engineRequest2 === void 0 ? void 0 : _this$engineRequest2.segment) === segment ? this.engineRequest : void 0;
                    switch (status) {
                        case "loading":
                            if (!queueSegmentIds.has(segment.runtimeId) && !engineRequest) {
                                request.abortFromProcessQueue();
                                this.requests.remove(request);
                            }
                            break;
                        case "succeed": {
                            if (!type)
                                break;
                            if (type === "http")
                                this.p2pLoaders.currentLoader.broadcastAnnouncement();
                            if (engineRequest) {
                                engineRequest.resolve(request.data, this.getBandwidth(queueDownloadRatio));
                                this.engineRequest = void 0;
                            }
                            this.requests.remove(request);
                            this.logger("succeed: ".concat(getSegmentString(segment), " (byteLength: ").concat(request.data.byteLength, ")"));
                            var streamSwarmId = getStreamSwarmId(this.swarmId, stream);
                            this.segmentStorage.storeSegment(this.swarmId, streamSwarmId, segment.externalId, request.data, segment.startTime, segment.endTime, segment.stream.type, this.streamDetails.isLive);
                            break;
                        }
                        case "failed":
                            if (type === "http" && !isHandledByProcessQueue)
                                this.p2pLoaders.currentLoader.broadcastAnnouncement();
                            if (!engineRequest && !stream.segments.has(request.segment.runtimeId))
                                this.requests.remove(request);
                            if (request.failedAttempts.httpAttemptsCount >= httpErrorRetries && engineRequest) {
                                this.engineRequest = void 0;
                                engineRequest.reject();
                            }
                            break;
                        case "not-started":
                            this.requests.remove(request);
                            break;
                        case "aborted":
                            this.requests.remove(request);
                            break;
                    }
                    request.markHandledByProcessQueue();
                    var lastAttempt = request.failedAttempts.lastAttempt;
                    if (lastAttempt && now - lastAttempt.error.timestamp > FAILED_ATTEMPTS_CLEAR_INTERVAL)
                        request.failedAttempts.clear();
                }
            }
            catch (e_42_1) { e_42 = { error: e_42_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_42) throw e_42.error; }
            }
        };
        HybridLoader.prototype.processQueue = function () {
            var e_43, _a;
            var _this_1 = this;
            var _b = this.generateQueue(), queue = _b.queue, queueSegmentIds = _b.queueSegmentIds, queueDownloadRatio = _b.queueDownloadRatio;
            this.processRequests(queueSegmentIds, queueDownloadRatio);
            var _c = this.config, simultaneousHttpDownloads = _c.simultaneousHttpDownloads, simultaneousP2PDownloads = _c.simultaneousP2PDownloads, httpErrorRetries = _c.httpErrorRetries, httpDownloadInitialTimeoutMs = _c.httpDownloadInitialTimeoutMs;
            var timeSinceStart = performance.now() - this.createdAt;
            var isInitialHttpWait = httpDownloadInitialTimeoutMs > 0 && timeSinceStart < httpDownloadInitialTimeoutMs;
            if (isInitialHttpWait) {
                var _this$initialHttpDela;
                (_this$initialHttpDela = this.initialHttpDelayTimeoutId) !== null && _this$initialHttpDela !== void 0 || (this.initialHttpDelayTimeoutId = window.setTimeout(function () {
                    _this_1.initialHttpDelayTimeoutId = void 0;
                    _this_1.requestProcessQueueMicrotask();
                }, httpDownloadInitialTimeoutMs - timeSinceStart));
            }
            var engineRequest = this.engineRequest;
            if (engineRequest) {
                var segment = engineRequest.segment;
                var request = this.requests.get(segment);
                if (engineRequest.shouldBeStartedImmediately && engineRequest.status === "pending" && (!request || request.status === "not-started" || request.status === "failed" || request.status === "aborted")) {
                    var _request$failedAttemp;
                    if (!isInitialHttpWait && ((_request$failedAttemp = request === null || request === void 0 ? void 0 : request.failedAttempts.httpAttemptsCount) !== null && _request$failedAttemp !== void 0 ? _request$failedAttemp : 0) < httpErrorRetries && this.requests.executingHttpCount < simultaneousHttpDownloads)
                        this.loadThroughHttp(segment);
                    else if (this.p2pLoaders.currentLoader.isSegmentLoadedBySomeone(segment) && this.requests.executingP2PCount < simultaneousP2PDownloads)
                        this.loadThroughP2P(segment);
                }
            }
            try {
                for (var queue_1 = __values(queue), queue_1_1 = queue_1.next(); !queue_1_1.done; queue_1_1 = queue_1.next()) {
                    var item = queue_1_1.value;
                    var statuses = item.statuses, segment = item.segment;
                    var request = this.requests.get(segment);
                    if ((request === null || request === void 0 ? void 0 : request.status) === "succeed")
                        continue;
                    if (statuses.isHighDemand) {
                        var _request$failedAttemp2;
                        var canLoadThroughHttp = !isInitialHttpWait && ((_request$failedAttemp2 = request === null || request === void 0 ? void 0 : request.failedAttempts.httpAttemptsCount) !== null && _request$failedAttemp2 !== void 0 ? _request$failedAttemp2 : 0) < httpErrorRetries;
                        if ((request === null || request === void 0 ? void 0 : request.status) === "loading") {
                            if (canLoadThroughHttp && request.downloadSource === "p2p" && (this.requests.executingHttpCount < simultaneousHttpDownloads || this.abortLastHttpLoadingInQueueAfterItem(queue, segment))) {
                                request.abortFromProcessQueue();
                                this.loadThroughHttp(segment);
                            }
                            continue;
                        }
                        if (canLoadThroughHttp && (this.requests.executingHttpCount < simultaneousHttpDownloads || this.abortLastHttpLoadingInQueueAfterItem(queue, segment))) {
                            this.loadThroughHttp(segment);
                            continue;
                        }
                        if (this.p2pLoaders.currentLoader.isSegmentLoadedBySomeone(segment) && (this.requests.executingP2PCount < simultaneousP2PDownloads || this.abortLastP2PLoadingInQueueAfterItem(queue, segment)))
                            this.loadThroughP2P(segment);
                    }
                    else if (statuses.isP2PDownloadable && (request === null || request === void 0 ? void 0 : request.status) !== "loading" && this.requests.executingP2PCount < simultaneousP2PDownloads)
                        this.loadThroughP2P(segment);
                }
            }
            catch (e_43_1) { e_43 = { error: e_43_1 }; }
            finally {
                try {
                    if (queue_1_1 && !queue_1_1.done && (_a = queue_1.return)) _a.call(queue_1);
                }
                finally { if (e_43) throw e_43.error; }
            }
        };
        HybridLoader.prototype.abortSegmentRequest = function (segmentRuntimeId) {
            var _this$engineRequest3;
            if (((_this$engineRequest3 = this.engineRequest) === null || _this$engineRequest3 === void 0 ? void 0 : _this$engineRequest3.segment.runtimeId) !== segmentRuntimeId)
                return;
            this.engineRequest.abort();
            this.logger("abort: ", getSegmentString(this.engineRequest.segment));
            this.engineRequest = void 0;
            this.requestProcessQueueMicrotask();
        };
        HybridLoader.prototype.loadThroughHttp = function (segment) {
            new HttpRequestExecutor(this.requests.getOrCreateRequest(segment), this.config, this.eventTarget).execute();
            this.p2pLoaders.currentLoader.broadcastAnnouncement();
        };
        HybridLoader.prototype.loadThroughP2P = function (segment) {
            this.p2pLoaders.currentLoader.downloadSegment(segment);
        };
        HybridLoader.prototype.loadRandomThroughHttp = function () {
            var e_44, _a, e_45, _b;
            var httpDownloadInitialTimeoutMs = this.config.httpDownloadInitialTimeoutMs;
            if (httpDownloadInitialTimeoutMs > 0 && performance.now() - this.createdAt < httpDownloadInitialTimeoutMs)
                return;
            var availableStorageCapacityPercent = this.getAvailableStorageCapacityPercent();
            if (availableStorageCapacityPercent <= 10)
                return;
            var _c = this.config, simultaneousHttpDownloads = _c.simultaneousHttpDownloads, httpErrorRetries = _c.httpErrorRetries;
            var p2pLoader = this.p2pLoaders.currentLoader;
            if (this.requests.executingHttpCount >= simultaneousHttpDownloads || !p2pLoader.connectedPeerCount)
                return;
            var segmentsToLoad = [];
            try {
                for (var _d = __values(generateQueue(this.lastRequestedSegment, this.playback, this.config, this.p2pLoaders.currentLoader, availableStorageCapacityPercent)), _e = _d.next(); !_e.done; _e = _d.next()) {
                    var _f = _e.value, segment = _f.segment, statuses = _f.statuses;
                    var streamSwarmId = getStreamSwarmId(this.swarmId, segment.stream);
                    if (!statuses.isHttpDownloadable || statuses.isP2PDownloadable || this.segmentStorage.hasSegment(this.swarmId, streamSwarmId, segment.externalId))
                        continue;
                    var request = this.requests.get(segment);
                    if (request && (request.status === "loading" || request.status === "succeed" || request.failedAttempts.httpAttemptsCount >= httpErrorRetries))
                        continue;
                    segmentsToLoad.push(segment);
                }
            }
            catch (e_44_1) { e_44 = { error: e_44_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
                }
                finally { if (e_44) throw e_44.error; }
            }
            if (!segmentsToLoad.length)
                return;
            if (simultaneousHttpDownloads - this.requests.executingHttpCount === 0)
                return;
            var peersCount = p2pLoader.connectedPeerCount + 1;
            var safeRandomSegmentsCount = Math.min(segmentsToLoad.length, simultaneousHttpDownloads * peersCount);
            var randomIndices = shuffleArray(Array.from({ length: safeRandomSegmentsCount }, function (_, i) { return i; }));
            var probability = safeRandomSegmentsCount / peersCount;
            try {
                for (var randomIndices_1 = __values(randomIndices), randomIndices_1_1 = randomIndices_1.next(); !randomIndices_1_1.done; randomIndices_1_1 = randomIndices_1.next()) {
                    var randomIndex = randomIndices_1_1.value;
                    if (this.requests.executingHttpCount >= simultaneousHttpDownloads)
                        break;
                    if (probability >= 1 || Math.random() <= probability) {
                        var segment = segmentsToLoad[randomIndex];
                        this.loadThroughHttp(segment);
                    }
                    probability--;
                    if (probability <= 0)
                        break;
                }
            }
            catch (e_45_1) { e_45 = { error: e_45_1 }; }
            finally {
                try {
                    if (randomIndices_1_1 && !randomIndices_1_1.done && (_b = randomIndices_1.return)) _b.call(randomIndices_1);
                }
                finally { if (e_45) throw e_45.error; }
            }
        };
        HybridLoader.prototype.abortLastHttpLoadingInQueueAfterItem = function (queue, segment) {
            var e_46, _a;
            try {
                for (var _b = __values(arrayBackwards(queue)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var itemSegment = _c.value.segment;
                    if (itemSegment === segment)
                        break;
                    var request = this.requests.get(itemSegment);
                    if ((request === null || request === void 0 ? void 0 : request.downloadSource) === "http" && request.status === "loading") {
                        request.abortFromProcessQueue();
                        return true;
                    }
                }
            }
            catch (e_46_1) { e_46 = { error: e_46_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_46) throw e_46.error; }
            }
            return false;
        };
        HybridLoader.prototype.abortLastP2PLoadingInQueueAfterItem = function (queue, segment) {
            var e_47, _a;
            try {
                for (var _b = __values(arrayBackwards(queue)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var itemSegment = _c.value.segment;
                    if (itemSegment === segment)
                        break;
                    var request = this.requests.get(itemSegment);
                    if ((request === null || request === void 0 ? void 0 : request.downloadSource) === "p2p" && request.status === "loading") {
                        request.abortFromProcessQueue();
                        return true;
                    }
                }
            }
            catch (e_47_1) { e_47 = { error: e_47_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_47) throw e_47.error; }
            }
            return false;
        };
        HybridLoader.prototype.getAvailableStorageCapacityPercent = function () {
            var _a = this.segmentStorage.getUsage(), totalCapacity = _a.totalCapacity, usedCapacity = _a.usedCapacity;
            return 100 - usedCapacity / totalCapacity * 100;
        };
        HybridLoader.prototype.generateQueue = function () {
            var e_48, _a;
            var queue = [];
            var queueSegmentIds = /* @__PURE__ */ new Set();
            var maxPossibleLength = 0;
            var alreadyLoadedCount = 0;
            var availableStorageCapacityPercent = this.getAvailableStorageCapacityPercent();
            try {
                for (var _b = __values(generateQueue(this.lastRequestedSegment, this.playback, this.config, this.p2pLoaders.currentLoader, availableStorageCapacityPercent)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var item = _c.value;
                    var _this$requests$get;
                    maxPossibleLength++;
                    var segment = item.segment;
                    var streamSwarmId = getStreamSwarmId(this.swarmId, segment.stream);
                    if (this.segmentStorage.hasSegment(this.swarmId, streamSwarmId, segment.externalId) || ((_this$requests$get = this.requests.get(segment)) === null || _this$requests$get === void 0 ? void 0 : _this$requests$get.status) === "succeed") {
                        alreadyLoadedCount++;
                        continue;
                    }
                    queue.push(item);
                    queueSegmentIds.add(segment.runtimeId);
                }
            }
            catch (e_48_1) { e_48 = { error: e_48_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_48) throw e_48.error; }
            }
            return {
                queue: queue,
                queueSegmentIds: queueSegmentIds,
                maxPossibleLength: maxPossibleLength,
                alreadyLoadedCount: alreadyLoadedCount,
                queueDownloadRatio: maxPossibleLength !== 0 ? alreadyLoadedCount / maxPossibleLength : 0
            };
        };
        HybridLoader.prototype.getBandwidth = function (queueDownloadRatio) {
            var _a = this.bandwidthCalculators, http = _a.http, all = _a.all;
            var activeLevelBitrate = this.streamDetails.activeLevelBitrate;
            if (activeLevelBitrate === 0)
                return all.getBandwidthLoadingOnly(3);
            var bandwidth = Math.max(all.getBandwidth(30, this.levelChangedTimestamp), all.getBandwidth(60, this.levelChangedTimestamp), all.getBandwidth(90, this.levelChangedTimestamp));
            if (queueDownloadRatio >= .8 || bandwidth >= activeLevelBitrate * .9)
                return Math.max(all.getBandwidthLoadingOnly(1), all.getBandwidthLoadingOnly(3), all.getBandwidthLoadingOnly(5));
            var httpRealBandwidth = Math.max(http.getBandwidthLoadingOnly(1), http.getBandwidthLoadingOnly(3), http.getBandwidthLoadingOnly(5));
            return Math.max(bandwidth, httpRealBandwidth);
        };
        HybridLoader.prototype.notifyLevelChanged = function () {
            this.levelChangedTimestamp = performance.now();
        };
        HybridLoader.prototype.sendBroadcastAnnouncement = function (sendEmptySegmentsAnnouncement) {
            if (sendEmptySegmentsAnnouncement === void 0) { sendEmptySegmentsAnnouncement = false; }
            this.p2pLoaders.currentLoader.broadcastAnnouncement(sendEmptySegmentsAnnouncement);
        };
        HybridLoader.prototype.updatePlayback = function (position, rate) {
            var isRateChanged = this.playback.rate !== rate;
            var isPositionChanged = this.playback.position !== position;
            if (!isRateChanged && !isPositionChanged)
                return;
            var isPositionSignificantlyChanged = Math.abs(position - this.playback.position) / this.segmentAvgDuration > .5;
            if (isPositionChanged)
                this.playback.position = position;
            if (isRateChanged && rate !== 0)
                this.playback.rate = rate;
            if (isPositionSignificantlyChanged) {
                var _this$engineRequest4;
                this.logger("position significantly changed");
                (_this$engineRequest4 = this.engineRequest) === null || _this$engineRequest4 === void 0 || _this$engineRequest4.markAsShouldBeStartedImmediately();
            }
            this.segmentStorage.onPlaybackUpdated(position, rate);
            this.requestProcessQueueMicrotask(isPositionSignificantlyChanged);
        };
        HybridLoader.prototype.updateStream = function (stream) {
            if (stream !== this.lastRequestedSegment.stream)
                return;
            this.logger("update stream: ".concat(getStreamString(stream)));
            this.requestProcessQueueMicrotask();
        };
        HybridLoader.prototype.destroy = function () {
            var _this$engineRequest5;
            clearTimeout(this.randomHttpDownloadTimeout);
            clearTimeout(this.initialHttpDelayTimeoutId);
            (_this$engineRequest5 = this.engineRequest) === null || _this$engineRequest5 === void 0 || _this$engineRequest5.abort();
            this.requests.destroy();
            this.p2pLoaders.destroy();
        };
        return HybridLoader;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/segment-storage/utils.ts
    var getStorageItemId = function (streamId, segmentId) { return "".concat(streamId, "|").concat(segmentId); };
    var isAndroid = function (userAgent) { return /Android/i.test(userAgent); };
    var isIPadOrIPhone = function (userAgent) { return /iPad|iPhone/i.test(userAgent); };
    var isAndroidWebview = function (userAgent) { return /Android/i.test(userAgent) && !/Chrome|Firefox/i.test(userAgent); };
    //#endregion
    //#region ../p2p-media-loader-core/src/segment-storage/segment-memory-storage.ts
    var BYTES_PER_MiB = 1048576;
    var SegmentMemoryStorage = /** @class */ (function () {
        function SegmentMemoryStorage() {
            _defineProperty(this, "userAgent", navigator.userAgent);
            _defineProperty(this, "segmentMemoryStorageLimit", 4 * 1024);
            _defineProperty(this, "currentStorageUsage", 0);
            _defineProperty(this, "cache", /* @__PURE__ */ new Map());
            _defineProperty(this, "logger", void 0);
            _defineProperty(this, "coreConfig", void 0);
            _defineProperty(this, "mainStreamConfig", void 0);
            _defineProperty(this, "secondaryStreamConfig", void 0);
            _defineProperty(this, "currentPlayback", void 0);
            _defineProperty(this, "lastRequestedSegment", void 0);
            _defineProperty(this, "segmentChangeCallback", void 0);
            this.logger = (0, import_browser.default)("p2pml-core:segment-memory-storage");
            this.logger.color = "RebeccaPurple";
        }
        SegmentMemoryStorage.prototype.initialize = function (coreConfig, mainStreamConfig, secondaryStreamConfig) {
            var _this = this;
            return _asyncToGenerator(function () {
                return __generator(this, function (_a) {
                    _this.coreConfig = coreConfig;
                    _this.mainStreamConfig = mainStreamConfig;
                    _this.secondaryStreamConfig = secondaryStreamConfig;
                    _this.setMemoryStorageLimit();
                    _this.logger("initialized");
                    return [2 /*return*/];
                });
            })();
        };
        SegmentMemoryStorage.prototype.onPlaybackUpdated = function (position, rate) {
            this.currentPlayback = {
                position: position,
                rate: rate
            };
        };
        SegmentMemoryStorage.prototype.onSegmentRequested = function (swarmId, streamId, segmentId, startTime, endTime, streamType, isLiveStream) {
            this.lastRequestedSegment = {
                streamId: streamId,
                segmentId: segmentId,
                startTime: startTime,
                endTime: endTime,
                swarmId: swarmId,
                streamType: streamType,
                isLiveStream: isLiveStream
            };
        };
        SegmentMemoryStorage.prototype.storeSegment = function (_swarmId, streamId, segmentId, data, startTime, endTime, streamType, isLiveStream) {
            var _this2 = this;
            return _asyncToGenerator(function () {
                var storageId;
                return __generator(this, function (_a) {
                    _this2.clear(isLiveStream, data.byteLength);
                    storageId = getStorageItemId(streamId, segmentId);
                    _this2.cache.set(storageId, {
                        data: data,
                        segmentId: segmentId,
                        streamId: streamId,
                        startTime: startTime,
                        endTime: endTime,
                        streamType: streamType
                    });
                    _this2.increaseStorageUsage(data.byteLength);
                    _this2.logger("add segment: ".concat(segmentId, " to ").concat(streamId));
                    if (!_this2.segmentChangeCallback)
                        throw new Error("dispatchStorageUpdatedEvent is not set");
                    _this2.segmentChangeCallback(streamId);
                    return [2 /*return*/];
                });
            })();
        };
        SegmentMemoryStorage.prototype.getSegmentData = function (_swarmId, streamId, segmentId) {
            var _this3 = this;
            return _asyncToGenerator(function () {
                var segmentStorageId, dataItem;
                return __generator(this, function (_a) {
                    segmentStorageId = getStorageItemId(streamId, segmentId);
                    dataItem = _this3.cache.get(segmentStorageId);
                    if (dataItem === void 0)
                        return [2 /*return*/, void 0];
                    return [2 /*return*/, dataItem.data];
                });
            })();
        };
        SegmentMemoryStorage.prototype.getUsage = function () {
            var e_49, _a;
            if (!this.lastRequestedSegment || !this.currentPlayback)
                return {
                    totalCapacity: this.segmentMemoryStorageLimit,
                    usedCapacity: this.currentStorageUsage
                };
            var playbackPosition = this.currentPlayback.position;
            var calculatedUsedCapacity = 0;
            try {
                for (var _b = __values(this.cache.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = _c.value, endTime = _d.endTime, data = _d.data;
                    if (playbackPosition > endTime)
                        continue;
                    calculatedUsedCapacity += data.byteLength;
                }
            }
            catch (e_49_1) { e_49 = { error: e_49_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_49) throw e_49.error; }
            }
            return {
                totalCapacity: this.segmentMemoryStorageLimit,
                usedCapacity: calculatedUsedCapacity / BYTES_PER_MiB
            };
        };
        SegmentMemoryStorage.prototype.hasSegment = function (_swarmId, streamId, externalId) {
            var segmentStorageId = getStorageItemId(streamId, externalId);
            return this.cache.get(segmentStorageId) !== void 0;
        };
        SegmentMemoryStorage.prototype.getStoredSegmentIds = function (_swarmId, streamId) {
            var e_50, _a;
            var externalIds = [];
            try {
                for (var _b = __values(this.cache.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = _c.value, segmentId = _d.segmentId, streamCacheId = _d.streamId;
                    if (streamCacheId !== streamId)
                        continue;
                    externalIds.push(segmentId);
                }
            }
            catch (e_50_1) { e_50 = { error: e_50_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_50) throw e_50.error; }
            }
            return externalIds;
        };
        SegmentMemoryStorage.prototype.clear = function (isLiveStream, newSegmentSize) {
            var e_51, _a;
            if (!this.currentPlayback || !this.mainStreamConfig || !this.secondaryStreamConfig || !this.coreConfig)
                return;
            if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream)
                return;
            var affectedStreams = /* @__PURE__ */ new Set();
            var sortedCache = Array.from(this.cache.values()).sort(function (a, b) { return a.startTime - b.startTime; });
            try {
                for (var sortedCache_1 = __values(sortedCache), sortedCache_1_1 = sortedCache_1.next(); !sortedCache_1_1.done; sortedCache_1_1 = sortedCache_1.next()) {
                    var segmentData = sortedCache_1_1.value;
                    var streamId = segmentData.streamId, segmentId = segmentData.segmentId, data = segmentData.data;
                    var storageId = getStorageItemId(streamId, segmentId);
                    if (!this.shouldRemoveSegment(segmentData, isLiveStream, this.currentPlayback.position))
                        continue;
                    this.cache.delete(storageId);
                    affectedStreams.add(streamId);
                    this.decreaseStorageUsage(data.byteLength);
                    this.logger("Removed segment ".concat(segmentId, " from stream ").concat(streamId));
                    if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream)
                        break;
                }
            }
            catch (e_51_1) { e_51 = { error: e_51_1 }; }
            finally {
                try {
                    if (sortedCache_1_1 && !sortedCache_1_1.done && (_a = sortedCache_1.return)) _a.call(sortedCache_1);
                }
                finally { if (e_51) throw e_51.error; }
            }
            this.sendUpdatesToAffectedStreams(affectedStreams);
        };
        SegmentMemoryStorage.prototype.isMemoryLimitReached = function (segmentByteLength) {
            return this.currentStorageUsage + segmentByteLength / BYTES_PER_MiB > this.segmentMemoryStorageLimit;
        };
        SegmentMemoryStorage.prototype.setSegmentChangeCallback = function (callback) {
            this.segmentChangeCallback = callback;
        };
        SegmentMemoryStorage.prototype.sendUpdatesToAffectedStreams = function (affectedStreams) {
            var _this_1 = this;
            if (affectedStreams.size === 0)
                return;
            affectedStreams.forEach(function (stream) {
                if (!_this_1.segmentChangeCallback)
                    throw new Error("dispatchStorageUpdatedEvent is not set");
                _this_1.segmentChangeCallback(stream);
            });
        };
        SegmentMemoryStorage.prototype.shouldRemoveSegment = function (segmentData, isLiveStream, currentPlaybackPosition) {
            var endTime = segmentData.endTime, streamType = segmentData.streamType;
            var highDemandTimeWindow = this.getStreamTimeWindow(streamType, "highDemandTimeWindow");
            if (currentPlaybackPosition <= endTime)
                return false;
            if (isLiveStream)
                return currentPlaybackPosition > highDemandTimeWindow + endTime;
            return true;
        };
        SegmentMemoryStorage.prototype.increaseStorageUsage = function (segmentByteLength) {
            this.currentStorageUsage += segmentByteLength / BYTES_PER_MiB;
        };
        SegmentMemoryStorage.prototype.decreaseStorageUsage = function (segmentByteLength) {
            this.currentStorageUsage -= segmentByteLength / BYTES_PER_MiB;
        };
        SegmentMemoryStorage.prototype.setMemoryStorageLimit = function () {
            var _this$coreConfig;
            if ((_this$coreConfig = this.coreConfig) === null || _this$coreConfig === void 0 ? void 0 : _this$coreConfig.segmentMemoryStorageLimit) {
                this.segmentMemoryStorageLimit = this.coreConfig.segmentMemoryStorageLimit;
                return;
            }
            if (isAndroidWebview(this.userAgent) || isIPadOrIPhone(this.userAgent))
                this.segmentMemoryStorageLimit = 1024;
            else if (isAndroid(this.userAgent))
                this.segmentMemoryStorageLimit = 2 * 1024;
        };
        SegmentMemoryStorage.prototype.getStreamTimeWindow = function (streamType, configKey) {
            var _config$configKey;
            var config = streamType === "main" ? this.mainStreamConfig : this.secondaryStreamConfig;
            return (_config$configKey = config === null || config === void 0 ? void 0 : config[configKey]) !== null && _config$configKey !== void 0 ? _config$configKey : 0;
        };
        SegmentMemoryStorage.prototype.destroy = function () {
            this.cache.clear();
            this.segmentChangeCallback = void 0;
        };
        return SegmentMemoryStorage;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/webtorrent/websocket-client/index.ts
    var _config = /* @__PURE__ */ new WeakMap();
    var _state = /* @__PURE__ */ new WeakMap();
    var _ws = /* @__PURE__ */ new WeakMap();
    var _backoffCount = /* @__PURE__ */ new WeakMap();
    var _reconnectTimeoutId = /* @__PURE__ */ new WeakMap();
    var _eventTarget$1 = /* @__PURE__ */ new WeakMap();
    var _onOpen = /* @__PURE__ */ new WeakMap();
    var _onClose = /* @__PURE__ */ new WeakMap();
    var _onError = /* @__PURE__ */ new WeakMap();
    var _onMessage = /* @__PURE__ */ new WeakMap();
    var _WebSocketClient_brand = /* @__PURE__ */ new WeakSet();
    var WebSocketClient = /** @class */ (function () {
        function WebSocketClient(config) {
            var _this_1 = this;
            var _config$initialDelay, _config$maxDelay, _config$jitterMultipl;
            _classPrivateMethodInitSpec(this, _WebSocketClient_brand);
            _classPrivateFieldInitSpec(this, _config, void 0);
            _classPrivateFieldInitSpec(this, _state, "disconnected");
            _classPrivateFieldInitSpec(this, _ws, null);
            _classPrivateFieldInitSpec(this, _backoffCount, 0);
            _classPrivateFieldInitSpec(this, _reconnectTimeoutId, null);
            _classPrivateFieldInitSpec(this, _eventTarget$1, new EventTarget());
            _classPrivateFieldInitSpec(this, _onOpen, function () {
                if (_classPrivateFieldGet2(_state, _this_1) === "disposed")
                    return;
                _classPrivateFieldSet2(_state, _this_1, "connected");
                _classPrivateFieldSet2(_backoffCount, _this_1, 0);
                _classPrivateFieldGet2(_eventTarget$1, _this_1).dispatchEvent("connected");
            });
            _classPrivateFieldInitSpec(this, _onClose, function () {
                if (_classPrivateFieldGet2(_state, _this_1) === "disposed")
                    return;
                if (_classPrivateFieldGet2(_ws, _this_1)) {
                    _classPrivateFieldGet2(_ws, _this_1).onopen = null;
                    _classPrivateFieldGet2(_ws, _this_1).onclose = null;
                    _classPrivateFieldGet2(_ws, _this_1).onerror = null;
                    _classPrivateFieldGet2(_ws, _this_1).onmessage = null;
                    _classPrivateFieldSet2(_ws, _this_1, null);
                }
                _assertClassBrand(_WebSocketClient_brand, _this_1, _scheduleReconnect).call(_this_1);
                _classPrivateFieldGet2(_eventTarget$1, _this_1).dispatchEvent("disconnected");
            });
            _classPrivateFieldInitSpec(this, _onError, function (event) {
                if (_classPrivateFieldGet2(_state, _this_1) === "disposed")
                    return;
                _classPrivateFieldGet2(_eventTarget$1, _this_1).dispatchEvent("error", event);
            });
            _classPrivateFieldInitSpec(this, _onMessage, function (event) {
                if (_classPrivateFieldGet2(_state, _this_1) === "disposed")
                    return;
                _classPrivateFieldGet2(_eventTarget$1, _this_1).dispatchEvent("message", event.data);
            });
            var initialDelay = Math.max(100, (_config$initialDelay = config.initialDelay) !== null && _config$initialDelay !== void 0 ? _config$initialDelay : 1e3);
            _classPrivateFieldSet2(_config, this, {
                url: config.url,
                initialDelay: initialDelay,
                maxDelay: Math.max(initialDelay, (_config$maxDelay = config.maxDelay) !== null && _config$maxDelay !== void 0 ? _config$maxDelay : 3e4),
                jitterMultiplier: Math.max(0, (_config$jitterMultipl = config.jitterMultiplier) !== null && _config$jitterMultipl !== void 0 ? _config$jitterMultipl : .2)
            });
        }
        Object.defineProperty(WebSocketClient.prototype, "state", {
            get: function () {
                return _classPrivateFieldGet2(_state, this);
            },
            enumerable: false,
            configurable: true
        });
        WebSocketClient.prototype.addEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget$1, this).addEventListener(eventName, listener);
        };
        WebSocketClient.prototype.removeEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget$1, this).removeEventListener(eventName, listener);
        };
        WebSocketClient.prototype.connect = function () {
            if (_classPrivateFieldGet2(_state, this) === "connected" || _classPrivateFieldGet2(_state, this) === "connecting" || _classPrivateFieldGet2(_state, this) === "disposed")
                return;
            _classPrivateFieldSet2(_state, this, "connecting");
            _assertClassBrand(_WebSocketClient_brand, this, _clearReconnectTimeout).call(this);
            try {
                _classPrivateFieldSet2(_ws, this, new WebSocket(_classPrivateFieldGet2(_config, this).url));
                _classPrivateFieldGet2(_ws, this).binaryType = "arraybuffer";
                _classPrivateFieldGet2(_ws, this).onopen = _classPrivateFieldGet2(_onOpen, this);
                _classPrivateFieldGet2(_ws, this).onclose = _classPrivateFieldGet2(_onClose, this);
                _classPrivateFieldGet2(_ws, this).onerror = _classPrivateFieldGet2(_onError, this);
                _classPrivateFieldGet2(_ws, this).onmessage = _classPrivateFieldGet2(_onMessage, this);
            }
            catch (error) {
                _classPrivateFieldSet2(_state, this, "disconnected");
                var errorEvent = new ErrorEvent("error", {
                    message: error instanceof Error ? error.message : "Unknown WebSocket creation error",
                    error: error
                });
                _classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("error", errorEvent);
            }
        };
        WebSocketClient.prototype.send = function (data) {
            if (_classPrivateFieldGet2(_state, this) !== "connected" || !_classPrivateFieldGet2(_ws, this))
                throw new Error("WebSocketClient: Cannot send data when not connected");
            _classPrivateFieldGet2(_ws, this).send(data);
        };
        WebSocketClient.prototype.dispose = function () {
            _classPrivateFieldSet2(_state, this, "disposed");
            _assertClassBrand(_WebSocketClient_brand, this, _clearReconnectTimeout).call(this);
            if (_classPrivateFieldGet2(_ws, this)) {
                _classPrivateFieldGet2(_ws, this).onopen = null;
                _classPrivateFieldGet2(_ws, this).onclose = null;
                _classPrivateFieldGet2(_ws, this).onerror = null;
                _classPrivateFieldGet2(_ws, this).onmessage = null;
                _classPrivateFieldGet2(_ws, this).close();
                _classPrivateFieldSet2(_ws, this, null);
            }
            _classPrivateFieldGet2(_eventTarget$1, this).clear();
        };
        return WebSocketClient;
    }());
    function _scheduleReconnect() {
        var _this_1 = this;
        if (_classPrivateFieldGet2(_state, this) === "disposed")
            return;
        _classPrivateFieldSet2(_state, this, "reconnecting");
        var baseDelay = Math.min(_classPrivateFieldGet2(_config, this).initialDelay * Math.pow(2, _classPrivateFieldGet2(_backoffCount, this)), _classPrivateFieldGet2(_config, this).maxDelay);
        var jitter = baseDelay * _classPrivateFieldGet2(_config, this).jitterMultiplier;
        var randomJitter = Math.random() * 2 * jitter - jitter;
        var delay = Math.max(0, baseDelay + randomJitter);
        if (baseDelay < _classPrivateFieldGet2(_config, this).maxDelay) {
            var _this$backoffCount;
            _classPrivateFieldSet2(_backoffCount, this, (_this$backoffCount = _classPrivateFieldGet2(_backoffCount, this), _this$backoffCount++, _this$backoffCount));
        }
        _classPrivateFieldSet2(_reconnectTimeoutId, this, setTimeout(function () {
            if (_classPrivateFieldGet2(_state, _this_1) !== "disposed")
                _this_1.connect();
        }, delay));
        _classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("reconnecting");
    }
    function _clearReconnectTimeout() {
        if (_classPrivateFieldGet2(_reconnectTimeoutId, this) !== null) {
            clearTimeout(_classPrivateFieldGet2(_reconnectTimeoutId, this));
            _classPrivateFieldSet2(_reconnectTimeoutId, this, null);
        }
    }
    //#endregion
    //#region ../p2p-media-loader-core/src/webtorrent/webtorrent-socket-pool/index.ts
    var _sockets = /* @__PURE__ */ new WeakMap();
    var _eventTarget = /* @__PURE__ */ new WeakMap();
    var WebTorrentSocketPool = /** @class */ (function () {
        function WebTorrentSocketPool() {
            _classPrivateFieldInitSpec(this, _sockets, /* @__PURE__ */ new Map());
            _classPrivateFieldInitSpec(this, _eventTarget, new EventTarget());
        }
        WebTorrentSocketPool.prototype.addEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget, this).addEventListener(eventName, listener);
        };
        WebTorrentSocketPool.prototype.removeEventListener = function (eventName, listener) {
            _classPrivateFieldGet2(_eventTarget, this).removeEventListener(eventName, listener);
        };
        WebTorrentSocketPool.prototype.acquire = function (url) {
            var _this_1 = this;
            var entry = _classPrivateFieldGet2(_sockets, this).get(url);
            if (!entry) {
                var client = new WebSocketClient({ url: url });
                client.addEventListener("error", function (error) {
                    _classPrivateFieldGet2(_eventTarget, _this_1).dispatchEvent("error", error, url);
                });
                client.connect();
                entry = {
                    client: client,
                    refCount: 0
                };
                _classPrivateFieldGet2(_sockets, this).set(url, entry);
            }
            entry.refCount++;
            var isReleased = false;
            return {
                client: entry.client,
                release: function () {
                    if (isReleased)
                        return;
                    isReleased = true;
                    var currentEntry = _classPrivateFieldGet2(_sockets, _this_1).get(url);
                    if (!currentEntry)
                        return;
                    currentEntry.refCount--;
                    if (currentEntry.refCount <= 0) {
                        if (currentEntry.refCount < 0)
                            console.error("[WebTorrentSocketPool] Negative refCount detected for ".concat(url));
                        _classPrivateFieldGet2(_sockets, _this_1).delete(url);
                        currentEntry.client.dispose();
                    }
                }
            };
        };
        WebTorrentSocketPool.prototype.destroy = function () {
            var e_52, _a;
            _classPrivateFieldGet2(_eventTarget, this).clear();
            var entries = Array.from(_classPrivateFieldGet2(_sockets, this).values());
            _classPrivateFieldGet2(_sockets, this).clear();
            try {
                for (var entries_1 = __values(entries), entries_1_1 = entries_1.next(); !entries_1_1.done; entries_1_1 = entries_1.next()) {
                    var entry = entries_1_1.value;
                    try {
                        entry.client.dispose();
                    }
                    catch (error) {
                        console.error("[WebTorrentSocketPool] Failed to dispose WebSocketClient:", error);
                    }
                }
            }
            catch (e_52_1) { e_52 = { error: e_52_1 }; }
            finally {
                try {
                    if (entries_1_1 && !entries_1_1.done && (_a = entries_1.return)) _a.call(entries_1);
                }
                finally { if (e_52) throw e_52.error; }
            }
        };
        return WebTorrentSocketPool;
    }());
    //#endregion
    //#region ../p2p-media-loader-core/src/core.ts
    /** Core class for managing media streams loading via P2P. */
    var Core = /** @class */ (function () {
        /**
        * Constructs a new Core instance with optional initial configuration.
        *
        * @param config - Optional partial configuration to override default settings.
        *
        * @example
        * // Create a Core instance with custom configuration for HTTP and P2P downloads.
        * const core = new Core({
        *   simultaneousHttpDownloads: 5,
        *   simultaneousP2PDownloads: 5,
        *   httpErrorRetries: 5,
        *   p2pErrorRetries: 5
        * });
        *
        * @example
        * // Create a Core instance using the default configuration.
        * const core = new Core();
        */
        function Core(config) {
            var _this_1 = this;
            _defineProperty(this, "eventTarget", new EventTarget());
            _defineProperty(this, "manifestResponseUrl", void 0);
            _defineProperty(this, "streams", /* @__PURE__ */ new Map());
            _defineProperty(this, "mainStreamConfig", void 0);
            _defineProperty(this, "secondaryStreamConfig", void 0);
            _defineProperty(this, "commonCoreConfig", void 0);
            _defineProperty(this, "bandwidthCalculators", {
                all: new BandwidthCalculator(),
                http: new BandwidthCalculator()
            });
            _defineProperty(this, "segmentStorage", void 0);
            _defineProperty(this, "webTorrentSocketPool", new WebTorrentSocketPool());
            _defineProperty(this, "socketPoolLogger", (0, import_browser.default)("p2pml-core:webtorrent-socket-pool"));
            _defineProperty(this, "mainStreamLoader", void 0);
            _defineProperty(this, "secondaryStreamLoader", void 0);
            _defineProperty(this, "streamDetails", {
                isLive: false,
                activeLevelBitrate: 0
            });
            var filteredConfig = filterUndefinedProps(config !== null && config !== void 0 ? config : {});
            this.commonCoreConfig = mergeAndFilterConfig({
                defaultConfig: Core.DEFAULT_COMMON_CORE_CONFIG,
                baseConfig: filteredConfig
            });
            this.mainStreamConfig = mergeAndFilterConfig({
                defaultConfig: Core.DEFAULT_STREAM_CONFIG,
                baseConfig: filteredConfig,
                specificStreamConfig: filteredConfig.mainStream
            });
            this.secondaryStreamConfig = mergeAndFilterConfig({
                defaultConfig: Core.DEFAULT_STREAM_CONFIG,
                baseConfig: filteredConfig,
                specificStreamConfig: filteredConfig.secondaryStream
            });
            this.webTorrentSocketPool.addEventListener("error", function (error, url) {
                _this_1.socketPoolLogger("WebSocket error for tracker url ".concat(url, ":"), error);
            });
        }
        /**
        * Retrieves the current configuration for the core instance, ensuring immutability.
        *
        * @returns A deep readonly version of the core configuration.
        */
        Core.prototype.getConfig = function () {
            return _objectSpread2(_objectSpread2({}, deepCopy(this.commonCoreConfig)), {}, {
                mainStream: deepCopy(this.mainStreamConfig),
                secondaryStream: deepCopy(this.secondaryStreamConfig)
            });
        };
        /**
        * Applies a set of dynamic configuration updates to the core, merging with the existing configuration.
        *
        * @param dynamicConfig - A set of configuration changes to apply.
        *
        * @example
        * // Example of dynamically updating the download time windows and timeout settings.
        * const dynamicConfig = {
        *   httpDownloadTimeWindow: 60,  // Set HTTP download time window to 60 seconds
        *   p2pDownloadTimeWindow: 60,   // Set P2P download time window to 60 seconds
        *   httpNotReceivingBytesTimeoutMs: 1500,  // Set HTTP timeout to 1500 milliseconds
        *   p2pNotReceivingBytesTimeoutMs: 1500    // Set P2P timeout to 1500 milliseconds
        * };
        * core.applyDynamicConfig(dynamicConfig);
        */
        Core.prototype.applyDynamicConfig = function (dynamicConfig) {
            var mainStream = dynamicConfig.mainStream, secondaryStream = dynamicConfig.secondaryStream;
            var mainStreamConfigCopy = deepCopy(this.mainStreamConfig);
            var secondaryStreamConfigCopy = deepCopy(this.secondaryStreamConfig);
            this.overrideAllConfigs(dynamicConfig, mainStream, secondaryStream);
            this.processSpecificDynamicConfigParams(mainStreamConfigCopy, dynamicConfig, "main");
            this.processSpecificDynamicConfigParams(secondaryStreamConfigCopy, dynamicConfig, "secondary");
        };
        Core.prototype.processSpecificDynamicConfigParams = function (prevConfig, updatedConfig, streamType) {
            var isP2PDisabled = this.getUpdatedStreamProperty("isP2PDisabled", updatedConfig, streamType);
            if (isP2PDisabled && prevConfig.isP2PDisabled !== isP2PDisabled)
                this.destroyStreamLoader(streamType);
            var isP2PUploadDisabled = this.getUpdatedStreamProperty("isP2PUploadDisabled", updatedConfig, streamType);
            if (isP2PUploadDisabled !== void 0 && prevConfig.isP2PUploadDisabled !== isP2PUploadDisabled) {
                var streamLoader = streamType === "main" ? this.mainStreamLoader : this.secondaryStreamLoader;
                streamLoader === null || streamLoader === void 0 || streamLoader.sendBroadcastAnnouncement(isP2PUploadDisabled);
            }
        };
        Core.prototype.getUpdatedStreamProperty = function (propertyName, updatedConfig, streamType) {
            var _updatedStreamConfig$;
            var updatedStreamConfig = streamType === "main" ? updatedConfig.mainStream : updatedConfig.secondaryStream;
            return (_updatedStreamConfig$ = updatedStreamConfig === null || updatedStreamConfig === void 0 ? void 0 : updatedStreamConfig[propertyName]) !== null && _updatedStreamConfig$ !== void 0 ? _updatedStreamConfig$ : updatedConfig[propertyName];
        };
        /**
        * Adds an event listener for the specified event type on the core event target.
        *
        * @param eventName - The name of the event to listen for.
        * @param listener - The callback function to invoke when the event is fired.
        */
        Core.prototype.addEventListener = function (eventName, listener) {
            this.eventTarget.addEventListener(eventName, listener);
        };
        /**
        * Removes an event listener for the specified event type on the core event target.
        *
        * @param eventName - The name of the event to listen for.
        * @param listener - The callback function to be removed.
        */
        Core.prototype.removeEventListener = function (eventName, listener) {
            this.eventTarget.removeEventListener(eventName, listener);
        };
        /**
        * Sets the response URL for the manifest, stripping any query parameters.
        *
        * @param url - The full URL to the manifest response.
        */
        Core.prototype.setManifestResponseUrl = function (url) {
            this.manifestResponseUrl = url.split("?")[0];
        };
        /**
        * Checks if a segment is already stored within the core.
        *
        * @param segmentRuntimeId - The runtime identifier of the segment to check.
        * @returns `true` if the segment is present, otherwise `false`.
        */
        Core.prototype.hasSegment = function (segmentRuntimeId) {
            return !!getSegmentFromStreamsMap(this.streams, segmentRuntimeId);
        };
        /**
        * Retrieves a specific stream by its runtime identifier, if it exists.
        *
        * @param streamRuntimeId - The runtime identifier of the stream to retrieve.
        * @returns The stream with its segments, or `undefined` if not found.
        */
        Core.prototype.getStream = function (streamRuntimeId) {
            return this.streams.get(streamRuntimeId);
        };
        /**
        * Ensures a stream exists in the map; adds it if it does not.
        *
        * @param stream - The stream to potentially add to the map.
        */
        Core.prototype.addStreamIfNoneExists = function (stream) {
            if (this.streams.has(stream.runtimeId))
                return;
            this.streams.set(stream.runtimeId, _objectSpread2(_objectSpread2({}, stream), {}, { segments: /* @__PURE__ */ new Map() }));
        };
        /**
        * Updates the segments associated with a specific stream.
        *
        * @param streamRuntimeId - The runtime identifier of the stream to update.
        * @param addSegments - Optional segments to add to the stream.
        * @param removeSegmentIds - Optional segment IDs to remove from the stream.
        */
        Core.prototype.updateStream = function (streamRuntimeId, addSegments, removeSegmentIds) {
            var e_53, _a, e_54, _b;
            var _this$mainStreamLoade, _this$secondaryStream;
            var stream = this.streams.get(streamRuntimeId);
            if (!stream)
                return;
            if (addSegments)
                try {
                    for (var addSegments_1 = __values(addSegments), addSegments_1_1 = addSegments_1.next(); !addSegments_1_1.done; addSegments_1_1 = addSegments_1.next()) {
                        var segment = addSegments_1_1.value;
                        if (stream.segments.has(segment.runtimeId))
                            continue;
                        stream.segments.set(segment.runtimeId, _objectSpread2(_objectSpread2({}, segment), {}, { stream: stream }));
                    }
                }
                catch (e_53_1) { e_53 = { error: e_53_1 }; }
                finally {
                    try {
                        if (addSegments_1_1 && !addSegments_1_1.done && (_a = addSegments_1.return)) _a.call(addSegments_1);
                    }
                    finally { if (e_53) throw e_53.error; }
                }
            if (removeSegmentIds)
                try {
                    for (var removeSegmentIds_1 = __values(removeSegmentIds), removeSegmentIds_1_1 = removeSegmentIds_1.next(); !removeSegmentIds_1_1.done; removeSegmentIds_1_1 = removeSegmentIds_1.next()) {
                        var id = removeSegmentIds_1_1.value;
                        stream.segments.delete(id);
                    }
                }
                catch (e_54_1) { e_54 = { error: e_54_1 }; }
                finally {
                    try {
                        if (removeSegmentIds_1_1 && !removeSegmentIds_1_1.done && (_b = removeSegmentIds_1.return)) _b.call(removeSegmentIds_1);
                    }
                    finally { if (e_54) throw e_54.error; }
                }
            (_this$mainStreamLoade = this.mainStreamLoader) === null || _this$mainStreamLoade === void 0 || _this$mainStreamLoade.updateStream(stream);
            (_this$secondaryStream = this.secondaryStreamLoader) === null || _this$secondaryStream === void 0 || _this$secondaryStream.updateStream(stream);
        };
        /**
        * Loads a segment given its runtime identifier and invokes the provided callbacks during the process.
        * Initializes segment storage if it has not been initialized yet.
        *
        * @param segmentRuntimeId - The runtime identifier of the segment to load.
        * @param callbacks - The callbacks to be invoked during segment loading.
        * @throws {Error} - Throws if the manifest response URL is not defined.
        */
        Core.prototype.loadSegment = function (segmentRuntimeId, callbacks) {
            var _this = this;
            return _asyncToGenerator(function () {
                var segment;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!_this.manifestResponseUrl)
                                throw new Error("Manifest response url is not defined");
                            return [4 /*yield*/, _this.initializeSegmentStorage()];
                        case 1:
                            _a.sent();
                            segment = _this.identifySegment(segmentRuntimeId);
                            _this.getStreamHybridLoader(segment).loadSegment(segment, callbacks);
                            return [2 /*return*/];
                    }
                });
            })();
        };
        /**
        * Aborts the loading of a segment specified by its runtime identifier.
        *
        * @param segmentRuntimeId - The runtime identifier of the segment whose loading is to be aborted.
        */
        Core.prototype.abortSegmentLoading = function (segmentRuntimeId) {
            var _this$mainStreamLoade2, _this$secondaryStream2;
            (_this$mainStreamLoade2 = this.mainStreamLoader) === null || _this$mainStreamLoade2 === void 0 || _this$mainStreamLoade2.abortSegmentRequest(segmentRuntimeId);
            (_this$secondaryStream2 = this.secondaryStreamLoader) === null || _this$secondaryStream2 === void 0 || _this$secondaryStream2.abortSegmentRequest(segmentRuntimeId);
        };
        /**
        * Updates the playback parameters while play head moves, specifically position and playback rate, for stream loaders.
        *
        * @param position - The new position in the stream, in seconds.
        * @param rate - The new playback rate.
        */
        Core.prototype.updatePlayback = function (position, rate) {
            var _this$mainStreamLoade3, _this$secondaryStream3;
            (_this$mainStreamLoade3 = this.mainStreamLoader) === null || _this$mainStreamLoade3 === void 0 || _this$mainStreamLoade3.updatePlayback(position, rate);
            (_this$secondaryStream3 = this.secondaryStreamLoader) === null || _this$secondaryStream3 === void 0 || _this$secondaryStream3.updatePlayback(position, rate);
        };
        /**
        * Sets the active level bitrate, used for adjusting quality levels in adaptive streaming.
        * Notifies the stream loaders if a change occurs.
        *
        * @param bitrate - The new bitrate to set as active.
        */
        Core.prototype.setActiveLevelBitrate = function (bitrate) {
            if (bitrate !== this.streamDetails.activeLevelBitrate) {
                var _this$mainStreamLoade4, _this$secondaryStream4;
                this.streamDetails.activeLevelBitrate = bitrate;
                (_this$mainStreamLoade4 = this.mainStreamLoader) === null || _this$mainStreamLoade4 === void 0 || _this$mainStreamLoade4.notifyLevelChanged();
                (_this$secondaryStream4 = this.secondaryStreamLoader) === null || _this$secondaryStream4 === void 0 || _this$secondaryStream4.notifyLevelChanged();
            }
        };
        /**
        * Updates the 'isLive' status of the stream
        *
        * @param isLive - Boolean indicating whether the stream is live.
        */
        Core.prototype.setIsLive = function (isLive) {
            this.streamDetails.isLive = isLive;
        };
        /**
        * Identify if a segment is loadable by the P2P core based on the segment's stream type and configuration.
        * @param segmentRuntimeId Segment runtime identifier to check.
        * @returns `true` if the segment is loadable by the P2P core, otherwise `false`.
        */
        Core.prototype.isSegmentLoadable = function (segmentRuntimeId) {
            try {
                var segment = this.identifySegment(segmentRuntimeId);
                if (segment.stream.type === "main" && this.mainStreamConfig.isP2PDisabled)
                    return false;
                if (segment.stream.type === "secondary" && this.secondaryStreamConfig.isP2PDisabled)
                    return false;
                return true;
            }
            catch (_unused) {
                return false;
            }
        };
        /**
        * Cleans up resources used by the Core instance, including destroying any active stream loaders
        * and clearing stored segments.
        */
        Core.prototype.destroy = function () {
            var _this$mainStreamLoade5, _this$secondaryStream5, _this$segmentStorage, _this$segmentStorage2;
            this.streams.clear();
            (_this$mainStreamLoade5 = this.mainStreamLoader) === null || _this$mainStreamLoade5 === void 0 || _this$mainStreamLoade5.destroy();
            (_this$secondaryStream5 = this.secondaryStreamLoader) === null || _this$secondaryStream5 === void 0 || _this$secondaryStream5.destroy();
            (_this$segmentStorage = this.segmentStorage) === null || _this$segmentStorage === void 0 || _this$segmentStorage.setSegmentChangeCallback(void 0);
            (_this$segmentStorage2 = this.segmentStorage) === null || _this$segmentStorage2 === void 0 || _this$segmentStorage2.destroy();
            this.mainStreamLoader = void 0;
            this.secondaryStreamLoader = void 0;
            this.segmentStorage = void 0;
            this.manifestResponseUrl = void 0;
            this.streamDetails = {
                isLive: false,
                activeLevelBitrate: 0
            };
            this.webTorrentSocketPool.destroy();
        };
        Core.prototype.initializeSegmentStorage = function () {
            var _this2 = this;
            return _asyncToGenerator(function () {
                var isLive, createCustomStorage, segmentStorage;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (_this2.segmentStorage)
                                return [2 /*return*/];
                            isLive = _this2.streamDetails.isLive;
                            createCustomStorage = _this2.commonCoreConfig.customSegmentStorageFactory;
                            if (createCustomStorage && typeof createCustomStorage !== "function")
                                throw new Error("Storage configuration is invalid");
                            segmentStorage = createCustomStorage ? createCustomStorage(isLive) : new SegmentMemoryStorage();
                            return [4 /*yield*/, segmentStorage.initialize(_this2.commonCoreConfig, _this2.mainStreamConfig, _this2.secondaryStreamConfig)];
                        case 1:
                            _a.sent();
                            segmentStorage.setSegmentChangeCallback(function (streamId) {
                                _this2.eventTarget.dispatchEvent("onStorageUpdated-".concat(streamId));
                            });
                            _this2.segmentStorage = segmentStorage;
                            return [2 /*return*/];
                    }
                });
            })();
        };
        Core.prototype.identifySegment = function (segmentRuntimeId) {
            if (!this.manifestResponseUrl)
                throw new Error("Manifest response url is undefined");
            var segment = getSegmentFromStreamsMap(this.streams, segmentRuntimeId);
            if (!segment)
                throw new Error("Not found segment with id: ".concat(segmentRuntimeId));
            return segment;
        };
        Core.prototype.overrideAllConfigs = function (dynamicConfig, mainStream, secondaryStream) {
            overrideConfig(this.commonCoreConfig, dynamicConfig);
            overrideConfig(this.mainStreamConfig, dynamicConfig);
            overrideConfig(this.secondaryStreamConfig, dynamicConfig);
            if (mainStream)
                overrideConfig(this.mainStreamConfig, mainStream);
            if (secondaryStream)
                overrideConfig(this.secondaryStreamConfig, secondaryStream);
        };
        Core.prototype.destroyStreamLoader = function (streamType) {
            if (streamType === "main") {
                var _this$mainStreamLoade6;
                (_this$mainStreamLoade6 = this.mainStreamLoader) === null || _this$mainStreamLoade6 === void 0 || _this$mainStreamLoade6.destroy();
                this.mainStreamLoader = void 0;
            }
            else {
                var _this$secondaryStream6;
                (_this$secondaryStream6 = this.secondaryStreamLoader) === null || _this$secondaryStream6 === void 0 || _this$secondaryStream6.destroy();
                this.secondaryStreamLoader = void 0;
            }
        };
        Core.prototype.getStreamHybridLoader = function (segment) {
            if (segment.stream.type === "main") {
                var _this$mainStreamLoade7;
                (_this$mainStreamLoade7 = this.mainStreamLoader) !== null && _this$mainStreamLoade7 !== void 0 || (this.mainStreamLoader = this.createNewHybridLoader(segment));
                return this.mainStreamLoader;
            }
            else {
                var _this$secondaryStream7;
                (_this$secondaryStream7 = this.secondaryStreamLoader) !== null && _this$secondaryStream7 !== void 0 || (this.secondaryStreamLoader = this.createNewHybridLoader(segment));
                return this.secondaryStreamLoader;
            }
        };
        Core.prototype.createNewHybridLoader = function (segment) {
            if (!this.manifestResponseUrl)
                throw new Error("Manifest response url is not defined");
            if (!this.segmentStorage)
                throw new Error("Segment storage is not initialized");
            var streamConfig = segment.stream.type === "main" ? this.mainStreamConfig : this.secondaryStreamConfig;
            return new HybridLoader(this.manifestResponseUrl, segment, this.streamDetails, streamConfig, this.bandwidthCalculators, this.segmentStorage, this.webTorrentSocketPool, this.eventTarget);
        };
        return Core;
    }());
    _defineProperty(Core, "DEFAULT_COMMON_CORE_CONFIG", {
        segmentMemoryStorageLimit: void 0,
        customSegmentStorageFactory: void 0
    });
    _defineProperty(Core, "DEFAULT_STREAM_CONFIG", {
        isP2PUploadDisabled: false,
        isP2PDisabled: false,
        simultaneousHttpDownloads: 2,
        simultaneousP2PDownloads: 3,
        highDemandTimeWindow: 15,
        httpDownloadInitialTimeoutMs: 0,
        httpDownloadTimeWindow: 3e3,
        p2pDownloadTimeWindow: 6e3,
        webRtcMaxMessageSize: 64 * 1024 - 1,
        p2pNotReceivingBytesTimeoutMs: 2e3,
        p2pInactiveLoaderDestroyTimeoutMs: 30 * 1e3,
        httpNotReceivingBytesTimeoutMs: 3e3,
        httpErrorRetries: 3,
        p2pErrorRetries: 3,
        trackerClientVersionPrefix: TRACKER_CLIENT_VERSION_PREFIX,
        announceTrackers: ["wss://tracker.novage.com.ua", "wss://tracker.openwebtorrent.com"],
        rtcConfig: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] },
        validateP2PSegment: void 0,
        validateHTTPSegment: void 0,
        httpRequestSetup: void 0,
        swarmId: void 0
    });
    //#endregion
    //#region src/fragment-loader.ts
    var DEFAULT_DOWNLOAD_LATENCY = 10;
    var _callbacks = /* @__PURE__ */ new WeakMap();
    var _createDefaultLoader = /* @__PURE__ */ new WeakMap();
    var _defaultLoader$1 = /* @__PURE__ */ new WeakMap();
    var _core = /* @__PURE__ */ new WeakMap();
    var _response = /* @__PURE__ */ new WeakMap();
    var _segmentId = /* @__PURE__ */ new WeakMap();
    var _FragmentLoaderBase_brand = /* @__PURE__ */ new WeakSet();
    var FragmentLoaderBase = /** @class */ (function () {
        function FragmentLoaderBase(config, core) {
            _classPrivateMethodInitSpec(this, _FragmentLoaderBase_brand);
            _defineProperty(this, "context", void 0);
            _defineProperty(this, "config", void 0);
            _defineProperty(this, "stats", void 0);
            _classPrivateFieldInitSpec(this, _callbacks, void 0);
            _classPrivateFieldInitSpec(this, _createDefaultLoader, void 0);
            _classPrivateFieldInitSpec(this, _defaultLoader$1, void 0);
            _classPrivateFieldInitSpec(this, _core, void 0);
            _classPrivateFieldInitSpec(this, _response, void 0);
            _classPrivateFieldInitSpec(this, _segmentId, void 0);
            _classPrivateFieldSet2(_core, this, core);
            _classPrivateFieldSet2(_createDefaultLoader, this, function () { return new config.loader(config); });
            this.stats = {
                aborted: false,
                chunkCount: 0,
                loading: {
                    start: 0,
                    first: 0,
                    end: 0
                },
                buffering: {
                    start: 0,
                    first: 0,
                    end: 0
                },
                parsing: {
                    start: 0,
                    end: 0
                },
                total: 1,
                loaded: 1,
                bwEstimate: 0,
                retry: 0
            };
        }
        FragmentLoaderBase.prototype.load = function (context, config, callbacks) {
            var _this_1 = this;
            this.context = context;
            this.config = config;
            _classPrivateFieldSet2(_callbacks, this, callbacks);
            var stats = this.stats;
            var start = context.rangeStart, end = context.rangeEnd;
            var byteRange = getByteRange(start, end !== void 0 ? end - 1 : void 0);
            _classPrivateFieldSet2(_segmentId, this, getSegmentRuntimeId(context.url, byteRange));
            var isSegmentDownloadableByP2PCore = _classPrivateFieldGet2(_core, this).isSegmentLoadable(_classPrivateFieldGet2(_segmentId, this));
            if (!_classPrivateFieldGet2(_core, this).hasSegment(_classPrivateFieldGet2(_segmentId, this)) || !isSegmentDownloadableByP2PCore) {
                _classPrivateFieldSet2(_defaultLoader$1, this, _classPrivateFieldGet2(_createDefaultLoader, this).call(this));
                _classPrivateFieldGet2(_defaultLoader$1, this).stats = this.stats;
                _classPrivateFieldGet2(_defaultLoader$1, this).load(context, config, callbacks);
                return;
            }
            var onSuccess = function (response) {
                _classPrivateFieldSet2(_response, _this_1, response);
                var loadedBytes = _classPrivateFieldGet2(_response, _this_1).data.byteLength;
                stats.loading = getLoadingStat(_classPrivateFieldGet2(_response, _this_1).bandwidth, loadedBytes, performance.now());
                stats.total = loadedBytes;
                stats.loaded = loadedBytes;
                var engineData = _classPrivateFieldGet2(_response, _this_1).data.slice(0);
                if (callbacks.onProgress)
                    callbacks.onProgress(_this_1.stats, context, engineData, void 0);
                callbacks.onSuccess({
                    data: engineData,
                    url: context.url
                }, _this_1.stats, context, void 0);
            };
            var onError = function (error) {
                if (error instanceof CoreRequestError && error.type === "aborted" && _this_1.stats.aborted)
                    return;
                _assertClassBrand(_FragmentLoaderBase_brand, _this_1, _handleError).call(_this_1, error);
            };
            _classPrivateFieldGet2(_core, this).loadSegment(_classPrivateFieldGet2(_segmentId, this), {
                onSuccess: onSuccess,
                onError: onError
            });
        };
        FragmentLoaderBase.prototype.abort = function () {
            if (_classPrivateFieldGet2(_defaultLoader$1, this))
                _classPrivateFieldGet2(_defaultLoader$1, this).abort();
            else {
                var _classPrivateFieldGet3, _classPrivateFieldGet4;
                _assertClassBrand(_FragmentLoaderBase_brand, this, _abortInternal).call(this);
                (_classPrivateFieldGet3 = _classPrivateFieldGet2(_callbacks, this)) === null || _classPrivateFieldGet3 === void 0 || (_classPrivateFieldGet4 = _classPrivateFieldGet3.onAbort) === null || _classPrivateFieldGet4 === void 0 || _classPrivateFieldGet4.call(_classPrivateFieldGet3, this.stats, this.context, {});
            }
        };
        FragmentLoaderBase.prototype.destroy = function () {
            if (_classPrivateFieldGet2(_defaultLoader$1, this))
                _classPrivateFieldGet2(_defaultLoader$1, this).destroy();
            else {
                if (!this.stats.aborted)
                    _assertClassBrand(_FragmentLoaderBase_brand, this, _abortInternal).call(this);
                _classPrivateFieldSet2(_callbacks, this, null);
                this.config = null;
            }
        };
        return FragmentLoaderBase;
    }());
    function _handleError(thrownError) {
        var _classPrivateFieldGet2$1;
        var error = {
            code: 0,
            text: ""
        };
        if (thrownError instanceof CoreRequestError && thrownError.type === "failed")
            error.text = thrownError.message;
        else if (thrownError instanceof Error)
            error.text = thrownError.message;
        (_classPrivateFieldGet2$1 = _classPrivateFieldGet2(_callbacks, this)) === null || _classPrivateFieldGet2$1 === void 0 || _classPrivateFieldGet2$1.onError(error, this.context, null, this.stats);
    }
    function _abortInternal() {
        if (!_classPrivateFieldGet2(_response, this) && _classPrivateFieldGet2(_segmentId, this)) {
            this.stats.aborted = true;
            _classPrivateFieldGet2(_core, this).abortSegmentLoading(_classPrivateFieldGet2(_segmentId, this));
        }
    }
    function getLoadingStat(targetBitrate, loadedBytes, loadingEndTime) {
        var timeForLoading = targetBitrate > 0 ? loadedBytes * 8e3 / targetBitrate : 0;
        var first = Math.max(0, loadingEndTime - timeForLoading);
        return {
            start: Math.max(0, first - DEFAULT_DOWNLOAD_LATENCY),
            first: first,
            end: loadingEndTime
        };
    }
    //#endregion
    //#region src/playlist-loader.ts
    var _defaultLoader = /* @__PURE__ */ new WeakMap();
    var PlaylistLoaderBase = /** @class */ (function () {
        function PlaylistLoaderBase(config) {
            _classPrivateFieldInitSpec(this, _defaultLoader, void 0);
            _defineProperty(this, "context", void 0);
            _defineProperty(this, "stats", void 0);
            _classPrivateFieldSet2(_defaultLoader, this, new config.loader(config));
            this.stats = _classPrivateFieldGet2(_defaultLoader, this).stats;
            this.context = _classPrivateFieldGet2(_defaultLoader, this).context;
        }
        PlaylistLoaderBase.prototype.load = function (context, config, callbacks) {
            _classPrivateFieldGet2(_defaultLoader, this).load(context, config, callbacks);
        };
        PlaylistLoaderBase.prototype.abort = function () {
            _classPrivateFieldGet2(_defaultLoader, this).abort();
        };
        PlaylistLoaderBase.prototype.destroy = function () {
            _classPrivateFieldGet2(_defaultLoader, this).destroy();
        };
        return PlaylistLoaderBase;
    }());
    //#endregion
    //#region src/segment-manager.ts
    var SegmentManager = /** @class */ (function () {
        function SegmentManager(core) {
            _defineProperty(this, "core", void 0);
            this.core = core;
        }
        SegmentManager.prototype.processMainManifest = function (data) {
            var e_55, _a, e_56, _b;
            var levels = data.levels, audioTracks = data.audioTracks;
            try {
                for (var levels_1 = __values(levels), levels_1_1 = levels_1.next(); !levels_1_1.done; levels_1_1 = levels_1.next()) {
                    var level = levels_1_1.value;
                    var url = level.url, bitrate = level.bitrate, maxBitrate = level.maxBitrate, videoCodec = level.videoCodec, width = level.width, height = level.height;
                    var b = maxBitrate !== null && maxBitrate !== void 0 ? maxBitrate : bitrate;
                    var isMissingMetadata = b === 0;
                    var frameRate = level.attrs["FRAME-RATE"];
                    var videoRange = level.attrs["VIDEO-RANGE"];
                    var index = generateStreamShortId({
                        bitrate: b,
                        codecs: isMissingMetadata ? void 0 : videoCodec,
                        width: isMissingMetadata ? void 0 : width,
                        height: isMissingMetadata ? void 0 : height,
                        frameRate: isMissingMetadata ? void 0 : frameRate,
                        videoRange: isMissingMetadata ? void 0 : videoRange
                    });
                    this.core.addStreamIfNoneExists({
                        runtimeId: Array.isArray(url) ? url[0] : url,
                        type: "main",
                        index: index
                    });
                }
            }
            catch (e_55_1) { e_55 = { error: e_55_1 }; }
            finally {
                try {
                    if (levels_1_1 && !levels_1_1.done && (_a = levels_1.return)) _a.call(levels_1);
                }
                finally { if (e_55) throw e_55.error; }
            }
            try {
                for (var audioTracks_1 = __values(audioTracks), audioTracks_1_1 = audioTracks_1.next(); !audioTracks_1_1.done; audioTracks_1_1 = audioTracks_1.next()) {
                    var track = audioTracks_1_1.value;
                    var url = track.url, audioCodec = track.audioCodec, lang = track.lang, channels = track.channels, name = track.name;
                    var index = generateStreamShortId({
                        bitrate: 0,
                        codecs: audioCodec,
                        language: lang,
                        channels: channels,
                        name: name
                    });
                    this.core.addStreamIfNoneExists({
                        runtimeId: Array.isArray(url) ? url[0] : url,
                        type: "secondary",
                        index: index
                    });
                }
            }
            catch (e_56_1) { e_56 = { error: e_56_1 }; }
            finally {
                try {
                    if (audioTracks_1_1 && !audioTracks_1_1.done && (_b = audioTracks_1.return)) _b.call(audioTracks_1);
                }
                finally { if (e_56) throw e_56.error; }
            }
        };
        SegmentManager.prototype.updatePlaylist = function (data) {
            var _a = data.details, url = _a.url, fragments = _a.fragments, live = _a.live;
            var playlist = this.core.getStream(url);
            if (!playlist)
                return;
            var segmentToRemoveIds = new Set(playlist.segments.keys());
            var newSegments = [];
            fragments.forEach(function (fragment, index) {
                var responseUrl = fragment.url, fragByteRange = fragment.byteRange, sn = fragment.sn, startTime = fragment.start, endTime = fragment.end;
                var _a = __read(fragByteRange, 2), start = _a[0], end = _a[1];
                var byteRange = getByteRange(start, end !== void 0 ? end - 1 : void 0);
                var runtimeId = getSegmentRuntimeId(responseUrl, byteRange);
                segmentToRemoveIds.delete(runtimeId);
                if (playlist.segments.has(runtimeId))
                    return;
                newSegments.push({
                    runtimeId: runtimeId,
                    url: responseUrl,
                    externalId: live ? sn : index,
                    byteRange: byteRange,
                    startTime: startTime,
                    endTime: endTime
                });
            });
            if (!newSegments.length && !segmentToRemoveIds.size)
                return;
            this.core.updateStream(url, newSegments, segmentToRemoveIds.values());
        };
        return SegmentManager;
    }());
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/objectWithoutPropertiesLoose.js
    function _objectWithoutPropertiesLoose(r, e) {
        if (null == r)
            return {};
        var t = {};
        for (var n in r)
            if ({}.hasOwnProperty.call(r, n)) {
                if (e.includes(n))
                    continue;
                t[n] = r[n];
            }
        return t;
    }
    //#endregion
    //#region \0@oxc-project+runtime@0.129.0/helpers/objectWithoutProperties.js
    function _objectWithoutProperties(e, t) {
        if (null == e)
            return {};
        var o, r, i = _objectWithoutPropertiesLoose(e, t);
        if (Object.getOwnPropertySymbols) {
            var s = Object.getOwnPropertySymbols(e);
            for (r = 0; r < s.length; r++)
                o = s[r], t.includes(o) || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
        }
        return i;
    }
    //#endregion
    //#region src/engine-static.ts
    var _excluded = ["p2p"];
    function injectMixin(HlsJsClass) {
        var _p2pEngine;
        return _p2pEngine = /* @__PURE__ */ new WeakMap(), /** @class */ (function (_super) {
            __extends(HlsJsWithP2PClass, _super);
            function HlsJsWithP2PClass() {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var _this_1 = this;
                var _p2p$onHlsJsCreated;
                var config = args[0];
                var _ref = config !== null && config !== void 0 ? config : {}, p2p = _ref.p2p, hlsJsConfig = _objectWithoutProperties(_ref, _excluded);
                var p2pEngine = new HlsJsP2PEngine(p2p);
                _this_1 = _super.call(this, _objectSpread2(_objectSpread2({}, hlsJsConfig), p2pEngine.getConfigForHlsJs())) || this;
                _classPrivateFieldInitSpec(_this_1, _p2pEngine, void 0);
                p2pEngine.bindHls(_this_1);
                _classPrivateFieldSet2(_p2pEngine, _this_1, p2pEngine);
                p2p === null || p2p === void 0 || (_p2p$onHlsJsCreated = p2p.onHlsJsCreated) === null || _p2p$onHlsJsCreated === void 0 || _p2p$onHlsJsCreated.call(p2p, _this_1);
                return _this_1;
            }
            Object.defineProperty(HlsJsWithP2PClass.prototype, "p2pEngine", {
                get: function () {
                    return _classPrivateFieldGet2(_p2pEngine, this);
                },
                enumerable: false,
                configurable: true
            });
            return HlsJsWithP2PClass;
        }(HlsJsClass));
    }
    //#endregion
    //#region src/engine.ts
    var MAX_LIVE_SYNC_DURATION = 120;
    /**
    * Represents a P2P (peer-to-peer) engine for HLS (HTTP Live Streaming) to enhance media streaming efficiency.
    * This class integrates P2P technologies into HLS.js, enabling the distribution of media segments via a peer network
    * alongside traditional HTTP fetching. It reduces server bandwidth costs and improves scalability by sharing the load
    * across multiple clients.
    *
    * The engine manages core functionalities such as segment fetching, segment management, peer connection management,
    * and event handling related to the P2P and HLS processes.
    *
    * @example
    * // Creating an instance of HlsJsP2PEngine with custom configuration
    * const hlsP2PEngine = new HlsJsP2PEngine({
    *   core: {
    *     highDemandTimeWindow: 30, // 30 seconds
    *     simultaneousHttpDownloads: 3,
    *     webRtcMaxMessageSize: 64 * 1024, // 64 KB
    *     p2pNotReceivingBytesTimeoutMs: 10000, // 10 seconds
    *     p2pInactiveLoaderDestroyTimeoutMs: 15000, // 15 seconds
    *     httpNotReceivingBytesTimeoutMs: 8000, // 8 seconds
    *     httpErrorRetries: 2,
    *     p2pErrorRetries: 2,
    *     announceTrackers: ["wss://personal.tracker.com"],
    *     rtcConfig: {
    *       iceServers: [{ urls: "stun:personal.stun.com" }]
    *     },
    *     swarmId: "example-swarm-id"
    *   }
    * });
    *
    */
    var HlsJsP2PEngine = /** @class */ (function () {
        /**
        * Constructs an instance of HlsJsP2PEngine.
        * @param config Optional configuration for P2P engine setup.
        */
        function HlsJsP2PEngine(config) {
            var _this_1 = this;
            _defineProperty(this, "core", void 0);
            _defineProperty(this, "segmentManager", void 0);
            _defineProperty(this, "hlsInstanceGetter", void 0);
            _defineProperty(this, "currentHlsInstance", void 0);
            _defineProperty(this, "debug", (0, import_browser.debug)("p2pml-hlsjs:engine"));
            _defineProperty(this, "updateMediaElementEventHandlers", function (type) {
                var _this$currentHlsInsta;
                var media = (_this$currentHlsInsta = _this_1.currentHlsInstance) === null || _this$currentHlsInsta === void 0 ? void 0 : _this$currentHlsInsta.media;
                if (!media)
                    return;
                var method = type === "register" ? "addEventListener" : "removeEventListener";
                media[method]("timeupdate", _this_1.handlePlaybackUpdate);
                media[method]("seeking", _this_1.handlePlaybackUpdate);
                media[method]("ratechange", _this_1.handlePlaybackUpdate);
            });
            _defineProperty(this, "handleManifestLoaded", function (event, data) {
                var networkDetails = data.networkDetails;
                if (networkDetails instanceof XMLHttpRequest)
                    _this_1.core.setManifestResponseUrl(networkDetails.responseURL);
                else if (networkDetails instanceof Response)
                    _this_1.core.setManifestResponseUrl(networkDetails.url);
                _this_1.segmentManager.processMainManifest(data);
            });
            _defineProperty(this, "handleLevelSwitching", function (event, data) {
                if (data.bitrate)
                    _this_1.core.setActiveLevelBitrate(data.bitrate);
            });
            _defineProperty(this, "handleLevelUpdated", function (event, data) {
                if (_this_1.currentHlsInstance && data.details.fragments[0].type === "main" && data.details.fragments.length > 4) {
                    if (data.details.live && !_this_1.currentHlsInstance.userConfig.liveSyncDuration && !_this_1.currentHlsInstance.userConfig.liveSyncDurationCount)
                        _this_1.updateLiveSyncDurationCount(data);
                    if (!_this_1.currentHlsInstance.userConfig.maxBufferLength && !_this_1.currentHlsInstance.userConfig.maxMaxBufferLength)
                        _this_1.updateMaxBufferLength(data.details.targetduration);
                }
                _this_1.core.setIsLive(data.details.live);
                _this_1.segmentManager.updatePlaylist(data);
            });
            _defineProperty(this, "handleMediaAttached", function () {
                _this_1.updateMediaElementEventHandlers("register");
            });
            _defineProperty(this, "handleMediaDetached", function () {
                _this_1.updateMediaElementEventHandlers("unregister");
            });
            _defineProperty(this, "handlePlaybackUpdate", function (event) {
                var media = event.target;
                _this_1.core.updatePlayback(media.currentTime, media.playbackRate);
            });
            _defineProperty(this, "destroyCore", function () { return _this_1.core.destroy(); });
            _defineProperty(this, 
            /** Clean up and release all resources. Unregister all event handlers. */
            "destroy", function () {
                _this_1.destroyCore();
                _this_1.updateHlsEventsHandlers("unregister");
                _this_1.updateMediaElementEventHandlers("unregister");
                _this_1.currentHlsInstance = void 0;
            });
            this.core = new Core(config === null || config === void 0 ? void 0 : config.core);
            this.segmentManager = new SegmentManager(this.core);
        }
        /**
        * Enhances a given Hls.js class by injecting additional P2P (peer-to-peer) functionalities.
        *
        * @returns {HlsWithP2PInstance} - The enhanced Hls.js class with P2P functionalities.
        *
        * @example
        * const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
        *
        * const hls = new HlsWithP2P({
        *   // Hls.js configuration
        *   startLevel: 0, // Example of Hls.js config parameter
        *   p2p: {
        *     core: {
        *       // P2P core configuration
        *     },
        *     onHlsJsCreated(hls) {
        *       // Do something with the Hls.js instance
        *     },
        *   },
        * });
        */
        HlsJsP2PEngine.injectMixin = function (hls) {
            return injectMixin(hls);
        };
        /**
        * Adds an event listener for the specified event.
        * @param eventName The name of the event to listen for.
        * @param listener The callback function to be invoked when the event is triggered.
        *
        * @example
        * // Listening for a segment being successfully loaded
        * p2pEngine.addEventListener('onSegmentLoaded', (details) => {
        *   console.log('Segment Loaded:', details);
        * });
        *
        * @example
        * // Handling segment load errors
        * p2pEngine.addEventListener('onSegmentError', (errorDetails) => {
        *   console.error('Error loading segment:', errorDetails);
        * });
        *
        * @example
        * // Tracking data downloaded from peers
        * p2pEngine.addEventListener('onChunkDownloaded', (bytesLength, downloadSource, peerId) => {
        *   console.log(`Downloaded ${bytesLength} bytes from ${downloadSource} ${peerId ? 'from peer ' + peerId : 'from server'}`);
        * });
        */
        HlsJsP2PEngine.prototype.addEventListener = function (eventName, listener) {
            this.core.addEventListener(eventName, listener);
        };
        /**
        * Removes an event listener for the specified event.
        * @param eventName The name of the event.
        * @param listener The callback function that was previously added.
        */
        HlsJsP2PEngine.prototype.removeEventListener = function (eventName, listener) {
            this.core.removeEventListener(eventName, listener);
        };
        /**
        * provides the Hls.js P2P specific configuration for Hls.js loaders.
        * @returns An object with fragment loader (fLoader) and playlist loader (pLoader).
        */
        HlsJsP2PEngine.prototype.getConfigForHlsJs = function () {
            return {
                fLoader: this.createFragmentLoaderClass(),
                pLoader: this.createPlaylistLoaderClass()
            };
        };
        /**
        * Returns the configuration of the HLS.js P2P engine.
        * @returns A readonly version of the HlsJsP2PEngineConfig.
        */
        HlsJsP2PEngine.prototype.getConfig = function () {
            return { core: this.core.getConfig() };
        };
        /**
        * Applies dynamic configuration updates to the P2P engine.
        * @param dynamicConfig Configuration changes to apply.
        *
        * @example
        * // Assuming `hlsP2PEngine` is an instance of HlsJsP2PEngine
        *
        * const newDynamicConfig = {
        *   core: {
        *     // Increase the number of cached segments to 1000
        *     cachedSegmentsCount: 1000,
        *     // 50 minutes of segments will be downloaded further through HTTP connections if P2P fails
        *     httpDownloadTimeWindow: 3000,
        *     // 100 minutes of segments will be downloaded further through P2P connections
        *     p2pDownloadTimeWindow: 6000,
        * };
        *
        * hlsP2PEngine.applyDynamicConfig(newDynamicConfig);
        */
        HlsJsP2PEngine.prototype.applyDynamicConfig = function (dynamicConfig) {
            if (dynamicConfig.core)
                this.core.applyDynamicConfig(dynamicConfig.core);
        };
        /**
        * Sets the HLS instance for handling media.
        * @param hls The HLS instance or a function that returns an HLS instance.
        */
        HlsJsP2PEngine.prototype.bindHls = function (hls) {
            this.hlsInstanceGetter = typeof hls === "function" ? hls : function () { return hls; };
        };
        HlsJsP2PEngine.prototype.initHlsEvents = function () {
            var _this$hlsInstanceGett;
            var hlsInstance = (_this$hlsInstanceGett = this.hlsInstanceGetter) === null || _this$hlsInstanceGett === void 0 ? void 0 : _this$hlsInstanceGett.call(this);
            if (this.currentHlsInstance === hlsInstance)
                return;
            if (this.currentHlsInstance)
                this.destroy();
            this.currentHlsInstance = hlsInstance;
            this.updateHlsEventsHandlers("register");
            this.updateMediaElementEventHandlers("register");
        };
        HlsJsP2PEngine.prototype.updateHlsEventsHandlers = function (type) {
            var hls = this.currentHlsInstance;
            if (!hls)
                return;
            var method = type === "register" ? "on" : "off";
            hls[method]("hlsManifestLoaded", this.handleManifestLoaded);
            hls[method]("hlsLevelSwitching", this.handleLevelSwitching);
            hls[method]("hlsLevelUpdated", this.handleLevelUpdated);
            hls[method]("hlsAudioTrackLoaded", this.handleLevelUpdated);
            hls[method]("hlsDestroying", this.destroy);
            hls[method]("hlsMediaAttaching", this.destroyCore);
            hls[method]("hlsManifestLoading", this.destroyCore);
            hls[method]("hlsMediaDetached", this.handleMediaDetached);
            hls[method]("hlsMediaAttached", this.handleMediaAttached);
        };
        HlsJsP2PEngine.prototype.updateLiveSyncDurationCount = function (data) {
            var fragmentDuration = data.details.targetduration;
            var maxLiveSyncCount = Math.floor(MAX_LIVE_SYNC_DURATION / fragmentDuration);
            var newLiveSyncDurationCount = Math.min(data.details.fragments.length - 1, maxLiveSyncCount);
            if (this.currentHlsInstance && this.currentHlsInstance.config.liveSyncDurationCount !== newLiveSyncDurationCount) {
                this.debug("Setting liveSyncDurationCount to ".concat(newLiveSyncDurationCount));
                this.currentHlsInstance.config.liveSyncDurationCount = newLiveSyncDurationCount;
            }
        };
        HlsJsP2PEngine.prototype.updateMaxBufferLength = function (fragmentDuration) {
            if (!this.currentHlsInstance)
                return;
            var config = this.core.getConfig();
            var highDemandTimeWindow = Math.max(config.mainStream.highDemandTimeWindow, config.secondaryStream.highDemandTimeWindow);
            var p2pOptimalBufferLength = Math.max(fragmentDuration * 2, highDemandTimeWindow);
            if (this.currentHlsInstance.config.maxBufferLength > p2pOptimalBufferLength) {
                this.debug("Setting maxBufferLength to ".concat(p2pOptimalBufferLength));
                this.currentHlsInstance.config.maxBufferLength = p2pOptimalBufferLength;
            }
            if (this.currentHlsInstance.config.maxMaxBufferLength > p2pOptimalBufferLength) {
                this.debug("Setting maxMaxBufferLength to ".concat(p2pOptimalBufferLength));
                this.currentHlsInstance.config.maxMaxBufferLength = p2pOptimalBufferLength;
            }
        };
        HlsJsP2PEngine.prototype.createFragmentLoaderClass = function () {
            var core = this.core;
            var engine = this;
            return /** @class */ (function (_super) {
                __extends(FragmentLoader, _super);
                function FragmentLoader(config) {
                    return _super.call(this, config, core) || this;
                }
                FragmentLoader.getEngine = function () {
                    return engine;
                };
                return FragmentLoader;
            }(FragmentLoaderBase));
        };
        HlsJsP2PEngine.prototype.createPlaylistLoaderClass = function () {
            var engine = this;
            return /** @class */ (function (_super) {
                __extends(PlaylistLoader, _super);
                function PlaylistLoader(config) {
                    var _this_1 = _super.call(this, config) || this;
                    engine.initHlsEvents();
                    return _this_1;
                }
                return PlaylistLoader;
            }(PlaylistLoaderBase));
        };
        return HlsJsP2PEngine;
    }());
    //#endregion
    exports.Core = Core;
    exports.HlsJsP2PEngine = HlsJsP2PEngine;
    return exports;
})({});
//# sourceMappingURL=p2p-media-loader-hlsjs.iife.js.map
