# Model routing

[Tiếng Việt](ROUTING.md)

PADSwitcher uses the official Codex App Server for conversations, sandboxing, tools, and approvals. Its local relay has a deliberately narrow role: select credentials for Codex Responses requests and retry a request on another eligible personal account only after a confirmed quota rejection.

## Connection groups

`GatewayHub` exposes one stable helper endpoint. During initialization, each client is identified as VS Code, JetBrains, or CLI and remains attached to that backend for the connection lifetime.

By default, all clients share one backend, router, account selection, and auto-switch policy. A client type can instead use a private group with its own native backend, in-memory credentials, pending switch queue, and policy. Account vaults, credential refresh locks, and quota cooldowns remain shared because they belong to the account.

Changing a group never moves an active socket to another backend. PADSwitcher waits for work to finish, reserves the affected client type, applies the new configuration, and disconnects only that client so it can reconnect once. A failed private backend never falls back to shared credentials.

## Request flow

1. `PADCodex` connects the extension or CLI to the official Codex App Server.
2. Only the managed backend receives an `openai_base_url` pointing to PADSwitcher's loopback relay. Shared Codex configuration and authentication are not rewritten.
3. Model WebSocket attempts receive HTTP 426 so compatible Codex versions use full-input HTTP Responses requests.
4. The relay obtains a matched bearer/account bundle from the encrypted local vault and forwards the unchanged request body to the fixed Codex upstream.
5. A structured `usage_limit_reached` response before any output can select another eligible personal account and retry the exact request bytes.
6. Once response text, tool items, or other output has been committed, the relay never retries that response on another account.
7. No second `turn/start` or synthetic “continue” input is created. Native account state is reconciled once that backend's active work finishes.
8. Every model request carries the relay's credential, so a manual choice changes the relay at once. A streaming step finishes uninterrupted and the next model call uses the new account, the same way a quota rotation does. Neither a switch nor an auth sync blocks `turn/start` in other sessions.

## Safety boundaries

- Automatic routing supports identified personal Free/Plus/Pro accounts. Organization and unknown managed plans are rejected from cross-account routing.
- Requests containing account-bound server references are not replayed across accounts.
- The SSE prelude is bounded; after the first output event, the remaining stream passes through without account mixing.
- The relay listens only on `127.0.0.1`, uses a random port and fresh 256-bit capability, validates host/auth headers, and rejects browser origins.
- Production upstream and model endpoints are fixed. Redirects and arbitrary proxy targets are rejected.
- Body, decoded-body, concurrency, error-body, account-selection, and inactivity limits bound resource use.
- A credential rejected with HTTP 401 is refreshed once for that same account. Network errors, generic 429/403/5xx responses, uncertain outcomes, and partial output do not rotate accounts.
- Disabling auto-switch prevents new fallback work; disconnecting a client or stopping the gateway aborts affected upstream requests. If a request hits quota just after the user selected another account, it moves to that selected account, and an older request can never overwrite the newer choice.
- Prompts, request bodies, tokens, capability URLs, response text, and account/thread identifiers are not written to PADSwitcher logs or diagnostics.
- Reset credits are never consumed automatically.

These controls reduce accidental replay and credential mixing; they do not guarantee service acceptance, stable quota policy, or compatibility with future Codex protocols.

## Verification

The automated suite covers:

- exact request-byte retry before output and no retry after text/tool output;
- structured quota classification, account references, managed plans, auth refresh, compressed bodies, exhaustion, redirects, browser access, and disconnects;
- native cache-affinity/session headers and account-specific sticky routing state;
- active-turn and account lifecycle protection;
- shared/private VS Code, JetBrains, and CLI groups;
- bounded diagnostics that retain no prompts, credentials, or identifiers.

`npm run smoke:protocol` runs a real compatible Codex binary against local model fixtures and synthetic credentials. It verifies initial and post-tool fallback in one turn, byte-identical A/B requests, preserved cache metadata, and tools executed once. Optional live diagnostics are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md); they are not part of routine checks.

See [VALIDATION.md](VALIDATION.md) for the current release evidence and known limits.


## Windows 1.20 routing additions

Local Codex desktop uses its bundled native engine and existing conversation
home through a separate backend sharing the common model router. It follows the
Shared account and policy; VS Code/CLI/JetBrains private routes remain separate.
Native auth is ephemeral and verified before the desktop endpoint becomes ready.
Desktop MCP uses a user/SYSTEM-only named pipe bound to the current GUI transport.

Native retries are never cut short. Repeated uncertain failures of one model step
are counted in bounded process memory, keyed by a hash of request route, native
thread/turn and user/tool/agent-result progress, and only attempts past the
measured native budget (30 with default settings on 0.164, limit 32) are refused.
Partial assistant recovery alone is not progress; new user/steering input,
completed tool results and new agent messages start a new count. Agent delivery
timestamps alone do not count as progress. Explicit HTTP rejection and early SSE
failure before output are not counted at all. Successful data-only or large
SSE terminal events are recognized even without a Content-Type header.

Automatic auth synchronization follows the newest routing decision and blocks
neither further quota fallback nor new turns; each backend syncs when it is idle.
Model calls use an in-memory access token until shortly before expiry, so they do
not wait for vault decryption or quota polling, which takes the lock per account. Slow account/cooldown persistence does not hold the
response stream; metadata is still serialized and flushed on normal shutdown.
