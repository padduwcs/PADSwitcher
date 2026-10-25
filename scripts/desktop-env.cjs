'use strict';

// VS Code's Snap exports its private GTK modules and old GNOME schemas to
// integrated terminals. External Electron apps need the host desktop libraries.
function desktopEnvironment(input=process.env,platform=process.platform) {
  const env={...input};
  if(platform!=='linux'||!/^code(?:-insiders)?$/.test(env.SNAP_NAME||''))return env;
  const roots=[env.SNAP,env.SNAP_USER_DATA,env.SNAP_USER_COMMON].filter(value=>typeof value==='string'&&value.startsWith('/'));
  for(const key of ['GTK_PATH','GIO_MODULE_DIR','GSETTINGS_SCHEMA_DIR','GTK_EXE_PREFIX','GTK_IM_MODULE_FILE','GDK_PIXBUF_MODULE_FILE','GDK_PIXBUF_MODULEDIR']) {
    if(typeof env[key]==='string'&&env[key].split(':').some(value=>roots.some(root=>value===root||value.startsWith(root+'/'))))delete env[key];
  }
  for(const key of ['XDG_DATA_DIRS','XDG_CONFIG_DIRS']) {
    const original=env[key+'_VSCODE_SNAP_ORIG'];
    if(original)env[key]=original;
  }
  return env;
}
module.exports={desktopEnvironment};
