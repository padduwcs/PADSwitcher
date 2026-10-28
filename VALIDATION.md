# PADSwitcher 1.20.2 — validation

## Retry and fixture isolation repair — 2026-10-28

The reported `model_replay_blocked` text originates in PADSwitcher's replay guard.
Audit reproduced false blocking after definite HTTP rejection, early SSE failure
before output and new native `agent_message` progress. The router now preserves
native retry for definite rejection and hashes agent content/identity rather than
delivery timestamps. Unknown transport outcomes and partial output still block
automatic replay. This shared router serves both extension and desktop.

An earlier development fixture left `codex-app-tools@desktop-fixture` enabled in
the maintainer's real Codex home, pointing to a deleted temporary MCP program.
Native logs showed plugin conflicts and failed MCP handshakes. The fixture was
uninstalled through native RPC after a DPAPI-encrypted configuration backup;
parsed configuration comparison confirmed all other settings were preserved.
Installed-plugin inspection confirmed its removal. A subsequent history audit
found two development-fixture threads in the real home. One fault-smoke turn at
2026-10-28 03:42:05 UTC had reached the real backend: native usage reports 16,722
input tokens (13,440 cached), 73 output tokens and 16,795 total. That earlier
test was not isolated and did consume real inference usage. These counters do
not establish billed quota percentage. Both positively identified fixture
threads were backed up with DPAPI and archived through native RPC; ordinary user
threads were excluded. They remain recoverable rather than deleted.

The initial upstream cause
of every interrupted user turn cannot be reconstructed from the final guard
error, and local token counters cannot establish billed quota loss.

Gateway smoke fixtures now assert the actual `initialize.codexHome` resolves to
the expected disposable home before any plugin install or model turn. Unit
coverage rejects wrong, missing and out-of-root identities. This closes the
validation gap that allowed the earlier fixture contamination.

- Regression suite: 247 tests, 246 passed locally; the PowerShell 7 check is
  skipped locally. Hosted Windows CI passes all 247, with zero skipped tests.
- Native wire inspection confirms `agent_message` input reaches the router as
  that type. It uses a synthetic injected item, not a real delegated task.
- Fault checks distinguish native retry after 503 / early SSE failure from
  uncertain replay. Generic 429 remains a native failure, with no account rotate.
  Connection drop, partial output, EOF and inactivity timeout each retain one
  upstream attempt; subsequent user turns remain usable.
- The fault matrix and 14-turn continuity checks pass on native `0.160.0`,
  extension `0.164.0-alpha.11.1` and desktop `0.165.0-alpha.1.2`. Each continuity
  run verifies 12 quota fallbacks, four steers, 14 unique real marker writes and
  40 upstream attempts, with zero blocked legitimate steps or duplicate writes.
- The installed desktop passes visible-window/startup/handshake, thread resume,
  MCP and quota fallback checks with a disposable profile. Portable build,
  packaged ASAR/helper, actual unpacked/portable executables, VI/EN UI checks,
  six offline Kaggle contracts and production dependency audit pass.
- The first parallel Say hi check found a residual temporary directory after
  the native process closed; the standalone recheck passed. Its assertion now
  includes synthetic job error details for future diagnosis; no cleanup check
  was removed and no inference retry was added.

All model traffic in these repair checks uses synthetic credentials and loopback
responses. No real quota exhaustion or reset consumption is attempted. Existing
processes must restart to load the patch and clear old in-memory replay blocks.

## Desktop startup repair — 2026-10-28

Reproduced the reported launch failure with the installed Windows desktop.
Its `app-server --print-startup-config` command received a streaming bridge
instead of the required one-shot JSON result. The GUI was also launched with
`windowsHide: true`; a successful native handshake alone did not prove a visible
window. Both cases are repaired, and launch success now awaits a real interactive
connection after a native startup-policy preflight.

- Installed desktop `26.1023.6123.0`, bundled Codex `0.165.0-alpha.1.2`: real
  one-shot policy read, visible process window and GUI-to-gateway handshake pass
  with a disposable browser profile and synthetic authentication.
- With that GUI connected, the native backend resumes the existing three-turn
  thread and completes another turn after an injected quota rejection, with an
  identical request retried on a different account and original context retained.
- The installed-app check also passes with core modules and the native helper
  loaded from the packaged ASAR/unpacked-helper output, rather than the source tree.
- Native desktop/MCP smoke passes on pinned `0.160.0` too. Mixed extension
  `0.164.0-alpha.11.1` / bundled desktop `0.165.0-alpha.1.2` continuity passes
  14 turns, 12 quota fallbacks, four steers and 14 unique real marker writes.
- Helper regression verifies forwarding of restricted network policy unchanged,
  refusal when policy cannot be read, no sign-out side effect and zero model
  calls for startup. Startup probes never appear as an interactive desktop.
- Regression suite: 243 tests; 242 pass locally and the PowerShell 7 check is
  skipped locally. Hosted Windows CI supplies that shell. Native window startup,
  original authentication preservation, timeout/exit handling and VI/EN messages
  have dedicated checks.

The installed-app check starts a real GUI and verifies its visible process window
without automating ChatGPT UI controls. Model requests are driven through native
RPC to the same backend while that GUI is connected. It does not claim an
automated test of typing in every GUI control or exhausting real account quota.
The user's running desktop and real credentials are left in place; fixture model
traffic stays on loopback. No live usage reset is submitted.

## Windows parity — 2026-10-28

Ported the complete Unix.7 routing behavior from `4f0039b` to Windows while
retaining DPAPI, Windows ACLs, the C# helper, PowerShell and the existing data
namespace. New data defaults to the user's home workspace; existing saved
settings and authentication/history are retained.

- Node regression suite: 239 tests, 238 passed, one PowerShell 7 check skipped
  locally because that shell is not installed. Windows CI includes PowerShell 7.
- Six official Kaggle SDK contract tests pass. Syntax and dependency audit pass;
  the resolved dependency tree has no reported npm vulnerabilities at validation.
- Real Windows Codex engines: pinned CI `0.160.0`, extension and installed desktop
  builds of `0.164.0-alpha.11.1`; all inference replies and credentials are synthetic fixtures.
- Native continuity: 14 completed turns, 12 quota fallbacks, four accepted steers,
  14 unique disposable file writes and 40 upstream attempts; no duplicate tool
  writes or blocked legitimate model steps. Both desktop and extension share
  the production router and finish concurrent work in their existing threads.
- At the time, nine native success/fault scenarios each made one loopback attempt;
  this incorrectly included definite rejection and is corrected in 1.20.2.
  later user turns remain usable. Missing MIME and incomplete/data-only/large
  SSE, uncertain recovery, slow metadata and delayed auth synchronization have
  regression coverage.
- Native desktop protocol verifies unchanged original auth/config/history,
  account verification, A/B quota fallback, manual account selection, restart,
  resume and a plugin-provided MCP tool using the newly bound Windows named pipe.
- Native helper checks verify desktop startup policy allowlisting, adjacent
  gateway isolation, user/SYSTEM-only pipe ACL and owner-death cleanup of stdio
  Codex through a Job Object. DPAPI, directory ACL and terminal guardian smoke pass.
- Real Chromium screenshots cover Services, all four connection cards, Codex,
  Kaggle and settings/help in VI/EN, light/dark and 1920/1260/1000px layouts.
  Compact reset visibility and actual pointer resizing/pagination pass.
- Portable build, ASAR/helper smoke and actual unpacked/portable executable
  startup pass with disposable app data, sandboxed renderer, preload IPC and
  desktop UI. Release CI repeats these checks before publishing.
- Portable IPC accepts the same renderer file through Windows short/full paths
  while rejecting other files, network URLs, queries and fragments. Desktop
  backends inherit gateway network settings alongside their runtime overrides.

The existing Windows desktop GUI was left running. A second isolated GUI did
not establish a desktop handshake, so ordinary installed-GUI launch and visual
resume are **not claimed as passed**. First-use GUI acceptance requires saving
work and fully quitting the existing desktop, then opening it through PADSwitcher.
The connection remains opt-in and fails closed when native auth verification
fails; a failed optional desktop startup does not stop existing shared clients.
The live GUI's tool approvals and real-account quota exhaustion were not tested.

Initial development fixtures exposed the old helper's global fallback path;
they could attach to the default running gateway, left a fixture plugin behind
and sent one real fault-smoke model turn, as disclosed in the 1.20.2 audit above;
the 1.20.2 repair above removes that residue. That attempt is not counted as
isolated validation. The helper now requires its adjacent connection and sibling
capability; the native fixtures were rerun after that repair. No reset credits
or Kaggle jobs were submitted during this work.

Generated screenshots, fixture logs and builds stay under ignored `artifacts/`
and `dist/`. Published assets are unsigned and include a verified checksum.

## Earlier Windows releases

## Aligned Codex toolbar and Say hi presentation — 1.19.1

Validated on Windows x64 on 2026-10-11 with disposable app data and synthetic
accounts. This patch changes presentation; the greeting and routing behavior
remain covered by the 1.19.0 checks below.

- Search, connection selection, Say hi to all and Refresh share their top/bottom
  edges, with consistent 44px control heights (38px in short windows). Both
  toolbar actions use the same padding, line height, border, surface and radius;
  icons and labels are centered. Single-account actions align with an 8px gap.
- Say hi uses the existing chat icon style, theme surfaces and mint progress
  color. Its result panel matches the account cards and keeps account errors
  readable. Disabled greeting controls retain their geometry.
- Chromium geometry checks and screenshots cover idle, running/stopping and
  completed greeting states in VI/EN, light/dark and 1920/1260/1000px layouts.
  They check aligned edges, centered icons/text, overlap and clipped labels.
  Existing compact reset controls and Kaggle layout checks continue to pass.
- Node suite: 200 tests, 199 pass and one PowerShell 7 check is skipped locally.
  Syntax, six offline Python checks, Windows account isolation, existing native
  gateway protocol and native Say hi fixtures pass. CI now includes the native
  Say hi loopback check alongside the existing checks and portable packaging.
- The 1.19.1 portable build and packaged ASAR smoke pass, including greeting
  controls/IPC, connected gateway routes, PowerShell commands, the Kaggle Python
  bridge and unchanged fixture authentication.

## Say hi for one or all saved Codex accounts — 1.19.0

Validated on Windows x64 on 2026-10-11 with synthetic credentials, disposable
app data and local model responses. No real greeting was sent or inference quota
consumed on the user's accounts. Actual quota activation and the amount charged
remain live acceptance checks; reset times are read from the server.

- Each account gets one fresh, ephemeral native Codex thread in its own temporary
  workspace and backend. The native default text model uses its lowest supported
  reasoning effort and standard service tier. Project context, execution
  environments, external apps and MCP servers are disabled. Existing desktop
  authentication, gateway selection and reset credits are preserved.
- All-account jobs run sequentially with per-account outcomes. Expired sessions
  and depleted quotas are skipped; one failure does not reroute the greeting.
  Stop finishes the current account and cancels queued accounts. App shutdown
  interrupts only the private greeting backend. Ambiguous completion is shown
  without resending; a failed quota refresh retains the successful greeting.
- The shared credential lock is held only for account access and quota saving,
  not while waiting for the model. Queued/current sessions cannot be replaced
  or deleted until released. Other account operations and existing connections
  retain their normal behavior.
- Full Node suite: 200 tests, 199 pass and one PowerShell 7 check is skipped
  because that shell is absent locally. Syntax checks and six offline Python
  contract checks pass. Existing Windows DPAPI/ACL, account-isolation and gateway
  protocol smoke checks pass.
- The native Say hi protocol smoke verifies two independent synthetic accounts,
  one request each, no tools executed, lowest supported effort, server quota
  refresh and private-backend/workspace cleanup. It also preserves the existing
  selected gateway account and desktop authentication bytes.
- Real Chromium checks pass for single/all greeting controls, progress, stopping
  and results in VI/EN, light/dark and 1260/1000px layouts. Existing account reset
  visibility, service navigation, Kaggle scrolling/pagination, native resizing
  and persisted layout checks continue to pass. New toolbar styles are scoped
  to the Codex account page.
- Portable packaging and packaged ASAR smoke pass, including Say hi controls
  and empty-account IPC guards, connected gateway routes, PowerShell commands
  and the unpacked Kaggle Python bridge. The executable is isolated under
  `dist/say-hi-preview`; existing release outputs, shortcuts and the user's
  running app are untouched.


## Simplified Kaggle interface and account sidebar — 1.18.0

Validated on Windows x64 on 2026-10-11 using synthetic accounts and disposable
app data. No live Kaggle credentials or jobs were used.

- Account cards use compact identity and quota rows, with a clear selected state.
  Repeated usernames, decorative avatars and idle status filler are removed.
  Running/queued counts, expired tokens, refresh errors and stale data remain
  visible. Long names wrap without hiding quota values.
- A shared three-step guide appears in **How to use** and the Kaggle Help page.
  Notebook submission and monitoring details are collapsed. Account, terminal and
  tool dialogs show short instructions first; Python versions, paths and profile
  controls remain available in optional sections. VI/EN documentation matches the
  **Copy command** action.
- Syntax checks and all 42 renderer checks pass. Full Node suite: 187 tests,
  186 pass locally and one PowerShell 7 check is skipped because it is not
  installed. Windows DPAPI/ACL, isolated native Codex and protocol smoke pass.
- Real Chromium checks cover light/dark, VI/EN, 1920×900, 1260×900 and 1000×680
  quiet account lists, compact dialogs and dense notebook lists. No horizontal
  overflow or clipped account names/quotas. Pagination, independent scrolling,
  native mouse resizing and persisted sizes pass. The resize release position is
  applied even if the final pointer move was coalesced.
- Portable packaging and packaged smoke verify the final renderer and isolated
  Python/Codex bridge. The active user's processes and stored credentials remain
  untouched; the Desktop shortcut points at the new portable build.

## Responsive and user-resizable Kaggle layout — 1.17.0

Validated on Windows x64 on 2026-10-11 using disposable app data and synthetic accounts.

- Kaggle uses available window width, page scrolling for details and adaptive list
  heights. Column width and Accounts/Pinned/Recent heights can be dragged, changed
  with the keyboard, reset individually or restored to automatic sizing together.
- Renderer checks cover saved preferences, responsive bounds, reset, drag capture
  through state updates and cancellation. Node suite: 184 tests, 183 pass locally
  and one PowerShell 7 check is skipped. All 39 renderer checks pass.
- Real Chromium mouse input verifies column/list drags, preserved sizes across
  refresh/reload and cursor cleanup. Light/dark, VI/EN screenshots cover 1920×1080,
  1260×900 and 1000×680, with no horizontal overflow. Pagination still works when
  a tall custom list fits all loaded rows and the user scrolls the page to its end.
- Patch 1.17.1 also verifies that the minimum 240px column width survives reload
  on a wide viewport, where its saved fraction is smaller than 15%.
- Changes are limited to the renderer, version/docs and QA. The running user's
  PADSwitcher processes, Codex gateway, live credentials and shell profiles are
  untouched. Portable packaging and packaged smoke pass, including service
  navigation, the Python bridge and isolated Codex helper/routes.

## Scrollable notebooks and pagination — 1.16.0

Validated on Windows x64 on 2026-10-11 with synthetic accounts and disposable data.

- Account details and both Pinned/Recent lists have bounded, independent scroll
  areas. Pinned notebooks appear once; quick pin/unpin preserves layout and scroll.
- Recent reads 12 rows per page, deduplicates refs and simultaneous requests per
  account, retries the same cursor after failure and stops after the final page.
  Quota refresh preserves loaded pages and their individual snapshot read times.
- Node suite: 182 tests, 181 pass and one PowerShell 7 check is skipped locally.
  All 37 renderer checks pass without uncaught errors. Six offline Python contract
  checks use real official SDK types, including page selection, empty/final pages,
  identity checks and safe failure handling, without Kaggle authentication.
- Electron layout checks cover light/dark, VI/EN at 1260×900 and 1000×680,
  including 20 pins, separate scroll geometry, one incremental request per end
  scroll and preserved positions after refresh. Syntax and isolated regression
  smoke checks pass. Portable packaging and packaged smoke pass, including the
  pagination IPC, Kaggle bridge, Codex helper/routes and preserved fixture login.
- Additional pages are session memory only; persisted snapshots remain bounded.
  Live Kaggle pagination is an acceptance check requiring real account access.
  QA does not touch the user's running app, Codex gateway or live credentials.

## Service navigation and UI — 1.15.0

Validated on Windows x64 on 2026-10-11 with disposable app data and synthetic accounts.

- Shared Services entry for Codex/Kaggle, nested Codex accounts/connections/settings,
  per-service help and separate global appearance settings.
- Renderer checks cover navigation without account activation, selection preservation,
  updated/translated service cards, unsaved settings and optional Kaggle details.
- Node suite: 177 tests; 176 pass locally and one PowerShell 7 check is skipped
  because that shell is absent. All 35 renderer checks pass without uncaught errors.
- Electron screenshots and layout checks cover light/dark, VI/EN at 1260×900 and
  1000×680, including primary actions, quotas and reset visibility.
- Syntax, isolated DPAPI/guardian smoke and native Codex protocol fixtures pass.
  The portable build and packaged smoke pass, including Services navigation,
  ASAR/PowerShell helper loading, separate native routes, tray close and unchanged
  fixture credentials. No live credentials or running user gateway are modified.

## PowerShell account commands — 1.14.1

Validated on Windows x64 on 2026-10-11 using synthetic credentials and isolated
profiles. No real Kaggle token was decrypted or Kaggle request submitted by QA.

- Node suite: 173 tests; 172 pass locally and the PowerShell 7 check is skipped
  when that shell is absent. Windows CI includes PowerShell 7.
- Native PowerShell checks cover in-place A/B selection, simultaneous terminals,
  tool precedence on PATH, Unicode folder preservation, strict-mode profiles,
  failed-selection rollback and restoration of prior Kaggle variables/PATH.
- Profile tests preserve UTF-8/UTF-16LE content, stop on malformed/signed/linked
  profiles, handle concurrent edits and remove only the PADSwitcher block.
- UI checks exercise copy/select and explicit profile enable/removal. Packaged
  smoke verifies helper export and function loading without account selection.
- Existing Codex regression and native protocol fixtures remain covered. The
  running user's app and Codex helper are kept untouched during installation.

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
