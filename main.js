const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 700,
    backgroundColor: "#1e1e1e",
    title: "MP3メタデータエディター",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    roundedCorners: true
  });

  win.loadFile('index.html');
}

if (require('electron-reload')) {
  try { require('electron-reload')(__dirname); } catch {}
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// === IPC ハンドリング ===
// ファイル・フォルダ選択
ipcMain.handle('select-files', async (_, { folder }) => {
  const result = await dialog.showOpenDialog({
    properties: folder
      ? ['openDirectory']
      : ['openFile', 'multiSelections'],
    filters: folder
      ? []
      : [{ name: '音楽ファイル', extensions: ['mp3', 'aac', 'wav', 'flac'] }]
  });
  if (result.canceled) return [];
  if (folder) {
    const folderPath = result.filePaths[0];
    const files = fs.readdirSync(folderPath)
      .filter(f => /\.(mp3|aac|wav|flac)$/i.test(f))
      .map(f => path.join(folderPath, f));
    return files;
  } else {
    return result.filePaths;
  }
});
// 対応拡張子一覧取得
ipcMain.handle('get-supported-extensions', () => ['mp3', 'aac', 'wav', 'flac']);
// メタデータ取得 (複数ファイル)
ipcMain.handle('read-metadata', async (_, files) => {
  const results = [];
  for (const f of files) {
    try {
      const metadata = await mm.parseFile(f, { native: true });
      let tags = {};
      if (f.toLowerCase().endsWith('.mp3')) {
        tags = NodeID3.read(f);
      } else {
        tags = metadata.common;
      }
      results.push({ path: f, metadata: { ...metadata, tags } });
    } catch (e) {
      results.push({ path: f, error: e.toString() });
    }
  }
  return results;
});
// メタデータ保存 (一括)
ipcMain.handle('save-metadata', async (_, { files, update }) => {
  let results = [];
  for (const f of files) {
    try {
      if (f.toLowerCase().endsWith('.mp3')) {
        NodeID3.update(update, f);
      } else {
        // mp3以外は保存できない。無視。
      }
      results.push({ path: f, success: true });
    } catch (e) {
      results.push({ path: f, error: e.toString() });
    }
  }
  return results;
});
// ジャケット画像埋め込み
ipcMain.handle('set-cover-image', async (_, { file, image }) => {
  try {
    if (!file.toLowerCase().endsWith('.mp3')) return { error: "MP3のみ対応" };
    NodeID3.update({ image: image }, file);
    return { success: true };
  } catch (e) { return { error: e.toString() }; }
});
// MP3一括変換 (AAC→MP3)
ipcMain.handle('convert-aac-to-mp3', async (_, file) => {
  if (!file.toLowerCase().endsWith('.aac')) return { error: "AACファイルのみ" };
  const dest = file.replace(/\.aac$/i, ".mp3");
  return new Promise((resolve) => {
    ffmpeg(file)
      .toFormat('mp3')
      .on('end', () => resolve({ src: file, dest, success: true }))
      .on('error', e => resolve({ error: e.toString() }))
      .save(dest);
  });
});
ipcMain.handle('read-image-binary', (_, fpath) => {
  try {
    const b = fs.readFileSync(fpath);
    return b.toString('base64');
  } catch (e) { return null; }
});