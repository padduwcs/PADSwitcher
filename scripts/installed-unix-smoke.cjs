'use strict';
// Linux: run after apt installs the deb on a disposable runner.
// macOS: mount the dmg read-only and test a copied app, as a user would install it.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const pkg=require('../package.json');
function run(file,args,options={}){
  const result=spawnSync(file,args,{encoding:'utf8',timeout:180000,...options});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`${file} failed (${result.status}): ${result.stderr||result.stdout||''}`);
  return (result.stdout||'').trim();
}
function smoke(root){run(process.execPath,[path.join(__dirname,'packaged-unix-smoke.cjs')],{env:{...process.env,PADSWITCHER_PACKAGED_DIR:root},stdio:'inherit'});}
(async()=>{
  if(process.platform==='linux'){
    const files=run('dpkg-query',['-L',pkg.name]).split('\n');
    const binary=files.find(file=>file.startsWith('/opt/')&&file.endsWith('/padswitcher-unix'));
    assert(binary,'Installed deb executable was not registered with dpkg');
    const root=path.dirname(binary),helper=path.join(root,'resources/app.asar.unpacked/src/assets/PADCodex');
    assert((await fs.stat(helper)).mode&0o111,'Installed native helper must be executable');
    const desktop=files.find(file=>file.startsWith('/usr/share/applications/')&&file.endsWith('.desktop'));
    assert(desktop,'Installed deb must provide an application-menu entry');
    assert(!/--no-sandbox\b/.test(await fs.readFile(desktop,'utf8')),'Installed launcher must preserve Chromium sandboxing');
    smoke(root);
    // The portable launcher must also preserve the sandbox. Its runtime still
    // requires a desktop permitting unprivileged user namespaces (see the guide).
    const artifact=(await fs.readdir('dist-unix')).find(file=>file.endsWith('.AppImage'));
    assert(artifact,'AppImage was not built');
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-appimage-'));
    try{
      const appimage=path.resolve('dist-unix',artifact);await fs.chmod(appimage,0o755);
      run(appimage,['--appimage-extract'],{cwd:temp});
      const appdir=path.join(temp,'squashfs-root');
      const launchers=(await fs.readdir(appdir)).filter(file=>file.endsWith('.desktop'));
      assert.equal(launchers.length,1);
      assert(!/--no-sandbox\b/.test(await fs.readFile(path.join(appdir,launchers[0]),'utf8')),'AppImage launcher must preserve Chromium sandboxing');
      await fs.access(path.join(appdir,'resources/app.asar.unpacked/src/assets/PADCodex'));
    }finally{await fs.rm(temp,{recursive:true,force:true});}
    console.log('Installed deb startup, desktop launcher and extracted AppImage layout passed.');
  }else if(process.platform==='darwin'){
    const artifact=(await fs.readdir('dist-unix')).find(file=>file.endsWith('.dmg'));
    assert(artifact,'DMG was not built');
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'padswitcher-dmg-')),mount=path.join(temp,'volume'),install=path.join(temp,'Applications');
    let mounted=false;
    try{
      await fs.mkdir(mount);await fs.mkdir(install);
      run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,path.resolve('dist-unix',artifact)]);mounted=true;
      const app=(await fs.readdir(mount,{withFileTypes:true})).find(entry=>entry.isDirectory()&&entry.name.endsWith('.app'));
      assert(app,'DMG must contain an app bundle');
      const installed=path.join(install,app.name);
      run('/usr/bin/ditto',[path.join(mount,app.name),installed]);
      run('/usr/bin/hdiutil',['detach',mount]);mounted=false;
      run('/usr/bin/codesign',['--verify','--deep','--strict',installed]);
      smoke(install);
      console.log('DMG mounted, app copied, ad-hoc signature verified and installed bundle launched.');
    }finally{
      if(mounted)run('/usr/bin/hdiutil',['detach',mount,'-force']);
      await fs.rm(temp,{recursive:true,force:true});
    }
  }else throw Error('Installer smoke runs only on Linux or macOS.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
