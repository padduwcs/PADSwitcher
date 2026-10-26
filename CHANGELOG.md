# Changelog

## Unreleased

- Unify Vietnamese/English entry pages, platform-specific setup and contribution guidance.
- Correct active Unix download links and add documentation consistency checks.
- Separate current routing/validation from historical reports; remove five disabled
  Windows-only live scripts from the Unix branch.
- Update Unix CI to setup-go v7 and test dependency jsdom to 30.1.3. Keep the
  Electron 44.9.3 runtime and published Windows/Unix installers unchanged.

## 1.19.1-unix.7 — 2026-10-27

- Scope uncertain replay protection to model-step progress so steering input and
  new tool results can continue within the same conversation.
- Fix repeated account fallback during native auth synchronization and prevent a
  delayed login from rolling back a newer routed account.
- Recognize large data-only completion frames; display auto-switch status/setup
  on both Accounts and Connections with bilingual steps.
- Add native desktop/extension continuity coverage: 14 completed turns, 12 quota
  fallbacks, four steers and 14 unique file writes in each synthetic run.

## 1.19.1-unix.6 — 2026-10-26

- Accept successful SSE without Content-Type and preserve successful tool follow-ups.
- Expand native omitted-MIME protocol/fault tests. Superseded by Unix.7, which
  fixes additional progress-blocking and repeated-fallback cases.

## 1.19.1-unix.5 — 2026-10-26

- Preserve plugin-provided desktop MCP transport/current tools sockets when resuming chats.
- Add bounded automatic-replay protection after uncertain failures and keep slow
  metadata persistence from holding successful responses.
- Superseded: later releases fix missing-MIME and whole-turn false replay blocks.

## 1.19.1-unix.4 — 2026-10-26

- Add the local desktop Codex connection with a shared router, existing history,
  ephemeral native authentication and desktop setup/disconnect guidance.
- Add native desktop quota/tool/restart fixtures. Superseded after a plugin-only
  MCP configuration regression was discovered in real conversation resume.

## 1.19.1-unix.3 — 2026-10-26

- Update Electron to 44.9.3 and refresh vulnerable build/test dependencies.
- Build the native helper with Go 1.27.3.
- Preserve desktop runtime sockets in isolated Linux keyring tests so Wayland and Ptyxis work.
- Restore host GTK/schema paths when source Electron is launched from VS Code Snap.
- Add checksum-verified, user-local Linux source setup and start commands.
- Clarify Ubuntu prerequisites, isolated Kaggle Python setup and first-use instructions in Vietnamese and English.
- Correct Unix terminal and Python labels; keep Windows main and its release channel unchanged.

## 1.19.1-unix.2 — 2026-10-16

- Start CLI sessions in the home folder instead of the process folder (`/` after
  a Finder launch), and move an existing `/` setting to the home folder.
- Support Ptyxis, GNOME Console, MATE Terminal, Terminator, WezTerm, foot and a
  `TERMINAL` preference; report a missing terminal before decrypting a session.
- Wait up to two minutes for the first macOS Terminal automation approval.
- Discover Codex in Homebrew, `~/.local/bin` and nvm folders that GUI apps do not
  have in PATH.
- Configure `padkaggle` only in the shell profiles the user's shells read, keep
  linked dotfiles untouched and show the line to add manually; the Kaggle
  terminal now loads the user's `~/.bashrc`.
- Keep the private-session guardian alive until it re-seals after a late hangup,
  and stop delivering Ctrl+C twice to Codex.
- Skip IDE shutdown checks when the desktop folder is PADSwitcher's own isolated
  Codex home.
- Verify the macOS ZIP signature in CI and mark the AppImage as unsuitable for
  Ubuntu 24.04+ in the release notes.

## 1.19.1-unix.1 — 2026-10-16

- Add an isolated Linux/macOS edition on `feature/cross-platform` with a separate
  app identity, data store, Codex home, build output and prerelease namespace.
- Add a standalone Go transport/guardian, authenticated keyring-backed vaults,
  Unix Codex discovery, native terminal supervision and Bash/Zsh Kaggle selection.
- Add Linux AppImage/deb and macOS dmg/zip packaging, Windows regression checks,
  four Unix build targets, WSL development commands and packaged executable tests.
- Keep the Windows `main` branch and existing release artifacts unchanged.

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
