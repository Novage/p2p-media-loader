# Known issues

The problems known in the code on this branch, and the release test runs that
found them. A change that fixes an issue, or finds a new one, updates this file
in the same commit. A fixed issue leaves the file: [CHANGELOG.md](CHANGELOG.md)
and the commit record it.

The tests themselves are in
[specs/release-testing.md](specs/release-testing.md).

## Open

- **Video.js 10 without `autoplay` plays about 10 s from the live edge and
  gets almost no P2P.** Without `autoplay`, Video.js 10.0.1 seeks once at the
  first `play` to the end of the seekable range less the playlist's
  `HOLD-BACK`, or less three target durations. It ignores HLS.js's live
  position, which the engine sets, and the adapter cannot see or stop the
  seek. Two peers on the USP DVR stream (3 s segments): with `autoplay`, they
  played 55–56 s from the edge and took 34 of 72 segments over P2P; without
  it, 10–12 s from the edge, every request was urgent, and 2 of 62 came over
  P2P. On a low-latency playlist, the same seek uses `PART-HOLD-BACK` with
  `lowLatencyMode` off, and moved the player to 2.17 s from the edge, where
  HLS.js's own position was 5.75 s. The demo sets `autoplay`, and
  [specs/player-adapters.md](specs/player-adapters.md) tells integrators to.
  The fix belongs in Video.js, and is proposed in
  [videojs/video.js#9409](https://github.com/videojs/video.js/pull/9409):
  seek to HLS.js's `liveSyncPosition`. Tested in this demo, it kept two peers
  57–61 s from the edge with 31 of 64 segments over P2P.
- **Peers sometimes lose their connection** in a test, and with no retry by
  design a short test then ends without a peer. A rerun of release test 7
  with the tracker log made 40 joins, each with a peer within 15 s, and no
  handshake failed. For about 1.5 minutes ICE gathering did not complete,
  probably because the STUN servers did not answer, so each offer and answer
  waited the full 5 s gathering timeout. Every test ran on one machine; Part 2,
  on real networks, judges this.
- **The yield to an urgent request works for each stream type.** Video and
  audio have separate loaders. An urgent video request stops the other HTTP
  downloads of the video loader only, and the audio loader's prefetch goes
  on; the same holds the other way round. The cost is small: an audio segment
  is about 33 KB, a video segment 0.3–7 MB. The fetch priorities cover the
  case that matters, an urgent audio request beside video prefetch: on HTTP/2
  and HTTP/3 the browser gives the urgent request the bandwidth first, and on
  any protocol it leaves the browser's queue for the host first. A yield
  across both loaders would need the urgent state in `Core`.
- **dash.js asks for one segment the clock-based list does not hold yet** at
  `play()` on livesim2, video and audio of the same number, in 3 of 6 tab
  runs, with the real clock too; none in the rerun. The request goes to the
  player's own HTTP, and playback is not affected, but release test 11 allows
  no registry miss.
- **The final static MPD of a live DASH stream that ends blocks the page** for
  1.9–2.1 s, where release test 11 allows 1 s. When livesim2 stops a stream,
  its final MPD lists every segment since 1970, and the parser builds that
  list in full. A manifest that fails to parse stops the kept clock-based
  list, so the core stops re-parsing; the one parse still blocks. The final
  MPD of a real event counts from the event's own start.
- **Dropped frames**, up to 27 %, in one of two dash.js tabs on bbb, with high
  renditions decoding in both; 0 % in another run.
- **In a 60-minute run both tabs stalled twice at the same moments**, with a
  missing segment in both buffers. Most likely the origin; not proven.

## Watch: seen once, not reproduced

- **Shaka on bbb at rate 2 stopped for about 2 minutes**: one segment was
  asked for again and again, and its HTTP download never completed, until a
  seek. Not reproduced in two fresh runs, nor in five more runs made to
  investigate it. Those runs explain the shape of the stall: Chrome plays
  audio for 2–3 s after the video runs out, so the playhead passes the end of
  the buffer, and the stall is a wait for the next video segment over HTTP.
  Two causes of a slow segment were seen. The origin (HTTP/1.1, 4K segments of
  7.2 MB) slowed to about 8 Mbit/s for 20 s, and a 720p segment took 14.8 s.
  With HTTP limited to 3 Mbit/s, Shaka moved up from 576p to 720p at rate 2
  with an empty buffer, because the core reports a bandwidth that includes P2P
  downloads while an urgent request goes over HTTP (see "Decided" below). Why
  the request repeated about every 8 s is not confirmed; a rendition change at
  Shaka's 8 s switch interval, which stops the download, is the likely cause.
- **One frame stayed at 24 s for most of a Shaka run on bbb**, without a
  pause, after the change that keeps the bytes of stopped downloads; its logs
  were lost. Eight more runs with a stall detector, which saves the logs and
  the state of every request, did not reproduce it.
- **Two tabs that join a swarm at the same moment waited about 110 s** for each
  other, after 20 fast player changes. Six later runs, three with the same
  sequence and one swarm id, connected within 2.2 s each time. The wait
  matches one failed first handshake and the 120 s default announce interval.
  That run had no tracker log; release test 9 now records it.
- **On dash.js with a clock-based MPD, one peer sometimes fetched every new
  segment from the origin**, twice with older code. Two dash.js tabs on
  livesim2 `testpic_2s` for 10 minutes, one tab hidden all the time, split the
  HTTP work evenly (294 and 284 segments) and made no backup fetch. It may
  need conditions that test did not have: more than two peers, clocks that
  differ between machines, or a network that delays one peer's MPD refreshes.

## Explained: not a defect in P2P Media Loader

- **dash.js can fail to start the Netflix `SegmentBase` VOD.** The MPD gives
  two video renditions an `indexRange` that starts one byte before their
  `sidx` box. dash.js then searches for the box, reads a wrong box size, and
  asks for bytes about 1.9 GB and 3.7 GB into the files. The origin answers
  `200` with the whole files, 14 MB and 20 MB, and dash.js starts only when
  both arrive within its 20 s request timeout. Plain dash.js does the same;
  the failures came when the origin was slow. See
  [specs/verification.md](specs/verification.md).
- **Raw HLS.js seeks on the mux VOD take 2–14 s, where Video.js 8 takes under
  1 s.** A seek outside the buffer costs the download of one 10 s segment at
  the player's rendition. HLS.js, with or without the engine, chose 720p or
  1080p and took a median of 3.1–3.4 s for each seek. Video.js 8 limits its
  rendition to the player's size (184p on a 320-pixel element) and took 0.7 s;
  without that limit it chose 288p–720p and took 1.4–1.8 s. Release test 4
  compares a player only with the same player without P2P.
- **Video.js 10 at rate 2 on the 1080p mux VOD.** At 1080p and rate 2, Chrome
  drops about 30 % of the frames with P2P, without WebRTC and beside a second
  peer alike, and HLS.js lowers the quality to 184p step by step: the decoder,
  not P2P.

## Decided: kept by design

- **No retry after a failed WebRTC handshake**, and no reconnect of a dropped
  peer. Two peers then stay apart until the tracker's next announce, up to
  120–180 s. Most failures on the Internet are pairs of networks that cannot
  connect, which a retry does not fix, and in a larger swarm other peers'
  offers arrive every 12–36 s.
- **The core reports P2P and HTTP bandwidth together to the player.** With
  fast P2P, the player can choose a rendition that HTTP alone cannot deliver;
  if its urgent request then goes over a slow HTTP link, playback waits for
  that segment (6.5 s with HTTP limited to 3 Mbit/s).
- **A stale tracker count can make a joining peer send one offer too few.**
  This occurs when the player goes from rendition A to B and back to A
  within one tracker round trip, with nothing of A stored, so that a new
  client for A starts on the socket where the old one sent `stopped`.
  bittorrent-tracker (tracker.webtorrent.dev) answers that `stopped` with a
  count that leaves this peer out, and the new client takes it for the
  reply to its own `started`. That count is one too small. With one other
  peer, it shows this peer alone, and a later count corrects it. With two to
  `webRtcOffersCount` other peers, one of them gets no offer through that
  tracker. With more, the cap hides the error. With the default trackers,
  the other two count correctly and offer to all peers; with one
  bittorrent-tracker only, that peer can wait up to 120 s. In the same race,
  a refusal of the old client's announce could stop the new client's first
  offers; bittorrent-tracker refuses only by swarm, so it refuses both. The
  fixes cost more than this rare case: more offers after the correct count
  reach a random peer, not the missed one; ignoring the reply after a
  `stopped` loses the real reply on trackers that do not answer `stopped`;
  and sizing from the full count wastes one connection at every join.
- **A tracker that refuses a swarm still gets full offers in each periodic
  announce.** After a refusal (`failure reason` with this swarm's
  `info_hash`, for example from a bittorrent-tracker `filter`), the client
  sends no offers after "started", but each periodic announce still gathers
  `webRtcOffersCount` offers, which the tracker refuses again. That is 5
  connections for the 50 s offer timeout at each interval, as before the
  offers were sized to the swarm. It occurs only with a tracker that refuses
  the swarm, which is a deployment's own setup, and the default trackers
  accept every swarm.

## Release test runs

- **Third run of Part 1, 10–12 October 2026, complete**, for the
  request-based urgency. Every test passed in Chrome; the stream matrix,
  pause, seeks, playback rate, the special streams and every player wrapper
  passed in Safari too. It stopped once, at test 11, for segments of
  multi-period live DASH streams that shared one identity, and went on after
  the fix. Its other findings are the items above.
- **Second run of Part 1, 9 October 2026**, for the shared playhead and the
  seek count. Each of its findings stopped playback for good, and each is
  fixed; the shared playhead it tested has since been replaced.
- **First run of Part 1**, before the Video.js placement, the HTTP timeouts and
  the bandwidth estimate per download, in two to five tabs per test. No step
  left a resource open, and no anomaly was recorded.
- **Part 2**, the tests a person runs on other devices and networks, is still
  to do.
