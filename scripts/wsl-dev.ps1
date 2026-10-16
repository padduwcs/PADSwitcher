param(
  [ValidateSet('start','check','test','smoke','smoke:ui','dist','smoke:packaged','verify')][string]$Task='start',
  [string]$Distribution='Ubuntu'
)
$ErrorActionPreference='Stop'
$sourceRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$linuxSource=(& wsl.exe -d $Distribution --exec wslpath -a $sourceRoot.Replace('\','/')).Trim()
if($LASTEXITCODE -ne 0){throw 'Could not resolve the Unix worktree inside WSL.'}
$ErrorActionPreference='Continue' # Native stderr may contain ordinary npm warnings.
& wsl.exe -d $Distribution --exec bash "$linuxSource/scripts/wsl-dev.sh" $linuxSource $Task
exit $LASTEXITCODE
