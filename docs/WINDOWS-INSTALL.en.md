# Install and use PADSwitcher on Windows

[Tiếng Việt](WINDOWS-INSTALL.md) · [Documentation](README.md)

## Download and open

1. Use **Windows 10/11 x64**, .NET Framework 4.8 and an Internet connection.
2. Open the [stable Windows release](https://github.com/padduwcs/PADSwitcher/releases/latest),
   expand **Assets**, and download `PADSwitcher-<version>-Windows.exe` plus its
   matching `.sha256` file. **Source code** is for development.
3. In PowerShell in the download folder, check SHA-256:

   ```powershell
   Get-FileHash .\PADSwitcher-*-Windows.exe -Algorithm SHA256
   ```

   Compare the result with the accompanying `.sha256` file.
4. Keep the `.exe` in your preferred application folder and open it directly.
   This is a portable app; Node.js and a source checkout are unnecessary.
   The executable is unsigned. Open only a file obtained from the official
   release and verified in the previous step.

## Connect Codex for the first time

1. Install the Windows Codex CLI or VS Code Codex extension.
2. Open **Services → Codex → Accounts → Add account** and sign in through the browser.
3. Select the account → **Use this account**.
4. Open **Connections** and choose your client:
   - **VS Code:** select **Set up VS Code**, save your work, then run
     **Developer: Reload Window** once from the Command Palette.
   - **CLI / VS Code terminal:** copy the command from Connections and run it
     in PowerShell. The regular `codex` command still uses its own sign-in.
   - **JetBrains:** install AI Assistant and the Codex agent, select
     **Set up JetBrains**, then select **Codex · PADSwitcher** in AI Chat.
5. Keep PADSwitcher running while using the connection. **Connected** on the
   client card confirms that the client has connected to PADSwitcher.

The [Codex guide](CODEX.md#english) covers resuming chats, separate accounts per
client, and workspace/profile settings that override the connection.
Launching local Codex desktop through PADSwitcher is currently available in
[the Unix edition](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md).

## Enable account fallback on quota exhaustion

1. Add at least **two signed-in personal Codex accounts**: Free, Plus or Pro.
2. Open **Accounts**. If using **Use for**, choose the group to configure:
   **Shared** or a client with a separate account.
3. Select **Auto-switch · Off** to open **Auto-switch when usage runs out**.
4. Enable **Switch accounts on usage limit**, select at least two backup accounts,
   and set priorities; lower numbers are tried first.
5. Select **Save setup** and confirm the button shows **Auto-switch · On**.

The Shared policy applies to clients using Shared. A client configured with a
separate account has its own policy, which must be enabled for that group.
When a model call is rejected for quota before output, PADSwitcher tries the same
request with an eligible backup while preserving context and tool results.
After output, a network error, an uncertain outcome, or exhaustion of all backups,
the app stops so you can inspect the chat and continue. Regular ChatGPT chats and
cloud/remote tasks are outside this connection. Switching does not copy ChatGPT
history between accounts.

## Kaggle

Open **Services → Kaggle → Setup**, follow the instructions for Python 3.11+
and the Kaggle tools, then **Save & check**. Add an API token, choose the account
and open its terminal. Each terminal keeps its own selection.
See the [Kaggle guide](KAGGLE.en.md) for setup and notebook submission.

## Quit, update and local data

- **X** can hide the window in the system tray. To quit fully, open the
  PADSwitcher icon menu beside the clock (possibly under hidden icons) and choose quit.
- To update, save work, quit the old app fully and replace the `.exe` with the
  new checksum-verified file. There is no automatic updater.
- Data remains under `%APPDATA%\PADSwitcher\data`; Windows DPAPI encrypts saved
  sign-ins. Never share this directory, auth files or gateway files.
- See [Support](../SUPPORT.md) for problems. Include the version, Windows/architecture
  and reproduction steps; redact account information from screenshots.

For source changes, use `main` and the [Windows development guide](DEVELOPMENT.md).
Linux/macOS use their separate Unix branch and installers.
