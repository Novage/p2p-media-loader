export const PLAYERS = ["hlsjs", "hlsjs-dplayer"] as const;
export const STREAMS = {
  hlsBigBunnyBuck: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  radioStream:
    "https://streamvideo.luxnet.ua/maximum/smil:maximum.stream.smil/playlist.m3u8",
  hlsByteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
  hlsOneLevelByteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/gear1/prog_index.m3u8",
  hlsBasicExample:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
  hlsAdvancedVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8",
  hlsAdvancedVideo2:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
  hlsLive1:
    "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8",
  hlsLive2:
    "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
  hlsLive2Level4Only:
    "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/level_4.m3u8",
  hlsAudioOnly:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/a1/prog_index.m3u8",
  bigBunnyBuckDash: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
  dashLiveBigBunnyBuck:
    "https://livesim.dashif.org/livesim/testpic_2s/Manifest.mpd",
  dashVODBigBunnyBuck:
    "https://dash.akamaized.net/dash264/TestCases/5b/nomor/6.mpd",
  dashLiveHokey:
    "https://d24rwxnt7vw9qb.cloudfront.net/v1/dash/e6d234965645b411ad572802b6c9d5a10799c9c1/All_Reference_Streams/4577dca5f8a44756875ab5cc913cd1f1/index.mpd",
};
export const DEFAULT_STREAM =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
export const DEFAULT_PLAYER = "hlsjs";
export const DEFAULT_GRAPH_STATE = {
  nodes: [
    {
      id: "0",
      label: "You",
    },
  ],
  edges: [],
};
