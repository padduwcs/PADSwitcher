# Using Kaggle with PADSwitcher

[Tiếng Việt](KAGGLE.md)

Open **Services → Kaggle** to store authorized accounts, select one independently in each terminal, and monitor remaining GPU/TPU time and notebook status.

## Start in three steps

1. **Add an account.** Create an API token under [Kaggle Settings → API](https://www.kaggle.com/settings), select **Add account**, and paste the token. If the app reports missing tools, complete **Setup** first.
2. **Select it in a terminal.** Choose an account → **Copy command** → run it in PowerShell, including a VS Code terminal. The terminal keeps that selection when you change folders.
3. **Submit and monitor.** Use the Kaggle CLI to submit a notebook, then return to PADSwitcher to refresh quota and run status. Select another account in another terminal for parallel work within Kaggle's limits.

Kaggle GPU time applies to notebooks running on Kaggle. Running `python train.py` directly still uses your local computer.

![Kaggle accounts, quota, and notebooks](images/kaggle.png)

## Common tasks

- **Short command:** enable **Setup → Set up padkaggle** once and open a new PowerShell. Use `padkaggle list`, `padkaggle use username`, `padkaggle status`, and `padkaggle off`.
- **New terminal:** choose **Open new terminal** to start PowerShell with the selected account. Its initial folder comes from account options.
- **Notebooks:** pin a recent notebook or enter its `username/notebook-slug`. Pinned and Recent scroll independently; reaching the end of Recent loads another page.
- **Layout:** drag between columns or below a notebook list. PADSwitcher remembers sizes; **Reset layout** restores automatic sizing.
- **Account maintenance:** use **Account options** to rename an account, change its working folder, replace its token, or remove it.

## Tool setup

PADSwitcher requires Python 3.11+, `kaggle >=2.2.4,<3`, and `kagglesdk >=0.1.37,<1`. It does not bundle Python or install packages silently.

Open **Setup**, copy the provided installation command, run it in PowerShell, then choose **Save & check**. You can select a specific `python.exe`, including one in a virtual environment.

Use a current Kaggle API token, not a password or legacy `kaggle.json` contents. PADSwitcher verifies the token and discovers its username before saving it.

## Submitting a notebook

In a terminal where the intended account is selected:

```powershell
kaggle kernels init -p ./job
```

Edit `job/kernel-metadata.json`: set `id` to `username/notebook-slug`, point `code_file` to your code, add data sources, and set `enable_gpu: true` when required. Then run:

```powershell
kaggle kernels push -p ./job
kaggle kernels status username/notebook-slug
kaggle kernels output username/notebook-slug -p ./results
```

The notebook owner in `id` must match the selected account. Use only accounts and resources you are authorized to access.

## Quota and notebook status

- Remaining accelerator time can include reservations; Kaggle decides actual allocation. `—` means no current data.
- PADSwitcher tracks up to 20 pins and loads 12 recent notebooks per page.
- Status reflects the latest run visible through the API and may not include every interactive web session.
- Refresh updates quota, pins, and the first recent page. Additional pages are kept in memory for the current app session.
- Optional automatic refresh runs every two minutes. Read errors retain the previous snapshot and mark it stale.
- Selecting a notebook opens Kaggle in your browser, which may require the matching web login.

## Terminals and credentials

`padkaggle use` changes only the current PowerShell process and keeps its working directory. It supports Windows PowerShell and PowerShell 7. A `-NoProfile` terminal should use the copied command instead. CMD, Git Bash, and WSL do not support in-place selection.

`padkaggle off` restores the Kaggle environment that existed before the first selection. It does not stop submitted notebooks or already-running child processes.

Tokens are encrypted at rest with Windows DPAPI. A terminal necessarily holds its selected token in process memory and environment; software running as the same Windows user can inspect it. Removing or replacing a token in PADSwitcher does not revoke copies inherited by open terminals. Close those terminals and revoke the token on Kaggle when immediate invalidation is required.

PADSwitcher manages accounts and reads status. It does not split jobs, schedule work, bypass quota, or automatically rotate Kaggle accounts.

## Implementation and verification

- Metadata is stored under `%APPDATA%\PADSwitcher\data\kaggle`; each token has a separate DPAPI vault.
- The renderer receives allowlisted metadata only. Tokens are excluded from commands, arguments, snapshots, and logs.
- The Python reader uses explicit credentials over stdin, strips inherited Kaggle/Python credential hooks, and returns a bounded JSON contract.
- Per-account reads and pagination are deduplicated, identity-checked, cancellable, and unable to mutate an account while active.
- Optional PowerShell profile setup edits only a marked PADSwitcher block and preserves supported encodings and unrelated content.

Routine Node, PowerShell, Python contract, Electron, and packaged-app checks use synthetic credentials and local fixtures. They do not make authenticated Kaggle requests or consume compute. Real token, private-notebook, quota, and submission behavior remains an explicit live acceptance check.

See [DEVELOPMENT.md](DEVELOPMENT.md) for commands and [../SECURITY.md](../SECURITY.md) for security reporting.
