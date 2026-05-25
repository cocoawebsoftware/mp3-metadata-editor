// UIレンダリング/イベント/状態管理
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let fileList = [];
let metadataList = [];
let selectedIndex = 0;
let searchKeyword = "";

document.addEventListener('DOMContentLoaded', async () => {
  initDragDrop();
  bindUI();
  renderFileList();
  $("#search-box").addEventListener('input', onSearch);
  $("#btn-folder").onclick = () => openFolder();
  $("#btn-files").onclick = () => openFiles();
  $("#btn-save-all").onclick = () => saveAll();
  $("#btn-replace-title").onclick = () => replaceAllTitles();
  $("#btn-convert-aac").onclick = () => convertAacFiles();
  $("#cover-input").onchange = uploadCover;
  $("#file-list").onclick = onFileSelect;
  $("#btn-play").onclick = playAudio;
  $("#btn-save-one").onclick = saveCurrentMetadata;
  $("#log-clear").onclick = () => $("#log").innerHTML = '';
  resizeLayout();
  window.onresize = resizeLayout;
});

function bindUI() {
  $$('.edit-field').forEach(e =>
    e.addEventListener('input', () => $("#btn-save-one").disabled = false)
  );
}

function resizeLayout() {}

function log(msg, error) {
  const box = $("#log");
  const div = document.createElement('div');
  div.textContent = msg;
  if (error) div.style.color = 'red';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function openFolder() {
  const files = await window.electronAPI.selectFiles({ folder: true });
  if (files.length) await loadFiles(files);
}

async function openFiles() {
  const files = await window.electronAPI.selectFiles({ folder: false });
  if (files.length) await loadFiles(files);
}

async function loadFiles(files) {
  $("#progress").textContent = "メタデータ取得中…";
  fileList = files;
  const result = await window.electronAPI.readMetadata(files);
  metadataList = result;
  $("#progress").textContent = '';
  selectedIndex = 0;
  renderFileList();
  renderMetadata();
}

function renderFileList() {
  const box = $("#file-list");
  let html = "";
  metadataList.forEach((item, i) => {
    const name = (item.path || "").split(/[\\\/]/).pop() || "不明";
    if (!searchKeyword || name.includes(searchKeyword)) {
      html += `<div class="file-row${i === selectedIndex ? ' selected' : ''}" data-idx="${i}">${name}</div>`;
    }
  });
  box.innerHTML = html;
}

function onFileSelect(ev) {
  if (ev.target.classList.contains("file-row")) {
    selectedIndex = parseInt(ev.target.dataset.idx);
    renderFileList();
    renderMetadata();
  }
}

function onSearch(ev) {
  searchKeyword = ev.target.value.trim();
  renderFileList();
}

function renderMetadata() {
  const meta = metadataList[selectedIndex] || {};
  const tags = meta.metadata?.tags || meta.metadata?.common || {};
  $("#meta-title").value = tags.title || "";
  $("#meta-artist").value = tags.artist || "";
  $("#meta-album").value = tags.album || "";
  $("#meta-genre").value = (tags.genre ? (Array.isArray(tags.genre) ? tags.genre.join(', ') : tags.genre) : "");
  $("#meta-year").value = tags.year || tags.date || "";
  $("#meta-comment").value = tags.comment || "";
  $("#meta-track").value = tags.trackNumber ? (typeof tags.trackNumber === 'object' ? tags.trackNumber.no : tags.trackNumber) : (tags.track || "");
  const img = tags.image || tags.picture;
  if (img && img.imageBuffer) {
    $("#cover-image").src = `data:image/jpeg;base64,${arrayBufferToBase64(img.imageBuffer)}`;
  } else if (img && img.data) {
    $("#cover-image").src = `data:image/jpeg;base64,${arrayBufferToBase64(img.data)}`;
  } else {
    $("#cover-image").src = "./noimage.png";
  }
  $("#current-file-path").textContent = meta.path || "";
  $("#btn-save-one").disabled = true;
}

function arrayBufferToBase64(buffer) {
  if (buffer instanceof ArrayBuffer) buffer = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

async function saveCurrentMetadata() {
  const update = collectEditFields();
  const file = fileList[selectedIndex];
  const res = await window.electronAPI.saveMetadata([file], update);
  if (res[0].error) log("保存失敗: " + res[0].error, true);
  else log("保存成功: " + file);
  reloadCurrentMetadata();
}

function collectEditFields() {
  return {
    title: $("#meta-title").value,
    artist: $("#meta-artist").value,
    album: $("#meta-album").value,
    genre: $("#meta-genre").value,
    year: $("#meta-year").value,
    comment: $("#meta-comment").value,
    trackNumber: $("#meta-track").value,
  };
}

async function reloadCurrentMetadata() {
  const f = fileList[selectedIndex];
  const [data] = await window.electronAPI.readMetadata([f]);
  metadataList[selectedIndex] = data;
  renderMetadata();
}

async function uploadCover(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const fileReader = new FileReader();
  fileReader.onload = async () => {
    const arr = fileReader.result;
    const imgBase64 = arrayBufferToBase64(arr);
    const res = await window.electronAPI.setCoverImage(fileList[selectedIndex], arr);
    if (res.error) log("ジャケットエラー: " + res.error, true);
    else log("ジャケット画像を埋め込みました");
    reloadCurrentMetadata();
  };
  fileReader.readAsArrayBuffer(file);
}

async function saveAll() {
  const update = collectEditFields();
  const res = await window.electronAPI.saveMetadata(fileList, update);
  res.forEach(r => {
    if (r.error) log(`保存失敗: ${r.path}, ${r.error}`, true);
    else log(`保存成功: ${r.path}`);
  });
  reloadCurrentMetadata();
}

async function replaceAllTitles() {
  const base = window.prompt("一括置換：新しいタイトル名のベース文字列を入力", "");
  if (!base) return;
  for (let i = 0; i < fileList.length; i++) {
    $("#meta-title").value = base + " " + (i + 1);
    selectedIndex = i;
    await saveCurrentMetadata();
  }
  log("タイトル一括置換完了");
}

function playAudio() {
  const file = fileList[selectedIndex];
  if (!file) return;
  const audio = $("#player");
  audio.src = file;
  audio.play();
}

async function convertAacFiles() {
  let converted = 0;
  for (const file of fileList) {
    if (file.toLowerCase().endsWith('.aac')) {
      $("#progress").textContent = "変換中 " + file;
      const res = await window.electronAPI.convertAacToMp3(file);
      if (res?.success) {
        log(`変換成功: ${file} → ${res.dest}`);
        converted++;
      } else {
        log(`変換失敗: ${file} (${res?.error})`, true);
      }
    }
  }
  $("#progress").textContent = '';
  log(`AAC→MP3変換: ${converted}件完了`);
}

function initDragDrop() {
  const target = $("#file-list");
  target.ondragover = (e) => { e.preventDefault(); target.classList.add('dragover'); }
  target.ondragleave = (e) => { target.classList.remove('dragover'); }
  target.ondrop = async (e) => {
    e.preventDefault();
    target.classList.remove('dragover');
    let files = [...e.dataTransfer.files]
      .filter(f => /\.(mp3|aac|wav|flac)$/i.test(f.path))
      .map(f => f.path);
    if (files.length) await loadFiles(files);
  };
}

window.onerror = (message, src, lineno, colno, error) => {
  log(`${message} (${src}:${lineno}:${colno})`, true);
};