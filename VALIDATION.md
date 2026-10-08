# PADSwitcher 1.9.0 — validation

## Release checks

Local environment: Windows x64, Node.js 24.18.1, Electron 44.5.1,
electron-builder 26.15.3, .NET Framework 4.8 and native Codex 0.160.0.

| Check | Scope |
|---|---|
| `npm run check` | JavaScript syntax |
| `npm test` | 133 tests: account vault, gateway, router, reset fixtures, UI, lifecycle, private client routes, JetBrains setup/removal and native discovery |
| `npm run smoke` | Isolated Windows DPAPI/storage smoke check |
| `npm run smoke:ui` | Real Electron startup, CSP, local fonts, light/dark, VI/EN, Refresh alignment, three client cards, compact layout and reset confirmation cancellation |
| `npm run dist` | Windows portable packaging and native helper compilation |
| Packaged smoke | ASAR loading, fonts, native helper/stdio bridge, extension connection indicator and tray close behavior |
| Clean checkout | `npm ci`, checks and packaging without a tracked helper binary |

Screenshots in [docs/images](docs/images) use sample accounts. Temporary QA data,
generated helpers and build output are excluded from source control. Release files
include a SHA-256 checksum; they are currently unsigned.

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
