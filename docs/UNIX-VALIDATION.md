# Unix edition validation

Baseline: Windows `main` commit `5444e11e577753181604f06572cd75cb092bbeef`.
Implementation is confined to `feature/cross-platform`. Validation initially used
a separate worktree; normal development can use [one checkout and switch branches](DEVELOPMENT.md#one-folder-and-two-branches).
Runtime work is confined to the Unix branch. Shared landing/maintenance documentation
can change on `main` without changing the Windows product.

## 1.19.1-unix.7 — 2026-10-27

- A subsequent real report showed Unix.6 could still block a legitimate model
  step. The previous guard keyed a whole turn, conflating automatic recovery
  with new steering input or completed tool results. Regressions reproduce the
  old `400` and verify those forms of progress remain available in the same chat.
  Partial assistant recovery alone still cannot authorize another inference.
- Repeated native desktop/extension testing exposed a second bug: automatic
  native-auth synchronization set `pendingId`, which incorrectly disabled the
  next quota fallback as if it were a manual account choice. Synchronization
  now has an explicit source, follows newer routing decisions and cannot roll
  back a newer selected account when a delayed login completes.
- `npm run smoke:continuity` runs the production desktop and VS Code routes
  with native Codex, synthetic sign-ins and a loopback model server. Each run
  completes **14 turns, 12 quota fallbacks and four accepted mid-turn steers**.
  It performs **14 real disposable file writes with zero duplicates**, verifies
  all 40 upstream attempts, identical fallback bytes, preserved context and
  seven turns in each existing thread. The final two clients run concurrently.
  Data-only SSE, missing MIME and 2 MiB completion frames are included.
- Native engines checked locally: `0.160.0`, desktop `0.163.0-alpha.11.1` and
  extension `0.164.0-alpha.11.1`. The existing installed Linux ChatGPT GUI also
  resumed and displayed the synthetic chat with current desktop MCP tools.
  Tests use no real model inference or account quota.
- Local Ubuntu checks: **250 Node tests, 246 passed, four Windows-only skips**;
  syntax, native helper, protocol and nine success/fault scenarios passed.
  Each fault sends exactly one upstream model attempt, and later user turns
  remain usable. Source and release CI include the new continuity test on
  Linux x64/ARM64 and macOS Intel/Apple Silicon.
- Account fallback status/setup is visible on Accounts and Connections, with
  exact bilingual click paths. On the user's closed local PAD installation,
  the shared policy was explicitly enabled with two signed-in personal accounts;
  desktop and the VS Code Shared route use that same enabled policy.
- All five [source CI jobs](https://github.com/padduwcs/PADSwitcher/actions/runs/40370836410)
  and all six [release jobs](https://github.com/padduwcs/PADSwitcher/actions/runs/40370840577)
  passed for `40ec2b16f77aada49343596beba8d2953b6aac17`.
  [Unix.7 is public](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.7)
  with all 19 assets verified; eight anonymous installer links passed. Downloaded
  amd64 deb, bilingual guides, sidecar checksums and catalog match GitHub digests.
  The public deb's router/synchronization/UI match source, and its sandboxed
  executable startup, IPC and navigation passed on the user's machine.
- The machine is installed with `1.19.1~unix.7`, with package integrity and
  installed/source runtime comparison verified. The real manager is open; its
  live native gateway authenticated the selected account. VS Code configuration
  and helper are present, and both effective fallback policies are enabled.
  Original desktop auth/config hashes stayed unchanged; no test model request
  was sent to real accounts. During repair, the chat was kept open directly
  before the user reopened desktop through PADSwitcher for acceptance.
- After reopening through PADSwitcher on 2026-10-27, real desktop launch ancestry,
  selected native authentication and the existing conversation were verified. Three
  successive model calls in that acceptance turn returned HTTP 200 through PAD,
  with no replay-block error; this did not force real account quota exhaustion.
- The stable Windows branch/release remain separate. The tests above establish
  the synthetic protocol behavior, not uninterrupted availability of the remote
  service. Real quota exhaustion was not forced on the user's accounts.

## Earlier releases

[Unix.1–6 validation history](archive/UNIX-VALIDATION-1-6.md) is archived.
Published tags/assets remain available for provenance.
