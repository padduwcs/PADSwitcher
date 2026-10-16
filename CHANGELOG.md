# Changelog

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
