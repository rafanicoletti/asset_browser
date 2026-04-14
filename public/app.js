let currentDir = '';
let currentItems = { folders: [], files: [] };
let currentPage = 1;

// View Settings States (with localStorage persistence)
let ITEMS_PER_PAGE = parseInt(localStorage.getItem('ITEMS_PER_PAGE')) || 24;
let currentFilter = 'all';
let currentExtFilters = new Set();
let favorites = [];
let isRecursive = localStorage.getItem('isRecursive') === 'true';
let maxDepth = localStorage.getItem('maxDepth') || 'inf';
let thumbSize = parseInt(localStorage.getItem('thumbSize')) || 200;
let canvasBg = localStorage.getItem('canvasBg') || '#000';
let openAllMaxImages = parseInt(localStorage.getItem('openAllMaxImages')) || 100;
let openAllMaxSizeMB = parseInt(localStorage.getItem('openAllMaxSizeMB')) || 10;
let viewerLayout = localStorage.getItem('viewerLayout') || 'flex-wrap';
let viewerAlignment = localStorage.getItem('viewerAlignment') || 'horizontal';
let viewerGapX = localStorage.getItem('viewerGapX') === null ? 10 : parseInt(localStorage.getItem('viewerGapX')) || 0;
let viewerGapY = localStorage.getItem('viewerGapY') === null ? 10 : parseInt(localStorage.getItem('viewerGapY')) || 0;
let imageFilter = localStorage.getItem('imageFilter') === 'nearest' ? 'nearest' : 'default';
let previewFilter = localStorage.getItem('previewFilter') || 'default';
let showFilterCounts = localStorage.getItem('showFilterCounts') === 'true';
const selectedPaths = new Set();
let lastSelectedPath = null;

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
const btnRefreshIndex = document.getElementById('btn-refresh-index');
const elIndexStatus = document.getElementById('index-status');
let indexStatusTimer = null;

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
    document.getElementById('viewer-alignment-select').value = viewerAlignment;
    document.getElementById('viewer-gap-x').value = viewerGapX;
    document.getElementById('viewer-gap-y').value = viewerGapY;
    document.getElementById('show-filter-counts').checked = showFilterCounts;
    updateImageFilterButton();
    updatePreviewFilterButton();
    applyViewerLayout();
    applyImageFilter();
    applyPreviewFilter();
};
syncInitialUIState();

// Sidebar Resizer
const resizer = document.getElementById('sidebar-resizer');
let isResizing = false;
resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.classList.add('is-resizing-sidebar');
    document.body.style.cursor = 'col-resize';
});
window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newWidth = e.clientX;
    if (newWidth < 150) newWidth = 150;
    if (newWidth > 800) newWidth = 800;
    elSidebar.style.width = newWidth + 'px';
});
window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.classList.remove('is-resizing-sidebar');
        document.body.style.cursor = 'default';
    }
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

document.getElementById('quick-items-select').onchange = (e) => {
    ITEMS_PER_PAGE = parseInt(e.target.value);
    localStorage.setItem('ITEMS_PER_PAGE', ITEMS_PER_PAGE);
    document.getElementById('items-select').value = ITEMS_PER_PAGE;
    currentPage = 1;
    renderGrid();
};
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
    requestAnimationFrame(centerVisibleWorkspace);
};
document.getElementById('viewer-alignment-select').onchange = (e) => {
    viewerAlignment = e.target.value;
    localStorage.setItem('viewerAlignment', viewerAlignment);
    applyViewerLayout();
    requestAnimationFrame(centerVisibleWorkspace);
};
document.getElementById('viewer-gap-x').oninput = (e) => {
    viewerGapX = Math.max(0, parseInt(e.target.value) || 0);
    localStorage.setItem('viewerGapX', viewerGapX);
    applyViewerLayout();
    requestAnimationFrame(centerVisibleWorkspace);
};
document.getElementById('viewer-gap-y').oninput = (e) => {
    viewerGapY = Math.max(0, parseInt(e.target.value) || 0);
    localStorage.setItem('viewerGapY', viewerGapY);
    applyViewerLayout();
    requestAnimationFrame(centerVisibleWorkspace);
};
document.getElementById('btn-image-filter').onclick = () => {
    imageFilter = imageFilter === 'default' ? 'nearest' : 'default';
    localStorage.setItem('imageFilter', imageFilter);
    updateImageFilterButton();
    applyImageFilter();
};
document.getElementById('show-filter-counts').onchange = (e) => {
    showFilterCounts = e.target.checked;
    localStorage.setItem('showFilterCounts', showFilterCounts);
    renderDynamicFilters();
};
document.getElementById('btn-preview-filter').onclick = () => {
    previewFilter = previewFilter === 'default' ? 'nearest' : 'default';
    localStorage.setItem('previewFilter', previewFilter);
    updatePreviewFilterButton();
    applyPreviewFilter();
};
function applyViewerLayout() {
    const ws = document.getElementById('workspace-canvas');
    const isVertical = viewerAlignment === 'vertical';

    Array.from(ws.children).forEach(child => {
        child.style.position = '';
        child.style.left = '';
        child.style.top = '';
        child.style.width = child.dataset.ext === '.svg' ? '90vw' : '';
        child.style.height = child.dataset.ext === '.svg' ? '90vh' : '';
    });
    ws.style.gridAutoFlow = '';
    ws.style.gridTemplateColumns = '';
    ws.style.gridTemplateRows = '';
    ws.style.flexDirection = '';
    ws.style.flexWrap = '';
    ws.style.width = '';
    ws.style.height = '';
    ws.style.columnGap = `${viewerGapX}px`;
    ws.style.rowGap = `${viewerGapY}px`;

    if (viewerLayout === 'mosaic') {
        applyMosaicLayout(ws);
    } else if (viewerLayout.startsWith('flex')) {
        ws.style.display = 'flex';
        ws.style.flexDirection = isVertical ? 'column' : 'row';
        ws.style.flexWrap = viewerLayout === 'flex-wrap' ? 'wrap' : 'nowrap';
    } else if (viewerLayout.startsWith('grid')) {
        let count = parseInt(viewerLayout.split('-')[1], 10);
        if (viewerLayout === 'grid-square') {
            count = Math.ceil(Math.sqrt(Math.max(ws.children.length, 1)));
        }

        ws.style.display = 'grid';
        if (isVertical) {
            ws.style.gridAutoFlow = 'column';
            ws.style.gridTemplateRows = `repeat(${count}, auto)`;
        } else {
            ws.style.gridAutoFlow = 'row';
            ws.style.gridTemplateColumns = `repeat(${count}, auto)`;
        }
    }
}

function getWorkspaceImageSize(img) {
    const maxW = imgContainer ? imgContainer.clientWidth * 0.9 : window.innerWidth * 0.9;
    const maxH = imgContainer ? imgContainer.clientHeight * 0.9 : window.innerHeight * 0.9;
    const naturalW = img.naturalWidth || img.getBoundingClientRect().width || 1;
    const naturalH = img.naturalHeight || img.getBoundingClientRect().height || 1;
    const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
    return {
        width: Math.max(1, Math.round(naturalW * scale)),
        height: Math.max(1, Math.round(naturalH * scale))
    };
}

function packMosaicRects(rects, containerWidth, gapX, gapY) {
    const placed = [];
    let height = 0;

    rects.forEach(rect => {
        let best = null;
        const maxX = Math.max(0, containerWidth - rect.width);
        const candidates = [0];
        placed.forEach(other => {
            const x = other.x + other.width + gapX;
            if (x <= maxX) candidates.push(x);
        });
        const uniqueCandidates = [...new Set(candidates)].sort((a, b) => a - b);

        uniqueCandidates.forEach(x => {
            let y = 0;
            placed.forEach(other => {
                const overlapsX = x < other.x + other.width + gapX && x + rect.width + gapX > other.x;
                if (overlapsX) y = Math.max(y, other.y + other.height + gapY);
            });
            if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y };
        });

        const placedRect = { ...rect, x: best.x, y: best.y };
        placed.push(placedRect);
        height = Math.max(height, placedRect.y + rect.height);
    });

    return { placed, width: containerWidth, height };
}

function applyMosaicLayout(ws) {
    const images = Array.from(ws.querySelectorAll('img'));
    if (images.length === 0) return;
    if (images.some(img => !img.complete || img.naturalWidth === 0)) return;

    const gapX = viewerGapX;
    const gapY = viewerGapY;
    const rects = images.map((img, index) => ({ index, ...getWorkspaceImageSize(img) }));
    const totalArea = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    const widest = Math.max(...rects.map(rect => rect.width));
    const totalWidth = rects.reduce((sum, rect) => sum + rect.width + gapX, 0) - gapX;
    const baseWidth = Math.max(widest, Math.round(Math.sqrt(totalArea)));
    const maxWidth = Math.max(baseWidth, Math.min(totalWidth, imgContainer.clientWidth * 1.8));
    const step = Math.max(24, Math.round(maxWidth / 16));
    let best = null;

    for (let width = baseWidth; width <= maxWidth; width += step) {
        const packed = packMosaicRects(rects, width, gapX, gapY);
        const score = packed.width * packed.height;
        if (!best || score < best.score) best = { ...packed, score };
    }

    ws.style.display = 'block';
    ws.style.width = `${best.width}px`;
    ws.style.height = `${best.height}px`;

    best.placed.forEach(rect => {
        const img = images[rect.index];
        img.style.position = 'absolute';
        img.style.left = `${rect.x}px`;
        img.style.top = `${rect.y}px`;
        img.style.width = `${rect.width}px`;
        img.style.height = `${rect.height}px`;
    });
}
function getImageRenderingValue() {
    return imageFilter === 'nearest' ? 'pixelated' : '';
}
function shouldSmoothImages() {
    return imageFilter !== 'nearest';
}
function applyImageFilterToElement(img) {
    img.style.imageRendering = getImageRenderingValue();
}
function updateImageFilterButton() {
    const btn = document.getElementById('btn-image-filter');
    if (!btn) return;
    btn.textContent = `Filter: ${imageFilter === 'nearest' ? 'Nearest' : 'Default'}`;
}
function applyImageFilter() {
    const ws = document.getElementById('workspace-canvas');
    if (!ws) return;
    ws.querySelectorAll('img').forEach(applyImageFilterToElement);
}
function getPreviewRenderingValue() {
    return previewFilter === 'nearest' ? 'pixelated' : '';
}
function updatePreviewFilterButton() {
    const btn = document.getElementById('btn-preview-filter');
    if (!btn) return;
    btn.textContent = `Preview: ${previewFilter === 'nearest' ? 'Nearest' : 'Default'}`;
}
function applyPreviewFilterToElement(img) {
    img.style.imageRendering = getPreviewRenderingValue();
}
function applyPreviewFilter() {
    elGrid.querySelectorAll('.image-preview img').forEach(applyPreviewFilterToElement);
}
function createWorkspaceImage(item) {
    const img = document.createElement('img');
    img.src = getAssetUrl(item.path);
    img.style.pointerEvents = 'none';
    img.style.maxHeight = '90vh';
    img.style.maxWidth = '90vw';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.dataset.path = item.path;
    img.dataset.ext = item.ext || '';

    if (item.ext === '.svg') {
        img.style.width = '90vw';
        img.style.height = '90vh';
    }

    img.onload = () => {
        requestAnimationFrame(() => {
            applyViewerLayout();
            centerVisibleWorkspace();
        });
    };
    applyImageFilterToElement(img);
    return img;
}
function getAssetUrl(assetPath) {
    return `/assets/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
}
function getAudioMimeType(ext) {
    const types = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.aif': 'audio/aiff',
        '.aiff': 'audio/aiff',
        '.opus': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.wma': 'audio/x-ms-wma',
        '.aac': 'audio/aac'
    };
    return types[ext] || 'audio/mpeg';
}
function applyCanvasBg() {
    const ws = document.getElementById('image-pan-container');
    const previews = document.querySelectorAll('.image-preview');
    const elements = [ws, ...previews];
    
    elements.forEach(el => {
        if (!el) return;
        if (canvasBg === 'checkered') {
            el.style.background = '#333';
            el.style.backgroundImage = 'repeating-linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%, #444), repeating-linear-gradient(45deg, #444 25%, #333 25%, #333 75%, #444 75%, #444)';
            el.style.backgroundSize = '20px 20px';
            el.style.backgroundPosition = '0 0, 10px 10px';
        } else {
            el.style.background = canvasBg;
            el.style.backgroundImage = 'none';
        }
    });
}

// Data Root Setter
const rootInput = document.getElementById('root-path-input');

function rebuildFolderTree() {
    elFolderTree.innerHTML = '';
    renderTreeNode(elFolderTree, '', 'Assets');
    setTimeout(() => {
        const firstToggle = document.querySelector('.tree-toggle');
        if (firstToggle) firstToggle.click();
    }, 100);
}

function formatIndexTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateIndexStatus(status) {
    if (!elIndexStatus) return;
    elIndexStatus.className = 'index-status';

    if (!status || !status.exists) {
        elIndexStatus.textContent = 'Index not built';
        elIndexStatus.classList.add('stale');
        return;
    }

    const label = `Indexed ${status.fileCount} files`;
    const timeLabel = formatIndexTime(status.createdAt);
    elIndexStatus.textContent = status.stale
        ? `${label} - out of sync`
        : `${label}${timeLabel ? ` at ${timeLabel}` : ''}`;
    elIndexStatus.classList.toggle('stale', Boolean(status.stale));
}

async function checkIndexStatus() {
    try {
        const res = await fetch('/api/index-status');
        if (!res.ok) throw new Error('Failed to read index status');
        updateIndexStatus(await res.json());
    } catch(err) {
        if (elIndexStatus) {
            elIndexStatus.textContent = 'Index status unavailable';
            elIndexStatus.className = 'index-status stale';
        }
    }
}

async function refreshAfterRootChange(rootLog) {
    if (rootLog.rootPath) rootInput.value = rootLog.rootPath;
    favorites = Array.isArray(rootLog.favorites) ? rootLog.favorites : await (await fetch('/api/favorites')).json();
    currentDir = '';
    currentPage = 1;
    selectedPaths.clear();
    lastSelectedPath = null;

    elTextView.style.display = 'none';
    elImageView.style.display = 'none';
    elGridView.style.display = 'block';

    renderFavorites();
    rebuildFolderTree();
    updateOpenAllBtn();
    updateIndexStatus({ exists: false, stale: true });
    await loadDirectory('', true);
}

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
            await refreshAfterRootChange(rootLog);
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
async function loadDirectory(dir, refreshIndex = false) {
    try {
        // Show loading state
        const loadingText = isRecursive ? (refreshIndex ? 'Refreshing index...' : 'Loading index...') : 'Loading...';
        elGrid.innerHTML = `<div class="grid-empty-state"><div class="spinner"></div><p>${loadingText}</p></div>`;

        const res = await fetch(`/api/ls?dir=${encodeURIComponent(dir)}&recursive=${isRecursive}&depth=${maxDepth}&refresh=${refreshIndex}`);
        if (!res.ok) throw new Error('Failed to load directory');
        currentItems = await res.json();
        if (currentItems.cache) updateIndexStatus({ exists: true, ...currentItems.cache });
        else await checkIndexStatus();
        currentDir = dir;
        currentPage = 1;
        selectedPaths.clear();
        updateOpenAllBtn();
        
        updateTreeSelection();
        renderDynamicFilters();
        renderBreadcrumb();
        renderGrid();
    } catch (e) { console.error(e); elGrid.innerHTML = '<div class="grid-empty-state">❌ Failed to load directory.</div>'; }
}

btnRefreshIndex.onclick = async () => {
    btnRefreshIndex.disabled = true;
    btnRefreshIndex.textContent = 'Refreshing...';
    try {
        rebuildFolderTree();
        await loadDirectory(currentDir, true);
    } finally {
        btnRefreshIndex.disabled = false;
        btnRefreshIndex.textContent = 'Refresh Structure';
    }
};

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
    let imageCount = 0, audioCount = 0;
    const extCounts = new Map();
    currentItems.files.forEach(f => {
        if (f.ext) {
            exts.add(f.ext);
            extCounts.set(f.ext, (extCounts.get(f.ext) || 0) + 1);
        }
        if (f.type === 'image') imageCount++;
        if (f.type === 'audio') audioCount++;
    });

    currentExtFilters = new Set([...currentExtFilters].filter(ext => exts.has(ext)));

    // Reset invalid filter
    if (currentFilter !== 'all' && currentFilter !== 'image' && currentFilter !== 'audio' && !exts.has(currentFilter)) {
        currentFilter = 'all';
    }
    // Reset type filter if no matching files exist
    if (currentFilter === 'image' && imageCount === 0) currentFilter = 'all';
    if (currentFilter === 'audio' && audioCount === 0) currentFilter = 'all';

    const totalCount = currentItems.files.length;
    const sc = showFilterCounts;
    const hasExtFilters = currentExtFilters.size > 0;
    let html = `<button class="filter-btn ${!hasExtFilters && currentFilter === 'all' ? 'active' : ''}" data-filter="all">All${sc ? ` (${totalCount})` : ''}</button>`;
    
    // Always show Images/Audio buttons — grey out when 0 to hint user to expand subfolders
    const imgTitle = imageCount === 0 && !isRecursive ? 'title="Enable Expand Subfolders to find images in subdirectories"' : '';
    const audTitle = audioCount === 0 && !isRecursive ? 'title="Enable Expand Subfolders to find audio in subdirectories"' : '';
    const imgStyle = imageCount === 0 ? ' style="opacity:0.35;cursor:not-allowed"' : '';
    const audStyle = audioCount === 0 ? ' style="opacity:0.35;cursor:not-allowed"' : '';
    html += `<button class="filter-btn ${!hasExtFilters && currentFilter === 'image' ? 'active' : ''}" data-filter="image" ${imgTitle}${imgStyle}>Images${sc && imageCount > 0 ? ` (${imageCount})` : ''}</button>`;
    html += `<button class="filter-btn ${!hasExtFilters && currentFilter === 'audio' ? 'active' : ''}" data-filter="audio" ${audTitle}${audStyle}>Audio${sc && audioCount > 0 ? ` (${audioCount})` : ''}</button>`;

    const extraExts = [...exts].sort().filter(ext => ext);
    if (extraExts.length > 0) {
        const summary = hasExtFilters ? `Types: ${currentExtFilters.size}` : 'More types';
        html += `<details id="filter-type-dropdown" class="filter-dropdown">`;
        html += `<summary>${summary}</summary>`;
        html += `<div class="filter-menu">`;
        extraExts.forEach(ext => {
            const count = extCounts.get(ext) || 0;
            html += `<label><input type="checkbox" class="filter-ext-cb" value="${ext}" ${currentExtFilters.has(ext) ? 'checked' : ''}> ${ext}${sc ? ` (${count})` : ''}</label>`;
        });
        html += `</div></details>`;
    }

    document.getElementById('dynamic-filters').innerHTML = html;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            currentFilter = btn.dataset.filter;
            currentExtFilters.clear();
            currentPage = 1;
            renderDynamicFilters();
            renderGrid();
        };
    });
    document.querySelectorAll('.filter-ext-cb').forEach(cb => {
        cb.onchange = () => {
            if (cb.checked) currentExtFilters.add(cb.value);
            else currentExtFilters.delete(cb.value);
            currentPage = 1;
            const summary = document.querySelector('#filter-type-dropdown summary');
            if (summary) summary.textContent = currentExtFilters.size > 0 ? `Types: ${currentExtFilters.size}` : 'More types';
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.toggle('active', currentExtFilters.size === 0 && currentFilter === btn.dataset.filter);
            });
            renderGrid();
        };
    });
}

function matchesCurrentFilter(file) {
    if (currentExtFilters.size > 0) return currentExtFilters.has(file.ext);
    if (currentFilter === 'all') return true;
    return file.type === currentFilter || file.ext === currentFilter;
}

function getFilteredFiles(files) {
    return files.filter(matchesCurrentFilter);
}

function getCurrentFilterLabel() {
    if (currentExtFilters.size > 0) return [...currentExtFilters].sort().join(', ');
    return currentFilter;
}

function getSelectedImageCount() {
    return getFilteredFiles(currentItems.files).filter(f => f.type === 'image' && selectedPaths.has(f.path)).length;
}

function updateSelectionState(displayItems, clickedItem, event) {
    if (clickedItem.type === 'folder') return false;

    const selectableItems = displayItems.filter(item => item.type !== 'folder');
    if (event.shiftKey && lastSelectedPath) {
        const from = selectableItems.findIndex(item => item.path === lastSelectedPath);
        const to = selectableItems.findIndex(item => item.path === clickedItem.path);
        if (from !== -1 && to !== -1) {
            const start = Math.min(from, to);
            const end = Math.max(from, to);
            for (let i = start; i <= end; i++) selectedPaths.add(selectableItems[i].path);
            return true;
        }
    }

    if (event.ctrlKey || event.metaKey) {
        if (selectedPaths.has(clickedItem.path)) selectedPaths.delete(clickedItem.path);
        else selectedPaths.add(clickedItem.path);
        lastSelectedPath = clickedItem.path;
        return true;
    }

    return false;
}

function markImageUnavailable(img, item) {
    const preview = img.closest('.item-preview');
    if (!preview || preview.querySelector('.preview-error')) return;
    img.style.display = 'none';
    const badge = document.createElement('div');
    badge.className = 'preview-error';
    badge.textContent = 'Unavailable';
    badge.title = `Could not read ${item.path}. If this is a OneDrive cloud-only file, make it available offline or start OneDrive.`;
    preview.appendChild(badge);
}

function renderGrid() {
    elGrid.innerHTML = '';
    elGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`;

    let all = getFilteredFiles(currentItems.files);

    // Build display list: direct child folders first (only when unfiltered), then files
    let displayItems;
    if (currentFilter === 'all' && currentExtFilters.size === 0) {
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

    if (itemsToShow.length === 0) {
        let msg = 'No files found.';
        if (currentFilter !== 'all' || currentExtFilters.size > 0) {
            msg = `No <strong>${getCurrentFilterLabel()}</strong> files in this folder.`;
            if (!isRecursive) msg += '<br><small>Try enabling <strong>Expand Subfolders</strong> to search inside subfolders.</small>';
        }
        elGrid.innerHTML = `<div class="grid-empty-state">${msg}</div>`;
        return;
    }
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
        const assetUrl = getAssetUrl(item.path);

        if (item.type === 'image') {
            previewHTML = `<div class="item-preview image-preview"><img src="${assetUrl}" loading="lazy"></div>`;
            card.onclick = (e) => {
                if (updateSelectionState(displayItems, item, e)) {
                    renderGrid();
                    updateOpenAllBtn();
                    return;
                }
                initImageWorkspace(item);
            };
        } else if (item.type === 'audio') {
            previewHTML = `<div class="item-preview" style="background:#2C3E50;font-size:3rem;flex:1;">🎵</div>
                           <div style="padding: 0.5rem; background: rgba(0,0,0,0.3);"><audio controls preload="metadata" style="width: 100%; height: 36px; border-radius: 4px;"><source src="${assetUrl}" type="${getAudioMimeType(item.ext)}"></audio></div>`;
            card.onclick = (e) => {
                if (updateSelectionState(displayItems, item, e)) {
                    renderGrid();
                    updateOpenAllBtn();
                }
            };
        } else {
            previewHTML = `<div class="item-preview" style="background:#5D6D7E;font-size:3rem;flex:1;">📄</div>`;
            card.onclick = async (e) => {
                if (updateSelectionState(displayItems, item, e)) {
                    renderGrid();
                    updateOpenAllBtn();
                    return;
                }
                try {
                    const res = await fetch(assetUrl);
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
                lastSelectedPath = item.path;
                card.classList.toggle('selected', e.target.checked);
                updateOpenAllBtn();
            };
            const img = card.querySelector('.image-preview img');
            applyPreviewFilterToElement(img);
            img.onerror = () => markImageUnavailable(img, item);
        }
        if (selectedPaths.has(item.path)) card.classList.add('selected');
        
        card.querySelector('.fav-btn').onclick = (e) => toggleFavorite(item, e);
        card.querySelector('.rename-btn').onclick = (e) => {
            e.stopPropagation();
            renameTarget = item;
            document.getElementById('rename-input').value = item.name;
            document.getElementById('rename-modal').classList.add('active');
        };

        elGrid.appendChild(card);
    });

    applyCanvasBg(); // Apply background style to newly rendered image previews
    // Explicitly call load() on all audio elements so browsers register the src after innerHTML injection
    elGrid.querySelectorAll('audio').forEach(a => a.load());
}

elPrev.onclick = () => { if (currentPage > 1) { currentPage--; renderGrid(); } };
elNext.onclick = () => { 
    if (!elNext.disabled) { currentPage++; renderGrid(); }
};

// Open All / Open Selected images in workspace viewer
function updateOpenAllBtn() {
    const btn = document.getElementById('btn-open-all');
    const selectedImageCount = getSelectedImageCount();
    btn.textContent = selectedImageCount > 0 ? `📸 Open ${selectedImageCount} Selected` : '📸 Open All';
}
function openAllInViewer() {
    let all = getFilteredFiles(currentItems.files);
    let images;
    if (getSelectedImageCount() > 0) {
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
        wsCanvas.appendChild(createWorkspaceImage(item));
    });
    applyViewerLayout();

    const label = getSelectedImageCount() > 0 ? `Selected: ${limited.length}` : `All: ${limited.length}`;
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
    let all = getFilteredFiles(currentItems.files);
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
    const img = createWorkspaceImage(item);
    
    if (prepend) wsCanvas.prepend(img);
    else wsCanvas.appendChild(img);
    applyViewerLayout();
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
let suppressZoomUntil = 0;
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

function centerVisibleWorkspace() {
    if (wsCanvas.children.length === 0) return;

    const containerRect = imgContainer.getBoundingClientRect();
    const imageRects = Array.from(wsCanvas.querySelectorAll('img'))
        .map(img => img.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
    if (imageRects.length === 0) return;

    const contentRect = imageRects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom)
    }), imageRects[0]);

    const contentCenterX = (contentRect.left + contentRect.right) / 2;
    const contentCenterY = (contentRect.top + contentRect.bottom) / 2;
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;

    imgTx += containerCenterX - contentCenterX;
    imgTy += containerCenterY - contentCenterY;
    updateImageTransform();
}

function getImageContainerCenter() {
    const rect = imgContainer.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function zoomImageAt(clientX, clientY, nextScale) {
    const oldScale = imgScale;
    const newScale = Math.max(0.1, Math.min(10, nextScale));

    if (!wsCanvas.offsetWidth || !wsCanvas.offsetHeight || !Number.isFinite(oldScale) || oldScale <= 0) {
        imgScale = newScale;
        updateImageTransform();
        return;
    }

    const canvasRect = wsCanvas.getBoundingClientRect();
    const anchorX = (clientX - canvasRect.left) / oldScale;
    const anchorY = (clientY - canvasRect.top) / oldScale;
    const containerRect = imgContainer.getBoundingClientRect();
    const baseLeft = containerRect.left + containerRect.width / 2 - wsCanvas.offsetWidth / 2;
    const baseTop = containerRect.top + containerRect.height / 2 - wsCanvas.offsetHeight / 2;

    imgScale = newScale;
    imgTx = clientX - baseLeft - anchorX * imgScale;
    imgTy = clientY - baseTop - anchorY * imgScale;
    updateImageTransform();
}

zoomInput.onchange = (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 10) val = 10;
    if (val > 1000) val = 1000;
    const center = getImageContainerCenter();
    zoomImageAt(center.x, center.y, val / 100);
};
document.getElementById('btn-zoom-in').onclick = () => {
    const center = getImageContainerCenter();
    zoomImageAt(center.x, center.y, imgScale * 1.1);
};
document.getElementById('btn-zoom-out').onclick = () => {
    const center = getImageContainerCenter();
    zoomImageAt(center.x, center.y, imgScale / 1.1);
};
document.getElementById('btn-img-center').onclick = centerVisibleWorkspace;

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
window.addEventListener('resize', () => {
    if (elImageView.style.display === 'flex') {
        applyViewerLayout();
        requestAnimationFrame(centerVisibleWorkspace);
    }
    drawRulers();
});

imgContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Prevent delayed wheel/trackpad events from zooming while a pan is active.
    if (isDragging || e.buttons !== 0 || performance.now() < suppressZoomUntil) return;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomImageAt(e.clientX, e.clientY, imgScale * zoomFactor);
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
        suppressZoomUntil = performance.now() + 250;
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
        suppressZoomUntil = performance.now() + 250;
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
    ctx.imageSmoothingEnabled = shouldSmoothImages();
    
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
    suppressZoomUntil = performance.now() + 250;
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
            {
                const center = getImageContainerCenter();
                zoomImageAt(center.x, center.y, imgScale * 1.1);
            }
            acted = false;
            e.preventDefault();
            break;
        case '-':
        case '_':
            {
                const center = getImageContainerCenter();
                zoomImageAt(center.x, center.y, imgScale / 1.1);
            }
            acted = false;
            e.preventDefault();
            break;
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
                applyViewerLayout();
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
        checkIndexStatus();
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
    rebuildFolderTree();
    checkIndexStatus();
    if (indexStatusTimer) clearInterval(indexStatusTimer);
    indexStatusTimer = setInterval(checkIndexStatus, 10000);
    loadDirectory('');
};
