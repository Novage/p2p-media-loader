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

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/indent */
/* eslint-disable @typescript-eslint/no-empty-interface */

namespace shaka {
    namespace polyfill {
        function installAll(): void;
        function register(polyfill: () => void, priority?: number): void;

        class polyfill_install {
            static install(): void;
        }

        class Fullscreen extends polyfill_install { }
        class IndexedDB extends polyfill_install { }
        class InputEvent extends polyfill_install { }
        class MathRound extends polyfill_install { }
        class MediaSource extends polyfill_install { }
        class VideoPlaybackQuality extends polyfill_install { }
        class VideoPlayPromise extends polyfill_install { }
        class VTTCue extends polyfill_install { }

        class PatchedMediaKeysMs extends polyfill_install {
            static setMediaKeys(mediaKeys: MediaKeys): void;
            static requestMediaKeySystemAccess(
                keySystem: string,
                supportedConfigurations: MediaKeySystemConfiguration[]
            ): Promise<MediaKeySystemAccess>;
        }

        class PatchedMediaKeysNop extends polyfill_install {
            static setMediaKeys(mediaKeys: MediaKeys): void;
            static requestMediaKeySystemAccess(
                keySystem: string,
                supportedConfigurations: MediaKeySystemConfiguration[]
            ): Promise<MediaKeySystemAccess>;
        }

        class PatchedMediaKeysWebkit extends polyfill_install {
            static setMediaKeys(mediaKeys: MediaKeys): void;
            static requestMediaKeySystemAccess(
                keySystem: string,
                supportedConfigurations: MediaKeySystemConfiguration[]
            ): Promise<MediaKeySystemAccess>;
        }
    }

    interface EventMap {
        "abrstatuschanged": Player.AbrStatusChangedEvent,
        "adaptation": Player.AdaptationEvent,
        "buffering": Player.BufferingEvent,
        "drmsessionupdate": Player.DrmSessionUpdateEvent,
        "emsg": Player.EmsgEvent,
        "error": Player.ErrorEvent,
        "expirationupdated": Player.ExpirationUpdatedEvent,
        "largegap": Player.LargeGapEvent,
        "loading": Player.LoadingEvent,
        "manifestparsed": Player.ManifestParsedEvent,
        "onstatechange": Player.StateChangeEvent,
        "onstateidle": Player.StateIdleEvent,
        "streaming": Player.StreamingEvent,
        "textchanged": Player.TextChangedEvent,
        "texttrackvisibility": Player.TextTrackVisibilityEvent,
        "timelineregionadded": Player.TimelineRegionAddedEvent,
        "timelineregionenter": Player.TimelineRegionEnterEvent,
        "timelineregionexit": Player.TimelineRegionExitEvent,
        "trackschanged": Player.TracksChangedEvent,
        "unloading": Player.UnloadingEvent,
        "variantchanged": Player.VariantChangedEvent,
    }

    class Player extends util.FakeEventTarget implements util.IDestroyable {
        /**
         * Construct a Player
         *
         * @param mediaElem When provided, the player will attach to
         *                  `mediaElement`, similar to calling
         *                  `attach`. When not provided, the player
         *                   will remain detached.
         * @param dependencyInjector Optional callback which is
         *                           called to inject mocks into the
         *                           Player. Used for testing.
         */

        constructor(mediaElem?: HTMLMediaElement, dependencyInjector?: (arg1: Player) => void);

        static version: string;

        /**
         * Return whether the browser provides basic support. If this returns false,
         * Shaka Player cannot be used at all. In this case, do not construct a Player
         * instance and do not use the library.
         */

        static isBrowserSupported(): boolean;

        /**
         * Probes the browser to determine what features are supported.
         * This makes a number of requests to EME/MSE/etc which may
         * result in user prompts. This should only be used for
         * diagnostics.
         *
         * NOTE: This may show a request to the user for permission.
         */

        static probSupport(): Promise<extern.SupportType>;

        /**
         * Registers a plugin callback that will be called with support().
         * The callback will return the value that will be stored in the
         * return value from support().
         */

        static registerSupportPlugin(name: string, callback: () => void): void;

        /**
         * Add an event listener to this object.
         *
         * @param type The event type to listen for.
         * @param listener The callback or listener object to invoke.
         * @param options Ignored.
         */
        addEventListener<K extends keyof EventMap>(
            type: K,
            listener: (event: EventMap[K]) => boolean | void | undefined,
            options?: AddEventListenerOptions): void;

        // eslint-disable-next-line no-dupe-class-members
        addEventListener(
            type: string,
            listener: util.FakeEventTarget.ListenerType,
            options?: AddEventListenerOptions
        ): void;

        /**
         * Adds the given text track to the loaded manifest. load() must resolve before calling.
         * The presentation must have a duration. This returns the created track, which can immediately be selected by the application.
         * The track will not be automatically selected.
         *
         * @param uri
         * @param language
         * @param kind
         * @param mime
         * @param codec
         * @param label
         */

        addTextTrack(
            uri: string,
            language: string,
            kind: string,
            mime: string,
            codec?: string,
            label?: string
        ): extern.Track;

        /**
         * Tell the player to use |mediaElement| for all |load| requests
         * until |detach| or |destroy| are called. Calling |attach| with
         * |initializedMediaSource=true| will tell the player to take
         * the initial load step and initialize media source.
         *
         * Calls to |attach| will interrupt any in-progress calls to
         * |load| but cannot interrupt calls to |attach|, |detach|, or
         * `unload`.
         *
         * @param mediaElem
         * @param initializeMediaSource
         */

        attach(mediaElem: HTMLMediaElement, initializeMediaSource?: boolean): Promise<unknown>;

        /**
         * Cancel trick-play. If the player has not loaded content or is
         * still loading content this will be a no-op.
         */

        cancelTrickPlay(): void;

        /**
         * Configure the Player instance. The config object passed in need
         * not be complete. It will be merged with the existing Player
         * configuration. Config keys and types will be checked. If any
         * problems with the config object are found, errors will be
         * reported through logs and this returns false. If there are
         * errors, valid config objects are still set.
         *
         * @returns `true` if the passed config object was valid, `false`
         *          if there were invalid entries.
         */

        configure(config: extern.PlayerConfiguration | string): boolean;

        /**
         * After destruction, a Player object cannot be
         * used again.
         */

        destroy(): Promise<unknown>;

        /**
         * Tell the player to stop using its current media element.
         * If the player is:
         *  - detached, this will do nothing,
         *  - attached, this will release the media element,
         *  - loading, this will abort loading, unload, and release
         *    the media element,
         *  - playing content, this will stop playback, unload, and
         *    release the media element.
         *
         * Calls to `detach` will interrupt any in-progress calls
         * to `load` but cannot interrupt calls to `attach`,
         * `detach`, or `unload`.
         */

        detach(): Promise<unknown>;

        /**
         * Get the drm info used to initialize EME. If EME is
         * not being used, this will return `null`. If the
         * player is idle or has not initialized EME yet, this
         * will return `null`.
         */

        drmInfo(): extern.DrmInfo | null;

        /**
         * Get the uri to the asset that the player has loaded.
         * If the player has not loaded content, this will
         * return `null`.
         */

        getAssetUri(): string | null;

        // In older versions
        getManifestUri(): string | null;

        /**
         * Return a list of audio languages available for the
         * current period. If the player has not loaded any
         * content, this will return an empty list.
         */

        getAudioLanguages(): string[];

        /**
         * Return a list of audio language-role combinations
         * available for the current period. If the player
         * has not loaded any content, this will return an
         * empty list.
         */

        getAudioLanguagesAndRoles(): extern.LanguageRole[];

        /**
         * Get information about what the player has buffered. If
         * the player has not loaded content or is currently
         * loading content, the buffered content will be empty.
         */

        getBufferedInfo(): extern.BufferedInfo;

        /**
         * Return a copy of the current configuration. Modifications
         * of the returned value will not affect the Player"s active
         * configuration. You must call player.configure() to make
         * changes.
         */

        getConfiguration(): extern.PlayerConfiguration;

        /**
         * Get the next known expiration time for any EME session.
         * If the session never expires, this will return `Infinity`.
         * If there are no EME sessions, this will return `Infinity`.
         * If the player has not loaded content, this will
         * return `Infinity`.
         */

        getExpiration(): number;

        /** Get the current load mode. */

        getLoadMode(): Player.LoadMode;

        /**
         * Get the manifest that the player has loaded. If the player
         * has not loaded any content, this will return `null`.
         */

        getManifest(): extern.Manifest | null;

        /**
         * Get the type of manifest parser that the player is using.
         * If the player has not loaded any content, this will
         * return `null`.
         */

        getManifestParserFactory(): extern.ManifestParser.Factory | null;

        /** @deprecated */
        getManifestUri(): string | null;

        /**
         * Get the media element that the player is currently using
         * to play loaded content. If the player has not loaded
         * content, this will return `null`.
         */

        getMediaElement(): HTMLMediaElement;

        /**
         * @returns A reference to the Player"s networking engine.
         *          Applications may use this to make requests
         *          through Shaka"s networking plugins.
         */

        getNetworkingEngine(): net.NetworkingEngine;

        /**
         * Get the playback rate of what is playing right now.
         * If we are using trick play, this will return the
         * trick play rate. If no content is playing, this
         * will return 0. If content is buffering, this will
         * return 0. If the player has not loaded content, this
         * will return a playback rate of `0`.
         */

        getPlaybackRate(): number;

        /**
         * Get the current playhead position as a date. This
         * should only be called when the player has loaded
         * a live stream. If the player has not loaded a live
         * stream, this will return `null`.
         */

        getPlayheadTimeAsTime(): Date | null;

        /**
         * Get the presentation start time as a date. This
         * should only be called when the player has loaded
         * a live stream. If the player has not loaded a
         * live stream, this will return `null`.
         */

        getPresentationStartTimeAsDate(): Date | null;

        /**
         * Get statistics for the current playback session.
         * If the player is not playing content, this will
         * return an empty stats object.
         */

        getStats(): extern.Stats;

        /**
         * Return a list of text languages available for the
         * current period. If the player has not loaded any
         * content, this will return an empty list.
         */

        getTextLanguages(): string[] | null;

        /**
         * Return a list of text language-role combinations
         * available for the current period. If the player
         * has not loaded any content, this will be return
         * an empty list.
         */

        getTextLanguagesAndRoles(): extern.LanguageRole[];

        /**
         * Return a list of text tracks that can be switched
         * to in the current period. If there are multiple
         * periods, you must seek to a period in order to get
         * text tracks from that period. If the player has
         * not loaded content, this will return an empty list.
         */

        getTextTracks(): extern.Track[];

        /**
         * Return a list of variant tracks that can be
         * switched to in the current period. If there
         * are multiple periods, you must seek to the
         * period in order to get variants from that
         * period. If the player has not loaded content,
         * this will return an empty list.
         */

        getVariantTracks(): extern.Track[];

        /**
         * Check if the manifest contains only audio-only
         * content. If the player has not loaded content,
         * this will return `false`. The player does not
         * support content that contain more than one type
         * of variants (i.e. mixing audio-only, video-only,
         * audio-video). Content will be filtered to only
         * contain one type of variant.
         */

        isAudioOnly(): boolean;

        /**
         * Check if the player is currently in a buffering
         * state (has too little content to play smoothly).
         * If the player has not loaded content, this will
         * return `false`.
         */

        isBuffering(): boolean;

        /**
         * Get if the player is playing in-progress content.
         * If the player has not loaded content, this will
         * return `false`.
         */

        isInProgress(): boolean;

        /**
         * Get if the player is playing live content. If the player
         * has not loaded content, this will return `false`.
         */

        isLive(): boolean;

        /** Check if the text displayer is enabled. */

        isTextTrackVisible(): boolean;

        /**
         * Get the key system currently used by EME. If EME is not
         * being used, this will return an empty string. If the
         * player has not loaded content, this will return an
         * empty string.
         */

        keySystem(): string;

        /**
         * Tell the player to load the content at `assetUri` and start
         * playback at `startTime`. Before calling `load`, a call to
         * `attach` must have succeeded. Calls to `load` will interrupt
         * any in-progress calls to `load` but cannot interrupt calls
         * to `attach`, `detach`, or `unload`.
         *
         * @param assetUri
         * @param startTime When `startTime` is `null` or `undefined`,
         *                  playback will start at the default start
         *                  time (startTime=0 for VOD and
         *                  startTime=liveEdge for LIVE).
         * @param mimeType
         */

        load(
            assetUri: string,
            startTime?: number | null,
            mimeType?: string | extern.ManifestParser.Factory
        ): Promise<unknown>;

        /** Reset configuration to default.*/

        resetConfiguration(): void;

        /**
         * Retry streaming after a streaming failure has occurred.
         * When the player has not loaded content or is loading
         * content, this will be a no-op and will return `false`.
         * If the player has loaded content, and streaming has
         * not seen an error, this will return `false`. If the
         * player has loaded content, and streaming seen an error,
         * but the could not resume streaming, this will return
         * `false`.
         */

        retryStreaming(): boolean;

        /**
         * Get the range of time (in seconds) that seeking is allowed.
         * If the player has not loaded content, this will return a
         * range from 0 to 0.
         */

        seekRange(): { start: number; end: number };

        /**
         * Sets currentAudioLanguage and currentVariantRole to the
         * selected language and role, and chooses a new variant
         * if need be. If the player has not loaded any content,
         * this will be a no-op.
         */

        selectAudioLanguage(language: string, role?: string): void;

        /** @deprecated */
        selectEmbeddedTextTrack(): void;

        /**
         * Sets currentTextLanguage and currentTextRole to the
         * selected language and role, and chooses a new variant
         * if need be. If the player has not loaded any content,
         * this will be a no-op.
         */

        selectTextLanguage(language: string, role?: string): void;

        /**
         * Select a specific text track from the current period.
         * `track` should come from a call to `getTextTracks`.
         * If the track is not found in the current period, this
         * will be a no-op. If the player has not loaded content,
         * this will be a no-op. Note that AdaptationEvents are
         * not fired for manual track selections.
         */

        selectTextTrack(track: extern.Track): void;

        /**
         * Select variant tracks that have a given label. This assumes
         * the label uniquely identifies an audio stream, so all the
         * variants are expected to have the same variant.audio.
         */

        selectVariantsByLabel(label: string): void;

        /**
         * Select a specific variant track to play from the current
         * period. `track` should come from a call to
         * `getVariantTracks`. If `track` cannot be found in the
         * current variant, this will be a no-op. If the player has
         * not loaded content, this will be a no-op. Changing
         * variants will take effect once the currently buffered
         * content has been played. To force the change to happen
         * sooner, use `clearBuffer` with `safeMargin`. Setting
         * `clearBuffer` to `true` will clear all buffered content
         * after `safeMargin`, allowing the new variant to start
         * playing sooner. Note that AdaptationEvents are not fired
         * for manual track selections.
         *
         * @param track
         * @param clearBuffer
         * @param safeMargin Optional amount of buffer (in seconds)
         *                   to retain when clearing the buffer.
         *                   Useful for switching variant quickly
         *                   without causing a buffering event.
         *                   Defaults to 0 if not provided. Ignored
         *                   if clearBuffer is false. Can cause
         *                   hiccups on some browsers if chosen too
         *                   small, e.g. The amount of two segments
         *                   is a fair minimum to consider as
         *                   safeMargin value.
         */

        selectVariantTrack(track: extern.Track, clearBuffer?: boolean, safeMargin?: number): void;

        /**
         * Set the maximum resolution that the platform"s hardware
         * can handle. This will be called automatically by
         * shaka.cast.CastReceiver to enforce limitations of the
         * Chromecast hardware.
         */

        setMaxHardwareResolution(width: number, height: number): void;

        /**
         * Enable or disable the text displayer. If the player
         * is in an unloaded state, the request will be applied
         * next time content is loaded.
         */

        setTextTrackVisibility(on: boolean): void;

        /**
         * Enable trick play to skip through content without
         * playing by repeatedly seeking. For example, a rate
         * of 2.5 would result in 2.5 seconds of content
         * being skipped every second. A negative rate will
         * result in moving backwards. If the player has not
         * loaded content or is still loading content this
         * will be a no-op. Wait until |load| has completed
         * before calling. Trick play will be canceled
         * automatically if the playhead hits the beginning
         * or end of the seekable range for the content.
         */

        trickPlay(rate: number): void;

        /**
         * Tell the player to either return to:
         *  - detached (when it does not have a media element),
         *  - attached (when it has a media element and
         *      `initializedMediaSource=false`)
         *  - media source initialized (when it has a media
         *      element and `initializedMediaSource=true`)
         *
         * Calls to `unload` will interrupt any in-progress
         * calls to `load` but cannot interrupt calls to
         * `attach`, `detach`, or `unload`.
         */
        unload(reinitializeMediaSource?: boolean): Promise<unknown>;

        /** @deprecated */
        usingEmbeddedTextTrack(): boolean;

        setVideoContainer(container: HTMLElement): void;

        getPlayheadTimeAsDate(): Date | null;
    }

    namespace Player {
        /**
         * In order to know what method of loading the player used
         * for some content, we have this enum. It lets us know
         * if content has not been loaded, loaded with media source,
         * or loaded with src equals. This enum has a low resolution,
         * because it is only meant to express the outer limits of
         * the various states that the player is in. For example,
         * when someone calls a public method on player, it should
         * not matter if they have initialized drm engine, it should
         * only matter if they finished loading content.
         */

        enum LoadMode {
            DESTROYED = 0,
            NOT_LOADED = 1,
            MEDIA_SOURCE = 2,
            SRC_EQUALS = 3,
        }

        /**
         * Fired when the state of abr has been
         * changed. (Enabled or disabled).
         */
        interface AbrStatusChangedEvent extends Event {
            type: "abrstatuschanged";
            newStatus: boolean;
        }

        /**
         * Fired when an automatic adaptation causes
         * the active tracks to change. Does not
         * fire when the application calls
         * selectVariantTrack() selectTextTrack(),
         * selectAudioLanguage() or selectTextLanguage().
         */

        interface AdaptationEvent extends Event {
            type: "adaptation";
        }

        /**
         * Fired when the player"s buffering state changes.
         */

        interface BufferingEvent extends Event {
            type: "buffering";
            /**
             * True when the Player enters the
             * buffering state. False when the
             * Player leaves the buffering state.
             */
            buffering: boolean;
        }

        interface DrmSessionUpdateEvent extends CustomEvent<void> {
            type: "drmsessionupdate";
        }

        interface EmsgEvent extends CustomEvent<extern.EmsgInfo> {
            type: "emsg";
            detail: extern.EmsgInfo;
        }

        interface ErrorEvent extends CustomEvent<util.Error> {
            type: "error";
        }

        /**
         * Fired when there is a change in the
         * expiration times of an EME session.
         */

        interface ExpirationUpdatedEvent extends Event {
            type: "expirationupdated";
        }

        /**
         * Fired when the playhead enters a large gap.
         * If |config.streaming.jumpLargeGaps| is set,
         * the default action of this event is to jump
         * the gap; this can be prevented by calling
         * preventDefault() on the event object.
         */
        interface LargeGapEvent {
            type: "largegap";
            /** The current time of the playhead. */
            currentTime: number;
            /** The size of the gap, in seconds. */
            gapSize: number;
        }

        /**
         * Fired when the player begins loading.
         * The start of loading is defined as
         * when the user has communicated intent
         * to load content (i.e. Player.load has
         * been called).
         */

        interface LoadingEvent extends Event {
            type: "loading";
        }

        interface ManifestParsedEvent extends Event {
            type: "manifestparsed";
        }

        /** Fired when the player changes load states. */

        interface StateChangeEvent extends Event {
            type: "onstatechange";
            state: string;
        }

        /**
         * Fired when the player has stopped changing
         * states and will remain idle until a new
         * state change request (e.g. load, attach,
         * etc.) is made.
         */

        interface StateIdleEvent extends Event {
            type: "onstateidle";
            state: string;
        }

        /**
         * Fired after the manifest has been parsed
         * and track information is available, but
         * before streams have been chosen and
         * before any segments have been fetched.
         * You may use this event to configure the
         * player based on information found in the
         * manifest.
         */

        interface StreamingEvent extends Event {
            type: "streaming";
        }

        /**
         * Fired when a call from the application
         * caused a text stream change. Can be
         * triggered by calls to selectTextTrack()
         * or selectTextLanguage().
         */

        interface TextChangedEvent extends Event {
            type: "textchanged";
        }

        /** Fired when text track visibility changes. */

        interface TextTrackVisibilityEvent extends Event {
            type: "texttrackvisibility";
        }

        /** Fired when a media timeline region is added. */

        interface TimelineRegionAddedEvent extends CustomEvent<extern.TimelineRegionInfo> {
            type: "timelineregionadded";
        }

        /** Fired when the playhead enters a timeline region. */

        interface TimelineRegionEnterEvent extends CustomEvent<extern.TimelineRegionInfo> {
            type: "timelineregionenter";
        }

        /** Fired when the playhead exits a timeline region. */

        interface TimelineRegionExitEvent extends CustomEvent<extern.TimelineRegionInfo> {
            type: "timelineregionexit";
        }

        /**
         * Fired when the list of tracks changes.
         * For example, this will happen when
         * changing periods or when track
         * restrictions change.
         */

        interface TracksChangedEvent extends Event {
            type: "trackschanged";
        }

        /**
         * Fired when the player unloads or fails
         * to load. Used by the Cast receiver to
         * determine idle state.
         */

        interface UnloadingEvent extends Event {
            type: "unloading";
        }

        /**
         * Fired when a call from the application
         * caused a variant change. Can be
         * triggered by calls to selectVariantTrack()
         * or selectAudioLanguage(). Does not
         * fire when an automatic adaptation
         * causes a variant change.
         */

        interface VariantChangedEvent extends Event {
            type: "variantchanged";
        }
    }

    namespace log {
        function setLevel(level: Level): void;

        enum Level {
            NONE = 0,
            ERROR = 1,
            WARNING = 2,
            INFO = 3,
            DEBUG = 4,
            V1 = 5,
            V2 = 6,
        }
    }

    namespace net {
        namespace NetworkingEngine {
            // @see: https://shaka-player-demo.appspot.com/docs/api/shaka.net.NetworkingEngine.html#.RequestType
            enum RequestType {
                MANIFEST = 0,
                SEGMENT = 1,
                LICENSE = 2,
                APP = 3,
                TIMING = 4,
            }

            enum PluginPriority {
                FALLBACK = 1,
                PREFERRED = 2,
                APPLICATION = 3,
            }

            /** Fired when the networking engine receives a recoverable error and retries. */
            interface RetryEvent extends Event {
                type: "retry";
                /** The error that caused the retry. If it was a non-Shaka error, this is set to null. */
                error: util.Error | null;
            }

            /**
             * A wrapper class for the number of bytes remaining to be downloaded for the
             * request.
             * Instead of using PendingRequest directly, this class is needed to be sent to
             * plugin as a parameter, and a Promise is returned, before PendingRequest is
             * created.
             */

            class NumBytesRemainingClass {
                setBytes(bytesToLoad: number): void;
                getBytes(): number;
            }

            /**
             * @param promise	A Promise which represents the underlying operation. It is
             *                resolved when the operation is complete, and rejected if
             *                the operation fails or is aborted. Aborted operations should
             *                be rejected with a `shaka.util.Error` object using the error
             *                code `OPERATION_ABORTED`.
             * @param onAbort	Will be called by this object to abort the underlying
             *                operation. This is not cancelation, and will not necessarily
             *                result in any work being undone. abort() should return a
             *                Promise which is resolved when the underlying operation has
             *                been aborted. The returned Promise should never be rejected.
             */

            class PendingRequest<T = extern.Response>
                extends util.AbortableOperation<T>
                implements extern.IAbortableOperation<T> {
                promise: Promise<T>;
                constructor(
                    promise: Promise<T>,
                    onAbort: ConstructorParameters<typeof util.AbortableOperation>["1"],
                    numBytesRemainingObj: NetworkingEngine.NumBytesRemainingClass
                );
                abort(): ReturnType<util.AbortableOperation<T>["abort"]>;
                chain<U>(
                    onSuccess: Parameters<util.AbortableOperation<T>["chain"]>[0],
                    onError?: Parameters<util.AbortableOperation<T>["chain"]>[1]
                ): util.AbortableOperation<U>;
                finally(): util.AbortableOperation<T>;
            }
        }

        class NetworkingEngine extends util.FakeEventTarget implements util.IDestroyable {
            constructor(onProgressUpdated?: (duration: number, transferredByteAmount: number) => void);

            /** Gets a copy of the default retry parameters. */
            static defaultRetryParameters(): extern.RetryParameters;

            /** Makes a simple network request for the given URIs */
            static makeRequest(uris: Array<string>, retryParams: extern.RetryParameters): extern.Request;

            /**
             * Registers a scheme plugin. This plugin will handle all requests
             * with the given scheme. If a plugin with the same scheme already
             * exists, it is replaced, unless the existing plugin is of higher
             * priority. If no priority is provided, this defaults to the
             * highest priority of APPLICATION.
             */

            static registerScheme(scheme: string, plugin: extern.SchemePlugin, priority?: number): void;

            /** Removes a scheme plugin. */
            static unregisterScheme(scheme: string): void;

            /** Clears all request filters. */
            clearAllRequestFilters(): void;

            /** Clears all response filters. */
            clearAllResponseFilters(): void;

            /**
             * Registers a new request filter. All filters are applied in the
             * order they are registered.
             */

            registerRequestFilter(filter: extern.RequestFilter): void;

            /**
             * Registers a new response filter. All filters are applied in the
             * order they are registered.
             */

            registerResponseFilter(filter: extern.ResponseFilter): void;

            /** Makes a network request and returns the resulting data. */
            request(
                type: net.NetworkingEngine.RequestType,
                request: extern.Request
            ): net.NetworkingEngine.PendingRequest;

            /** Removes a request filter. */
            unregisterRequestFilter(filter: extern.RequestFilter): void;

            /** Removes a response filter. */
            unregisterResponseFilter(filter: extern.ResponseFilter): void;

            destroy(): Promise<unknown>;
        }


        declare const HttpXHRPlugin: {
            static parse: (uri: string, request: extern.Request, requestType: net.NetworkingEngine.RequestType, progressUpdated?: shaka.extern.ProgressUpdated) => util.AbortableOperation.<shaka.extern.Response>
        } | {
            (uri: string, request: extern.Request, requestType: net.NetworkingEngine.RequestType, progressUpdated?: shaka.extern.ProgressUpdated): util.AbortableOperation.<shaka.extern.Response>;
            static parse: undefined;
        };
    }

    namespace media {
        class initSegmentReference {
            constructor(uris: () => string[], startByte: number, endByte: number | null);
            createUris(): string[];
            getEndByte(): number | undefined | null;
            getStartByte(): number;
        }

        class SegmentReference {
            constructor(
                position: number,
                startTime: number,
                endTime: number,
                uris: () => string[],
                startByte: number,
                endByte: number | null
            );
            createUris(): string[];
            getEndByte(): number | undefined | null;
            getStartByte(): number;
            getEndTime(): number;
            getPosition(): number;
            getStartTime(): number;
        }

        class PresentationTimeline {
            constructor(presentationStartTime: number | null, presentationDelay: number);
            getDuration(): number;
            getPresentationStartTime(): number | null;
            getSafeSeekRangeStart(offset: number): number;
            getSeekRangeEnd(): number;
            getSeekRangeStart(): number;
            getSegmentAvailabilityEnd(): number;
            getSegmentAvailabilityStart(): number;
            isInprogress(): boolean;
            isLive(): boolean;
            notifyMaxSegmentDuration(maxSegmentDuration: number): void;
            notifySegments(references: SegmentReference[], isFirstPeriod: boolean): void;
            setClockOffset(offset: number): void;
            setDelay(delay: number): void;
            setDuration(duration: number): void;
            setSegmentAvailabilityDuration(SegmentAvailabilityDuration: number): void;
            setStatic(isStatic: boolean): void;
            setUserSeekStart(time: boolean): void;
        }

        class ManifestParser {
            static registerParserByExtension(extension: string, parserFactory: unknown);
            static registerParserByMime(mimeType: string, parserFactory: unknown);
        }

        class SegmentIndex {
            constructor(references: SegmentReference[]);
            destroy(): Promise<void>;
            release(): void;
            markImmutable(): void;
            find(time: number): number | null;
            get(position: number): SegmentReference | null;
            offset(number): void;
            merge(references: SegmentReference[]);
        }
    }

    namespace text {
        namespace Cue {
            enum displayAlign {
                BEFORE = "before",
                CENTER = "center",
                AFTER = "after",
            }

            enum fontStyle {
                NORMAL = "normal",
                ITALIC = "italic",
                OBLIQUE = "oblique",
            }

            enum fontWeight {
                NORMAL = 400,
                BOLD = 700,
            }

            enum lineAlign {
                CENTER = "center",
                START = "start",
                END = "end",
            }

            enum lineInterpretation {
                LINE_NUMBER = 0,
                PERCENTAGE = 1,
            }

            enum positionAlign {
                LEFT = "line-left",
                RIGHT = "line-right",
                CENTER = "center",
                AUTO = "auto",
            }

            enum textAlign {
                LEFT = "left",
                RIGHT = "right",
                CENTER = "center",
                START = "start",
                END = "end",
            }

            enum textDecoration {
                UNDERLINE = "underline",
                LINE_THROUGH = "lineThrough",
                OVERLINE = "overline",
            }

            enum writingDirection {
                HORIZONTAL_LEFT_TO_RIGHT = 0,
                HORIZONTAL_RIGHT_TO_LEFT = 1,
                VERTICAL_LEFT_TO_RIGHT = 2,
                VERTICAL_RIGHT_TO_LEFT = 3,
            }
        }

        class Cue {
            constructor(startTime: number, endTime: number, payload: string);
            public backgroundColor: string;
            public color: string;
            public displayAlign: Cue.displayAlign;
            public endTime: number;
            public fontFamily: string;
            public fontSize: string;
            public fontStyle: Cue.fontStyle;
            public fontWeight: Cue.fontWeight;
            public id: string;
            public line: number;
            public lineAlign: Cue.lineAlign;
            public lineHeight: string;
            public lineInterpretation: Cue.lineInterpretation;
            public payload: string;
            public position: number | null;
            public positionAlign: Cue.positionAlign;
            public region: extern.CueRegion;
            public size: number;
            public startTime: number;
            public textAlign: Cue.textAlign;
            public textDecoration: Cue.textDecoration[];
            public wrapLine: boolean;
            public writingDirection: Cue.writingDirection;
        }

        namespace CueRegion {
            enum scrollMode {
                NONE,
                UP = "up",
            }

            enum units {
                PX = 0,
                PERCENTAGE = 1,
                LINES = 2,
            }
        }

        class CueRegion {
            height: number;
            heightUnits: CueRegion.units;
            id: string;
            regionAnchorX: number;
            regionAnchorY: number;
            scroll: text.CueRegion.scrollMode;
            viewportAnchorUnits: text.CueRegion.units;
            viewportAnchorX: number;
            viewportAnchorY: number;
            width: number;
            widthUnits: text.CueRegion.units;
        }
    }

    namespace util {
        /**
         * @param promise
         *   A Promise which represents the underlying operation.  It is resolved when
         *   the operation is complete, and rejected if the operation fails or is
         *   aborted.  Aborted operations should be rejected with a shaka.util.Error
         *   object using the error code OPERATION_ABORTED.
         * @param onAbort
         *   Will be called by this object to abort the underlying operation.
         *   This is not cancelation, and will not necessarily result in any work
         *   being undone.  abort() should return a Promise which is resolved when the
         *   underlying operation has been aborted.  The returned Promise should never
         *   be rejected.
         */

        class AbortableOperation<T, A = unknown> implements extern.IAbortableOperation<T> {
            promise: Promise<T>;
            constructor(promise: Promise<T>, onAbort: () => Promise<A>);

            /**
             * @returns An operation which has already failed with the error OPERATION_ABORTED.
             */

            static aborted(): AbortableOperation<util.Error>;

            /**
             * @returns An operation which is resolved when all operations are successful
             *          and fails when any operation fails. For this operation, abort()
             *          aborts all given operations.
             */

            static all(operations: AbortableOperation<unknown>[]): AbortableOperation<unknown>;
            static completed<U>(value: U): AbortableOperation<U>;
            static failed(error: Error): AbortableOperation<unknown>;
            static notAbortable<U>(promise: Promise<U>): AbortableOperation<U>;
            abort(): ReturnType<ConstructorParameters<typeof util.AbortableOperation>["1"]>;

            /**
             *
             * @param onSuccess A callback to be invoked after this operation is complete,
             *                  to chain to another operation. The callback can return a
             *                  plain value, a Promise to an asynchronous value, or another
             *                  AbortableOperation.
             * @param onError An optional callback to be invoked if this operation fails, to
             *                perform some cleanup or error handling. Analogous to the second
             *                parameter of Promise.prototype.then.
             */

            chain<U>(
                onSuccess?: (value: T) => Promise<U> | AbortableOperation<U>,
                onError?: () => void
            ): AbortableOperation<U>;
            finally(onFinal: (arg: boolean) => void): ThisType<T>;
        }

        namespace DataViewReader {
            enum Endianness {
                BIG_ENDIAN = 0,
                LITTLE_ENDIAN = 1,
            }
        }

        class DataViewReader {
            static endianness: number;
            constructor(dataView: DataView, endianness: DataViewReader.Endianness);
            getLength(): number;
            getPosition(): number;
            hasMoreData(): boolean;
            readBytes(bytes: number): Uint8Array;
            readInt32(): number;
            readTerminatedString(): string;
            readUint8(): number;
            readUint16(): number;
            readUint32(): number;
            readUint64(): number;
            rewind(bytes: number): void;
            seek(position: number): void;
            skip(bytes: number): void;
        }

        namespace StringUtils {
            function fromBytesAutoDetect(data: BufferSource | null): string;
            function fromUTF8(data: BufferSource | null): string;
            function fromUTF16(
                data: BufferSource | null,
                littleEndian?: boolean,
                opt_noThrow?: boolean
            ): string;
            function toUTF8(str: string): ArrayBuffer;
        }

        namespace FakeEventTarget {
            type ListenerType = (evt: Event) => boolean | undefined | void;
        }

        class FakeEventTarget {

            /**
             * A work-alike for EventTarget. Only DOM elements may be true
             * EventTargets, but this can be used as a base class to
             * provide event dispatch to non-DOM classes. Only FakeEvents
             * should be dispatched.
             */

            constructor();

            /**
             * Add an event listener to this object.
             *
             * @param type The event type to listen for.
             * @param listener The callback or listener object to invoke.
             * @param options Ignored.
             */

            addEventListener(
                type: string,
                listener: FakeEventTarget.ListenerType,
                options?: AddEventListenerOptions
            ): void;

            /**
             * Dispatch an event from this object
             *
             * @returns `true` if the default action was prevented
             */
            dispatchEvent(event: Event): boolean;

            /**
             * Remove an event listener from this object.
             *
             * @param type The event type for which you wish to remove a listener
             * @param listener The callback or listener object to remove.
             * @param options Ignored.
             */

            removeEventListener(
                type: string,
                listener: FakeEventTarget.ListenerType,
                options?: EventListenerOptions | boolean
            ): void;
        }

        interface IDestroyable {
            /**
             * Request that this object be destroyed, releasing all resources
             * and shutting down all operations. Returns a Promise which is
             * resolved when destruction is complete. This Promise should
             * never be rejected.
             */

            destroy(): Promise<unknown>;
        }

        class Error {
            constructor(
                severity: Error.Severity,
                category: Error.Category,
                code: Error.Code,
                ...var_args: unknown
            );

            data: Array<unknown>;
            category: util.Error.Category;
            severity: util.Error.Severity;
            code: util.Error.Code;
            handled: boolean;
            message: string;
            stack: string;
        }

        namespace Error {
            // For full description, @see: https://shaka-player-demo.appspot.com/docs/api/shaka.util.Error.html#.Category
            enum Category {
                NETWORK = 1,
                TEXT = 2,
                MEDIA = 3,
                MANIFEST = 4,
                STREAMING = 5,
                DRM = 6,
                PLAYER = 7,
                CAST = 8,
                STORAGE = 9,
            }

            // For full description, @see: https://shaka-player-demo.appspot.com/docs/api/shaka.util.Error.html#.Severity
            enum Severity {
                RECOVERABLE = 1,
                CRITICAL = 2,
            }

            // For full description, @see: https://shaka-player-demo.appspot.com/docs/api/shaka.util.Error.html#.Code
            enum Code {
                UNSUPPORTED_SCHEME = 1000,
                BAD_HTTP_STATUS = 1001,
                HTTP_ERROR = 1002,
                TIMEOUT = 1003,
                MALFORMED_DATA_URI = 1004,
                UNKNOWN_DATA_URI_ENCODING = 1005,
                REQUEST_FILTER_ERROR = 1006,
                RESPONSE_FILTER_ERROR = 1007,
                MALFORMED_TEST_URI = 1008,
                UNEXPECTED_TEST_REQUEST = 1009,
                INVALID_TEXT_HEADER = 2000,
                INVALID_TEXT_CUE = 2001,
                UNABLE_TO_DETECT_ENCODING = 2003,
                BAD_ENCODING = 2004,
                INVALID_XML = 2005,
                INVALID_MP4_TTML = 2007,
                INVALID_MP4_VTT = 2008,
                UNABLE_TO_EXTRACT_CUE_START_TIME = 2009,
                BUFFER_READ_OUT_OF_BOUNDS = 3000,
                JS_INTEGER_OVERFLOW = 3001,
                EBML_OVERFLOW = 3002,
                EBML_BAD_FLOATING_POINT_SIZE = 3003,
                MP4_SIDX_WRONG_BOX_TYPE = 3004,
                MP4_SIDX_INVALID_TIMESCALE = 3005,
                MP4_SIDX_TYPE_NOT_SUPPORTED = 3006,
                WEBM_CUES_ELEMENT_MISSING = 3007,
                WEBM_EBML_HEADER_ELEMENT_MISSING = 3008,
                WEBM_SEGMENT_ELEMENT_MISSING = 3009,
                WEBM_INFO_ELEMENT_MISSING = 3010,
                WEBM_DURATION_ELEMENT_MISSING = 3011,
                WEBM_CUE_TRACK_POSITIONS_ELEMENT_MISSING = 3012,
                WEBM_CUE_TIME_ELEMENT_MISSING = 3013,
                MEDIA_SOURCE_OPERATION_FAILED = 3014,
                MEDIA_SOURCE_OPERATION_THREW = 3015,
                VIDEO_ERROR = 3016,
                QUOTA_EXCEEDED_ERROR = 3017,
                TRANSMUXING_FAILED = 3018,
                UNABLE_TO_GUESS_MANIFEST_TYPE = 4000,
                DASH_INVALID_XML = 4001,
                DASH_NO_SEGMENT_INFO = 4002,
                DASH_EMPTY_ADAPTATION_SET = 4003,
                DASH_EMPTY_PERIOD = 4004,
                DASH_WEBM_MISSING_INIT = 4005,
                DASH_UNSUPPORTED_CONTAINER = 4006,
                DASH_PSSH_BAD_ENCODING = 4007,
                DASH_NO_COMMON_KEY_SYSTEM = 4008,
                DASH_MULTIPLE_KEY_IDS_NOT_SUPPORTED = 4009,
                DASH_CONFLICTING_KEY_IDS = 4010,
                UNPLAYABLE_PERIOD = 4011,
                RESTRICTIONS_CANNOT_BE_MET = 4012,
                NO_PERIODS = 4014,
                HLS_PLAYLIST_HEADER_MISSING = 4015,
                INVALID_HLS_TAG = 4016,
                HLS_INVALID_PLAYLIST_HIERARCHY = 4017,
                DASH_DUPLICATE_REPRESENTATION_ID = 4018,
                HLS_MULTIPLE_MEDIA_INIT_SECTIONS_FOUND = 4020,
                HLS_COULD_NOT_GUESS_MIME_TYPE = 4021,
                HLS_MASTER_PLAYLIST_NOT_PROVIDED = 4022,
                HLS_REQUIRED_ATTRIBUTE_MISSING = 4023,
                HLS_REQUIRED_TAG_MISSING = 4024,
                HLS_COULD_NOT_GUESS_CODECS = 4025,
                HLS_KEYFORMATS_NOT_SUPPORTED = 4026,
                DASH_UNSUPPORTED_XLINK_ACTUATE = 4027,
                DASH_XLINK_DEPTH_LIMIT = 4028,
                HLS_COULD_NOT_PARSE_SEGMENT_START_TIME = 4030,
                CONTENT_UNSUPPORTED_BY_BROWSER = 4032,
                CANNOT_ADD_EXTERNAL_TEXT_TO_LIVE_STREAM = 4033,
                INVALID_STREAMS_CHOSEN = 5005,
                NO_RECOGNIZED_KEY_SYSTEMS = 6000,
                REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE = 6001,
                FAILED_TO_CREATE_CDM = 6002,
                FAILED_TO_ATTACH_TO_VIDEO = 6003,
                INVALID_SERVER_CERTIFICATE = 6004,
                FAILED_TO_CREATE_SESSION = 6005,
                FAILED_TO_GENERATE_LICENSE_REQUEST = 6006,
                LICENSE_REQUEST_FAILED = 6007,
                LICENSE_RESPONSE_REJECTED = 6008,
                ENCRYPTED_CONTENT_WITHOUT_DRM_INFO = 6010,
                NO_LICENSE_SERVER_GIVEN = 6012,
                OFFLINE_SESSION_REMOVED = 6013,
                EXPIRED = 6014,
                LOAD_INTERRUPTED = 7000,
                OPERATION_ABORTED = 7001,
                NO_VIDEO_ELEMENT = 7002,
                CAST_API_UNAVAILABLE = 8000,
                NO_CAST_RECEIVERS = 8001,
                ALREADY_CASTING = 8002,
                UNEXPECTED_CAST_ERROR = 8003,
                CAST_CANCELED_BY_USER = 8004,
                CAST_CONNECTION_TIMED_OUT = 8005,
                CAST_RECEIVER_APP_UNAVAILABLE = 8006,
                STORAGE_NOT_SUPPORTED = 9000,
                INDEXED_DB_ERROR = 9001,
                DEPRECATED_OPERATION_ABORTED = 9002,
                REQUESTED_ITEM_NOT_FOUND = 9003,
                MALFORMED_OFFLINE_URI = 9004,
                CANNOT_STORE_LIVE_OFFLINE = 9005,
                STORE_ALREADY_IN_PROGRESS = 9006,
                NO_INIT_DATA_FOR_OFFLINE = 9007,
                LOCAL_PLAYER_INSTANCE_REQUIRED = 9008,
                NEW_KEY_OPERATION_NOT_SUPPORTED = 9011,
                KEY_NOT_FOUND = 9012,
                MISSING_STORAGE_CELL = 9013,
            }
        }
    }

    namespace extern {
        type ProgressUpdated = (
            duration: number,
            downloadedBytes: number,
            remainingBytes: number
        ) => void;
        type RequestFilter = (
            type: net.NetworkingEngine.RequestType,
            request: Request
        ) => void | Promise<unknown>;
        type ResponseFilter = (
            type: net.NetworkingEngine.RequestType,
            response: Response
        ) => void | Promise<unknown>;
        type SchemePlugin = (
            uri: string,
            request: Request,
            type: net.NetworkingEngine.RequestType,
            progressUpdated?: ProgressUpdated
        ) => IAbortableOperation<Response>;

        // @see: https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#.Request
        interface Request {
            /**
             * An array of URIs to attempt. They will be tried in the order
             * they are given.
             */

            uris: string[];

            /** The HTTP method to use for the request. */
            method: string;

            /** The body of the request. */
            body?: BufferSource;

            /** A mapping of headers for the request. e.g.: {"HEADER": "VALUE"} */
            headers?: { [key: string]: string };

            /**
             * Make requests with credentials. This will allow cookies in
             * cross-site requests.
             *
             * @see https://bit.ly/CorsCred
             */
            allowCrossSiteCredentials?: boolean;

            /** An object used to define how often to make retries.*/
            retryParameters?: extern.RetryParameters;

            /**
             * If this is a LICENSE request, this field contains the type of license
             * request it is (not the type of license).  This is the `messageType` field
             * of the EME message. For example, this could be `license-request` or
             * `license-renewal`
             */

            licenseRequestType?: string | null;

            /**
             * If this is a LICENSE request, this field contains the session ID of the
             * EME session that made the request.
             */

            sessionId?: string | null;
        }

        interface Response {
            /**
             * The URI which was loaded. Request filters and server redirects
             * can cause this to be different from the original request URIs.
             */
            uri: string;

            /**
             * The original URI passed to the browser for networking. This is
             * before any redirects, but after request filters are executed.
             */

            originalUri: string;

            /** The body of the response.*/
            data: ArrayBuffer;

            /**
             * A map of response headers, if supported by the underlying protocol.
             * All keys should be lowercased. For HTTP/HTTPS, may not be available
             * cross-origin.
             */

            headers: { [key: string]: string };

            /**
             * The time it took to get the response, in miliseconds. If not
             * given, NetworkingEngine will calculate it using Date.now.
             */

            timeMs?: number;

            /**
             * If true, this response was from a cache and should be ignored
             * for bandwidth estimation.
             */

            fromCache?: boolean;
        }

        /** Parameters for retrying requests. */
        interface RetryParameters {
            /** The maximum number of times the request should be attempted. */
            maxAttempts?: number;
            /** The delay before the first retry, in milliseconds. */
            baseDelay?: number;
            /** The multiplier for successive retry delays. */
            backoffFactor?: number;
            /** The maximum amount of fuzz to apply to each retry delay. For example, 0.5 means "between 50% below and 50% above the retry delay." */
            fuzzFactor?: number;
            /** The request timeout, in milliseconds.  Zero means "unlimited". */
            timeout?: number;
        }

        interface SupportType {
            manifest: { [key: string]: boolean };
            media: { [key: string]: boolean };
            drm: { [key: string]: extern.DrmSupportType };
        }

        interface DrmSupportType {
            persistentState: boolean;
        }

        interface IAbortableOperation<T> {
            /**
             * A Promise which represents the underlying operation. It is resolved
             * when the operation is complete, and rejected if the operation fails
             * or is aborted. Aborted operations should be rejected with a
             * `shaka.util.Error` object using the error code `OPERATION_ABORTED`.
             */

            promise: Promise<T>;

            /**
             * Can be called by anyone holding this object to abort the underlying
             * operation. This is not cancelation, and will not necessarily result
             * in any work being undone. `abort()` should return a Promise which is
             * resolved when the underlying operation has been aborted. The
             * returned Promise should never be rejected.
             */

            abort(): Promise<unknown>;

            /**
             * @param onFinal A callback to be invoked after the operation succeeds
             *                or fails. The boolean argument is true if the
             *                operation succeeded and false if it failed.
             */
            finally(onFinal: (arg: boolean) => void): ThisType<T>;
        }

        // @see https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#.Track

        interface Track {
            id: number;
            active: boolean;
            type: string;
            bandwidth: number;
            language: string;
            primary: boolean;
            roles: string[];
            label: string | null;
            kind: string | null;
            width: number | null;
            height: number | null;
            frameRate: number | null;
            mimeType: string | null;
            codecs: string | null;
            audioCodec: string | null;
            videoCodec: string | null;
            videoId: number | null;
            audioId: number | null;
            channelsCount: number | null;
            audioBandwidth: number | null;
            videoBandwidth: number | null;
        }

        const enum WidevineDrmRobustness {
            SW_SECURE_CRYPTO = "SW_SECURE_CRYPTO",
            SW_SECURE_DECODE = "SW_SECURE_DECODE",
            HW_SECURE_CRYPTO = "HW_SECURE_CRYPTO",
            HW_SECURE_DECODE = "HW_SECURE_DECODE",
            HW_SECURE_ALL = "HW_SECURE_ALL",
        }

        interface DrmInfo {
            keySystem: string;
            licenseServerUri: string;
            distinctiveIdentifierRequired?: boolean;
            persistentStateRequired?: boolean;
            // Widevine specific or other strings
            audioRobustness?: WidevineDrmRobustness | string;
            videoRobustness?: WidevineDrmRobustness | string;
            serverCertificate?: Uint8Array | null;
            initData?: InitDataOverride[];
            keyIds?: string[];
        }

        interface DrmSupportType {
            persistentState: boolean;
        }

        interface InitDataOverride {
            initData: Uint8Array;
            initDataType: string;
            keyId: string | null;
        }

        interface LanguageRole {
            language: string;
            role: string;
        }

        interface BufferedInfo {
            total: BufferedRange[];
            audio: BufferedRange[];
            video: BufferedRange[];
            text: BufferedRange[];
        }

        interface BufferedRange {
            start: number; // seconds
            end: number; // seconds
        }

        interface PlayerConfiguration {
            drm?: DrmConfiguration;
            manifest?: ManifestConfiguration;
            streaming?: StreamingConfiguration;
            abrFactory?: AbrManager.Factory;
            abr?: AbrConfiguration;
            preferredAudioLanguage?: string;
            preferredTextLanguage?: string;
            preferredVariantRole?: string;
            preferredTextRole?: string;
            preferredAudioChannelCount?: number;
            restrictions?: Restrictions;
            playRangeStart?: number;
            playRangeEnd?: number;
            textDisplayFactory?: TextDisplayer.Factory;
        }

        interface DrmConfiguration {
            retryParameters?: RetryParameters;
            servers?: { [key: string]: string };
            clearKeys?: { [key: string]: string };
            delayLicenseRequestUntilPlayer?: boolean;
            advanced?: { [key: string]: AdvancedDrmConfiguration };
        }

        interface AdvancedDrmConfiguration {
            distinciveIdentifierRequired?: boolean;
            persistendStateRequired?: boolean;
            videoRobustness?: string;
            audioRobustness?: string;
            serverCertificate?: Uint8Array | null;
        }

        interface ManifestConfiguration {
            retryParameters: RetryParameters;
            availabilityWindowOverride: number; // seconds
            dash: DashManifestConfiguration;
        }

        interface DashManifestConfiguration {
            customScheme: DashContentProtectionCallback;
            clockSyncUri: string;
            ignoreDrmInfo?: boolean;
            xlinkFailGracefully?: boolean;
            defaultPresentationDelay: number;
        }

        type DashContentProtectionCallback = (e: Element) => Array<DrmInfo>;

        interface StreamingConfiguration {
            retryParameters?: RetryParameters;
            failureCallback?: () => void;
            rebufferingGoal?: number; // seconds
            bufferingGoal?: number;
            bufferBehind?: number;
            ignoreTextStreamFailures?: boolean;
            smallGapLimit?: number; // seconds
            jumpLargeGaps?: boolean;
            durationBackoff?: number;
            alwaysStreamText?: boolean;
            startAtSegmentBoundary?: boolean;
            forceTransmuxTS?: boolean;
            safeSeekOffset?: number;
            stallEnabled?: boolean;
            stallThreshold?: number;
            stallSkip?: boolean;
            useNativeHlsOnSafari?: boolean;
        }

        interface Variant {
            id: number;
            language?: string;
            primary?: boolean;
            audio: Stream | null;
            video: Stream | null;
            bandwidth: number;
            drmInfos?: DrmInfo[];
            allowedByApplication?: boolean;
            allowerByKeySystem?: boolean;
        }

        interface Stream {
            id: number;
            createSegmentIndex: CreateSegmentIndexFunction;
            findSegmentPosition: FindSegmentPositionFunction;
            getSegmentReference: GetSegmentReferenceFunction;
            initSegmentReference: media.initSegmentReference;
            presentationTimeOffset?: number | undefined;
            mimeType: string;
            codecs?: string;
            frameRage?: number | undefined;
            bandwidth?: number | undefined;
            width?: number | undefined;
            height?: number | undefined;
            kind?: string | undefined;
            encrypted?: boolean;
            keyId?: string | null;
            language: string;
            label: string | null;
            type: string;
            primary?: boolean;
            trickModeVideo: extern.Stream;
            containsEmsgBoxes?: boolean;
            roles: string[];
            channelsCount: number | null;
            segmentIndex: media.SegmentIndex;
        }

        type CreateSegmentIndexFunction = () => Promise<media.SegmentIndex>;
        type FindSegmentPositionFunction = (number: number) => number;
        type GetSegmentReferenceFunction = (number: number) => media.SegmentReference | null;

        namespace AbrManager {
            type Factory = (newAbr: AbrManager) => void;
            type SwitchCallback = (variant: Variant, dataFromBuffer?: boolean) => void;
        }

        interface AbrManager {
            chooseVariant(): Variant;
            configure(config: extern.AbrConfiguration): void;
            disable(): void;
            enable(): void;
            getBandwidthEstimate(): number;
            init(switchCallback: AbrManager.SwitchCallback): void;
            segmentDownloaded(deltaTimeMs: number, numBytes: number): void;
            setVariants(variants: Variant[]): void;
            stop(): void;
        }

        interface AbrConfiguration {
            enabled?: boolean;
            defaultBandwidthEstimate: number;
            restrictions: Restrictions;
            switchInterval: number;
            bandwidthUpgradeTarget: number;
            bandwidthDowngradeTarget: number;
        }

        interface Restrictions {
            minWidth: number;
            maxWidth: number;
            minHeight: number;
            maxHeight: number;
            mixPixels: number;
            maxPixels: number;
            minBandwidth: number;
            maxBandwidth: number;
        }

        namespace TextDisplayer {
            type Factory = (newTD: TextDisplayer) => void;
        }

        interface TextDisplayer extends util.IDestroyable {
            append(cues: text.Cue[]): void;
            isTextVisible(): boolean;
            remove(startTime: number, endTime: number): boolean;
            setTextVisibility(on: boolean): void;
        }

        interface CueRegion {
            height: number;
            heightUnits: text.CueRegion.units;
            id: string;
            regionAnchorX: number;
            regionAnchorY: number;
            scroll: text.CueRegion.scrollMode;
            viewportAnchorUnits: text.CueRegion.units;
            viewportAnchorX: number;
            viewportAnchorY: number;
            width: number;
            widthUnits: text.CueRegion.units;
        }

        interface Manifest {
            presentationTimeline: media.PresentationTimeline;
            periods: Period[];
            offlineSessionids: string[];
            minBufferTime: number;
        }

        interface Period {
            startTime: number;
            variants: Variant[];
            textStreams: extern.Stream[];
        }

        interface Stats {
            width: number;
            height: number;
            streamBandwidth: number;
            decodedFrames: number;
            droppedFrames: number;
            estimatedBandwidth: number;
            loadLatency: number;
            playTime: number;
            bufferingTime: number;
            switchHistory: TrackChoice[];
            stateHistory: StateChange[];
        }

        interface TrackChoice {
            timestamp: number;
            id: number;
            type: "variant" | "text";
            fromAdaptation: boolean;
            bandwidth: number | null;
        }

        interface StateChange {
            timestamp: number;
            state: string;
            duration: number;
        }

        interface EmsgInfo {
            /**	Identifies the message scheme. */
            schemeIdUri: string;
            /**	Specifies the value for the event. */
            value: string;
            /**	The time that the event starts (in presentation time). */
            startTime: number;
            /**	The time that the event ends (in presentation time). */
            endTime: number;
            /**	Provides the timescale, in ticks per second. */
            timescale: number;
            /**	The offset that the event starts, relative to the start of the segment this is contained in (in units of timescale). */
            presentationTimeDelta: number;
            /**	The duration of the event (in units of timescale). */
            eventDuration: number;
            /**	A field identifying this instance of the message. */
            id: number;
            /**	Body of the message. */
            messageData: Uint8Array;
        }

        interface HlsManifestConfiguration {
            /** If true, ignore any errors in a text stream and filter out those streams. */
            ignoreTextStreamFailures: boolean;
        }

        namespace ManifestParser {
            type Factory = (newManifest: ManifestParser) => void;
            interface PlayerInterface {
                networkingEngine: net.NetworkingEngine;
                filterNewPeriod: (period: Period) => void;
                filterAllperiods: (periods: Period[]) => void;
                onTimelineRegionAdded: (tri: TimelineRegionInfo) => void;
                onEvent: (evt: Event) => void;
                onError: (error: util.Error) => void;
            }
        }

        interface ManifestParser {
            configure(config: ManifestConfiguration): void;
            onExpirationUpdated(sessionId: string, expiration: number): void;
            start(uri: string, playerInterface: ManifestParser.PlayerInterface): Promise<Manifest>;
            stop(): Promise<unknown>;
            update(): void;
        }

        interface TimelineRegionInfo { }
    }

    namespace hls {
        class HlsParser implements extern.ManifestParser {
            configure(config: ManifestConfiguration): void;
            onExpirationUpdated(sessionId: string, expiration: number): void;
            start(uri: string, playerInterface: ManifestParser.PlayerInterface): Promise<Manifest>;
            stop(): Promise<unknown>;
            update(): void;
        }
    }

    namespace dash {
        class DashParser implements extern.ManifestParser {
            configure(config: ManifestConfiguration): void;
            onExpirationUpdated(sessionId: string, expiration: number): void;
            start(uri: string, playerInterface: ManifestParser.PlayerInterface): Promise<Manifest>;
            stop(): Promise<unknown>;
            update(): void;
        }
    }
}
