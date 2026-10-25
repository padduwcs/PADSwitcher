'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {desktopEnvironment}=require('../scripts/desktop-env.cjs');

test('external Electron restores host GTK and XDG paths inherited from VS Code Snap',()=>{
  const input={SNAP_NAME:'code',SNAP:'/snap/code/273',SNAP_USER_COMMON:'/home/fixture/snap/code/common',SNAP_USER_DATA:'/home/fixture/snap/code/273',GTK_PATH:'/snap/code/273/usr/lib/gtk',GIO_MODULE_DIR:'/home/fixture/snap/code/common/gio',GSETTINGS_SCHEMA_DIR:'/home/fixture/snap/code/273/schemas',XDG_DATA_DIRS:'/snap/code/273/usr/share:/usr/share',XDG_DATA_DIRS_VSCODE_SNAP_ORIG:'/usr/local/share:/usr/share',XDG_RUNTIME_DIR:'/run/user/1000',WAYLAND_DISPLAY:'wayland-0',PATH:'/fixture/bin',CUSTOM:'keep'};
  const result=desktopEnvironment(input,'linux');
  for(const key of ['GTK_PATH','GIO_MODULE_DIR','GSETTINGS_SCHEMA_DIR'])assert.equal(result[key],undefined);
  assert.equal(result.XDG_DATA_DIRS,'/usr/local/share:/usr/share');assert.equal(result.XDG_RUNTIME_DIR,input.XDG_RUNTIME_DIR);assert.equal(result.WAYLAND_DISPLAY,'wayland-0');assert.equal(result.CUSTOM,'keep');assert.equal(result.PATH,input.PATH);
  assert.equal(input.GTK_PATH,'/snap/code/273/usr/lib/gtk','the parent environment is unchanged');
});
test('normal desktops, other Snaps and Windows keep their environment',()=>{
  for(const [platform,SNAP_NAME] of [['linux','other-app'],['linux',''],['darwin','code'],['win32','code']]){
    const input={SNAP_NAME,SNAP:'/snap/code/273',GTK_PATH:'/snap/code/273/gtk',XDG_DATA_DIRS:'custom',XDG_DATA_DIRS_VSCODE_SNAP_ORIG:'original'};
    assert.deepEqual(desktopEnvironment(input,platform),input);
  }
});
test('VS Code Snap cleanup preserves unrelated custom desktop paths',()=>{
  const input={SNAP_NAME:'code-insiders',SNAP:'/snap/code-insiders/1',GSETTINGS_SCHEMA_DIR:'/opt/custom/schemas',GTK_PATH:'/opt/custom/gtk',XDG_DATA_DIRS:'/usr/share'};
  assert.deepEqual(desktopEnvironment(input,'linux'),input);
});
