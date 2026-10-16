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

All five jobs passed in [GitHub Actions run 38876297351](https://github.com/padduwcs/PADSwitcher/actions/runs/38876297351)
for source commit `0f027c11d0662d9259ace348dc340cbaae9c96bf` on 2026-10-16:

| Job | Result |
| --- | --- |
| Windows regression | Passed Node/PowerShell checks and official Kaggle SDK contracts |
| Ubuntu 24.04 x64 | Passed full tests, native protocol, keyring, source/packaged Electron; AppImage/deb built |
| Ubuntu 24.04 arm64 | Passed the same checks; native arm64 AppImage/deb built |
| macOS 15 Apple Silicon | Passed full tests, native protocol, real Keychain/guardian, Bash/Zsh, source/packaged Electron; ad-hoc signed dmg/zip built |
| macOS 15 Intel | Passed the same checks; native x64 dmg/zip built |

The Unix Node suite contains 207 tests: 203 passed and four Windows-only tests
were skipped on Unix. The native helper's offline tests and six official Kaggle
SDK contract tests also passed. Artifacts include per-file SHA-256 checksums.
The packaged test launches the actual built executable; on macOS it reads
`CFBundleExecutable` from the signed bundle's `Info.plist`.

Linux CI provisions Chromium's SUID sandbox helper on the disposable runner;
the application sandbox is not disabled. Mac temporary paths are canonicalized,
and terminal sockets use a short private directory to fit macOS socket limits.

No local macOS desktop was available during implementation. Keychain behavior,
native macOS packaging and packaged startup were verified on GitHub's macOS runners.
Terminal.app automation permission, real JetBrains/VS Code integration, installing
the deb/AppImage on a full desktop, distribution-specific keyrings/trays and real
browser login remain manual acceptance checks. No real account sessions or quota
credits were used for these automated checks. Developer ID signing/notarization
has not been configured.

The Linux preview targets desktops exposing Secret Service. KDE setups without
that interface and headless environments without an unlocked keyring are not
claimed as supported. The app fails closed when the keyring is unavailable.

At final verification, both local and remote Windows `main` still pointed to
`5444e11e577753181604f06572cd75cb092bbeef`, the Windows worktree was clean, and
the repository's latest stable release was still `v1.19.1`. No merge, Unix tag
or release publication was performed during this implementation.
