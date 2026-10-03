'use strict';
// The terminal guardian seals its own cache even if the manager is closed first.
// Paths/identity arrive only through the child's controlled environment, never code interpolation.
const SEAL_SESSION = String.raw`
if ($env:PADSWITCHER_PRIVATE_SESSION -eq '1') {
  Add-Type -AssemblyName System.Security
  $authFile = Join-Path $env:CODEX_HOME 'auth.json'
  $vaultFile = Join-Path $env:CODEX_HOME 'session.dpapi'
  if (Test-Path -LiteralPath $authFile) {
    $bytes = [IO.File]::ReadAllBytes($authFile)
    try {
      $data = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
      function Read-PadClaims([string]$token) {
        $part = $token.Split('.')[1].Replace('-','+').Replace('_','/')
        $part = $part.PadRight($part.Length + (4 - $part.Length % 4) % 4,'=')
        return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json)
      }
      $idClaims = Read-PadClaims $data.tokens.id_token
      $accessClaims = Read-PadClaims $data.tokens.access_token
      $authClaims = $idClaims.'https://api.openai.com/auth'
      if (!$authClaims) { $authClaims = $accessClaims.'https://api.openai.com/auth' }
      $subject = $idClaims.sub
      if (!$subject) { $subject = $accessClaims.sub }
      if (!$subject) { $subject = $authClaims.chatgpt_user_id }
      $accountId = $data.tokens.account_id
      if (!$accountId) { $accountId = $authClaims.chatgpt_account_id }
      if (!$subject -or !$accountId -or !$data.tokens.refresh_token) { throw 'Invalid managed session' }
      $hasher = [Security.Cryptography.SHA256]::Create()
      try { $identity = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes("$subject$([char]0)$accountId"))).Replace('-','').ToLowerInvariant() } finally { $hasher.Dispose() }
      if ($identity -ne $env:PADSWITCHER_SESSION_IDENTITY) { throw 'Managed session identity changed' }
      $entropy = [Text.Encoding]::UTF8.GetBytes('PADSwitcher/v1')
      $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      $tempFile = Join-Path $env:CODEX_HOME ('.pad-'+[Guid]::NewGuid().ToString()+'.tmp')
      try {
        $stream = [IO.File]::Open($tempFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $stream.Write($encrypted,0,$encrypted.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        if (Test-Path -LiteralPath $vaultFile) { [IO.File]::Replace($tempFile,$vaultFile,$null) } else { [IO.File]::Move($tempFile,$vaultFile) }
        [IO.File]::Delete($authFile)
      } finally { if (Test-Path -LiteralPath $tempFile) { [IO.File]::Delete($tempFile) }; [Array]::Clear($encrypted,0,$encrypted.Length) }
    } finally { [Array]::Clear($bytes,0,$bytes.Length) }
  }
}
`;
module.exports = {SEAL_SESSION};
