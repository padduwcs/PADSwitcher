# Unix edition validation

Baseline: Windows `main` commit `5444e11e577753181604f06572cd75cb092bbeef`.
Implementation is confined to `feature/cross-platform` in a separate worktree.
The baseline worktree remained clean and its commit did not change during development.

## Local evidence — 2026-10-16

- Windows 11 Home x64: JavaScript/PowerShell syntax and the inherited offline
  regression suite passed in the Unix worktree. Windows native helper source and
  `src/core/windows.cjs` remain byte-for-byte unchanged from the baseline.
- Ubuntu 26.04 x64 under WSL2/WSLg: full offline Node suite and native Go helper
  tests passed. Unix discovery, authenticated WebSocket bridging, macOS app-bundle
  process matching, private file checks, vault corruption and owner-death cleanup
  have dedicated coverage.
- Real Secret Service: temporary keyring round trip, authenticated encryption,
  session guardian sealing and wrong-identity preservation verified with fixtures.
- Bash and Zsh: account switching, failed selection preservation, restoration of
  prior Kaggle environment, Python hook isolation and later PATH additions verified.
- Native Linux terminal: the supervisor waits for the actual terminal command,
  including terminal launchers that detach.
- Real native Codex 0.160.0: loopback protocol, account fallback in the same turn,
  sticky cache headers, exact retry, one-time tool execution and isolated Say hi
  protocol checks passed without real inference or saved accounts.
- Electron source and actual packaged Linux executable: startup, sandbox, IPC,
  service navigation, Python probe, separate data namespace and screenshots verified.
- Linux x64 AppImage and deb packaging completed locally. The packaged helper
  and shell/Python assets are checked outside ASAR with executable permissions.

## CI and remaining manual coverage

`unix-ci.yml` validates Windows regressions and builds Linux x64/arm64,
macOS Intel/Apple Silicon. A job is evidence only after it has completed successfully;
the presence of a workflow is not itself proof of platform compatibility.

No local macOS desktop was available during implementation. Keychain behavior,
native macOS packaging and packaged startup must be confirmed by the macOS jobs.
Terminal.app automation permission, real JetBrains/VS Code integration, installing
the deb/AppImage on a full desktop, distribution-specific keyrings/trays and real
browser login remain manual acceptance checks. No real account sessions or quota
credits were used for these automated checks. Developer ID signing/notarization
has not been configured.

The Linux preview targets desktops exposing Secret Service. KDE setups without
that interface and headless environments without an unlocked keyring are not
claimed as supported. The app fails closed when the keyring is unavailable.
