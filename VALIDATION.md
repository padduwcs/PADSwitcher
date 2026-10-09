# PADSwitcher 1.9.2 — validation

## Release checks

Local environment: Windows x64, Node.js 24.18.1, Electron 44.5.1,
electron-builder 26.15.3, .NET Framework 4.8 and native Codex 0.160.0.

| Check | Scope |
|---|---|
| `npm run check` | JavaScript syntax |
| `npm test` | 150 tests: account vault, gateway, router, numeric usage diagnostics, reset fixtures, UI, lifecycle, private client routes, JetBrains setup/removal and native discovery |
| `npm run smoke:protocol` | Real native Codex with an isolated home, synthetic credentials and loopback responses: cache-affinity headers, sticky routing across an in-turn account change, byte-identical quota retry and tools executed once |
| `npm run smoke` | Isolated Windows DPAPI/storage smoke check |
| `npm run smoke:ui` | Real Electron startup, CSP, local fonts, light/dark, VI/EN, Refresh alignment, three client cards, compact layout and reset confirmation cancellation |
| `npm run dist` | Windows portable packaging and native helper compilation |
| Packaged smoke | ASAR loading, fonts, native helper/stdio bridge, extension connection indicator and tray close behavior |
| Clean checkout | `npm ci`, checks and packaging without a tracked helper binary |

Screenshots in [docs/images](docs/images) use sample accounts. Temporary QA data,
generated helpers and build output are excluded from source control. Release files
include a SHA-256 checksum; they are currently unsigned.

## Quota investigation — 2026-10-08

The 1.9.0 relay had three confirmed defects that could increase effective usage
or provoke native retries. The 1.9.2 fixes were verified without real model
inference, saved account credentials or usage resets:

- Native Codex 0.160.0 sends `session-id` and `thread-id`; the relay allowed the
  older underscored names instead. The response's `x-codex-turn-state` was also
  stripped. Preserve current session/cache metadata in both directions. Keep
  each account's routing token separate, including when native Codex retains its
  first token after an in-turn account change. Tokens stay in bounded process
  memory and are never persisted or logged.
- A fixed five-minute request deadline could cut off a healthy longer stream.
  Apply a five-minute **inactivity** timeout instead; a stalled/disconnected stream
  is still cancelled, with no automatic replay by PADSwitcher.
- A failed metadata save after a successful backup response could turn that
  response into a transport error. Retain the in-memory account/cooldown and
  report the save failure while delivering the original response.

Regression tests additionally cover repeated authentication rejection, exhausted
backup accounts, no retries after text/tool output, cache/metadata preservation,
long-lived routing tokens, bounded LRU storage and a stream lasting longer than the inactivity limit.
The native loopback protocol check fails against the previous router and passes
against the fixed implementation, with one turn and no duplicate tool execution.

Read-only inspection of recent local usage metadata showed low cached-input
fractions in routed sessions, consistent with lost cache affinity. Workloads were
not identical, so this observation does not establish how much quota the defect
consumed. There is no request-level historical router trace from which to prove
every past attempt; no exact before/after quota reduction is claimed.

Periodic quota refresh uses account metadata RPCs, not `turn/start` or Responses
inference. The production Responses router does not invoke legacy continuation
recovery. Quota retries remain bounded to one attempt per eligible account, with
one credential refresh on 401; transport failures and partial output do not rotate.

The follow-up audit adds a guard at the continuation RPC entry point and avoids
creating legacy continuation parameters in production. Current model, reasoning
effort, input history, tool results and request bytes remain client-owned. The
native fixture verifies three successful model calls, one quota-rejected attempt,
one turn and two distinct tools, each executed once. Read-only account inspection
and an idle connection add no model calls in that fixture.

Sticky-routing state has no arbitrary wall-clock expiry: native Codex retains its
first token for the whole turn, including long approval/tool waits. Bounded LRU
storage retains actively used aliases and is cleared when the router shuts down.

Quota polling now runs every minute, prevents overlapping reads and tolerates
timer jitter and a backwards system-clock change. Polling preferences can be saved
with an active connection; changing filesystem paths still requires stopping it.

Settings diagnostics expose per-route request/attempt/retry counts and reported
cached-input tokens. These are process-local numeric counters, not quota billing
figures. They are neither written to disk nor sent elsewhere, and never retain
prompts, response text, credentials or account/thread IDs. Parsing is bounded and
cannot change the forwarded response; malformed or oversized usage events may be
omitted. Compact JSON responses do not contribute to the SSE completion/token
totals. Shared routes are listed once and private-route counts are independent.

The native cache percentages in fixtures are synthetic. No live before/after
quota benchmark or server-side guarantee of cache reuse is claimed. Changing
accounts can require processing the same long context with a cold cache even
after these transport defects are fixed.

Protocol references: official Codex 0.160.0
[session headers](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/codex-api/src/requests/headers.rs),
[cache affinity and turn ownership](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/client.rs),
and [HTTP stream metadata](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/codex-api/src/sse/responses.rs).

## Routing verification

Separate account routing was verified locally on **2026-10-07**:

- The original helper endpoint dispatches VS Code, JetBrains and CLI to their
  configured shared or separate native backend; authentication, pending switches,
  active turns and auto-switch policies are independent per group.
- Initial/post-tool quota fallback keeps request bytes and context in the selected
  group. The native ACP split smoke checks the real adapter and native Codex with
  local model fixtures, while leaving the shared group's account unchanged.
- Exhausted-account cooldowns remain shared because quota belongs to the account.
- Tests cover active-turn protection, mode-change races, failed setup, faulted
  private routes, account removal protection, persistence and whole-app shutdown.
- Mode changes require reconnecting the affected idle client once; subsequent
  account switches within that mode preserve its connection.
- Electron fixtures check scoped account controls and separate policy editing in
  Vietnamese/English, light/dark and compact layouts. No real reset is consumed.

JetBrains integration was verified locally on **2026-10-07**, using the installed
**codex-acp 2.1.1** adapter and native Codex **0.160.0**, with local model fixtures:

- Successful ACP handshake is shown as a live JetBrains connection, independently
  from the configuration status and the VS Code/CLI indicators.
- Two prompts use the same ACP session. A locally injected quota failure retries
  identical request bytes with account B and retains the earlier response.
- Read-only mode requires an ACP permission approval for the fixture file edit.
  The file is written once; a quota failure on the following model request switches
  accounts without replaying that tool. The tool fixture uses a local legacy-model
  catalog; it does not verify every current model's tool mode.
- Disconnect removes the live indicator. Setup/removal preserve other agents;
  fixtures target disposable IDE configuration, not the real IDE settings.
- Saved account sessions authorize read-only native workspace policy discovery.
  Model inference uses a loopback fixture, shared auth stays unchanged, and no
  real usage reset is consumed.

The owner-requested agent was subsequently installed in the local IDE configuration.
Actual IDE chat rendering is not part of the automated ACP checks. Other adapter
versions and future IDE protocols require compatibility verification.

Earlier native fixture and real model checks were completed on 2026-10-03:

- **Native Codex + local model fixture:** initial and post-tool quota failures both
  retried the same request bytes with the backup account. One completed turn,
  no extra continuation turn; the test tool wrote its marker once.
- **Real upstream:** two short replies with the default model returned by Codex
  (`gpt-6.1-sol`) in one thread. A local injected quota error caused the second
  request to switch accounts; the backup reply retained the earlier marker.
- Shared Codex auth stayed unchanged. No real quota exhaustion was forced and
  no real reset credit was consumed.

Router tests cover structured quota errors, SSE prelude handling, stopping retries
after output, disabled/manual switching, account-bound references, managed plans,
auth refresh, compressed requests, exhausted backups, local access checks,
redirect rejection, disconnects and profile lifecycle protection.

## Limits

### GPT Web setup wizard 1.11.0 — 2026-10-09

- 189 PADSwitcher unit/integration tests pass; the native quota/router suite
  passes all 50 comparisons with the Web branch disabled and enabled. The
  native router, gateway, recovery and quota refresher source is unchanged.
- Managed setup invokes existing launcher safety checks, with asynchronous job
  status and bounded authenticated POSTs. Tests cover consent before the single
  Web smoke turn, rejection while Web tasks are active, duplicate IDs, lost POST
  acknowledgements, stopped failures, saved-test continuation and runtime repair
  without another smoke turn. Native inference remains usable during Web setup.
- Full setup cannot be enabled or used through the managed route until runtime
  and connector verification completes. Failed checks keep the account in setup;
  errors/status never expose tunnel API keys. Credentials disappear from wizard
  inputs after submission/dismissal and are not stored in renderer preferences.
- The actual packaged companion accepts the setup endpoint only with its owner
  capability, rejects browser Origin, malformed actions, missing consent and
  bodies over 8 KiB. A disposable signed-out profile fails at authentication
  before smoke/model setup; a duplicate request does not replay it. Private
  native auth/config hashes remain unchanged, and both companions stop cleanly.
- Real Codex protocol fixtures preserve native payload/cache and execute each
  of two tools once, both with Web enabled on the native path and with synthetic
  Web replies. No owner inference quota is used.
- Electron screenshots cover the integrated wizard at normal/compact sizes,
  alongside existing light/dark and Vietnamese/English page checks. Chat-only
  setup and coding setup are driven through UI fixtures; the finish button stays
  unavailable until tools are verified. Packaged main/helper, resource discovery,
  separate native routes and the NSIS double-launch check pass.
- Vendored launcher tests: 375 pass, 5 environment-specific skips, 0 failures
  locally. Bridge tests and GitHub CI are checked separately before delivery.
- **Owner ChatGPT login, a real Web reply and real Full/MCP tool execution still
  require the owner's first connection.** Fixtures do not establish account-side
  service availability or permissions. PADSwitcher is not restarted during
  deployment because the owner's current conversation uses its native gateway.

### GPT Web 1.10.1 — 2026-10-09

- All 171 PADSwitcher tests pass, including 20 Web isolation/regression tests.
  Native compressed request bytes, cache/session headers and quota fallback are
  checked with Web enabled and disabled.
- The existing 25 native router/usage tests also run with the actual Web branch
  both disabled and enabled (50 checks). This includes partial/stalled streams,
  healthy long streams, auth rejection, same-byte fallback, sticky cache tokens,
  native usage accounting and invalid JSON values. Web disconnects/redirects do
  not replay, rotate or load native credentials. Native inference continues
  independently while a Web response is active.
- Concurrent companion launches are serialized and launch/stop/remove races are
  guarded. Web catalog rows disable parallel-agent advertising; native metadata
  and native parallel-agent settings are preserved.
- Real native Codex uses the account-qualified Web route with synthetic loopback
  replies: two dynamic tools execute once each, one completed turn, no native
  credentials read, no native model requests or quota retries.
- A separate real-native Codex fixture runs the original sticky-state/tool/fallback
  sequence with GPT Web enabled and no Web runtime available. It produces exactly
  the same four native requests and two tool executions as the baseline.
- Two real packaged companion processes use disposable browser/core/Codex homes.
  Their capabilities differ; unauthorized/origin requests are rejected; incomplete
  setup cannot enable Web. Both stop cleanly; native auth/config hashes stay equal.
- Electron UI startup, sandbox/CSP, existing pages and the new Web page pass at
  normal/compact sizes, Vietnamese/English and light/dark themes.
- The native NSIS portable-wrapper fixture reproduces missing helper/Web files
  when the 1.10.0 build is opened twice while its first instance remains active.
  The 1.10.1 per-launch extraction option preserves all first-instance resources
  and cleans only the exiting launch's temporary folder. No native service or
  account data is loaded by this fixture. Packaged main also explicitly verifies
  discovery of the bundled Web runtime rather than a development build path.
- Web setup presents the next action for the selected account and enables the
  Web toggle only after a signed-in account reports ready. Missing-runtime
  guidance no longer asks a portable user to run developer build commands.
- The managed daemon catalog endpoint is tested with a real Bun listener. It
  requires control authentication and generates Web rows without upstream/model
  calls. The PAD catalog augmentation preserves native rows and returns the
  original response if Web augmentation fails or exceeds its size limit.
- **Live ChatGPT sign-in, Web chat and Full/MCP tools have not been tested with
  the owner's account.** They require account-owner setup and browser/tool checks.
  Automated fixtures do not establish service-side availability or account limits.

See [GPT Web setup and boundaries](docs/GPT_WEB.md).

- **Real reset consumption remains untested**, by the owner's instruction. Tests
  validate request construction, confirmation, idempotency and uncertain outcomes
  using fixtures, not service-side credit consumption.
- Live fallback used an injected quota error, not an actually exhausted account.
- No retry across accounts after response output or for uncertain/non-quota failures.
- Verified on native Windows Codex 0.160.0; newer protocols need verification.
  WSL, remote containers, organization plans and cloud clients are not supported.
- Local checks do not establish that a GitHub-hosted CI run has passed; its result
  is reported separately by GitHub Actions.

Commands and optional live diagnostics are documented in
[DEVELOPMENT.md](docs/DEVELOPMENT.md); routing boundaries in [ROUTING.md](ROUTING.md).
