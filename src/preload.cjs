'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pad', {
  action: (command,args) => ipcRenderer.invoke('pad:action',command,args),
  onState: callback => { const listener = (_event,value) => callback(value); ipcRenderer.on('pad:state',listener); return () => ipcRenderer.removeListener('pad:state',listener); },
  onDevice: callback => { const listener = (_event,value) => callback(value); ipcRenderer.on('pad:device',listener); return () => ipcRenderer.removeListener('pad:device',listener); },
  onRefreshError: callback => { const listener = (_event,value) => callback(value); ipcRenderer.on('pad:refresh-error',listener); return () => ipcRenderer.removeListener('pad:refresh-error',listener); }
});
