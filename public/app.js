let currentDir = '';
let currentItems = { folders: [], files: [] };
let currentPage = 1;

// View Settings States (with localStorage persistence)
let ITEMS_PER_PAGE = parseInt(localStorage.getItem('ITEMS_PER_PAGE')) || 24;
let currentFilter = 'all';
let favorites = [];
let isRecursive = localStorage.getItem('isRecursive') === 'true';
let maxDepth = localStorage.getItem('maxDepth') || 'inf';
let thumbSize = parseInt(localStorage.getItem('thumbSize')) || 200;
let canvasBg = localStorage.getItem('canvasBg') || '#000';
let openAllMaxImages = parseInt(localStorage.getItem('openAllMaxImages')) || 100;
let openAllMaxSizeMB = parseInt(localStorage.getItem('openAllMaxSizeMB')) || 10;
let viewerLayout = localStorage.getItem('viewerLayout') || 'flex-wrap';
const selectedPaths = new Set();

// DOM Elements
const elGrid = document.getElementById('grid');
const elGridView = document.getElementById('grid-view');
const elTextView = document.getElementById('text-view');
const elImageView = document.getElementById('image-view');
const elBreadcrumb = document.getElementById('breadcrumb');
const elPrev = document.getElementById('prev-page');
const elNext = document.getElementById('next-page');
const elPageInfo = document.getElementById('page-info');
const elFavList = document.getElementById('favorites-list');
const elFolderTree = document.getElementById('folder-tree');
const elSidebar = document.getElementById('sidebar');

// Sync UI inputs to cached state on load
const syncInitialUIState = () => {
    document.getElementById('items-select').value = ITEMS_PER_PAGE;
    document.getElementById('quick-items-select').value = ITEMS_PER_PAGE;
    document.getElementById('thumb-slider').value = thumbSize;
    document.getElementById('quick-thumb-slider').value = thumbSize;
    document.getElementById('val-thumb').textContent = `${thumbSize}px`;
    document.getElementById('depth-slider').value = maxDepth === 'inf' ? 4 : maxDepth;
    document.getElementById('val-depth').textContent = maxDepth === 'inf' ? 'Inf' : maxDepth;
    document.getElementById('recursive-toggle').checked = isRecursive;
    document.getElementById('bg-select').value = canvasBg;
    elGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`;
    document.getElementById('open-all-max-images').value = openAllMaxImages;
    document.getElementById('open-all-max-size').value = openAllMaxSizeMB;
    document.getElementById('viewer-layout-select').value = viewerLayout;
    applyViewerLayout();
};
syncInitialUIState();

// Sidebar Resizer
const resizer = document.getElementById('sidebar-resizer');
let isResizing = false;
resizer.addEventListener('mousedown', () => { isResizing = true; resizer.classList.add('resizing'); document.body.style.cursor = 'col-resize'; });
window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newWidth = e.clientX;
    if (newWidth < 150) newWidth = 150;
    if (newWidth > 800) newWidth = 800;
    elSidebar.style.width = newWidth + 'px';
});
window.addEventListener('mouseup', () => {
    if (isResizing) { isResizing = false; resizer.classList.remove('resizing'); document.body.style.cursor = 'default'; }
});

// Sidebar controls
document.getElementById('btn-collapse-sidebar').onclick = () => {
    elSidebar.classList.add('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = 'block';
};
document.getElementById('btn-expand-sidebar').onclick = () => {
    elSidebar.classList.remove('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = 'none';
};
// Accordion logic
document.querySelectorAll('.accordion-header').forEach(header => {
    header.onclick = () => {
        const content = header.nextElementSibling;
        const arr = header.querySelector('.arr');
        content.classList.toggle('open');
        if (arr) arr.textContent = content.classList.contains('open') ? '▼' : '▶';
    };
});

// View Settings Bindings
document.getElementById('items-select').onchange = (e) => {
    ITEMS_PER_PAGE = parseInt(e.target.value);
    localStorage.setItem('ITEMS_PER_PAGE', ITEMS_PER_PAGE);
    document.getElementById('quick-items-select').value = ITEMS_PER_PAGE;
    currentPage = 1;
    renderGrid();
};
document.getElementById('thumb-slider').oninput = (e) => {
    thumbSize = parseInt(e.target.value);
    localStorage.setItem('thumbSize', thumbSize);
    document.getElementById('quick-thumb-slider').value = thumbSize;
    document.getElementById('val-thumb').textContent = `${thumbSize}px`;
    elGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`;
};

// Mirror bindings for Quick Bar controls
document.getElementById('quick-items-select').value = ITEMS_PER_PAGE;
document.getElementById('quick-thumb-slider').value = thumbSize;

document.getElementById('quick-items-select').onchange = (e) => { document.getElementById('items-select').value = e.target.value; document.getElementById('items-select').dispatchEvent(new Event('change')); };
document.getElementById('quick-thumb-slider').oninput = (e) => { document.getElementById('thumb-slider').value = e.target.value; document.getElementById('thumb-slider').dispatchEvent(new Event('input')); };

document.getElementById('depth-slider').oninput = (e) => {
    const val = parseInt(e.target.value);
    maxDepth = val === 4 ? 'inf' : val;
    localStorage.setItem('maxDepth', maxDepth);
    document.getElementById('val-depth').textContent = maxDepth === 'inf' ? 'Inf' : maxDepth;
    if (isRecursive) loadDirectory(currentDir);
};
document.getElementById('recursive-toggle').onchange = (e) => {
    isRecursive = e.target.checked;
    localStorage.setItem('isRecursive', isRecursive);
    loadDirectory(currentDir);
};
document.getElementById('bg-select').onchange = (e) => {
    canvasBg = e.target.value;
    localStorage.setItem('canvasBg', canvasBg);
    applyCanvasBg();
};
document.getElementById('open-all-max-images').onchange = (e) => {
    openAllMaxImages = parseInt(e.target.value) || 100;
    localStorage.setItem('openAllMaxImages', openAllMaxImages);
};
document.getElementById('open-all-max-size').onchange = (e) => {
    openAllMaxSizeMB = parseInt(e.target.value) || 10;
    localStorage.setItem('openAllMaxSizeMB', openAllMaxSizeMB);
};
document.getElementById('viewer-layout-select').onchange = (e) => {
    viewerLayout = e.target.value;
    localStorage.setItem('viewerLayout', viewerLayout);
    applyViewerLayout();
    updateImageTransform(); // re-center given new bounds
};
function applyViewerLayout() {
    const ws = document.getElementById('workspace-canvas');
    if (viewerLayout.startsWith('flex')) {
        ws.style.display = 'flex';
        ws.style.flexWrap = viewerLayout === 'flex-wrap' ? 'wrap' : 'nowrap';
        ws.style.gridTemplateColumns = '';
    } else if (viewerLayout.startsWith('grid')) {
        const cols = viewerLayout.split('-')[1];
        ws.style.display = 'grid';
        ws.style.gridTemplateColumns = `repeat(${cols}, auto)`;
        ws.style.flexWrap = '';
    }
}
function applyCanvasBg() {
    const el = document.getElementById('image-pan-container');
    if (canvasBg === 'checkered') {
        el.style.background = '#333';
        el.style.backgroundImage = 'repeating-linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%, #444), repeating-linear-gradient(45deg, #444 25%, #333 25%, #333 75%, #444 75%, #444)';
        el.style.backgroundSize = '20px 20px';
        el.style.backgroundPosition = '0 0, 10px 10px';
    } else {
        el.style.background = canvasBg;
        el.style.backgroundImage = 'none';
    }
}

// Data Root Setter
const rootInput = document.getElementById('root-path-input');

rootInput.onchange = async () => {
    const val = rootInput.value;
    if (!val) return;
    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({rootPath: val})
        });
        const rootLog = await res.json();
        if (!res.ok) {
            alert('Invalid path');
            fetch('/api/config').then(r=>r.json()).then(d => { if(d.rootPath) rootInput.value = d.rootPath; });
        } else {
            rootInput.style.borderColor = 'lime';
            setTimeout(() => rootInput.style.borderColor = 'var(--border-color)', 1000);
        }
    } catch(err) {
        console.error(err);
    }
};

document.getElementById('btn-browse-root').onclick = async () => {
    try {
        rootInput.placeholder = "Waiting for Dialog...";
        const res = await fetch('/api/choose-folder');
        const data = await res.json();
        if (data.path) {
            rootInput.value = data.path;
            rootInput.dispatchEvent(new Event('change'));
        } else {
            rootInput.placeholder = "Absolute OS directory...";
        }
    } catch(err) {
        alert("Failed to open dialog: " + err.message);
    }
};

fetch('/api/config').then(r=>r.json()).then(data => {
   if (data.rootPath) rootInput.value = data.rootPath;
}).catch(e=>console.error(e));

// Utilities
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Tree view lazy loading
async function renderTreeNode(container, pathStr, name) {
    const li = document.createElement('li');
    const line = document.createElement('div');
    line.className = 'tree-node-line';
    if (pathStr === currentDir) line.classList.add('selected');
    line.dataset.path = pathStr; 

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▶';
    
    const label = document.createElement('span');
    label.textContent = name || 'Assets';
    
    line.appendChild(toggle);
    line.appendChild(label);
    li.appendChild(line);

    const childrenContainer = document.createElement('ul');
    childrenContainer.className = 'tree-children';
    li.appendChild(childrenContainer);

    let loaded = false;

    toggle.onclick = async (e) => {
        e.stopPropagation();
        if (!loaded) {
            loaded = true;
            try {
                const res = await fetch(`/api/ls?dir=${encodeURIComponent(pathStr)}`);
                const data = await res.json();
                data.folders.forEach(f => renderTreeNode(childrenContainer, f.path, f.name));
            } catch(err) {}
        }
        childrenContainer.classList.toggle('open');
        toggle.textContent = childrenContainer.classList.contains('open') ? '▼' : '▶';
    };

    label.onclick = (e) => {
        e.stopPropagation();
        elTextView.style.display = 'none';
        elImageView.style.display = 'none';
        elGridView.style.display = 'block';
        loadDirectory(pathStr);
    };

    container.appendChild(li);
}

function updateTreeSelection() {
    document.querySelectorAll('.tree-node-line').forEach(el => {
        if (el.dataset.path === currentDir) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

// Favorites Logic
async function loadFavorites() {
    const res = await fetch('/api/favorites');
    favorites = await res.json();
    renderFavorites();
}

function renderFavorites() {
    elFavList.innerHTML = '';
    favorites.forEach(fav => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.title = fav.path;
        
        const starBtn = document.createElement('span');
        starBtn.textContent = '⭐';
        starBtn.title = 'Remove from Favorites';
        starBtn.style.cursor = 'pointer';
        starBtn.style.marginRight = '0.5rem';
        starBtn.style.flexShrink = '0';
        starBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(fav, e);
        };
        
        const labelText = document.createElement('span');
        labelText.textContent = fav.name;
        labelText.style.flex = '1';
        labelText.style.overflow = 'hidden';
        labelText.style.textOverflow = 'ellipsis';
        labelText.style.whiteSpace = 'nowrap';
        
        li.appendChild(starBtn);
        li.appendChild(labelText);

        li.onclick = () => {
            currentDir = fav.type === 'folder' ? fav.path : fav.path.substring(0, fav.path.lastIndexOf('/'));
            elTextView.style.display = 'none';
            elImageView.style.display = 'none';
            elGridView.style.display = 'block';
            loadDirectory(currentDir);
        };
        elFavList.appendChild(li);
    });
}

async function toggleFavorite(item, event) {
    event.stopPropagation();
    const action = favorites.find(f => f.path === item.path) ? 'remove' : 'add';
    const res = await fetch('/api/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileInfo: item, action })
    });
    const data = await res.json();
    favorites = data.favorites;
    renderFavorites();
    renderGrid();
}

// Core Data Loading
async function loadDirectory(dir) {
    try {
        const res = await fetch(`/api/ls?dir=${encodeURIComponent(dir)}&recursive=${isRecursive}&depth=${maxDepth}`);
        if (!res.ok) throw new Error('Failed to load directory');
        currentItems = await res.json();
        currentDir = dir;
        currentPage = 1;
        selectedPaths.clear();
        updateOpenAllBtn();
        
        updateTreeSelection();
        renderDynamicFilters();
        renderBreadcrumb();
        renderGrid();
    } catch (e) { console.error(e); }
}

function renderBreadcrumb() {
    elBreadcrumb.innerHTML = '';
    const rootSpan = document.createElement('span');
    rootSpan.textContent = 'Assets';
    rootSpan.onclick = () => {
        elTextView.style.display = 'none'; elImageView.style.display = 'none'; elGridView.style.display = 'block';
        loadDirectory('');
    };
    elBreadcrumb.appendChild(rootSpan);

    if (currentDir === '') return;

    const parts = currentDir.split('/');
    let buildPath = '';
    
    parts.forEach((part, index) => {
        const sep = document.createElement('span');
        sep.className = 'separator'; sep.textContent = ' / ';
        elBreadcrumb.appendChild(sep);

        buildPath += (index > 0 ? '/' : '') + part;
        const span = document.createElement('span');
        span.textContent = part;
        const targetPath = buildPath;
        span.onclick = () => {
            elTextView.style.display = 'none'; elImageView.style.display = 'none'; elGridView.style.display = 'block';
            loadDirectory(targetPath);
        };
        elBreadcrumb.appendChild(span);
    });
}

function renderDynamicFilters() {
    const exts = new Set();
    currentItems.files.forEach(f => { if (f.ext) exts.add(f.ext); });
    
    if (currentFilter !== 'all' && currentFilter !== 'image' && currentFilter !== 'audio' && !exts.has(currentFilter)) {
        currentFilter = 'all';
    }

    let html = `<button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                <button class="filter-btn ${currentFilter === 'image' ? 'active' : ''}" data-filter="image">Images</button>
                <button class="filter-btn ${currentFilter === 'audio' ? 'active' : ''}" data-filter="audio">Audio</button>`;
    
    [...exts].sort().forEach(ext => {
        if (ext) html += `<button class="filter-btn ${currentFilter === ext ? 'active' : ''}" data-filter="${ext}">${ext}</button>`;
    });

    document.getElementById('dynamic-filters').innerHTML = html;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            renderDynamicFilters(); // Re-render to update active classes
            renderGrid();
        };
    });
}

function renderGrid() {
    elGrid.innerHTML = '';
    elGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`;

    let all = currentItems.files;
    if (currentFilter !== 'all') {
        all = all.filter(f => f.type === currentFilter || f.ext === currentFilter);
    }

    // Build display list: direct child folders first (only when unfiltered), then files
    let displayItems;
    if (currentFilter === 'all') {
        const prefix = currentDir ? currentDir + '/' : '';
        const directFolders = currentItems.folders.filter(f => {
            if (prefix && !f.path.startsWith(prefix)) return false;
            const remainder = prefix ? f.path.slice(prefix.length) : f.path;
            return remainder.length > 0 && !remainder.includes('/');
        });
        displayItems = [...directFolders, ...all];
    } else {
        displayItems = all;
    }

    const totalPages = Math.ceil(displayItems.length / ITEMS_PER_PAGE);
    elPageInfo.textContent = `${currentPage} / ${totalPages || 1}`;
    elPrev.disabled = currentPage === 1;
    elNext.disabled = currentPage >= totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const itemsToShow = displayItems.slice(start, start + ITEMS_PER_PAGE);

    itemsToShow.forEach(item => {
        // Folder cards
        if (item.type === 'folder') {
            const card = document.createElement('div');
            card.className = 'item-card folder-card';
            card.title = item.path;
            card.innerHTML = `
                <div class="item-preview folder-preview">📁</div>
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-meta"><span>FOLDER</span></div>
                </div>
            `;
            card.onclick = () => {
                elTextView.style.display = 'none';
                elImageView.style.display = 'none';
                elGridView.style.display = 'block';
                loadDirectory(item.path);
            };
            elGrid.appendChild(card);
            return;
        }

        const card = document.createElement('div');
        card.className = 'item-card';
        card.title = `Path: ${item.path}\nType: ${item.type} (${item.ext})\nSize: ${formatSize(item.size)}`;

        let previewHTML = '';
        if (item.type === 'image') {
            previewHTML = `<div class="item-preview"><img src="/assets/${item.path}" loading="lazy"></div>`;
            card.onclick = () => initImageWorkspace(item);
        } else if (item.type === 'audio') {
            previewHTML = `<div class="item-preview" style="background:#2C3E50;font-size:3rem;">🎵</div>
                           <audio controls class="audio-preview"><source src="/assets/${item.path}"></audio>`;
        } else {
            previewHTML = `<div class="item-preview" style="background:#5D6D7E;font-size:3rem;">📄</div>`;
            card.onclick = async () => {
                try {
                    const res = await fetch(`/assets/${item.path}`);
                    const text = await res.text();
                    document.getElementById('inline-text-title').textContent = item.name;
                    document.getElementById('inline-text-content').textContent = text;
                    elGridView.style.display = 'none';
                    elTextView.style.display = 'flex';
                } catch (e) { alert('Error reading text file'); }
            };
        }

        const isFav = favorites.find(f => f.path === item.path);

        card.innerHTML = `
            ${item.type === 'image' ? `<label class="item-select" onclick="event.stopPropagation()"><input type="checkbox" class="select-cb" ${selectedPaths.has(item.path) ? 'checked' : ''}></label>` : ''}
            ${previewHTML}
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-meta">
                    <span>${item.type.toUpperCase()}</span>
                    <span>${formatSize(item.size)}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="action-btn fav-btn">${isFav ? '★' : '☆'}</button>
                <button class="action-btn rename-btn">✏️</button>
            </div>
        `;
        
        if (item.type === 'image') {
            card.querySelector('.select-cb').onchange = (e) => {
                e.stopPropagation();
                if (e.target.checked) selectedPaths.add(item.path);
                else selectedPaths.delete(item.path);
                card.classList.toggle('selected', e.target.checked);
                updateOpenAllBtn();
            };
            if (selectedPaths.has(item.path)) card.classList.add('selected');
        }
        
        card.querySelector('.fav-btn').onclick = (e) => toggleFavorite(item, e);
        card.querySelector('.rename-btn').onclick = (e) => {
            e.stopPropagation();
            renameTarget = item;
            document.getElementById('rename-input').value = item.name;
            document.getElementById('rename-modal').classList.add('active');
        };

        elGrid.appendChild(card);
    });
}

elPrev.onclick = () => { if (currentPage > 1) { currentPage--; renderGrid(); } };
elNext.onclick = () => { 
    if (!elNext.disabled) { currentPage++; renderGrid(); }
};

// Open All / Open Selected images in workspace viewer
function updateOpenAllBtn() {
    const btn = document.getElementById('btn-open-all');
    btn.textContent = selectedPaths.size > 0 ? `📸 Open ${selectedPaths.size} Selected` : '📸 Open All';
}
function openAllInViewer() {
    let all = currentItems.files;
    if (currentFilter !== 'all') {
        all = all.filter(f => f.type === currentFilter || f.ext === currentFilter);
    }
    let images;
    if (selectedPaths.size > 0) {
        images = all.filter(f => f.type === 'image' && selectedPaths.has(f.path));
    } else {
        images = all.filter(f => f.type === 'image');
    }
    if (images.length === 0) return;

    let totalSize = 0;
    const maxBytes = openAllMaxSizeMB * 1024 * 1024;
    const limited = [];
    for (const img of images) {
        if (limited.length >= openAllMaxImages) break;
        totalSize += img.size;
        if (totalSize > maxBytes && limited.length > 0) break;
        limited.push(img);
    }

    elGridView.style.display = 'none';
    elTextView.style.display = 'none';
    elImageView.style.display = 'flex';

    imgImages = all.filter(f => f.type === 'image');
    imgCurrIndex = 0;
    rangeStart = 0;
    rangeEnd = limited.length - 1;
    workspaceHistory = [];
    wsCanvas.innerHTML = '';

    limited.forEach(item => {
        const img = document.createElement('img');
        img.src = `/assets/${item.path}`;
        img.style.pointerEvents = 'none';
        img.style.maxHeight = '90vh';
        img.style.maxWidth = '90vw';
        img.style.objectFit = 'contain';
        img.dataset.path = item.path;
        wsCanvas.appendChild(img);
    });

    const label = selectedPaths.size > 0 ? `Selected: ${limited.length}` : `All: ${limited.length}`;
    document.getElementById('inline-image-title').textContent = `${label} image${limited.length !== 1 ? 's' : ''}`;
    updateNavButtons();
    imgScale = 1; imgTx = 0; imgTy = 0;
    updateImageTransform();
}
document.getElementById('btn-open-all').onclick = openAllInViewer;

// Back from Text/Image Viewer
document.querySelectorAll('.btn-back-to-grid').forEach(btn => {
    btn.onclick = () => {
        elTextView.style.display = 'none';
        elImageView.style.display = 'none';
        elGridView.style.display = 'block';
    };
});

/* ================== IMAGE VISUALIZER ENGINE ================== */
let imgImages = []; 
let imgCurrIndex = -1;
let rangeStart = -1; 
let rangeEnd = -1;
let workspaceHistory = [];

const wsCanvas = document.getElementById('workspace-canvas');
const zoomInput = document.getElementById('img-zoom-input');
const btnImgPrev = document.getElementById('btn-img-prev');
const btnImgNext = document.getElementById('btn-img-next');
const btnAddPrev = document.getElementById('btn-add-prev');
const btnAddNext = document.getElementById('btn-add-next');
const btnImgDefault = document.getElementById('btn-img-default');

function initImageWorkspace(item) {
    elGridView.style.display = 'none';
    elTextView.style.display = 'none';
    elImageView.style.display = 'flex';
    
    // Build context
    let all = currentItems.files;
    if (currentFilter !== 'all') all = all.filter(f => f.type === currentFilter || f.ext === currentFilter);
    imgImages = all.filter(f => f.type === 'image');
    imgCurrIndex = imgImages.findIndex(i => i.path === item.path);
    
    rangeStart = imgCurrIndex;
    rangeEnd = imgCurrIndex;
    workspaceHistory = [];
    
    wsCanvas.innerHTML = '';
    appendImgToWorkspace(item);
    updateNavButtons();
    
    // Reset transform
    imgScale = 1; imgTx = 0; imgTy = 0;
    updateImageTransform();
}

function appendImgToWorkspace(item, prepend = false) {
    const img = document.createElement('img');
    img.src = `/assets/${item.path}`;
    img.style.pointerEvents = 'none'; 
    img.style.maxHeight = '90vh';
    img.style.maxWidth = '90vw';
    img.style.objectFit = 'contain';
    img.dataset.path = item.path;
    
    if (prepend) wsCanvas.prepend(img);
    else wsCanvas.appendChild(img);
    document.getElementById('inline-image-title').textContent = `${rangeStart !== rangeEnd ? 'Multi: ' : ''}${imgImages[rangeStart].name} ...`;
}

function updateNavButtons() {
    btnImgPrev.disabled = imgCurrIndex <= 0;
    btnImgNext.disabled = imgCurrIndex >= imgImages.length - 1;
    btnAddPrev.disabled = rangeStart <= 0;
    btnAddNext.disabled = rangeEnd >= imgImages.length - 1;
}

btnImgPrev.onclick = () => { if (imgCurrIndex > 0) initImageWorkspace(imgImages[imgCurrIndex - 1]); };
btnImgNext.onclick = () => { if (imgCurrIndex < imgImages.length - 1) initImageWorkspace(imgImages[imgCurrIndex + 1]); };
btnImgDefault.onclick = () => initImageWorkspace(imgImages[imgCurrIndex]);

btnAddPrev.onclick = () => {
    if (rangeStart > 0) {
        rangeStart--;
        workspaceHistory.push('prev');
        appendImgToWorkspace(imgImages[rangeStart], true);
        updateNavButtons();
    }
};
btnAddNext.onclick = () => {
    if (rangeEnd < imgImages.length - 1) {
        rangeEnd++;
        workspaceHistory.push('next');
        appendImgToWorkspace(imgImages[rangeEnd], false);
        updateNavButtons();
    }
};

document.getElementById('btn-open-os').onclick = async () => {
    try {
        const targetPath = imgImages[imgCurrIndex].path;
        const res = await fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: targetPath })
        });
        if (!res.ok) throw new Error("OS folder integration failed");
    } catch(err) { console.error(err); }
};

/* Pan / Zoom / Measure Logic */
let imgScale = 1; let imgTx = 0; let imgTy = 0;
let isDragging = false; let startX, startY;
let activeTool = 'pan'; // 'pan' | 'measure'
let isMeasuring = false; let mStartX, mStartY;

const imgContainer = document.getElementById('image-pan-container');
const svgLine = document.getElementById('measure-line');
const svgText = document.getElementById('measure-text');
const svgBg = document.getElementById('measure-bg');

function clearOverlays() {
    svgLine.style.display = 'none';
    svgText.style.display = 'none';
    svgBg.style.display = 'none';
    const selBox = document.getElementById('select-box');
    if (selBox) selBox.style.display = 'none';
}

function updateImageTransform() {
    wsCanvas.style.transform = `translate(calc(-50% + ${imgTx}px), calc(-50% + ${imgTy}px)) scale(${imgScale})`;
    zoomInput.value = Math.round(imgScale * 100);
    drawRulers();
    clearOverlays();
}

zoomInput.onchange = (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 10) val = 10;
    if (val > 1000) val = 1000;
    imgScale = val / 100;
    updateImageTransform();
};
document.getElementById('btn-zoom-in').onclick = () => { imgScale *= 1.1; updateImageTransform(); };
document.getElementById('btn-zoom-out').onclick = () => { imgScale /= 1.1; updateImageTransform(); };
document.getElementById('btn-img-center').onclick = () => { imgTx = 0; imgTy = 0; imgScale = 1; updateImageTransform(); };

// Tools Toggles
document.getElementById('tool-pan').onclick = () => {
    activeTool = 'pan';
    document.getElementById('tool-pan').style.background = 'var(--primary-color)';
    document.getElementById('tool-measure').style.background = '';
    document.getElementById('tool-select').style.background = '';
    imgContainer.style.cursor = 'grab';
};
document.getElementById('tool-measure').onclick = () => {
    activeTool = 'measure';
    document.getElementById('tool-measure').style.background = 'var(--primary-color)';
    document.getElementById('tool-pan').style.background = '';
    document.getElementById('tool-select').style.background = '';
    imgContainer.style.cursor = 'crosshair';
};
document.getElementById('tool-select').onclick = () => {
    activeTool = 'select';
    document.getElementById('tool-select').style.background = 'var(--primary-color)';
    document.getElementById('tool-measure').style.background = '';
    document.getElementById('tool-pan').style.background = '';
    imgContainer.style.cursor = 'crosshair';
};

const rulerTop = document.getElementById('ruler-top');
const rulerLeft = document.getElementById('ruler-left');
const rulerCorner = document.getElementById('ruler-corner');
let rulerActive = false;

document.getElementById('tool-ruler').onclick = () => {
    rulerActive = !rulerActive;
    rulerTop.style.display = rulerActive ? 'block' : 'none';
    rulerLeft.style.display = rulerActive ? 'block' : 'none';
    rulerCorner.style.display = rulerActive ? 'block' : 'none';
    document.getElementById('tool-ruler').style.background = rulerActive ? 'var(--primary-color)' : '';
    drawRulers();
};

function drawRulers() {
    if (!rulerActive) return;
    const ctxT = rulerTop.getContext('2d');
    const ctxL = rulerLeft.getContext('2d');
    const w = imgContainer.clientWidth - 20;
    const h = imgContainer.clientHeight - 20;
    rulerTop.width = w; rulerLeft.height = h;
    
    ctxT.clearRect(0,0,w,20); ctxL.clearRect(0,0,20,h);
    ctxT.fillStyle = '#1e293b'; ctxT.fillRect(0,0,w,20);
    ctxL.fillStyle = '#1e293b'; ctxL.fillRect(0,0,20,h);
    
    ctxT.fillStyle = '#94a3b8'; ctxL.fillStyle = '#94a3b8';
    ctxT.font = '10px monospace'; ctxL.font = '10px monospace';
    
    const originX = (imgContainer.clientWidth / 2) + imgTx - 20;
    const originY = (imgContainer.clientHeight / 2) + imgTy - 20;
    const step = 100 * imgScale;
    if (step < 5) return;
    
    ctxT.beginPath(); ctxT.strokeStyle = '#64748b';
    let startX = originX % step; if (startX < 0) startX += step;
    for (let x = startX; x < w; x += step) {
        ctxT.moveTo(x, 10); ctxT.lineTo(x, 20);
        const val = Math.round((x - originX) / imgScale);
        ctxT.fillText(val, x + 2, 9);
    }
    ctxT.stroke();
    
    ctxL.beginPath(); ctxL.strokeStyle = '#64748b';
    let startY = originY % step; if (startY < 0) startY += step;
    for (let y = startY; y < h; y += step) {
        ctxL.moveTo(10, y); ctxL.lineTo(20, y);
        const val = Math.round((y - originY) / imgScale);
        ctxL.save(); ctxL.translate(9, y + 2); ctxL.rotate(-Math.PI/2);
        ctxL.fillText(val, 0, 0); ctxL.restore();
    }
    ctxL.stroke();
}
window.addEventListener('resize', drawRulers);

imgContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isDragging) return; // Prevent zooming while panning
    if (e.deltaY < 0) imgScale *= 1.1; else imgScale /= 1.1;
    if (imgScale < 0.1) imgScale = 0.1;
    updateImageTransform();
});

// Block middle-mouse autoscroll globally which causes 'stuck' movement native to Chrome/Windows
window.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
}, { passive: false });

imgContainer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    // e.button === 1 is Middle Click Scroll Wheel
    if (e.button === 1 || activeTool === 'pan') {
        isDragging = true; 
        startX = e.clientX - imgTx; 
        startY = e.clientY - imgTy;
        imgContainer.style.cursor = 'grabbing';
    } else if (e.button === 0 && (activeTool === 'measure' || activeTool === 'select')) {
        isMeasuring = true;
        const rect = imgContainer.getBoundingClientRect();
        mStartX = e.clientX - rect.left;
        mStartY = e.clientY - rect.top;
        
        if (activeTool === 'measure') {
            svgLine.setAttribute('x1', mStartX);
            svgLine.setAttribute('y1', mStartY);
            svgLine.setAttribute('x2', mStartX);
            svgLine.setAttribute('y2', mStartY);
            svgLine.style.display = 'block';
            svgText.style.display = 'none';
            svgBg.style.display = 'none';
        } else {
            const selectBox = document.getElementById('select-box');
            selectBox.setAttribute('x', mStartX);
            selectBox.setAttribute('y', mStartY);
            selectBox.setAttribute('width', 0);
            selectBox.setAttribute('height', 0);
            selectBox.setAttribute('fill', 'rgba(33, 150, 243, 0.2)');
            selectBox.style.display = 'block';
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        imgTx = e.clientX - startX; imgTy = e.clientY - startY;
        updateImageTransform();
    } else if (isMeasuring) {
        const rect = imgContainer.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        
        if (activeTool === 'measure') {
            svgLine.setAttribute('x2', curX);
            svgLine.setAttribute('y2', curY);
            
            const dx = curX - mStartX;
            const dy = curY - mStartY;
            const dist = Math.sqrt(dx*dx + dy*dy) / imgScale; // Actual pixel size normalized against zoom
            
            svgText.textContent = Math.round(dist) + 'px';
            svgText.setAttribute('x', curX + 15);
            svgText.setAttribute('y', curY + 15);
            
            svgBg.setAttribute('x', curX + 10);
            svgBg.setAttribute('y', curY + 2);
            svgBg.setAttribute('width', (svgText.textContent.length * 8) + 10);
            
            svgText.style.display = 'block';
            svgBg.style.display = 'block';
        } else if (activeTool === 'select') {
            const selectBox = document.getElementById('select-box');
            selectBox.setAttribute('x', Math.min(mStartX, curX));
            selectBox.setAttribute('y', Math.min(mStartY, curY));
            selectBox.setAttribute('width', Math.abs(curX - mStartX));
            selectBox.setAttribute('height', Math.abs(curY - mStartY));
        }
    }
});

async function clipAndCopy(x1, y1, x2, y2) {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    
    if (rw < 5 || rh < 5) return; // Ignore tiny accidental drag
    
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = rw;
    hiddenCanvas.height = rh;
    const ctx = hiddenCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // preserve crisp pixel art
    
    const images = wsCanvas.querySelectorAll('img');
    const containerRect = imgContainer.getBoundingClientRect();
    const screenRx = containerRect.left + rx;
    const screenRy = containerRect.top + ry;
    
    images.forEach(img => {
        const iRect = img.getBoundingClientRect();
        const destX = iRect.left - screenRx;
        const destY = iRect.top - screenRy;
        ctx.drawImage(img, destX, destY, iRect.width, iRect.height);
    });
    
    try {
        const blob = await new Promise(resolve => hiddenCanvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        
        const selectBox = document.getElementById('select-box');
        selectBox.setAttribute('fill', 'rgba(0, 255, 0, 0.4)');
        setTimeout(() => clearOverlays(), 300);
    } catch(err) {
        console.error("Clipboard copy failed: ", err);
        clearOverlays();
    }
}

window.addEventListener('mouseup', (e) => { 
    if (activeTool === 'select' && isMeasuring) {
        const rect = imgContainer.getBoundingClientRect();
        clipAndCopy(mStartX, mStartY, e.clientX - rect.left, e.clientY - rect.top);
    }
    isDragging = false; isMeasuring = false;
    if (activeTool === 'pan') imgContainer.style.cursor = 'grab';
});

// Keyboard controls
window.addEventListener('keydown', (e) => {
    if (elImageView.style.display !== 'flex') return;
    if (e.target.tagName && e.target.tagName.toLowerCase() === 'input') return;

    const step = 40;
    let acted = false;
    
    switch(e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
            imgTy += step; acted = true; break;
        case 's':
        case 'arrowdown':
            imgTy -= step; acted = true; break;
        case 'a':
        case 'arrowleft':
            imgTx += step; acted = true; break;
        case 'd':
        case 'arrowright':
            imgTx -= step; acted = true; break;
        case '+':
        case '=':
            imgScale *= 1.1; acted = true; break;
        case '-':
        case '_':
            imgScale /= 1.1; if (imgScale < 0.1) imgScale = 0.1; acted = true; break;
        case 'q':
            if (!btnImgPrev.disabled) btnImgPrev.click(); acted = true; break;
        case 'e':
            if (!btnImgNext.disabled) btnImgNext.click(); acted = true; break;
        case 'r':
            if (!btnAddNext.disabled) btnAddNext.click(); acted = true; break;
        case 'f':
            if (!btnAddPrev.disabled) btnAddPrev.click(); acted = true; break;
        case 'c':
            document.getElementById('btn-img-center').click(); acted = true; break;
        case 'x':
            btnImgDefault.click(); acted = true; break;
        case 'z':
            if (workspaceHistory.length > 0) {
                const action = workspaceHistory.pop();
                if (action === 'next') {
                    rangeEnd--;
                    wsCanvas.removeChild(wsCanvas.lastChild);
                } else if (action === 'prev') {
                    rangeStart++;
                    wsCanvas.removeChild(wsCanvas.firstChild);
                }
                updateNavButtons();
                acted = true;
            }
            // Z naturally doesn't require updateImageTransform unless we want to, 
            // but we'll set acted = true to prevent default just in case
            break;
    }

    if (acted) {
        e.preventDefault();
        updateImageTransform();
    }
});

// Modal renaming
document.getElementById('cancel-rename').onclick = () => document.getElementById('rename-modal').classList.remove('active');
document.getElementById('confirm-rename').onclick = async () => {
    const newName = document.getElementById('rename-input').value;
    if (!newName || newName === renameTarget.name) return;

    try {
        const res = await fetch('/api/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: renameTarget.path, newName })
        });
        if (!res.ok) throw new Error('Rename failed');
        
        document.getElementById('rename-modal').classList.remove('active');
        loadFavorites(); 
        loadDirectory(currentDir);
    } catch (e) { alert(e.message); }
};

window.onload = () => {
    // Restore UI for loaded settings
    document.getElementById('items-select').value = ITEMS_PER_PAGE;
    document.getElementById('thumb-slider').value = thumbSize;
    document.getElementById('val-thumb').textContent = `${thumbSize}px`;
    document.getElementById('depth-slider').value = maxDepth === 'inf' ? 4 : maxDepth;
    document.getElementById('val-depth').textContent = maxDepth === 'inf' ? 'Inf' : maxDepth;
    document.getElementById('recursive-toggle').checked = isRecursive;
    document.getElementById('bg-select').value = canvasBg;
    applyCanvasBg();

    loadFavorites();
    renderTreeNode(elFolderTree, '', 'Assets');
    setTimeout(() => {
        const firstToggle = document.querySelector('.tree-toggle');
        if (firstToggle) firstToggle.click();
    }, 100);
    loadDirectory('');
};
