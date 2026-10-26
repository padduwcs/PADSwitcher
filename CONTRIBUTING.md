# Contributing to PADSwitcher

[Documentation](docs/README.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

## Choose the edition first

| Change targets | Base branch | Development guide |
| --- | --- | --- |
| Windows | `main` | [Windows setup](https://github.com/padduwcs/PADSwitcher/blob/main/docs/DEVELOPMENT.md) |
| Linux/macOS | `feature/cross-platform` | [Unix setup](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/DEVELOPMENT.md) |

Create a topic branch from the appropriate base and target that same branch in
your pull request. Do not merge the Unix app into Windows to update shared docs.
A source clone without an explicit branch defaults to the Windows edition.

One checkout is enough for either edition; save work before switching, then
prepare the selected branch's dependencies. Installed apps have separate data
and run independently of source checkouts.

## Before changing code

- Search [issues](https://github.com/padduwcs/PADSwitcher/issues) and existing pull requests.
- Discuss a large feature, protocol change or runtime major upgrade in an issue first.
- Keep changes focused and update Vietnamese/English text together.
- Update the appropriate changelog for user-visible behavior changes.
- Never commit accounts, tokens, `auth.json`, vaults, connection files or test app data.

## Verify the change

Both editions require Node.js 24+ and use these basic checks:

```bash
npm run check
npm test
```

On Unix also run `npm run check:docs` for documentation/structure changes.
For transport/account changes run the applicable native loopback checks:

```bash
npm run smoke:protocol
npm run smoke:say-hi
```

Unix account routing additionally has `smoke:faults`, `smoke:continuity` and
`smoke:desktop`. Follow the selected edition's development guide for the keyring,
UI, Python contract and packaged checks; platform-specific commands differ.
Packaging changes need a build and that edition's packaged smoke checks.

Routine checks use synthetic accounts, local model replies and disposable homes.
They must not consume real inference quota, reset credits or Kaggle compute.
Live checks require explicit maintainer authorization and are outside routine CI.

## Preserve the existing boundaries

- Windows uses DPAPI; Unix uses an authenticated vault backed by Keychain/Secret Service.
- Keep local gateways on loopback with capability checks.
- Preserve Codex sandboxing and tool approvals.
- Never log prompts, responses, credentials, account IDs or capability URLs.
- Quota fallback preserves request bytes and only happens before model output.
- An uncertain model step must not be automatically repeated or lock later user input.

## Submit a pull request

Describe the concrete problem, resulting behavior, checks run and relevant limits.
Include screenshots for UI changes. For docs-only work, state that no runtime
code changed. Generated helpers, installers, logs and screenshots from private
account sessions do not belong in the commit.

For security reports, use [SECURITY.md](SECURITY.md). For ordinary bugs, use the
[issue templates](https://github.com/padduwcs/PADSwitcher/issues/new/choose) and
include your app version, OS/architecture and reproduction steps.
