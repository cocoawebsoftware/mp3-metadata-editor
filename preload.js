const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: (opts) => ipcRenderer.invoke('select-files', opts),
  readMetadata: (files) => ipcRenderer.invoke('read-metadata', files),
  saveMetadata: (files, update) => ipcRenderer.invoke('save-metadata', { files, update }),
  setCoverImage: (file, image) => ipcRenderer.invoke('set-cover-image', { file, image }),
  convertAacToMp3: (file) => ipcRenderer.invoke('convert-aac-to-mp3', file),
  readImageBinary: (fpath) => ipcRenderer.invoke('read-image-binary', fpath),
  getSupportedExtensions: () => ipcRenderer.invoke('get-supported-extensions'),
});