# Proposal: send an offer once the ICE servers' candidates are in

**Status: not adopted.** This is a candidate extension to the
[WebTorrent client spec](../../packages/p2p-media-loader-core/src/webtorrent/webtorrent-client/spec.md),
"ICE Gathering Timeout", recorded so that the decision to build it can be made
on measured connections rather than on the appeal of the idea. Today an offer
or an answer waits until the browser completes ICE gathering, or until
`webRtcIceGatheringTimeoutMs` (5 s) has passed.

## The gap it closes

The WebTorrent tracker protocol carries one SDP per offer or answer, with every
candidate in it: there is no trickle ICE. So the client waits for gathering to
end before it sends. On some hosts gathering does not end although every
candidate a peer needs is in.

Measured on 19 October 2026, in Chrome on Ubuntu, on a host with IPv6 enabled
(NetworkManager's `ipv6.method` `auto`) on a network that gave it no IPv6: its
interface kept only a link-local IPv6 address, and it had no IPv6 route. glibc
counts the link-local address, so `getaddrinfo` returned IPv6 addresses even
with `AI_ADDRCONFIG`:

- `stun.l.google.com`, the first of the default `rtcConfig.iceServers`,
  resolves to an IPv4 and an IPv6 address. Its server-reflexive candidate came
  from the IPv4 address in about 20 ms, 120 ms on a cold DNS cache. Gathering
  never completed, waiting on the IPv6 address: it was still open after 15 s.
  Google's server by its IPv4 address alone, and `global.stun.twilio.com`
  alone, each completed in about 120 ms.
- Each offer therefore went out 5.04 s after the "started" announce, at the
  gathering timeout.
- In release test 6, two tabs that switched to a rendition together held a
  peer there 5.0–6.0 s after their players switched, on HLS.js, dash.js and
  Video.js 8.
- An answer did not wait: Chrome completed the answerer's gathering in
  milliseconds.

With IPv6 disabled on the same host's interface (`ipv6.method` `disabled`),
which removed the link-local address, `getaddrinfo` with `AI_ADDRCONFIG`
returned only the IPv4 address, gathering with the default servers completed in
123–160 ms, offers went out 159–166 ms after the "started" announce, and the two
tabs held a peer in the same second as their players' switch, with the client
unchanged. A Mac on the same network had no delay.

Every swarm join pays the 5 s: startup, a quality switch, a stream change. 4.x
has the same client and the same wait. So does WebTorrent in the browser:
`bittorrent-tracker` 11.2.3 builds its peers on `@thaunknown/simple-peer`
10.1.2 with `trickle: false`, which sends at the end of gathering or 5 s after
the first candidate, with the same two default STUN servers.

How common such hosts are is not known. The condition is a Linux host whose
IPv6 is on, as it is by default, on a network without IPv6, which is common in
homes and offices; but the measurement above is one machine, and macOS on the
same network was not affected. A user on such a host also fixes it alone, by
giving the host working IPv6 or disabling IPv6 on its interface; the proposal
would fix it for the users who do neither.

## Design

**The rule.** The wait for gathering ends at the first of:

1. the browser completes gathering (`iceGatheringState` "complete", or the null
   candidate), as today;
2. `webRtcIceGatheringTimeoutMs`, as today;
3. **a grace period after the configured servers' candidates are in**: a
   server-reflexive candidate when `rtcConfig.iceServers` names a `stun:` or
   `stuns:` URL, and a relay candidate when it names a `turn:` or `turns:` URL.
   Each further server-reflexive or relay candidate restarts the grace period,
   so a slower interface still gets in while candidates keep coming; the
   timeout still bounds the whole wait.

A configuration with a TURN server waits for its relay candidate, however soon
a server-reflexive one arrives: a peer behind a symmetric NAT needs it. A
configuration with no servers is unchanged; its gathering completes at once.

**Why not one candidate per server.** Browsers report a server-reflexive
address once. With the two default STUN servers on one public address, Chrome
reported Google's candidate and never Twilio's, so a rule that waited for each
server would wait for the timeout again.

**The grace period.** 500 ms in the prototype. It covers the same candidates on
the host's other interfaces, whose STUN round trips are close to the first
one's. Whether it is configurable, and whether 0 should turn the rule off, is
part of the decision; an integrator who raised `webRtcIceGatheringTimeoutMs` to
collect every candidate gets the early end anyway without such an option.

**Diagnostics.** Each wait is counted by how it ended:
`IceGathering:complete`, `IceGathering:server-candidates` and
`IceGathering:timeout`. The grace timer is a resource of the wait: cleared with
it on every path, and an anomaly if it runs after destroy.

**The prototype.** It was built and measured on 19 October 2026, without the
restart of the grace period, then removed. In two tabs in Chrome on the host
above:

- offers went out a median 571 ms after the "started" announce (12 swarm
  joins: 558 ms to 2.6 s), against 5.04 s;
- two tabs that switched to a rendition together held a peer there 0–1 s after
  their players switched, against 5–6 s;
- every wait ended by the servers' candidates; none timed out, and no anomaly
  was recorded.

Its unit tests used a connection whose gathering never completes, with
candidates emitted at chosen times: an offer 500 ms after a server-reflexive
candidate and not before; a TURN configuration waiting for the relay candidate;
the full timeout when no server answers; an offer at once when gathering
completes; the same rule for an answer; and a destroy during the grace period
leaving no record open and no anomaly. Each failed when its rule was removed
from the source.

## Risks

- **Candidates that arrive after the grace period are not sent.** A second
  interface (a VPN, Wi-Fi beside Ethernet) whose STUN answer is slower; a
  server-reflexive IPv6 candidate behind a slow IPv6 path; a second TURN server
  or a slower TURN transport. Restarting the grace period on each candidate
  narrows this, but a candidate more than the grace period after the last one
  is still left out. Two peers that could meet only through it do not connect,
  and both keep loading over HTTP.
- **Other browsers.** Firefox and Safari report candidates and end gathering
  in their own way. Where a candidate's type cannot be read, the rule does not
  fire, and the wait is as today.
- **Real networks.** The prototype was measured with both peers on one host.
  What a dropped late candidate costs shows only between devices on different
  networks.

## Prior art

No widely used WebRTC library ends gathering this way; projects that cannot
trickle reach for it one by one:

- SignalWire's Node SDK sends its SDP once it has a usable candidate —
  server-reflexive, peer-reflexive, relay, or a host candidate with a public
  address — checking from 1 s after the first candidate, every 250 ms, up to
  5 s
  ([signalwire-legacy-node#623](https://github.com/signalwire/signalwire-legacy-node/pull/623),
  merged).
- trinketworks/yession sends once no candidate has come for 100 ms, capped at
  1.5 s, with no STUN or TURN server configured
  ([yession#1077](https://github.com/trinketworks/yession/pull/1077), merged).
- go2rtc holds a WHIP answer 5–11 s for its default STUN servers, one of them
  `stun.l.google.com`; a cap of the wait is proposed
  ([go2rtc#2508](https://github.com/AlexxIT/go2rtc/issues/2508), open).
- On discuss-webrtc, a Chromium engineer advises an application without
  trickle ICE to set its own criteria or timeout for when to send, since the
  browser reports "complete" only when every attempt has timed out
  ([thread](https://groups.google.com/g/discuss-webrtc/c/7AZlGM8EQUI)).

## How to decide

1. **Count first, with no change of behaviour.** Add the three
   `IceGathering` counters alone, and collect diagnostics snapshots from real
   sessions on several networks and browsers. The share of waits that end by
   `timeout` is the share of swarm joins that would gain about 4.5 s.
2. **Measure what an early end costs.** Run the prototype in Part 2 of
   [release-testing.md](../release-testing.md): two devices on different
   networks, a symmetric NAT with a TURN server, a corporate network, and
   Firefox and Safari. Compare, with the rule and without it, the time to the
   first peer, the failed handshakes (the core's `onPeerConnectError`
   events), and the closed peers by cause (`PeerClosed:*`).

**Implement** when timeouts are a real share of swarm joins and the connection
failures do not grow. **Implement with an opt-out** when they grow on some
network that an integrator can name. **Do not implement** when timeouts are
rare outside test machines, or when connection failures grow and the cause
cannot be told from the network.
