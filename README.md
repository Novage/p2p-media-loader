# P2P Media Loader

**P2P Media Loader** is an open-source JavaScript library that uses features of modern web browsers (i.e. HTML5 video and WebRTC) to deliver media over P2P and do playback via integrations with many popular HTML5 video players. It doesn’t require any web browser plugins or add-ons to function.

It allows creating Peer-to-Peer network (also called P2P CDN or P2PTV) for traffic sharing between users (peers) that are watching the same media stream live or VOD over HLS or MPEG-DASH protocols.

It significantly reduces traditional CDN traffic and cost while delivering media streams to more users.

## Related projects

* [wt-tracker](https://github.com/Novage/wt-tracker) - high-performance WebTorrent tracker
* [WebTorrent](https://github.com/webtorrent/webtorrent) - streaming torrent client for the web https://webtorrent.io

## Useful links

- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- API documentation
  - [Hls.js integration](p2p-media-loader-hlsjs#p2p-media-loader---hlsjs-integration)
  - [Shaka Player integration](p2p-media-loader-shaka#p2p-media-loader---shaka-player-integration)
  - [Core](p2p-media-loader-core#p2p-media-loader-core)
- JS CDN
  - [Core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/)
  - [Hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/)
  - [Shaka Player integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/build/)
- npm packages
  - [Core](https://npmjs.com/package/p2p-media-loader-core)
  - [Hls.js integration](https://npmjs.com/package/p2p-media-loader-hlsjs)
  - [Shaka Player integration](https://npmjs.com/package/p2p-media-loader-shaka)

## Key features

- Supports live and VOD streams over HLS or MPEG-DASH protocols
- Supports multiple HTML5 video players and engines:
  - Engines: Hls.js, Shaka Player
  - Video players: JWPlayer, Clappr, Flowplayer, MediaElement, VideoJS
- Supports adaptive bitrate streaming of HLS and MPEG-DASH protocols
- No need in server-side software. By default **P2P Media Loader** uses publicly available servers:
  - STUN servers - [Public STUN server list](https://gist.github.com/mondain/b0ec1cf5f60ae726202e)
  - WebTorrent trackers - [https://openwebtorrent.com/](https://openwebtorrent.com/)

## Key components of the P2P network

All the components of the P2P network are free and open-source.

![P2P Media Loader network](https://raw.githubusercontent.com/Novage/p2p-media-loader/gh-pages/images/p2p-media-loader-network.png)

**P2P Media Loader** web browser [requirements](#web-browsers-support) are:<br>
- **WebRTC Data Channels** support to exchange data between peers
- **Media Source Extensions** are required by Hls.js and Shaka Player engines for media playback

[**STUN**](https://en.wikipedia.org/wiki/STUN) server is used by [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) to gather [ICE](https://en.wikipedia.org/wiki/Interactive_Connectivity_Establishment) candidates.
There are many running public servers available on [Public STUN server list](https://gist.github.com/mondain/b0ec1cf5f60ae726202e).

[**WebTorrent**](https://webtorrent.io/) tracker is used for WebRTC signaling and to create swarms of peers that download the same media stream.
Few running public trackers are available: [https://openwebtorrent.com/](https://openwebtorrent.com/).
It is possible to run personal WebTorrent tracker using open-source implementations: [bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker), [uWebTorrentTracker](https://github.com/DiegoRBaquero/uWebTorrentTracker).

**P2P Media Loader** is configured to use public **STUN** and **WebTorrent** servers by default. It means that it is not required to run any server-side software for the P2P network to function.

## How it works

A web browser runs a video player integrated with **P2P Media Loader** library. An instance of **P2P Media Loader** is called **peer**. Many peers form the P2P network.

**P2P Media Loader** starts to download initial media segments over HTTP(S) from source server or CDN. This allows beginning media playback faster.
Also, in case of no peers, it will continue to download segments over HTTP(S) that will not differ from traditional media stream download over HTTP.

After that **P2P Media Loader** sends media stream details and its connection details (ICE candidates) to WebTorrent trackers
and obtains from them list of other peers that are downloading the same media stream.

**P2P Media Loader** connects and starts to download media segments from the obtained peers as well as sharing already downloaded segments to them.

From time to time random peers from the P2P swarm download new segments over HTTP(S) and share them to others over P2P.

## Limitations

Only one media track is delivered over P2P. If video and audio tracks in HLS or MPEG-DASH go separately, just video is going to be shared over the P2P network.

## Web browsers support

|                         | Chrome | Firefox | macOS Safari | iOS Safari | IE    | Edge  |
|-------------------------|--------|---------|--------------|------------|-------|-------|
| WebRTC Data Channels    | +      | +       | +            | +          | -     | -     |
| Media Source Extensions | +      | +       | +            | -          | +     | +     |
| **P2P Media Loader**    | **+**  | **+**   | **+**        | **-**      | **-** | **-** |
