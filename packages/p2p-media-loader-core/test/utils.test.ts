import { expect, test } from "vitest";
import { filterUndefinedProps, overrideConfig } from "../src/utils/utils";
import {
  CommonCoreConfig,
  CoreConfig,
  DynamicCoreConfig,
  StreamConfig,
} from "../src/types";
import { Core } from "../src/core";

test("override configs", () => {
  const coreConfig: CoreConfig = {
    cachedSegmentExpiration: 1200,
    cachedSegmentsCount: 0,
    mainStream: {
      simultaneousHttpDownloads: 3,
    },
  };

  const override: CoreConfig = {
    cachedSegmentExpiration: undefined,
    secondaryStream: {
      simultaneousHttpDownloads: 5,
    },
  };

  const result: CoreConfig = {
    cachedSegmentExpiration: undefined,
    cachedSegmentsCount: 0,
    mainStream: {
      simultaneousHttpDownloads: 3,
    },
  };

  expect(overrideConfig(coreConfig, override)).toEqual(result);
});

test("override common config", () => {
  const commonConfig: CommonCoreConfig = {
    cachedSegmentExpiration: 1200,
    cachedSegmentsCount: 999,
  };

  const coreConfig: CoreConfig = {
    cachedSegmentExpiration: undefined,
    cachedSegmentsCount: undefined,
    simultaneousHttpDownloads: 3,
    simultaneousP2PDownloads: 3,
    highDemandTimeWindow: 15,
    httpDownloadTimeWindow: 3000,
    p2pDownloadTimeWindow: 6000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 1000,
    p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000,
    httpNotReceivingBytesTimeoutMs: 1000,
    httpErrorRetries: 3,
    p2pErrorRetries: 3,
    trackerClientVersionPrefix: "PM1000",
    announceTrackers: [
      "wss://tracker.webtorrent.dev",
      "wss://tracker.files.fm:7073/announce",
      "wss://tracker.openwebtorrent.com",
      // "wss://tracker.novage.com.ua",
    ],
    rtcConfig: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    },
    validateP2PSegment: undefined,
    httpRequestSetup: undefined,
    swarmId: undefined,
  };

  const result: Partial<CommonCoreConfig> = {
    cachedSegmentExpiration: undefined,
    cachedSegmentsCount: 0,
  };

  expect(
    overrideConfig(commonConfig, coreConfig, Core.DEFAULT_COMMON_CORE_CONFIG),
  ).toEqual(result);
});

test("override defined stream config", () => {
  const mainStreamConfig: StreamConfig = {
    simultaneousHttpDownloads: 3,
    simultaneousP2PDownloads: 3,
    highDemandTimeWindow: 15,
    httpDownloadTimeWindow: 3000,
    p2pDownloadTimeWindow: 6000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 1000,
    p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000,
    httpNotReceivingBytesTimeoutMs: 1000,
    httpErrorRetries: 3,
    p2pErrorRetries: 3,
    trackerClientVersionPrefix: "PM1000",
    announceTrackers: [
      "wss://tracker.webtorrent.dev",
      "wss://tracker.files.fm:7073/announce",
      "wss://tracker.openwebtorrent.com",
      // "wss://tracker.novage.com.ua",
    ],
    rtcConfig: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    },
    validateP2PSegment: async () => true,
    httpRequestSetup: undefined,
    swarmId: undefined,
  };

  const dynamicCoreConfig: DynamicCoreConfig = {
    cachedSegmentExpiration: 1200,
    highDemandTimeWindow: 45,
    httpDownloadTimeWindow: 5000,
    p2pDownloadTimeWindow: 10000,
    p2pNotReceivingBytesTimeoutMs: 2000,
    p2pInactiveLoaderDestroyTimeoutMs: 15 * 1000,
    httpNotReceivingBytesTimeoutMs: 1500,
    httpErrorRetries: 2,
    p2pErrorRetries: 4,
    mainStream: {
      simultaneousHttpDownloads: 2,
      simultaneousP2PDownloads: 20,
      validateP2PSegment: undefined,
    },
    secondaryStream: {
      simultaneousHttpDownloads: 1,
      simultaneousP2PDownloads: 2,
    },
  };

  const result: StreamConfig = {
    simultaneousHttpDownloads: 2,
    simultaneousP2PDownloads: 20,
    highDemandTimeWindow: 45,
    httpDownloadTimeWindow: 5000,
    p2pDownloadTimeWindow: 10000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 2000,
    p2pInactiveLoaderDestroyTimeoutMs: 15 * 1000,
    httpNotReceivingBytesTimeoutMs: 1500,
    httpErrorRetries: 2,
    p2pErrorRetries: 4,
    trackerClientVersionPrefix: "PM1000",
    announceTrackers: [
      "wss://tracker.webtorrent.dev",
      "wss://tracker.files.fm:7073/announce",
      "wss://tracker.openwebtorrent.com",
      // "wss://tracker.novage.com.ua",
    ],
    rtcConfig: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    },
    validateP2PSegment: undefined,
    httpRequestSetup: undefined,
    swarmId: undefined,
  };

  function overrideConfigs(config: StreamConfig, override: DynamicCoreConfig) {
    overrideConfig(config, override);
    return overrideConfig(config, override.mainStream!);
  }

  expect(overrideConfigs(mainStreamConfig, dynamicCoreConfig)).toEqual(result);
});

test("filter undefined props", () => {
  const coreConfig: CoreConfig = {
    cachedSegmentExpiration: undefined,
    cachedSegmentsCount: undefined,
    simultaneousHttpDownloads: 2,
    simultaneousP2PDownloads: 20,
    highDemandTimeWindow: 45,
    httpDownloadTimeWindow: 5000,
    p2pDownloadTimeWindow: 10000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 2000,
    p2pInactiveLoaderDestroyTimeoutMs: 15 * 1000,
    httpNotReceivingBytesTimeoutMs: 1500,
    httpErrorRetries: 2,
    p2pErrorRetries: 4,
    trackerClientVersionPrefix: "PM1000",
    announceTrackers: [
      "wss://tracker.webtorrent.dev",
      "wss://tracker.files.fm:7073/announce",
      "wss://tracker.openwebtorrent.com",
      // "wss://tracker.novage.com.ua",
    ],
    rtcConfig: undefined,
    validateP2PSegment: undefined,
    httpRequestSetup: undefined,
    swarmId: undefined,
  };

  const result: CoreConfig = {
    simultaneousHttpDownloads: 2,
    simultaneousP2PDownloads: 20,
    highDemandTimeWindow: 45,
    httpDownloadTimeWindow: 5000,
    p2pDownloadTimeWindow: 10000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 2000,
    p2pInactiveLoaderDestroyTimeoutMs: 15 * 1000,
    httpNotReceivingBytesTimeoutMs: 1500,
    httpErrorRetries: 2,
    p2pErrorRetries: 4,
    trackerClientVersionPrefix: "PM1000",
    announceTrackers: [
      "wss://tracker.webtorrent.dev",
      "wss://tracker.files.fm:7073/announce",
      "wss://tracker.openwebtorrent.com",
      // "wss://tracker.novage.com.ua",
    ],
  };

  expect(filterUndefinedProps(coreConfig)).toEqual(result);
});
