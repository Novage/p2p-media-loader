# P2P Media Loader

[![GitHub ations workflow status](https://img.shields.io/github/actions/workflow/status/Novage/p2p-media-loader/check-pr.yml?logo=github&color=%23347d39)](https://github.com/Novage/p2p-media-loader/actions/workflows/check-pr.yml)
[![npm version](https://img.shields.io/npm/v/p2p-media-loader-core?logo=npm&logoColor=white)](https://npmjs.com/package/p2p-media-loader-core)
[![jsDelivr hits (npm)](https://data.jsdelivr.com/v1/package/npm/p2p-media-loader-core/badge?style=rounded)](https://www.jsdelivr.com/package/npm/p2p-media-loader-core)



**P2P Media Loader** is an open-source JavaScript library that leverages modern web browser features, such as HTML5 video and WebRTC, to enable media delivery over peer-to-peer (P2P) connections. It integrates smoothly with many popular HTML5 video players and works entirely without browser plugins or add-ons. Experience it in action with the [demo](http://novage.com.ua/p2p-media-loader/demo.html).

By leveraging P2P technology, it greatly reduces reliance on traditional content delivery network (CDN) resources, lowers costs, and enhances the ability to deliver media streams to a larger audience.

This library enables the creation of a huge P2P mesh networks, also known as peer-to-peer content delivery network (P2P CDN), peer-to-peer television (P2PTV), and Enterprise Content Delivery Network (eCDN), which allows traffic sharing among users who are simultaneously viewing the same live or video on demand (VOD) stream via HLS or MPEG-DASH protocols.

## Related software

- [wt-tracker](https://github.com/Novage/wt-tracker): a high-performance WebTorrent tracker for Node.js using [µWebSockets.js](https://github.com/uNetworking/uWebSockets.js).
- [Aquatic](https://github.com/greatest-ape/aquatic): a high-performance BitTorrent tracker written in Rust.
- [OpenWebtorrent Tracker](https://github.com/OpenWebTorrent/openwebtorrent-tracker): fast and simple webtorrent tracker written in C++ using [µWebSockets](https://github.com/uNetworking/uWebSockets).
- [bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker): a simple, robust, BitTorrent tracker (client & server) implementation for Node.js and Web.

## Useful links

- [P2P development, support & consulting](https://novage.com.ua/)
- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [FAQ](https://github.com/Novage/p2p-media-loader/blob/main/FAQ.md)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- [API documentation](https://novage.github.io/p2p-media-loader/docs/v1.0/)
- npm packages
  - [Core](https://npmjs.com/package/p2p-media-loader-core)
  - [Hls.js integration](https://npmjs.com/package/p2p-media-loader-hlsjs)
  - [Shaka Player integration](https://npmjs.com/package/p2p-media-loader-shaka)
- ES modules CDN
  - [Core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/dist/)
  - [Hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/dist/)
  - [Shaka Player integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/dist/)

## Key features

- Supports live and VOD streams over HLS or MPEG-DASH protocols
- Supports multiple HTML5 video players and engines:
  - Engines: Hls.js, Shaka Player
  - Video players: [Vidstack](https://www.vidstack.io/), [Clappr](http://clappr.io/), [MediaElement](https://www.mediaelementjs.com/), [Plyr](https://plyr.io/), [DPlayer](https://dplayer.diygod.dev/), [OpenPlayerJS](https://www.openplayerjs.com/), and others that support Hls.js or Shaka video engines. These players can be integrated via custom integration with the library API.
- Supports adaptive bitrate streaming of HLS and MPEG-DASH protocols
- There is no need for server-side software for simple use cases. By default **P2P Media Loader** uses publicly available servers:
  - WebTorrent trackers - [https://tracker.novage.com.ua/](https://tracker.novage.com.ua/), [https://tracker.webtorrent.dev/](https://tracker.webtorrent.dev/), [https://openwebtorrent.com/](https://openwebtorrent.com/)
  - STUN servers - [Public STUN server list](https://gist.github.com/mondain/b0ec1cf5f60ae726202e)

## Key components of the P2P network

All the components of the P2P network are free and open-source.

![P2P Media Loader network](https://raw.githubusercontent.com/Novage/p2p-media-loader/gh-pages/images/p2p-media-loader-network.png)

**P2P Media Loader** web browser [requirements](#web-browsers-support) are:<br>

- **WebRTC Data Channels** support to exchange data between peers
- **Media Source Extensions** are required by Hls.js and Shaka Player engines for media playback

[**STUN**](https://en.wikipedia.org/wiki/STUN) server is used by [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) to gather [ICE](https://en.wikipedia.org/wiki/Interactive_Connectivity_Establishment) candidates.
There are many running public servers available on [Public STUN server list](https://gist.github.com/mondain/b0ec1cf5f60ae726202e).

A compatible [**WebTorrent**](https://webtorrent.io/) tracker is required for WebRTC signaling and to create swarms of peers downloading the same media stream.
A few running public trackers are available: [https://tracker.novage.com.ua/](https://tracker.novage.com.ua/), [https://tracker.webtorrent.dev/](https://tracker.webtorrent.dev/), [https://openwebtorrent.com/](https://openwebtorrent.com/).

It is possible to run personal WebTorrent tracker using open-source implementations: [wt-tracker](https://github.com/Novage/wt-tracker), [Aquatic](https://github.com/greatest-ape/aquatic), [OpenWebtorrent Tracker](https://github.com/OpenWebTorrent/openwebtorrent-tracker), [bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker).

**P2P Media Loader** is configured to use public **STUN** and **WebTorrent** servers by default. It means that it is not required to run any server-side software for the P2P network to function for simple use cases.

## How It Works

A web browser runs a video player that integrates with the **P2P Media Loader** library. Each instance of the library is referred to as a **peer**, and collectively, many peers form the P2P network.

**P2P Media Loader** initially downloads media segments over HTTP(S) from a source server or CDN to start media playback quickly. If no peers are available, it continues to download segments over HTTP(S), similar to a traditional media stream.

Subsequently, **P2P Media Loader** transmits media stream details and connection information, such as ICE candidates, to WebTorrent trackers. These trackers provide a list of other peers who are accessing the same media stream.

**P2P Media Loader** then connects with these peers to download additional media segments and simultaneously shares segments that it has already downloaded.

Periodically, random peers in the P2P swarm download new segments over HTTP(S) and distribute them to others via P2P.

## Web browsers support

### P2P Media Loader required browser features

- [WebRTC Data Channels](https://caniuse.com/mdn-api_rtcdatachannel)
- [Media Source Extensions](https://caniuse.com/mediasource) or [Managed Media Source](https://caniuse.com/mdn-api_managedmediasource)

### The features are fully supported across the most popular browsers

- Chrome
- Firefox
- macOS Safari
- iPadOS Safari (iPad)
- iOS Safari (iPhone, iOS version 17.1+)
- Edge
