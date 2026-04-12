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

// Sidebar controls
document.getElementById('btn-collapse-sidebar').onclick = () => {
    elSidebar.classList.add('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = 'block';
};
document.getElementById('btn-expand-sidebar').onclick = () => {
    elSidebar.classList.remove('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = 'none';
};
document.getElementById('btn-favorites').onclick = () => {
    elSidebar.classList.toggle('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = elSidebar.classList.contains('collapsed') ? 'block' : 'none';
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
    currentPage = 1;
    renderGrid();
};
document.getElementById('thumb-slider').oninput = (e) => {
    thumbSize = parseInt(e.target.value);
    localStorage.setItem('thumbSize', thumbSize);
    document.getElementById('val-thumb').textContent = `${thumbSize}px`;
    elGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`;
};
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
        li.textContent = `⭐ ${fav.name}`;
        li.title = fav.path;
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

    const totalPages = Math.ceil(all.length / ITEMS_PER_PAGE);
    elPageInfo.textContent = `${currentPage} / ${totalPages || 1}`;
    elPrev.disabled = currentPage === 1;
    elNext.disabled = currentPage >= totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const itemsToShow = all.slice(start, start + ITEMS_PER_PAGE);

    itemsToShow.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.title = `Size: ${formatSize(item.size)}`;

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
    let max = Math.ceil((currentFilter === 'all' ? currentItems.files.length : currentItems.files.filter(f => f.type === currentFilter || f.ext === currentFilter).length) / ITEMS_PER_PAGE);
    if (currentPage < max) { currentPage++; renderGrid(); } 
};

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
        appendImgToWorkspace(imgImages[rangeStart], true);
        updateNavButtons();
    }
};
btnAddNext.onclick = () => {
    if (rangeEnd < imgImages.length - 1) {
        rangeEnd++;
        appendImgToWorkspace(imgImages[rangeEnd], false);
        updateNavButtons();
    }
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

function updateImageTransform() {
    wsCanvas.style.transform = `translate(calc(-50% + ${imgTx}px), calc(-50% + ${imgTy}px)) scale(${imgScale})`;
    zoomInput.value = Math.round(imgScale * 100);
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
    imgContainer.style.cursor = 'grab';
};
document.getElementById('tool-measure').onclick = () => {
    activeTool = 'measure';
    document.getElementById('tool-measure').style.background = 'var(--primary-color)';
    document.getElementById('tool-pan').style.background = '';
    imgContainer.style.cursor = 'crosshair';
};
let rulerActive = false;
document.getElementById('tool-ruler').onclick = () => {
    rulerActive = !rulerActive;
    document.getElementById('ruler-overlay').style.display = rulerActive ? 'block' : 'none';
    document.getElementById('tool-ruler').style.background = rulerActive ? 'var(--primary-color)' : '';
};

imgContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) imgScale *= 1.1; else imgScale /= 1.1;
    if (imgScale < 0.1) imgScale = 0.1;
    updateImageTransform();
});

imgContainer.addEventListener('mousedown', (e) => {
    if (activeTool === 'pan') {
        isDragging = true; startX = e.clientX - imgTx; startY = e.clientY - imgTy;
        imgContainer.style.cursor = 'grabbing';
    } else if (activeTool === 'measure') {
        isMeasuring = true;
        const rect = imgContainer.getBoundingClientRect();
        mStartX = e.clientX - rect.left;
        mStartY = e.clientY - rect.top;
        
        svgLine.setAttribute('x1', mStartX);
        svgLine.setAttribute('y1', mStartY);
        svgLine.setAttribute('x2', mStartX);
        svgLine.setAttribute('y2', mStartY);
        svgLine.style.display = 'block';
        svgText.style.display = 'none';
        svgBg.style.display = 'none';
    }
});

window.addEventListener('mousemove', (e) => {
    if (activeTool === 'pan' && isDragging) {
        imgTx = e.clientX - startX; imgTy = e.clientY - startY;
        updateImageTransform();
    } else if (activeTool === 'measure' && isMeasuring) {
        const rect = imgContainer.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        
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
    }
});

window.addEventListener('mouseup', () => { 
    isDragging = false; isMeasuring = false;
    if (activeTool === 'pan') imgContainer.style.cursor = 'grab';
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
