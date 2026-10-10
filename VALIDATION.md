# PADSwitcher 1.14.0 — validation

## Kaggle account management — 1.14.0

Validated on Windows x64 on 2026-10-11 using isolated data. Codex routing remains
covered by the existing regression suite and native loopback protocol checks.

- Node suite: 167 passing tests covering the existing Codex flows plus Kaggle vaults,
  identity-bound token updates, rollback, concurrent reads, terminal isolation,
  partial errors, shutdown cancellation, interpreter selection and renderer workflows.
- Python: four passing offline contract tests with the actual `kaggle 2.2.4` /
  `kagglesdk 0.1.37` request/response types. No credentials or network calls.
- Windows: simultaneous native PowerShell processes decrypt separate synthetic
  DPAPI vaults; no plaintext credential files or token-bearing command arguments.
- Electron: actual startup/IPC/Python probe and sample Kaggle UI in light/dark,
  VI/EN and 1000/1260px layouts. The Python reader is unpacked from ASAR and
  checked in the packaged app using the disposable SDK environment. CI installs
  these exact SDK versions and runs the offline contracts and bridge probes.
- Syntax, isolated DPAPI/guardian smoke, native Codex protocol fixtures, Electron
  UI smoke and the Windows portable build pass. The packaged check verifies
  ASAR/helper extraction, the stdio bridge, separate routes, tray close and an
  unchanged fixture login.
- Quota reads, notebook status and parallel job submissions using real Kaggle
  accounts remain unverified. No Kaggle compute was consumed.

See [Kaggle guide and implementation boundaries](docs/KAGGLE.md). Temporary
screenshots, SDK environments and portable builds are excluded from source control.

## GPT Web removal — 1.13.0

- The experimental GPT Web feature (builds 1.10–1.12) and its vendored companion were removed. The source tree
  equals the tagged 1.9.2 tree apart from the version number and release notes; no native fix was lost, because every
  change after 1.9.2 was GPT Web code, hooks or build support.
- Root suite: 150 passing tests (the 1.9.2 suite); syntax check, process/guardian smoke, Electron UI smoke and the
  native protocol fixture pass. Packaged smoke on the portable build: ASAR, helper extraction, stdio bridge, tray close
  and preserved fixture login pass. Portable size 103 MB (was 226 MB with the companion).
- Local GPT Web data and build artifacts were deleted. Native account, gateway and login data were not touched.

## PADSwitcher 1.9.2 — validation

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
