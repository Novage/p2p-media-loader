# Verification streams

The design is judged against real streams, not only against fixtures. These are
the streams it is verified with, chosen so that every protocol, addressing mode
and live/VOD combination the design distinguishes has at least one real
instance. Changes that touch the registry, identity, or the playback contract
are run against this matrix in the demo before they are considered done.

## The matrix

| Protocol | Kind | Addressing                        | Stream                                                                                                                 | Exercises                                                                             |
| -------- | ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HLS      | VOD  | media playlist, no PDT            | `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`                                                                    | media-sequence timeline anchor, `ENDLIST`, 10 s TS segments, multiple variants        |
| HLS      | live | media playlist, PDT every segment | `https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8` | `programDateTime` timeline, sliding window, signed rendition URLs, `VIDEO` groups     |
| DASH     | VOD  | `SegmentTemplate` `$Number$`      | `https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd`                                                            | presentation-time identity, many representations, separate audio                      |
| DASH     | VOD  | `SegmentBase` (`sidx`)            | `https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd`                                                  | external segment index; the stream registers without segments until the index arrives |
| DASH     | live | `SegmentTemplate` `$Number$`      | `https://livesim2.dashif.org/livesim2/testpic_2s/Manifest.mpd`                                                         | `type="dynamic"`, MPD refresh, availability window                                    |
| DASH     | live | `SegmentTimeline`                 | `https://livesim2.dashif.org/livesim2/segtimeline_1/testpic_2s/Manifest.mpd`                                           | explicit `S` timeline, `$Time$` addressing                                            |

Every stream is played on every engine that supports its protocol: hls.js for
HLS; Shaka Player for both.

## What is checked

**Playback contract.** With `localStorage.debug = "p2pml:playback-oracle"`, the
core logs its estimated playhead beside the media element's `currentTime`. The
two must agree to within a `timeupdate` tick in steady state and after each of
the seek cases in [playback-contract.md](playback-contract.md): forward into
unbuffered media, backward into unbuffered media, backward inside the buffer,
and across a gap into an earlier buffered island. A delivered-but-not-appended
segment may show a one-segment overstatement that the next report corrects.

**Manifest interpretation.** With `localStorage.debug = "p2pml-core:manifest"`,
the core logs the registry it derives from each manifest: the streams, their
identity inputs, and each stream's segment count and timeline range. Every
segment the player requests must be found in that registry — a request that
misses it is reported through the registry-miss diagnostic
([manifest-registry.md](manifest-registry.md)) and, on these streams, there must
be none. Boundary deltas of tens of milliseconds between the manifest timeline
and the player's own are expected, because players correct fragment times to
demuxed timestamps and manifests are not.

**Cross-player sharing.** Two browser tabs on different engines, playing the
same stream, exchange segments — the demo's network view shows the peer and the
P2P share. This is the observable consequence of identity being derived from
the manifest ([segment-identity.md](segment-identity.md)).

## Fixtures

`packages/p2p-media-loader-core/test/fixtures/` holds frozen snapshots of the
mux master and 720p media playlists and of the IVS master and 720p media
playlist. They pin the parser and identity derivation in unit tests; the live
snapshot preserves a media-sequence number and PDT values as they were when
taken. The DASH addressing modes are covered there by hand-written MPDs, which
are deterministic where a live MPD is not.

## Stability of the streams

The DASH-IF `livesim2` simulator and the Shaka demo assets are maintained as
public test infrastructure. The mux stream is a widely used public test asset.
The IVS channel is a third party's live channel and may stop broadcasting; when
it does, any HLS live stream carrying `EXT-X-PROGRAM-DATE-TIME` on every segment
and signed rendition URLs exercises the same paths.
