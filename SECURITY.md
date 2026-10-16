# Security and privacy

On `feature/cross-platform`, the Unix edition uses AES-256-GCM with random
nonces and a per-data-root key stored in macOS Keychain or Linux Secret Service.
It refuses unavailable/locked keyrings and has no plaintext-key fallback.
Private directories use mode 0700 and secret files mode 0600; the native helper
rejects symlinks, hardlinks and broadly readable credential files. This edition
has a separate app ID, user-data directory, Codex home and release namespace.
See [docs/UNIX.md](docs/UNIX.md) for Unix-specific boundaries. Windows details
below describe the original edition on `main`.

## Supported versions

Security fixes are shipped in the latest GitHub release. Older portable builds and
untagged development snapshots are not supported; upgrade before reporting a problem
that may already be fixed.

PADSwitcher keeps account sessions on your Windows user account using DPAPI.
The local gateway listens only on loopback and uses a fresh capability at startup.
Model requests go to the fixed Codex upstream; PADSwitcher does not operate a hosted proxy.
It does not record prompts or credentials in its own logs. Codex may save conversation
history according to your Codex settings.

Windows user permissions protect local data; software running as the same user
can still access it. Do not share the app data directory, gateway connection files,
auth files, tokens, or diagnostic archives containing these files.

The Kaggle feature stores each API token in a separate Windows DPAPI vault.
The read-only bridge uses explicit credentials; account terminals receive their
token through process-local environment variables after decryption, without
changing the machine’s default Kaggle credentials. Tokens are not included in
renderer snapshots, command arguments, setup commands or app logs. A terminal
retains its token until closed, even after removing an account or updating its
token in PADSwitcher. Revoke the token on Kaggle to invalidate it everywhere.
See [Kaggle boundaries](docs/KAGGLE.md) for monitoring coverage and storage details.

The optional `padkaggle` PowerShell command decrypts the same DPAPI vault in the
calling terminal. Copied commands and profile blocks contain a script path and
account selector, never a token. Selecting an account changes process-local
Kaggle variables and PATH only. `off` restores the prior Kaggle environment;
children already started retain their inherited credentials. Profile setup is
explicit and modifies a marked block without replacing other settings or
bypassing PowerShell execution policy.

Automatic switching is opt-in, limited to supported personal accounts and confirmed
quota failures before response output. Reset credits always require explicit confirmation.
See [routing boundaries](ROUTING.md) and [validation limits](VALIDATION.md).

To report a vulnerability, use [GitHub private vulnerability reporting](https://github.com/padduwcs/PADSwitcher/security/advisories/new)
if it is available. Include the affected version, impact, reproduction steps and a
minimal proof of concept with all credentials removed. Please allow a reasonable time
for confirmation and a coordinated fix before public disclosure.

Otherwise open an issue asking for a private contact, without posting exploit details,
account identifiers or credentials. For ordinary bugs, use
[GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues) with the app version,
Windows version and steps to reproduce; redact personal information from screenshots.
