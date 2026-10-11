# Contributing to PADSwitcher

Thank you for helping improve PADSwitcher. Small, focused changes are easiest to review and safest for users who rely on their saved sessions.

## Before you start

- Search existing [issues](https://github.com/padduwcs/PADSwitcher/issues) before opening a new one.
- Use a feature request issue before starting a large UI, architecture, dependency, or protocol change.
- Never include real Codex sessions, Kaggle tokens, account identifiers, app-data folders, gateway files, or unredacted screenshots.
- Do not run live inference, consume reset credits, or submit Kaggle jobs unless a maintainer explicitly asks for that acceptance test.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Requirements:

- Windows 10/11 x64
- Node.js 24 LTS and Git
- .NET Framework 4.8
- Python 3.11+ only for the optional Kaggle SDK contract checks

```powershell
git clone https://github.com/padduwcs/PADSwitcher.git
cd PADSwitcher
npm ci
npm start
```

The native helper is generated automatically and must not be committed. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture, fixtures, packaging, and optional checks.

## Making a change

1. Create a branch from the latest `main`.
2. Keep the change focused; avoid unrelated formatting or refactors.
3. Add or update tests for changed behavior.
4. Update Vietnamese and English UI/documentation together.
5. Document user-visible changes in `CHANGELOG.md` under the intended release.

Security-sensitive rules:

- Preserve Windows DPAPI storage and private ACL handling.
- Keep gateways on loopback with capability checks.
- Never log credentials, prompts, response bodies, account IDs, or capability URLs.
- Do not weaken Codex sandboxing or tool approvals.
- Preserve byte-identical model request retry boundaries and stop retrying after output.

## Checks

Run at least:

```powershell
npm run check
npm test
npm run smoke
npm run smoke:protocol
npm run smoke:say-hi
npm run smoke:ui
```

For packaging changes, also run:

```powershell
npm run dist
node scripts/run-electron.cjs scripts/electron-packaged-smoke.cjs
```

The routine suite uses fixtures and disposable data. It must not access saved accounts or consume model/Kaggle quota.

## Pull requests

Include:

- what changed and why;
- screenshots for visible UI changes;
- checks you ran and their results;
- known limits or follow-up work;
- a statement that no live credentials or quota were used, when applicable.

Keep generated directories (`dist`, `artifacts`, `.preview`, `node_modules`) out of commits. Maintainers may ask to split large pull requests.

## Reporting problems

Use the issue templates for bugs and feature requests. For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
