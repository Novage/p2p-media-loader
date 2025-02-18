# P2P Media Loader

[![GitHub ations workflow status](https://img.shields.io/github/actions/workflow/status/Novage/p2p-media-loader/check-pr.yml?logo=github&color=%23347d39)](https://github.com/Novage/p2p-media-loader/actions/workflows/check-pr.yml)
[![npm version](https://img.shields.io/npm/v/p2p-media-loader-core?logo=npm&logoColor=white)](https://npmjs.com/package/p2p-media-loader-core)
[![jsDelivr hits (npm)](https://data.jsdelivr.com/v1/package/npm/p2p-media-loader-core/badge?style=rounded)](https://www.jsdelivr.com/package/npm/p2p-media-loader-core)

**P2P Media Loader** is an open-source JavaScript library that uses modern browser technologies — like HTML5 video and WebRTC — to enable peer-to-peer (P2P) media delivery. It integrates seamlessly with popular HTML5 video players and requires no additional browser plugins or add-ons. Try the [demo](http://novage.com.ua/p2p-media-loader/demo.html) to see it in action.

This library makes it possible to build large-scale P2P mesh networks — often called peer-to-peer content delivery networks (P2P CDN), Hybrid CDN, Multi CDN, peer-to-peer television (P2PTV), or Enterprise Content Delivery Networks (eCDN) — enabling users who are watching the same live or on-demand (VOD) streams via HLS or MPEG-DASH to share traffic in real time.

## Why Use Hybrid CDN + P2P Delivery?

- **Works Everywhere:**
  P2P Media Loader **supports all modern desktop and mobile browsers** — Chrome, Safari, Edge, Firefox, and Opera — across Windows, macOS, Android, iOS, iPadOS, and Linux. Check out our [guide](https://novage.com.ua/blog/setting-up-p2p-video-on-a-web-page-in-5-minutes-for-free) to set up P2P video in five minutes. You can also [embed](https://novage.com.ua/blog/integrate-p2p-video-streaming-into-mobile-application) it into **native iOS and Android** apps and use it with **native players**.

- **No Setup Cost and No Server Software Needed:**
  For smaller setups (1,000–2,000 simultaneous viewers), public trackers alone can handle peer connections. This means you **don’t need to install or maintain any additional server-side components** in many cases. **Free** alternatives are available for larger setups that can handle 100k simultaneous peers and above. Check our article on [running dedicated trackers](https://novage.com.ua/blog/p2p-video-delivery-for-up-to-100k-viewers-for-free).

- **Reduced Load on Origin:**
  Offloading requests from the CDN or media server to peers eases the strain on centralized infrastructure, increasing system reliability.

- **Significant Cost Savings:**
  With less bandwidth required from your primary video source, you can dramatically cut CDN or hosting expenses.

- **Enhanced Total Bandwidth:**
  When viewers share video data among themselves, they collectively expand overall network capacity, leading to smoother streaming for everyone.

- **Flexible for Live & VOD:**
  Whether you’re streaming live events or on-demand videos, P2P Media Loader supports both scenarios without added complexity.

- **eCDN (Enterprise Content Delivery Network) Approach:**
  In enterprise environments, you have full control over the internal network. This means peers can easily interconnect with minimal constraints, ensuring reliable, high-quality internal media delivery (e.g., multiple screens, desktops, and mobile devices across an organization) without straining external bandwidth or internal infrastructure.

## Related Software

- [wt-tracker](https://github.com/Novage/wt-tracker): a high-performance WebTorrent tracker for Node.js using [µWebSockets.js](https://github.com/uNetworking/uWebSockets.js).
- [Aquatic](https://github.com/greatest-ape/aquatic): a high-performance WebTorrent and BitTorrent tracker written in Rust.
- [bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker): official WebTorrent tracker implementation for Node.js.

## Documentation and Important Links

- Guides [for HTML pages and web apps](https://novage.com.ua/blog/setting-up-p2p-video-on-a-web-page-in-5-minutes-for-free) and [for native mobile apps](https://novage.com.ua/blog/integrate-p2p-video-streaming-into-mobile-application)

- [API documentation](https://novage.github.io/p2p-media-loader/docs/v2.2/)
- [P2P development, support & consulting](https://novage.com.ua/)
- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [Contributing to our project](https://github.com/Novage/p2p-media-loader/blob/main/CONTRIBUTING.md)
- [FAQ](https://github.com/Novage/p2p-media-loader/blob/main/FAQ.md)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- npm packages
  - [Core](https://npmjs.com/package/p2p-media-loader-core)
  - [Hls.js integration](https://npmjs.com/package/p2p-media-loader-hlsjs)
  - [Shaka Player integration](https://npmjs.com/package/p2p-media-loader-shaka)
- ES modules CDN
  - [Core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/dist/)
  - [Hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/dist/)
  - [Shaka Player integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/dist/)

## Web Browsers Support

- **Chrome** on desktops and Android
- **Firefox** on desktops and Android
- **Sarafi** on macOS
- **Safari** on iPadOS (iPad)
- **Safari** on iOS (iPhone, iOS version 17.1+ required)
- **Edge** on Windows

## Key Features

- Supports live and VOD streams over HLS or MPEG-DASH protocols
- Supports multiple HTML5 video players and engines:
  - Engines: Hls.js, Shaka Player
  - Video players: [Vidstack](https://www.vidstack.io/), [Clappr](http://clappr.io/), [MediaElement](https://www.mediaelementjs.com/), [Plyr](https://plyr.io/), [DPlayer](https://dplayer.diygod.dev/), [OpenPlayerJS](https://www.openplayerjs.com/), [PlayerJS](https://playerjs.com/) , and others that support Hls.js or Shaka video engines. These players can be integrated via custom integration with the library API.
- Supports adaptive bitrate streaming of HLS and MPEG-DASH protocols
- There is no need for server-side software for simple use cases. By default **P2P Media Loader** uses publicly available servers:
  - WebTorrent trackers - [https://tracker.novage.com.ua/](https://tracker.novage.com.ua/), [https://tracker.webtorrent.dev/](https://tracker.webtorrent.dev/), [https://openwebtorrent.com/](https://openwebtorrent.com/)
  - STUN servers - [Public STUN server list](https://gist.github.com/mondain/b0ec1cf5f60ae726202e)

## Key Components of the P2P Network

All the components of the P2P network are free and open-source.

![P2P Media Loader network](https://raw.githubusercontent.com/Novage/p2p-media-loader/gh-pages/images/p2p-media-loader-network.png)

**P2P Media Loader** required browser features are:<br>

- [WebRTC Data Channels](https://caniuse.com/mdn-api_rtcdatachannel) to exchange data between peers
- [Media Source Extensions](https://caniuse.com/mediasource) or [Managed Media Source](https://caniuse.com/mdn-api_managedmediasource) are required by Hls.js and Shaka Player engines for media playback

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
