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

Each anomaly is also logged, under `p2pml:diagnostics`. Each open and close is
logged under a namespace of its own, `p2pml:diagnostics:log`. It is separate
because a busy page opens and closes a record for every request and download:
logged by default, those lines push everything else out of the console's
buffer. A pattern such as `p2pml:*` enables both.

When they are off, each call returns at once. The ledger keeps no record,
installs no global, and holds no reference.

The `tsc` output in `lib/`, which bundler consumers use, contains the ledger:
`tsc` replaces no constants. There the cost when off is one check per call, and
a call occurs once per resource, request or result, never per byte or per
data-channel chunk. The prebuilt `dist/` bundles contain none of it. Each Vite
build defines `__P2PML_DIAGNOSTICS__` as `false`, which makes `diagnostics`
`undefined`, and the minifier then removes every `diagnostics?.…` call with
its arguments ([packaging.md](packaging.md)). A page that loads a `dist/`
bundle cannot turn diagnostics on.

The name `__P2PML_DIAGNOSTICS__` is public, although the ledger is not: the
README tells integrators who bundle `lib/` to define it as `false`, which
removes the ledger from their build in the same way. Renaming it is a breaking
change.

The records stay in the page. Diagnostics never send data anywhere. The details
can contain stream URLs and peer ids, as the `debug` logs do.

The ledger is not a public API. The core imports it, as `diagnostics`, which is
`undefined` in a bundle; every call is therefore `diagnostics?.open(…)`. The
adapters reach it through `Core.diagnostics`, a static property marked
`@internal`, so it is in neither the API documentation nor the published type
declarations. An adapter can meet a core of another version, and a named
import that the core does not export fails the adapter's module when it loads.
A property of `Core`, the class every adapter imports already, is typed as
possibly absent instead, and a core without the ledger costs the adapter its
records, not its load. Each adapter reads it once, in its own
`src/diagnostics.ts`, which also honours `__P2PML_DIAGNOSTICS__`, so that its
calls are removed from its own bundles too. The kinds and names can change in
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
cause), each parse of a player's manifest and each clock synchronization and
re-parse (by result), and each decision the code makes on the player's behalf
(by result, whichever way it went) adds to a counter. A new branch that ends
in a different outcome — a failure, a fallback, a correction — is a new
result, and gets its counter in the same change. A counter name is `Area:qualifier:result`, from fixed words. A name
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

## Checking a change

Rule 6 is the one most easily forgotten: diagnostics are not in the way of a
change working, so nothing fails when they are missing. Before a change to
`packages/*/src` is reported done, its author — person or AI agent — goes
through this list, and the report says what was added or why nothing was
needed:

1. **Resources.** Each listener, timer, connection, registration, storage,
   request or kept object the change acquires has an `open` where it is
   acquired and a `close` on every path that releases it: destroy, failure,
   replacement. Each timer is cleared on destroy, and its callback records an
   anomaly if it runs after destroy (rule 2). A timer scheduled more than once
   keeps one record at a time.
2. **Results.** Each new outcome — a new branch that fails, falls back,
   corrects, or decides on the player's behalf — has a counter (rule 3), for
   each way it can go, not only the interesting one.
3. **Drift.** A value that two parts of the code must agree on has a probe
   (rule 4).
4. **A test.** A unit test enables the ledger and checks that after teardown
   no resource of the change's kinds is open and no anomaly was recorded, and
   that the counters move as the change says (rule 8). Removing the change's
   release step must make that test fail.
5. **This spec.** "What is recorded" names any new group of counters a reader
   of a snapshot must know.

## What is recorded

The code is the full list: each call to `diagnostics?.open`, `count` and
`probe`, in the core and in the adapters. This spec names
the groups and the cases a reader of a snapshot must know.

- **Resources:** in the core, the work on one source (`CoreSource`), each
  stream's loaders, peers, tracker clients and sockets, segment storage, player
  requests and download attempts, the media element listeners, and the clock
  timer, time requests and kept manifest of a clock-based list. In each
  adapter, its listeners, hooks, request filters and registrations on the
  player.
- **Counters:** downloads by source and result, player requests by result,
  registry misses, evictions by reason, closed peers by cause, parses of the
  player's manifests by result (`ManifestParse`), and clock synchronizations
  and re-parses by result. The Video.js adapter
  counts each live delay it writes (`VhsPlacement:applied`) and each VHS it
  cannot place (`VhsPlacement:unavailable`).
- **Probes:** each segment storage's size; the peers that each swarm's
  connection manager holds (`PeersHeld`) and its P2P loader wraps
  (`PeersWrapped`), which must be equal.
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
- **No P2P between two tabs** is read with the swarms of their open P2P
  loaders, the detail of each `P2PLoader` record. Tabs on different renditions
  are in different swarms and share nothing, which is correct.
- **Any anomaly** is a defect, until it is explained.
