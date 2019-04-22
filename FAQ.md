# P2P Media Loader - FAQ

Table of contents:
- [What is tracker?](#what-is-tracker)
- [Don't use public trackers in production](#dont-use-public-trackers-in-production)
- [How to achieve better P2P ratio for live streams?](#how-to-achieve-better-p2p-ratio-for-live-streams)
- [How to achieve better P2P ratio for VOD streams?](#how-to-achieve-better-p2p-ratio-for-vod-streams)
- [What are the requirements to share a stream over P2P?](#what-are-the-requirements-to-share-a-stream-over-p2p)
- [Is it possible to have 100% P2P ratio?](#is-it-possible-to-have-100-p2p-ratio)
- [What happens if there are no peers on a stream?](#what-happens-if-there-are-no-peers-on-a-stream)

## What is tracker?

`P2P Media Loader` uses WebTorrent compatible trackers to do [WebRTC](https://en.wikipedia.org/wiki/WebRTC) signaling - exchanging [SDP](https://en.wikipedia.org/wiki/Session_Description_Protocol) data between peers to connect them into a swarm.

Few [public trackers](https://openwebtorrent.com/) are configured in the library by default for easy development and testing but [don't use public trackers in production](#dont-use-public-trackers-in-production).

Any compatible WebTorrent tracker works for `P2P Media Loader`:
- [wt-tracker](https://github.com/Novage/wt-tracker) - high-performance WebTorrent tracker by Novage that uses [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) for I/O.
- [bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker) - tracker from WebTorrent project that uses Node.js I/O

## Don't use public trackers in production

[Public trackers](https://openwebtorrent.com/) allow quickly begin development and testing of P2P technologies on the web.
But they support a limited number of peers (about 5000 peers from all the swarms) and can reject peers or even go down on heavy loads.

That is why they can't be used in production environments. Consider running your personal tracker or buy resources from a tracker providers to go stable.

## How to achieve better P2P ratio for live streams?

The default configuration works best for live streams with 15-20 segments in the playlist. The segments duration sohould be about 5 seconds.

## How to achieve better P2P ratio for VOD streams?

An example of a good configuration tested in production for a VOD stream with segments 20 seconds long each:

```javascript
segments:{
  // number of segments to pass for processing to P2P algorithm
  forwardSegmentCount:50, // usually should be equal or greater than p2pDownloadMaxPriority and httpDownloadMaxPriority
},
loader:{
  // how long to store the downloaded segments for P2P sharing
  cachedSegmentExpiration:86400000,
  // count of the downloaded segments to store for P2P sharing
  cachedSegmentsCount:1000,
  
  // first 4 segments (priorities 0, 1, 2 and 3) are required buffer for stable playback
  requiredSegmentsPriority:3,

  // each 1 second each of 10 segments ahead of playhead position gets 6% probability for random HTTP download
  httpDownloadMaxPriority:9,
  httpDownloadProbability:0.06,
  httpDownloadProbabilityInterval: 1000,
  
  // disallow randomly download segments over HTTP if there are no connected peers
  httpDownloadProbabilitySkipIfNoPeers: true,
  
  // P2P will try to download only first 51 segment ahead of playhead position
  p2pDownloadMaxPriority: 50,
  
  // 1 second timeout before retrying HTTP download of a segment in case of an error
  httpFailedSegmentTimeout:1000,
  
  // number of simultaneous downloads for P2P and HTTP methods
  simultaneousP2PDownloads:20,
  simultaneousHttpDownloads:3,
  
  // enable mode, that try to prevent HTTP downloads on stream start-up
  httpDownloadInitialTimeout: 120000, // try to prevent HTTP downloads during first 2 minutes
  httpDownloadInitialTimeoutPerSegment: 17000, // try to prevent HTTP download per segment during first 17 seconds
  
  // allow to continue aborted P2P downloads via HTTP
  httpDownloadRanges:true,
}
```

## What are the requirements to share a stream over P2P?

The requirements to share a stream over P2P are:
- The stream should have the same swarm ID on all the peers. Swarm ID is equal to the stream master manifest URL without query parameters by default. If a stream URL is not the same for different peers you can set the swarm ID manually using configuration.
- The master manifest should have the same number of variants (i.e. qualities) in the same order.
- Variants should consist of the same segments under the same sequence numbers (see #EXT-X-MEDIA-SEQUENCE for HLS).

## Is it possible to have 100% P2P ratio?

It is possible of a single peer but not possible for a swarm of peers in total.

P2P Media Loader implements approach of P2P assisted video delivery. It means that the stream should be downloaded via HTTP(S) at least once to be shared between peers in a swarm.

For example for 10 peers in the best case the maximum possible P2P ratio is 90% if a stream was downloaded from the source only once.


## What happens if there are no peers on a stream?

P2P Media Loader downloads all the segments from HTTP(S) source in this case. It should not perform worse than a player configured without P2P at all.
