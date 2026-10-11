# Loaded by a PowerShell profile or dot-sourced in an existing terminal.
# No account is selected during loading, and no user-level environment is changed.
$global:PADKaggleHome = Split-Path -Parent $PSScriptRoot
if (-not (Get-Variable PADKaggleSession -Scope Global -ErrorAction SilentlyContinue)) { $global:PADKaggleSession = $null }

function global:padkaggle {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)][ValidateSet('help','list','use','status','off')][string]$Command = 'help',
        [Parameter(Position=1)][string]$Account
    )

    function Stop-PADKaggle([string]$Message) { throw ('PADKAGGLE: ' + $Message) }
    function Get-PADKaggleVariables {
        $values = @{}
        foreach ($item in [Environment]::GetEnvironmentVariables('Process').GetEnumerator()) {
            if ($item.Key -like 'KAGGLE_*') { $values[$item.Key] = $item.Value }
        }
        return $values
    }
    function Set-PADKaggleVariables($Values) {
        foreach ($key in (Get-PADKaggleVariables).Keys) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
        foreach ($key in $Values.Keys) { [Environment]::SetEnvironmentVariable($key, $Values[$key], 'Process') }
    }
    function Get-PADKagglePath($Added) {
        $items = New-Object 'Collections.Generic.List[string]'
        foreach ($directory in ($env:PATH -split ';')) { $items.Add($directory) }
        foreach ($directory in $Added) {
            for ($index = 0; $index -lt $items.Count; $index++) {
                if ($items[$index] -eq $directory) { $items.RemoveAt($index); break }
            }
        }
        return $items.ToArray()
    }
    function Read-PADKaggleFile([string]$Path, [int]$Limit) {
        $file = Get-Item -LiteralPath $Path -ErrorAction Stop
        if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -gt $Limit) {
            Stop-PADKaggle 'Invalid saved account file. Open Kaggle in PADSwitcher to repair it.'
        }
        return ,([IO.File]::ReadAllBytes($Path))
    }
    function Get-PADKaggleTools($Settings) {
        $candidates = if ($Settings.pythonPath) { @($Settings.pythonPath) } else { @('python.exe','python3.exe') }
        foreach ($python in $candidates) {
            $process = New-Object Diagnostics.Process
            try {
                $start = New-Object Diagnostics.ProcessStartInfo
                $start.FileName = $python
                $start.Arguments = '-E -P "' + (Join-Path $global:PADKaggleHome 'terminal\kaggle-reader.py') + '"'
                $start.UseShellExecute = $false
                $start.CreateNoWindow = $true
                $start.RedirectStandardInput = $true
                $start.RedirectStandardOutput = $true
                $start.RedirectStandardError = $true
                $start.StandardOutputEncoding = [Text.Encoding]::UTF8
                foreach ($key in @($start.EnvironmentVariables.Keys)) {
                    if ($key -match '^(KAGGLE_|PADSWITCHER_KAGGLE_|PYTHON(PATH|STARTUP|HOME)$)') { $start.EnvironmentVariables.Remove($key) }
                }
                $process.StartInfo = $start
                if (-not $process.Start()) { continue }
                $output = $process.StandardOutput.ReadToEndAsync()
                $errors = $process.StandardError.ReadToEndAsync()
                $process.StandardInput.Write('{"action":"probe"}')
                $process.StandardInput.Close()
                if (-not $process.WaitForExit(15000)) { $process.Kill(); continue }
                if ($process.ExitCode -ne 0 -or -not $output.Wait(2000)) { continue }
                $info = $output.Result | ConvertFrom-Json -ErrorAction Stop
                if ($info.ok -and $info.supported -and [IO.Path]::IsPathRooted($info.executable) -and [IO.Path]::IsPathRooted($info.scriptsPath) -and
                    (Test-Path -LiteralPath (Join-Path $info.scriptsPath 'kaggle.exe') -PathType Leaf)) { return $info }
            } catch { } finally { $process.Dispose() }
        }
        Stop-PADKaggle 'Kaggle tools are not ready. Open Kaggle > Setup in PADSwitcher.'
    }

    $plainBytes = $null
    $encryptedBytes = $null
    $token = $null
    try {
        if ($Command -eq 'help') {
            Write-Output 'padkaggle list                 List saved accounts'
            Write-Output 'padkaggle use <username/name>  Select an account in this terminal'
            Write-Output 'padkaggle status               Show this terminal selection'
            Write-Output 'padkaggle off                  Restore the previous Kaggle environment'
            return
        }
        if ($Command -eq 'status') {
            if ($global:PADKaggleSession) { Write-Output ('Kaggle account: @' + $global:PADKaggleSession.Username) }
            else { Write-Output 'No account selected by PADSwitcher in this terminal.' }
            return
        }
        if ($Command -eq 'off') {
            if ($global:PADKaggleSession) {
                Set-PADKaggleVariables $global:PADKaggleSession.Previous
                $env:PATH = (Get-PADKagglePath $global:PADKaggleSession.Added) -join ';'
                $global:PADKaggleSession = $null
            }
            Write-Output 'PADSwitcher account selection cleared in this terminal.'
            return
        }

        $config = [Text.Encoding]::UTF8.GetString((Read-PADKaggleFile (Join-Path $global:PADKaggleHome 'accounts.json') 1048576)) | ConvertFrom-Json -ErrorAction Stop
        if ($config.version -ne 1 -or $null -eq $config.accounts -or $config.accounts -isnot [Array] -or $config.accounts.Count -gt 100 -or
            $null -eq $config.settings -or $config.settings.pythonPath -isnot [string]) { Stop-PADKaggle 'Invalid Kaggle account store. Open PADSwitcher to repair it.' }
        $ids = @{}
        $users = @{}
        foreach ($item in $config.accounts) {
            if ($item.id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or
                $item.username -notmatch '^\w[\w-]{0,79}$' -or $item.label -isnot [string] -or $ids.ContainsKey($item.id) -or $users.ContainsKey($item.username)) {
                Stop-PADKaggle 'Invalid Kaggle account store. Open PADSwitcher to repair it.'
            }
            $ids[$item.id] = $true
            $users[$item.username] = $true
        }
        if ($Command -eq 'list') {
            foreach ($item in $config.accounts) {
                [pscustomobject]@{ Username = $item.username; Name = ($item.label -replace '[\x00-\x1f\x7f]', ' '); Selected = ($global:PADKaggleSession -and $global:PADKaggleSession.Username -eq $item.username) }
            }
            if ($config.accounts.Count -eq 0) { Write-Output 'No saved accounts. Add an account in PADSwitcher > Kaggle.' }
            return
        }
        if ([string]::IsNullOrWhiteSpace($Account)) { Stop-PADKaggle 'Use: padkaggle use <username>. Run padkaggle list to see accounts.' }
        $selector = $Account.Trim().TrimStart('@')
        $matches = @($config.accounts | Where-Object { $_.username -eq $selector })
        if ($matches.Count -eq 0) { $matches = @($config.accounts | Where-Object { $_.label -eq $Account.Trim() }) }
        if ($matches.Count -ne 1) { Stop-PADKaggle 'Account not found or name is ambiguous. Use the username shown by padkaggle list.' }
        $selected = $matches[0]
        $tools = Get-PADKaggleTools $config.settings
        $folder = Join-Path $global:PADKaggleHome $selected.id
        foreach ($directory in @($folder, (Join-Path $folder 'cli'))) {
            $item = Get-Item -LiteralPath $directory -ErrorAction Stop
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Stop-PADKaggle 'Invalid saved account directory.' }
        }
        Add-Type -AssemblyName System.Security
        $encryptedBytes = Read-PADKaggleFile (Join-Path $folder 'token.dpapi') 32768
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($encryptedBytes, [Text.Encoding]::UTF8.GetBytes('PADSwitcher/v1'), [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $token = [Text.Encoding]::UTF8.GetString($plainBytes)
        if ($token -notmatch '^[A-Za-z0-9_.-]{16,8192}$') { Stop-PADKaggle 'Invalid saved token. Update the token in PADSwitcher.' }

        # Validate everything before touching the caller's process environment.
        $before = Get-PADKaggleVariables
        $beforePath = $env:PATH
        $previous = if ($global:PADKaggleSession) { $global:PADKaggleSession.Previous } else { $before }
        $pathItems = @(Get-PADKagglePath $(if ($global:PADKaggleSession) { $global:PADKaggleSession.Added } else { @() }))
        $added = @()
        foreach ($directory in @($tools.scriptsPath, (Split-Path -Parent $tools.executable))) {
            if ($directory -notin $added) { $added += $directory }
        }
        try {
            Set-PADKaggleVariables @{ KAGGLE_API_TOKEN = $token; KAGGLE_USERNAME = $selected.username; KAGGLE_KEY = 'PADSwitcher-token-only-no-legacy-key'; KAGGLE_CONFIG_DIR = (Join-Path $folder 'cli') }
            $env:PATH = (@($added) + @($pathItems)) -join ';'
            $global:PADKaggleSession = @{ Username = $selected.username; Previous = $previous; Added = $added }
        } catch {
            Set-PADKaggleVariables $before
            $env:PATH = $beforePath
            throw
        }
        Write-Output ('Kaggle account: @' + $selected.username + ' (this terminal only)')
    } catch {
        $message = if ($_.Exception.Message.StartsWith('PADKAGGLE: ')) { $_.Exception.Message.Substring(11) } else { 'Unable to select the saved account. Check Kaggle setup and token in PADSwitcher.' }
        Write-Error -Message ('PADSwitcher: ' + $message) -ErrorId 'PADKAGGLE' -Category InvalidOperation
    } finally {
        if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
        if ($encryptedBytes) { [Array]::Clear($encryptedBytes, 0, $encryptedBytes.Length) }
        $token = $null
    }
}
