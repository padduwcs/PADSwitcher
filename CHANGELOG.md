# Changelog

## 1.21.0 — 2026-11-07

### Changed

- Operations no longer block each other. Work on one account queues behind that
  account only, different accounts run side by side, and the only whole-app lock
  left is for short changes to the shared store. Waiting replaces the former
  "another operation is running" error.
- Controls no longer go grey while something else runs: an action marks only its
  own button. Browser sign-in holds no lock while waiting on the browser.
- Quota refresh reads up to three accounts at once and shows which card is
  refreshing. Kaggle changes queue instead of failing during a refresh.
- All pages share one set of measurements for cards, buttons, fields, chips,
  disclosures and quota figures. Kaggle uses the same card layout and page width
  as Codex (`src/renderer/ui.css`).
- A manually selected account applies from the next model request, like a quota
  rotation, instead of waiting for every turn on the connection to finish. A step
  already streaming finishes normally, and an older request can never restore the
  previous account. A request rejected for quota right after a selection moves to
  the selected account.
- Account switches and auth synchronization no longer refuse new turns in other
  sessions. Each backend updates its native account when it is idle, independently
  of the others; VS Code and desktop no longer block each other.
- Native Codex retries run to their full default budget. The replay guard now only
  stops a step that keeps failing past that budget (measured 30, limit 32).
- Periodic quota polling reads only accounts in use or not refreshed for five
  minutes.

### Added

- Drag account cards to reorder them, in Codex and Kaggle, or use Alt+Up/Down. The
  order is saved.
- Updates from Settings: check, download, verify against the release checksum,
  install and restart. Desktop, Start menu and taskbar shortcuts move to the new
  version, and the previous file is kept. Checks run automatically and can be
  turned off.
- Opening Codex in VS Code before PADSwitcher starts the app in the tray and
  connects, unless the connection was turned off in PADSwitcher.
- `events.jsonl` in the data folder: a bounded local connection history holding
  event types and reasons only, listed under System check.
- `thread/goal/*` reaches native Codex through the model router.

### Fixed

- Model requests no longer spawn PowerShell for each vault decryption or wait for
  a quota read: valid access tokens stay in memory until shortly before expiry.
- Reduced background PowerShell use: desktop status is checked every 15 seconds
  rather than every 3.
- A failed account change can no longer leave desktop waiting forever and blocking
  VS Code turns. A transient credential error no longer closes desktop.
- A client lost mid-request no longer leaves a turn record holding back account
  synchronization or shutdown, and no longer leaks tracked-turn capacity.
- Quitting from the tray during a background quota read now completes.
- Leftover temporary Say hi and reset folders are removed at startup.

## 1.20.2 — 2026-10-28

### Fixed

- Keep native Codex retry policy after explicit HTTP rejection or an early SSE
  failure before output. These outcomes no longer incorrectly trigger
  `model_replay_blocked` in either the extension or desktop route.
- Count new native agent messages as model-step progress, excluding volatile
  delivery metadata. Preserve replay protection after uncertain or partial output.

### Validation

- Verify the native server's actual home before gateway fixtures start turns or
  install plugins, preventing tests from attaching to a user's running backend.
- Reproduce 503 and early SSE recovery through the real native engine; retain
  single-attempt protection for connection loss, incomplete output and timeout.
- Document a development-fixture plugin left in the maintainer's real Codex home,
  its precise removal and the validation limits. See VALIDATION.md.

## 1.20.1 — 2026-10-28

### Fixed

- Support the desktop's one-shot startup policy command through the authenticated
  native backend. Preserve the actual application network requirements and keep
  startup probes separate from interactive connection indicators.
- Open the desktop GUI visibly instead of inheriting a hidden startup window.
- Check startup policy before launching and await an interactive handshake before
  reporting success. Show early-exit, policy and timeout errors in PADSwitcher.

### Validation

- Add an installed-app smoke that checks the visible process window, real gateway
  connection, existing native thread and a synthetic quota fallback while the GUI
  remains connected. Original authentication/configuration stay in the fixture.
- Add native restricted-policy/failure/sign-out guards and deterministic shutdown
  cancellation coverage. See VALIDATION.md for the exact scope.

## 1.20.0 — 2026-10-28

### Added

- Windows Codex desktop integration: shared account routing, existing conversation
  home, verified ephemeral native authentication, disconnect and restart/resume.
- A private Windows named-pipe bridge for current desktop MCP tools, preserving
  plugin startup policy and keeping transport data out of saved configuration.
- Managed Kaggle virtual-environment setup and automatic environment discovery.
- Codex discovery in VS Code Insiders, Cursor and Windsurf, and a stable home-folder
  workspace default for new installations.
- Native desktop, repeated-fallback, steering and uncertain-stream fixtures;
  smoke tests for the actual unpacked and portable Windows executables.

### Fixed

- Block automatic replay of uncertain model steps while permitting new user input,
  steering and completed tool results in the existing conversation.
- Keep repeated quota fallback working during native authentication synchronization;
  delayed login cannot restore an older routed account.
- Recognize successful and failed SSE without Content-Type and large data-only
  completion events; slow metadata writes no longer hold successful responses.
- Bind each helper to its adjacent gateway and capability file; supervise native
  stdio backends with Windows Job Objects and flush protocol traffic promptly.
- Keep reset controls visible in compact windows and wait for Chromium input
  processing before checking native drag geometry.
- Accept the exact packaged renderer through Windows short/full path aliases;
  preserve gateway network settings when starting the desktop backend.

### Changed

- Show auto-switch state and setup on Accounts and Connections, with desktop
  connection guidance in Vietnamese and English.
- Update Electron to 44.9.3, jsdom to 30.1.3 and patched transitive dependencies.
- Publish verified draft assets only after SHA-256, size and filename checks;
  published releases cannot be overwritten by a rerun.

Desktop GUI acceptance on a closed, ordinary Windows installation remains a
manual check. Native desktop routing, account verification, history/resume and
MCP named-pipe fixtures are automated. See VALIDATION.md for exact coverage.

Notable changes to PADSwitcher are documented here. The project follows [Semantic Versioning](https://semver.org/); detailed test evidence and known limits are in [VALIDATION.md](VALIDATION.md).

## 1.19.1 — 2026-10-11

### Added

- A safe, isolated **Say hi** action for one or all saved Codex accounts, with progress, stop-after-current, per-account outcomes, and refreshed reset times.
- Native protocol coverage for greeting isolation, synthetic credentials, cleanup, and unchanged active client selections.

### Changed

- Aligned Codex search, connection selector, Say hi, and refresh controls across supported window sizes.
- Expanded Windows CI to run the native Say hi protocol check.

## 1.18.0 — 2026-10-11

### Changed

- Simplified Kaggle account cards, setup dialogs, and the shared three-step guide.
- Improved long-name wrapping and compact layouts without hiding quota or activity states.

## 1.17.1 — 2026-10-11

### Fixed

- Preserved the minimum saved Kaggle column width on wide displays.

## 1.17.0 — 2026-10-11

### Added

- Responsive, user-resizable Kaggle columns and notebook lists.
- Remembered layout preferences, keyboard resizing, and per-handle/default reset actions.

## 1.16.0 — 2026-10-11

### Added

- Independent scrolling for pinned and recent Kaggle notebooks.
- Account-scoped pagination, deduplication, retry, and bounded persisted snapshots.

## 1.15.0 — 2026-10-11

### Changed

- Introduced the shared Services entry page and service-specific navigation.
- Separated global appearance settings from Codex and Kaggle configuration.

## 1.14.1 — 2026-10-11

### Added

- Optional `padkaggle` PowerShell commands for selecting an account in the current terminal.
- Safe profile setup/removal with encoding, signature, link, and concurrent-edit protections.

## 1.14.0 — 2026-10-10

### Added

- Encrypted multi-account Kaggle storage and token verification.
- Per-terminal Kaggle account selection, quota monitoring, notebook status, and pinned notebooks.
- Offline contract tests against official Kaggle SDK types.

## 1.13.0 — 2026-10-10

### Removed

- Removed the experimental GPT Web feature from versions 1.10–1.12 and returned to the focused native Codex application.

## 1.9.2 — 2026-10-08

### Fixed

- Preserved Codex cache-affinity/session headers and account-specific sticky routing state.
- Replaced the fixed five-minute request deadline with an inactivity timeout.
- Kept successful model responses available when fallback metadata persistence fails.

### Added

- Minute quota refresh and process-local model activity diagnostics.
- Explicit guards preventing legacy continuation turns in production routing.
