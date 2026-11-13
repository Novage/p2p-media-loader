# Driving Safari

`safaridriver` is Apple's WebDriver for Safari, part of macOS, so an assistant
can drive the real Safari over HTTP with no other software. A person enables
it once:

1. In Safari > Settings > Advanced, select "Show features for web developers".
2. In Safari > Settings > Developer, select "Allow remote automation".
3. In a terminal, run `safaridriver --enable` and give the administrator
   password.
4. Quit Safari (⌘Q). A Safari that was open before step 2 refuses the
   connection: each session request times out.

Then start `safaridriver -p 4444` in the background and use the W3C WebDriver
endpoints: `POST /session` with
`{"capabilities": {"alwaysMatch": {"browserName": "safari"}}}`, then `/url` to
open a page, `/execute/sync` and `/execute/async` to run code in it, and
`DELETE /session/<id>` at the end. A small script in the scratch directory
does this with the standard library of any language.

- A session opens its own Safari window, with a clean state. Set
  `localStorage.debug` on `http://localhost:5173/` first, then open the test
  page. The window must be visible: a hidden one plays slowly or not at all.
- The console cannot be read through WebDriver. Read the ledger snapshot
  instead, and push what a probe records to an array on `window`.
- A session left open by a script that was stopped makes the next
  `POST /session` fail. Restart `safaridriver`.
- The test driver's `BroadcastChannel` does not reach another browser. Drive
  the Safari session and the Chrome tabs separately, and compare their
  snapshots.
- **A Safari session does not stand for Safari on the network.** In an
  automation session, Safari's WebRTC networking stops for about 10 s at a
  time: it answers no ICE check and sends no data, then sends the delayed
  answers together. Chrome reports the connection `disconnected` about every
  15 s, and the core drops the peer. A normal Safari window with the same page
  and the same Chrome peer held for minutes. So a Safari session tests
  playback, the player's use of MSE and the registry, but not how long a peer
  connection holds, how much P2P Safari shares, or a stall that comes with
  it. A person tests those in a normal Safari window
  ([release-testing.md](../../../specs/release-testing.md), Part 2).
- To see whether a connection really goes silent, read Chrome's side:
  `getStats()` on the peer's `RTCPeerConnection` gives the selected candidate
  pair, its `requestsSent` and `responsesReceived`, and
  `lastPacketReceivedTimestamp`.
