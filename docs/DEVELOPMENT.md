# Development

This branch builds the isolated Linux/macOS edition. For the complete Linux,
macOS and WSL prerequisites and commands, use [UNIX.md](UNIX.md). For end-user
installation without developer tools, use [the installation guide](UNIX-INSTALL.en.md).

```bash
git clone --branch feature/cross-platform https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
bash scripts/setup-linux.sh
# Ubuntu 24.04+: keep the source Electron sandbox enabled.
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
bash scripts/start-linux.sh
```

Setup installs checksum-verified Node.js 24.18.1 and Go 1.27.3 toolchains under
`~/.local/share/padswitcher-unix-dev` (or `$XDG_DATA_HOME`), runs `npm ci` and
builds the helper. System Node/Go and shell startup files are untouched. Repeat
the sandbox ownership/mode commands after a fresh `npm ci` on restricted Ubuntu
desktops. Do not disable sandboxing. The installed deb supplies its own sandbox
integration and does not require these source-development steps.

For npm/go commands below, run `. ~/.local/share/padswitcher-unix-dev/env.sh` in
your terminal, or use your existing Node.js 24+ and Go 1.27.3+ installation.
On macOS, install those toolchains and use `npm ci` / `npm start` directly.

## One folder and two branches

One checkout is enough for normal development. Use `main` for Windows and
`feature/cross-platform` for Linux/macOS. Commit or stash unfinished work and stop
any source-running app before switching:

```bash
git status
git switch main                    # Choose Windows
# Or, when working on Linux/macOS:
git switch feature/cross-platform
```

Switching updates tracked files without merging branches or moving their tips.
It does not change an installed app or its user data. A second worktree is
optional when both versions need to remain open simultaneously.

Dependencies and generated helpers belong to the selected edition. Follow that
branch's setup instructions after switching; on Linux, rerun `setup-linux.sh`
and the sandbox ownership/mode commands shown above. Generated Unix output
(`dist-unix/` and `src/assets/PADCodex`) can remain locally when viewing `main`.
If Git lists it as untracked there, add these two paths to `.git/info/exclude`
locally; do not stage generated files or change Windows source to hide them.

The Unix attributes preserve the inherited Windows icon helper byte-for-byte.
Its mixed line endings do not need to be normalized when working on this branch.

## Service pages

`src/renderer/services.js` declares the service registry, entry cards and context
navigation. Add a service there with its existing page IDs and translated labels;
add the corresponding `.page` section in `index.html` and its renderer/IPC as needed.
The delegated `data-page` handler supports cards rebuilt by state updates. Opening
a page only navigates: account activation remains an explicit service action.
Global appearance belongs to Settings; provider configuration belongs to its service.

## Checks and packaging

For this Unix branch, use the complete check/build commands in [UNIX.md](UNIX.md#kiểm-thử-và-đóng-gói). The Windows-specific examples below document inherited architecture and apply only to `main`.

```powershell
npm run check
npm test
& ./artifacts/kaggle-sdk-probe/Scripts/python.exe -I test/kaggle-reader-test.py
npm run smoke
npm run smoke:protocol
npm run smoke:say-hi
npm run smoke:ui
npm run dist
node scripts/run-electron.cjs scripts/electron-packaged-smoke.cjs
```

The Python contract check requires an isolated environment. CI creates it with:

```powershell
py -3.12 -m venv artifacts/kaggle-sdk-probe
& ./artifacts/kaggle-sdk-probe/Scripts/python.exe -m pip install 'kaggle==2.2.4' 'kagglesdk==0.1.37'
```

These checks use fixtures and disposable app data. They do not consume real reset
credits or require logging into a real account. The packaged smoke check runs after
`dist` and exercises the ASAR code, helper, connection indicator and tray behavior.

`npm run build` makes `dist/win-unpacked`; `npm run dist` also makes the portable
`dist/PADSwitcher-<version>-Windows.exe`. GitHub Actions checks and builds on Windows.
For a release, follow [RELEASING.md](RELEASING.md); a version tag runs the isolated
checks and publishes the tested executable with its SHA-256 file through GitHub Releases.
The portable build currently has no code-signing certificate or automatic updater.

## Say hi

`src/core/say-hi.cjs` owns a sequential, user-triggered greeting job with session
progress and per-account results. Credential lookup uses the existing account
lock; inference runs outside it in a dedicated ephemeral Codex home, with no
execution environment, user project instructions or gateway account fallback.
The job never changes the shared or private client selections. Pending accounts
are protected from session replacement/removal; normal quota reads and gateway
work remain available. Stop finishes the current greeting; shutdown interrupts
only the dedicated backend. Ambiguous outcomes are never resubmitted by the job.

`npm run smoke:say-hi` exercises the real installed Codex binary against loopback
model responses and synthetic tokens. Account quota reads are fixtures; it does
not access saved accounts or send real inference requests. Real service-side
quota activation and the amount charged still require live user acceptance.

For an isolated development build, use
`npx electron-builder --win portable --config.directories.output=dist/preview`.
Set `PADSWITCHER_PACKAGED_ROOT` to the absolute path of
`dist/preview/win-unpacked` when running the packaged smoke script.
This keeps the ordinary release output separate.

## Optional real-account diagnostics

Run these only when deliberately authorizing access to your own accounts:

- `node scripts/router-native-smoke.cjs --live`: reads local account policy;
  model responses are local fixtures.
- `node scripts/router-live-smoke.cjs --live --inference`: makes real model calls
  and therefore uses quota. Uses a locally injected quota failure for fallback.
- `npm run smoke:gateway`: also makes a real model call.
- `node scripts/jetbrains-smoke.cjs --live`: requires the IDE-installed ACP 2.1.1
  runtime, two saved accounts and the native local model catalog. Uses saved
  sessions for read-only workspace policy discovery; all model replies and quota
  failures are local fixtures. Checks ACP chat, permissions, a single tool write
  and post-tool fallback without consuming inference quota or reset credits.
  Configuration changes target a disposable `.jetbrains/acp.json`.
  Add `--split` to verify the stable endpoint dispatching ACP to a separate native
  backend and router while the shared account remains unchanged.
- `npm run smoke:recovery`: checks the retained legacy recovery path; it is not
  the production request-routing flow.

Never test reset consumption with a real account as part of routine checks.
Do not commit account data, generated connection files, logs or QA directories.

The Kaggle feature has no real-account checks in the routine suite. Its optional
offline Python contract tests require Python 3.11+, `kaggle>=2.2.4,<3` and
`kagglesdk>=0.1.37,<1`. Run `python -I test/kaggle-reader-test.py` using an
interpreter with those packages. See [Kaggle](KAGGLE.md) for the independent
terminal design, API coverage and the remaining live acceptance checks.

Kaggle preview fixtures accept `?demo=1&kgmany=1` for 20 pinned and 12 recent
notebooks with synthetic pagination. Electron UI smoke uses this fixture to check
independent scroll geometry, end-scroll loading and position preservation in both
themes/languages and window sizes. Additional notebook pages are account-specific
memory caches; persisted first-page/pinned snapshots keep their existing bounds.

`?demo=1&kgquiet=1` shows three idle accounts with long display names, including
one matching its username. This checks the compact sidebar without using real
user identities. The shared `padKaggleUI.instructions()` content powers the
in-page guide and Help, with technical steps in closed disclosures by default.

Kaggle layout preferences live in renderer localStorage under `pad-kaggle-layout`.
Window-relative defaults apply until a size is chosen. Native Chromium mouse
checks cover drag capture through state updates, column/list resizing, reloading
saved sizes, reset and page-scroll pagination when a custom list fits its rows.

## Layout

| Folder | Purpose |
|---|---|
| `src/core` | Account vault, Codex App Server gateway and model router |
| `src/helper` | Native CLI/extension bridge source |
| `src/renderer` | UI, themes and Vietnamese/English strings |
| `src/assets` | Logo, icons and local fonts |
| `scripts` | Build, preview and isolated smoke checks |
| `test` | Unit/integration tests and mock backends |

See [ROUTING.md](../ROUTING.md) for routing boundaries and
[VALIDATION.md](../VALIDATION.md) for the release verification scope.
