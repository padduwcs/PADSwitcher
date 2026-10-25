# Linux validation — 2026-10-26

Historical baseline audit of Unix.2. The Unix.3 follow-up upgrades Electron and
dependencies, fixes the recorded Linux issues, and adds source setup commands.
See [the current validation record](UNIX-VALIDATION.md) for the follow-up results.

The exercised offline flows passed on this Ubuntu desktop after fixing the Linux
smoke-test environment. This is evidence for the tested configuration, not a
long-duration stability certification. The Electron security advisory below
should be addressed before treating this preview as a stable release.

## Isolation and environment

- Linux source: `origin/feature/cross-platform`, commit `ed738f5`, version
  `1.19.1-unix.2`.
- Audit branch/worktree: `test/linux-stability`,
  `<workspace>/PADSwitcher-linux`.
- Windows worktree: `<workspace>/PADSwitcher`, still on `main` at
  `e16cf98b909d528362a15a2aa2d9a86e2e15ed1a`, with no working-tree changes.
  No Windows code, build output, release, tag or remote branch was changed.
- Ubuntu 26.04 LTS, x86_64, GNOME, Wayland; X11 was also exercised for the
  extended Electron layout tests.
- Node 24.18.1, Go 1.27.2, Electron 44.5.1, Python 3.14.4.
- Installed native Codex 0.163.0; actual native protocol tests passed with the
  executable discovered from the VS Code extension.
- No saved Codex/Kaggle accounts, real login, inference, reset credits or Kaggle
  jobs were used. Credentials were synthetic. Keyring tests ran on a separate
  D-Bus session with temporary configuration/data and a separate control socket.
- Toolchains, downloaded test utilities and the Python environment were prepared
  under ignored `artifacts/` directories. No system packages were installed.

## Results

| Check | Result and evidence |
| --- | --- |
| `npm run check` | Passed JavaScript and shell syntax checks. |
| `npm test` | **217 tests: 213 passed, 4 Windows PowerShell tests skipped, 0 failed.** Includes the new Linux runtime regression. |
| `npm run test:helper` | Passed native Go helper tests. |
| Go vet and race detector | `go vet ./...` and `go test -race ./...` passed. |
| Real Secret Service | All **8 Go tests**, including the normally opt-in system-keyring test, passed in an isolated session. |
| `npm run test:kaggle` | All **6** official SDK contract tests passed with Kaggle 2.2.4 and kagglesdk 0.1.37 on Python 3.14.4. |
| `npm run smoke:protocol` | Actual Codex, loopback responses: exact retry after quota failure, same-turn A/B fallback, sticky/cache headers and tools executed once passed. |
| `npm run smoke:say-hi` | Actual Codex, two synthetic accounts: one request per account, no tools, isolated credentials and cleanup passed. |
| `npm run smoke` | Actual Secret Service encryption/decryption, tamper rejection, private data permissions, guardian sealing and native terminal supervisor passed. |
| Bash and Zsh | Both shells actually exercised account A/B selection, failed-selection preservation, Python hook isolation, environment restoration and later PATH additions. Zsh was run from the downloaded test utility without installing it system-wide. |
| Native terminal lifecycle | Five actual Ptyxis terminal launches via `ProfileService.launchCli` with a synthetic account and `/usr/bin/true` passed. Auth was sealed again, `runtime.json` was removed, and the saved session survived a service restart. The workspace contained Vietnamese text, spaces, quotes and shell metacharacters. Actual Codex CLI argument parsing was separately checked with `--help`. |
| `npm run smoke:ui` | Actual source Electron app on Wayland: startup, renderer isolation, IPC, service navigation, Python probe and separate app-data namespace passed. |
| Extended Electron UI | Actual Chromium input/layout on X11: VI/EN, light/dark, widths 1920/1260/1000, greeting states, compact dialogs, scrolling, pagination, native drag resizing and persisted layout passed. |
| `npm run dist` | Linux amd64 deb and x86_64 AppImage built successfully; SHA-256 catalogs generated. |
| Packaged runtime | The unpacked build, executable extracted from the deb, and executable extracted from the AppImage all passed startup, IPC, service navigation and storage-isolation checks. |
| Installer layout | Desktop launchers preserve sandbox flags; native helper is executable; Python/shell assets are outside ASAR; Windows helper/PowerShell assets are excluded. |
| Electron fuses | Actual packaged fuse bytes confirmed RunAsNode, NODE_OPTIONS and Node CLI inspection disabled; OnlyLoadAppFromAsar enabled. |
| Debian dependency simulation | `apt-get -s install ./dist-unix/...amd64.deb` passed on this host; no additional dependencies needed. No installation was performed. |
| AppArmor profile | Bundled profile passed `apparmor_parser --skip-kernel-load --skip-cache`; it was not installed or loaded. |
| Packaged lifecycle | 56 page-navigation cycles, a 60-second idle observation, second-instance handoff, two graceful exits and restart persistence of language/theme/workspace/auto-refresh passed; **0 renderer exceptions**. This short observation does not establish memory-leak freedom. |

## Fixed: smoke tests broke desktop runtime access

`scripts/linux-test-session.sh` previously replaced `XDG_RUNTIME_DIR` with an empty
temporary folder. On this Wayland desktop, Electron could no longer find the
compositor socket. Ptyxis could also exit before connecting its terminal child,
leaving the helper waiting until its two-minute connection timeout.

The script now preserves an existing desktop runtime, while still isolating the
D-Bus session, config/data/cache folders and keyring control directory. Headless
runners without `XDG_RUNTIME_DIR` still receive a private temporary runtime.

A regression test opens a real Unix display socket and verifies that the wrapper
preserves its location, isolates keyring storage, drops inherited keyring/SSH
control variables, supplies the headless fallback and removes temporary data.
The desktop, terminal and packaged smoke checks passed after this fix.
No production application code or package versions were changed.

## Open findings

### High priority: Electron runtime security update

`npm audit` reports Electron 44.5.1 as affected by the compromised eMudhra
intermediate-certificate advisory. The upstream fix covers both Chromium and
Node TLS/HTTPS/fetch and is available in Electron **44.9.1 or later** on the 44.x
line. The app makes upstream HTTPS requests, so this runtime dependency deserves
priority; this audit did not reproduce an attack.
[Electron's advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9).

The installed runtime was preserved to test the existing preview. Before a new
Unix release, validate a patched Electron version through the same functional
and packaging checks. Existing Unix validation notes record a macOS signing
failure on an earlier attempted update, so a Unix-wide version change also needs
the macOS signing checks. Windows `main` does not need to be touched for this work.

### Build/test dependency advisories

The audit reports **3 affected package names: 2 high, 1 moderate**:

| Package | Installed versions | Scope | Patch information |
| --- | --- | --- | --- |
| Electron | 44.5.1 | Runtime, bundled in the application | 44.9.1+ for the certificate advisory; current npm audit proposes 44.9.3. |
| undici | 6.29.0, 7.30.0, 8.11.2 | npm build/test/download dependency trees | Patches include 6.29.1, 7.30.1 and 8.12.2. |
| fast-uri | 3.1.8 | electron-builder → ajv | 3.1.9 addresses the reported 3.x issues. |

The inspected ASAR contains neither the npm `undici` package nor `fast-uri`.
This observation concerns npm packages; it does not assess the independent
version of Undici embedded in Electron's Node runtime.
[Undici advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c),
[fast-uri advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr).
Complete advisory output is saved in `artifacts/linux-audit/logs/npm-audit.json`.

### Low priority: Windows wording in Unix screens/errors

`src/renderer/services.js` still describes Kaggle setup as PowerShell commands,
and `src/core/kaggle.cjs` has a Python-error message referring to `python.exe`.
These are misleading on Linux. They were recorded without modifying product UI
in this test-focused change.

### Host prerequisites and development environment

The system Python lacks `ensurepip`/`python3.14-venv`. The normal system command
`python3 -m venv` therefore fails. This is an unmet documented prerequisite,
not a failed Kaggle SDK contract. Tests used a task-local Python prefix with venv
support; a real Kaggle setup on this host still needs the venv prerequisite or an
explicitly selected working Python environment.

This terminal inherits VS Code Snap GTK/schema/module paths. Unmodified GUI
launches from that environment can fail with a missing GNOME schema key or load
incompatible portal modules. GUI checks cleared those inherited variables only
for the child test environment. This does not demonstrate a failure when the deb
is launched from a normal desktop menu. Temporary D-Bus sessions also produce
portal/accessibility shutdown warnings; the assertions still passed.

## Remaining acceptance coverage

- Install the deb with privileges and launch from its application-menu entry;
  verify AppArmor policy loading under a normal, non-Snap parent process. The
  current process inherits the VS Code Snap AppArmor complain label, so these
  sandbox results do not certify install-time policy behavior on an ordinary
  desktop launch. No `--no-sandbox` flag or global sandbox changes were used.
- The AppImage's extracted executable and layout passed. Direct FUSE launch is
  untested; this host lacks libfuse2, and the existing guide recommends the deb
  for Ubuntu 24.04+.
- Real browser login, token rotation with the live provider, actual quota reads,
  IDE integration in an existing VS Code/JetBrains session, tray behavior while a
  live gateway is connected, suspend/resume, keyring lock/unlock, logout/reboot,
  several-hour use and GPU/Kaggle workloads remain manual acceptance tasks.
- ARM64, other distributions/desktops and macOS were not run in this session.

## Reproduction and local artifacts

Run these from the Linux worktree, not the Windows `main` worktree:

```bash
export PATH="$PWD/artifacts/linux-audit/toolchains/node-v24.18.1-linux-x64/bin:$PWD/artifacts/linux-audit/toolchains/go/bin:$PATH"
npm run check
npm test
npm run test:helper
npm run smoke:protocol
npm run smoke:say-hi

# When invoked from the VS Code Snap terminal on this host:
env -u GTK_PATH -u GIO_MODULE_DIR -u GSETTINGS_SCHEMA_DIR \
  -u GTK_EXE_PREFIX -u GTK_IM_MODULE_FILE -u GDK_PIXBUF_MODULE_FILE \
  -u GDK_PIXBUF_MODULEDIR XDG_DATA_DIRS=/usr/local/share:/usr/share \
  dbus-run-session -- sh scripts/linux-test-session.sh \
  sh -c 'npm run smoke && npm run smoke:ui'
```

- Logs and additional local-only lifecycle scripts:
  `artifacts/linux-audit/`.
- Source UI screenshot: `artifacts/unix-ui.png`.
- Extended layout screenshots: `artifacts/electron-qa/`.
- Extracted-installer screenshots: `artifacts/linux-audit/deb-extracted.png`
  and `artifacts/linux-audit/appimage-extracted.png`.
- Build: `dist-unix/PADSwitcher-1.19.1-unix.2-Linux-amd64.deb` and
  `dist-unix/PADSwitcher-1.19.1-unix.2-Linux-x86_64.AppImage`, with individual
  `.sha256` files. These local test builds retain the original Electron version.

Git may show a line-ending-only difference for the inherited
`scripts/create-icon.cjs`: the Unix branch declares `*.cjs eol=lf` but committed
its last line with CRLF. Its raw bytes were restored to the exact source blob;
no Windows icon-generation change is part of this audit.
