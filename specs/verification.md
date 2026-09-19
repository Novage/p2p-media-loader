# Verification streams

The design is judged against real streams, not only against fixtures. These are
the streams it is verified with, chosen so that every protocol, addressing mode
and live/VOD combination the design distinguishes has at least one real
instance. Changes that touch the registry, identity, or the playback contract
are run against this matrix in the demo before they are considered done.

## The matrix

| Protocol | Kind | Addressing                        | Stream                                                                                                                 | Exercises                                                                                                                                                                                                             |
| -------- | ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HLS      | VOD  | media playlist, no PDT            | `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`                                                                    | media-sequence timeline anchor, `ENDLIST`, 10 s TS segments, multiple variants                                                                                                                                        |
| HLS      | live | media playlist, PDT every segment | `https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8` | `programDateTime` timeline, sliding window, signed rendition URLs, `VIDEO` groups                                                                                                                                     |
| DASH     | VOD  | `SegmentTemplate` `$Number$`      | `https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd`                                                            | presentation-time identity, many representations, separate audio                                                                                                                                                      |
| DASH     | VOD  | `SegmentBase` (`sidx`)            | `https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd`                                                  | external segment index: MP4 renditions gain segments when the index arrives; WebM (VP9) renditions have a `Cues` index and play without P2P                                                                           |
| DASH     | VOD  | `SegmentBase` (`sidx`)            | `https://dash.akamaized.net/dash264/TestCases/1a/netflix/exMPD_BIP_TC1.mpd`                                            | external index on the main video too: four AVC renditions plus AAC, every `indexRange` holds a `sidx` followed by a `uuid` box with a non-zero `first_offset`, so segments must be anchored on the box, not the range |
| DASH     | live | `SegmentTemplate` `$Number$`      | `https://livesim2.dashif.org/livesim2/testpic4_8s/Manifest.mpd`                                                        | three video renditions (two at one resolution, told apart by bitrate) plus audio, 8 s segments, one-minute window; the demo's default for dash.js players                                                             |
| DASH     | live | `SegmentTemplate` `$Number$`      | `https://livesim2.dashif.org/livesim2/testpic_2s/Manifest.mpd`                                                         | `type="dynamic"`, MPD refresh, availability window                                                                                                                                                                    |
| DASH     | live | `SegmentTimeline`                 | `https://livesim2.dashif.org/livesim2/segtimeline_1/testpic_2s/Manifest.mpd`                                           | explicit `S` timeline, `$Time$` addressing                                                                                                                                                                            |

Video.js plays every stream in the table except the two `SegmentBase` ones,
neither of which VHS plays with P2P or without it. On the Netflix stream VHS
lays the subsegments out through `mpd-parser`, which anchors them on the end of
the index range rather than on the `sidx` box (see
[manifest-registry.md](manifest-registry.md)), requests media 6297 bytes too
far, and fails with `MEDIA_ERR_DECODE`. On `angel-one` VHS fetches the indexes
and then abandons every rendition in turn, the audio track first. The registry,
which anchors correctly, does not know the ranges VHS asks for, so those
requests pass through untouched — the right outcome for a player asking for
bytes that are not segments. Check both against plain Video.js before reading
anything into them.

Not in the table on purpose: `dash264/TestCases/2a/qualcomm/1/MultiResMPEG2.mpd` is a `SegmentBase` stream whose media Chrome refuses to append (Shaka error 3014), on Shaka's own demo page as much as here. It is not a P2P problem; do not use it to judge one.

Every stream is played on every engine that supports its protocol: HLS.js for
HLS; dash.js for DASH; Shaka Player and Video.js for both. Video.js 10 hosts
the HLS.js and dash.js engines rather than bringing one of its own, and is
played through both.

Also not a P2P problem, and Firefox only: Vidstack calls its dash.js provider
ready when dash.js reports the manifest loaded, and autoplays there, while
dash.js is still attaching its MediaSource; attaching it replaces the source
on the media element and aborts that play request, leaving the player paused
on a ready stream. The demo's Vidstack dash.js player plays once more when the
media is ready. It reproduces with P2P switched off.

## Isolating a test swarm

The default swarm ID is the manifest URL, so every demo instance playing one of
these public streams — on any machine, on any branch that shares the peer
protocol version — joins the same swarm through the public trackers. That is
what the design intends for production, and the wrong thing for a measurement:
a stranger's peer supplies segments, or takes them, and the result no longer
says anything about the two peers under test. A stray peer on a different
build of the same protocol version can also mask a real defect, or invent one.

When the outcome depends on which peers are present — the cross-player check,
anything measuring P2P share, anything that behaves differently with and
without a peer — run every peer under test with a swarm ID nobody else uses.
The demo takes it as a query parameter, and the same value must be given to
each peer that should meet:

```
http://localhost:5173/?swarmId=my-test-2026-09-14&streamUrl=…
```

A configured `swarmId` replaces the manifest URL in every stream swarm ID
([segment-identity.md](segment-identity.md)), so the peers still share exactly
the streams they would share in production; only the audience changes.

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
misses it is reported through the registry-miss diagnostic and logged under
`p2pml-core:registry-miss` ([manifest-registry.md](manifest-registry.md)) and,
on these streams, there must be none. On a live stream this is the check that
matters: a player fetching at the live edge misses every segment, which costs
all P2P and nothing else, so playback looks perfect while the log is silent.
Boundary deltas of tens of milliseconds between the manifest timeline and the
player's own are expected, because players correct fragment times to demuxed
timestamps and manifests are not.

**Cross-player sharing.** Two browser tabs on different engines, playing the
same stream **at the same rendition**, exchange segments — the demo's network
view shows the peer and the P2P share. This is the observable consequence of
identity being derived from the manifest
([segment-identity.md](segment-identity.md)).

Pin the rendition in both tabs with the demo's quality selector before reading
anything into the result. A rendition is a swarm, and each engine's adaptive
bitrate logic picks one on its own measurements, so two engines left on Auto
usually sit in different swarms and share nothing. That is the engines
disagreeing about quality, not P2P failing to work.

## Fixtures

`packages/p2p-media-loader-core/test/fixtures/` holds frozen snapshots of the
mux master and 720p media playlists and of the IVS master and 720p media
playlist. They pin the parser and identity derivation in unit tests; the live
snapshot preserves a media-sequence number and PDT values as they were when
taken. The DASH addressing modes are covered there by hand-written MPDs, which
are deterministic where a live MPD is not.

## Stability of the streams

The DASH-IF `livesim2` simulator and the Shaka demo assets are maintained as
public test infrastructure. `livesim2` allows 10000 requests per IP address per
day, which a day of two-tab live runs can reach; past it every request answers
`429` and dash.js reports error 25, "manifest is not available". Its
`/reqcount` says where the count stands and when it resets. The mux stream is a
widely used public test asset.
The IVS channel is a third party's live channel and may stop broadcasting; when
it does, any HLS live stream carrying `EXT-X-PROGRAM-DATE-TIME` on every segment
and signed rendition URLs exercises the same paths.
