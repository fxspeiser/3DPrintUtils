import './style.css';

// ==================== Tab Navigation ====================

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'library') refreshLibrary();
    if (tab.dataset.tab === 'discover') loadSources();
  });
});

// ==================== Convert Tab ====================

const SUPPORTED_EXTS = ['.3mf','.gltf','.glb','.amf','.obj','.fbx','.stl','.ply','.dae'];
let queuedFiles = [];
let selectedFormat = '.stl';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const fileNameEl = document.getElementById('fileName');
const fileInfo = document.getElementById('fileInfo');
const fileInfoContent = document.getElementById('fileInfoContent');
const fileQueue = document.getElementById('fileQueue');
const formatGrid = document.getElementById('formatGrid');
const convertBtn = document.getElementById('convertBtn');
const statusEl = document.getElementById('status');
const simplifySlider = document.getElementById('optSimplify');
const simplifyValueEl = document.getElementById('simplifyValue');
const qualitySelect = document.getElementById('optQuality');
const qualityDesc = document.getElementById('qualityDesc');
const clearFilesBtn = document.getElementById('clearFilesBtn');

async function loadFormats() {
  try {
    const res = await fetch('/api/formats');
    const data = await res.json();
    data.output.forEach((fmt) => {
      const btn = document.createElement('div');
      btn.className = 'format-btn' + (fmt.ext === '.stl' ? ' selected recommended' : '');
      btn.dataset.ext = fmt.ext;
      btn.innerHTML = `
        <span class="ext">${fmt.ext.replace('.', '')}</span>
        <span class="label">${fmt.ext === '.stl' ? 'Most Compatible' : fmt.name}</span>`;
      btn.addEventListener('click', () => {
        selectedFormat = fmt.ext;
        document.querySelectorAll('.format-btn').forEach((b) => b.classList.toggle('selected', b.dataset.ext === fmt.ext));
      });
      formatGrid.appendChild(btn);
    });
  } catch {
    formatGrid.innerHTML = '<div style="color:var(--error)">Failed to load formats</div>';
  }
}

function isSupportedFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return SUPPORTED_EXTS.includes(ext);
}

function addFiles(fileList) {
  const newFiles = Array.from(fileList).filter(isSupportedFile);
  if (newFiles.length === 0) return;
  queuedFiles.push(...newFiles);
  updateQueue();
}

function removeFile(index) {
  queuedFiles.splice(index, 1);
  updateQueue();
}

function clearFiles() {
  queuedFiles = [];
  updateQueue();
}

function updateQueue() {
  convertBtn.disabled = queuedFiles.length === 0;
  clearFilesBtn.style.display = queuedFiles.length > 0 ? '' : 'none';
  document.getElementById('convertActions').style.display = 'none';

  if (queuedFiles.length === 0) {
    fileNameEl.textContent = '';
    dropZone.classList.remove('has-file');
    fileInfo.classList.remove('visible');
    fileQueue.innerHTML = '';
    return;
  }

  dropZone.classList.add('has-file');

  if (queuedFiles.length === 1) {
    fileNameEl.textContent = queuedFiles[0].name;
    fileQueue.innerHTML = '';
    // Show info for single file
    const formData = new FormData();
    formData.append('file', queuedFiles[0]);
    fetch('/api/info', { method: 'POST', body: formData })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (!info) return;
        fileInfoContent.innerHTML = `
          <dt>Meshes:</dt><dd>${info.meshCount}</dd>
          <dt>Vertices:</dt><dd>${info.totalVertices.toLocaleString()}</dd>
          <dt>Faces:</dt><dd>${info.totalFaces.toLocaleString()}</dd>
          <dt>Colors:</dt><dd>${info.hasColors ? 'Yes' : 'No'}</dd>
          <dt>Materials:</dt><dd>${info.hasMaterials ? 'Yes' : 'No'}</dd>`;
        fileInfo.classList.add('visible');
      })
      .catch(() => {});
  } else {
    fileNameEl.textContent = `${queuedFiles.length} files selected`;
    fileInfo.classList.remove('visible');
    renderQueue();
  }
}

function renderQueue(statuses) {
  fileQueue.innerHTML = queuedFiles.map((f, i) => {
    const st = statuses ? statuses[i] : null;
    const statusClass = st === 'ok' ? 'ok' : st === 'error' ? 'err' : st === 'active' ? 'active' : 'pending';
    const statusText = st === 'ok' ? '\u2713' : st === 'error' ? '\u2717' : st === 'active' ? '\u2026' : '';
    return `<div class="fq-item">
      <span class="fq-name">${esc(f.name)}</span>
      <span class="fq-size">${formatBytes(f.size)}</span>
      ${st ? `<span class="fq-status ${statusClass}">${statusText}</span>` : `<button class="fq-remove" data-idx="${i}">\u00d7</button>`}
    </div>`;
  }).join('');

  // Attach remove handlers (only when not converting)
  if (!statuses) {
    fileQueue.querySelectorAll('.fq-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(parseInt(btn.dataset.idx, 10));
      });
    });
  }
}

// Drop zone events
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
folderInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
clearFilesBtn.addEventListener('click', clearFiles);

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles(e.dataTransfer.files);
});

qualitySelect.addEventListener('change', () => {
  qualityDesc.textContent = qualitySelect.value === 'manufacturing'
    ? 'Recomputes normals, removes degenerate triangles, validates geometry'
    : 'Fast conversion for visual preview';
});

simplifySlider.addEventListener('input', () => {
  const val = parseInt(simplifySlider.value, 10);
  simplifyValueEl.textContent = val === 0 ? 'Off' : `Keep ${100 - val}%`;
});

function buildFormOptions(formData) {
  formData.append('outputFormat', selectedFormat);
  formData.append('quality', qualitySelect.value);
  formData.append('merge', document.getElementById('optMerge').checked);
  formData.append('stripColor', document.getElementById('optStripColor').checked);
  formData.append('binary', document.getElementById('optBinary').checked);
  const unitsFrom = document.getElementById('unitsFrom').value;
  const unitsTo = document.getElementById('unitsTo').value;
  if (unitsFrom && unitsTo) {
    formData.append('unitsFrom', unitsFrom);
    formData.append('unitsTo', unitsTo);
  }
  const simplify = parseInt(simplifySlider.value, 10);
  if (simplify > 0) formData.append('simplify', ((100 - simplify) / 100).toString());
}

convertBtn.addEventListener('click', async () => {
  if (queuedFiles.length === 0) return;
  convertBtn.disabled = true;
  statusEl.className = 'status loading';
  document.getElementById('convertActions').style.display = 'none';

  if (queuedFiles.length === 1) {
    // Single file — use the original endpoint for direct download
    statusEl.textContent = 'Converting\u2026 this may take a moment for large files.';
    const formData = new FormData();
    formData.append('file', queuedFiles[0]);
    buildFormOptions(formData);

    try {
      const res = await fetch('/api/convert', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Conversion failed' }));
        throw new Error(err.error);
      }
      const blob = await res.blob();
      const baseName = queuedFiles[0].name.replace(/\.[^.]+$/, '');
      triggerDownload(blob, baseName + selectedFormat);
      statusEl.className = 'status success';
      statusEl.textContent = `Converted! Downloaded as ${baseName}${selectedFormat}`;
      document.getElementById('convertActions').style.display = 'block';
    } catch (error) {
      statusEl.className = 'status error';
      statusEl.textContent = `Error: ${error.message}`;
    } finally {
      convertBtn.disabled = false;
    }
  } else {
    // Batch — use batch endpoint, show per-file progress
    statusEl.textContent = `Converting ${queuedFiles.length} files\u2026`;
    const statuses = queuedFiles.map(() => 'pending');
    renderQueue(statuses);

    const formData = new FormData();
    queuedFiles.forEach((f) => formData.append('files', f));
    buildFormOptions(formData);

    try {
      // Mark all as active for now (server processes sequentially)
      statuses.fill('active');
      renderQueue(statuses);

      const res = await fetch('/api/convert/batch', { method: 'POST', body: formData });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Batch conversion failed' }));
        throw new Error(err.error);
      }

      // Download the result (single file or zip)
      const blob = await res.blob();
      const contentDisp = res.headers.get('Content-Disposition') || '';
      const isZip = res.headers.get('Content-Type')?.includes('zip');
      const filename = isZip ? `converted-${Date.now()}.zip` : guessFilename(contentDisp);
      triggerDownload(blob, filename);

      statuses.fill('ok');
      renderQueue(statuses);
      statusEl.className = 'status success';
      statusEl.textContent = `All ${queuedFiles.length} files converted! Downloaded as ${filename}`;
      document.getElementById('convertActions').style.display = 'block';
    } catch (error) {
      statuses.fill('error');
      renderQueue(statuses);
      statusEl.className = 'status error';
      statusEl.textContent = `Error: ${error.message}`;
    } finally {
      convertBtn.disabled = false;
    }
  }
});

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function guessFilename(contentDisp) {
  const match = contentDisp.match(/filename="?([^";\n]+)"?/);
  return match ? match[1] : `converted${selectedFormat}`;
}

// Save source files to library
document.getElementById('saveToLibraryBtn').addEventListener('click', async () => {
  if (queuedFiles.length === 0) return;

  let saved = 0;
  for (const file of queuedFiles) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.replace(/\.[^.]+$/, ''));
    formData.append('category', 'converted');
    try {
      const res = await fetch('/api/library', { method: 'POST', body: formData });
      if (res.ok) saved++;
    } catch {}
  }

  statusEl.className = 'status success';
  statusEl.textContent = `Saved ${saved} file${saved !== 1 ? 's' : ''} to library!`;
  document.getElementById('convertActions').style.display = 'none';
});

// ==================== Library Tab ====================

let libraryDebounce = null;

async function refreshLibrary() {
  const search = document.getElementById('librarySearch').value;
  const category = document.getElementById('libraryCategory').value;
  const listEl = document.getElementById('libraryList');
  const emptyEl = document.getElementById('libraryEmpty');
  const statsEl = document.getElementById('libraryStats');

  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);

    const [filesRes, statsRes] = await Promise.all([
      fetch(`/api/library?${params}`),
      fetch('/api/library/stats'),
    ]);

    const { files } = await filesRes.json();
    const stats = await statsRes.json();

    statsEl.textContent = `${stats.totalFiles} file${stats.totalFiles !== 1 ? 's' : ''} \u00b7 ${formatBytes(stats.totalSize)}`;

    if (files.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = files.map((f) => `
      <div class="lib-card" data-id="${f.id}">
        <div class="lib-card-header">
          <span class="lib-card-name">${esc(f.name)}</span>
          <span class="lib-card-format">${f.format}</span>
        </div>
        <div class="lib-card-meta">
          ${formatBytes(f.size)} \u00b7 ${f.category} \u00b7 Added ${new Date(f.addedAt).toLocaleDateString()}
          ${f.sourceUrl ? ` \u00b7 <a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener" style="color:var(--primary)">source</a>` : ''}
        </div>
        ${f.tags.length ? `<div class="lib-card-tags">${f.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${f.description ? `<div class="lib-card-meta" style="margin-top:0.35rem">${esc(f.description)}</div>` : ''}
        ${f.conversions.length ? `
          <div class="lib-card-conversions">
            <details>
              <summary>${f.conversions.length} conversion${f.conversions.length > 1 ? 's' : ''}</summary>
              ${f.conversions.map((c) => `
                <div class="conversion-item">
                  <span>${c.format.toUpperCase()} \u00b7 ${formatBytes(c.size)} \u00b7 ${new Date(c.convertedAt).toLocaleDateString()}</span>
                  <a href="/api/library/${f.id}/conversions/${c.id}/download" class="btn-secondary" style="text-decoration:none; font-size:0.7rem">Download</a>
                </div>
              `).join('')}
            </details>
          </div>
        ` : ''}
        <div class="lib-card-actions">
          <a href="/api/library/${f.id}/download" class="btn-secondary" style="text-decoration:none">Download</a>
          <button class="btn-secondary" onclick="convertLibraryFile('${f.id}')">Convert to STL</button>
          <button class="btn-danger" onclick="deleteLibraryFile('${f.id}')">Remove</button>
        </div>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = '<div class="card" style="color:var(--error)">Failed to load library</div>';
  }
}

window.convertLibraryFile = async (id) => {
  try {
    const res = await fetch(`/api/library/${id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputFormat: '.stl', merge: true, stripColor: true, quality: 'manufacturing' }),
    });
    if (res.ok) {
      refreshLibrary();
    } else {
      const err = await res.json();
      alert(`Conversion failed: ${err.error}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
};

window.deleteLibraryFile = async (id) => {
  if (!confirm('Remove this file from your library?')) return;
  try {
    await fetch(`/api/library/${id}`, { method: 'DELETE' });
    refreshLibrary();
  } catch {
    alert('Failed to remove file');
  }
};

document.getElementById('librarySearch').addEventListener('input', () => {
  clearTimeout(libraryDebounce);
  libraryDebounce = setTimeout(refreshLibrary, 300);
});

document.getElementById('libraryCategory').addEventListener('change', refreshLibrary);

document.getElementById('libraryFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', file.name.replace(/\.[^.]+$/, ''));

  try {
    await fetch('/api/library', { method: 'POST', body: formData });
    refreshLibrary();
  } catch {
    alert('Failed to add file');
  }
  e.target.value = '';
});

// ==================== Discover Tab ====================

let sourcesLoaded = false;

async function loadSources() {
  if (sourcesLoaded) return;
  const listEl = document.getElementById('sourceList');

  try {
    const res = await fetch('/api/discover/sources');
    const { sources } = await res.json();
    renderSources(sources);
    sourcesLoaded = true;
  } catch {
    listEl.innerHTML = '<div style="color:var(--error)">Failed to load sources</div>';
  }
}

function renderSources(sources) {
  const listEl = document.getElementById('sourceList');
  listEl.innerHTML = sources.map((s) => `
    <div class="source-card">
      <div class="source-card-header">
        <span class="source-card-name">${esc(s.name)}</span>
        <span class="source-card-category">${esc(s.category)}</span>
      </div>
      <div class="source-card-desc">${esc(s.description)}</div>
      <div class="source-card-tags">
        ${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>
      <div class="source-card-actions">
        <a href="${esc(s.searchUrl)}" target="_blank" rel="noopener" class="btn-primary" style="text-decoration:none; font-size:0.8rem">Browse Files</a>
        <a href="${esc(s.url)}" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none">Visit Site</a>
      </div>
    </div>
  `).join('');
}

document.getElementById('sourceSearch').addEventListener('input', async (e) => {
  const q = e.target.value;
  try {
    const res = await fetch(`/api/discover/sources?q=${encodeURIComponent(q)}`);
    const { sources } = await res.json();
    renderSources(sources);
  } catch {}
});

// Import from URL
const importBtn = document.getElementById('importBtn');
const importUrl = document.getElementById('importUrl');
const importStatus = document.getElementById('importStatus');
const importMeta = document.getElementById('importMeta');

importUrl.addEventListener('input', () => {
  importMeta.style.display = importUrl.value.trim() ? 'block' : 'none';
});

importBtn.addEventListener('click', async () => {
  const url = importUrl.value.trim();
  if (!url) return;

  importBtn.disabled = true;
  importStatus.className = 'status loading';
  importStatus.textContent = 'Downloading and importing\u2026';

  try {
    const res = await fetch('/api/discover/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        name: document.getElementById('importName').value || '',
        tags: document.getElementById('importTags').value.split(',').map((t) => t.trim()).filter(Boolean),
        category: 'downloaded',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const entry = await res.json();
    importStatus.className = 'status success';
    importStatus.textContent = `Imported "${entry.name}" to library!`;
    importUrl.value = '';
    document.getElementById('importName').value = '';
    document.getElementById('importTags').value = '';
    importMeta.style.display = 'none';
  } catch (error) {
    importStatus.className = 'status error';
    importStatus.textContent = `Error: ${error.message}`;
  } finally {
    importBtn.disabled = false;
  }
});

// ==================== Helpers ====================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== Init ====================
loadFormats();
