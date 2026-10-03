'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { UserError } = require('./errors.cjs');
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
function run(file, args, { input, env, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: env || process.env });
    let output = '', size = 0, settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new UserError('Windows phản hồi quá lâu. Hãy thử lại.', 'TIMEOUT')); }, timeout);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 4 * 1024 * 1024) { child.kill(); finish(new UserError('Phản hồi vượt giới hạn.', 'OUTPUT_LIMIT')); } else output += chunk.toString('utf8'); });
    child.stderr.resume(); // Never retain or log subprocess diagnostics that may contain credentials.
    child.on('error', error => finish(error));
    child.on('close', code => finish(code === 0 ? null : new UserError('Không thể hoàn tất thao tác Windows.', 'WINDOWS_OPERATION'), output.trim()));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
function ps(script, options) {
  return run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], options);
}
async function protectDirectory(root) {
  if (process.platform !== 'win32') throw new UserError('Bản này yêu cầu Windows 10/11.', 'WINDOWS_REQUIRED');
  await ps("$ErrorActionPreference='Stop'; $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; foreach($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){ $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule) }; [IO.Directory]::SetAccessControl($env:PADSWITCHER_PROTECT_ROOT,$acl)",{env:{...process.env,PADSWITCHER_PROTECT_ROOT:root}});
}
async function dpapi(bytes, decrypt = false) {
  const method = decrypt ? 'Unprotect' : 'Protect';
  const output = await ps(`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $e=[Text.Encoding]::UTF8.GetBytes('PADSwitcher/v1'); try { $r=[Security.Cryptography.ProtectedData]::${method}($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($r)) } finally { [Array]::Clear($b,0,$b.Length) }`, { input: bytes.toString('base64') });
  if (!/^[A-Za-z0-9+/]+=*$/.test(output)) throw new UserError('Không thể đọc kho phiên của người dùng Windows này.', 'VAULT_ERROR');
  return Buffer.from(output, 'base64');
}
async function processes() {
  const output = await ps("$ErrorActionPreference='Stop'; $p=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath); ConvertTo-Json -InputObject $p -Compress", { timeout: 15000 });
  try { return JSON.parse(output); } catch { throw new UserError('Không kiểm tra được tiến trình đang chạy. Chưa thể chuyển tài khoản.', 'PROCESS_CHECK_FAILED'); }
}
function blockers(list, ownPids = []) {
  const own = new Set([process.pid, ...ownPids]);
  return list.filter(p => !own.has(p.ProcessId) && /^(codex(?:[-_].*)?|chatgpt|code|code-insiders|cursor|windsurf)\.exe$/i.test(p.Name));
}
async function findCodex(custom) {
  const candidates = custom ? [custom] : [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
    ...(process.env.PATH || '').split(path.delimiter).map(p => path.join(p, 'codex.exe'))
  ];
  for (const candidate of candidates) { try { if ((await fs.stat(candidate)).isFile() && path.basename(candidate).toLowerCase() === 'codex.exe') return path.resolve(candidate); } catch {} }
  throw new UserError('Chưa tìm thấy Codex CLI. Chọn codex.exe trong Cài đặt hoặc cài Codex chính thức.', 'CODEX_MISSING');
}
async function findGatewayCodex(custom) {
  if(custom)return findCodex(custom);
  // Prefer the binary shipped with the installed extension, matching its protocol version.
  const folder=path.join(require('node:os').homedir(),'.vscode','extensions');
  const entries=await fs.readdir(folder).catch(()=>[]);
  const versions=entries.filter(n=>/^openai\.chatgpt-\d+\.\d+\.\d+.*win32-x64$/.test(n)).sort((a,b)=>{
    const av=a.match(/\d+/g).map(Number),bv=b.match(/\d+/g).map(Number);
    for(let i=0;i<3;i++)if(av[i]!==bv[i])return bv[i]-av[i];return 0;
  });
  for(const name of versions){try{return await findCodex(path.join(folder,name,'bin','windows-x86_64','codex.exe'));}catch{}}
  return findCodex();
}
module.exports = { powershell, run, ps, dpapi, protectDirectory, processes, blockers, findCodex, findGatewayCodex };
