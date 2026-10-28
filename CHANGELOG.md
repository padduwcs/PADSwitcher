# Changelog

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
