# Unix edition validation

Baseline: Windows `main` commit `5444e11e577753181604f06572cd75cb092bbeef`.
Implementation is confined to `feature/cross-platform`. Validation initially used
a separate worktree; normal development can use [one checkout and switch branches](DEVELOPMENT.md#one-folder-and-two-branches).
The Windows baseline stayed unchanged during development.

## 1.19.1-unix.3 — 2026-10-26

- Electron 44.9.3; native helper built with Go 1.27.3; refreshed npm lockfile
  reports zero audit advisories at validation time.
- Ubuntu 26.04 x64 desktop: 220 Node tests (216 passed, four Windows-only skips),
  native Go tests, Go vet/race checks, six official Kaggle SDK contracts and
  native Codex 0.163.0 loopback protocol / isolated Say hi checks passed.
- Verified the source setup script downloads and checks official Node/Go archives,
  installs dependencies, and builds the helper without replacing system toolchains.
- Added regression coverage for Wayland/runtime preservation in isolated test
  sessions and host desktop environment restoration from VS Code Snap.
- Linux amd64 deb and x86_64 AppImage build with the patched Electron runtime.
  Source Wayland UI, extended X11 layout checks and the installed deb startup,
  sandbox, IPC and extracted AppImage layout checks passed on Ubuntu 26.04.
- Installed the deb, its AppArmor profile and Python venv prerequisites on the
  local desktop. Prepared the managed Kaggle environment without loading saved
  credentials. npm audit and Go govulncheck found no advisories.
- All five [CI jobs](https://github.com/padduwcs/PADSwitcher/actions/runs/40222587399)
  passed for source commit `4bfe40d66203322c08658ac621cd55dee79e1706`.
  All six [release jobs](https://github.com/padduwcs/PADSwitcher/actions/runs/40223192747)
  also passed, including installed deb checks on x64/ARM64 and macOS DMG/ZIP
  signature and installed-app checks on Intel/Apple Silicon.
- [Unix.3 is public](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.3)
  with 19 verified assets. Post-publication anonymous requests reached all eight
  installer links. A downloaded amd64 deb, both installation guides and the
  combined checksum catalog matched their published SHA-256 metadata.
- Windows `main` remains at `e16cf98b909d528362a15a2aa2d9a86e2e15ed1a` with a
  clean worktree. Windows release `v1.19.1` retains Latest; its asset IDs, sizes,
  SHA-256 digests and update times are unchanged. Unix.3 remains a separate
  prerelease with manual updates. No saved credentials, live inference or real
  Kaggle jobs were used in validation.

The [earlier Linux audit](archive/LINUX-AUDIT-2026-10-26.md) records the original findings
and the boundary between offline fixtures and real-account acceptance.

## 1.19.1-unix.2 local evidence — 2026-10-16

Review fixes for the first public preview, verified before tagging:

- Windows 11 x64 (PowerShell): 207 offline tests passed, 9 Unix-only tests skipped.
  `src/core/windows.cjs` and the Windows helper are unchanged.
- Ubuntu WSL2/WSLg, `scripts/wsl-dev.ps1 -Task verify`: syntax checks, 212 Node
  tests (4 skipped), Go helper tests, official Kaggle SDK contracts, native Codex
  protocol and Say hi checks, real Secret Service vault/guardian, Bash/Zsh
  selection, the native terminal supervisor, source Electron, AppImage/deb build
  and the packaged executable all passed.
- New coverage: terminal selection order, `TERMINAL` preference and missing
  terminal; Codex discovery in `~/.local/bin`, Homebrew and nvm folders with a
  minimal GUI PATH; shell profile selection and preserved dotfile links; home
  folder default and migration of a stored `/`; IDE checks skipped for the
  isolated desktop folder.
- Still requires the macOS CI runners: DMG and ZIP signature verification and
  the Keychain smoke checks.

CI and publication: all five jobs passed in
[GitHub Actions run 38895753261](https://github.com/padduwcs/PADSwitcher/actions/runs/38895753261)
for commit `984f49fa5af1a8851858056a6e706ef9f99e38df` (212 Node tests and Go
helper tests on each Unix runner; installed deb on Ubuntu x64/arm64; DMG launch
plus DMG and ZIP signature checks on macOS Intel/Apple Silicon). The
[release workflow](https://github.com/padduwcs/PADSwitcher/actions/runs/38896524474)
rebuilt and published [Unix 1.19.1-unix.2](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.2)
with 19 verified assets; the Windows release keeps the Latest label. A download
of the amd64 deb matched its checksum, and its helper reported a missing
terminal and detected Ptyxis as expected.

Not included: Dependabot's Electron 44.7.0 update failed the macOS signature
checks in CI, so this release stays on the verified Electron 44.5.1.

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

At the end of the initial port, both local and remote Windows `main` still pointed to
`5444e11e577753181604f06572cd75cb092bbeef`, the Windows worktree was clean, and
the repository's latest stable release was still `v1.19.1`. No merge, Unix tag
or release publication was performed during that initial implementation.

## Public preview release checks

All five jobs passed again in [run 38883346230](https://github.com/padduwcs/PADSwitcher/actions/runs/38883346230)
for source commit `c0d75d7c87892fa4957cbb8785bdbae08e58818c`, including the newly
added installed-deb and copied-DMG tests on all four native Unix runners.

The release-readiness update adds five tests for complete architecture coverage,
corrupt downloads, accidental Windows assets, tag/version isolation and GitHub's
uploaded-asset SHA-256 digests. The local Windows suite now has 212 tests:
206 passed and six platform-dependent tests were skipped.

Both Unix CI and the tag release workflow install the generated deb on disposable
Linux runners and launch that installed executable. They also extract the actual
AppImage and check its helper layout and desktop launcher. On macOS they mount
the generated DMG read-only, copy its app into a temporary Applications folder,
verify the ad-hoc signature and launch the copied bundle. These checks do not
simulate a quarantined browser download or grant Gatekeeper/Terminal permissions.

The AppImage launcher explicitly has no automatic `--no-sandbox` flag. It is
supported on desktops permitting the required user namespaces; Ubuntu users
should prefer the deb, which supplies the install-time sandbox/AppArmor setup.
The source/unpacked and installed application smoke tests preserve sandboxing.

Release publication waits for the Windows regression job and all four native
Unix builds. Before a draft is made public, all eight installers, their eight
individual checksums, two installation guides and one combined checksum catalog
must be present. Every uploaded asset's name, size, uploaded state and SHA-256
digest is compared with the verified local file. The release remains a prerelease
and explicitly uses `latest=false`. See the tag's **Publish Unix prerelease**
Actions run for the release-specific results.

## Published public preview — 2026-10-16

[Unix 1.19.1-unix.1](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.1)
was published from commit `9183431edb19b59dd9bfa096265f22550cf9b9a3`.
All six jobs in [release run 38885833956](https://github.com/padduwcs/PADSwitcher/actions/runs/38885833956)
passed, including the final draft-asset integrity check and publication. All five
jobs in [CI run 38885826092](https://github.com/padduwcs/PADSwitcher/actions/runs/38885826092)
also passed for that same commit. Draft metadata is read through its canonical
release API URL, since the tag-based REST endpoint does not expose drafts.

Post-publication checks downloaded all 19 assets back into the Unix worktree and
compared every file's size and SHA-256 digest with GitHub's release metadata.
Anonymous HTTP requests reached the public release page and all eight installer
links, and downloaded the Vietnamese guide with a matching digest. No GitHub
sign-in is required to obtain these release files.

The release is public, marked prerelease, and is not Latest. The existing Windows
release `v1.19.1` retains Latest; its original asset IDs, sizes, digests and update
times are unchanged. Local and remote Windows `main` still point to the baseline
`5444e11e577753181604f06572cd75cb092bbeef`, and its worktree remains clean.
