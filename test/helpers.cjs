'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { ProfileService } = require('../src/core/service.cjs');
const { parseAuth } = require('../src/core/auth.cjs');
const artifactRoot = path.resolve(__dirname,'../artifacts/tests');
function jwt(payload) { return Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.fixture-signature'; }
function auth(name = 'a', revision = '1') {
  return Buffer.from(JSON.stringify({ auth_mode:'chatgpt',OPENAI_API_KEY:null,tokens:{id_token:jwt({sub:'fixture-user-'+name,email:`${name}@example.test`,'https://api.openai.com/auth':{chatgpt_account_id:'fixture-account-'+name,chatgpt_plan_type:'plus'}}),access_token:jwt({sub:'fixture-user-'+name}),refresh_token:`fixture-only-${name}-${revision}`,account_id:'fixture-account-'+name},last_refresh:'2026-01-01T00:00:00Z' }));
}
async function fixture(t) {
  await fs.mkdir(artifactRoot,{recursive:true}); const directory = await fs.mkdtemp(path.join(artifactRoot,'test-'));
  const desktop = path.join(directory,'desktop'), data = path.join(directory,'data'); await fs.mkdir(desktop);
  await fs.writeFile(path.join(desktop,'config.toml'),'model = "fixture-model"\n');
  await fs.writeFile(path.join(desktop,'history.jsonl'),'KEEP HISTORY\n');
  const key = crypto.randomBytes(32);
  const adapter = {
    protectDirectory:async () => {}, processes:async () => [], findCodex:async () => 'fixture-codex.exe', findGatewayCodex:async () => 'fixture-codex.exe', run:async () => 'codex-cli 0.159.2',
    dpapi:async (bytes,decrypt) => {
      if (decrypt) { const decipher = crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12)); decipher.setAuthTag(bytes.subarray(12,28)); return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]); }
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',key,iv); const encrypted = Buffer.concat([cipher.update(bytes),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
    },
    rpcFactory:(_exe,home) => ({
      listeners:new Set(),closed:false,initialize:async () => {},
      request:async method => {
        const identity = parseAuth(await fs.readFile(path.join(home,'auth.json')));
        if (method === 'account/read') return {account:{type:'chatgpt',email:identity.email,planType:'plus'}};
        if (method === 'account/rateLimits/read') return {rateLimits:{primary:{usedPercent:25,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600},secondary:{usedPercent:90,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+86400}}};
        throw Error('Unexpected fixture method');
      },close:async function() { this.closed = true; }
    })
  };
  const create = async () => { const service = new ProfileService(data,adapter); await service.init(); service.state.settings.desktopHome = desktop; service.state.settings.workspace = directory; await service.save(); return service; };
  const service = await create();
  t.after(async () => { const resolved = path.resolve(directory); if (path.dirname(resolved) !== artifactRoot || !path.basename(resolved).startsWith('test-')) throw Error('Unsafe test cleanup'); await fs.rm(resolved,{recursive:true,force:true}); });
  return {directory,desktop,data,service,adapter,create};
}
module.exports = {auth,jwt,fixture};
