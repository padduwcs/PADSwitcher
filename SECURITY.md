# Security and privacy

PADSwitcher keeps account sessions on your Windows user account using DPAPI.
The local gateway listens only on loopback and uses a fresh capability at startup.
Model requests go to the fixed Codex upstream; PADSwitcher does not operate a hosted proxy.
It does not record prompts or credentials in its own logs. Codex may save conversation
history according to your Codex settings.

Windows user permissions protect local data; software running as the same user
can still access it. Do not share the app data directory, gateway connection files,
auth files, tokens, or diagnostic archives containing these files.

Automatic switching is opt-in, limited to supported personal accounts and confirmed
quota failures before response output. Reset credits always require explicit confirmation.
See [routing boundaries](ROUTING.md) and [validation limits](VALIDATION.md).

To report a vulnerability, use [GitHub private vulnerability reporting](https://github.com/padduwcs/PADSwitcher/security/advisories/new)
if it is available. Otherwise open an issue asking for a private contact, without posting
exploit details, account identifiers or credentials. For ordinary bugs, use
[GitHub Issues](https://github.com/padduwcs/PADSwitcher/issues) with the app version,
Windows version and steps to reproduce; redact personal information from screenshots.
