'use strict';
// A live Windows integration check with an empty, isolated Codex home. No account login or inference.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const windows = require('../src/core/windows.cjs');
const { CodexRpc } = require('../src/core/rpc.cjs');
const { SEAL_SESSION } = require('../src/core/guardian.cjs');
const { auth } = require('../test/helpers.cjs');
const { parseAuth } = require('../src/core/auth.cjs');
const base = path.resolve(__dirname,'../artifacts/smoke');
(async () => {
  await fs.mkdir(base,{recursive:true}); const home = await fs.mkdtemp(path.join(base,'run-')); let rpc;
  try {
    await windows.protectDirectory(home);
    // Existing explicit grants must also be removed, without requiring audit privileges.
    await windows.run(path.join(process.env.SystemRoot,'System32','icacls.exe'),[home,'/grant','*S-1-1-0:(OI)(CI)R']);
    await windows.protectDirectory(home);
    const acl=await windows.ps("$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $acl=[IO.Directory]::GetAccessControl($env:PADSWITCHER_PROTECT_ROOT); $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])); if(!$acl.AreAccessRulesProtected -or $rules.Count -ne 2 -or @($rules|Where-Object {$_.IdentityReference.Value -notin @($sid,'S-1-5-18')}).Count){exit 1}; [Console]::Write('private')",{env:{...process.env,PADSWITCHER_PROTECT_ROOT:home}});
    assert.equal(acl,'private');
    const original = Buffer.from('PADSwitcher DPAPI fixture — not a credential'); const encrypted = await windows.dpapi(original); const decrypted = await windows.dpapi(encrypted,true);
    assert.deepEqual(decrypted,original); assert.ok(!encrypted.includes(original)); decrypted.fill(0); console.log('Windows DPAPI and private directory ACL: passed.');
    const exe = await windows.findCodex(); rpc = new CodexRpc(exe,home,{fileStore:true}); await rpc.initialize();
    const result = await rpc.request('account/read',{refreshToken:false}); assert.equal(result.account,null);
    console.log('Installed Codex app-server handshake and account/read with isolated home: passed.');
    const list = await windows.processes(); assert.ok(Array.isArray(list)); console.log('Windows process inspection: passed.');
    await rpc.close(); rpc=null;
    const fixture=auth('smoke'); await fs.writeFile(path.join(home,'auth.json'),fixture);
    await windows.ps("$ErrorActionPreference='Stop';"+SEAL_SESSION,{env:{...process.env,CODEX_HOME:home,PADSWITCHER_PRIVATE_SESSION:'1',PADSWITCHER_SESSION_IDENTITY:parseAuth(fixture).identity}});
    assert.deepEqual(await windows.dpapi(await fs.readFile(path.join(home,'session.dpapi')),true),fixture);
    await assert.rejects(fs.access(path.join(home,'auth.json')));
    console.log('Independent terminal guardian encrypts and removes its temporary login: passed.');
  } finally {
    await rpc?.close(); const resolved = path.resolve(home); if (path.dirname(resolved) !== base || !path.basename(resolved).startsWith('run-')) throw Error('Unsafe smoke cleanup');
    await fs.rm(resolved,{recursive:true,force:true});
  }
})().catch(() => { console.error('Live smoke check failed. No current-account files were changed.'); process.exitCode = 1; });
