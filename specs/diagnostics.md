# Diagnostics

The `debug` loggers show what happened. Diagnostics show the state now: which
resources are open, how many times each result occurred, and what went wrong
that must never go wrong. With a snapshot of this state, a test can find a leak,
a call into a destroyed object, or an unexpected result, without reading logs. The release tests in [release-testing.md](release-testing.md) use it, and
an AI assistant or a person reads it in the same way.

Diagnostics only observe. They never change what the library does.

## The ledger

One ledger in the core keeps four kinds of record:

| Record       | What it is                                                                            | Example                              |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------------------ |
| **Resource** | Something an owner must release. It is opened when acquired and closed when released. | a peer connection, a timer           |
| **Counter**  | A total that only increases: how many times a result occurred.                        | `Download:p2p:succeed`               |
| **Probe**    | A function that reads a live value when a snapshot is taken.                          | the peers that a swarm holds         |
| **Anomaly**  | A message about a state that must not occur.                                          | a close of a resource that is closed |

`open(kind, detail)` returns a token, `Kind#n`. The owner keeps the token, and
gives it back to `close(token, cause)`. A close of a token that is not open, or
a close with no token, is recorded as an anomaly: it is a double release, or a
release of something never acquired.

`snapshot()` returns:

- the number of open resources of each kind;
- each open resource, with its token and detail;
- each counter;
- the value of each probe, read at that moment;
- each anomaly.

`clearAnomalies()` removes the anomalies, so that one test step does not report
the anomalies of the step before it. Counters are never reset: a reader
subtracts two snapshots.

## Enabling

Diagnostics are off by default. They are on when the `debug` namespace
`p2pml:diagnostics` is enabled at the ledger's first record, which is when the
first core or adapter on the page starts: for example,
`localStorage.debug = "p2pml:diagnostics"` before the page loads. Any pattern
that enables the namespace enables diagnostics, as for every other logger. The
setting is read once; a change applies after the next load. The demo's logger
selector lists the namespace like the others.

When they are on, `globalThis.__p2pmlDiagnostics` holds `snapshot()` and
`clearAnomalies()`.

Each open and close is also logged, under its own namespace,
`p2pml:diagnostics:log`. It is separate because a busy page opens and closes a
record for every request and download: logged by default, those lines push
everything else out of the console's buffer. A pattern such as `p2pml:*`
enables both.

When they are off, each call returns at once. The ledger keeps no record,
installs no global, and holds no reference.

The published packages contain the ledger. A compile-time switch cannot remove
it: each package also publishes the plain `tsc` output, and `tsc` replaces no
constants. The cost when off is one check per call. A call occurs once per
resource, request or result, never per byte or per data-channel chunk.

The records stay in the page. Diagnostics never send data anywhere. The details
can contain stream URLs and peer ids, as the `debug` logs do.

The ledger is not a public API. The core's own code imports it. The adapters
reach it as `Core.diagnostics`, a static property marked `@internal`, so it is
in neither the API documentation nor the published type declarations. An
adapter can meet a core of another version, and a named import that the core
does not export fails the adapter's module when it loads. A property of `Core`,
the class every adapter imports already, is typed as possibly absent instead:
each adapter call is `Core.diagnostics?.open(…)`, and a core without the ledger
costs the adapter its records, not its load. The kinds and names can change in
any release; [release-testing.md](release-testing.md) is the document that
depends on them.

## Rules

These rules apply to the code that exists and to every change.

**1. Each owner records each resource it holds.** A resource is anything that an
owner must release:

- a connection: an `RTCPeerConnection`, a data channel, a `WebSocket`;
- a timer;
- a listener on an object that the owner did not create: the media element, a
  player, `window`, `document`;
- a registration with a player: a plugin, a scheme, a request filter, a hook;
- a storage;
- a request in progress;
- a kept manifest.

The owner opens the record where it acquires the resource and closes it where
it releases it, in the same class. It keeps one token for each acquisition, and
clears the token when it closes. It closes on every path that releases the
resource: destroy, failure, and replacement. The close gives the cause, for
example `fired`, `cleared`, `destroyed` or `failed`.

**2. A timer that fires after its owner was destroyed is an anomaly.** Destroy
clears the owner's timers, so such a callback is a timer that destroy missed.
The callback records the anomaly, then does what it did before: the record
shows the call, it does not stop it. Event handlers and asynchronous
continuations are not checked. An event already being dispatched, or a
response already on its way, can reach an owner after destroy as a normal
race, and an anomaly for it would be a false alarm.

**3. Each result is a counter.** Each outcome of a request (by source and
result), each registry miss, each eviction (by reason), each closed peer (by
cause), and each clock synchronization and re-parse (by result) adds to a
counter. A counter name is `Area:qualifier:result`, from fixed words. A name
never contains a URL, an id or a number: the set of names must stay small.

**4. A state that can drift has a probe.** Where two parts of the code must
agree on a value, each part has a probe, and a reader compares them. Example:
the peers that a swarm's connection manager holds, and the peers that its P2P
loader wraps. A probe returns plain data. Its owner removes it on destroy. A
probe name can contain a short prefix of a swarm id, to tell swarms apart.

**5. Diagnostics observe only.** A diagnostics call never changes control flow,
never throws (the ledger catches its own errors and the errors of probes), and
never keeps a reference to the resource: a record holds strings only. A detail
is cheap to make: a short id or a string that exists already. It is never an
object serialized for the record.

**6. The records change in the same change.** A change that adds, changes or
removes a resource owner adds, changes or removes its records in the same
commit or pull request, as with specs. A review checks that each new resource
has an open and a close on each path.

**7. Names.** A resource kind is a short name in PascalCase that says what is
held: `Peer`, `TrackerSocket`. An adapter's kinds start with the player:
`HlsFragmentLoader`, `ShakaRequestFilter`, `VhsXhrHooks`.

**8. Tests can use the ledger.** A unit test enables the ledger and checks that
after teardown no resource of its kinds is open and no anomaly was recorded.
The ledger has unit tests of its own: tokens, double close, probes that throw,
and the disabled state.

**9. One-off probes follow the same rules.** An investigation can need more
detail than the ledger keeps, for example a log line for each election. Such a
probe follows rules 3 to 5, and is removed when the investigation ends, or
becomes a permanent record under these rules.

## What is recorded

The code is the full list: each call to `diagnostics.open`, `count` and
`probe`, and each `Core.diagnostics?.open` in the adapters. This spec names
the groups and the cases a reader of a snapshot must know.

- **Resources:** in the core, the work on one source (`CoreSource`), each
  stream's loaders, peers, tracker clients and sockets, segment storage, player
  requests and download attempts, the media element listeners, and the clock
  timer, time requests and kept manifest of a clock-based list. In each
  adapter, its listeners, hooks, request filters and registrations on the
  player.
- **Counters:** downloads by source and result, player requests by result,
  registry misses, evictions by reason, closed peers by cause, and clock
  synchronizations and re-parses by result.
- **Probes:** each segment storage's size; the peers that each swarm's
  connection manager holds (`PeersHeld`) and its P2P loader wraps
  (`PeersWrapped`), which must be equal; and each hybrid loader's playhead
  estimate (`Playhead:<main|secondary>`), with the source it is based on.
- **Anomalies:** a close of a token that is not open or of no token, and the
  timers under rule 2.

A record is only kept where the owner's release is certain. An object that
its player can drop without a release — an HLS.js playlist loader whose load
settled — has no record, because it would read as a leak.

Some resources are released late by design, and are not leaks:

- A stream's P2P loader stays for `p2pInactiveLoaderDestroyTimeoutMs` after
  the player leaves the stream, if it holds segments that peers can still take.
- `CoreSource` closes on `destroy()`, not when a player stops playing.
- A Shaka scheme registration is the integrator's: it stays open until
  `unregisterPlugins`.

After every player and core on a page is destroyed and these delays have
passed, no resource is open.

The ledger sees only what the library holds. An object that a player or an
integration owns — a player instance that a page did not destroy — is not in
it, and shows only as console errors or a growing heap.

## Reading a snapshot

A test takes a snapshot before a step and after it:

- **A leak** is a resource open in both snapshots whose owner the step
  destroyed: for example, a `P2PLoader` of the previous stream after a stream
  change.
- **An unexpected result** shows in the counter differences: for example,
  `RegistryMiss` that grows on a stream where there must be none, or
  `Download:p2p:failed` that grows while both peers stay connected.
- **A drift** shows as two probes that disagree, such as `PeersHeld` and
  `PeersWrapped` for one swarm.
- **A playhead estimate that is wrong** shows in `Playhead`: between two
  snapshots, the estimate must move as far as the media element's
  `currentTime`. The core's estimate is in manifest time and the player's time
  may be offset from it, so compare the distances moved, never the values
  ([playback-contract.md](playback-contract.md)).
- **No P2P between two tabs** is read with the swarms of their open P2P
  loaders, the detail of each `P2PLoader` record. Tabs on different renditions
  are in different swarms and share nothing, which is correct.
- **Any anomaly** is a defect, until it is explained.
