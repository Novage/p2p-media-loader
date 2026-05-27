"use strict";
this.p2pml = this.p2pml || {};
this.p2pml.hlsjs = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region \0rolldown/runtime.js
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
	var __exportAll = (all, no_symbols) => {
		let target = {};
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
		if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
		return target;
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: ((k) => from[k]).bind(null, key),
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));
	//#endregion
	//#region src/utils.ts
	function getSegmentRuntimeId(segmentRequestUrl, byteRange) {
		if (!byteRange) return segmentRequestUrl;
		return `${segmentRequestUrl}|${byteRange.start}-${byteRange.end}`;
	}
	function getByteRange(rangeStart, rangeEnd) {
		if (rangeStart !== void 0 && rangeEnd !== void 0 && rangeStart <= rangeEnd) return {
			start: rangeStart,
			end: rangeEnd
		};
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/typeof.js
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/toPrimitive.js
	function toPrimitive(t, r) {
		if ("object" != _typeof(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof(i)) return i;
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
	var RequestError = class extends Error {
		/**
		* Constructs a new RequestError.
		* @param type - The specific error type.
		* @param message - Optional message describing the error.
		*/
		constructor(type, message) {
			super(message);
			_defineProperty(this, "type", void 0);
			_defineProperty(
				this,
				/** Error timestamp. */
				"timestamp",
				void 0
			);
			this.type = type;
			this.timestamp = performance.now();
		}
	};
	/** Custom error class for errors that occur during core network requests. */
	var CoreRequestError = class extends Error {
		/**
		* Constructs a new CoreRequestError.
		* @param type - The type of the error, either 'failed' or 'aborted'.
		*/
		constructor(type) {
			super();
			_defineProperty(this, "type", void 0);
			this.type = type;
		}
	};
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/checkPrivateRedeclaration.js
	function _checkPrivateRedeclaration(e, t) {
		if (t.has(e)) throw new TypeError("Cannot initialize the same private elements twice on an object");
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldInitSpec.js
	function _classPrivateFieldInitSpec(e, t, a) {
		_checkPrivateRedeclaration(e, t), t.set(e, a);
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/assertClassBrand.js
	function _assertClassBrand(e, t, n) {
		if ("function" == typeof e ? e === t : e.has(t)) return arguments.length < 3 ? t : n;
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
	var AbortSignalPolyfill = class {
		constructor() {
			_defineProperty(this, "aborted", false);
			_classPrivateFieldInitSpec(this, _listeners, /* @__PURE__ */ new Set());
		}
		addEventListener(_type, listener) {
			_classPrivateFieldGet2(_listeners, this).add(listener);
		}
		removeEventListener(_type, listener) {
			_classPrivateFieldGet2(_listeners, this).delete(listener);
		}
		dispatchEvent(_type) {
			this.aborted = true;
			for (const listener of _classPrivateFieldGet2(_listeners, this)) try {
				listener();
			} catch (_unused) {}
			_classPrivateFieldGet2(_listeners, this).clear();
		}
	};
	var AbortControllerPolyfill = class {
		constructor() {
			_defineProperty(this, "signal", new AbortSignalPolyfill());
		}
		abort() {
			this.signal.dispatchEvent("abort");
		}
	};
	var isAbortControllerSupported = typeof AbortController !== "undefined";
	var SafeAbortController = isAbortControllerSupported ? AbortController : AbortControllerPolyfill;
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/objectSpread2.js
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r) {
				return Object.getOwnPropertyDescriptor(e, r).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread2(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
				_defineProperty(e, r, t[r]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
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
		} catch (n) {
			e(n);
			return;
		}
		i.done ? t(u) : Promise.resolve(u).then(r, o);
	}
	function _asyncToGenerator(n) {
		return function() {
			var t = this, e = arguments;
			return new Promise(function(r, o) {
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
	var HttpRequestExecutor = class {
		isAborted() {
			return this.abortController.signal.aborted;
		}
		constructor(request, httpConfig, eventTarget) {
			_defineProperty(this, "request", void 0);
			_defineProperty(this, "httpConfig", void 0);
			_defineProperty(this, "abortController", new SafeAbortController());
			_defineProperty(this, "expectedBytesLength", void 0);
			_defineProperty(this, "requestByteRange", void 0);
			_defineProperty(this, "onChunkDownloaded", void 0);
			this.request = request;
			this.httpConfig = httpConfig;
			this.onChunkDownloaded = eventTarget.getEventDispatcher("onChunkDownloaded");
			const { byteRange } = this.request.segment;
			if (byteRange) this.requestByteRange = _objectSpread2({}, byteRange);
		}
		execute() {
			const startControls = {
				abort: () => this.abortController.abort(),
				notReceivingBytesTimeoutMs: this.httpConfig.httpNotReceivingBytesTimeoutMs
			};
			if (this.request.tryCompleteByLoadedBytes({ downloadSource: "http" }, startControls, this.httpConfig.validateHTTPSegment, "http-segment-validation-failed")) return;
			if (this.request.loadedBytes !== 0) {
				var _this$requestByteRang;
				this.requestByteRange = (_this$requestByteRang = this.requestByteRange) !== null && _this$requestByteRang !== void 0 ? _this$requestByteRang : { start: 0 };
				this.requestByteRange.start = this.requestByteRange.start + this.request.loadedBytes;
			}
			if (this.request.totalBytes) this.expectedBytesLength = this.request.totalBytes - this.request.loadedBytes;
			const requestControls = this.request.start({ downloadSource: "http" }, startControls);
			this.fetch(requestControls);
		}
		fetch(requestControls) {
			var _this = this;
			return _asyncToGenerator(function* () {
				const { segment } = _this.request;
				let activeReader;
				if (_this.isAborted()) return;
				const onAbort = () => {
					try {
						activeReader === null || activeReader === void 0 || activeReader.cancel().catch(() => {});
					} catch (_unused) {}
				};
				_this.abortController.signal.addEventListener("abort", onAbort);
				const abortSignal = isAbortControllerSupported ? _this.abortController.signal : void 0;
				try {
					var _this$httpConfig$http, _this$httpConfig;
					let request = yield (_this$httpConfig$http = (_this$httpConfig = _this.httpConfig).httpRequestSetup) === null || _this$httpConfig$http === void 0 ? void 0 : _this$httpConfig$http.call(_this$httpConfig, segment.url, segment.byteRange, abortSignal, _this.requestByteRange);
					if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
					if (!request) {
						const headers = new Headers();
						if (_this.requestByteRange) {
							var _this$requestByteRang2;
							headers.set("Range", `bytes=${_this.requestByteRange.start}-${(_this$requestByteRang2 = _this.requestByteRange.end) !== null && _this$requestByteRang2 !== void 0 ? _this$requestByteRang2 : ""}`);
						}
						const requestOptions = { headers };
						if (abortSignal) requestOptions.signal = abortSignal;
						request = new Request(segment.url, requestOptions);
					}
					if (_this.isAborted()) throw new DOMException("Request aborted before request fetch", "AbortError");
					const response = yield window.fetch(request);
					if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
					_this.handleResponseHeaders(response);
					requestControls.firstBytesReceived();
					if (!response.body || typeof response.body.getReader !== "function") {
						const arrayBuffer = yield response.arrayBuffer();
						if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
						const value = new Uint8Array(arrayBuffer);
						requestControls.addLoadedChunk(value);
						_this.onChunkDownloaded(value.byteLength, "http");
					} else {
						const reader = response.body.getReader();
						activeReader = reader;
						for (;;) {
							if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
							const { done, value } = yield reader.read();
							if (done) break;
							if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
							requestControls.addLoadedChunk(value);
							_this.onChunkDownloaded(value.byteLength, "http");
						}
					}
					if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
					if (_this.request.totalBytes !== void 0 && _this.request.loadedBytes !== _this.request.totalBytes) throw new RequestError("http-bytes-mismatch", `HTTP response truncated: received ${_this.request.loadedBytes} of ${_this.request.totalBytes} bytes`);
					const isValid = yield _this.request.validateData(_this.httpConfig.validateHTTPSegment);
					if (_this.isAborted()) throw new DOMException("Request aborted", "AbortError");
					if (!isValid) {
						_this.request.clearLoadedBytes();
						throw new RequestError("http-segment-validation-failed");
					}
					requestControls.completeOnSuccess();
				} catch (error) {
					_this.handleError(error, requestControls);
				} finally {
					_this.abortController.signal.removeEventListener("abort", onAbort);
				}
			})();
		}
		handleResponseHeaders(response) {
			if (!response.ok) if (response.status === 406 || response.status === 416) {
				this.request.clearLoadedBytes();
				throw new RequestError("http-bytes-mismatch", response.statusText);
			} else throw new RequestError("http-error", response.statusText);
			const { requestByteRange } = this;
			if (requestByteRange) if (response.status === 200) if (this.request.segment.byteRange) throw new RequestError("http-unexpected-status-code");
			else this.request.clearLoadedBytes();
			else {
				if (response.status !== 206) throw new RequestError("http-unexpected-status-code", response.statusText);
				const contentLengthHeader = response.headers.get("Content-Length");
				if (contentLengthHeader && this.expectedBytesLength !== void 0 && this.expectedBytesLength !== +contentLengthHeader) {
					this.request.clearLoadedBytes();
					throw new RequestError("http-bytes-mismatch", response.statusText);
				}
				const contentRangeHeader = response.headers.get("Content-Range");
				const contentRange = contentRangeHeader ? parseContentRangeHeader(contentRangeHeader) : void 0;
				if (contentRange) {
					const { from, to } = contentRange;
					const responseExpectedBytesLength = to !== void 0 && from !== void 0 ? to - from + 1 : void 0;
					if (responseExpectedBytesLength !== void 0 && this.expectedBytesLength !== responseExpectedBytesLength || from !== void 0 && requestByteRange.start !== from || to !== void 0 && requestByteRange.end !== void 0 && requestByteRange.end !== to) {
						this.request.clearLoadedBytes();
						throw new RequestError("http-bytes-mismatch", response.statusText);
					}
				}
			}
			if (response.status === 200 && this.request.totalBytes === void 0) {
				const contentLengthHeader = response.headers.get("Content-Length");
				if (contentLengthHeader) this.request.setTotalBytes(+contentLengthHeader);
			}
		}
		handleError(error, requestControls) {
			if (this.isAborted()) return;
			if (error instanceof Error) {
				const httpLoaderError = error instanceof RequestError ? error : new RequestError("http-error", error.message);
				requestControls.abortOnError(httpLoaderError);
			}
		}
	};
	var rangeHeaderRegex = /^bytes (?:(?:(\d+)|)-(?:(\d+)|)|\*)\/(?:(\d+)|\*)$/;
	function parseContentRangeHeader(headerValue) {
		const match = rangeHeaderRegex.exec(headerValue.trim());
		if (!match) return;
		const [, from, to, total] = match;
		return {
			from: from ? parseInt(from) : void 0,
			to: to ? parseInt(to) : void 0,
			total: total ? parseInt(total) : void 0
		};
	}
	//#endregion
	//#region ../../node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js
	var require_ms = /* @__PURE__ */ __commonJSMin(((exports, module) => {
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
		module.exports = function(val, options) {
			options = options || {};
			var type = typeof val;
			if (type === "string" && val.length > 0) return parse(val);
			else if (type === "number" && isFinite(val)) return options.long ? fmtLong(val) : fmtShort(val);
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
			if (str.length > 100) return;
			var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
			if (!match) return;
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
			if (msAbs >= d) return Math.round(ms / d) + "d";
			if (msAbs >= h) return Math.round(ms / h) + "h";
			if (msAbs >= m) return Math.round(ms / m) + "m";
			if (msAbs >= s) return Math.round(ms / s) + "s";
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
			if (msAbs >= d) return plural(ms, msAbs, d, "day");
			if (msAbs >= h) return plural(ms, msAbs, h, "hour");
			if (msAbs >= m) return plural(ms, msAbs, m, "minute");
			if (msAbs >= s) return plural(ms, msAbs, s, "second");
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
	var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
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
			Object.keys(env).forEach((key) => {
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
				let hash = 0;
				for (let i = 0; i < namespace.length; i++) {
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
				let prevTime;
				let enableOverride = null;
				let namespacesCache;
				let enabledCache;
				function debug(...args) {
					if (!debug.enabled) return;
					const self = debug;
					const curr = Number(/* @__PURE__ */ new Date());
					self.diff = curr - (prevTime || curr);
					self.prev = prevTime;
					self.curr = curr;
					prevTime = curr;
					args[0] = createDebug.coerce(args[0]);
					if (typeof args[0] !== "string") args.unshift("%O");
					let index = 0;
					args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
						if (match === "%%") return "%";
						index++;
						const formatter = createDebug.formatters[format];
						if (typeof formatter === "function") {
							const val = args[index];
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
					get: () => {
						if (enableOverride !== null) return enableOverride;
						if (namespacesCache !== createDebug.namespaces) {
							namespacesCache = createDebug.namespaces;
							enabledCache = createDebug.enabled(namespace);
						}
						return enabledCache;
					},
					set: (v) => {
						enableOverride = v;
					}
				});
				if (typeof createDebug.init === "function") createDebug.init(debug);
				return debug;
			}
			function extend(namespace, delimiter) {
				const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
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
				createDebug.save(namespaces);
				createDebug.namespaces = namespaces;
				createDebug.names = [];
				createDebug.skips = [];
				const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
				for (const ns of split) if (ns[0] === "-") createDebug.skips.push(ns.slice(1));
				else createDebug.names.push(ns);
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
				let searchIndex = 0;
				let templateIndex = 0;
				let starIndex = -1;
				let matchIndex = 0;
				while (searchIndex < search.length) if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) if (template[templateIndex] === "*") {
					starIndex = templateIndex;
					matchIndex = searchIndex;
					templateIndex++;
				} else {
					searchIndex++;
					templateIndex++;
				}
				else if (starIndex !== -1) {
					templateIndex = starIndex + 1;
					matchIndex++;
					searchIndex = matchIndex;
				} else return false;
				while (templateIndex < template.length && template[templateIndex] === "*") templateIndex++;
				return templateIndex === template.length;
			}
			/**
			* Disable debug output.
			*
			* @return {String} namespaces
			* @api public
			*/
			function disable() {
				const namespaces = [...createDebug.names, ...createDebug.skips.map((namespace) => "-" + namespace)].join(",");
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
				for (const skip of createDebug.skips) if (matchesTemplate(name, skip)) return false;
				for (const ns of createDebug.names) if (matchesTemplate(name, ns)) return true;
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
				if (val instanceof Error) return val.stack || val.message;
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
	var import_browser = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
		/**
		* This is the web browser implementation of `debug()`.
		*/
		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;
		exports.storage = localstorage();
		exports.destroy = (() => {
			let warned = false;
			return () => {
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
			if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) return true;
			if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) return false;
			let m;
			return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
		}
		/**
		* Colorize log arguments if enabled.
		*
		* @api public
		*/
		function formatArgs(args) {
			args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
			if (!this.useColors) return;
			const c = "color: " + this.color;
			args.splice(1, 0, c, "color: inherit");
			let index = 0;
			let lastC = 0;
			args[0].replace(/%[a-zA-Z%]/g, (match) => {
				if (match === "%%") return;
				index++;
				if (match === "%c") lastC = index;
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
		exports.log = console.debug || console.log || (() => {});
		/**
		* Save `namespaces`.
		*
		* @param {String} namespaces
		* @api private
		*/
		function save(namespaces) {
			try {
				if (namespaces) exports.storage.setItem("debug", namespaces);
				else exports.storage.removeItem("debug");
			} catch (error) {}
		}
		/**
		* Load `namespaces`.
		*
		* @return {String} returns the previously persisted debug modes
		* @api private
		*/
		function load() {
			let r;
			try {
				r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
			} catch (error) {}
			if (!r && typeof process !== "undefined" && "env" in process) r = process.env.DEBUG;
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
			} catch (error) {}
		}
		module.exports = require_common()(exports);
		var { formatters } = module.exports;
		/**
		* Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
		*/
		formatters.j = function(v) {
			try {
				return JSON.stringify(v);
			} catch (error) {
				return "[UnexpectedJSONParseError]: " + error.message;
			}
		};
	})))(), 1);
	var PeerCommandType$1 = /* @__PURE__ */ function(PeerCommandType) {
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
		let resolve;
		let reject;
		return {
			promise: new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			}),
			resolve,
			reject
		};
	}
	function queueMicrotask(fn) {
		Promise.resolve().then(fn);
	}
	function joinChunks(chunks, totalBytes) {
		var _totalBytes;
		(_totalBytes = totalBytes) !== null && _totalBytes !== void 0 || (totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
		const buffer = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			buffer.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return buffer;
	}
	function getRandomItem(items) {
		return items[Math.floor(Math.random() * items.length)];
	}
	function getWeightedRandomItem(items, weightAccessor) {
		if (items.length === 0) throw new Error("Cannot get item from empty array");
		if (items.length === 1) return items[0];
		let totalWeight = 0;
		const weights = items.map((item) => {
			const weight = weightAccessor(item);
			totalWeight += weight;
			return weight;
		});
		let randomWeight = Math.random() * totalWeight;
		for (let i = 0; i < items.length; i++) {
			randomWeight -= weights[i];
			if (randomWeight <= 0) return items[i];
		}
		return items[items.length - 1];
	}
	function utf8ToUintArray(utf8String) {
		return new TextEncoder().encode(utf8String);
	}
	function* arrayBackwards(arr) {
		for (let i = arr.length - 1; i >= 0; i--) yield arr[i];
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
				const result = {};
				Object.keys(obj).forEach((key) => {
					if (obj[key] !== void 0) {
						const value = filter(obj[key]);
						if (value !== void 0) result[key] = value;
					}
				});
				return result;
			} else return obj;
		}
		return filter(obj);
	}
	function deepCopy(item) {
		if (isArray(item)) return item.map((element) => deepCopy(element));
		else if (isObject(item)) {
			const copy = {};
			for (const key of Object.keys(item)) copy[key] = deepCopy(item[key]);
			return copy;
		} else return item;
	}
	function shuffleArray(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}
	function overrideConfig(target, updates, defaults = {}) {
		if (typeof target !== "object" || target === null || typeof updates !== "object" || updates === null) return target;
		Object.keys(updates).forEach((key) => {
			const keyStr = typeof key === "symbol" ? key.toString() : String(key);
			if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error(`Attempt to modify restricted property '${keyStr}'`);
			const updateValue = updates[key];
			const defaultValue = defaults[key];
			if (key in target) if (updateValue === void 0) target[key] = defaultValue === void 0 ? void 0 : defaultValue;
			else target[key] = updateValue;
		});
		return target;
	}
	function mergeAndFilterConfig(options) {
		const { defaultConfig, baseConfig = {}, specificStreamConfig = {} } = options;
		const mergedConfig = deepCopy(_objectSpread2(_objectSpread2(_objectSpread2({}, defaultConfig), baseConfig), specificStreamConfig));
		const keysOfT = Object.keys(defaultConfig);
		const filteredConfig = {};
		keysOfT.forEach((key) => {
			if (key in mergedConfig) filteredConfig[key] = mergedConfig[key];
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
	var SerializedItem = /* @__PURE__ */ function(SerializedItem) {
		SerializedItem[SerializedItem["Min"] = -1] = "Min";
		SerializedItem[SerializedItem["Int"] = 1 + SerializedItem["Min"]] = "Int";
		SerializedItem[SerializedItem["SimilarIntArray"] = 1 + SerializedItem["Int"]] = "SimilarIntArray";
		SerializedItem[SerializedItem["String"] = 1 + SerializedItem["SimilarIntArray"]] = "String";
		SerializedItem[SerializedItem["Max"] = 1 + SerializedItem["String"]] = "Max";
		return SerializedItem;
	}({});
	function getRequiredBytesForInt(num) {
		if (num === 0) return 1;
		const necessaryBits = Math.floor(Math.log2(Math.abs(num))) + 2;
		return Math.ceil(necessaryBits / 8);
	}
	function intToBytes(num) {
		const isNegative = num < 0;
		const bytesAmountNumber = getRequiredBytesForInt(num);
		const bytes = new Uint8Array(bytesAmountNumber);
		num = Math.abs(num);
		for (let i = 0; i < bytesAmountNumber; i++) {
			const shift = 8 * (bytesAmountNumber - 1 - i);
			bytes[i] = Math.floor(num / Math.pow(2, shift)) & 255;
		}
		if (isNegative) bytes[0] = bytes[0] | 128;
		return bytes;
	}
	function bytesToInt(bytes) {
		const byteLength = bytes.length;
		const getNumberPart = (byte, i) => {
			const shift = 8 * (byteLength - 1 - i);
			return byte * Math.pow(2, shift);
		};
		let number = getNumberPart(bytes[0] & 127, 0);
		for (let i = 1; i < byteLength; i++) number += getNumberPart(bytes[i], i);
		if ((bytes[0] & 128) >> 7 !== 0) number = -number;
		return number;
	}
	function serializeInt(num) {
		const numBytes = intToBytes(num);
		const numberMetadata = SerializedItem.Int << 4 | numBytes.length;
		return new Uint8Array([numberMetadata, ...numBytes]);
	}
	function deserializeInt(bytes) {
		if (bytes.length === 0) throw new Error("Buffer is too short");
		const metadata = bytes[0];
		if (metadata >> 4 !== SerializedItem.Int) throw new Error("Trying to deserialize integer with invalid serialized item code");
		const numberBytesLength = metadata & 15;
		const start = 1;
		const end = start + numberBytesLength;
		return {
			number: bytesToInt(bytes.subarray(start, end)),
			byteLength: numberBytesLength + 1
		};
	}
	function serializeSimilarIntArray(numbers) {
		const commonPartNumbersMap = /* @__PURE__ */ new Map();
		for (const number of numbers) {
			var _commonPartNumbersMap;
			const diffByte = number & 255;
			const common = number - diffByte;
			const bytes = (_commonPartNumbersMap = commonPartNumbersMap.get(common)) !== null && _commonPartNumbersMap !== void 0 ? _commonPartNumbersMap : new ResizableUint8Array();
			if (!bytes.length) commonPartNumbersMap.set(common, bytes);
			bytes.push(diffByte);
		}
		const result = new ResizableUint8Array();
		result.push([SerializedItem.SimilarIntArray << 4, commonPartNumbersMap.size]);
		for (const [commonPart, binaryArray] of commonPartNumbersMap) {
			const { length } = binaryArray.getBytesChunks();
			const commonPartWithLength = commonPart + (length & 255);
			binaryArray.unshift(serializeInt(commonPartWithLength));
			result.push(binaryArray.getBuffer());
		}
		return result.getBuffer();
	}
	function deserializeSimilarIntArray(bytes) {
		if (bytes.length < 2) throw new Error("Buffer is too short");
		const [codeByte, commonPartArraysAmount] = bytes;
		if (codeByte >> 4 !== SerializedItem.SimilarIntArray) throw new Error("Trying to deserialize similar int array with invalid serialized item code");
		let offset = 2;
		const originalIntArr = [];
		for (let i = 0; i < commonPartArraysAmount; i++) {
			const { number: commonPartWithLength, byteLength } = deserializeInt(bytes.subarray(offset));
			offset += byteLength;
			const arrayLength = commonPartWithLength & 255;
			const commonPart = commonPartWithLength - arrayLength;
			for (let j = 0; j < arrayLength; j++) {
				const diffPart = bytes[offset];
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
		const encoded = textEncoder.encode(string);
		const { length } = encoded;
		if (length > 4095) throw new Error("String exceeds maximum length of 4095 bytes");
		const bytes = new ResizableUint8Array();
		bytes.push([SerializedItem.String << 4 | length >> 8 & 15, length & 255]);
		bytes.push(encoded);
		return bytes.getBuffer();
	}
	function deserializeString(bytes) {
		if (bytes.length < 2) throw new Error("Buffer is too short");
		const [codeByte, lengthByte] = bytes;
		if (codeByte >> 4 !== SerializedItem.String) throw new Error("Trying to deserialize bytes (sting) with invalid serialized item code.");
		const length = (codeByte & 15) << 8 | lengthByte;
		const stringBytes = bytes.subarray(2, length + 2);
		return {
			string: textDecoder.decode(stringBytes),
			byteLength: length + 2
		};
	}
	var _bytes$1 = /* @__PURE__ */ new WeakMap();
	var _length = /* @__PURE__ */ new WeakMap();
	var _ResizableUint8Array_brand = /* @__PURE__ */ new WeakSet();
	var ResizableUint8Array = class {
		constructor() {
			_classPrivateMethodInitSpec(this, _ResizableUint8Array_brand);
			_classPrivateFieldInitSpec(this, _bytes$1, []);
			_classPrivateFieldInitSpec(this, _length, 0);
		}
		push(bytes) {
			_assertClassBrand(_ResizableUint8Array_brand, this, _addBytes).call(this, bytes, "end");
		}
		unshift(bytes) {
			_assertClassBrand(_ResizableUint8Array_brand, this, _addBytes).call(this, bytes, "start");
		}
		getBytesChunks() {
			return _classPrivateFieldGet2(_bytes$1, this);
		}
		getBuffer() {
			return joinChunks(_classPrivateFieldGet2(_bytes$1, this), _classPrivateFieldGet2(_length, this));
		}
		get length() {
			return _classPrivateFieldGet2(_length, this);
		}
	};
	function _addBytes(bytes, position) {
		let bytesToAdd;
		if (bytes instanceof Uint8Array) bytesToAdd = bytes;
		else if (Array.isArray(bytes)) bytesToAdd = new Uint8Array(bytes);
		else bytesToAdd = new Uint8Array([bytes]);
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
		if (buffer.length < commandFramesLength) return false;
		const { length } = commandFrameStart;
		const bufferEndingToCompare = buffer.subarray(-length);
		return startFrames.some((frame) => areBuffersEqual(buffer, frame, FRAME_PART_LENGTH)) && endFrames.some((frame) => areBuffersEqual(bufferEndingToCompare, frame, FRAME_PART_LENGTH));
	}
	function isFirstCommandChunk(buffer) {
		if (buffer.length < commandFramesLength) return false;
		return areBuffersEqual(buffer, commandFrameStart, FRAME_PART_LENGTH);
	}
	function isLastCommandChunk(buffer) {
		if (buffer.length < commandFramesLength) return false;
		return areBuffersEqual(buffer.subarray(-FRAME_PART_LENGTH), commandFrameEnd, FRAME_PART_LENGTH);
	}
	var BinaryCommandJoiningError = class extends Error {
		constructor(type) {
			super();
			_defineProperty(this, "type", void 0);
			this.type = type;
		}
	};
	var _chunks = /* @__PURE__ */ new WeakMap();
	var _status = /* @__PURE__ */ new WeakMap();
	var _onComplete = /* @__PURE__ */ new WeakMap();
	var _BinaryCommandChunksJoiner_brand = /* @__PURE__ */ new WeakSet();
	var BinaryCommandChunksJoiner = class {
		constructor(onComplete) {
			_classPrivateMethodInitSpec(this, _BinaryCommandChunksJoiner_brand);
			_classPrivateFieldInitSpec(this, _chunks, new ResizableUint8Array());
			_classPrivateFieldInitSpec(this, _status, "joining");
			_classPrivateFieldInitSpec(this, _onComplete, void 0);
			_classPrivateFieldSet2(_onComplete, this, onComplete);
		}
		addCommandChunk(chunk) {
			if (_classPrivateFieldGet2(_status, this) === "completed") return;
			const isFirstChunk = isFirstCommandChunk(chunk);
			if (!_classPrivateFieldGet2(_chunks, this).length && !isFirstChunk) throw new BinaryCommandJoiningError("no-first-chunk");
			if (_classPrivateFieldGet2(_chunks, this).length && isFirstChunk) throw new BinaryCommandJoiningError("incomplete-joining");
			_classPrivateFieldGet2(_chunks, this).push(_assertClassBrand(_BinaryCommandChunksJoiner_brand, this, _unframeCommandChunk).call(this, chunk));
			if (!isLastCommandChunk(chunk)) return;
			_classPrivateFieldSet2(_status, this, "completed");
			_classPrivateFieldGet2(_onComplete, this).call(this, _classPrivateFieldGet2(_chunks, this).getBuffer());
		}
	};
	function _unframeCommandChunk(chunk) {
		if (chunk.length < commandFramesLength) throw new Error("Command chunk is too short to unframe");
		return chunk.subarray(FRAME_PART_LENGTH, chunk.length - FRAME_PART_LENGTH);
	}
	var _bytes = /* @__PURE__ */ new WeakMap();
	var _resultBuffers = /* @__PURE__ */ new WeakMap();
	var _status2 = /* @__PURE__ */ new WeakMap();
	var _maxChunkLength = /* @__PURE__ */ new WeakMap();
	var BinaryCommandCreator = class {
		constructor(commandType, maxChunkLength) {
			_classPrivateFieldInitSpec(this, _bytes, new ResizableUint8Array());
			_classPrivateFieldInitSpec(this, _resultBuffers, []);
			_classPrivateFieldInitSpec(this, _status2, "creating");
			_classPrivateFieldInitSpec(this, _maxChunkLength, void 0);
			_classPrivateFieldSet2(_maxChunkLength, this, maxChunkLength);
			_classPrivateFieldGet2(_bytes, this).push(commandType);
		}
		addInteger(name, value) {
			_classPrivateFieldGet2(_bytes, this).push(name.charCodeAt(0));
			const bytes = serializeInt(value);
			_classPrivateFieldGet2(_bytes, this).push(bytes);
		}
		addSimilarIntArr(name, arr) {
			_classPrivateFieldGet2(_bytes, this).push(name.charCodeAt(0));
			const bytes = serializeSimilarIntArray(arr);
			_classPrivateFieldGet2(_bytes, this).push(bytes);
		}
		addString(name, string) {
			_classPrivateFieldGet2(_bytes, this).push(name.charCodeAt(0));
			const bytes = serializeString(string);
			_classPrivateFieldGet2(_bytes, this).push(bytes);
		}
		complete() {
			if (!_classPrivateFieldGet2(_bytes, this).length) throw new Error("Buffer is empty");
			if (_classPrivateFieldGet2(_status2, this) === "completed") return;
			_classPrivateFieldSet2(_status2, this, "completed");
			const unframedBuffer = _classPrivateFieldGet2(_bytes, this).getBuffer();
			if (unframedBuffer.length + commandFramesLength <= _classPrivateFieldGet2(_maxChunkLength, this)) {
				_classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(unframedBuffer, commandFrameStart, commandFrameEnd));
				return;
			}
			let chunksCount = Math.ceil(unframedBuffer.length / _classPrivateFieldGet2(_maxChunkLength, this));
			if (Math.ceil(unframedBuffer.length / chunksCount) + commandFramesLength > _classPrivateFieldGet2(_maxChunkLength, this)) chunksCount++;
			for (const [i, chunk] of splitBufferToEqualChunks(unframedBuffer, chunksCount)) if (i === 0) _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(chunk, commandFrameStart, commandDivFrameEnd));
			else if (i === chunksCount - 1) _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(chunk, commandDivFrameStart, commandFrameEnd));
			else _classPrivateFieldGet2(_resultBuffers, this).push(frameBuffer(chunk, commandDivFrameStart, commandDivFrameEnd));
		}
		getResultBuffers() {
			if (_classPrivateFieldGet2(_status2, this) === "creating" || !_classPrivateFieldGet2(_resultBuffers, this).length) throw new Error("Command is not complete.");
			return _classPrivateFieldGet2(_resultBuffers, this);
		}
	};
	function deserializeCommand(bytes) {
		const [commandCode] = bytes;
		const deserializedCommand = { c: commandCode };
		let offset = 1;
		while (offset < bytes.length) {
			const name = String.fromCharCode(bytes[offset]);
			offset++;
			switch (getDataTypeFromByte(bytes[offset])) {
				case SerializedItem.Int:
					{
						const { number, byteLength } = deserializeInt(bytes.subarray(offset));
						deserializedCommand[name] = number;
						offset += byteLength;
					}
					break;
				case SerializedItem.SimilarIntArray:
					{
						const { numbers, byteLength } = deserializeSimilarIntArray(bytes.subarray(offset));
						deserializedCommand[name] = numbers;
						offset += byteLength;
					}
					break;
				case SerializedItem.String:
					{
						const { string, byteLength } = deserializeString(bytes.subarray(offset));
						deserializedCommand[name] = string;
						offset += byteLength;
					}
					break;
			}
		}
		return validateCommand(deserializedCommand);
	}
	function getDataTypeFromByte(byte) {
		const typeCode = byte >> 4;
		if (typeCode <= SerializedItem.Min || typeCode >= SerializedItem.Max) throw new Error("Not existing type");
		return typeCode;
	}
	function stringToUtf8CodesBuffer(string, length) {
		if (length && string.length !== length) throw new Error("Wrong string length");
		const buffer = new Uint8Array(length !== null && length !== void 0 ? length : string.length);
		for (let i = 0; i < string.length; i++) buffer[i] = string.charCodeAt(i);
		return buffer;
	}
	function* splitBufferToEqualChunks(buffer, chunksCount) {
		const chunkLength = Math.ceil(buffer.length / chunksCount);
		for (let i = 0; i < chunksCount; i++) yield [i, buffer.subarray(i * chunkLength, (i + 1) * chunkLength)];
	}
	function frameBuffer(buffer, frameStart, frameEnd) {
		const result = new Uint8Array(buffer.length + frameStart.length + frameEnd.length);
		result.set(frameStart);
		result.set(buffer, frameStart.length);
		result.set(frameEnd, frameStart.length + buffer.length);
		return result;
	}
	function areBuffersEqual(buffer1, buffer2, length) {
		for (let i = 0; i < length; i++) if (buffer1[i] !== buffer2[i]) return false;
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
			default: throw new Error(`Unknown peer command type: ${String(command.c)}`);
		}
	}
	function assertNumberFields(obj, ...fields) {
		for (const field of fields) if (typeof obj[field] !== "number") throw new Error(`Expected number field "${field}", got ${typeof obj[field]}`);
	}
	//#endregion
	//#region ../p2p-media-loader-core/src/p2p/commands/commands.ts
	function serializeSegmentAnnouncementCommand(command, maxChunkSize) {
		const { c: commandCode, p: loadingByHttp, l: loaded } = command;
		const creator = new BinaryCommandCreator(commandCode, maxChunkSize);
		if (loaded === null || loaded === void 0 ? void 0 : loaded.length) creator.addSimilarIntArr("l", loaded);
		if (loadingByHttp === null || loadingByHttp === void 0 ? void 0 : loadingByHttp.length) creator.addSimilarIntArr("p", loadingByHttp);
		creator.complete();
		return creator.getResultBuffers();
	}
	function serializePeerSegmentCommand(command, maxChunkSize) {
		const creator = new BinaryCommandCreator(command.c, maxChunkSize);
		creator.addInteger("i", command.i);
		creator.addInteger("r", command.r);
		creator.complete();
		return creator.getResultBuffers();
	}
	function serializePeerSendSegmentCommand(command, maxChunkSize) {
		const creator = new BinaryCommandCreator(command.c, maxChunkSize);
		creator.addInteger("i", command.i);
		creator.addInteger("s", command.s);
		creator.addInteger("r", command.r);
		creator.complete();
		return creator.getResultBuffers();
	}
	function serializePeerSegmentRequestCommand(command, maxChunkSize) {
		const creator = new BinaryCommandCreator(command.c, maxChunkSize);
		creator.addInteger("i", command.i);
		creator.addInteger("r", command.r);
		if (command.b) creator.addInteger("b", command.b);
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
		BinaryCommandChunksJoiner: () => BinaryCommandChunksJoiner,
		BinaryCommandJoiningError: () => BinaryCommandJoiningError,
		PeerCommandType: () => PeerCommandType$1,
		deserializeCommand: () => deserializeCommand,
		isCommandChunk: () => isCommandChunk,
		serializePeerCommand: () => serializePeerCommand
	});
	//#endregion
	//#region ../p2p-media-loader-core/src/webtorrent/utils.ts
	function getRTCError(event, fallbackMessage = "RTC error") {
		var _errorEvent$error$mes, _errorEvent$error;
		const errorEvent = event;
		if (errorEvent.error instanceof Error) return errorEvent.error;
		const msg = (_errorEvent$error$mes = (_errorEvent$error = errorEvent.error) === null || _errorEvent$error === void 0 ? void 0 : _errorEvent$error.message) !== null && _errorEvent$error$mes !== void 0 ? _errorEvent$error$mes : fallbackMessage;
		return new Error(msg);
	}
	function getRTCErrorMessage(event, fallbackMessage = "RTC error") {
		return getRTCError(event, fallbackMessage).message;
	}
	function isTerminalConnectionState(state) {
		return state === "failed" || state === "closed" || state === "disconnected";
	}
	//#endregion
	//#region ../p2p-media-loader-core/src/webtorrent/data-channel-sender.ts
	var MAX_BUFFERED_AMOUNT = 64 * 1024;
	var _currentSendContext = /* @__PURE__ */ new WeakMap();
	var DataChannelSender = class {
		constructor(channel, maxMessageSize) {
			_defineProperty(this, "channel", void 0);
			_defineProperty(this, "maxMessageSize", void 0);
			_classPrivateFieldInitSpec(this, _currentSendContext, void 0);
			this.channel = channel;
			this.maxMessageSize = maxMessageSize;
		}
		sendData(data, onChunkSent) {
			var _this = this;
			return _asyncToGenerator(function* () {
				if (_classPrivateFieldGet2(_currentSendContext, _this)) throw new Error("Already sending data");
				if (_this.channel.readyState !== "open") throw new Error("Data channel is not open");
				_this.channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT;
				const { promise, resolve, reject } = getPromiseWithResolvers();
				let offset = 0;
				let isSettled = false;
				const cleanup = () => {
					if (isSettled) return false;
					isSettled = true;
					_classPrivateFieldSet2(_currentSendContext, _this, void 0);
					_this.channel.removeEventListener("bufferedamountlow", sendChunks);
					_this.channel.removeEventListener("closing", onClose);
					_this.channel.removeEventListener("close", onClose);
					_this.channel.removeEventListener("error", onError);
					return true;
				};
				_classPrivateFieldSet2(_currentSendContext, _this, { cancel: () => {
					if (cleanup()) reject(/* @__PURE__ */ new Error("Send cancelled"));
				} });
				const onClose = () => {
					if (cleanup()) reject(/* @__PURE__ */ new Error("Data channel closed"));
				};
				const onError = (event) => {
					if (!cleanup()) return;
					const message = getRTCErrorMessage(event, "Unknown error");
					reject(/* @__PURE__ */ new Error(`Data channel error: ${message}`));
				};
				const buffer = ArrayBuffer.isView(data) ? data.buffer : data;
				const byteOffset = ArrayBuffer.isView(data) ? data.byteOffset : 0;
				const sendChunks = () => {
					if (isSettled) return;
					if (_this.channel.readyState !== "open") {
						if (cleanup()) reject(/* @__PURE__ */ new Error(`Data channel not open (state: ${_this.channel.readyState})`));
						return;
					}
					try {
						while (offset < data.byteLength) {
							if (_this.channel.bufferedAmount > MAX_BUFFERED_AMOUNT) return;
							const bytesToSend = Math.min(_this.maxMessageSize, data.byteLength - offset);
							const chunk = new Uint8Array(buffer, byteOffset + offset, bytesToSend);
							_this.channel.send(chunk);
							offset += bytesToSend;
							onChunkSent === null || onChunkSent === void 0 || onChunkSent(bytesToSend);
							if (!_classPrivateFieldGet2(_currentSendContext, _this)) return;
						}
					} catch (error) {
						if (cleanup()) reject(error instanceof Error ? error : new Error(String(error)));
						return;
					}
					if (cleanup()) resolve();
				};
				_this.channel.addEventListener("bufferedamountlow", sendChunks);
				_this.channel.addEventListener("closing", onClose);
				_this.channel.addEventListener("close", onClose);
				_this.channel.addEventListener("error", onError);
				sendChunks();
				return promise;
			})();
		}
		cancel() {
			var _classPrivateFieldGet2$4;
			(_classPrivateFieldGet2$4 = _classPrivateFieldGet2(_currentSendContext, this)) === null || _classPrivateFieldGet2$4 === void 0 || _classPrivateFieldGet2$4.cancel();
		}
	};
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
	var PeerProtocol = class {
		constructor(channel, peerConfig, eventHandlers, eventTarget, peerId) {
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
			_classPrivateFieldInitSpec(this, _onMessageReceived, (event) => {
				const data = new Uint8Array(event.data);
				if (isCommandChunk(data)) _assertClassBrand(_PeerProtocol_brand, this, _receivingCommandBytes).call(this, data);
				else {
					_classPrivateFieldGet2(_eventHandlers$1, this).onSegmentChunkReceived(data);
					_classPrivateFieldGet2(_onChunkDownloaded, this).call(this, data.byteLength, "p2p", _classPrivateFieldGet2(_peerId, this));
				}
			});
			_classPrivateFieldSet2(_channel, this, channel);
			_classPrivateFieldSet2(_peerConfig$1, this, peerConfig);
			_classPrivateFieldSet2(_eventHandlers$1, this, eventHandlers);
			_classPrivateFieldSet2(_peerId, this, peerId);
			_classPrivateFieldSet2(_dataChannelSender, this, new DataChannelSender(channel, peerConfig.webRtcMaxMessageSize));
			_classPrivateFieldSet2(_onChunkDownloaded, this, eventTarget.getEventDispatcher("onChunkDownloaded"));
			_classPrivateFieldSet2(_onChunkUploaded, this, eventTarget.getEventDispatcher("onChunkUploaded"));
			if (channel.binaryType !== "arraybuffer") throw new Error(`Expected binaryType "arraybuffer", got "${channel.binaryType}"`);
			channel.addEventListener("message", _classPrivateFieldGet2(_onMessageReceived, this));
		}
		sendCommand(command) {
			if (_classPrivateFieldGet2(_channel, this).readyState !== "open") {
				logger("dropping command %d (channel state: %s)", command.c, _classPrivateFieldGet2(_channel, this).readyState);
				return;
			}
			const binaryCommandBuffers = serializePeerCommand(command, _classPrivateFieldGet2(_peerConfig$1, this).webRtcMaxMessageSize);
			try {
				for (const buffer of binaryCommandBuffers) _classPrivateFieldGet2(_channel, this).send(buffer);
			} catch (err) {
				logger("error sending command: %O", err);
			}
		}
		stopUploadingSegmentData() {
			_classPrivateFieldGet2(_dataChannelSender, this).cancel();
			_classPrivateFieldSet2(_uploadingRequestId, this, void 0);
		}
		getUploadingRequestId() {
			return _classPrivateFieldGet2(_uploadingRequestId, this);
		}
		splitSegmentDataToChunksAndUploadAsync(data, requestId) {
			var _this = this;
			return _asyncToGenerator(function* () {
				if (_classPrivateFieldGet2(_uploadingRequestId, _this) !== void 0) throw new Error(`Some segment data is already uploading.`);
				_classPrivateFieldSet2(_uploadingRequestId, _this, requestId);
				try {
					yield _classPrivateFieldGet2(_dataChannelSender, _this).sendData(data, (chunkSize) => {
						_classPrivateFieldGet2(_onChunkUploaded, _this).call(_this, chunkSize, _classPrivateFieldGet2(_peerId, _this));
					});
				} finally {
					if (_classPrivateFieldGet2(_uploadingRequestId, _this) === requestId) _classPrivateFieldSet2(_uploadingRequestId, _this, void 0);
				}
			})();
		}
		destroy() {
			_classPrivateFieldGet2(_channel, this).removeEventListener("message", _classPrivateFieldGet2(_onMessageReceived, this));
			_classPrivateFieldGet2(_dataChannelSender, this).cancel();
			_classPrivateFieldSet2(_commandChunks, this, void 0);
			_classPrivateFieldSet2(_uploadingRequestId, this, void 0);
		}
	};
	function _receivingCommandBytes(buffer) {
		var _classPrivateFieldGet2$3;
		(_classPrivateFieldGet2$3 = _classPrivateFieldGet2(_commandChunks, this)) !== null && _classPrivateFieldGet2$3 !== void 0 || _classPrivateFieldSet2(_commandChunks, this, new BinaryCommandChunksJoiner((commandBuffer) => {
			_classPrivateFieldSet2(_commandChunks, this, void 0);
			try {
				const command = deserializeCommand(commandBuffer);
				_classPrivateFieldGet2(_eventHandlers$1, this).onCommandReceived(command);
			} catch (err) {
				logger("error processing command: %O", err);
			}
		}));
		try {
			_classPrivateFieldGet2(_commandChunks, this).addCommandChunk(buffer);
		} catch (err) {
			logger("error receiving command chunks: %O", err);
			_classPrivateFieldSet2(_commandChunks, this, void 0);
		}
	}
	//#endregion
	//#region ../p2p-media-loader-core/src/bandwidth-calculator.ts
	var MIN_TIME_DIFF_MS = 1;
	var BandwidthCalculator = class {
		constructor(clearThresholdMs = 2e4) {
			_defineProperty(this, "clearThresholdMs", void 0);
			_defineProperty(this, "loadingsCount", 0);
			_defineProperty(this, "bytes", []);
			_defineProperty(this, "loadingOnlyTimestamps", []);
			_defineProperty(this, "timestamps", []);
			_defineProperty(this, "noLoadingsTime", 0);
			_defineProperty(this, "loadingsStoppedAt", 0);
			this.clearThresholdMs = clearThresholdMs;
		}
		addBytes(bytesLength, now = performance.now()) {
			this.bytes.push(bytesLength);
			this.loadingOnlyTimestamps.push(now - this.noLoadingsTime);
			this.timestamps.push(now);
		}
		startLoading(now = performance.now()) {
			this.clearStale();
			if (this.loadingsCount === 0 && this.loadingsStoppedAt !== 0) this.noLoadingsTime += now - this.loadingsStoppedAt;
			this.loadingsCount++;
		}
		stopLoading(now = performance.now()) {
			if (this.loadingsCount > 0) {
				this.loadingsCount--;
				if (this.loadingsCount === 0) this.loadingsStoppedAt = now;
			}
		}
		getBandwidthLoadingOnly(seconds, ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY) {
			if (!this.loadingOnlyTimestamps.length) return 0;
			const milliseconds = seconds * 1e3;
			const lastItemTimestamp = this.loadingOnlyTimestamps[this.loadingOnlyTimestamps.length - 1];
			let lastCountedTimestamp = lastItemTimestamp;
			const threshold = lastItemTimestamp - milliseconds;
			let totalBytes = 0;
			for (let i = this.bytes.length - 1; i >= 0; i--) {
				const timestamp = this.loadingOnlyTimestamps[i];
				if (timestamp < threshold || this.timestamps[i] < ignoreThresholdTimestamp) break;
				lastCountedTimestamp = timestamp;
				totalBytes += this.bytes[i];
			}
			const timeDiff = Math.max(lastItemTimestamp - lastCountedTimestamp, MIN_TIME_DIFF_MS);
			return totalBytes * 8e3 / timeDiff;
		}
		getBandwidth(seconds, ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY, now = performance.now()) {
			if (!this.timestamps.length) return 0;
			const threshold = now - seconds * 1e3;
			let lastCountedTimestamp = now;
			let totalBytes = 0;
			for (let i = this.bytes.length - 1; i >= 0; i--) {
				const timestamp = this.timestamps[i];
				if (timestamp < threshold || timestamp < ignoreThresholdTimestamp) break;
				lastCountedTimestamp = timestamp;
				totalBytes += this.bytes[i];
			}
			const timeDiff = Math.max(now - lastCountedTimestamp, MIN_TIME_DIFF_MS);
			return totalBytes * 8e3 / timeDiff;
		}
		clearStale() {
			if (!this.loadingOnlyTimestamps.length) return;
			const threshold = this.loadingOnlyTimestamps[this.loadingOnlyTimestamps.length - 1] - this.clearThresholdMs;
			let samplesToRemove = 0;
			for (const timestamp of this.loadingOnlyTimestamps) {
				if (timestamp > threshold) break;
				samplesToRemove++;
			}
			this.bytes.splice(0, samplesToRemove);
			this.loadingOnlyTimestamps.splice(0, samplesToRemove);
			this.timestamps.splice(0, samplesToRemove);
		}
		clear() {
			this.bytes.length = 0;
			this.loadingOnlyTimestamps.length = 0;
			this.timestamps.length = 0;
			this.loadingsCount = 0;
			this.noLoadingsTime = 0;
			this.loadingsStoppedAt = 0;
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/p2p/peer.ts
	var { PeerCommandType } = commands_exports;
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
	var Peer = class {
		constructor(id, channel, closeConnection, eventHandlers, peerConfig, eventTarget) {
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
			_classPrivateFieldInitSpec(this, _onCommandReceived, function() {
				var _ref = _asyncToGenerator(function* (command) {
					switch (command.c) {
						case PeerCommandType.SegmentsAnnouncement:
							_classPrivateFieldSet2(_loadedSegments, _this, new Set(command.l));
							_classPrivateFieldSet2(_httpLoadingSegments, _this, new Set(command.p));
							_classPrivateFieldGet2(_eventHandlers, _this).onSegmentsAnnouncement();
							break;
						case PeerCommandType.SegmentRequest:
							_classPrivateFieldGet2(_peerProtocol, _this).stopUploadingSegmentData();
							_classPrivateFieldGet2(_eventHandlers, _this).onSegmentRequested(_this, command.i, command.r, command.b);
							break;
						case PeerCommandType.SegmentData:
							{
								if (!_classPrivateFieldGet2(_downloadingContext, _this)) break;
								if (_classPrivateFieldGet2(_downloadingContext, _this).isSegmentDataCommandReceived) break;
								const { request, controls, requestId } = _classPrivateFieldGet2(_downloadingContext, _this);
								if (request.segment.externalId !== command.i || requestId !== command.r) break;
								_classPrivateFieldGet2(_downloadingContext, _this).isSegmentDataCommandReceived = true;
								controls.firstBytesReceived();
								if (request.totalBytes === void 0) request.setTotalBytes(command.s);
								else if (request.totalBytes - request.loadedBytes !== command.s) {
									request.clearLoadedBytes();
									_assertClassBrand(_Peer_brand, _this, _sendCancelSegmentRequestCommand).call(_this, request.segment, requestId);
									_assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-response-bytes-length-mismatch");
									_this.destroy(false, "Peer response bytes length mismatch");
								}
							}
							break;
						case PeerCommandType.SegmentDataSendingCompleted: {
							const downloadingContext = _classPrivateFieldGet2(_downloadingContext, _this);
							if (!(downloadingContext === null || downloadingContext === void 0 ? void 0 : downloadingContext.isSegmentDataCommandReceived)) return;
							const { request, controls } = downloadingContext;
							if (downloadingContext.request.segment.externalId !== command.i || downloadingContext.requestId !== command.r) {
								request.clearLoadedBytes();
								_assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-protocol-violation");
								_this.destroy(false, "Peer protocol violation");
								return;
							}
							if (request.loadedBytes !== request.totalBytes) {
								request.clearLoadedBytes();
								_assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-response-bytes-length-mismatch");
								_this.destroy(false, "Peer response bytes length mismatch");
								return;
							}
							const isValid = yield request.validateData(_classPrivateFieldGet2(_peerConfig, _this).validateP2PSegment);
							if (_classPrivateFieldGet2(_isDestroyed$1, _this)) return;
							if (_classPrivateFieldGet2(_downloadingContext, _this) !== downloadingContext) return;
							if (!isValid) {
								request.clearLoadedBytes();
								_assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "p2p-segment-validation-failed");
								_this.destroy(false, "P2P segment validation failed");
								return;
							}
							_classPrivateFieldSet2(_downloadingErrors, _this, []);
							controls.completeOnSuccess();
							_classPrivateFieldGet2(_bandwidthCalculator, _this).stopLoading();
							_classPrivateFieldSet2(_downloadingContext, _this, void 0);
							break;
						}
						case PeerCommandType.SegmentAbsent:
							var _classPrivateFieldGet2$2;
							if (((_classPrivateFieldGet2$2 = _classPrivateFieldGet2(_downloadingContext, _this)) === null || _classPrivateFieldGet2$2 === void 0 ? void 0 : _classPrivateFieldGet2$2.request.segment.externalId) === command.i && _classPrivateFieldGet2(_downloadingContext, _this).requestId === command.r) {
								_assertClassBrand(_Peer_brand, _this, _cancelSegmentDownloading).call(_this, "peer-segment-absent");
								_classPrivateFieldGet2(_loadedSegments, _this).delete(command.i);
							}
							break;
						case PeerCommandType.CancelSegmentRequest:
							if (_classPrivateFieldGet2(_peerProtocol, _this).getUploadingRequestId() !== command.r) break;
							_classPrivateFieldGet2(_peerProtocol, _this).stopUploadingSegmentData();
							break;
					}
				});
				return function(_x) {
					return _ref.apply(this, arguments);
				};
			}());
			_defineProperty(this, "onSegmentChunkReceived", (chunk) => {
				var _classPrivateFieldGet3;
				if (!((_classPrivateFieldGet3 = _classPrivateFieldGet2(_downloadingContext, this)) === null || _classPrivateFieldGet3 === void 0 ? void 0 : _classPrivateFieldGet3.isSegmentDataCommandReceived)) return;
				const { request, controls } = _classPrivateFieldGet2(_downloadingContext, this);
				if (request.totalBytes !== void 0 && request.loadedBytes + chunk.byteLength > request.totalBytes) {
					request.clearLoadedBytes();
					_assertClassBrand(_Peer_brand, this, _cancelSegmentDownloading).call(this, "peer-response-bytes-length-mismatch");
					this.destroy(false, "Peer response bytes length mismatch");
					return;
				}
				_classPrivateFieldGet2(_bandwidthCalculator, this).addBytes(chunk.byteLength);
				_classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp = 0;
				controls.addLoadedChunk(chunk);
			});
			_defineProperty(this, "destroy", (isConnectionClosed = false, error) => {
				if (_classPrivateFieldGet2(_isDestroyed$1, this)) return;
				_classPrivateFieldSet2(_isDestroyed$1, this, true);
				_assertClassBrand(_Peer_brand, this, _cancelSegmentDownloading).call(this, "peer-closed");
				_classPrivateFieldGet2(_peerProtocol, this).destroy();
				if (!isConnectionClosed) _classPrivateFieldGet2(_closeConnection, this).call(this, error);
				_classPrivateFieldGet2(_logger$1, this).call(this, `peer closed ${this.id}`);
			});
			this.id = id;
			this.channel = channel;
			this.eventTarget = eventTarget;
			_classPrivateFieldSet2(_closeConnection, this, closeConnection);
			_classPrivateFieldSet2(_eventHandlers, this, eventHandlers);
			_classPrivateFieldSet2(_peerConfig, this, peerConfig);
			_classPrivateFieldSet2(_peerProtocol, this, new PeerProtocol(channel, peerConfig, {
				onSegmentChunkReceived: this.onSegmentChunkReceived,
				onCommandReceived: (command) => void _classPrivateFieldGet2(_onCommandReceived, this).call(this, command).catch((error) => {
					_classPrivateFieldGet2(_logger$1, this).call(this, "error processing command %O: %O", command, error);
				})
			}, eventTarget, id));
		}
		get downloadingSegment() {
			var _classPrivateFieldGet4;
			return (_classPrivateFieldGet4 = _classPrivateFieldGet2(_downloadingContext, this)) === null || _classPrivateFieldGet4 === void 0 ? void 0 : _classPrivateFieldGet4.request.segment;
		}
		get downloadBandwidth() {
			const now = performance.now();
			if (now - _classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp > 1e3) {
				_classPrivateFieldGet2(_cachedDownloadBandwidth, this).value = _classPrivateFieldGet2(_bandwidthCalculator, this).getBandwidthLoadingOnly(15);
				_classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp = now;
			}
			return _classPrivateFieldGet2(_cachedDownloadBandwidth, this).value;
		}
		getSegmentStatus(segment) {
			const { externalId } = segment;
			if (_classPrivateFieldGet2(_loadedSegments, this).has(externalId)) return "loaded";
			if (_classPrivateFieldGet2(_httpLoadingSegments, this).has(externalId)) return "http-loading";
		}
		downloadSegment(segmentRequest) {
			if (_classPrivateFieldGet2(_isDestroyed$1, this)) return;
			if (_classPrivateFieldGet2(_downloadingContext, this)) throw new Error("Some segment already is downloading");
			if (segmentRequest.tryCompleteByLoadedBytes({
				downloadSource: "p2p",
				peerId: this.id
			}, {
				notReceivingBytesTimeoutMs: _classPrivateFieldGet2(_peerConfig, this).p2pNotReceivingBytesTimeoutMs,
				abort: () => void 0
			}, _classPrivateFieldGet2(_peerConfig, this).validateP2PSegment, "p2p-segment-validation-failed")) return;
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
					abort: (error) => {
						if (!_classPrivateFieldGet2(_downloadingContext, this)) return;
						const { request, requestId } = _classPrivateFieldGet2(_downloadingContext, this);
						_assertClassBrand(_Peer_brand, this, _sendCancelSegmentRequestCommand).call(this, request.segment, requestId);
						_classPrivateFieldGet2(_downloadingErrors, this).push(error);
						_classPrivateFieldGet2(_bandwidthCalculator, this).stopLoading();
						if (error.type !== "abort") {
							_classPrivateFieldGet2(_bandwidthCalculator, this).clear();
							_classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp = 0;
							_classPrivateFieldGet2(_logger$1, this).call(this, `cleared bandwidth history due to ${error.type}`);
						}
						_classPrivateFieldSet2(_downloadingContext, this, void 0);
						if (_classPrivateFieldGet2(_downloadingErrors, this).filter((error) => error.type === "bytes-receiving-timeout").length >= _classPrivateFieldGet2(_peerConfig, this).p2pErrorRetries) this.destroy(false, "Too many timeout errors");
					}
				})
			});
			const command = {
				c: PeerCommandType.SegmentRequest,
				r: _classPrivateFieldGet2(_downloadingContext, this).requestId,
				i: segmentRequest.segment.externalId
			};
			if (segmentRequest.loadedBytes) command.b = segmentRequest.loadedBytes;
			_classPrivateFieldGet2(_peerProtocol, this).sendCommand(command);
		}
		uploadSegmentData(segment, requestId, data) {
			var _this2 = this;
			return _asyncToGenerator(function* () {
				if (_classPrivateFieldGet2(_isDestroyed$1, _this2)) return;
				const { externalId } = segment;
				_classPrivateFieldGet2(_logger$1, _this2).call(_this2, `send segment ${segment.externalId} to ${_this2.id} (byteLength: ${data.byteLength})`);
				const command = {
					c: PeerCommandType.SegmentData,
					i: externalId,
					r: requestId,
					s: data.byteLength
				};
				_classPrivateFieldGet2(_peerProtocol, _this2).sendCommand(command);
				try {
					yield _classPrivateFieldGet2(_peerProtocol, _this2).splitSegmentDataToChunksAndUploadAsync(data, requestId);
					if (_assertClassBrand(_Peer_brand, _this2, _checkIsDestroyed).call(_this2)) return;
					_assertClassBrand(_Peer_brand, _this2, _sendSegmentDataSendingCompletedCommand).call(_this2, segment, requestId);
					_classPrivateFieldGet2(_logger$1, _this2).call(_this2, `segment ${externalId} has been sent to ${_this2.id}`);
				} catch (_unused) {
					_classPrivateFieldGet2(_logger$1, _this2).call(_this2, `cancel segment uploading ${externalId}`);
				}
			})();
		}
		sendSegmentsAnnouncementCommand(loadedSegmentsIds, httpLoadingSegmentsIds) {
			const command = {
				c: PeerCommandType.SegmentsAnnouncement,
				p: httpLoadingSegmentsIds,
				l: loadedSegmentsIds
			};
			_classPrivateFieldGet2(_peerProtocol, this).sendCommand(command);
		}
		sendSegmentAbsentCommand(segmentExternalId, requestId) {
			_classPrivateFieldGet2(_peerProtocol, this).sendCommand({
				c: PeerCommandType.SegmentAbsent,
				i: segmentExternalId,
				r: requestId
			});
		}
	};
	function _checkIsDestroyed() {
		return _classPrivateFieldGet2(_isDestroyed$1, this);
	}
	function _cancelSegmentDownloading(type) {
		if (!_classPrivateFieldGet2(_downloadingContext, this)) return;
		const { request, controls } = _classPrivateFieldGet2(_downloadingContext, this);
		const { segment } = request;
		_classPrivateFieldGet2(_logger$1, this).call(this, `cancel segment request ${segment.externalId} (${type})`);
		const error = new RequestError(type);
		controls.abortOnError(error);
		_classPrivateFieldGet2(_bandwidthCalculator, this).stopLoading();
		_classPrivateFieldGet2(_bandwidthCalculator, this).clear();
		_classPrivateFieldGet2(_cachedDownloadBandwidth, this).timestamp = 0;
		_classPrivateFieldGet2(_logger$1, this).call(this, `cleared bandwidth history due to ${error.type}`);
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
	var EventTarget = class {
		constructor() {
			_defineProperty(this, "events", /* @__PURE__ */ new Map());
		}
		dispatchEvent(eventName, ...args) {
			const listeners = this.events.get(eventName);
			if (!listeners) return;
			for (const listener of listeners) try {
				listener(...args);
			} catch (_unused) {}
		}
		getEventDispatcher(eventName) {
			let listeners = this.events.get(eventName);
			if (!listeners) {
				listeners = [];
				this.events.set(eventName, listeners);
			}
			const definedListeners = listeners;
			return (...args) => {
				for (const listener of definedListeners) try {
					listener(...args);
				} catch (_unused2) {}
			};
		}
		addEventListener(eventName, listener) {
			const listeners = this.events.get(eventName);
			if (!listeners) this.events.set(eventName, [listener]);
			else listeners.push(listener);
		}
		removeEventListener(eventName, listener) {
			const listeners = this.events.get(eventName);
			if (listeners) {
				const index = listeners.indexOf(listener);
				if (index !== -1) listeners.splice(index, 1);
			}
		}
		clear() {
			this.events.clear();
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/webtorrent/webtorrent-client/index.ts
	var _ref, _globalObject$RTCPeer, _ref2, _globalObject$RTCSess;
	var globalObject = typeof window !== "undefined" ? window : void 0;
	var PeerConnection = (_ref = (_globalObject$RTCPeer = globalObject === null || globalObject === void 0 ? void 0 : globalObject.RTCPeerConnection) !== null && _globalObject$RTCPeer !== void 0 ? _globalObject$RTCPeer : globalObject === null || globalObject === void 0 ? void 0 : globalObject.webkitRTCPeerConnection) !== null && _ref !== void 0 ? _ref : globalObject === null || globalObject === void 0 ? void 0 : globalObject.mozRTCPeerConnection;
	var SessionDescription = (_ref2 = (_globalObject$RTCSess = globalObject === null || globalObject === void 0 ? void 0 : globalObject.RTCSessionDescription) !== null && _globalObject$RTCSess !== void 0 ? _globalObject$RTCSess : globalObject === null || globalObject === void 0 ? void 0 : globalObject.webkitRTCSessionDescription) !== null && _ref2 !== void 0 ? _ref2 : globalObject === null || globalObject === void 0 ? void 0 : globalObject.mozRTCSessionDescription;
	/**
	* Detects whether the current browser environment natively supports Promise-based WebRTC APIs
	* (specifically pc.createOffer and pc.createAnswer).
	*
	* For example:
	* - Chrome < 50: Callback-only for all WebRTC APIs.
	* - Chrome 50: Promise support for setLocalDescription/setRemoteDescription, but callback-only for createOffer/createAnswer.
	* - Chrome 51+: Promise support for all WebRTC APIs.
	*
	* Probing this statically once at startup prevents the need to repeatedly execute throw/catch blocks
	* during runtime connection negotiations, avoiding unnecessary exception-handling overhead.
	*/
	var supportsPromiseWebRTC = (() => {
		try {
			const pc = new PeerConnection();
			const p = pc.createOffer();
			if (typeof (p === null || p === void 0 ? void 0 : p.then) === "function") {
				pc.close();
				return true;
			}
			pc.close();
		} catch (_unused) {}
		return false;
	})();
	/**
	* Safe, backward-compatible wrapper for RTCPeerConnection.createOffer.
	*
	* Falls back to legacy callback-based signature on older engines (like Chrome 50 and below)
	* while leveraging native Promises on modern browsers, avoiding runtime throwing or exception latency.
	*/
	function safeCreateOffer(pc, options) {
		if (supportsPromiseWebRTC) return pc.createOffer(options);
		return new Promise((resolve, reject) => {
			try {
				pc.createOffer((offer) => resolve(offer), (err) => reject(err), options);
			} catch (err) {
				reject(err);
			}
		});
	}
	/**
	* Safe, backward-compatible wrapper for RTCPeerConnection.createAnswer.
	*
	* Falls back to legacy callback-based signature on older engines (like Chrome 50 and below)
	* while leveraging native Promises on modern browsers, avoiding runtime throwing or exception latency.
	*/
	function safeCreateAnswer(pc, options) {
		if (supportsPromiseWebRTC) return pc.createAnswer(options);
		return new Promise((resolve, reject) => {
			try {
				pc.createAnswer((answer) => resolve(answer), (err) => reject(err), options);
			} catch (err) {
				reject(err);
			}
		});
	}
	/**
	* Safe, backward-compatible wrapper for RTCPeerConnection.setLocalDescription.
	*
	* Falls back to legacy callback-based signature on older engines (like Chrome < 50)
	* while leveraging native Promises on modern browsers.
	*/
	function safeSetLocalDescription(pc, description) {
		if (supportsPromiseWebRTC) return pc.setLocalDescription(description);
		return new Promise((resolve, reject) => {
			try {
				pc.setLocalDescription(description, () => resolve(), (err) => reject(err));
			} catch (err) {
				reject(err);
			}
		});
	}
	/**
	* Safe, backward-compatible wrapper for RTCPeerConnection.setRemoteDescription.
	*
	* Falls back to legacy callback-based signature on older engines (like Chrome < 50)
	* while leveraging native Promises on modern browsers.
	*/
	function safeSetRemoteDescription(pc, description) {
		if (supportsPromiseWebRTC) return pc.setRemoteDescription(description);
		return new Promise((resolve, reject) => {
			try {
				pc.setRemoteDescription(description, () => resolve(), (err) => reject(err));
			} catch (err) {
				reject(err);
			}
		});
	}
	var WEBTORRENT_DEFAULT_OFFER_TIMEOUT = 5e4;
	var WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT = 15e3;
	var WEBTORRENT_DEFAULT_OFFERS_COUNT = 5;
	function generateOfferId() {
		let id = "";
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 20; i++) id += chars.charAt(Math.floor(Math.random() * 62));
		return id;
	}
	function isSessionDescriptionInit(value) {
		if (typeof value !== "object" || value === null) return false;
		const obj = value;
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
	var WebTorrentClient = class {
		constructor(config) {
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
			_classPrivateFieldInitSpec(this, _onWsConnected, () => {
				_assertClassBrand(_WebTorrentClient_brand, this, _scheduleAnnounce).call(this, _DEFAULT_ANNOUNCE_INTERVAL_SECONDS._);
				_assertClassBrand(_WebTorrentClient_brand, this, _announce).call(this, "started").catch((err) => {
					if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this)) return;
					_classPrivateFieldGet2(_eventTarget$5, this).dispatchEvent("error", `Initial announce failed: ${String(err)}`);
				});
			});
			_classPrivateFieldInitSpec(this, _onWsDisconnected, () => {
				_assertClassBrand(_WebTorrentClient_brand, this, _clearAnnounceTimeout).call(this);
				_classPrivateFieldSet2(_announceIntervalSeconds, this, null);
			});
			_classPrivateFieldInitSpec(this, _onWsMessage, (data) => {
				if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this)) return;
				let msg;
				try {
					const text = typeof data === "string" ? data : new TextDecoder().decode(data);
					msg = JSON.parse(text);
				} catch (err) {
					_classPrivateFieldGet2(_eventTarget$5, this).dispatchEvent("error", `Failed to parse tracker message: ${String(err)}`);
					return;
				}
				if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return;
				const dataObject = msg;
				const warningMessage = dataObject["warning message"];
				if (typeof warningMessage === "string") _classPrivateFieldGet2(_eventTarget$5, this).dispatchEvent("warning", warningMessage);
				const failureReason = dataObject["failure reason"];
				if (typeof failureReason === "string") {
					_classPrivateFieldGet2(_eventTarget$5, this).dispatchEvent("error", failureReason);
					return;
				}
				const { interval } = dataObject;
				if (typeof interval === "number" && interval > 0) {
					if (_classPrivateFieldGet2(_announceIntervalSeconds, this) !== interval) _assertClassBrand(_WebTorrentClient_brand, this, _scheduleAnnounce).call(this, interval);
				}
				const trackerId = dataObject["tracker id"];
				if (typeof trackerId === "string") _classPrivateFieldSet2(_trackerId, this, trackerId);
				const infoHash = dataObject.info_hash;
				if (typeof infoHash === "string" && infoHash !== _classPrivateFieldGet2(_config$4, this).infoHash) return;
				const peerId = dataObject.peer_id;
				if (typeof peerId === "string" && peerId === _classPrivateFieldGet2(_config$4, this).peerId) return;
				const offerId = dataObject.offer_id;
				if (typeof peerId !== "string" || typeof offerId !== "string") return;
				if (isSessionDescriptionInit(dataObject.offer)) _assertClassBrand(_WebTorrentClient_brand, this, _handleIncomingOffer).call(this, {
					sdp: dataObject.offer,
					peerId,
					offerId
				}).catch((err) => {
					if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this)) return;
					_classPrivateFieldGet2(_eventTarget$5, this).dispatchEvent("error", `Failed to handle offer: ${String(err)}`);
				});
				else if (isSessionDescriptionInit(dataObject.answer)) _assertClassBrand(_WebTorrentClient_brand, this, _handleIncomingAnswer).call(this, {
					sdp: dataObject.answer,
					peerId,
					offerId
				}).catch((err) => {
					if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this)) return;
					_classPrivateFieldGet2(_eventTarget$5, this).dispatchEvent("error", `Failed to handle answer: ${String(err)}`);
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
				claimPeer: (_config$claimPeer = config.claimPeer) !== null && _config$claimPeer !== void 0 ? _config$claimPeer : (() => true),
				shouldGenerateOffers: (_config$shouldGenerat = config.shouldGenerateOffers) !== null && _config$shouldGenerat !== void 0 ? _config$shouldGenerat : (() => true)
			});
			_classPrivateFieldSet2(_wsClient, this, config.wsClient);
		}
		addEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget$5, this).addEventListener(eventName, listener);
		}
		removeEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget$5, this).removeEventListener(eventName, listener);
		}
		start() {
			if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this) || _classPrivateFieldGet2(_started$1, this)) return;
			_classPrivateFieldSet2(_started$1, this, true);
			_classPrivateFieldGet2(_wsClient, this).addEventListener("connected", _classPrivateFieldGet2(_onWsConnected, this));
			_classPrivateFieldGet2(_wsClient, this).addEventListener("disconnected", _classPrivateFieldGet2(_onWsDisconnected, this));
			_classPrivateFieldGet2(_wsClient, this).addEventListener("message", _classPrivateFieldGet2(_onWsMessage, this));
			if (_classPrivateFieldGet2(_wsClient, this).state === "connected") _classPrivateFieldGet2(_onWsConnected, this).call(this);
		}
		destroy() {
			if (_assertClassBrand(_WebTorrentClient_brand, this, _isDestroyed).call(this)) return;
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
		}
	};
	function _isDestroyed() {
		return _classPrivateFieldGet2(_destroyAbortController, this).signal.aborted;
	}
	function _throwIfDestroyed() {
		if (_classPrivateFieldGet2(_destroyAbortController, this).signal.aborted) throw new Error("Client destroyed");
	}
	function _scheduleAnnounce(intervalSeconds) {
		var _this = this;
		var _this$announceRunId;
		_assertClassBrand(_WebTorrentClient_brand, this, _clearAnnounceTimeout).call(this);
		_classPrivateFieldSet2(_announceIntervalSeconds, this, intervalSeconds);
		const runId = _classPrivateFieldSet2(_announceRunId, this, (_this$announceRunId = _classPrivateFieldGet2(_announceRunId, this), ++_this$announceRunId));
		const run = function() {
			var _ref3 = _asyncToGenerator(function* () {
				try {
					yield _assertClassBrand(_WebTorrentClient_brand, _this, _announce).call(_this);
				} catch (err) {
					if (_assertClassBrand(_WebTorrentClient_brand, _this, _isDestroyed).call(_this)) return;
					_classPrivateFieldGet2(_eventTarget$5, _this).dispatchEvent("error", `Announce failed: ${String(err)}`);
				}
				if (!_assertClassBrand(_WebTorrentClient_brand, _this, _isDestroyed).call(_this) && _classPrivateFieldGet2(_announceIntervalSeconds, _this) !== null && _classPrivateFieldGet2(_announceRunId, _this) === runId) _classPrivateFieldSet2(_announceTimeoutId, _this, setTimeout(run, _classPrivateFieldGet2(_announceIntervalSeconds, _this) * 1e3));
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
		return _asyncToGenerator(function* () {
			if (_assertClassBrand(_WebTorrentClient_brand, _this2, _isDestroyed).call(_this2) || _classPrivateFieldGet2(_wsClient, _this2).state !== "connected") return;
			const offersCount = _classPrivateFieldGet2(_config$4, _this2).shouldGenerateOffers() ? _classPrivateFieldGet2(_config$4, _this2).offersCount : 0;
			const results = yield Promise.all(Array.from({ length: offersCount }, () => _assertClassBrand(_WebTorrentClient_brand, _this2, _createOffer).call(_this2).then((value) => value, () => void 0)));
			if (_assertClassBrand(_WebTorrentClient_brand, _this2, _isDestroyed).call(_this2)) {
				for (const result of results) if (result) _assertClassBrand(_WebTorrentClient_brand, _this2, _cleanupPendingOffer).call(_this2, result.offer_id);
				return;
			}
			const offers = [];
			for (const result of results) if (result) offers.push(result);
			const payload = _assertClassBrand(_WebTorrentClient_brand, _this2, _buildAnnouncePayload).call(_this2, {
				numwant: offers.length,
				offers,
				event
			});
			try {
				_classPrivateFieldGet2(_wsClient, _this2).send(JSON.stringify(payload));
			} catch (err) {
				for (const offer of offers) _assertClassBrand(_WebTorrentClient_brand, _this2, _cleanupPendingOffer).call(_this2, offer.offer_id);
				throw err;
			}
		})();
	}
	function _createOffer() {
		var _this3 = this;
		return _asyncToGenerator(function* () {
			if (_assertClassBrand(_WebTorrentClient_brand, _this3, _isDestroyed).call(_this3)) return void 0;
			let pc;
			try {
				pc = new PeerConnection(_classPrivateFieldGet2(_config$4, _this3).rtcConfig);
				_classPrivateFieldGet2(_negotiatingConnections, _this3).add(pc);
				const channel = pc.createDataChannel("webtorrent", _classPrivateFieldGet2(_config$4, _this3).channelConfig);
				const offer = yield safeCreateOffer(pc);
				_assertClassBrand(_WebTorrentClient_brand, _this3, _throwIfDestroyed).call(_this3);
				yield safeSetLocalDescription(pc, offer);
				_assertClassBrand(_WebTorrentClient_brand, _this3, _throwIfDestroyed).call(_this3);
				yield _assertClassBrand(_WebTorrentClient_brand, _this3, _waitForIceGathering).call(_this3, pc);
				_assertClassBrand(_WebTorrentClient_brand, _this3, _throwIfDestroyed).call(_this3);
				const sdp = pc.localDescription;
				if (!(sdp === null || sdp === void 0 ? void 0 : sdp.sdp)) {
					pc.close();
					return;
				}
				const offerId = generateOfferId();
				_classPrivateFieldGet2(_pendingOffers, _this3).set(offerId, {
					connection: pc,
					channel,
					timeoutId: setTimeout(() => {
						_assertClassBrand(_WebTorrentClient_brand, _this3, _cleanupPendingOffer).call(_this3, offerId);
					}, _classPrivateFieldGet2(_config$4, _this3).offerTimeout)
				});
				return {
					offer: {
						type: sdp.type,
						sdp: sdp.sdp
					},
					offer_id: offerId
				};
			} catch (err) {
				pc === null || pc === void 0 || pc.close();
				if (!_assertClassBrand(_WebTorrentClient_brand, _this3, _isDestroyed).call(_this3)) _classPrivateFieldGet2(_eventTarget$5, _this3).dispatchEvent("warning", `Failed to create offer: ${err instanceof Error ? err.message : String(err)}`);
				return;
			} finally {
				if (pc) _classPrivateFieldGet2(_negotiatingConnections, _this3).delete(pc);
			}
		})();
	}
	function _sendStopped() {
		if (_classPrivateFieldGet2(_wsClient, this).state !== "connected") return;
		const payload = _assertClassBrand(_WebTorrentClient_brand, this, _buildAnnouncePayload).call(this, {
			numwant: 0,
			offers: [],
			event: "stopped"
		});
		try {
			_classPrivateFieldGet2(_wsClient, this).send(JSON.stringify(payload));
		} catch (_unused2) {}
	}
	function _buildAnnouncePayload({ numwant, offers, event }) {
		const payload = {
			action: "announce",
			info_hash: _classPrivateFieldGet2(_config$4, this).infoHash,
			peer_id: _classPrivateFieldGet2(_config$4, this).peerId,
			numwant,
			uploaded: 0,
			downloaded: 0,
			offers
		};
		if (event) payload.event = event;
		if (_classPrivateFieldGet2(_trackerId, this)) payload.trackerid = _classPrivateFieldGet2(_trackerId, this);
		return payload;
	}
	function _handleIncomingOffer({ sdp: offerSdp, peerId: remotePeerId, offerId: remoteOfferId }) {
		var _this4 = this;
		return _asyncToGenerator(function* () {
			if (_assertClassBrand(_WebTorrentClient_brand, _this4, _isDestroyed).call(_this4)) return;
			if (!_classPrivateFieldGet2(_config$4, _this4).claimPeer(remotePeerId)) return;
			let pc;
			try {
				pc = new PeerConnection(_classPrivateFieldGet2(_config$4, _this4).rtcConfig);
				_classPrivateFieldGet2(_negotiatingConnections, _this4).add(pc);
				yield safeSetRemoteDescription(pc, new SessionDescription(offerSdp));
				_assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
				const answer = yield safeCreateAnswer(pc);
				_assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
				yield safeSetLocalDescription(pc, answer);
				_assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
				yield _assertClassBrand(_WebTorrentClient_brand, _this4, _waitForIceGathering).call(_this4, pc);
				_assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
				const sdp = pc.localDescription;
				if (!sdp) throw new Error("Failed to get local description after ICE gathering");
				const payload = {
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
				const channel = yield _assertClassBrand(_WebTorrentClient_brand, _this4, _waitForConnection).call(_this4, pc);
				_assertClassBrand(_WebTorrentClient_brand, _this4, _throwIfDestroyed).call(_this4);
				_classPrivateFieldGet2(_eventTarget$5, _this4).dispatchEvent("peerConnected", {
					peerId: remotePeerId,
					connection: pc,
					channel
				});
			} catch (err) {
				pc === null || pc === void 0 || pc.close();
				if (!_assertClassBrand(_WebTorrentClient_brand, _this4, _isDestroyed).call(_this4)) _classPrivateFieldGet2(_eventTarget$5, _this4).dispatchEvent("peerConnectFailed", {
					peerId: remotePeerId,
					error: err instanceof Error ? err.message : String(err)
				});
			} finally {
				if (pc) _classPrivateFieldGet2(_negotiatingConnections, _this4).delete(pc);
			}
		})();
	}
	function _handleIncomingAnswer({ sdp: answerSdp, peerId: remotePeerId, offerId: ourOfferId }) {
		var _this5 = this;
		return _asyncToGenerator(function* () {
			if (_assertClassBrand(_WebTorrentClient_brand, _this5, _isDestroyed).call(_this5)) return;
			const pending = _classPrivateFieldGet2(_pendingOffers, _this5).get(ourOfferId);
			if (!pending) return;
			_classPrivateFieldGet2(_pendingOffers, _this5).delete(ourOfferId);
			clearTimeout(pending.timeoutId);
			if (!_classPrivateFieldGet2(_config$4, _this5).claimPeer(remotePeerId)) {
				pending.connection.close();
				return;
			}
			_classPrivateFieldGet2(_negotiatingConnections, _this5).add(pending.connection);
			try {
				yield safeSetRemoteDescription(pending.connection, new SessionDescription(answerSdp));
				_assertClassBrand(_WebTorrentClient_brand, _this5, _throwIfDestroyed).call(_this5);
				const channel = yield _assertClassBrand(_WebTorrentClient_brand, _this5, _waitForConnection).call(_this5, pending.connection, pending.channel);
				_assertClassBrand(_WebTorrentClient_brand, _this5, _throwIfDestroyed).call(_this5);
				_classPrivateFieldGet2(_eventTarget$5, _this5).dispatchEvent("peerConnected", {
					peerId: remotePeerId,
					connection: pending.connection,
					channel
				});
			} catch (err) {
				pending.connection.close();
				if (!_assertClassBrand(_WebTorrentClient_brand, _this5, _isDestroyed).call(_this5)) _classPrivateFieldGet2(_eventTarget$5, _this5).dispatchEvent("peerConnectFailed", {
					peerId: remotePeerId,
					error: err instanceof Error ? err.message : String(err)
				});
			} finally {
				_classPrivateFieldGet2(_negotiatingConnections, _this5).delete(pending.connection);
			}
		})();
	}
	function _waitForIceGathering(pc) {
		return new Promise((resolve, reject) => {
			if (pc.iceGatheringState === "complete") {
				resolve();
				return;
			}
			if (pc.signalingState === "closed") {
				reject(/* @__PURE__ */ new Error("RTCPeerConnection closed"));
				return;
			}
			let timeoutId = void 0;
			const cleanup = () => {
				clearTimeout(timeoutId);
				pc.removeEventListener("icegatheringstatechange", onGatheringChange);
				pc.removeEventListener("icecandidate", onIceCandidate);
				pc.removeEventListener("signalingstatechange", onSignalingChange);
				_classPrivateFieldGet2(_destroyAbortController, this).signal.removeEventListener("abort", onAbort);
			};
			const onGatheringChange = () => {
				if (pc.iceGatheringState === "complete") {
					cleanup();
					resolve();
				}
			};
			const onIceCandidate = (event) => {
				if (event.candidate === null) {
					cleanup();
					resolve();
				}
			};
			const onSignalingChange = () => {
				if (pc.signalingState === "closed") {
					cleanup();
					reject(/* @__PURE__ */ new Error("RTCPeerConnection closed"));
				}
			};
			const onAbort = () => {
				cleanup();
				reject(/* @__PURE__ */ new Error("ICE gathering aborted due to teardown"));
			};
			if (_classPrivateFieldGet2(_destroyAbortController, this).signal.aborted) {
				onAbort();
				return;
			}
			timeoutId = setTimeout(() => {
				cleanup();
				resolve();
			}, _ICE_GATHERING_TIMEOUT._);
			pc.addEventListener("icegatheringstatechange", onGatheringChange);
			pc.addEventListener("icecandidate", onIceCandidate);
			pc.addEventListener("signalingstatechange", onSignalingChange);
			_classPrivateFieldGet2(_destroyAbortController, this).signal.addEventListener("abort", onAbort);
		});
	}
	function _waitForConnection(pc, channel) {
		const { promise, resolve, reject } = getPromiseWithResolvers();
		let timeoutId = void 0;
		let boundChannel = channel;
		const rejectIfTerminalState = () => {
			if (isTerminalConnectionState(pc.iceConnectionState)) {
				cleanup();
				reject(/* @__PURE__ */ new Error(`ICE connection ${pc.iceConnectionState}`));
				return true;
			}
			return false;
		};
		const onChannelOpen = () => {
			cleanup();
			if (boundChannel) resolve(boundChannel);
			else reject(/* @__PURE__ */ new Error("Data channel missing on open"));
		};
		const onChannelError = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("Data channel error"));
		};
		const onChannelClose = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("Data channel closed prematurely"));
		};
		const bindDataChannel = (dc) => {
			boundChannel = dc;
			if (dc.readyState === "open") onChannelOpen();
			else if (dc.readyState === "closed" || dc.readyState === "closing") onChannelClose();
			else {
				dc.addEventListener("open", onChannelOpen);
				dc.addEventListener("error", onChannelError);
				dc.addEventListener("close", onChannelClose);
				dc.addEventListener("closing", onChannelClose);
			}
		};
		const onDataChannel = (event) => {
			if (!boundChannel) bindDataChannel(event.channel);
		};
		const onAbort = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("Connection aborted due to teardown"));
		};
		const cleanup = () => {
			clearTimeout(timeoutId);
			pc.removeEventListener("iceconnectionstatechange", rejectIfTerminalState);
			pc.removeEventListener("datachannel", onDataChannel);
			if (boundChannel) {
				boundChannel.removeEventListener("open", onChannelOpen);
				boundChannel.removeEventListener("error", onChannelError);
				boundChannel.removeEventListener("close", onChannelClose);
				boundChannel.removeEventListener("closing", onChannelClose);
			}
			_classPrivateFieldGet2(_destroyAbortController, this).signal.removeEventListener("abort", onAbort);
		};
		if (_classPrivateFieldGet2(_destroyAbortController, this).signal.aborted) {
			onAbort();
			return promise;
		}
		if (rejectIfTerminalState()) return promise;
		timeoutId = setTimeout(() => {
			cleanup();
			reject(/* @__PURE__ */ new Error("Data channel open timeout"));
		}, _classPrivateFieldGet2(_config$4, this).connectionTimeout);
		pc.addEventListener("iceconnectionstatechange", rejectIfTerminalState);
		_classPrivateFieldGet2(_destroyAbortController, this).signal.addEventListener("abort", onAbort);
		if (boundChannel) bindDataChannel(boundChannel);
		else pc.addEventListener("datachannel", onDataChannel);
		return promise;
	}
	function _cleanupPendingOffer(offerId, pending) {
		const entry = pending !== null && pending !== void 0 ? pending : _classPrivateFieldGet2(_pendingOffers, this).get(offerId);
		if (entry) {
			clearTimeout(entry.timeoutId);
			entry.connection.close();
			_classPrivateFieldGet2(_pendingOffers, this).delete(offerId);
		}
	}
	function _cleanupPendingOffers() {
		for (const [offerId, pending] of _classPrivateFieldGet2(_pendingOffers, this)) _assertClassBrand(_WebTorrentClient_brand, this, _cleanupPendingOffer).call(this, offerId, pending);
	}
	function _cleanupNegotiatingConnections() {
		for (const pc of _classPrivateFieldGet2(_negotiatingConnections, this)) pc.close();
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
	var WebTorrentManager = class {
		constructor(config) {
			_classPrivateMethodInitSpec(this, _WebTorrentManager_brand);
			_classPrivateFieldInitSpec(this, _config$3, void 0);
			_classPrivateFieldInitSpec(this, _eventTarget$4, new EventTarget());
			_classPrivateFieldInitSpec(this, _connectingPeers, /* @__PURE__ */ new Set());
			_classPrivateFieldInitSpec(this, _connectedPeers, /* @__PURE__ */ new Map());
			_classPrivateFieldInitSpec(this, _clients, /* @__PURE__ */ new Set());
			_classPrivateFieldInitSpec(this, _destroyed, false);
			_classPrivateFieldInitSpec(this, _started, false);
			_classPrivateFieldInitSpec(this, _claimPeer, (remotePeerId) => {
				if (_classPrivateFieldGet2(_destroyed, this)) return false;
				if (_classPrivateFieldGet2(_connectingPeers, this).has(remotePeerId) || _classPrivateFieldGet2(_connectedPeers, this).has(remotePeerId)) return false;
				_classPrivateFieldGet2(_connectingPeers, this).add(remotePeerId);
				return true;
			});
			_classPrivateFieldSet2(_config$3, this, config);
		}
		addEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget$4, this).addEventListener(eventName, listener);
		}
		removeEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget$4, this).removeEventListener(eventName, listener);
		}
		start() {
			if (_classPrivateFieldGet2(_destroyed, this) || _classPrivateFieldGet2(_started, this)) return;
			_classPrivateFieldSet2(_started, this, true);
			try {
				for (const url of _classPrivateFieldGet2(_config$3, this).trackerUrls) {
					const { client: wsClient, release } = _classPrivateFieldGet2(_config$3, this).socketPool.acquire(url);
					let client;
					try {
						client = new WebTorrentClient({
							infoHash: _classPrivateFieldGet2(_config$3, this).infoHash,
							peerId: _classPrivateFieldGet2(_config$3, this).peerId,
							wsClient,
							rtcConfig: _classPrivateFieldGet2(_config$3, this).rtcConfig,
							channelConfig: _classPrivateFieldGet2(_config$3, this).channelConfig,
							claimPeer: _classPrivateFieldGet2(_claimPeer, this)
						});
					} catch (error) {
						release();
						throw error;
					}
					const onPeerConnected = (event) => {
						_classPrivateFieldGet2(_connectingPeers, this).delete(event.peerId);
						_assertClassBrand(_WebTorrentManager_brand, this, _addConnectedPeer).call(this, event.peerId, event.connection, event.channel, url);
					};
					const onPeerConnectFailed = (event) => {
						if (_classPrivateFieldGet2(_connectingPeers, this).has(event.peerId)) {
							_classPrivateFieldGet2(_connectingPeers, this).delete(event.peerId);
							_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerConnectFailed", {
								peerId: event.peerId,
								trackerUrl: url,
								error: `Connection failed: ${event.error}`
							});
						}
					};
					const onWarning = (warning) => {
						_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("warning", {
							trackerUrl: url,
							warning
						});
					};
					const onError = (error) => {
						_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("error", {
							trackerUrl: url,
							error
						});
					};
					client.addEventListener("peerConnected", onPeerConnected);
					client.addEventListener("peerConnectFailed", onPeerConnectFailed);
					client.addEventListener("warning", onWarning);
					client.addEventListener("error", onError);
					const cleanupListeners = () => {
						client.removeEventListener("peerConnected", onPeerConnected);
						client.removeEventListener("peerConnectFailed", onPeerConnectFailed);
						client.removeEventListener("warning", onWarning);
						client.removeEventListener("error", onError);
					};
					_classPrivateFieldGet2(_clients, this).add({
						client,
						releaseSocket: release,
						cleanupListeners
					});
					client.start();
				}
			} catch (error) {
				this.destroy();
				throw error;
			}
		}
		destroy() {
			if (_classPrivateFieldGet2(_destroyed, this)) return;
			_classPrivateFieldSet2(_destroyed, this, true);
			for (const { client, releaseSocket, cleanupListeners } of _classPrivateFieldGet2(_clients, this)) {
				cleanupListeners();
				client.destroy();
				releaseSocket();
			}
			_classPrivateFieldGet2(_clients, this).clear();
			_classPrivateFieldGet2(_connectingPeers, this).clear();
			const connectedSnapshot = [..._classPrivateFieldGet2(_connectedPeers, this).entries()];
			_classPrivateFieldGet2(_connectedPeers, this).clear();
			for (const [peerId, peer] of connectedSnapshot) {
				peer.cleanup();
				peer.connection.close();
				_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerDisconnected", {
					peerId,
					trackerUrl: peer.trackerUrl,
					reason: "Manager destroyed",
					isError: false
				});
			}
			_classPrivateFieldGet2(_eventTarget$4, this).clear();
		}
	};
	function _closePeer(peerId, reason, isError) {
		if (_classPrivateFieldGet2(_destroyed, this)) return;
		const connected = _classPrivateFieldGet2(_connectedPeers, this).get(peerId);
		if (connected) {
			connected.cleanup();
			connected.connection.close();
			_classPrivateFieldGet2(_connectedPeers, this).delete(peerId);
			_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerDisconnected", {
				peerId,
				trackerUrl: connected.trackerUrl,
				reason,
				isError
			});
		}
	}
	function _addConnectedPeer(peerId, connection, channel, trackerUrl) {
		if (isTerminalConnectionState(connection.iceConnectionState)) {
			connection.close();
			_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerConnectFailed", {
				peerId,
				trackerUrl,
				error: "Connection failed during promotion"
			});
			return;
		}
		const onDisconnect = (reason, isError) => _assertClassBrand(_WebTorrentManager_brand, this, _closePeer).call(this, peerId, reason, isError);
		const onIceConnectionStateChange = () => {
			if (isTerminalConnectionState(connection.iceConnectionState)) onDisconnect(`ICE connection state became ${connection.iceConnectionState}`, true);
		};
		const onChannelClose = () => onDisconnect("Data channel closed", false);
		const onChannelClosing = () => onDisconnect("Data channel closing", false);
		const onChannelError = (event) => {
			onDisconnect(`Data channel error: ${getRTCErrorMessage(event, "Data channel error")}`, true);
		};
		let closeRef = (error) => _assertClassBrand(_WebTorrentManager_brand, this, _closePeer).call(this, peerId, error !== null && error !== void 0 ? error : "Closed by consumer", !!error);
		const cleanup = () => {
			closeRef = null;
			connection.removeEventListener("iceconnectionstatechange", onIceConnectionStateChange);
			channel.removeEventListener("close", onChannelClose);
			channel.removeEventListener("closing", onChannelClosing);
			channel.removeEventListener("error", onChannelError);
		};
		_classPrivateFieldGet2(_connectedPeers, this).set(peerId, {
			connection,
			channel,
			trackerUrl,
			cleanup
		});
		connection.addEventListener("iceconnectionstatechange", onIceConnectionStateChange);
		channel.addEventListener("close", onChannelClose);
		channel.addEventListener("closing", onChannelClosing);
		channel.addEventListener("error", onChannelError);
		_classPrivateFieldGet2(_eventTarget$4, this).dispatchEvent("peerConnected", {
			peerId,
			connection,
			channel,
			trackerUrl,
			close: (error) => closeRef === null || closeRef === void 0 ? void 0 : closeRef(error)
		});
	}
	//#endregion
	//#region ../p2p-media-loader-core/src/utils/hash.ts
	function sha1(str) {
		const bytes = utf8ToUintArray(str);
		const words = [];
		const msgLen = bytes.length * 8;
		for (let i = 0; i < bytes.length; i++) words[i >> 2] |= (bytes[i] & 255) << 24 - i % 4 * 8;
		words[msgLen >> 5] |= 128 << 24 - msgLen % 32;
		words[(msgLen + 64 >> 9 << 4) + 15] = msgLen;
		let h0 = 1732584193;
		let h1 = 4023233417;
		let h2 = 2562383102;
		let h3 = 271733878;
		let h4 = 3285377520;
		const w = [];
		for (let i = 0; i < words.length; i += 16) {
			const a = h0, b = h1, c = h2, d = h3, e = h4;
			for (let j = 0; j < 80; j++) {
				if (j < 16) w[j] = words[i + j] | 0;
				else {
					const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
					w[j] = n << 1 | n >>> 31;
				}
				let f;
				if (j < 20) f = (h1 & h2 | ~h1 & h3) + 1518500249;
				else if (j < 40) f = (h1 ^ h2 ^ h3) + 1859775393;
				else if (j < 60) f = (h1 & h2 | h1 & h3 | h2 & h3) - 1894007588;
				else f = (h1 ^ h2 ^ h3) - 899497514;
				const t = (h0 << 5 | h0 >>> 27) + h4 + (w[j] >>> 0) + f | 0;
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
		let bin = "";
		const wordsOut = [
			h0,
			h1,
			h2,
			h3,
			h4
		];
		for (let i = 0; i < 20; i++) {
			const shift = 24 - i % 4 * 8;
			const word = wordsOut[i >> 2];
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
	function generateStreamShortId({ bitrate, codecs, width, height, language, channels, name, frameRate, videoRange }) {
		const normalizedCodecs = codecs ? codecs.split(",").map((c) => {
			c = c.trim().toLowerCase();
			const parts = c.split(".");
			if (parts.length === 3 && (parts[0] === "avc1" || parts[0] === "avc")) {
				const profile = parseInt(parts[1], 10);
				const level = parseInt(parts[2], 10);
				if (!isNaN(profile) && !isNaN(level) && parts[1] === profile.toString() && parts[2] === level.toString()) {
					const profileHex = `00${profile.toString(16)}`.slice(-2);
					const levelHex = `00${level.toString(16)}`.slice(-2);
					c = `${parts[0]}.${profileHex}00${levelHex}`;
				}
			}
			return c;
		}).sort().join(",") : "";
		const normalizedLanguage = language && language !== "und" ? language.slice(0, 2).toLowerCase() : "";
		const normalizedChannels = channels ? channels.toString().split("/")[0] : "";
		const normalizedName = name ? name.toLowerCase().trim() : "";
		const normalizedFrameRate = frameRate && !isNaN(Number(frameRate)) ? Number(frameRate).toString() : "";
		const normalizedVideoRange = videoRange ? videoRange.toUpperCase().trim() : "";
		const str = `${bitrate !== null && bitrate !== void 0 ? bitrate : 0}-${normalizedCodecs}-${width !== null && width !== void 0 ? width : ""}-${height !== null && height !== void 0 ? height : ""}-${normalizedLanguage}-${normalizedChannels}-${normalizedName}-${normalizedFrameRate}-${normalizedVideoRange}`;
		return btoa(sha1(str));
	}
	function getStreamSwarmId(swarmId, stream) {
		return `${PEER_PROTOCOL_VERSION}-${swarmId}-${getStreamId(stream)}`;
	}
	function getSegmentFromStreamsMap(streams, segmentRuntimeId) {
		for (const stream of streams.values()) {
			const segment = stream.segments.get(segmentRuntimeId);
			if (segment) return segment;
		}
	}
	function getSegmentFromStreamByExternalId(stream, segmentExternalId) {
		for (const segment of stream.segments.values()) if (segment.externalId === segmentExternalId) return segment;
	}
	function getStreamId(stream) {
		return `${stream.type}-${stream.index}`;
	}
	function getSegmentAvgDuration(stream) {
		const { segments } = stream;
		let sumDuration = 0;
		const { size } = segments;
		for (const segment of segments.values()) {
			const duration = segment.endTime - segment.startTime;
			sumDuration += duration;
		}
		return sumDuration / size;
	}
	function calculateTimeWindows(timeWindowsConfig, availableMemoryInPercent) {
		const { highDemandTimeWindow, httpDownloadTimeWindow, p2pDownloadTimeWindow } = timeWindowsConfig;
		const result = {
			highDemandTimeWindow,
			httpDownloadTimeWindow,
			p2pDownloadTimeWindow
		};
		if (availableMemoryInPercent <= 5) {
			result.httpDownloadTimeWindow = 0;
			result.p2pDownloadTimeWindow = 0;
		} else if (availableMemoryInPercent <= 10) result.p2pDownloadTimeWindow = result.httpDownloadTimeWindow;
		return result;
	}
	function getSegmentPlaybackStatuses(segment, playback, timeWindowsConfig, currentP2PLoader, availableMemoryPercent) {
		const { highDemandTimeWindow, httpDownloadTimeWindow, p2pDownloadTimeWindow } = calculateTimeWindows(timeWindowsConfig, availableMemoryPercent);
		return {
			isHighDemand: isSegmentInTimeWindow(segment, playback, highDemandTimeWindow),
			isHttpDownloadable: isSegmentInTimeWindow(segment, playback, httpDownloadTimeWindow),
			isP2PDownloadable: isSegmentInTimeWindow(segment, playback, p2pDownloadTimeWindow) && currentP2PLoader.isSegmentLoadingOrLoadedBySomeone(segment)
		};
	}
	function isSegmentInTimeWindow(segment, playback, timeWindowLength) {
		const { startTime, endTime } = segment;
		const { position, rate } = playback;
		return !(position + timeWindowLength * rate < startTime || position > endTime);
	}
	//#endregion
	//#region ../p2p-media-loader-core/src/utils/peer.ts
	var TRACKER_CLIENT_VERSION_PREFIX = `-PM${formatVersion("2.3.0")}-`;
	var HASH_SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	var PEER_ID_LENGTH = 20;
	function getStreamHash(streamId) {
		return btoa(sha1(streamId).slice(0, 15));
	}
	function generatePeerId(trackerClientVersionPrefix) {
		const trackerClientId = [trackerClientVersionPrefix];
		const randomCharsCount = PEER_ID_LENGTH - trackerClientVersionPrefix.length;
		for (let i = 0; i < randomCharsCount; i++) trackerClientId.push(HASH_SYMBOLS[Math.floor(Math.random() * 62)]);
		return trackerClientId.join("");
	}
	function formatVersion(versionString) {
		const splittedVersion = versionString.split(".");
		return `${`00${splittedVersion[0]}`.slice(-2)}${`00${splittedVersion[1]}`.slice(-2)}`;
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
	var P2PLoader = class {
		constructor(streamManifestUrl, stream, requests, segmentStorage, config, webTorrentSocketPool, eventTarget, onSegmentAnnouncement) {
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
			_classPrivateFieldInitSpec(this, _onPeerConnectedWebTorrent, (event) => {
				_classPrivateFieldGet2(_webtorrentManagerLogger, this).call(this, `peerConnected: peerId=${event.peerId}`);
				if (_classPrivateFieldGet2(_peersMap, this).has(event.peerId)) {
					event.close();
					return;
				}
				const peer = new Peer(event.peerId, event.channel, event.close, {
					onSegmentRequested: (peer, segmentExternalId, requestId, byteFrom) => {
						_classPrivateFieldGet2(_onSegmentRequested, this).call(this, peer, segmentExternalId, requestId, byteFrom).catch((error) => {
							_classPrivateFieldGet2(_webtorrentManagerLogger, this).call(this, `Error in onSegmentRequested ${segmentExternalId} for peer ${peer.id}:`, error);
						});
					},
					onSegmentsAnnouncement: _classPrivateFieldGet2(_onSegmentAnnouncement$1, this)
				}, _classPrivateFieldGet2(_config$2, this), _classPrivateFieldGet2(_eventTarget$3, this));
				_classPrivateFieldGet2(_peersMap, this).set(event.peerId, peer);
				_classPrivateFieldGet2(_eventTarget$3, this).getEventDispatcher("onPeerConnect")({
					peerId: event.peerId,
					streamType: _classPrivateFieldGet2(_stream, this).type
				});
				if (_classPrivateFieldGet2(_config$2, this).isP2PUploadDisabled) return;
				const { httpLoading, loaded } = _assertClassBrand(_P2PLoader_brand, this, _getSegmentsAnnouncement).call(this);
				peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
			});
			_classPrivateFieldInitSpec(this, _onPeerDisconnectedWebTorrent, (event) => {
				_classPrivateFieldGet2(_webtorrentManagerLogger, this).call(this, `peerDisconnected: peerId=${event.peerId} reason=${event.reason} isError=${event.isError}`);
				const peer = _classPrivateFieldGet2(_peersMap, this).get(event.peerId);
				if (!peer) return;
				_classPrivateFieldGet2(_peersMap, this).delete(event.peerId);
				peer.destroy(true);
				if (event.isError) _classPrivateFieldGet2(_eventTarget$3, this).getEventDispatcher("onPeerError")({
					peerId: event.peerId,
					streamType: _classPrivateFieldGet2(_stream, this).type,
					error: new Error(event.reason)
				});
				_classPrivateFieldGet2(_eventTarget$3, this).getEventDispatcher("onPeerClose")({
					peerId: peer.id,
					streamType: _classPrivateFieldGet2(_stream, this).type
				});
			});
			_defineProperty(this, "broadcastAnnouncement", (sendEmptyAnnouncement = false) => {
				if (sendEmptyAnnouncement) {
					_classPrivateFieldGet2(_sendSegmentsAnnouncement, this).call(this, sendEmptyAnnouncement);
					return;
				}
				if (_classPrivateFieldGet2(_isAnnounceMicrotaskCreated, this) || _classPrivateFieldGet2(_config$2, this).isP2PUploadDisabled) return;
				_classPrivateFieldGet2(_sendSegmentsAnnouncement, this).call(this);
			});
			_classPrivateFieldInitSpec(this, _sendSegmentsAnnouncement, (sendEmptyAnnouncement = false) => {
				_classPrivateFieldSet2(_isAnnounceMicrotaskCreated, this, true);
				queueMicrotask(() => {
					const { loaded = [], httpLoading = [] } = sendEmptyAnnouncement ? {} : _assertClassBrand(_P2PLoader_brand, this, _getSegmentsAnnouncement).call(this);
					for (const peer of _classPrivateFieldGet2(_peersMap, this).values()) peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
					_classPrivateFieldSet2(_isAnnounceMicrotaskCreated, this, false);
				});
			});
			_classPrivateFieldInitSpec(this, _onSegmentRequested, function() {
				var _ref = _asyncToGenerator(function* (peer, segmentExternalId, requestId, byteFrom) {
					const segment = getSegmentFromStreamByExternalId(_classPrivateFieldGet2(_stream, _this), segmentExternalId);
					if (!segment) return;
					if (_classPrivateFieldGet2(_config$2, _this).isP2PUploadDisabled) {
						peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
						return;
					}
					let segmentData;
					try {
						segmentData = yield _classPrivateFieldGet2(_segmentStorage$1, _this).getSegmentData(_classPrivateFieldGet2(_swarmId, _this), _classPrivateFieldGet2(_streamSwarmId, _this), segment.externalId);
					} catch (error) {
						_classPrivateFieldGet2(_webtorrentManagerLogger, _this).call(_this, `Storage error for segment ${segmentExternalId} requested by peer ${peer.id}:`, error);
					}
					if (!_classPrivateFieldGet2(_peersMap, _this).has(peer.id)) return;
					if (!segmentData) {
						peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
						return;
					}
					yield peer.uploadSegmentData(segment, requestId, byteFrom !== void 0 ? new Uint8Array(segmentData).subarray(byteFrom) : segmentData);
				});
				return function(_x, _x2, _x3, _x4) {
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
			const streamHash = getStreamHash(_classPrivateFieldGet2(_streamSwarmId, this));
			let peerId = _PEER_ID_BY_INFO_HASH._.get(streamHash);
			if (!peerId) {
				peerId = generatePeerId(_classPrivateFieldGet2(_config$2, this).trackerClientVersionPrefix);
				_PEER_ID_BY_INFO_HASH._.set(streamHash, peerId);
			}
			_classPrivateFieldSet2(_webtorrentManager, this, new WebTorrentManager({
				infoHash: streamHash,
				peerId,
				trackerUrls: _classPrivateFieldGet2(_config$2, this).announceTrackers,
				rtcConfig: _classPrivateFieldGet2(_config$2, this).rtcConfig,
				socketPool: _classPrivateFieldGet2(_webTorrentSocketPool$1, this)
			}));
			_classPrivateFieldGet2(_webtorrentManager, this).addEventListener("peerConnected", _classPrivateFieldGet2(_onPeerConnectedWebTorrent, this));
			_classPrivateFieldGet2(_webtorrentManager, this).addEventListener("peerDisconnected", _classPrivateFieldGet2(_onPeerDisconnectedWebTorrent, this));
			_classPrivateFieldGet2(_webtorrentManager, this).addEventListener("peerConnectFailed", (event) => {
				_classPrivateFieldGet2(_webtorrentManagerLogger, this).call(this, `Peer connection failed (${event.peerId}) from tracker ${event.trackerUrl}:`, event.error);
				_classPrivateFieldGet2(_eventTarget$3, this).getEventDispatcher("onPeerError")({
					peerId: event.peerId,
					streamType: _classPrivateFieldGet2(_stream, this).type,
					error: new Error(event.error)
				});
			});
			_classPrivateFieldGet2(_webtorrentManager, this).addEventListener("warning", (event) => {
				_classPrivateFieldGet2(_webtorrentManagerLogger, this).call(this, `Tracker warning (${event.trackerUrl}):`, event.warning);
				_classPrivateFieldGet2(_eventTarget$3, this).getEventDispatcher("onTrackerWarning")({
					streamType: _classPrivateFieldGet2(_stream, this).type,
					warning: new Error(event.warning)
				});
			});
			_classPrivateFieldGet2(_webtorrentManager, this).addEventListener("error", (event) => {
				_classPrivateFieldGet2(_webtorrentManagerLogger, this).call(this, `Tracker error (${event.trackerUrl}):`, event.error);
				_classPrivateFieldGet2(_eventTarget$3, this).getEventDispatcher("onTrackerError")({
					streamType: _classPrivateFieldGet2(_stream, this).type,
					error: new Error(event.error)
				});
			});
			_classPrivateFieldGet2(_eventTarget$3, this).addEventListener(`onStorageUpdated-${_classPrivateFieldGet2(_streamSwarmId, this)}`, this.broadcastAnnouncement);
			_classPrivateFieldGet2(_webtorrentManager, this).start();
		}
		downloadSegment(segment) {
			const peersWithSegment = [];
			for (const peer of _classPrivateFieldGet2(_peersMap, this).values()) if (!peer.downloadingSegment && peer.getSegmentStatus(segment) === "loaded") peersWithSegment.push(peer);
			if (peersWithSegment.length === 0) return;
			let selectedPeer;
			if (peersWithSegment.length === 1) selectedPeer = peersWithSegment[0];
			else {
				let maxSpeed = 0;
				for (const peer of peersWithSegment) {
					const speed = peer.downloadBandwidth;
					if (speed > maxSpeed) maxSpeed = speed;
				}
				if (maxSpeed > 0) {
					const baseSpeed = Math.max(1, maxSpeed * .1);
					let unprovenPeersCount = 0;
					let provenPeersWeight = 0;
					for (const peer of peersWithSegment) if (peer.downloadBandwidth <= baseSpeed) unprovenPeersCount++;
					else provenPeersWeight += peer.downloadBandwidth;
					let adjustedBaseSpeed = baseSpeed;
					if (unprovenPeersCount > 0 && provenPeersWeight > 0 && unprovenPeersCount * baseSpeed > provenPeersWeight) adjustedBaseSpeed = provenPeersWeight / unprovenPeersCount;
					selectedPeer = getWeightedRandomItem(peersWithSegment, (peer) => Math.max(peer.downloadBandwidth, adjustedBaseSpeed));
				} else selectedPeer = getRandomItem(peersWithSegment);
			}
			const request = _classPrivateFieldGet2(_requests$1, this).getOrCreateRequest(segment);
			selectedPeer.downloadSegment(request);
		}
		isSegmentLoadingOrLoadedBySomeone(segment) {
			for (const peer of _classPrivateFieldGet2(_peersMap, this).values()) if (peer.getSegmentStatus(segment)) return true;
			return false;
		}
		isSegmentLoadedBySomeone(segment) {
			for (const peer of _classPrivateFieldGet2(_peersMap, this).values()) if (peer.getSegmentStatus(segment) === "loaded") return true;
			return false;
		}
		get connectedPeerCount() {
			return _classPrivateFieldGet2(_peersMap, this).size;
		}
		*peers() {
			for (const peer of _classPrivateFieldGet2(_peersMap, this).values()) yield peer;
		}
		destroy() {
			_classPrivateFieldGet2(_eventTarget$3, this).removeEventListener(`onStorageUpdated-${_classPrivateFieldGet2(_streamSwarmId, this)}`, this.broadcastAnnouncement);
			for (const peer of _classPrivateFieldGet2(_peersMap, this).values()) peer.destroy();
			_classPrivateFieldGet2(_peersMap, this).clear();
			_classPrivateFieldGet2(_webtorrentManager, this).destroy();
		}
	};
	function _getSegmentsAnnouncement() {
		const loaded = _classPrivateFieldGet2(_segmentStorage$1, this).getStoredSegmentIds(_classPrivateFieldGet2(_swarmId, this), _classPrivateFieldGet2(_streamSwarmId, this));
		const httpLoading = [];
		for (const request of _classPrivateFieldGet2(_requests$1, this).httpRequests()) {
			const segment = _classPrivateFieldGet2(_stream, this).segments.get(request.segment.runtimeId);
			if (!segment) continue;
			httpLoading.push(segment.externalId);
		}
		return {
			loaded,
			httpLoading
		};
	}
	var _PEER_ID_BY_INFO_HASH = { _: /* @__PURE__ */ new Map() };
	//#endregion
	//#region ../p2p-media-loader-core/src/utils/logger.ts
	function getStreamString(stream) {
		return `${stream.type}-${stream.index}`;
	}
	function getSegmentString(segment) {
		const { externalId } = segment;
		return `(${getStreamString(segment.stream)} | ${externalId})`;
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
	var P2PLoadersContainer = class {
		constructor(streamManifestUrl, stream, requests, segmentStorage, config, webTorrentSocketPool, eventTarget, onSegmentAnnouncement) {
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
			_classPrivateFieldGet2(_logger, this).call(this, `set current p2p loader: ${getStreamString(stream)}`);
		}
		changeCurrentLoader(stream) {
			var _this$config$swarmId;
			const swarmId = (_this$config$swarmId = _classPrivateFieldGet2(_config$1, this).swarmId) !== null && _this$config$swarmId !== void 0 ? _this$config$swarmId : _classPrivateFieldGet2(_streamManifestUrl, this);
			const streamSwarmId = getStreamSwarmId(swarmId, _classPrivateFieldGet2(_currentLoaderItem, this).stream);
			if (!_classPrivateFieldGet2(_segmentStorage, this).getStoredSegmentIds(swarmId, streamSwarmId).length) _assertClassBrand(_P2PLoadersContainer_brand, this, _destroyAndRemoveLoader).call(this, _classPrivateFieldGet2(_currentLoaderItem, this));
			else _assertClassBrand(_P2PLoadersContainer_brand, this, _setLoaderDestroyTimeout).call(this, _classPrivateFieldGet2(_currentLoaderItem, this));
			_classPrivateFieldSet2(_currentLoaderItem, this, _assertClassBrand(_P2PLoadersContainer_brand, this, _findOrCreateLoaderForStream).call(this, stream));
			_classPrivateFieldGet2(_logger, this).call(this, `change current p2p loader: ${getStreamString(stream)}`);
		}
		get currentLoader() {
			return _classPrivateFieldGet2(_currentLoaderItem, this).loader;
		}
		destroy() {
			for (const { loader, destroyTimeoutId } of _classPrivateFieldGet2(_loaders, this).values()) {
				loader.destroy();
				clearTimeout(destroyTimeoutId);
			}
			_classPrivateFieldGet2(_loaders, this).clear();
		}
	};
	function _createLoader(stream) {
		if (_classPrivateFieldGet2(_loaders, this).has(stream.runtimeId)) throw new Error("Loader for this stream already exists");
		const loader = new P2PLoader(_classPrivateFieldGet2(_streamManifestUrl, this), stream, _classPrivateFieldGet2(_requests, this), _classPrivateFieldGet2(_segmentStorage, this), _classPrivateFieldGet2(_config$1, this), _classPrivateFieldGet2(_webTorrentSocketPool, this), _classPrivateFieldGet2(_eventTarget$2, this), () => {
			if (_classPrivateFieldGet2(_currentLoaderItem, this).loader === loader) _classPrivateFieldGet2(_onSegmentAnnouncement, this).call(this);
		});
		const loggerInfo = getStreamString(stream);
		_classPrivateFieldGet2(_logger, this).call(this, `created new loader: ${loggerInfo}`);
		return {
			loader,
			stream,
			loggerInfo: getStreamString(stream)
		};
	}
	function _findOrCreateLoaderForStream(stream) {
		const loaderItem = _classPrivateFieldGet2(_loaders, this).get(stream.runtimeId);
		if (loaderItem) {
			clearTimeout(loaderItem.destroyTimeoutId);
			loaderItem.destroyTimeoutId = void 0;
			return loaderItem;
		} else {
			const loader = _assertClassBrand(_P2PLoadersContainer_brand, this, _createLoader).call(this, stream);
			_classPrivateFieldGet2(_loaders, this).set(stream.runtimeId, loader);
			return loader;
		}
	}
	function _setLoaderDestroyTimeout(item) {
		item.destroyTimeoutId = window.setTimeout(() => _assertClassBrand(_P2PLoadersContainer_brand, this, _destroyAndRemoveLoader).call(this, item), _classPrivateFieldGet2(_config$1, this).p2pInactiveLoaderDestroyTimeoutMs);
	}
	function _destroyAndRemoveLoader(item) {
		item.loader.destroy();
		_classPrivateFieldGet2(_loaders, this).delete(item.stream.runtimeId);
		_classPrivateFieldGet2(_logger, this).call(this, `destroy p2p loader: `, item.loggerInfo);
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
	var Request$1 = class {
		constructor(segment, requestProcessQueueCallback, bandwidthCalculators, playback, playbackConfig, eventTarget) {
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
			_defineProperty(this, "abortOnTimeout", () => {
				var _this$_abortRequestCa;
				this.throwErrorIfNotLoadingStatus();
				if (!this.currentAttempt) return;
				const error = new RequestError("bytes-receiving-timeout");
				(_this$_abortRequestCa = this._abortRequestCallback) === null || _this$_abortRequestCa === void 0 || _this$_abortRequestCa.call(this, error);
				this.handleFailure(error);
			});
			_defineProperty(this, "abortOnError", (error) => {
				this.throwErrorIfNotLoadingStatus();
				if (!this.currentAttempt) return;
				this.handleFailure(error);
			});
			_defineProperty(this, "handleFailure", (error) => {
				if (!this.currentAttempt) return;
				this.setStatus("failed");
				this.logger(`${this.downloadSource} ${this.segment.externalId} failed ${error.type}`);
				this._failedAttempts.add(_objectSpread2(_objectSpread2({}, this.currentAttempt), {}, { error }));
				this.onSegmentError({
					segment: mapSegmentWithStreamToSegment(this.segment),
					error,
					downloadSource: this.currentAttempt.downloadSource,
					peerId: this.currentAttempt.downloadSource === "p2p" ? this.currentAttempt.peerId : void 0,
					streamType: this.segment.stream.type
				});
				this.notReceivingBytesTimeout.clear();
				this.manageBandwidthCalculatorsState("stop");
				this.requestProcessQueueCallback();
			});
			_defineProperty(this, "completeOnSuccess", () => {
				this.throwErrorIfNotLoadingStatus();
				if (!this.currentAttempt) return;
				this.manageBandwidthCalculatorsState("stop");
				this.notReceivingBytesTimeout.clear();
				this.setStatus("succeed");
				this._totalBytes = this._loadedBytes;
				this.onSegmentLoaded({
					segmentUrl: this.segment.url,
					bytesLength: this.data.byteLength,
					downloadSource: this.currentAttempt.downloadSource,
					peerId: this.currentAttempt.downloadSource === "p2p" ? this.currentAttempt.peerId : void 0,
					streamType: this.segment.stream.type
				});
				this.logger(`${this.currentAttempt.downloadSource} ${this.segment.externalId} succeed`);
				this.requestProcessQueueCallback();
			});
			_defineProperty(this, "addLoadedChunk", (chunk) => {
				this.throwErrorIfNotLoadingStatus();
				if (!this.currentAttempt || !this.progress) return;
				this.notReceivingBytesTimeout.restart();
				const { byteLength } = chunk;
				const { all: allBC, http: httpBC } = this.bandwidthCalculators;
				allBC.addBytes(byteLength);
				if (this.currentAttempt.downloadSource === "http") httpBC.addBytes(byteLength);
				this.bytes.push(chunk);
				this.progress.lastLoadedChunkTimestamp = performance.now();
				this.progress.loadedBytes += byteLength;
				this._loadedBytes += byteLength;
			});
			_defineProperty(this, "firstBytesReceived", () => {
				this.throwErrorIfNotLoadingStatus();
				this.notReceivingBytesTimeout.restart();
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
			const { byteRange } = this.segment;
			if (byteRange) {
				const { end, start } = byteRange;
				this._totalBytes = end - start + 1;
			}
			this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);
			const { type } = this.segment.stream;
			this._logger = (0, import_browser.default)(`p2pml-core:request-${type}`);
		}
		clearLoadedBytes() {
			this._loadedBytes = 0;
			this.bytes = [];
			this._totalBytes = void 0;
			this.finalData = void 0;
		}
		get status() {
			return this._status;
		}
		setStatus(status) {
			this._status = status;
			this._isHandledByProcessQueue = false;
		}
		get downloadSource() {
			var _this$currentAttempt;
			return (_this$currentAttempt = this.currentAttempt) === null || _this$currentAttempt === void 0 ? void 0 : _this$currentAttempt.downloadSource;
		}
		get loadedBytes() {
			return this._loadedBytes;
		}
		get totalBytes() {
			return this._totalBytes;
		}
		get data() {
			var _this$finalData;
			(_this$finalData = this.finalData) !== null && _this$finalData !== void 0 || (this.finalData = joinChunks(this.bytes).buffer);
			return this.finalData;
		}
		get failedAttempts() {
			return this._failedAttempts;
		}
		get isHandledByProcessQueue() {
			return this._isHandledByProcessQueue;
		}
		markHandledByProcessQueue() {
			this._isHandledByProcessQueue = true;
		}
		setTotalBytes(value) {
			if (this._totalBytes !== void 0) throw new Error("Request total bytes value is already set");
			this._totalBytes = value;
		}
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
		tryCompleteByLoadedBytes(requestData, controls, validate, validationErrorType) {
			if (!this._totalBytes) return false;
			if (this._loadedBytes > this._totalBytes) {
				this.logger(`${requestData.downloadSource} ${this.segment.externalId} loaded bytes overflow: ${this._loadedBytes} > ${this._totalBytes}, clearing`);
				this.clearLoadedBytes();
				return false;
			}
			if (this._loadedBytes !== this._totalBytes) return false;
			const requestControls = this.start(requestData, controls);
			this.notReceivingBytesTimeout.clear();
			if (validate) this.validateAndComplete(requestData.downloadSource, requestControls, validate, validationErrorType);
			else requestControls.completeOnSuccess();
			return true;
		}
		validateData(validate) {
			var _this = this;
			return _asyncToGenerator(function* () {
				if (!validate) return true;
				try {
					return yield validate(_this.segment.url, _this.segment.byteRange, _this.data);
				} catch (err) {
					_this.logger(`validation threw an error: ${String(err)}`);
					return false;
				}
			})();
		}
		validateAndComplete(downloadSource, requestControls, validate, validationErrorType) {
			var _this2 = this;
			return _asyncToGenerator(function* () {
				const isValid = yield _this2.validateData(validate);
				if (_this2._status !== "loading") return;
				if (!isValid) {
					_this2.logger(`${downloadSource} ${_this2.segment.externalId} validation failed for already-loaded bytes, clearing`);
					_this2.clearLoadedBytes();
					requestControls.abortOnError(new RequestError(validationErrorType));
					return;
				}
				_this2.logger(`${downloadSource} ${_this2.segment.externalId} validation passed for already-loaded bytes`);
				requestControls.completeOnSuccess();
			})();
		}
		start(requestData, controls) {
			if (this._status === "succeed") throw new Error(`Request ${this.segment.externalId} has been already succeed.`);
			if (this._status === "loading") throw new Error(`Request ${this.segment.externalId} has been already started.`);
			this.setStatus("loading");
			this.currentAttempt = _objectSpread2({}, requestData);
			this.progress = {
				startFromByte: this._loadedBytes,
				loadedBytes: 0,
				startTimestamp: performance.now()
			};
			this.manageBandwidthCalculatorsState("start");
			const { notReceivingBytesTimeoutMs, abort } = controls;
			this._abortRequestCallback = abort;
			if (notReceivingBytesTimeoutMs !== void 0) this.notReceivingBytesTimeout.start(notReceivingBytesTimeoutMs);
			this.logger(`${requestData.downloadSource} ${this.segment.externalId} started`);
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
		}
		abortFromProcessQueue() {
			var _this$currentAttempt2, _this$_abortRequestCa2, _this$currentAttempt3, _this$currentAttempt4;
			this.throwErrorIfNotLoadingStatus();
			this.setStatus("aborted");
			this.logger(`${(_this$currentAttempt2 = this.currentAttempt) === null || _this$currentAttempt2 === void 0 ? void 0 : _this$currentAttempt2.downloadSource} ${this.segment.externalId} aborted`);
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
		}
		throwErrorIfNotLoadingStatus() {
			if (this._status !== "loading") throw new Error(`Request has been already ${this.status}.`);
		}
		logger(message) {
			var _this$currentAttempt5;
			this._logger.color = ((_this$currentAttempt5 = this.currentAttempt) === null || _this$currentAttempt5 === void 0 ? void 0 : _this$currentAttempt5.downloadSource) === "http" ? "green" : "red";
			this._logger(message);
			this._logger.color = "";
		}
		manageBandwidthCalculatorsState(state) {
			var _this$currentAttempt6;
			const { all, http } = this.bandwidthCalculators;
			const method = state === "start" ? "startLoading" : "stopLoading";
			if (((_this$currentAttempt6 = this.currentAttempt) === null || _this$currentAttempt6 === void 0 ? void 0 : _this$currentAttempt6.downloadSource) === "http") http[method]();
			all[method]();
		}
	};
	var FailedRequestAttempts = class {
		constructor() {
			_defineProperty(this, "attempts", []);
		}
		add(attempt) {
			this.attempts.push(attempt);
		}
		get httpAttemptsCount() {
			return this.attempts.reduce((sum, attempt) => attempt.downloadSource === "http" ? sum + 1 : sum, 0);
		}
		get p2pAttemptsCount() {
			return this.attempts.reduce((sum, attempt) => attempt.downloadSource === "p2p" ? sum + 1 : sum, 0);
		}
		get lastAttempt() {
			return this.attempts[this.attempts.length - 1];
		}
		clear() {
			this.attempts = [];
		}
	};
	var Timeout = class {
		constructor(action) {
			_defineProperty(this, "action", void 0);
			_defineProperty(this, "timeoutId", void 0);
			_defineProperty(this, "ms", void 0);
			this.action = action;
		}
		start(ms) {
			if (this.timeoutId) throw new Error("Timeout is already started.");
			this.ms = ms;
			this.timeoutId = window.setTimeout(this.action, this.ms);
		}
		restart(ms) {
			if (this.timeoutId) clearTimeout(this.timeoutId);
			if (ms) this.ms = ms;
			if (!this.ms) return;
			this.timeoutId = window.setTimeout(this.action, this.ms);
		}
		clear() {
			clearTimeout(this.timeoutId);
			this.timeoutId = void 0;
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/requests/request-container.ts
	var RequestsContainer = class {
		constructor(requestProcessQueueCallback, bandwidthCalculators, playback, config, eventTarget) {
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
		get executingHttpCount() {
			let count = 0;
			for (const request of this.httpRequests()) if (request.status === "loading") count++;
			return count;
		}
		get executingP2PCount() {
			let count = 0;
			for (const request of this.p2pRequests()) if (request.status === "loading") count++;
			return count;
		}
		get(segment) {
			return this.requests.get(segment);
		}
		getOrCreateRequest(segment) {
			let request = this.requests.get(segment);
			if (!request) {
				request = new Request$1(segment, this.requestProcessQueueCallback, this.bandwidthCalculators, this.playback, this.config, this.eventTarget);
				this.requests.set(segment, request);
			}
			return request;
		}
		remove(request) {
			this.requests.delete(request.segment);
		}
		items() {
			return this.requests.values();
		}
		*httpRequests() {
			for (const request of this.requests.values()) if (request.downloadSource === "http") yield request;
		}
		*p2pRequests() {
			for (const request of this.requests.values()) if (request.downloadSource === "p2p") yield request;
		}
		destroy() {
			for (const request of this.requests.values()) {
				if (request.status !== "loading") continue;
				request.abortFromProcessQueue();
			}
			this.requests.clear();
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/requests/engine-request.ts
	var EngineRequest = class {
		constructor(segment, engineCallbacks) {
			_defineProperty(this, "segment", void 0);
			_defineProperty(this, "engineCallbacks", void 0);
			_defineProperty(this, "_status", "pending");
			_defineProperty(this, "_shouldBeStartedImmediately", false);
			this.segment = segment;
			this.engineCallbacks = engineCallbacks;
		}
		get status() {
			return this._status;
		}
		get shouldBeStartedImmediately() {
			return this._shouldBeStartedImmediately;
		}
		resolve(data, bandwidth) {
			if (this._status !== "pending") return;
			this._status = "succeed";
			this.engineCallbacks.onSuccess({
				data,
				bandwidth
			});
		}
		reject() {
			if (this._status !== "pending") return;
			this._status = "failed";
			this.engineCallbacks.onError(new CoreRequestError("failed"));
		}
		abort() {
			if (this._status !== "pending") return;
			this._status = "aborted";
			this.engineCallbacks.onError(new CoreRequestError("aborted"));
		}
		markAsShouldBeStartedImmediately() {
			this._shouldBeStartedImmediately = true;
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/utils/queue.ts
	function* generateQueue(lastRequestedSegment, playback, playbackConfig, currentP2PLoader, availablePercentMemory) {
		const { runtimeId, stream } = lastRequestedSegment;
		const requestedSegment = stream.segments.get(runtimeId);
		if (!requestedSegment) return;
		const queueSegments = stream.segments.values();
		let first;
		do {
			const next = queueSegments.next();
			if (next.done) return;
			first = next.value;
		} while (first !== requestedSegment);
		const firstStatuses = getSegmentPlaybackStatuses(first, playback, playbackConfig, currentP2PLoader, availablePercentMemory);
		if (isNotActualStatuses(firstStatuses)) {
			const next = queueSegments.next();
			if (next.done) return;
			const second = next.value;
			const secondStatuses = getSegmentPlaybackStatuses(second, playback, playbackConfig, currentP2PLoader, availablePercentMemory);
			if (isNotActualStatuses(secondStatuses)) return;
			firstStatuses.isHighDemand = true;
			yield {
				segment: first,
				statuses: firstStatuses
			};
			yield {
				segment: second,
				statuses: secondStatuses
			};
		} else yield {
			segment: first,
			statuses: firstStatuses
		};
		for (const segment of queueSegments) {
			const statuses = getSegmentPlaybackStatuses(segment, playback, playbackConfig, currentP2PLoader, availablePercentMemory);
			if (isNotActualStatuses(statuses)) break;
			yield {
				segment,
				statuses
			};
		}
	}
	function isNotActualStatuses(statuses) {
		const { isHighDemand, isHttpDownloadable, isP2PDownloadable } = statuses;
		return !isHighDemand && !isHttpDownloadable && !isP2PDownloadable;
	}
	//#endregion
	//#region ../p2p-media-loader-core/src/hybrid-loader.ts
	var FAILED_ATTEMPTS_CLEAR_INTERVAL = 6e4;
	var PEER_UPDATE_LATENCY = 1e3;
	var HybridLoader = class {
		constructor(streamManifestUrl, lastRequestedSegment, streamDetails, config, bandwidthCalculators, segmentStorage, webTorrentSocketPool, eventTarget) {
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
			_defineProperty(this, "requestProcessQueueMicrotask", (force = true) => {
				const now = performance.now();
				if (!force && this.lastQueueProcessingTimeStamp !== void 0 && now - this.lastQueueProcessingTimeStamp <= 1e3 || this.isProcessQueueMicrotaskCreated) return;
				this.isProcessQueueMicrotaskCreated = true;
				queueMicrotask(() => {
					try {
						this.processQueue();
						this.lastQueueProcessingTimeStamp = now;
					} finally {
						this.isProcessQueueMicrotaskCreated = false;
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
			const activeStream = this.lastRequestedSegment.stream;
			this.swarmId = (_this$config$swarmId = this.config.swarmId) !== null && _this$config$swarmId !== void 0 ? _this$config$swarmId : this.streamManifestUrl;
			this.playback = {
				position: this.lastRequestedSegment.startTime,
				rate: 1
			};
			this.segmentAvgDuration = getSegmentAvgDuration(activeStream);
			this.requests = new RequestsContainer(this.requestProcessQueueMicrotask, this.bandwidthCalculators, this.playback, this.config, this.eventTarget);
			this.p2pLoaders = new P2PLoadersContainer(this.streamManifestUrl, this.lastRequestedSegment.stream, this.requests, this.segmentStorage, this.config, this.webTorrentSocketPool, this.eventTarget, this.requestProcessQueueMicrotask);
			this.logger = (0, import_browser.default)(`p2pml-core:hybrid-loader-${activeStream.type}`);
			this.logger.color = "coral";
			this.setIntervalLoading();
		}
		setIntervalLoading() {
			const peersCount = this.p2pLoaders.currentLoader.connectedPeerCount;
			const randomTimeout = Math.random() * PEER_UPDATE_LATENCY * peersCount + PEER_UPDATE_LATENCY;
			this.randomHttpDownloadTimeout = window.setTimeout(() => {
				this.loadRandomThroughHttp();
				this.setIntervalLoading();
			}, randomTimeout);
		}
		loadSegment(segment, callbacks) {
			var _this = this;
			return _asyncToGenerator(function* () {
				_this.logger(`requests: ${getSegmentString(segment)}`);
				const { stream } = segment;
				if (stream !== _this.lastRequestedSegment.stream) {
					_this.logger(`stream changed to ${getStreamString(stream)}`);
					_this.p2pLoaders.changeCurrentLoader(stream);
				}
				_this.lastRequestedSegment = segment;
				const streamSwarmId = getStreamSwarmId(_this.swarmId, stream);
				_this.segmentStorage.onSegmentRequested(_this.swarmId, streamSwarmId, segment.externalId, segment.startTime, segment.endTime, stream.type, _this.streamDetails.isLive);
				const engineRequest = new EngineRequest(segment, callbacks);
				try {
					var _this$engineRequest;
					if (_this.segmentStorage.hasSegment(_this.swarmId, streamSwarmId, segment.externalId)) {
						const data = yield _this.segmentStorage.getSegmentData(_this.swarmId, streamSwarmId, segment.externalId);
						if (data) {
							const { queueDownloadRatio } = _this.generateQueue();
							engineRequest.resolve(data, _this.getBandwidth(queueDownloadRatio));
							return;
						}
					}
					(_this$engineRequest = _this.engineRequest) === null || _this$engineRequest === void 0 || _this$engineRequest.abort();
					_this.engineRequest = engineRequest;
					const request = _this.requests.get(segment);
					if ((request === null || request === void 0 ? void 0 : request.status) === "failed") request.failedAttempts.clear();
				} catch (error) {
					_this.logger(`request failed for ${getSegmentString(segment)} in ${getStreamString(stream)}`, error);
					engineRequest.reject();
				} finally {
					_this.requestProcessQueueMicrotask();
				}
			})();
		}
		processRequests(queueSegmentIds, queueDownloadRatio) {
			const { stream } = this.lastRequestedSegment;
			const { httpErrorRetries } = this.config;
			const now = performance.now();
			for (const request of this.requests.items()) {
				var _this$engineRequest2;
				const { downloadSource: type, status, segment, isHandledByProcessQueue } = request;
				const engineRequest = ((_this$engineRequest2 = this.engineRequest) === null || _this$engineRequest2 === void 0 ? void 0 : _this$engineRequest2.segment) === segment ? this.engineRequest : void 0;
				switch (status) {
					case "loading":
						if (!queueSegmentIds.has(segment.runtimeId) && !engineRequest) {
							request.abortFromProcessQueue();
							this.requests.remove(request);
						}
						break;
					case "succeed": {
						if (!type) break;
						if (type === "http") this.p2pLoaders.currentLoader.broadcastAnnouncement();
						if (engineRequest) {
							engineRequest.resolve(request.data, this.getBandwidth(queueDownloadRatio));
							this.engineRequest = void 0;
						}
						this.requests.remove(request);
						this.logger(`succeed: ${getSegmentString(segment)} (byteLength: ${request.data.byteLength})`);
						const streamSwarmId = getStreamSwarmId(this.swarmId, stream);
						this.segmentStorage.storeSegment(this.swarmId, streamSwarmId, segment.externalId, request.data, segment.startTime, segment.endTime, segment.stream.type, this.streamDetails.isLive);
						break;
					}
					case "failed":
						if (type === "http" && !isHandledByProcessQueue) this.p2pLoaders.currentLoader.broadcastAnnouncement();
						if (!engineRequest && !stream.segments.has(request.segment.runtimeId)) this.requests.remove(request);
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
				const { lastAttempt } = request.failedAttempts;
				if (lastAttempt && now - lastAttempt.error.timestamp > FAILED_ATTEMPTS_CLEAR_INTERVAL) request.failedAttempts.clear();
			}
		}
		processQueue() {
			const { queue, queueSegmentIds, queueDownloadRatio } = this.generateQueue();
			this.processRequests(queueSegmentIds, queueDownloadRatio);
			const { simultaneousHttpDownloads, simultaneousP2PDownloads, httpErrorRetries, httpDownloadInitialTimeoutMs } = this.config;
			const timeSinceStart = performance.now() - this.createdAt;
			const isInitialHttpWait = httpDownloadInitialTimeoutMs > 0 && timeSinceStart < httpDownloadInitialTimeoutMs;
			if (isInitialHttpWait) {
				var _this$initialHttpDela;
				(_this$initialHttpDela = this.initialHttpDelayTimeoutId) !== null && _this$initialHttpDela !== void 0 || (this.initialHttpDelayTimeoutId = window.setTimeout(() => {
					this.initialHttpDelayTimeoutId = void 0;
					this.requestProcessQueueMicrotask();
				}, httpDownloadInitialTimeoutMs - timeSinceStart));
			}
			const { engineRequest } = this;
			if (engineRequest) {
				const { segment } = engineRequest;
				const request = this.requests.get(segment);
				if (engineRequest.shouldBeStartedImmediately && engineRequest.status === "pending" && (!request || request.status === "not-started" || request.status === "failed" || request.status === "aborted")) {
					var _request$failedAttemp;
					if (!isInitialHttpWait && ((_request$failedAttemp = request === null || request === void 0 ? void 0 : request.failedAttempts.httpAttemptsCount) !== null && _request$failedAttemp !== void 0 ? _request$failedAttemp : 0) < httpErrorRetries && this.requests.executingHttpCount < simultaneousHttpDownloads) this.loadThroughHttp(segment);
					else if (this.p2pLoaders.currentLoader.isSegmentLoadedBySomeone(segment) && this.requests.executingP2PCount < simultaneousP2PDownloads) this.loadThroughP2P(segment);
				}
			}
			for (const item of queue) {
				const { statuses, segment } = item;
				const request = this.requests.get(segment);
				if ((request === null || request === void 0 ? void 0 : request.status) === "succeed") continue;
				if (statuses.isHighDemand) {
					var _request$failedAttemp2;
					const canLoadThroughHttp = !isInitialHttpWait && ((_request$failedAttemp2 = request === null || request === void 0 ? void 0 : request.failedAttempts.httpAttemptsCount) !== null && _request$failedAttemp2 !== void 0 ? _request$failedAttemp2 : 0) < httpErrorRetries;
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
					if (this.p2pLoaders.currentLoader.isSegmentLoadedBySomeone(segment) && (this.requests.executingP2PCount < simultaneousP2PDownloads || this.abortLastP2PLoadingInQueueAfterItem(queue, segment))) this.loadThroughP2P(segment);
				} else if (statuses.isP2PDownloadable && (request === null || request === void 0 ? void 0 : request.status) !== "loading" && this.requests.executingP2PCount < simultaneousP2PDownloads) this.loadThroughP2P(segment);
			}
		}
		abortSegmentRequest(segmentRuntimeId) {
			var _this$engineRequest3;
			if (((_this$engineRequest3 = this.engineRequest) === null || _this$engineRequest3 === void 0 ? void 0 : _this$engineRequest3.segment.runtimeId) !== segmentRuntimeId) return;
			this.engineRequest.abort();
			this.logger("abort: ", getSegmentString(this.engineRequest.segment));
			this.engineRequest = void 0;
			this.requestProcessQueueMicrotask();
		}
		loadThroughHttp(segment) {
			new HttpRequestExecutor(this.requests.getOrCreateRequest(segment), this.config, this.eventTarget).execute();
			this.p2pLoaders.currentLoader.broadcastAnnouncement();
		}
		loadThroughP2P(segment) {
			this.p2pLoaders.currentLoader.downloadSegment(segment);
		}
		loadRandomThroughHttp() {
			const { httpDownloadInitialTimeoutMs } = this.config;
			if (httpDownloadInitialTimeoutMs > 0 && performance.now() - this.createdAt < httpDownloadInitialTimeoutMs) return;
			const availableStorageCapacityPercent = this.getAvailableStorageCapacityPercent();
			if (availableStorageCapacityPercent <= 10) return;
			const { simultaneousHttpDownloads, httpErrorRetries } = this.config;
			const p2pLoader = this.p2pLoaders.currentLoader;
			if (this.requests.executingHttpCount >= simultaneousHttpDownloads || !p2pLoader.connectedPeerCount) return;
			const segmentsToLoad = [];
			for (const { segment, statuses } of generateQueue(this.lastRequestedSegment, this.playback, this.config, this.p2pLoaders.currentLoader, availableStorageCapacityPercent)) {
				const streamSwarmId = getStreamSwarmId(this.swarmId, segment.stream);
				if (!statuses.isHttpDownloadable || statuses.isP2PDownloadable || this.segmentStorage.hasSegment(this.swarmId, streamSwarmId, segment.externalId)) continue;
				const request = this.requests.get(segment);
				if (request && (request.status === "loading" || request.status === "succeed" || request.failedAttempts.httpAttemptsCount >= httpErrorRetries)) continue;
				segmentsToLoad.push(segment);
			}
			if (!segmentsToLoad.length) return;
			if (simultaneousHttpDownloads - this.requests.executingHttpCount === 0) return;
			const peersCount = p2pLoader.connectedPeerCount + 1;
			const safeRandomSegmentsCount = Math.min(segmentsToLoad.length, simultaneousHttpDownloads * peersCount);
			const randomIndices = shuffleArray(Array.from({ length: safeRandomSegmentsCount }, (_, i) => i));
			let probability = safeRandomSegmentsCount / peersCount;
			for (const randomIndex of randomIndices) {
				if (this.requests.executingHttpCount >= simultaneousHttpDownloads) break;
				if (probability >= 1 || Math.random() <= probability) {
					const segment = segmentsToLoad[randomIndex];
					this.loadThroughHttp(segment);
				}
				probability--;
				if (probability <= 0) break;
			}
		}
		abortLastHttpLoadingInQueueAfterItem(queue, segment) {
			for (const { segment: itemSegment } of arrayBackwards(queue)) {
				if (itemSegment === segment) break;
				const request = this.requests.get(itemSegment);
				if ((request === null || request === void 0 ? void 0 : request.downloadSource) === "http" && request.status === "loading") {
					request.abortFromProcessQueue();
					return true;
				}
			}
			return false;
		}
		abortLastP2PLoadingInQueueAfterItem(queue, segment) {
			for (const { segment: itemSegment } of arrayBackwards(queue)) {
				if (itemSegment === segment) break;
				const request = this.requests.get(itemSegment);
				if ((request === null || request === void 0 ? void 0 : request.downloadSource) === "p2p" && request.status === "loading") {
					request.abortFromProcessQueue();
					return true;
				}
			}
			return false;
		}
		getAvailableStorageCapacityPercent() {
			const { totalCapacity, usedCapacity } = this.segmentStorage.getUsage();
			return 100 - usedCapacity / totalCapacity * 100;
		}
		generateQueue() {
			const queue = [];
			const queueSegmentIds = /* @__PURE__ */ new Set();
			let maxPossibleLength = 0;
			let alreadyLoadedCount = 0;
			const availableStorageCapacityPercent = this.getAvailableStorageCapacityPercent();
			for (const item of generateQueue(this.lastRequestedSegment, this.playback, this.config, this.p2pLoaders.currentLoader, availableStorageCapacityPercent)) {
				var _this$requests$get;
				maxPossibleLength++;
				const { segment } = item;
				const streamSwarmId = getStreamSwarmId(this.swarmId, segment.stream);
				if (this.segmentStorage.hasSegment(this.swarmId, streamSwarmId, segment.externalId) || ((_this$requests$get = this.requests.get(segment)) === null || _this$requests$get === void 0 ? void 0 : _this$requests$get.status) === "succeed") {
					alreadyLoadedCount++;
					continue;
				}
				queue.push(item);
				queueSegmentIds.add(segment.runtimeId);
			}
			return {
				queue,
				queueSegmentIds,
				maxPossibleLength,
				alreadyLoadedCount,
				queueDownloadRatio: maxPossibleLength !== 0 ? alreadyLoadedCount / maxPossibleLength : 0
			};
		}
		getBandwidth(queueDownloadRatio) {
			const { http, all } = this.bandwidthCalculators;
			const { activeLevelBitrate } = this.streamDetails;
			if (activeLevelBitrate === 0) return all.getBandwidthLoadingOnly(3);
			const bandwidth = Math.max(all.getBandwidth(30, this.levelChangedTimestamp), all.getBandwidth(60, this.levelChangedTimestamp), all.getBandwidth(90, this.levelChangedTimestamp));
			if (queueDownloadRatio >= .8 || bandwidth >= activeLevelBitrate * .9) return Math.max(all.getBandwidthLoadingOnly(1), all.getBandwidthLoadingOnly(3), all.getBandwidthLoadingOnly(5));
			const httpRealBandwidth = Math.max(http.getBandwidthLoadingOnly(1), http.getBandwidthLoadingOnly(3), http.getBandwidthLoadingOnly(5));
			return Math.max(bandwidth, httpRealBandwidth);
		}
		notifyLevelChanged() {
			this.levelChangedTimestamp = performance.now();
		}
		sendBroadcastAnnouncement(sendEmptySegmentsAnnouncement = false) {
			this.p2pLoaders.currentLoader.broadcastAnnouncement(sendEmptySegmentsAnnouncement);
		}
		updatePlayback(position, rate) {
			const isRateChanged = this.playback.rate !== rate;
			const isPositionChanged = this.playback.position !== position;
			if (!isRateChanged && !isPositionChanged) return;
			const isPositionSignificantlyChanged = Math.abs(position - this.playback.position) / this.segmentAvgDuration > .5;
			if (isPositionChanged) this.playback.position = position;
			if (isRateChanged && rate !== 0) this.playback.rate = rate;
			if (isPositionSignificantlyChanged) {
				var _this$engineRequest4;
				this.logger("position significantly changed");
				(_this$engineRequest4 = this.engineRequest) === null || _this$engineRequest4 === void 0 || _this$engineRequest4.markAsShouldBeStartedImmediately();
			}
			this.segmentStorage.onPlaybackUpdated(position, rate);
			this.requestProcessQueueMicrotask(isPositionSignificantlyChanged);
		}
		updateStream(stream) {
			if (stream !== this.lastRequestedSegment.stream) return;
			this.logger(`update stream: ${getStreamString(stream)}`);
			this.requestProcessQueueMicrotask();
		}
		destroy() {
			var _this$engineRequest5;
			clearTimeout(this.randomHttpDownloadTimeout);
			clearTimeout(this.initialHttpDelayTimeoutId);
			(_this$engineRequest5 = this.engineRequest) === null || _this$engineRequest5 === void 0 || _this$engineRequest5.abort();
			this.requests.destroy();
			this.p2pLoaders.destroy();
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/segment-storage/utils.ts
	var getStorageItemId = (streamId, segmentId) => `${streamId}|${segmentId}`;
	var isAndroid = (userAgent) => /Android/i.test(userAgent);
	var isIPadOrIPhone = (userAgent) => /iPad|iPhone/i.test(userAgent);
	var isAndroidWebview = (userAgent) => /Android/i.test(userAgent) && !/Chrome|Firefox/i.test(userAgent);
	//#endregion
	//#region ../p2p-media-loader-core/src/segment-storage/segment-memory-storage.ts
	var BYTES_PER_MiB = 1048576;
	var SegmentMemoryStorage = class {
		constructor() {
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
		initialize(coreConfig, mainStreamConfig, secondaryStreamConfig) {
			var _this = this;
			return _asyncToGenerator(function* () {
				_this.coreConfig = coreConfig;
				_this.mainStreamConfig = mainStreamConfig;
				_this.secondaryStreamConfig = secondaryStreamConfig;
				_this.setMemoryStorageLimit();
				_this.logger("initialized");
			})();
		}
		onPlaybackUpdated(position, rate) {
			this.currentPlayback = {
				position,
				rate
			};
		}
		onSegmentRequested(swarmId, streamId, segmentId, startTime, endTime, streamType, isLiveStream) {
			this.lastRequestedSegment = {
				streamId,
				segmentId,
				startTime,
				endTime,
				swarmId,
				streamType,
				isLiveStream
			};
		}
		storeSegment(_swarmId, streamId, segmentId, data, startTime, endTime, streamType, isLiveStream) {
			var _this2 = this;
			return _asyncToGenerator(function* () {
				_this2.clear(isLiveStream, data.byteLength);
				const storageId = getStorageItemId(streamId, segmentId);
				_this2.cache.set(storageId, {
					data,
					segmentId,
					streamId,
					startTime,
					endTime,
					streamType
				});
				_this2.increaseStorageUsage(data.byteLength);
				_this2.logger(`add segment: ${segmentId} to ${streamId}`);
				if (!_this2.segmentChangeCallback) throw new Error("dispatchStorageUpdatedEvent is not set");
				_this2.segmentChangeCallback(streamId);
			})();
		}
		getSegmentData(_swarmId, streamId, segmentId) {
			var _this3 = this;
			return _asyncToGenerator(function* () {
				const segmentStorageId = getStorageItemId(streamId, segmentId);
				const dataItem = _this3.cache.get(segmentStorageId);
				if (dataItem === void 0) return void 0;
				return dataItem.data;
			})();
		}
		getUsage() {
			if (!this.lastRequestedSegment || !this.currentPlayback) return {
				totalCapacity: this.segmentMemoryStorageLimit,
				usedCapacity: this.currentStorageUsage
			};
			const playbackPosition = this.currentPlayback.position;
			let calculatedUsedCapacity = 0;
			for (const { endTime, data } of this.cache.values()) {
				if (playbackPosition > endTime) continue;
				calculatedUsedCapacity += data.byteLength;
			}
			return {
				totalCapacity: this.segmentMemoryStorageLimit,
				usedCapacity: calculatedUsedCapacity / BYTES_PER_MiB
			};
		}
		hasSegment(_swarmId, streamId, externalId) {
			const segmentStorageId = getStorageItemId(streamId, externalId);
			return this.cache.get(segmentStorageId) !== void 0;
		}
		getStoredSegmentIds(_swarmId, streamId) {
			const externalIds = [];
			for (const { segmentId, streamId: streamCacheId } of this.cache.values()) {
				if (streamCacheId !== streamId) continue;
				externalIds.push(segmentId);
			}
			return externalIds;
		}
		clear(isLiveStream, newSegmentSize) {
			if (!this.currentPlayback || !this.mainStreamConfig || !this.secondaryStreamConfig || !this.coreConfig) return;
			if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream) return;
			const affectedStreams = /* @__PURE__ */ new Set();
			const sortedCache = Array.from(this.cache.values()).sort((a, b) => a.startTime - b.startTime);
			for (const segmentData of sortedCache) {
				const { streamId, segmentId, data } = segmentData;
				const storageId = getStorageItemId(streamId, segmentId);
				if (!this.shouldRemoveSegment(segmentData, isLiveStream, this.currentPlayback.position)) continue;
				this.cache.delete(storageId);
				affectedStreams.add(streamId);
				this.decreaseStorageUsage(data.byteLength);
				this.logger(`Removed segment ${segmentId} from stream ${streamId}`);
				if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream) break;
			}
			this.sendUpdatesToAffectedStreams(affectedStreams);
		}
		isMemoryLimitReached(segmentByteLength) {
			return this.currentStorageUsage + segmentByteLength / BYTES_PER_MiB > this.segmentMemoryStorageLimit;
		}
		setSegmentChangeCallback(callback) {
			this.segmentChangeCallback = callback;
		}
		sendUpdatesToAffectedStreams(affectedStreams) {
			if (affectedStreams.size === 0) return;
			affectedStreams.forEach((stream) => {
				if (!this.segmentChangeCallback) throw new Error("dispatchStorageUpdatedEvent is not set");
				this.segmentChangeCallback(stream);
			});
		}
		shouldRemoveSegment(segmentData, isLiveStream, currentPlaybackPosition) {
			const { endTime, streamType } = segmentData;
			const highDemandTimeWindow = this.getStreamTimeWindow(streamType, "highDemandTimeWindow");
			if (currentPlaybackPosition <= endTime) return false;
			if (isLiveStream) return currentPlaybackPosition > highDemandTimeWindow + endTime;
			return true;
		}
		increaseStorageUsage(segmentByteLength) {
			this.currentStorageUsage += segmentByteLength / BYTES_PER_MiB;
		}
		decreaseStorageUsage(segmentByteLength) {
			this.currentStorageUsage -= segmentByteLength / BYTES_PER_MiB;
		}
		setMemoryStorageLimit() {
			var _this$coreConfig;
			if ((_this$coreConfig = this.coreConfig) === null || _this$coreConfig === void 0 ? void 0 : _this$coreConfig.segmentMemoryStorageLimit) {
				this.segmentMemoryStorageLimit = this.coreConfig.segmentMemoryStorageLimit;
				return;
			}
			if (isAndroidWebview(this.userAgent) || isIPadOrIPhone(this.userAgent)) this.segmentMemoryStorageLimit = 1024;
			else if (isAndroid(this.userAgent)) this.segmentMemoryStorageLimit = 2 * 1024;
		}
		getStreamTimeWindow(streamType, configKey) {
			var _config$configKey;
			const config = streamType === "main" ? this.mainStreamConfig : this.secondaryStreamConfig;
			return (_config$configKey = config === null || config === void 0 ? void 0 : config[configKey]) !== null && _config$configKey !== void 0 ? _config$configKey : 0;
		}
		destroy() {
			this.cache.clear();
			this.segmentChangeCallback = void 0;
		}
	};
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
	var WebSocketClient = class {
		constructor(config) {
			var _config$initialDelay, _config$maxDelay, _config$jitterMultipl;
			_classPrivateMethodInitSpec(this, _WebSocketClient_brand);
			_classPrivateFieldInitSpec(this, _config, void 0);
			_classPrivateFieldInitSpec(this, _state, "disconnected");
			_classPrivateFieldInitSpec(this, _ws, null);
			_classPrivateFieldInitSpec(this, _backoffCount, 0);
			_classPrivateFieldInitSpec(this, _reconnectTimeoutId, null);
			_classPrivateFieldInitSpec(this, _eventTarget$1, new EventTarget());
			_classPrivateFieldInitSpec(this, _onOpen, () => {
				if (_classPrivateFieldGet2(_state, this) === "disposed") return;
				_classPrivateFieldSet2(_state, this, "connected");
				_classPrivateFieldSet2(_backoffCount, this, 0);
				_classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("connected");
			});
			_classPrivateFieldInitSpec(this, _onClose, () => {
				if (_classPrivateFieldGet2(_state, this) === "disposed") return;
				if (_classPrivateFieldGet2(_ws, this)) {
					_classPrivateFieldGet2(_ws, this).onopen = null;
					_classPrivateFieldGet2(_ws, this).onclose = null;
					_classPrivateFieldGet2(_ws, this).onerror = null;
					_classPrivateFieldGet2(_ws, this).onmessage = null;
					_classPrivateFieldSet2(_ws, this, null);
				}
				_assertClassBrand(_WebSocketClient_brand, this, _scheduleReconnect).call(this);
				_classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("disconnected");
			});
			_classPrivateFieldInitSpec(this, _onError, (event) => {
				if (_classPrivateFieldGet2(_state, this) === "disposed") return;
				_classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("error", event);
			});
			_classPrivateFieldInitSpec(this, _onMessage, (event) => {
				if (_classPrivateFieldGet2(_state, this) === "disposed") return;
				_classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("message", event.data);
			});
			const initialDelay = Math.max(100, (_config$initialDelay = config.initialDelay) !== null && _config$initialDelay !== void 0 ? _config$initialDelay : 1e3);
			_classPrivateFieldSet2(_config, this, {
				url: config.url,
				initialDelay,
				maxDelay: Math.max(initialDelay, (_config$maxDelay = config.maxDelay) !== null && _config$maxDelay !== void 0 ? _config$maxDelay : 3e4),
				jitterMultiplier: Math.max(0, (_config$jitterMultipl = config.jitterMultiplier) !== null && _config$jitterMultipl !== void 0 ? _config$jitterMultipl : .2)
			});
		}
		get state() {
			return _classPrivateFieldGet2(_state, this);
		}
		addEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget$1, this).addEventListener(eventName, listener);
		}
		removeEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget$1, this).removeEventListener(eventName, listener);
		}
		connect() {
			if (_classPrivateFieldGet2(_state, this) === "connected" || _classPrivateFieldGet2(_state, this) === "connecting" || _classPrivateFieldGet2(_state, this) === "disposed") return;
			_classPrivateFieldSet2(_state, this, "connecting");
			_assertClassBrand(_WebSocketClient_brand, this, _clearReconnectTimeout).call(this);
			try {
				_classPrivateFieldSet2(_ws, this, new WebSocket(_classPrivateFieldGet2(_config, this).url));
				_classPrivateFieldGet2(_ws, this).binaryType = "arraybuffer";
				_classPrivateFieldGet2(_ws, this).onopen = _classPrivateFieldGet2(_onOpen, this);
				_classPrivateFieldGet2(_ws, this).onclose = _classPrivateFieldGet2(_onClose, this);
				_classPrivateFieldGet2(_ws, this).onerror = _classPrivateFieldGet2(_onError, this);
				_classPrivateFieldGet2(_ws, this).onmessage = _classPrivateFieldGet2(_onMessage, this);
			} catch (error) {
				_classPrivateFieldSet2(_state, this, "disconnected");
				const errorEvent = new ErrorEvent("error", {
					message: error instanceof Error ? error.message : "Unknown WebSocket creation error",
					error
				});
				_classPrivateFieldGet2(_eventTarget$1, this).dispatchEvent("error", errorEvent);
			}
		}
		send(data) {
			if (_classPrivateFieldGet2(_state, this) !== "connected" || !_classPrivateFieldGet2(_ws, this)) throw new Error("WebSocketClient: Cannot send data when not connected");
			_classPrivateFieldGet2(_ws, this).send(data);
		}
		dispose() {
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
		}
	};
	function _scheduleReconnect() {
		if (_classPrivateFieldGet2(_state, this) === "disposed") return;
		_classPrivateFieldSet2(_state, this, "reconnecting");
		const baseDelay = Math.min(_classPrivateFieldGet2(_config, this).initialDelay * Math.pow(2, _classPrivateFieldGet2(_backoffCount, this)), _classPrivateFieldGet2(_config, this).maxDelay);
		const jitter = baseDelay * _classPrivateFieldGet2(_config, this).jitterMultiplier;
		const randomJitter = Math.random() * 2 * jitter - jitter;
		const delay = Math.max(0, baseDelay + randomJitter);
		if (baseDelay < _classPrivateFieldGet2(_config, this).maxDelay) {
			var _this$backoffCount;
			_classPrivateFieldSet2(_backoffCount, this, (_this$backoffCount = _classPrivateFieldGet2(_backoffCount, this), _this$backoffCount++, _this$backoffCount));
		}
		_classPrivateFieldSet2(_reconnectTimeoutId, this, setTimeout(() => {
			if (_classPrivateFieldGet2(_state, this) !== "disposed") this.connect();
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
	var WebTorrentSocketPool = class {
		constructor() {
			_classPrivateFieldInitSpec(this, _sockets, /* @__PURE__ */ new Map());
			_classPrivateFieldInitSpec(this, _eventTarget, new EventTarget());
		}
		addEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget, this).addEventListener(eventName, listener);
		}
		removeEventListener(eventName, listener) {
			_classPrivateFieldGet2(_eventTarget, this).removeEventListener(eventName, listener);
		}
		acquire(url) {
			let entry = _classPrivateFieldGet2(_sockets, this).get(url);
			if (!entry) {
				const client = new WebSocketClient({ url });
				client.addEventListener("error", (error) => {
					_classPrivateFieldGet2(_eventTarget, this).dispatchEvent("error", error, url);
				});
				client.connect();
				entry = {
					client,
					refCount: 0
				};
				_classPrivateFieldGet2(_sockets, this).set(url, entry);
			}
			entry.refCount++;
			let isReleased = false;
			return {
				client: entry.client,
				release: () => {
					if (isReleased) return;
					isReleased = true;
					const currentEntry = _classPrivateFieldGet2(_sockets, this).get(url);
					if (!currentEntry) return;
					currentEntry.refCount--;
					if (currentEntry.refCount <= 0) {
						if (currentEntry.refCount < 0) console.error(`[WebTorrentSocketPool] Negative refCount detected for ${url}`);
						_classPrivateFieldGet2(_sockets, this).delete(url);
						currentEntry.client.dispose();
					}
				}
			};
		}
		destroy() {
			_classPrivateFieldGet2(_eventTarget, this).clear();
			const entries = Array.from(_classPrivateFieldGet2(_sockets, this).values());
			_classPrivateFieldGet2(_sockets, this).clear();
			for (const entry of entries) try {
				entry.client.dispose();
			} catch (error) {
				console.error("[WebTorrentSocketPool] Failed to dispose WebSocketClient:", error);
			}
		}
	};
	//#endregion
	//#region ../p2p-media-loader-core/src/core.ts
	/** Core class for managing media streams loading via P2P. */
	var Core = class Core {
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
		constructor(config) {
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
			const filteredConfig = filterUndefinedProps(config !== null && config !== void 0 ? config : {});
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
			this.webTorrentSocketPool.addEventListener("error", (error, url) => {
				this.socketPoolLogger(`WebSocket error for tracker url ${url}:`, error);
			});
		}
		/**
		* Retrieves the current configuration for the core instance, ensuring immutability.
		*
		* @returns A deep readonly version of the core configuration.
		*/
		getConfig() {
			return _objectSpread2(_objectSpread2({}, deepCopy(this.commonCoreConfig)), {}, {
				mainStream: deepCopy(this.mainStreamConfig),
				secondaryStream: deepCopy(this.secondaryStreamConfig)
			});
		}
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
		applyDynamicConfig(dynamicConfig) {
			const { mainStream, secondaryStream } = dynamicConfig;
			const mainStreamConfigCopy = deepCopy(this.mainStreamConfig);
			const secondaryStreamConfigCopy = deepCopy(this.secondaryStreamConfig);
			this.overrideAllConfigs(dynamicConfig, mainStream, secondaryStream);
			this.processSpecificDynamicConfigParams(mainStreamConfigCopy, dynamicConfig, "main");
			this.processSpecificDynamicConfigParams(secondaryStreamConfigCopy, dynamicConfig, "secondary");
		}
		processSpecificDynamicConfigParams(prevConfig, updatedConfig, streamType) {
			const isP2PDisabled = this.getUpdatedStreamProperty("isP2PDisabled", updatedConfig, streamType);
			if (isP2PDisabled && prevConfig.isP2PDisabled !== isP2PDisabled) this.destroyStreamLoader(streamType);
			const isP2PUploadDisabled = this.getUpdatedStreamProperty("isP2PUploadDisabled", updatedConfig, streamType);
			if (isP2PUploadDisabled !== void 0 && prevConfig.isP2PUploadDisabled !== isP2PUploadDisabled) {
				const streamLoader = streamType === "main" ? this.mainStreamLoader : this.secondaryStreamLoader;
				streamLoader === null || streamLoader === void 0 || streamLoader.sendBroadcastAnnouncement(isP2PUploadDisabled);
			}
		}
		getUpdatedStreamProperty(propertyName, updatedConfig, streamType) {
			var _updatedStreamConfig$;
			const updatedStreamConfig = streamType === "main" ? updatedConfig.mainStream : updatedConfig.secondaryStream;
			return (_updatedStreamConfig$ = updatedStreamConfig === null || updatedStreamConfig === void 0 ? void 0 : updatedStreamConfig[propertyName]) !== null && _updatedStreamConfig$ !== void 0 ? _updatedStreamConfig$ : updatedConfig[propertyName];
		}
		/**
		* Adds an event listener for the specified event type on the core event target.
		*
		* @param eventName - The name of the event to listen for.
		* @param listener - The callback function to invoke when the event is fired.
		*/
		addEventListener(eventName, listener) {
			this.eventTarget.addEventListener(eventName, listener);
		}
		/**
		* Removes an event listener for the specified event type on the core event target.
		*
		* @param eventName - The name of the event to listen for.
		* @param listener - The callback function to be removed.
		*/
		removeEventListener(eventName, listener) {
			this.eventTarget.removeEventListener(eventName, listener);
		}
		/**
		* Sets the response URL for the manifest, stripping any query parameters.
		*
		* @param url - The full URL to the manifest response.
		*/
		setManifestResponseUrl(url) {
			this.manifestResponseUrl = url.split("?")[0];
		}
		/**
		* Checks if a segment is already stored within the core.
		*
		* @param segmentRuntimeId - The runtime identifier of the segment to check.
		* @returns `true` if the segment is present, otherwise `false`.
		*/
		hasSegment(segmentRuntimeId) {
			return !!getSegmentFromStreamsMap(this.streams, segmentRuntimeId);
		}
		/**
		* Retrieves a specific stream by its runtime identifier, if it exists.
		*
		* @param streamRuntimeId - The runtime identifier of the stream to retrieve.
		* @returns The stream with its segments, or `undefined` if not found.
		*/
		getStream(streamRuntimeId) {
			return this.streams.get(streamRuntimeId);
		}
		/**
		* Ensures a stream exists in the map; adds it if it does not.
		*
		* @param stream - The stream to potentially add to the map.
		*/
		addStreamIfNoneExists(stream) {
			if (this.streams.has(stream.runtimeId)) return;
			this.streams.set(stream.runtimeId, _objectSpread2(_objectSpread2({}, stream), {}, { segments: /* @__PURE__ */ new Map() }));
		}
		/**
		* Updates the segments associated with a specific stream.
		*
		* @param streamRuntimeId - The runtime identifier of the stream to update.
		* @param addSegments - Optional segments to add to the stream.
		* @param removeSegmentIds - Optional segment IDs to remove from the stream.
		*/
		updateStream(streamRuntimeId, addSegments, removeSegmentIds) {
			var _this$mainStreamLoade, _this$secondaryStream;
			const stream = this.streams.get(streamRuntimeId);
			if (!stream) return;
			if (addSegments) for (const segment of addSegments) {
				if (stream.segments.has(segment.runtimeId)) continue;
				stream.segments.set(segment.runtimeId, _objectSpread2(_objectSpread2({}, segment), {}, { stream }));
			}
			if (removeSegmentIds) for (const id of removeSegmentIds) stream.segments.delete(id);
			(_this$mainStreamLoade = this.mainStreamLoader) === null || _this$mainStreamLoade === void 0 || _this$mainStreamLoade.updateStream(stream);
			(_this$secondaryStream = this.secondaryStreamLoader) === null || _this$secondaryStream === void 0 || _this$secondaryStream.updateStream(stream);
		}
		/**
		* Loads a segment given its runtime identifier and invokes the provided callbacks during the process.
		* Initializes segment storage if it has not been initialized yet.
		*
		* @param segmentRuntimeId - The runtime identifier of the segment to load.
		* @param callbacks - The callbacks to be invoked during segment loading.
		* @throws {Error} - Throws if the manifest response URL is not defined.
		*/
		loadSegment(segmentRuntimeId, callbacks) {
			var _this = this;
			return _asyncToGenerator(function* () {
				if (!_this.manifestResponseUrl) throw new Error("Manifest response url is not defined");
				yield _this.initializeSegmentStorage();
				const segment = _this.identifySegment(segmentRuntimeId);
				_this.getStreamHybridLoader(segment).loadSegment(segment, callbacks);
			})();
		}
		/**
		* Aborts the loading of a segment specified by its runtime identifier.
		*
		* @param segmentRuntimeId - The runtime identifier of the segment whose loading is to be aborted.
		*/
		abortSegmentLoading(segmentRuntimeId) {
			var _this$mainStreamLoade2, _this$secondaryStream2;
			(_this$mainStreamLoade2 = this.mainStreamLoader) === null || _this$mainStreamLoade2 === void 0 || _this$mainStreamLoade2.abortSegmentRequest(segmentRuntimeId);
			(_this$secondaryStream2 = this.secondaryStreamLoader) === null || _this$secondaryStream2 === void 0 || _this$secondaryStream2.abortSegmentRequest(segmentRuntimeId);
		}
		/**
		* Updates the playback parameters while play head moves, specifically position and playback rate, for stream loaders.
		*
		* @param position - The new position in the stream, in seconds.
		* @param rate - The new playback rate.
		*/
		updatePlayback(position, rate) {
			var _this$mainStreamLoade3, _this$secondaryStream3;
			(_this$mainStreamLoade3 = this.mainStreamLoader) === null || _this$mainStreamLoade3 === void 0 || _this$mainStreamLoade3.updatePlayback(position, rate);
			(_this$secondaryStream3 = this.secondaryStreamLoader) === null || _this$secondaryStream3 === void 0 || _this$secondaryStream3.updatePlayback(position, rate);
		}
		/**
		* Sets the active level bitrate, used for adjusting quality levels in adaptive streaming.
		* Notifies the stream loaders if a change occurs.
		*
		* @param bitrate - The new bitrate to set as active.
		*/
		setActiveLevelBitrate(bitrate) {
			if (bitrate !== this.streamDetails.activeLevelBitrate) {
				var _this$mainStreamLoade4, _this$secondaryStream4;
				this.streamDetails.activeLevelBitrate = bitrate;
				(_this$mainStreamLoade4 = this.mainStreamLoader) === null || _this$mainStreamLoade4 === void 0 || _this$mainStreamLoade4.notifyLevelChanged();
				(_this$secondaryStream4 = this.secondaryStreamLoader) === null || _this$secondaryStream4 === void 0 || _this$secondaryStream4.notifyLevelChanged();
			}
		}
		/**
		* Updates the 'isLive' status of the stream
		*
		* @param isLive - Boolean indicating whether the stream is live.
		*/
		setIsLive(isLive) {
			this.streamDetails.isLive = isLive;
		}
		/**
		* Identify if a segment is loadable by the P2P core based on the segment's stream type and configuration.
		* @param segmentRuntimeId Segment runtime identifier to check.
		* @returns `true` if the segment is loadable by the P2P core, otherwise `false`.
		*/
		isSegmentLoadable(segmentRuntimeId) {
			try {
				const segment = this.identifySegment(segmentRuntimeId);
				if (segment.stream.type === "main" && this.mainStreamConfig.isP2PDisabled) return false;
				if (segment.stream.type === "secondary" && this.secondaryStreamConfig.isP2PDisabled) return false;
				return true;
			} catch (_unused) {
				return false;
			}
		}
		/**
		* Cleans up resources used by the Core instance, including destroying any active stream loaders
		* and clearing stored segments.
		*/
		destroy() {
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
		}
		initializeSegmentStorage() {
			var _this2 = this;
			return _asyncToGenerator(function* () {
				if (_this2.segmentStorage) return;
				const { isLive } = _this2.streamDetails;
				const createCustomStorage = _this2.commonCoreConfig.customSegmentStorageFactory;
				if (createCustomStorage && typeof createCustomStorage !== "function") throw new Error("Storage configuration is invalid");
				const segmentStorage = createCustomStorage ? createCustomStorage(isLive) : new SegmentMemoryStorage();
				yield segmentStorage.initialize(_this2.commonCoreConfig, _this2.mainStreamConfig, _this2.secondaryStreamConfig);
				segmentStorage.setSegmentChangeCallback((streamId) => {
					_this2.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
				});
				_this2.segmentStorage = segmentStorage;
			})();
		}
		identifySegment(segmentRuntimeId) {
			if (!this.manifestResponseUrl) throw new Error("Manifest response url is undefined");
			const segment = getSegmentFromStreamsMap(this.streams, segmentRuntimeId);
			if (!segment) throw new Error(`Not found segment with id: ${segmentRuntimeId}`);
			return segment;
		}
		overrideAllConfigs(dynamicConfig, mainStream, secondaryStream) {
			overrideConfig(this.commonCoreConfig, dynamicConfig);
			overrideConfig(this.mainStreamConfig, dynamicConfig);
			overrideConfig(this.secondaryStreamConfig, dynamicConfig);
			if (mainStream) overrideConfig(this.mainStreamConfig, mainStream);
			if (secondaryStream) overrideConfig(this.secondaryStreamConfig, secondaryStream);
		}
		destroyStreamLoader(streamType) {
			if (streamType === "main") {
				var _this$mainStreamLoade6;
				(_this$mainStreamLoade6 = this.mainStreamLoader) === null || _this$mainStreamLoade6 === void 0 || _this$mainStreamLoade6.destroy();
				this.mainStreamLoader = void 0;
			} else {
				var _this$secondaryStream6;
				(_this$secondaryStream6 = this.secondaryStreamLoader) === null || _this$secondaryStream6 === void 0 || _this$secondaryStream6.destroy();
				this.secondaryStreamLoader = void 0;
			}
		}
		getStreamHybridLoader(segment) {
			if (segment.stream.type === "main") {
				var _this$mainStreamLoade7;
				(_this$mainStreamLoade7 = this.mainStreamLoader) !== null && _this$mainStreamLoade7 !== void 0 || (this.mainStreamLoader = this.createNewHybridLoader(segment));
				return this.mainStreamLoader;
			} else {
				var _this$secondaryStream7;
				(_this$secondaryStream7 = this.secondaryStreamLoader) !== null && _this$secondaryStream7 !== void 0 || (this.secondaryStreamLoader = this.createNewHybridLoader(segment));
				return this.secondaryStreamLoader;
			}
		}
		createNewHybridLoader(segment) {
			if (!this.manifestResponseUrl) throw new Error("Manifest response url is not defined");
			if (!this.segmentStorage) throw new Error("Segment storage is not initialized");
			const streamConfig = segment.stream.type === "main" ? this.mainStreamConfig : this.secondaryStreamConfig;
			return new HybridLoader(this.manifestResponseUrl, segment, this.streamDetails, streamConfig, this.bandwidthCalculators, this.segmentStorage, this.webTorrentSocketPool, this.eventTarget);
		}
	};
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
	var FragmentLoaderBase = class {
		constructor(config, core) {
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
			_classPrivateFieldSet2(_createDefaultLoader, this, () => new config.loader(config));
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
		load(context, config, callbacks) {
			this.context = context;
			this.config = config;
			_classPrivateFieldSet2(_callbacks, this, callbacks);
			const { stats } = this;
			const { rangeStart: start, rangeEnd: end } = context;
			const byteRange = getByteRange(start, end !== void 0 ? end - 1 : void 0);
			_classPrivateFieldSet2(_segmentId, this, getSegmentRuntimeId(context.url, byteRange));
			const isSegmentDownloadableByP2PCore = _classPrivateFieldGet2(_core, this).isSegmentLoadable(_classPrivateFieldGet2(_segmentId, this));
			if (!_classPrivateFieldGet2(_core, this).hasSegment(_classPrivateFieldGet2(_segmentId, this)) || !isSegmentDownloadableByP2PCore) {
				_classPrivateFieldSet2(_defaultLoader$1, this, _classPrivateFieldGet2(_createDefaultLoader, this).call(this));
				_classPrivateFieldGet2(_defaultLoader$1, this).stats = this.stats;
				_classPrivateFieldGet2(_defaultLoader$1, this).load(context, config, callbacks);
				return;
			}
			const onSuccess = (response) => {
				_classPrivateFieldSet2(_response, this, response);
				const loadedBytes = _classPrivateFieldGet2(_response, this).data.byteLength;
				stats.loading = getLoadingStat(_classPrivateFieldGet2(_response, this).bandwidth, loadedBytes, performance.now());
				stats.total = loadedBytes;
				stats.loaded = loadedBytes;
				const engineData = _classPrivateFieldGet2(_response, this).data.slice(0);
				if (callbacks.onProgress) callbacks.onProgress(this.stats, context, engineData, void 0);
				callbacks.onSuccess({
					data: engineData,
					url: context.url
				}, this.stats, context, void 0);
			};
			const onError = (error) => {
				if (error instanceof CoreRequestError && error.type === "aborted" && this.stats.aborted) return;
				_assertClassBrand(_FragmentLoaderBase_brand, this, _handleError).call(this, error);
			};
			_classPrivateFieldGet2(_core, this).loadSegment(_classPrivateFieldGet2(_segmentId, this), {
				onSuccess,
				onError
			});
		}
		abort() {
			if (_classPrivateFieldGet2(_defaultLoader$1, this)) _classPrivateFieldGet2(_defaultLoader$1, this).abort();
			else {
				var _classPrivateFieldGet3, _classPrivateFieldGet4;
				_assertClassBrand(_FragmentLoaderBase_brand, this, _abortInternal).call(this);
				(_classPrivateFieldGet3 = _classPrivateFieldGet2(_callbacks, this)) === null || _classPrivateFieldGet3 === void 0 || (_classPrivateFieldGet4 = _classPrivateFieldGet3.onAbort) === null || _classPrivateFieldGet4 === void 0 || _classPrivateFieldGet4.call(_classPrivateFieldGet3, this.stats, this.context, {});
			}
		}
		destroy() {
			if (_classPrivateFieldGet2(_defaultLoader$1, this)) _classPrivateFieldGet2(_defaultLoader$1, this).destroy();
			else {
				if (!this.stats.aborted) _assertClassBrand(_FragmentLoaderBase_brand, this, _abortInternal).call(this);
				_classPrivateFieldSet2(_callbacks, this, null);
				this.config = null;
			}
		}
	};
	function _handleError(thrownError) {
		var _classPrivateFieldGet2$1;
		const error = {
			code: 0,
			text: ""
		};
		if (thrownError instanceof CoreRequestError && thrownError.type === "failed") error.text = thrownError.message;
		else if (thrownError instanceof Error) error.text = thrownError.message;
		(_classPrivateFieldGet2$1 = _classPrivateFieldGet2(_callbacks, this)) === null || _classPrivateFieldGet2$1 === void 0 || _classPrivateFieldGet2$1.onError(error, this.context, null, this.stats);
	}
	function _abortInternal() {
		if (!_classPrivateFieldGet2(_response, this) && _classPrivateFieldGet2(_segmentId, this)) {
			this.stats.aborted = true;
			_classPrivateFieldGet2(_core, this).abortSegmentLoading(_classPrivateFieldGet2(_segmentId, this));
		}
	}
	function getLoadingStat(targetBitrate, loadedBytes, loadingEndTime) {
		const timeForLoading = targetBitrate > 0 ? loadedBytes * 8e3 / targetBitrate : 0;
		const first = Math.max(0, loadingEndTime - timeForLoading);
		return {
			start: Math.max(0, first - DEFAULT_DOWNLOAD_LATENCY),
			first,
			end: loadingEndTime
		};
	}
	//#endregion
	//#region src/playlist-loader.ts
	var _defaultLoader = /* @__PURE__ */ new WeakMap();
	var PlaylistLoaderBase = class {
		constructor(config) {
			_classPrivateFieldInitSpec(this, _defaultLoader, void 0);
			_defineProperty(this, "context", void 0);
			_defineProperty(this, "stats", void 0);
			_classPrivateFieldSet2(_defaultLoader, this, new config.loader(config));
			this.stats = _classPrivateFieldGet2(_defaultLoader, this).stats;
			this.context = _classPrivateFieldGet2(_defaultLoader, this).context;
		}
		load(context, config, callbacks) {
			_classPrivateFieldGet2(_defaultLoader, this).load(context, config, callbacks);
		}
		abort() {
			_classPrivateFieldGet2(_defaultLoader, this).abort();
		}
		destroy() {
			_classPrivateFieldGet2(_defaultLoader, this).destroy();
		}
	};
	//#endregion
	//#region src/segment-manager.ts
	var SegmentManager = class {
		constructor(core) {
			_defineProperty(this, "core", void 0);
			this.core = core;
		}
		processMainManifest(data) {
			const { levels, audioTracks } = data;
			for (const level of levels) {
				const { url, bitrate, maxBitrate, videoCodec, width, height } = level;
				const b = maxBitrate !== null && maxBitrate !== void 0 ? maxBitrate : bitrate;
				const isMissingMetadata = b === 0;
				const frameRate = level.attrs["FRAME-RATE"];
				const videoRange = level.attrs["VIDEO-RANGE"];
				const index = generateStreamShortId({
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
					index
				});
			}
			for (const track of audioTracks) {
				const { url, audioCodec, lang, channels, name } = track;
				const index = generateStreamShortId({
					bitrate: 0,
					codecs: audioCodec,
					language: lang,
					channels,
					name
				});
				this.core.addStreamIfNoneExists({
					runtimeId: Array.isArray(url) ? url[0] : url,
					type: "secondary",
					index
				});
			}
		}
		updatePlaylist(data) {
			const { details: { url, fragments, live } } = data;
			const playlist = this.core.getStream(url);
			if (!playlist) return;
			const segmentToRemoveIds = new Set(playlist.segments.keys());
			const newSegments = [];
			fragments.forEach((fragment, index) => {
				const { url: responseUrl, byteRange: fragByteRange, sn, start: startTime, end: endTime } = fragment;
				const [start, end] = fragByteRange;
				const byteRange = getByteRange(start, end !== void 0 ? end - 1 : void 0);
				const runtimeId = getSegmentRuntimeId(responseUrl, byteRange);
				segmentToRemoveIds.delete(runtimeId);
				if (playlist.segments.has(runtimeId)) return;
				newSegments.push({
					runtimeId,
					url: responseUrl,
					externalId: live ? sn : index,
					byteRange,
					startTime,
					endTime
				});
			});
			if (!newSegments.length && !segmentToRemoveIds.size) return;
			this.core.updateStream(url, newSegments, segmentToRemoveIds.values());
		}
	};
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/objectWithoutPropertiesLoose.js
	function _objectWithoutPropertiesLoose(r, e) {
		if (null == r) return {};
		var t = {};
		for (var n in r) if ({}.hasOwnProperty.call(r, n)) {
			if (e.includes(n)) continue;
			t[n] = r[n];
		}
		return t;
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.129.0/helpers/objectWithoutProperties.js
	function _objectWithoutProperties(e, t) {
		if (null == e) return {};
		var o, r, i = _objectWithoutPropertiesLoose(e, t);
		if (Object.getOwnPropertySymbols) {
			var s = Object.getOwnPropertySymbols(e);
			for (r = 0; r < s.length; r++) o = s[r], t.includes(o) || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
		}
		return i;
	}
	//#endregion
	//#region src/engine-static.ts
	var _excluded = ["p2p"];
	function injectMixin(HlsJsClass) {
		var _p2pEngine;
		return _p2pEngine = /* @__PURE__ */ new WeakMap(), class HlsJsWithP2PClass extends HlsJsClass {
			get p2pEngine() {
				return _classPrivateFieldGet2(_p2pEngine, this);
			}
			constructor(...args) {
				var _p2p$onHlsJsCreated;
				const config = args[0];
				const _ref = config !== null && config !== void 0 ? config : {}, { p2p } = _ref, hlsJsConfig = _objectWithoutProperties(_ref, _excluded);
				const p2pEngine = new HlsJsP2PEngine(p2p);
				super(_objectSpread2(_objectSpread2({}, hlsJsConfig), p2pEngine.getConfigForHlsJs()));
				_classPrivateFieldInitSpec(this, _p2pEngine, void 0);
				p2pEngine.bindHls(this);
				_classPrivateFieldSet2(_p2pEngine, this, p2pEngine);
				p2p === null || p2p === void 0 || (_p2p$onHlsJsCreated = p2p.onHlsJsCreated) === null || _p2p$onHlsJsCreated === void 0 || _p2p$onHlsJsCreated.call(p2p, this);
			}
		};
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
	var HlsJsP2PEngine = class {
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
		static injectMixin(hls) {
			return injectMixin(hls);
		}
		/**
		* Constructs an instance of HlsJsP2PEngine.
		* @param config Optional configuration for P2P engine setup.
		*/
		constructor(config) {
			_defineProperty(this, "core", void 0);
			_defineProperty(this, "segmentManager", void 0);
			_defineProperty(this, "hlsInstanceGetter", void 0);
			_defineProperty(this, "currentHlsInstance", void 0);
			_defineProperty(this, "debug", (0, import_browser.debug)("p2pml-hlsjs:engine"));
			_defineProperty(this, "updateMediaElementEventHandlers", (type) => {
				var _this$currentHlsInsta;
				const media = (_this$currentHlsInsta = this.currentHlsInstance) === null || _this$currentHlsInsta === void 0 ? void 0 : _this$currentHlsInsta.media;
				if (!media) return;
				const method = type === "register" ? "addEventListener" : "removeEventListener";
				media[method]("timeupdate", this.handlePlaybackUpdate);
				media[method]("seeking", this.handlePlaybackUpdate);
				media[method]("ratechange", this.handlePlaybackUpdate);
			});
			_defineProperty(this, "handleManifestLoaded", (event, data) => {
				const networkDetails = data.networkDetails;
				if (networkDetails instanceof XMLHttpRequest) this.core.setManifestResponseUrl(networkDetails.responseURL);
				else if (networkDetails instanceof Response) this.core.setManifestResponseUrl(networkDetails.url);
				this.segmentManager.processMainManifest(data);
			});
			_defineProperty(this, "handleLevelSwitching", (event, data) => {
				if (data.bitrate) this.core.setActiveLevelBitrate(data.bitrate);
			});
			_defineProperty(this, "handleLevelUpdated", (event, data) => {
				if (this.currentHlsInstance && data.details.fragments[0].type === "main" && data.details.fragments.length > 4) {
					if (data.details.live && !this.currentHlsInstance.userConfig.liveSyncDuration && !this.currentHlsInstance.userConfig.liveSyncDurationCount) this.updateLiveSyncDurationCount(data);
					if (!this.currentHlsInstance.userConfig.maxBufferLength && !this.currentHlsInstance.userConfig.maxMaxBufferLength) this.updateMaxBufferLength(data.details.targetduration);
				}
				this.core.setIsLive(data.details.live);
				this.segmentManager.updatePlaylist(data);
			});
			_defineProperty(this, "handleMediaAttached", () => {
				this.updateMediaElementEventHandlers("register");
			});
			_defineProperty(this, "handleMediaDetached", () => {
				this.updateMediaElementEventHandlers("unregister");
			});
			_defineProperty(this, "handlePlaybackUpdate", (event) => {
				const media = event.target;
				this.core.updatePlayback(media.currentTime, media.playbackRate);
			});
			_defineProperty(this, "destroyCore", () => this.core.destroy());
			_defineProperty(
				this,
				/** Clean up and release all resources. Unregister all event handlers. */
				"destroy",
				() => {
					this.destroyCore();
					this.updateHlsEventsHandlers("unregister");
					this.updateMediaElementEventHandlers("unregister");
					this.currentHlsInstance = void 0;
				}
			);
			this.core = new Core(config === null || config === void 0 ? void 0 : config.core);
			this.segmentManager = new SegmentManager(this.core);
		}
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
		addEventListener(eventName, listener) {
			this.core.addEventListener(eventName, listener);
		}
		/**
		* Removes an event listener for the specified event.
		* @param eventName The name of the event.
		* @param listener The callback function that was previously added.
		*/
		removeEventListener(eventName, listener) {
			this.core.removeEventListener(eventName, listener);
		}
		/**
		* provides the Hls.js P2P specific configuration for Hls.js loaders.
		* @returns An object with fragment loader (fLoader) and playlist loader (pLoader).
		*/
		getConfigForHlsJs() {
			return {
				fLoader: this.createFragmentLoaderClass(),
				pLoader: this.createPlaylistLoaderClass()
			};
		}
		/**
		* Returns the configuration of the HLS.js P2P engine.
		* @returns A readonly version of the HlsJsP2PEngineConfig.
		*/
		getConfig() {
			return { core: this.core.getConfig() };
		}
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
		applyDynamicConfig(dynamicConfig) {
			if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
		}
		/**
		* Sets the HLS instance for handling media.
		* @param hls The HLS instance or a function that returns an HLS instance.
		*/
		bindHls(hls) {
			this.hlsInstanceGetter = typeof hls === "function" ? hls : () => hls;
		}
		initHlsEvents() {
			var _this$hlsInstanceGett;
			const hlsInstance = (_this$hlsInstanceGett = this.hlsInstanceGetter) === null || _this$hlsInstanceGett === void 0 ? void 0 : _this$hlsInstanceGett.call(this);
			if (this.currentHlsInstance === hlsInstance) return;
			if (this.currentHlsInstance) this.destroy();
			this.currentHlsInstance = hlsInstance;
			this.updateHlsEventsHandlers("register");
			this.updateMediaElementEventHandlers("register");
		}
		updateHlsEventsHandlers(type) {
			const hls = this.currentHlsInstance;
			if (!hls) return;
			const method = type === "register" ? "on" : "off";
			hls[method]("hlsManifestLoaded", this.handleManifestLoaded);
			hls[method]("hlsLevelSwitching", this.handleLevelSwitching);
			hls[method]("hlsLevelUpdated", this.handleLevelUpdated);
			hls[method]("hlsAudioTrackLoaded", this.handleLevelUpdated);
			hls[method]("hlsDestroying", this.destroy);
			hls[method]("hlsMediaAttaching", this.destroyCore);
			hls[method]("hlsManifestLoading", this.destroyCore);
			hls[method]("hlsMediaDetached", this.handleMediaDetached);
			hls[method]("hlsMediaAttached", this.handleMediaAttached);
		}
		updateLiveSyncDurationCount(data) {
			const fragmentDuration = data.details.targetduration;
			const maxLiveSyncCount = Math.floor(MAX_LIVE_SYNC_DURATION / fragmentDuration);
			const newLiveSyncDurationCount = Math.min(data.details.fragments.length - 1, maxLiveSyncCount);
			if (this.currentHlsInstance && this.currentHlsInstance.config.liveSyncDurationCount !== newLiveSyncDurationCount) {
				this.debug(`Setting liveSyncDurationCount to ${newLiveSyncDurationCount}`);
				this.currentHlsInstance.config.liveSyncDurationCount = newLiveSyncDurationCount;
			}
		}
		updateMaxBufferLength(fragmentDuration) {
			if (!this.currentHlsInstance) return;
			const config = this.core.getConfig();
			const highDemandTimeWindow = Math.max(config.mainStream.highDemandTimeWindow, config.secondaryStream.highDemandTimeWindow);
			const p2pOptimalBufferLength = Math.max(fragmentDuration * 2, highDemandTimeWindow);
			if (this.currentHlsInstance.config.maxBufferLength > p2pOptimalBufferLength) {
				this.debug(`Setting maxBufferLength to ${p2pOptimalBufferLength}`);
				this.currentHlsInstance.config.maxBufferLength = p2pOptimalBufferLength;
			}
			if (this.currentHlsInstance.config.maxMaxBufferLength > p2pOptimalBufferLength) {
				this.debug(`Setting maxMaxBufferLength to ${p2pOptimalBufferLength}`);
				this.currentHlsInstance.config.maxMaxBufferLength = p2pOptimalBufferLength;
			}
		}
		createFragmentLoaderClass() {
			const { core } = this;
			const engine = this;
			return class FragmentLoader extends FragmentLoaderBase {
				constructor(config) {
					super(config, core);
				}
				static getEngine() {
					return engine;
				}
			};
		}
		createPlaylistLoaderClass() {
			const engine = this;
			return class PlaylistLoader extends PlaylistLoaderBase {
				constructor(config) {
					super(config);
					engine.initHlsEvents();
				}
			};
		}
	};
	//#endregion
	exports.Core = Core;
	exports.HlsJsP2PEngine = HlsJsP2PEngine;
	return exports;
})({});

//# sourceMappingURL=p2p-media-loader-hlsjs.iife.js.map