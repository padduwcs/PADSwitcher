# Security and privacy

PADSwitcher keeps account sessions on your Windows user account using DPAPI.
The local gateway listens only on loopback and uses a fresh capability at startup.
Model requests go to the fixed Codex upstream; PADSwitcher does not operate a hosted proxy.
Optional GPT Web models use an isolated local companion and the owner's signed-in
ChatGPT browser session. They never receive native Codex credentials and never
fall back to native model inference. Each Web account has private browser data,
bridge configuration and CODEX_HOME. The actual Codex home is read only for
trusted rollout/workspace authority; Web setup does not rewrite its auth/config.
Web browser sessions and upstream logs have a different storage format from the
DPAPI Codex account vault. See [GPT Web data boundaries](docs/GPT_WEB.md).
Managed setup accepts tunnel credentials only through authenticated local control,
with an 8 KiB request limit and browser-Origin rejection. Credentials are never
returned in public setup status/errors and are cleared from the wizard input after
submission or dismissal. Setup jobs require explicit user action; duplicate request
IDs and lost acknowledgements cannot replay a browser test or trigger native inference.
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
