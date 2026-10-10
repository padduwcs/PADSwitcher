# Development

Use Windows 10/11 x64, Node.js 24 LTS, Git and .NET Framework 4.8. The native helper
is compiled with the Windows .NET Framework C# compiler; it is generated, not tracked.

```powershell
git clone https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

`npm start`, `npm test`, `npm run build` and `npm run dist` build the helper first.
Use a local Codex CLI or the Windows Codex extension, version 0.160.0 or later;
newer versions need compatibility verification when their protocol changes.

## Checks and packaging

```powershell
npm run check
npm test
npm run smoke
npm run smoke:ui
npm run dist
node scripts/run-electron.cjs scripts/electron-packaged-smoke.cjs
```

These checks use fixtures and disposable app data. They do not consume real reset
credits or require logging into a real account. The packaged smoke check runs after
`dist` and exercises the ASAR code, helper, connection indicator and tray behavior.

`npm run build` makes `dist/win-unpacked`; `npm run dist` also makes the portable
`dist/PADSwitcher-<version>-Windows.exe`. GitHub Actions checks and builds on Windows.
For a release, publish the tested executable and its SHA-256 file through GitHub Releases.
The portable build currently has no code-signing certificate or automatic updater.

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
