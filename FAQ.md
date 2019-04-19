# P2P Media Loader - FAQ

- [What is tracker](#what-is-tracker)
- [Don't use public trackers in production](#dont-use-public-trackers-in-production)

# What is tracker?

`P2P Media Loader` uses WebTorrent compatible trackers to do [WebRTC](https://en.wikipedia.org/wiki/WebRTC) signaling - exchanging [SDP](https://en.wikipedia.org/wiki/Session_Description_Protocol) data between peers to connect them into a swarm

Few [public trackers](https://openwebtorrent.com/) are configured in the library by default for easy development and testing but [don't use public trackers in production](#dont-use-public-trackers-in-production).

Any compatible WebTorrent tracker works for `P2P Media Loader`:
- [wt-tracker](https://github.com/Novage/wt-tracker) - high-performance WebTorrent tracker by Novage that uses [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) for I/O.
- [bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker) - tracker from WebTorrent project that uses Node.js I/O

# Don't use public trackers in production

[Public trackers](https://openwebtorrent.com/) allow quickly begin development and testing of P2P technologies on the web.
But they support a limited number of peers (about 500o peers from all the swarms) and can reject peers or even go down on heavy loads.

That is why they can't be used in production environments. Consider running your personal tracker or buy resources from a tracker providers to go stable.
