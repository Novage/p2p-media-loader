# Encrypted content

Encrypted streams are shared like any other. Nothing about encryption changes
identity, the registry, or scheduling. What follows are the rules that keep that
true, and the one class of content to which none of it applies.

## Core handles ciphertext only

Core sits at the network boundary, which is upstream of every decryption path:
players decrypt after their loader returns, in the transmuxing or media-source
stage. What core receives, stores, and sends to a peer is exactly what the CDN
would have sent — ciphertext.

This is not merely how it happens to work. It is required:

> **Core never decrypts, and never stores or transmits decrypted media.**

A cache of cleartext is a distribution channel for unprotected content. If a
future integration point ever offers core decrypted bytes, they are not to be
stored or seeded.

## Key and licence requests are never registered

`EXT-X-KEY` and `EXT-X-SESSION-KEY` URIs, DASH licence server requests, and
licence acquisition for FairPlay, Widevine or PlayReady are not segments and are
never entered into the registry. They travel the player's own path, untouched.

These requests are bound to a viewer's entitlement rather than to the content.
Serving one from a peer would both break the licence model and hand a key to a
client the licence server never authorised.

**An adapter whitelists the request types it handles — manifest and segment —
and passes everything else through untouched.** It never works by excluding
known key types, because the set of request types a player emits grows: Shaka's
`RequestType` alone carries `LICENSE`, `KEY`, `SERVER_CERTIFICATE`, `TIMING`,
`ADS` and `CONTENT_STEERING` beside the two that matter, and a blacklist written
today is wrong after the next release.

The risk is uneven across players, which is why the rule is stated rather than
left to each adapter:

- **HLS.js** loads keys through a separate `KeyLoader` built on `config.loader`,
  so they never reach the segment hook at all.
- **Shaka** routes every type through one scheme plugin, so the whitelist is
  what keeps licences out.
- **dash.js** likewise funnels licence traffic through its `HTTPLoader`.

## Encryption does not affect identity

A segment's identity comes from its position — media sequence number for HLS,
presentation time for DASH — never from its cryptographic parameters. An
initialization vector, whether given by `EXT-X-KEY` or derived from the media
sequence number, is not an input to `externalId`. Key rotation mid-stream does
not renumber anything.

Two viewers holding different licences still receive byte-identical media for
the same segment, because the packager encrypts each segment once and serves
that one ciphertext to everyone. Swarm membership is therefore unaffected by
which viewer holds which key. See [segment-identity.md](segment-identity.md).

## Per-session media must not be shared

The premise above — one ciphertext for all viewers — fails for content that is
varied per viewer:

- **Forensic watermarking** that serves each session a different variant of the
  same segment.
- **Per-session encryption**, where the packager encrypts per viewer rather than
  per asset.

For such content, two peers requesting "the same" segment legitimately need
different bytes, and a swarm would serve the wrong ones — the single failure
this design does not tolerate anywhere else. It cannot be detected from the
manifest, because the URLs and identities look ordinary.

P2P must therefore be switched off for per-session-variant content by
configuration, by the integrator who knows their packaging. Core cannot infer
it.
