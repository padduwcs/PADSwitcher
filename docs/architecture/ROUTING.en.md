# Unix Codex routing

[Tiếng Việt](ROUTING.md) · [User setup](../UNIX-INSTALL.en.md) · [Validation](../UNIX-VALIDATION.md)

## Connections and accounts

`GatewayHub` exposes a stable helper endpoint for VS Code, CLI and JetBrains.
Shared connections use one router; separate-account routes have their own native
backend/router and fallback policy. Local desktop Codex has a separate backend
to preserve existing conversation storage, sharing the Shared router/policy.

Native Codex retains threads, tools, sandboxing and approvals. Authentication
is supplied in memory, preserving original desktop configuration and auth files.
Existing sockets stay with their backend. Changing connection mode needs one
client restart; account selection within the same mode retains the connection.

## Model requests

1. The built-in OpenAI backend's `openai_base_url` points to a private loopback
   relay. A model WebSocket receives HTTP 426 for full-input HTTP Responses.
2. Bearer and account ID come from one credential bundle. The relay forwards
   identical body bytes and allowed cache/session headers to a fixed upstream.
3. A structured HTTP 429 `usage_limit_reached` or early SSE quota error can try
   the next personal backup account, at most once per account for that call.
   There is no extra continuation message or second `turn/start`.
4. Once text/tool output reaches the client, that response cannot switch
   accounts. Completed tools are not repeated to perform account fallback.
5. Sticky-routing tokens stay account-specific in bounded process memory;
   account A's token is never sent to B.
6. Native authentication follows the selected router account after suitable
   active work ends. Automatic synchronization is distinct from a manual choice;
   a slow login cannot roll back a newer router selection.

## Failures and progress

An uncertain network/model failure or incomplete stream stops native automatic
repetition of that model step. Its hashed key includes route, thread/turn and
user-input/tool-result progress. New steering input or a completed tool result
can continue within the same turn. Partial assistant recovery alone does not
reopen a failed step. Compact/lite routes have independent keys.

Terminal SSE events establish success, including missing Content-Type and large
data-only completion frames. Missing separators or malformed JSON are not guessed
to be successful. Diagnostics retain numeric counters, model/effort and usage;
frame content is not persisted to PAD metadata or diagnostics.

## Boundaries

- Confirmed personal Free/Plus/Pro accounts only. Managed/unknown plans do not
  rotate. The relay never changes models or infers access from a model catalog.
- Account-specific `previous_response_id`, `conversation` or item references
  prevent cross-account replay.
- Generic 429, 403, 5xx, network failures or text mentioning quota do not rotate.
- Loopback-only capability protection, Host/bearer checks and Origin rejection;
  a fixed HTTPS upstream with no arbitrary URL proxy or token-bearing redirects.
- At most 16 requests, 64 MiB body/decoded body and 1 MiB upstream error body.
  The five-minute timeout measures inactivity, not healthy generation duration.
  Backup-account selection has a two-minute per-call deadline.
- Disabling fallback or manually selecting an account prevents new fallback.
  Stop/disconnect aborts active requests. In-use accounts cannot be removed/reauthenticated.
- No automatic reset-credit consumption. PAD diagnostics exclude prompts,
  responses, tokens and capability URLs. Native Codex keeps its own history.

## Verification

| Command | Coverage |
| --- | --- |
| `npm test` | Exact fallback bytes, framing, authentication, permissions, faults and sync ordering |
| `npm run smoke:protocol` | Native tools/cache/sticky state and same-turn A/B switching |
| `npm run smoke:faults` | One upstream attempt per synthetic fault; later turns remain usable |
| `npm run smoke:continuity` | Desktop/extension, 12 switches, steering and unique file writes |
| `npm run smoke:desktop` | Current MCP pipe, preserved original auth, same chat and restart/resume |

The checks use synthetic sign-ins and a loopback model server. Optional actual
Linux ChatGPT GUI verification is described in [UNIX.md](../UNIX.md).
See [validation](../UNIX-VALIDATION.md) for release-specific results and limits.
