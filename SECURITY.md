# Security and privacy

## Supported editions

Use the current **stable Windows release** or the current **Unix prerelease**
linked from the [README](README.en.md#downloads). Windows Latest and Unix previews
are separate channels; an older Unix preview is not current because Windows
Latest has a different version number. Historical builds are retained for provenance.

## Local storage

| Edition | Credential protection | Local data |
| --- | --- | --- |
| Windows | Windows DPAPI and private user permissions | `%APPDATA%/PADSwitcher/data` |
| Linux/macOS | AES-256-GCM vault; per-root key in Secret Service/Keychain | Separate `PADSwitcher-Unix/data` app-data root |

Unix refuses locked/unavailable keyrings and has no plaintext-key fallback.
Private directories use 0700 and secret files 0600; the helper rejects unsafe
credential links/permissions. Do not copy Windows DPAPI vaults into Unix.

Software running as the same OS user can access that user's process data.
Encryption at rest does not isolate credentials from programs running as you.
Never share auth files, vaults, app-data archives or gateway connection files.

## Codex

The local gateway listens on loopback with fresh capabilities. Model requests
use the fixed Codex upstream; PADSwitcher does not operate a hosted proxy.
PAD diagnostics do not record prompts, responses, credentials or capability URLs.
Native Codex can retain its conversation history according to its own settings.
Sandboxing and tool approvals stay with native Codex.

Account fallback is opt-in, limited to supported personal accounts and confirmed
quota rejection before output. Reset credits require explicit confirmation.
See [Windows routing](https://github.com/padduwcs/PADSwitcher/blob/main/ROUTING.en.md)
and [Unix routing](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/architecture/ROUTING.en.md)
for edition-specific behavior and validation.

## Kaggle terminals

Tokens are encrypted in the edition's local vault. The Python reader receives
explicit credentials through stdin; copied setup/account commands do not contain
tokens. Each selected terminal holds its token in memory/environment, and children
inherit it. Removing/replacing a saved token does not revoke open terminal copies;
close those terminals and revoke the token with Kaggle for immediate invalidation.

Shell setup is explicit: Windows uses a marked PowerShell profile block; Unix
uses Bash/Zsh startup blocks. Existing unrelated profile content is preserved.
The app does not bypass execution policy or alter default Kaggle credentials.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/padduwcs/PADSwitcher/security/advisories/new)
when available. Include the affected edition/version, impact, reproduction and a
minimal proof with credentials removed. Allow time for coordinated remediation.
If private reporting is unavailable, open an issue requesting a private contact
without publishing exploit details or account data.

Ordinary bugs go to [GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues/new/choose).
Include app version, operating system/architecture and steps to reproduce; redact
screenshots. See [Support](SUPPORT.md).
