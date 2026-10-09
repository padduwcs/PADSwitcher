# PADSwitcher companion

Vendored from miuuyy/codex-chatgpt-web, commit
`307763887a8ba61143ac12815856f4f0d92885d2` (6.1.6), MIT licensed.
The reference checkout is never modified by PADSwitcher builds.

PADSwitcher owns account selection and native routing. Each companion has its
own CODEX_HOME, core home and Electron userData; setup only edits this private
CODEX_HOME. The actual Codex home is available solely to the read-only rollout
authority resolver. Native requests never enter the Web daemon.

Local changes:
- authenticated owner control, parent heartbeat, disabled companion updater and
  autostart, dynamic initial port, account title;
- local catalog endpoint generates only Web rows from a supplied native catalog;
  native rows, budgets and feature settings are not rewritten;
- Web protocol uses native mode and cannot replay across account boundaries;
- read-only rollout resolution may use the PADSwitcher-provided native home.

The upstream browser, MCP capability checks, turn broker, tool approvals,
compaction, cancellation and runtime integrity checks are retained.
