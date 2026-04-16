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
let showImageBounds = localStorage.getItem('showImageBounds') === 'true';
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
    document.getElementById('show-image-bounds').checked = showImageBounds;
    document.getElementById('show-filter-counts').checked = showFilterCounts;
    updateImageFilterButton();
    updatePreviewFilterButton();
    applyViewerLayout();
    applyImageBounds();
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
    scheduleImageOverlayRefresh();
};
document.getElementById('btn-expand-sidebar').onclick = () => {
    elSidebar.classList.remove('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = 'none';
    scheduleImageOverlayRefresh();
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
document.getElementById('show-image-bounds').onchange = (e) => {
    showImageBounds = e.target.checked;
    localStorage.setItem('showImageBounds', showImageBounds);
    applyImageBounds();
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
function applyImageBounds() {
    const ws = document.getElementById('workspace-canvas');
    if (!ws) return;
    ws.classList.toggle('show-image-bounds', showImageBounds);
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
            if (animationState.activeImagePath === item.path || getWorkspaceImages().length === 1) {
                loadDefaultAnimationForImage(item.path);
            }
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
    const animationPreviewCanvas = document.getElementById('animation-preview');
    const elements = [ws, animationPreviewCanvas, ...previews];
    
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
    clearAnimationWorkspace();

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
    clearAnimationWorkspace();
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
let mStartImagePoint = null;

const imgContainer = document.getElementById('image-pan-container');
const svgLine = document.getElementById('measure-line');
const svgText = document.getElementById('measure-text');
const svgBg = document.getElementById('measure-bg');
const animationOverlay = document.getElementById('animation-overlay');
const animationPanel = document.getElementById('animation-panel');
const animationStatus = document.getElementById('animation-status');
const animationTimeline = document.getElementById('animation-timeline');
const animationList = document.getElementById('animation-list');
const animationPreview = document.getElementById('animation-preview');
const imageResolutionTooltip = document.getElementById('image-resolution-tooltip');
let imageOverlayRefreshPending = false;
let imageResolutionTimer = null;
let imageResolutionHover = null;

const animationState = {
    panelOpen: false,
    panelCollapsed: false,
    panelWidth: parseInt(localStorage.getItem('animationPanelWidth'), 10) || 360,
    splitTarget: localStorage.getItem('animationSplitTarget') || 'active',
    activeImagePath: null,
    splitMode: 'auto',
    cellWidth: 32,
    cellHeight: 32,
    paddingX: 0,
    paddingY: 0,
    cellSizeSource: 'pixels',
    splits: new Map(),
    selectedFrameIds: [],
    lastSelectedFrameId: null,
    selectedTimelineIndexes: [],
    lastSelectedTimelineIndex: null,
    timelineSelectionSource: 'timeline',
    timelineInsertionIndex: null,
    timelineCursorSlot: 0,
    timelineZoom: parseFloat(localStorage.getItem('animationTimelineZoom')) || 1,
    animationListHeight: parseInt(localStorage.getItem('animationListHeight'), 10) || 180,
    previewSpeed: parseFloat(localStorage.getItem('animationPreviewSpeed')) || 1,
    frameClipboard: [],
    animationFilterText: '',
    animationSourceFilter: '',
    animations: [],
    activeAnimationId: null,
    previewPlaying: true,
    previewLooping: localStorage.getItem('animationPreviewLooping') !== 'false',
    previewSize: parseInt(localStorage.getItem('animationPreviewSize'), 10) || 220,
    previewStartedAt: performance.now(),
    previewPausedFrameIndex: 0,
    previewLogKeys: new Set(),
    imageCache: new Map(),
    autoSaveTimer: null,
    loadingDefaultAnimation: false,
    dragMoved: false,
    worker: null,
    workerSeq: 0,
    workerRequests: new Map()
};

function setAnimationStatus(message) {
    if (animationStatus) animationStatus.textContent = message;
}

function applyAnimationPanelLayout() {
    if (!animationPanel) return;
    animationPanel.classList.toggle('collapsed', animationState.panelCollapsed);
    animationPanel.style.width = animationState.panelCollapsed ? '42px' : `${animationState.panelWidth}px`;
    scheduleImageOverlayRefresh();
}

function applyAnimationListHeight() {
    if (!animationPanel) return;
    animationPanel.style.setProperty('--animation-list-height', `${animationState.animationListHeight}px`);
}

function getWorkspaceImages() {
    return Array.from(wsCanvas.querySelectorAll('img'));
}

function getLoadedWorkspaceImages() {
    return getWorkspaceImages().filter(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}

function getWorkspaceImageByPath(imagePath) {
    return getWorkspaceImages().find(img => img.dataset.path === imagePath);
}

function getImageNameFromPath(imagePath) {
    return imagePath ? imagePath.split('/').pop() : 'none';
}

function updateAnimationFocusUi() {
    const targetInput = document.getElementById('animation-split-target');
    if (targetInput) targetInput.value = animationState.splitTarget;

    const activePath = animationState.activeImagePath && getWorkspaceImageByPath(animationState.activeImagePath)
        ? animationState.activeImagePath
        : null;
    getWorkspaceImages().forEach(img => {
        img.classList.toggle('animation-focus-image', animationState.panelOpen && img.dataset.path === activePath);
    });

    const label = document.getElementById('animation-focus-label');
    if (label) label.textContent = activePath ? `Focus: ${getImageNameFromPath(activePath)}` : 'Focus: none';
}

function setAnimationActiveImage(imagePath, options = {}) {
    if (!imagePath || !getWorkspaceImageByPath(imagePath)) return null;
    animationState.activeImagePath = imagePath;
    updateAnimationFocusUi();
    if (!options.quiet) setAnimationStatus(`Focused ${getImageNameFromPath(imagePath)}.`);
    return getWorkspaceImageByPath(imagePath);
}

function ensureAnimationActiveImage() {
    const current = animationState.activeImagePath ? getWorkspaceImageByPath(animationState.activeImagePath) : null;
    if (current) return current;

    const first = getWorkspaceImages()[0];
    return first ? setAnimationActiveImage(first.dataset.path, { quiet: true }) : null;
}

function groupImageMetricsByAxis(metrics, axis) {
    const centerKey = axis === 'x' ? 'centerX' : 'centerY';
    const sizeKey = axis === 'x' ? 'naturalHeight' : 'naturalWidth';
    const groups = [];

    metrics
        .slice()
        .sort((a, b) => a[centerKey] - b[centerKey])
        .forEach(metric => {
            let group = groups.find(candidate => Math.abs(candidate.center - metric[centerKey]) <= 8);
            if (!group) {
                group = { center: metric[centerKey], items: [] };
                groups.push(group);
            }
            group.items.push(metric);
            group.center = group.items.reduce((sum, item) => sum + item[centerKey], 0) / group.items.length;
        });

    return groups.map(group => group.items.reduce((sum, item) => sum + item[sizeKey], 0));
}

function getAnimationGroupedImageSize() {
    const metrics = getLoadedWorkspaceImages()
        .map(img => {
            const rect = img.getBoundingClientRect();
            return {
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight
            };
        });

    if (metrics.length === 0) return null;

    const rowWidths = groupImageMetricsByAxis(metrics, 'y');
    const columnHeights = groupImageMetricsByAxis(metrics, 'x');
    return {
        width: Math.max(...rowWidths),
        height: Math.max(...columnHeights)
    };
}

function getAnimationCellInputSize() {
    if (animationState.splitTarget === 'active') {
        const img = ensureAnimationActiveImage();
        if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;
        return { width: img.naturalWidth, height: img.naturalHeight, label: 'focused image' };
    }

    const groupedSize = getAnimationGroupedImageSize();
    return groupedSize ? { ...groupedSize, label: 'shown images' } : null;
}

function updateAnimationCellPixelsFromCounts(options = {}) {
    if (!options.preserveSource) animationState.cellSizeSource = 'counts';
    const gridModeInput = document.querySelector('input[name="animation-split-mode"][value="grid"]');
    if (gridModeInput) gridModeInput.checked = true;

    const countXInput = document.getElementById('animation-cell-count-x');
    const countYInput = document.getElementById('animation-cell-count-y');
    const countX = Math.max(0, parseInt(countXInput.value, 10) || 0);
    const countY = Math.max(0, parseInt(countYInput.value, 10) || 0);
    const paddingX = Math.max(0, parseInt(document.getElementById('animation-padding-x').value, 10) || 0);
    const paddingY = Math.max(0, parseInt(document.getElementById('animation-padding-y').value, 10) || 0);
    if (countX === 0 && countY === 0) return;

    const targetSize = getAnimationCellInputSize();
    if (!targetSize) {
        if (!options.quiet) setAnimationStatus('Open a loaded image first.');
        return;
    }

    if (countX > 0) document.getElementById('animation-cell-width').value = Math.max(1, Math.floor((targetSize.width - Math.max(0, countX - 1) * paddingX) / countX));
    if (countY > 0) document.getElementById('animation-cell-height').value = Math.max(1, Math.floor((targetSize.height - Math.max(0, countY - 1) * paddingY) / countY));
    if (!options.quiet) setAnimationStatus(`Cell size from ${targetSize.label}: ${targetSize.width} x ${targetSize.height}px.`);
}

function updateAnimationCellCountsFromPixels(options = {}) {
    if (!options.preserveSource) animationState.cellSizeSource = 'pixels';
    const gridModeInput = document.querySelector('input[name="animation-split-mode"][value="grid"]');
    if (gridModeInput) gridModeInput.checked = true;

    const cellWidth = Math.max(0, parseInt(document.getElementById('animation-cell-width').value, 10) || 0);
    const cellHeight = Math.max(0, parseInt(document.getElementById('animation-cell-height').value, 10) || 0);
    const paddingX = Math.max(0, parseInt(document.getElementById('animation-padding-x').value, 10) || 0);
    const paddingY = Math.max(0, parseInt(document.getElementById('animation-padding-y').value, 10) || 0);
    if (cellWidth === 0 && cellHeight === 0) return;

    const targetSize = getAnimationCellInputSize();
    if (!targetSize) {
        if (!options.quiet) setAnimationStatus('Open a loaded image first.');
        return;
    }

    if (cellWidth > 0) document.getElementById('animation-cell-count-x').value = Math.max(1, Math.floor((targetSize.width + paddingX) / (cellWidth + paddingX)));
    if (cellHeight > 0) document.getElementById('animation-cell-count-y').value = Math.max(1, Math.floor((targetSize.height + paddingY) / (cellHeight + paddingY)));
    if (!options.quiet) setAnimationStatus(`Cell count from ${targetSize.label}: ${targetSize.width} x ${targetSize.height}px.`);
}

function getFrameImage(frame) {
    const workspaceImg = getWorkspaceImageByPath(frame.imagePath);
    if (workspaceImg) {
        return workspaceImg.complete && workspaceImg.naturalWidth > 0 && workspaceImg.naturalHeight > 0 ? workspaceImg : null;
    }

    let cached = animationState.imageCache.get(frame.imagePath);
    if (!cached) {
        cached = new Image();
        cached.onload = () => {
            renderAnimationPanel();
            animationState.previewStartedAt = performance.now();
        };
        cached.onerror = () => {
            logAnimationPreviewIssue('image-load', frame, {
                src: cached.src,
                message: `Failed to load ${frame.imagePath}`
            });
        };
        cached.src = getAssetUrl(frame.imagePath);
        animationState.imageCache.set(frame.imagePath, cached);
    }
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
}

function logAnimationPreviewIssue(reason, frame, details = {}) {
    const frameKey = frame ? `${frame.id || 'no-id'}:${frame.imagePath || 'no-image'}:${frame.index ?? 'no-index'}` : 'no-frame';
    const key = `${reason}:${frameKey}`;
    if (animationState.previewLogKeys.has(key)) return;
    animationState.previewLogKeys.add(key);
    const payload = {
        reason,
        frame: frame ? {
            id: frame.id,
            imagePath: frame.imagePath,
            imageName: frame.imageName,
            index: frame.index,
            bounds: { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
        } : null,
        details
    };
    console.warn('[animation-preview]', payload);
    if (reason !== 'waiting-image') {
        setAnimationStatus(`Preview issue: ${reason}. Check console.`);
    }
}

function getFrameImagePathFromId(frameId) {
    const frame = getFrameById(frameId);
    if (frame) return frame.imagePath;
    if (typeof frameId !== 'string') return null;
    const index = frameId.lastIndexOf('::');
    return index > 0 ? frameId.slice(0, index) : null;
}

function getActiveAnimation() {
    return animationState.animations.find(animation => animation.id === animationState.activeAnimationId);
}

function getTrackImagePath(animation) {
    if (!animation) return null;
    if (animation.imagePath) return animation.imagePath;
    for (const frameId of animation.frameIds || []) {
        const imagePath = getFrameImagePathFromId(frameId);
        if (imagePath) return imagePath;
    }
    return null;
}

function filterFrameIdsToSingleImage(frameIds, preferredImagePath = null) {
    let imagePath = preferredImagePath;
    const filtered = [];
    let skipped = 0;

    frameIds.forEach(frameId => {
        const frame = getFrameById(frameId);
        if (!frame) {
            skipped += 1;
            return;
        }
        if (!imagePath) imagePath = frame.imagePath;
        if (frame.imagePath !== imagePath) {
            skipped += 1;
            return;
        }
        filtered.push(frameId);
    });

    return { frameIds: filtered, imagePath, skipped };
}

function getAnimationConstraintImagePath() {
    const active = getActiveAnimation();
    if (active && (active.frameIds || []).some(frameId => getFrameById(frameId))) return getTrackImagePath(active);
    const selected = animationState.selectedFrameIds.map(getFrameById).find(Boolean);
    return selected ? selected.imagePath : null;
}

function getFrameSourceRect(frame, img) {
    const imageWidth = img.naturalWidth || img.width || 0;
    const imageHeight = img.naturalHeight || img.height || 0;
    const x = Math.max(0, Math.floor(frame.x || 0));
    const y = Math.max(0, Math.floor(frame.y || 0));
    const w = Math.min(Math.max(0, Math.floor(frame.w || 0)), imageWidth - x);
    const h = Math.min(Math.max(0, Math.floor(frame.h || 0)), imageHeight - y);
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
}

function getWorkspaceImageAt(clientX, clientY) {
    const images = getWorkspaceImages().slice().reverse();
    for (const img of images) {
        const rect = img.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return img;
    }
    return null;
}

function ensureAnimationWorker() {
    if (animationState.worker) return animationState.worker;

    animationState.worker = new Worker('/public/animation-worker.js');
    animationState.worker.onmessage = (event) => {
        const { id, error, frames, width, height } = event.data;
        const request = animationState.workerRequests.get(id);
        if (!request) return;
        animationState.workerRequests.delete(id);
        if (error) request.reject(new Error(error));
        else request.resolve({ frames, width, height });
    };
    animationState.worker.onerror = (event) => {
        animationState.workerRequests.forEach(request => request.reject(new Error(event.message || 'Worker failed')));
        animationState.workerRequests.clear();
    };
    return animationState.worker;
}

async function splitImageInWorker(img, mode, cellWidth, cellHeight, paddingX = 0, paddingY = 0) {
    const worker = ensureAnimationWorker();
    const bitmap = await createImageBitmap(img);
    const id = ++animationState.workerSeq;

    return await new Promise((resolve, reject) => {
        animationState.workerRequests.set(id, { resolve, reject });
        worker.postMessage({ id, mode, bitmap, cellWidth, cellHeight, paddingX, paddingY }, [bitmap]);
    });
}

function makeFrameId(imagePath, index) {
    return `${imagePath}::${index}`;
}

function normalizeWorkerFrames(imagePath, imageName, result) {
    return result.frames.map((frame, index) => ({
        id: makeFrameId(imagePath, index),
        imagePath,
        imageName,
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        row: frame.row || 0,
        col: frame.col || index,
        index
    }));
}

async function applyAnimationSplit() {
    const targetInput = document.getElementById('animation-split-target');
    animationState.splitTarget = targetInput ? targetInput.value : animationState.splitTarget;
    localStorage.setItem('animationSplitTarget', animationState.splitTarget);

    const loadedImages = getLoadedWorkspaceImages();
    const focusedImage = animationState.splitTarget === 'active' ? ensureAnimationActiveImage() : null;
    const images = animationState.splitTarget === 'active'
        ? loadedImages.filter(img => focusedImage && img.dataset.path === focusedImage.dataset.path)
        : loadedImages;
    if (images.length === 0) {
        setAnimationStatus(animationState.splitTarget === 'active' ? 'No focused loaded image.' : 'No loaded images.');
        return;
    }

    const mode = document.querySelector('input[name="animation-split-mode"]:checked')?.value || 'auto';
    const cellWidth = Math.max(1, parseInt(document.getElementById('animation-cell-width').value, 10) || 1);
    const cellHeight = Math.max(1, parseInt(document.getElementById('animation-cell-height').value, 10) || 1);
    const paddingX = Math.max(0, parseInt(document.getElementById('animation-padding-x').value, 10) || 0);
    const paddingY = Math.max(0, parseInt(document.getElementById('animation-padding-y').value, 10) || 0);
    animationState.splitMode = mode;
    animationState.cellWidth = cellWidth;
    animationState.cellHeight = cellHeight;
    animationState.paddingX = paddingX;
    animationState.paddingY = paddingY;
    animationState.previewLogKeys.clear();
    setAnimationStatus(`Splitting ${images.length} image${images.length === 1 ? '' : 's'}...`);

    try {
        const results = await Promise.all(images.map(async img => {
            const result = await splitImageInWorker(img, mode, cellWidth, cellHeight, paddingX, paddingY);
            return { img, result };
        }));

        results.forEach(({ img, result }) => {
            const imagePath = img.dataset.path;
            const imageName = imagePath.split('/').pop();
            animationState.splits.set(imagePath, {
                imagePath,
                imageName,
                imageWidth: result.width,
                imageHeight: result.height,
                split: { mode, cellWidth, cellHeight, paddingX, paddingY },
                frames: normalizeWorkerFrames(imagePath, imageName, result)
            });
        });

        const frameCount = results.reduce((sum, item) => sum + item.result.frames.length, 0);
        const pruned = pruneAnimationFrameRefs({ keepEmpty: true, preserveFocus: true });
        const targetLabel = animationState.splitTarget === 'active' ? getImageNameFromPath(images[0].dataset.path) : 'shown images';
        const pruneLabel = pruned.removedFrames > 0 ? ` Removed ${pruned.removedFrames} stale frame reference${pruned.removedFrames === 1 ? '' : 's'}.` : '';
        setAnimationStatus(`Split ${frameCount} frame${frameCount === 1 ? '' : 's'} on ${targetLabel}.${pruneLabel}`);
        renderAnimationPanel();
        drawAnimationOverlay();
        scheduleDefaultAnimationSave('split');
    } catch (err) {
        console.error(err);
        setAnimationStatus(`Split failed: ${err.message}`);
    }
}

function pruneAnimationFrameRefs(options = {}) {
    const keepEmpty = options.keepEmpty !== false;
    const focusBeforePrune = animationState.activeImagePath;
    let removedFrames = 0;
    let removedAnimations = 0;
    const activeId = animationState.activeAnimationId;

    animationState.animations = animationState.animations.filter(animation => {
        const preferredImagePath = getTrackImagePath(animation);
        const normalized = filterFrameIdsToSingleImage(animation.frameIds || [], preferredImagePath);
        removedFrames += (animation.frameIds || []).length - normalized.frameIds.length;
        setAnimationFrameIds(animation, normalized.frameIds);
        animation.imagePath = normalized.imagePath || preferredImagePath || null;
        if (keepEmpty || animation.frameIds.length > 0) return true;
        removedAnimations += 1;
        return false;
    });

    if (!animationState.animations.some(animation => animation.id === activeId)) {
        animationState.activeAnimationId = animationState.animations[0] ? animationState.animations[0].id : null;
    }

    const active = getActiveAnimation();
    if (active) {
        animationState.selectedFrameIds = [...active.frameIds];
        if (!options.preserveFocus && active.imagePath) setAnimationActiveImage(active.imagePath, { quiet: true });
    } else {
        const normalized = filterFrameIdsToSingleImage(animationState.selectedFrameIds);
        removedFrames += animationState.selectedFrameIds.length - normalized.frameIds.length;
        animationState.selectedFrameIds = normalized.frameIds;
    }
    animationState.lastSelectedFrameId = animationState.selectedFrameIds[animationState.selectedFrameIds.length - 1] || null;
    if (options.preserveFocus && focusBeforePrune) setAnimationActiveImage(focusBeforePrune, { quiet: true });

    return { removedFrames, removedAnimations };
}

function getFrameById(frameId) {
    for (const split of animationState.splits.values()) {
        const frame = split.frames.find(candidate => candidate.id === frameId);
        if (frame) return frame;
    }
    return null;
}

function getSelectedAnimationFrames() {
    return animationState.selectedFrameIds.map(getFrameById).filter(Boolean);
}

function getFrameScreenRect(frame) {
    const img = getWorkspaceImageByPath(frame.imagePath);
    const split = animationState.splits.get(frame.imagePath);
    if (!img || !split) return null;

    const rect = img.getBoundingClientRect();
    const scaleX = rect.width / split.imageWidth;
    const scaleY = rect.height / split.imageHeight;
    return {
        left: rect.left + frame.x * scaleX,
        top: rect.top + frame.y * scaleY,
        width: frame.w * scaleX,
        height: frame.h * scaleY
    };
}

function drawAnimationOverlay() {
    if (!animationOverlay) return;
    const hasFrames = animationState.panelOpen && animationState.splits.size > 0;
    animationOverlay.style.display = hasFrames ? 'block' : 'none';
    if (!hasFrames) return;

    const dpr = window.devicePixelRatio || 1;
    const width = imgContainer.clientWidth;
    const height = imgContainer.clientHeight;
    if (animationOverlay.width !== Math.round(width * dpr)) animationOverlay.width = Math.round(width * dpr);
    if (animationOverlay.height !== Math.round(height * dpr)) animationOverlay.height = Math.round(height * dpr);
    const ctx = animationOverlay.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const containerRect = imgContainer.getBoundingClientRect();
    const selectedCounts = new Map();
    const active = getActiveAnimation();
    const overlayFrameIds = active && animationState.timelineSelectionSource === 'timeline' && animationState.selectedTimelineIndexes.length > 0
        ? animationState.selectedTimelineIndexes.map(index => active.frameIds[index]).filter(Boolean)
        : animationState.selectedFrameIds;
    overlayFrameIds.forEach(frameId => {
        selectedCounts.set(frameId, (selectedCounts.get(frameId) || 0) + 1);
    });
    ctx.lineWidth = 1;
    animationState.splits.forEach(split => {
        split.frames.forEach(frame => {
            const rect = getFrameScreenRect(frame);
            if (!rect) return;
            const x = rect.left - containerRect.left;
            const y = rect.top - containerRect.top;
            const selectedCount = selectedCounts.get(frame.id) || 0;
            const isSelected = selectedCount > 0;
            if (isSelected) {
                ctx.fillStyle = 'rgba(59, 130, 246, 0.28)';
                ctx.fillRect(x, y, rect.width, rect.height);
            }
            ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(125, 211, 252, 0.9)';
            ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, rect.width - 1), Math.max(1, rect.height - 1));
            if (isSelected) {
                const label = String(selectedCount);
                ctx.font = '11px sans-serif';
                ctx.textBaseline = 'middle';
                const badgeW = Math.max(16, Math.ceil(ctx.measureText(label).width) + 8);
                const badgeH = 16;
                const badgeX = x + Math.max(2, rect.width - badgeW - 2);
                const badgeY = y + 2;
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
                ctx.fillStyle = '#111827';
                ctx.textAlign = 'center';
                ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2);
            }
        });
    });
}

function scheduleImageOverlayRefresh() {
    if (imageOverlayRefreshPending) return;
    imageOverlayRefreshPending = true;
    requestAnimationFrame(() => {
        imageOverlayRefreshPending = false;
        drawRulers();
        drawAnimationOverlay();
        if (animationState.cellSizeSource === 'counts') updateAnimationCellPixelsFromCounts({ preserveSource: true, quiet: true });
        else updateAnimationCellCountsFromPixels({ preserveSource: true, quiet: true });
    });
}

function findAnimationFrameAt(clientX, clientY) {
    const splits = Array.from(animationState.splits.values()).reverse();
    for (const split of splits) {
        for (let i = split.frames.length - 1; i >= 0; i--) {
            const frame = split.frames[i];
            const rect = getFrameScreenRect(frame);
            if (!rect) continue;
            if (clientX >= rect.left && clientX <= rect.left + rect.width && clientY >= rect.top && clientY <= rect.top + rect.height) {
                return frame;
            }
        }
    }
    return null;
}

function getAnimationFramesInVisualOrder(imagePath = null) {
    const ordered = [];
    animationState.splits.forEach(split => {
        if (imagePath && split.imagePath !== imagePath) return;
        split.frames.forEach(frame => {
            const rect = getFrameScreenRect(frame);
            if (rect) ordered.push({ frame, rect });
        });
    });

    ordered.sort((a, b) => {
        const topDelta = a.rect.top - b.rect.top;
        if (Math.abs(topDelta) > 8) return topDelta;
        return a.rect.left - b.rect.left;
    });
    return ordered.map(item => item.frame);
}

function addAnimationFramesInOrder(frames) {
    const ids = new Set(animationState.selectedFrameIds);
    frames.forEach(frame => {
        if (ids.has(frame.id)) return;
        animationState.selectedFrameIds.push(frame.id);
        ids.add(frame.id);
    });
}

function selectAnimationFrame(frame, options = {}) {
    const multi = Boolean(options.multi);
    const range = Boolean(options.range);
    setAnimationActiveImage(frame.imagePath, { quiet: true });

    const constraintImagePath = getAnimationConstraintImagePath();
    const shouldStartNewTrack = !multi && !range && constraintImagePath && constraintImagePath !== frame.imagePath;
    if ((multi || range) && constraintImagePath && constraintImagePath !== frame.imagePath) {
        setAnimationStatus(`Animation frames stay inside one image. Track image: ${getImageNameFromPath(constraintImagePath)}.`);
        return;
    }
    if (shouldStartNewTrack) {
        const existing = getAnimationByImagePath(frame.imagePath);
        if (existing) {
            selectAnimationTrack(existing.id);
            setAnimationStatus(`Loaded ${existing.name || 'animation'} for ${getImageNameFromPath(frame.imagePath)}.`);
            return;
        }
        createAnimationTrack([frame.id], { name: getNextAnimationName(), imagePath: frame.imagePath });
        animationState.selectedFrameIds = [frame.id];
        animationState.lastSelectedFrameId = frame.id;
        setTimelineSelection([0], { source: 'image' });
        renderAnimationPanel();
        drawAnimationOverlay();
        scheduleDefaultAnimationSave('new-track');
        return;
    }

    if (range && animationState.lastSelectedFrameId) {
        const lastFrame = getFrameById(animationState.lastSelectedFrameId);
        if (lastFrame && lastFrame.imagePath !== frame.imagePath) {
            setAnimationStatus(`Animation frames stay inside one image. Track image: ${getImageNameFromPath(lastFrame.imagePath)}.`);
            return;
        }

        const ordered = getAnimationFramesInVisualOrder(frame.imagePath);
        const from = ordered.findIndex(candidate => candidate.id === animationState.lastSelectedFrameId);
        const to = ordered.findIndex(candidate => candidate.id === frame.id);
        if (from !== -1 && to !== -1) {
            const start = Math.min(from, to);
            const end = Math.max(from, to);
            addAnimationFramesInOrder(ordered.slice(start, end + 1));
            animationState.lastSelectedFrameId = frame.id;
            syncActiveAnimationFrames();
            setTimelineSelection([], { source: 'image' });
            renderAnimationPanel();
            drawAnimationOverlay();
            scheduleDefaultAnimationSave('range-select');
            return;
        }
    }

    const ids = animationState.selectedFrameIds;
    if (multi) {
        const existingIndex = ids.indexOf(frame.id);
        if (existingIndex === -1) ids.push(frame.id);
        else ids.splice(existingIndex, 1);
        animationState.lastSelectedFrameId = frame.id;
    } else if (ids.length === 1 && ids[0] === frame.id) {
        animationState.selectedFrameIds = [];
        animationState.lastSelectedFrameId = null;
    } else {
        const active = getActiveAnimation();
        if (active) {
            active.frameIds = [];
            active.frameSlots = [];
            active.imagePath = frame.imagePath;
        }
        animationState.selectedFrameIds = [frame.id];
        animationState.lastSelectedFrameId = frame.id;
    }
    syncActiveAnimationFrames();
    setTimelineSelection(animationState.selectedFrameIds.length > 0 ? [animationState.selectedFrameIds.length - 1] : [], { source: 'image' });
    renderAnimationPanel();
    drawAnimationOverlay();
    scheduleDefaultAnimationSave('select-frame');
}

function drawFrameThumb(canvas, frame) {
    const img = getFrameImage(frame);
    if (!img) return;
    const source = getFrameSourceRect(frame, img);
    if (!source) return;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(canvas.width / source.w, canvas.height / source.h);
    const w = Math.max(1, Math.round(source.w * scale));
    const h = Math.max(1, Math.round(source.h * scale));
    const x = Math.floor((canvas.width - w) / 2);
    const y = Math.floor((canvas.height - h) / 2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = shouldSmoothImages();
    ctx.drawImage(img, source.x, source.y, source.w, source.h, x, y, w, h);
}

function getNextAnimationName() {
    const names = new Set(animationState.animations.map(animation => animation.name));
    let index = 0;
    while (names.has(`animation_${index}`)) index += 1;
    return `animation_${index}`;
}

function getAnimationInputName(fallback = getNextAnimationName()) {
    const input = document.getElementById('animation-name');
    return ((input && input.value) || fallback).trim() || fallback;
}

function getAnimationInputFps() {
    const input = document.getElementById('animation-fps');
    return Math.max(0.1, Math.min(60, parseFloat(input && input.value) || 8));
}

function getAnimationSourceName(animation) {
    return getImageNameFromPath(getTrackImagePath(animation) || animationState.activeImagePath);
}

function getAnimationFps(animation = null) {
    return Math.max(0.1, Math.min(60, parseFloat(animation ? animation.fps : getAnimationInputFps()) || 8));
}

function getDefaultTimelineDurationForFps(fps) {
    const parsedFps = Math.max(0.1, Math.min(60, parseFloat(fps) || 8));
    return parsedFps >= 1 ? 1 : Math.min(600, 1 / parsedFps);
}

function getAnimationTimelineDuration(animation) {
    return getDefaultTimelineDurationForFps(getAnimationFps(animation));
}

function getTimelineFrameCount(animation) {
    return Math.max(0, (animation && animation.frameIds ? animation.frameIds.length : 0));
}

function getTimelineFrameStartTime(animation, index) {
    const count = getTimelineFrameCount(animation);
    if (!animation || count === 0) return 0;
    const duration = getAnimationTimelineDuration(animation);
    return Math.max(0, Math.min(duration, (Math.max(0, index) / count) * duration));
}

function getTimelineFrameCenterTime(animation, index) {
    const count = getTimelineFrameCount(animation);
    if (!animation || count === 0) return 0;
    const duration = getAnimationTimelineDuration(animation);
    return Math.max(0, Math.min(duration, ((Math.max(0, index) + 0.5) / count) * duration));
}

function normalizeAnimationFrameSlots(animation) {
    if (!animation) return [];
    animation.timelineDuration = getAnimationTimelineDuration(animation);
    animation.slotsEdited = false;
    animation.frameSlots = (animation.frameIds || []).map((_, index) => getTimelineFrameStartTime(animation, index));
    return animation.frameSlots;
}

function distributeAnimationFrameSlots(animation) {
    return normalizeAnimationFrameSlots(animation);
}

function getTimelinePixelsPerSecond(animation = null) {
    const duration = animation ? getAnimationTimelineDuration(animation) : 1;
    const availableWidth = Math.max(
        320,
        animationTimeline ? animationTimeline.clientWidth : 0,
        document.getElementById('animation-timebar') ? document.getElementById('animation-timebar').clientWidth : 0
    );
    const minPixelsPerSecond = availableWidth / Math.max(0.0001, duration);
    return Math.max(minPixelsPerSecond, 72 * Math.max(1, Math.min(8, animationState.timelineZoom || 1)));
}

function getTimelineContentWidth(animation) {
    return Math.round(getAnimationTimelineDuration(animation) * getTimelinePixelsPerSecond(animation));
}

function getTimelineSlotFromClientX(animation, clientX) {
    const timebar = document.getElementById('animation-timebar');
    if (!timebar || !animation) return 0;
    const rect = timebar.getBoundingClientRect();
    const x = Math.max(0, Math.min(getTimelineContentWidth(animation), clientX - rect.left + timebar.scrollLeft));
    return Math.max(0, Math.min(getAnimationTimelineDuration(animation), x / getTimelinePixelsPerSecond(animation)));
}

function getTimelineXForSlot(animation, slot) {
    return Math.max(0, slot) * getTimelinePixelsPerSecond(animation);
}

function clampTimelineX(animation, x, inset = 0) {
    const width = getTimelineContentWidth(animation);
    const max = Math.max(inset, width - inset);
    return Math.max(inset, Math.min(max, x));
}

function setAnimationFrameIds(animation, frameIds, options = {}) {
    if (!animation) return;
    animation.frameIds = [...frameIds];
    normalizeAnimationFrameSlots(animation);
}

function getAnimationByImagePath(imagePath) {
    return animationState.animations.find(animation => getTrackImagePath(animation) === imagePath);
}

function setTimelineSelection(indexes, options = {}) {
    const active = getActiveAnimation();
    const count = active ? active.frameIds.length : animationState.selectedFrameIds.length;
    const valid = [...new Set(indexes.filter(index => index >= 0 && index < count))].sort((a, b) => a - b);
    animationState.selectedTimelineIndexes = valid;
    animationState.timelineSelectionSource = options.source || 'timeline';
    if (!options.keepAnchor) {
        animationState.lastSelectedTimelineIndex = valid[valid.length - 1] ?? null;
    }
    const status = document.getElementById('animation-edit-status');
    if (status) {
        status.textContent = valid.length > 0
            ? `${valid.length} frame${valid.length === 1 ? '' : 's'} selected. Ctrl/Cmd+C, X, V edit.`
            : 'Click a gap, paste frames there.';
    }
    drawAnimationOverlay();
}

function selectTimelineFrameIndex(index, event = {}) {
    const active = getActiveAnimation();
    const count = active ? active.frameIds.length : animationState.selectedFrameIds.length;
    if (index < 0 || index >= count) return;

    if (event.shiftKey && animationState.lastSelectedTimelineIndex !== null) {
        const start = Math.min(animationState.lastSelectedTimelineIndex, index);
        const end = Math.max(animationState.lastSelectedTimelineIndex, index);
        setTimelineSelection(Array.from({ length: end - start + 1 }, (_, offset) => start + offset), { keepAnchor: true });
        return;
    }

    if (event.ctrlKey || event.metaKey) {
        const current = new Set(animationState.selectedTimelineIndexes);
        if (current.has(index)) current.delete(index);
        else current.add(index);
        setTimelineSelection([...current]);
        animationState.lastSelectedTimelineIndex = index;
        return;
    }

    setTimelineSelection([index]);
    animationState.lastSelectedTimelineIndex = index;
}

function setTimelineInsertionIndex(index) {
    const active = getActiveAnimation();
    const count = active ? active.frameIds.length : animationState.selectedFrameIds.length;
    animationState.timelineInsertionIndex = Math.max(0, Math.min(count, index));
    const status = document.getElementById('animation-edit-status');
    if (status) status.textContent = `Paste point: before frame ${animationState.timelineInsertionIndex + 1}.`;
    renderAnimationPanel();
}

function getTimelineInsertSlot(animation, index) {
    const count = getTimelineFrameCount(animation);
    if (!animation || count === 0) return 0;
    return getTimelineFrameStartTime(animation, Math.max(0, Math.min(count, index)));
}

function getTimelineInsertionIndexForSlot(animation, slot) {
    const count = getTimelineFrameCount(animation);
    if (!animation || count === 0) return 0;
    const duration = getAnimationTimelineDuration(animation);
    if (duration <= 0) return 0;
    return Math.max(0, Math.min(count, Math.round((slot / duration) * count)));
}

function getFrameIndexAtSlot(animation, slot) {
    const count = getTimelineFrameCount(animation);
    if (!animation || count === 0) return 0;
    const duration = getAnimationTimelineDuration(animation);
    if (duration <= 0) return 0;
    return Math.max(0, Math.min(count - 1, Math.floor((slot / duration) * count)));
}

function insertFrameIdsAt(frameIds, index) {
    const active = getActiveAnimation();
    if (!active || frameIds.length === 0) return 0;
    const normalized = filterFrameIdsToSingleImage(frameIds, getTrackImagePath(active));
    if (normalized.frameIds.length === 0) {
        setAnimationStatus(`Paste skipped. Frames must belong to ${getAnimationSourceName(active)}.`);
        return 0;
    }
    const insertAt = Math.max(0, Math.min(active.frameIds.length, index));
    active.frameIds.splice(insertAt, 0, ...normalized.frameIds);
    normalizeAnimationFrameSlots(active);
    animationState.selectedFrameIds = [...active.frameIds];
    setTimelineSelection(normalized.frameIds.map((_, offset) => insertAt + offset));
    animationState.timelineInsertionIndex = insertAt + normalized.frameIds.length;
    animationState.previewStartedAt = performance.now();
    renderAnimationPanel();
    drawAnimationOverlay();
    scheduleDefaultAnimationSave('insert');
    return normalized.frameIds.length;
}

function copyTimelineSelection(cut = false) {
    const active = getActiveAnimation();
    if (!active || animationState.selectedTimelineIndexes.length === 0) return false;
    animationState.frameClipboard = animationState.selectedTimelineIndexes.map(index => active.frameIds[index]).filter(Boolean);
    if (cut) {
        removeTimelineIndexes(animationState.selectedTimelineIndexes);
        setAnimationStatus(`Cut ${animationState.frameClipboard.length} frame${animationState.frameClipboard.length === 1 ? '' : 's'}.`);
    } else {
        setAnimationStatus(`Copied ${animationState.frameClipboard.length} frame${animationState.frameClipboard.length === 1 ? '' : 's'}.`);
    }
    return true;
}

function pasteTimelineClipboard() {
    if (animationState.frameClipboard.length === 0) return false;
    const active = getActiveAnimation();
    if (!active) return false;
    const insertAt = animationState.timelineInsertionIndex !== null
        ? animationState.timelineInsertionIndex
        : (animationState.selectedTimelineIndexes.length > 0 ? Math.max(...animationState.selectedTimelineIndexes) + 1 : active.frameIds.length);
    const pasted = insertFrameIdsAt(animationState.frameClipboard, insertAt);
    if (pasted > 0) setAnimationStatus(`Pasted ${pasted} frame${pasted === 1 ? '' : 's'}.`);
    return pasted > 0;
}

function removeTimelineIndexes(indexes) {
    const active = getActiveAnimation();
    if (!active) return;
    const remove = new Set(indexes);
    active.frameIds = active.frameIds.filter((_, index) => !remove.has(index));
    normalizeAnimationFrameSlots(active);
    animationState.selectedFrameIds = [...active.frameIds];
    setTimelineSelection([]);
    animationState.previewStartedAt = performance.now();
    renderAnimationPanel();
    drawAnimationOverlay();
    scheduleDefaultAnimationSave('remove');
}

function createAnimationTrack(frameIds = [], options = {}) {
    const normalized = filterFrameIdsToSingleImage(frameIds);
    const animation = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: options.name || getAnimationInputName(getNextAnimationName()),
        fps: getAnimationInputFps(),
        imagePath: normalized.imagePath || options.imagePath || animationState.activeImagePath || null,
        frameIds: normalized.frameIds,
        frameSlots: [],
        timelineDuration: getDefaultTimelineDurationForFps(getAnimationInputFps()),
        slotsEdited: false
    };
    distributeAnimationFrameSlots(animation);
    animationState.animations.push(animation);
    animationState.activeAnimationId = animation.id;
    return animation;
}

function syncActiveAnimationFrames() {
    let active = animationState.animations.find(animation => animation.id === animationState.activeAnimationId);
    if (!active && animationState.selectedFrameIds.length > 0) {
        active = createAnimationTrack(animationState.selectedFrameIds);
    }
    if (active) {
        const preferredImagePath = (active.frameIds || []).length > 0 ? getTrackImagePath(active) : null;
        const normalized = filterFrameIdsToSingleImage(animationState.selectedFrameIds, preferredImagePath);
        active.imagePath = normalized.imagePath || active.imagePath || null;
        setAnimationFrameIds(active, normalized.frameIds);
        animationState.selectedFrameIds = [...normalized.frameIds];
        setTimelineSelection(animationState.selectedTimelineIndexes, { keepAnchor: true });
    }
}

function selectAnimationTrack(animationId) {
    const animation = animationState.animations.find(candidate => candidate.id === animationId);
    if (!animation) return;
    syncActiveAnimationFrames();
    animationState.activeAnimationId = animation.id;
    const normalized = filterFrameIdsToSingleImage(animation.frameIds || [], getTrackImagePath(animation));
    animation.imagePath = normalized.imagePath || animation.imagePath || null;
    setAnimationFrameIds(animation, normalized.frameIds);
    animationState.selectedFrameIds = [...animation.frameIds];
    animationState.lastSelectedFrameId = animationState.selectedFrameIds[animationState.selectedFrameIds.length - 1] || null;
    animationState.timelineInsertionIndex = null;
    setTimelineSelection([]);
    animationState.previewPlaying = true;
    animationState.previewStartedAt = performance.now();
    animationState.previewPausedFrameIndex = 0;
    document.getElementById('btn-animation-play').textContent = 'Pause';
    if (animation.imagePath) setAnimationActiveImage(animation.imagePath, { quiet: true });
    applyCanvasBg();
    renderAnimationPanel();
    drawAnimationOverlay();
}

function deleteAnimationTrack(animationId) {
    const index = animationState.animations.findIndex(animation => animation.id === animationId);
    if (index === -1) return;
    const [removed] = animationState.animations.splice(index, 1);
    if (animationState.activeAnimationId === animationId) {
        const next = animationState.animations[Math.min(index, animationState.animations.length - 1)];
        if (next) {
            animationState.activeAnimationId = next.id;
            animationState.selectedFrameIds = [...next.frameIds];
            animationState.lastSelectedFrameId = animationState.selectedFrameIds[animationState.selectedFrameIds.length - 1] || null;
            if (next.imagePath) setAnimationActiveImage(next.imagePath, { quiet: true });
        } else {
            animationState.activeAnimationId = null;
            animationState.selectedFrameIds = [];
            animationState.lastSelectedFrameId = null;
        }
        animationState.timelineInsertionIndex = null;
        setTimelineSelection([]);
    }
    animationState.previewStartedAt = performance.now();
    setAnimationStatus(`Deleted ${removed.name || 'animation'}.`);
    renderAnimationPanel();
    drawAnimationOverlay();
    scheduleDefaultAnimationSave('delete-animation');
}

function moveSelectedAnimationFrame(from, to) {
    if (from === to || from < 0 || to < 0 || from >= animationState.selectedFrameIds.length || to >= animationState.selectedFrameIds.length) return;
    const active = getActiveAnimation();
    const [moved] = animationState.selectedFrameIds.splice(from, 1);
    animationState.selectedFrameIds.splice(to, 0, moved);
    if (active) setAnimationFrameIds(active, animationState.selectedFrameIds);
    setTimelineSelection([to]);
    animationState.previewStartedAt = performance.now();
    renderAnimationPanel();
    scheduleDefaultAnimationSave('reorder');
}

function removeSelectedAnimationFrame(index) {
    if (index < 0 || index >= animationState.selectedFrameIds.length) return;
    const removedId = animationState.selectedFrameIds[index];
    animationState.selectedFrameIds.splice(index, 1);
    if (animationState.lastSelectedFrameId === removedId) {
        animationState.lastSelectedFrameId = animationState.selectedFrameIds[animationState.selectedFrameIds.length - 1] || null;
    }
    const active = getActiveAnimation();
    if (active) setAnimationFrameIds(active, animationState.selectedFrameIds);
    else syncActiveAnimationFrames();
    setTimelineSelection([]);
    animationState.previewStartedAt = performance.now();
    setAnimationStatus('Frame removed from timeline.');
    renderAnimationPanel();
    drawAnimationOverlay();
    scheduleDefaultAnimationSave('remove');
}

function renderAnimationPanel() {
    if (!animationTimeline || !animationList) return;

    const active = animationState.animations.find(animation => animation.id === animationState.activeAnimationId);
    if (active) {
        normalizeAnimationFrameSlots(active);
        document.getElementById('animation-name').value = active.name;
        document.getElementById('animation-fps').value = active.fps;
        const durationInput = document.getElementById('animation-timeline-duration');
        if (durationInput) durationInput.value = getAnimationTimelineDuration(active).toFixed(2);
    }

    const frames = getSelectedAnimationFrames();
    const selectedCount = animationState.selectedTimelineIndexes.length;
    document.getElementById('animation-selection-count').textContent = `${frames.length} frame${frames.length === 1 ? '' : 's'}${selectedCount > 0 ? `, ${selectedCount} selected` : ''}`;
    renderAnimationTimebar(frames);
    animationTimeline.innerHTML = '';
    const stripWidth = active ? Math.max(320, getTimelineContentWidth(active)) : 320;
    const strip = document.createElement('div');
    strip.className = 'animation-frame-strip-content';
    strip.style.width = `${stripWidth}px`;
    animationTimeline.appendChild(strip);
    renderFrameStripPlayhead(strip);
    renderAnimationInsertGap(0, strip, active);
    frames.forEach((frame, index) => {
        const chip = document.createElement('div');
        chip.className = `animation-frame-chip${animationState.selectedTimelineIndexes.includes(index) ? ' selected' : ''}`;
        chip.draggable = true;
        chip.dataset.index = index;
        if (active) {
            const centerX = getTimelineXForSlot(active, getTimelineFrameCenterTime(active, index));
            chip.style.left = `${Math.max(0, Math.min(stripWidth - 58, centerX - 29))}px`;
        }
        chip.title = `${frame.imageName} (${frame.x}, ${frame.y}, ${frame.w}x${frame.h})`;
        chip.onclick = event => {
            if (animationState.dragMoved) return;
            selectTimelineFrameIndex(index, event);
            renderAnimationPanel();
        };
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'animation-frame-remove';
        removeButton.textContent = 'x';
        removeButton.title = 'Remove frame';
        removeButton.onclick = event => {
            event.stopPropagation();
            removeSelectedAnimationFrame(index);
        };
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        chip.appendChild(removeButton);
        chip.appendChild(canvas);
        chip.appendChild(document.createTextNode(`#${index + 1}`));
        chip.ondragstart = event => {
            animationState.dragMoved = false;
            chip.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
        };
        chip.ondragenter = () => chip.classList.add('drag-over');
        chip.ondragleave = () => chip.classList.remove('drag-over');
        chip.ondragover = event => {
            animationState.dragMoved = true;
            event.preventDefault();
        };
        chip.ondrop = event => {
            event.preventDefault();
            chip.classList.remove('drag-over');
            const from = parseInt(event.dataTransfer.getData('text/plain'), 10);
            const to = index;
            if (Number.isNaN(from) || from === to) return;
            moveSelectedAnimationFrame(from, to);
        };
        chip.ondragend = () => {
            chip.classList.remove('dragging', 'drag-over');
            setTimeout(() => {
                animationState.dragMoved = false;
            }, 0);
        };
        strip.appendChild(chip);
        drawFrameThumb(canvas, frame);
        renderAnimationInsertGap(index + 1, strip, active);
    });

    renderAnimationTrackList();
}

function renderFrameStripPlayhead(parent = animationTimeline) {
    const active = getActiveAnimation();
    if (!active || !parent) return;
    const line = document.createElement('div');
    line.className = 'animation-frame-playhead';
    const duration = getAnimationTimelineDuration(active);
    const ratio = Math.max(0, Math.min(1, (animationState.timelineCursorSlot || 0) / Math.max(0.0001, duration)));
    line.style.transform = `translateX(${clampTimelineX(active, ratio * getTimelineContentWidth(active), 6)}px)`;
    parent.appendChild(line);
}

function renderAnimationInsertGap(index, parent = animationTimeline, active = getActiveAnimation()) {
    const gap = document.createElement('div');
    gap.className = `animation-insert-gap${animationState.timelineInsertionIndex === index ? ' active' : ''}`;
    if (active) {
        const stripWidth = parent ? parent.clientWidth || getTimelineContentWidth(active) : getTimelineContentWidth(active);
        const time = index >= getTimelineFrameCount(active)
            ? getAnimationTimelineDuration(active)
            : getTimelineFrameStartTime(active, index);
        gap.style.left = `${Math.max(0, Math.min(stripWidth - 10, getTimelineXForSlot(active, time) - 5))}px`;
    }
    gap.title = 'Paste point';
    gap.onclick = () => setTimelineInsertionIndex(index);
    gap.ondragover = event => {
        event.preventDefault();
        gap.classList.add('drag-over');
    };
    gap.ondragleave = () => gap.classList.remove('drag-over');
    gap.ondrop = event => {
        event.preventDefault();
        gap.classList.remove('drag-over');
        const from = parseInt(event.dataTransfer.getData('text/plain'), 10);
        if (Number.isNaN(from)) return;
        const to = from < index ? index - 1 : index;
        moveSelectedAnimationFrame(from, Math.max(0, Math.min(animationState.selectedFrameIds.length - 1, to)));
    };
    parent.appendChild(gap);
}

function renderAnimationTimebar(frames) {
    const timebar = document.getElementById('animation-timebar');
    if (!timebar) return;
    timebar.innerHTML = '';
    const active = getActiveAnimation();
    if (!active || frames.length === 0) {
        timebar.style.display = 'none';
        return;
    }
    timebar.style.display = 'block';
    const duration = getAnimationTimelineDuration(active);
    const fps = getAnimationFps(active);
    const slots = normalizeAnimationFrameSlots(active);
    const contentWidth = getTimelineContentWidth(active);

    const content = document.createElement('div');
    content.className = 'animation-timebar-content';
    content.style.width = `${contentWidth}px`;
    content.onclick = event => {
        const slot = getTimelineSlotFromClientX(active, event.clientX);
        animationState.timelineCursorSlot = slot;
        animationState.timelineInsertionIndex = getTimelineInsertionIndexForSlot(active, slot);
        animationState.previewPausedFrameIndex = getFrameIndexAtSlot(active, slot);
        setPreviewStartForSlot(slot, fps);
        setTimelineSelection([]);
        renderAnimationPanel();
    };
    timebar.appendChild(content);
    if (animationTimeline) timebar.scrollLeft = animationTimeline.scrollLeft;

    const track = document.createElement('div');
    track.className = 'animation-timebar-track';
    content.appendChild(track);

    const pixelsPerSecond = getTimelinePixelsPerSecond(active);
    const minorStep = pixelsPerSecond >= 240 ? 0.1 : (pixelsPerSecond >= 180 ? 0.25 : (pixelsPerSecond >= 100 ? 0.5 : 1));
    for (let value = 0; value <= duration + 0.0001; value += minorStep) {
        const isMajor = Math.abs(value - Math.round(value)) < 0.0001;
        const isHalfSecond = Math.abs((value * 2) - Math.round(value * 2)) < 0.0001;
        const showMinorLabel = !isMajor && pixelsPerSecond >= 180 && isHalfSecond;
        const tick = document.createElement('div');
        tick.className = isMajor || showMinorLabel ? 'animation-timebar-tick' : 'animation-timebar-subtick';
        tick.style.left = `${value * pixelsPerSecond}px`;
        if (isMajor) tick.textContent = `${Math.round(value)}s`;
        else if (showMinorLabel) tick.textContent = `${Math.round((value % 1) * 1000)}ms`;
        content.appendChild(tick);
    }

    const fpsStep = 1 / fps;
    for (let value = 0; value <= duration + 0.0001; value += fpsStep) {
        const tick = document.createElement('div');
        tick.className = 'animation-timebar-frame-tick';
        tick.style.left = `${value * pixelsPerSecond}px`;
        content.appendChild(tick);
    }

    const cursor = document.createElement('div');
    cursor.className = 'animation-timebar-cursor';
    cursor.style.transform = `translateX(${clampTimelineX(active, getTimelineXForSlot(active, animationState.timelineCursorSlot || 0), 1)}px)`;
    content.appendChild(cursor);

    frames.forEach((frame, index) => {
        const marker = document.createElement('div');
        marker.className = `animation-timebar-marker${animationState.selectedTimelineIndexes.includes(index) ? ' selected' : ''}`;
        const startTime = slots[index];
        const endTime = index + 1 >= frames.length ? duration : slots[index + 1];
        marker.style.left = `${getTimelineXForSlot(active, getTimelineFrameCenterTime(active, index))}px`;
        marker.title = `Frame ${index + 1}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`;
        marker.draggable = false;
        marker.onclick = event => {
            event.stopPropagation();
            selectTimelineFrameIndex(index, event);
            renderAnimationPanel();
        };
        content.appendChild(marker);
    });
}

function updateTimelineMarkerSlot(animation, index, clientX) {
    animationState.timelineCursorSlot = getTimelineFrameStartTime(animation, index);
}

function renderAnimationTrackList() {
    if (!animationList) return;
    animationList.innerHTML = '';
    renderAnimationSourceFilter();
    const header = document.createElement('div');
    header.className = 'animation-list-header';
    ['', 'Name', 'FPS', 'File', 'Frames', ''].forEach(text => {
        const cell = document.createElement('span');
        cell.textContent = text;
        header.appendChild(cell);
    });
    animationList.appendChild(header);
    const filter = animationState.animationFilterText.trim().toLowerCase();
    const sourceFilter = animationState.animationSourceFilter;
    animationState.animations
        .filter(animation => {
            const source = getTrackImagePath(animation) || '';
            const sourceName = getAnimationSourceName(animation);
            if (sourceFilter && source !== sourceFilter) return false;
            if (!filter) return true;
            return `${animation.name || ''} ${sourceName}`.toLowerCase().includes(filter);
        })
        .forEach(animation => {
        const item = document.createElement('div');
        item.className = `animation-item${animation.id === animationState.activeAnimationId ? ' active' : ''}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = animation.id === animationState.activeAnimationId;
        checkbox.onchange = event => {
            event.preventDefault();
            selectAnimationTrack(animation.id);
        };
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = animation.name || 'untitled';
        nameInput.onclick = event => event.stopPropagation();
        nameInput.oninput = event => {
            animation.name = event.target.value;
            if (animation.id === animationState.activeAnimationId) document.getElementById('animation-name').value = animation.name;
            scheduleDefaultAnimationSave('rename');
        };
        const fpsInput = document.createElement('input');
        fpsInput.type = 'number';
        fpsInput.min = '0.1';
        fpsInput.max = '60';
        fpsInput.step = '0.1';
        fpsInput.value = animation.fps;
        fpsInput.onclick = event => event.stopPropagation();
        fpsInput.onchange = event => {
            animation.fps = Math.max(0.1, Math.min(60, parseFloat(event.target.value) || animation.fps || 8));
            normalizeAnimationFrameSlots(animation);
            if (animation.id === animationState.activeAnimationId) document.getElementById('animation-fps').value = animation.fps;
            renderAnimationPanel();
            scheduleDefaultAnimationSave('fps');
        };
        const source = document.createElement('span');
        source.className = 'animation-source-name';
        source.title = getTrackImagePath(animation) || '';
        source.textContent = getAnimationSourceName(animation);
        const count = document.createElement('span');
        count.className = 'animation-frame-count';
        count.textContent = `${animation.frameIds.length}`;
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'animation-delete';
        deleteButton.title = `Delete ${animation.name || 'animation'}`;
        deleteButton.textContent = 'x';
        deleteButton.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            deleteAnimationTrack(animation.id);
        };
        item.onclick = () => {
            selectAnimationTrack(animation.id);
        };
        item.appendChild(checkbox);
        item.appendChild(nameInput);
        item.appendChild(fpsInput);
        item.appendChild(source);
        item.appendChild(count);
        item.appendChild(deleteButton);
        animationList.appendChild(item);
    });
}

function renderAnimationSourceFilter() {
    const sourceSelect = document.getElementById('animation-source-filter');
    if (!sourceSelect) return;
    const current = sourceSelect.value;
    const sources = Array.from(new Set(animationState.animations.map(animation => getTrackImagePath(animation)).filter(Boolean)));
    sourceSelect.innerHTML = '<option value="">All sources</option>';
    sources.forEach(sourcePath => {
        const option = document.createElement('option');
        option.value = sourcePath;
        option.textContent = getImageNameFromPath(sourcePath);
        sourceSelect.appendChild(option);
    });
    sourceSelect.value = sources.includes(current) ? current : '';
    animationState.animationSourceFilter = sourceSelect.value;
}

function createEmptyAnimationTrack() {
    syncActiveAnimationFrames();
    const animation = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: getNextAnimationName(),
        fps: getAnimationInputFps(),
        imagePath: animationState.activeImagePath || null,
        frameIds: [],
        frameSlots: [],
        timelineDuration: getDefaultTimelineDurationForFps(getAnimationInputFps()),
        slotsEdited: false
    };
    animationState.animations.push(animation);
    animationState.activeAnimationId = animation.id;
    animationState.selectedFrameIds = [];
    animationState.lastSelectedFrameId = null;
    animationState.timelineInsertionIndex = null;
    setTimelineSelection([]);
    animationState.previewPlaying = true;
    animationState.previewStartedAt = performance.now();
    document.getElementById('btn-animation-play').textContent = 'Pause';
    setAnimationStatus(`New animation: ${animation.name}.`);
    renderAnimationPanel();
    drawAnimationOverlay();
    scheduleDefaultAnimationSave('new-animation');
}

function updateActiveAnimationMeta() {
    const active = animationState.animations.find(animation => animation.id === animationState.activeAnimationId);
    if (!active) return;
    active.name = document.getElementById('animation-name').value;
    const fps = parseFloat(document.getElementById('animation-fps').value);
    if (!Number.isNaN(fps)) {
        active.fps = Math.max(0.1, Math.min(60, fps));
        normalizeAnimationFrameSlots(active);
    }
    renderAnimationTrackList();
    renderAnimationTimebar(getSelectedAnimationFrames());
    scheduleDefaultAnimationSave('meta');
}

function normalizeActiveAnimationMeta() {
    const active = animationState.animations.find(animation => animation.id === animationState.activeAnimationId);
    if (!active) return;
    const fallback = getNextAnimationName();
    active.name = (document.getElementById('animation-name').value || fallback).trim() || fallback;
    active.fps = Math.max(0.1, Math.min(60, parseFloat(document.getElementById('animation-fps').value) || active.fps || 8));
    normalizeAnimationFrameSlots(active);
    renderAnimationPanel();
    scheduleDefaultAnimationSave('meta');
}

function getPreviewFrameSet() {
    const active = animationState.animations.find(animation => animation.id === animationState.activeAnimationId);
    const ids = active ? active.frameIds : animationState.selectedFrameIds;
    const fps = active ? getAnimationFps(active) : getAnimationInputFps();
    const duration = active ? getAnimationTimelineDuration(active) : getDefaultTimelineDurationForFps(fps);
    return {
        animation: active || null,
        frames: ids.map(getFrameById).filter(Boolean),
        fps,
        slots: active ? normalizeAnimationFrameSlots(active) : ids.map((_, index) => ids.length <= 1 ? 0 : (index / ids.length) * duration),
        duration
    };
}

function getPreviewFrameIndex(now = performance.now()) {
    const { frames, duration } = getPreviewFrameSet();
    if (frames.length === 0) return 0;
    const currentSlot = getPreviewCurrentSlot(now);
    if (duration <= 0) return 0;
    return Math.max(0, Math.min(frames.length - 1, Math.floor((currentSlot / duration) * frames.length)));
}

function getPreviewElapsed(now = performance.now()) {
    const { duration } = getPreviewFrameSet();
    const speed = Math.max(0.1, Math.min(4, animationState.previewSpeed || 1));
    return ((now - animationState.previewStartedAt) / 1000) * speed;
}

function getPreviewCurrentSlot(now = performance.now()) {
    const { duration } = getPreviewFrameSet();
    if (duration <= 0) return 0;
    const elapsed = getPreviewElapsed(now);
    if (animationState.previewLooping) return elapsed % duration;
    return Math.min(duration, elapsed);
}

function updateAnimationPlaybackButtons() {
    const playButton = document.getElementById('btn-animation-play');
    if (playButton) playButton.textContent = animationState.previewPlaying ? 'Pause' : 'Play';
    const loopButton = document.getElementById('btn-animation-loop');
    if (loopButton) loopButton.textContent = animationState.previewLooping ? 'Loop: On' : 'Loop: Off';
}

function updateTimelineCursorVisuals(slot) {
    const active = getActiveAnimation();
    if (!active) return;
    animationState.timelineCursorSlot = slot;
    const x = getTimelineXForSlot(active, slot);
    const cursor = document.querySelector('.animation-timebar-cursor');
    if (cursor) cursor.style.transform = `translateX(${clampTimelineX(active, x, 1)}px)`;
    const playhead = document.querySelector('.animation-frame-playhead');
    if (playhead) {
        const duration = getAnimationTimelineDuration(active);
        const ratio = Math.max(0, Math.min(1, slot / Math.max(0.0001, duration)));
        playhead.style.transform = `translateX(${clampTimelineX(active, ratio * getTimelineContentWidth(active), 6)}px)`;
    }
}

function setPreviewStartForSlot(slot, fps) {
    const speed = Math.max(0.1, Math.min(4, animationState.previewSpeed || 1));
    animationState.previewStartedAt = performance.now() - (Math.max(0, slot) / speed) * 1000;
}

function resizeAnimationPreviewCanvas() {
    if (!animationPreview) return;
    const requestedSize = Math.max(64, Math.min(1024, animationState.previewSize || 220));
    const parentWidth = animationPreview.parentElement ? animationPreview.parentElement.clientWidth : requestedSize;
    const cssSize = Math.max(64, Math.min(requestedSize, parentWidth));
    const dpr = window.devicePixelRatio || 1;
    const pixelSize = Math.round(cssSize * dpr);

    if (animationPreview.width !== pixelSize) animationPreview.width = pixelSize;
    if (animationPreview.height !== pixelSize) animationPreview.height = pixelSize;
    animationPreview.style.width = `${cssSize}px`;
    animationPreview.style.height = `${cssSize}px`;
}

function drawAnimationPreview(now = performance.now()) {
    if (!animationPreview) return;
    try {
        resizeAnimationPreviewCanvas();
        const ctx = animationPreview.getContext('2d');
        ctx.clearRect(0, 0, animationPreview.width, animationPreview.height);

        if (animationState.panelOpen) {
            const { frames, duration } = getPreviewFrameSet();
            if (frames.length > 0) {
                if (animationState.previewPlaying && !animationState.previewLooping && getPreviewElapsed(now) >= duration) {
                    animationState.previewPlaying = false;
                    animationState.previewPausedFrameIndex = frames.length - 1;
                    animationState.timelineCursorSlot = duration;
                    updateAnimationPlaybackButtons();
                }
                const currentSlot = animationState.previewPlaying
                    ? getPreviewCurrentSlot(now)
                    : animationState.timelineCursorSlot;
                updateTimelineCursorVisuals(currentSlot);
                const frameIndex = animationState.previewPlaying
                    ? getPreviewFrameIndex(now)
                    : Math.min(animationState.previewPausedFrameIndex, frames.length - 1);
                const frame = frames[frameIndex];
                const img = getFrameImage(frame);
                if (!img) {
                    logAnimationPreviewIssue('waiting-image', frame);
                    return;
                }

                const source = getFrameSourceRect(frame, img);
                if (!source) {
                    logAnimationPreviewIssue('bad-source', frame, {
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight,
                        complete: img.complete
                    });
                    return;
                }

                const scale = Math.min(animationPreview.width / source.w, animationPreview.height / source.h);
                const w = Math.max(1, Math.round(source.w * scale));
                const h = Math.max(1, Math.round(source.h * scale));
                const x = Math.floor((animationPreview.width - w) / 2);
                const y = Math.floor((animationPreview.height - h) / 2);
                ctx.imageSmoothingEnabled = shouldSmoothImages();
                try {
                    ctx.drawImage(img, source.x, source.y, source.w, source.h, x, y, w, h);
                } catch (err) {
                    logAnimationPreviewIssue('draw-failed', frame, {
                        message: err.message,
                        source,
                        complete: img.complete,
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight
                    });
                }
            }
        }
    } catch (err) {
        logAnimationPreviewIssue('loop-failed', null, { message: err.message });
    } finally {
        requestAnimationFrame(drawAnimationPreview);
    }
}
requestAnimationFrame(drawAnimationPreview);

async function copySelectedAnimationFrames() {
    const frames = getSelectedAnimationFrames();
    if (frames.length === 0) return;
    const width = frames.reduce((sum, frame) => sum + frame.w, 0);
    const height = Math.max(...frames.map(frame => frame.h));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = shouldSmoothImages();

    let x = 0;
    frames.forEach(frame => {
        const img = getFrameImage(frame);
        const source = img ? getFrameSourceRect(frame, img) : null;
        if (!img || !source) return;
        ctx.drawImage(img, source.x, source.y, source.w, source.h, x, 0, source.w, source.h);
        x += source.w;
    });

    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setAnimationStatus(`Copied ${frames.length} frame${frames.length === 1 ? '' : 's'}.`);
    } catch (err) {
        console.error(err);
        setAnimationStatus(`Copy failed: ${err.message}`);
    }
}

function getActiveAnimationSourcePath() {
    const active = getActiveAnimation();
    return getTrackImagePath(active) || animationState.activeImagePath || (getWorkspaceImages()[0] ? getWorkspaceImages()[0].dataset.path : null);
}

function getClientSourceInfo(sourcePath) {
    const img = getWorkspaceImageByPath(sourcePath);
    return {
        path: sourcePath,
        name: getImageNameFromPath(sourcePath),
        width: img ? img.naturalWidth : null,
        height: img ? img.naturalHeight : null
    };
}

async function postJson(url, data) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed: ${res.status}`);
    return payload;
}

function exportAnimationState(options = {}) {
    const sourcePath = options.sourcePath || null;
    const source = sourcePath ? getClientSourceInfo(sourcePath) : null;
    const animations = animationState.animations.map(animation => {
        const normalized = filterFrameIdsToSingleImage(animation.frameIds || [], getTrackImagePath(animation));
        if (sourcePath && normalized.imagePath !== sourcePath) return null;
        return {
            name: animation.name,
            fps: animation.fps,
            imagePath: normalized.imagePath || null,
            timelineDuration: getAnimationTimelineDuration(animation),
            frames: normalized.frameIds.map((frameId, index) => {
                const frame = getFrameById(frameId);
                return frame ? {
                    id: frame.id,
                    imagePath: frame.imagePath,
                    index: frame.index,
                    row: frame.row,
                    col: frame.col,
                    time: normalizeAnimationFrameSlots(animation)[index],
                    bounds: { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
                } : null;
            }).filter(Boolean)
        };
    }).filter(animation => animation && animation.frames.length > 0);

    return {
        version: 2,
        source,
        images: Array.from(animationState.splits.values()).map(split => ({
            path: split.imagePath,
            width: split.imageWidth,
            height: split.imageHeight,
            split: split.split,
            frames: split.frames.map(frame => ({
                id: frame.id,
                index: frame.index,
                row: frame.row,
                col: frame.col,
                bounds: { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
            }))
        })).filter(image => !sourcePath || image.path === sourcePath),
        animations
    };
}

function saveAnimationJson() {
    const data = exportAnimationState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sprite-animations.json';
    link.click();
    URL.revokeObjectURL(link.href);
}

function resolveAnimationConflict(name, state) {
    if (state.mode === 'yesAll') return 'replace';
    if (state.mode === 'noAll') return 'skip';
    const answer = prompt(`Animation "${name}" already exists. Replace it? Type y, n, ya, or na.`, 'y');
    const normalized = (answer || '').trim().toLowerCase();
    if (normalized === 'ya') {
        state.mode = 'yesAll';
        return 'replace';
    }
    if (normalized === 'na') {
        state.mode = 'noAll';
        return 'skip';
    }
    return normalized === 'y' || normalized === 'yes' ? 'replace' : 'skip';
}

function importAnimationState(data, options = {}) {
    if (!data || !Array.isArray(data.images)) throw new Error('Unsupported animation JSON.');
    const targetSourcePath = options.sourcePath || (data.source && data.source.path) || getActiveAnimationSourcePath();
    if (!targetSourcePath) throw new Error('No target image selected.');
    const replaceAll = Boolean(options.replaceAll);
    if (replaceAll) {
        animationState.splits.delete(targetSourcePath);
        animationState.animations = animationState.animations.filter(animation => getTrackImagePath(animation) !== targetSourcePath);
    }
    animationState.selectedFrameIds = [];
    animationState.lastSelectedFrameId = null;
    animationState.selectedTimelineIndexes = [];
    animationState.lastSelectedTimelineIndex = null;
    animationState.timelineInsertionIndex = null;
    animationState.frameClipboard = [];
    animationState.previewLogKeys.clear();
    let skippedImages = 0;
    let skippedFrames = 0;

    data.images.forEach(image => {
        const imagePath = targetSourcePath;
        const img = getWorkspaceImageByPath(imagePath);
        if (!img || !Array.isArray(image.frames)) {
            skippedImages += 1;
            return;
        }
        const splitData = {
            imagePath,
            imageName: imagePath.split('/').pop(),
            imageWidth: image.width || img.naturalWidth,
            imageHeight: image.height || img.naturalHeight,
            split: image.split || { mode: 'auto' },
            frames: image.frames.map((frame, index) => {
                const bounds = frame.bounds || frame;
                return {
                    id: makeFrameId(imagePath, index),
                    imagePath,
                    imageName: imagePath.split('/').pop(),
                    x: bounds.x,
                    y: bounds.y,
                    w: bounds.w,
                    h: bounds.h,
                    row: frame.row || 0,
                    col: frame.col || index,
                    index
                };
            })
        };
        animationState.splits.set(imagePath, splitData);
    });

    const conflictState = { mode: null };
    let importedCount = 0;
    if (Array.isArray(data.animations)) {
        data.animations.forEach(animation => {
            const rawFrames = Array.isArray(animation.frames) ? animation.frames : [];
            const frameIds = rawFrames.map(frame => {
                if (Number.isFinite(frame.index)) return makeFrameId(targetSourcePath, frame.index);
                const bounds = frame.bounds || {};
                const split = animationState.splits.get(targetSourcePath);
                const index = split ? split.frames.findIndex(candidate => candidate.x === bounds.x && candidate.y === bounds.y && candidate.w === bounds.w && candidate.h === bounds.h) : -1;
                return index >= 0 ? makeFrameId(targetSourcePath, index) : null;
            }).filter(Boolean);
            if (frameIds.length === 0) {
                skippedFrames += rawFrames.length;
                return;
            }
            const existingIndex = animationState.animations.findIndex(candidate => getTrackImagePath(candidate) === targetSourcePath && candidate.name === animation.name);
            if (existingIndex !== -1 && !replaceAll) {
                const action = resolveAnimationConflict(animation.name || 'animation', conflictState);
                if (action === 'skip') return;
                animationState.animations.splice(existingIndex, 1);
            }
            const imported = {
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: animation.name || 'animation',
                fps: Math.max(0.1, Math.min(60, parseFloat(animation.fps) || 8)),
                imagePath: targetSourcePath,
                frameIds,
                frameSlots: [],
                timelineDuration: getDefaultTimelineDurationForFps(parseFloat(animation.fps) || 8),
                slotsEdited: false
            };
            normalizeAnimationFrameSlots(imported);
            animationState.animations.push(imported);
            importedCount += 1;
        });
        const active = animationState.animations.find(animation => getTrackImagePath(animation) === targetSourcePath);
        if (active) selectAnimationTrack(active.id);
    }
    const targetSplit = animationState.splits.get(targetSourcePath);
    if (targetSplit) applySplitSettingsToInputs(targetSplit.split || {});

    const skipped = skippedImages + skippedFrames;
    const skipLabel = skipped > 0 ? ` Skipped ${skipped} missing or mixed reference${skipped === 1 ? '' : 's'}.` : '';
    setAnimationStatus(`Loaded ${importedCount} animation${importedCount === 1 ? '' : 's'}.${skipLabel}`);
    renderAnimationPanel();
    drawAnimationOverlay();
    if (options.saveDefault !== false) scheduleDefaultAnimationSave('import');
}

async function loadAnimationJson(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    importAnimationState(data, {
        sourcePath: getActiveAnimationSourcePath(),
        replaceAll: !Array.isArray(data.animations) || data.animations.length === 0,
        saveDefault: true
    });
}

function scheduleDefaultAnimationSave(reason = 'edit') {
    if (animationState.loadingDefaultAnimation) return;
    const sourcePath = getActiveAnimationSourcePath();
    if (!sourcePath) return;
    if (animationState.autoSaveTimer) clearTimeout(animationState.autoSaveTimer);
    animationState.autoSaveTimer = setTimeout(() => {
        saveDefaultAnimation(sourcePath, reason).catch(err => setAnimationStatus(`Auto-save failed: ${err.message}`));
    }, 700);
}

async function saveDefaultAnimation(sourcePath = getActiveAnimationSourcePath(), reason = 'edit') {
    if (!sourcePath) return false;
    const data = exportAnimationState({ sourcePath });
    if (data.animations.length === 0 && data.images.length === 0) return false;
    const source = getClientSourceInfo(sourcePath);
    await postJson('/api/animation-default', {
        sourcePath,
        source,
        animationData: data
    });
    setAnimationStatus(`Saved animation data for ${source.name}.`);
    return true;
}

async function loadDefaultAnimationForImage(imagePath) {
    const img = getWorkspaceImageByPath(imagePath);
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return false;
    try {
        const query = new URLSearchParams({
            path: imagePath,
            width: String(img.naturalWidth),
            height: String(img.naturalHeight)
        });
        const res = await fetch(`/api/animation-default?${query}`);
        const payload = await res.json();
        if (!payload.found || !payload.data) return false;
        animationState.loadingDefaultAnimation = true;
        importAnimationState(payload.data, {
            sourcePath: imagePath,
            replaceAll: true,
            saveDefault: false
        });
        animationState.loadingDefaultAnimation = false;
        setAnimationStatus(`Loaded saved animation for ${getImageNameFromPath(imagePath)} (${payload.matchedBy}).`);
        return true;
    } catch (err) {
        animationState.loadingDefaultAnimation = false;
        setAnimationStatus(`Saved animation load skipped: ${err.message}`);
        return false;
    }
}

function applySplitSettingsToInputs(split = {}) {
    const modeInput = document.querySelector(`input[name="animation-split-mode"][value="${split.mode || 'auto'}"]`);
    if (modeInput) modeInput.checked = true;
    if (split.cellWidth) document.getElementById('animation-cell-width').value = split.cellWidth;
    if (split.cellHeight) document.getElementById('animation-cell-height').value = split.cellHeight;
    document.getElementById('animation-padding-x').value = Math.max(0, parseInt(split.paddingX, 10) || 0);
    document.getElementById('animation-padding-y').value = Math.max(0, parseInt(split.paddingY, 10) || 0);
    updateAnimationCellCountsFromPixels({ preserveSource: true, quiet: true });
}

async function saveAnimationTemplate() {
    const sourcePath = getActiveAnimationSourcePath();
    if (!sourcePath) return setAnimationStatus('Open an image before saving a template.');
    const data = exportAnimationState({ sourcePath });
    if (data.animations.length === 0) return setAnimationStatus('No animations to save as template.');
    const name = (prompt('Template name:', getImageNameFromPath(sourcePath).replace(/\.[^.]+$/, '')) || '').trim();
    if (!name) return;
    await postJson('/api/template', {
        name,
        sourcePath,
        source: getClientSourceInfo(sourcePath),
        templateData: data
    });
    setAnimationStatus(`Saved template ${name}.`);
}

async function applyAnimationTemplate() {
    const sourcePath = getActiveAnimationSourcePath();
    const img = sourcePath ? getWorkspaceImageByPath(sourcePath) : null;
    if (!sourcePath || !img) return setAnimationStatus('Open an image before applying a template.');
    const listRes = await fetch('/api/templates');
    const listPayload = await listRes.json();
    const templates = listPayload.templates || [];
    if (templates.length === 0) return setAnimationStatus('No templates saved yet.');
    const templateNames = templates.map(template => template.name).join(', ');
    const name = (prompt(`Template name (${templateNames}):`, templates[0].name) || '').trim();
    if (!name) return;
    const res = await fetch(`/api/template?${new URLSearchParams({ name })}`);
    if (!res.ok) throw new Error('Template not found.');
    const data = await res.json();
    const source = data.source || {};
    if (source.width && source.height && (Number(source.width) !== img.naturalWidth || Number(source.height) !== img.naturalHeight)) {
        setAnimationStatus(`Template skipped. Needs ${source.width}x${source.height}, current is ${img.naturalWidth}x${img.naturalHeight}.`);
        return;
    }
    const currentSplit = animationState.splits.get(sourcePath);
    const nextSplit = data.images && data.images[0] ? data.images[0].split || {} : {};
    const splitDiffers = currentSplit && JSON.stringify(currentSplit.split || {}) !== JSON.stringify(nextSplit || {});
    const hasExisting = animationState.animations.some(animation => getTrackImagePath(animation) === sourcePath);
    if (splitDiffers || hasExisting) {
        const currentLabel = currentSplit ? JSON.stringify(currentSplit.split || {}) : 'none';
        const nextLabel = JSON.stringify(nextSplit || {});
        const warning = splitDiffers
            ? `Current split ${currentLabel}\nTemplate split ${nextLabel}\n\nApply template "${name}" and replace current split/animations for ${getImageNameFromPath(sourcePath)}?`
            : `Apply template "${name}" and replace current animations for ${getImageNameFromPath(sourcePath)}?`;
        if (!confirm(warning)) return;
    }
    importAnimationState(data, { sourcePath, replaceAll: true, saveDefault: true });
    applySplitSettingsToInputs(nextSplit);
}

function medianNumber(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    return sorted[Math.floor(sorted.length / 2)];
}

function filterEstimateFrames(frames) {
    if (frames.length <= 1) return frames;
    const maxArea = Math.max(...frames.map(frame => frame.w * frame.h));
    const maxWidth = Math.max(...frames.map(frame => frame.w));
    const maxHeight = Math.max(...frames.map(frame => frame.h));
    const significant = frames.filter(frame => {
        const area = frame.w * frame.h;
        return area >= maxArea * 0.18 && frame.w >= maxWidth * 0.35 && frame.h >= maxHeight * 0.35;
    });
    return significant.length > 0 ? significant : frames.filter(frame => frame.w * frame.h >= maxArea * 0.1);
}

function groupFramesByAxis(frames, axis, tolerance = null) {
    const key = axis === 'x' ? 'x' : 'y';
    const size = axis === 'x' ? 'w' : 'h';
    const resolvedTolerance = tolerance || Math.max(4, medianNumber(frames.map(frame => frame[size])) * 0.55);
    const groups = [];
    frames.slice().sort((a, b) => a[key] - b[key]).forEach(frame => {
        const center = frame[key] + frame[size] / 2;
        let group = groups.find(candidate => Math.abs(candidate.center - center) <= resolvedTolerance);
        if (!group) {
            group = { center, frames: [] };
            groups.push(group);
        }
        group.frames.push(frame);
        group.center = group.frames.reduce((sum, item) => sum + item[key] + item[size] / 2, 0) / group.frames.length;
    });
    return groups;
}

async function estimateAnimationSplit() {
    const img = ensureAnimationActiveImage();
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return setAnimationStatus('Open a loaded focused image first.');
    setAnimationStatus(`Estimating split for ${getImageNameFromPath(img.dataset.path)}...`);
    const result = await splitImageInWorker(img, 'auto', 1, 1, 0, 0);
    const frames = result.frames || [];
    if (frames.length === 0) return setAnimationStatus('Estimate found no frames.');
    const significantFrames = filterEstimateFrames(frames);
    const rowGroups = groupFramesByAxis(significantFrames, 'y');
    const columnGroups = groupFramesByAxis(significantFrames, 'x');
    const countX = Math.max(1, columnGroups.length);
    const countY = Math.max(1, rowGroups.length);
    document.getElementById('animation-cell-count-x').value = countX;
    document.getElementById('animation-cell-count-y').value = countY;
    document.getElementById('animation-padding-x').value = 0;
    document.getElementById('animation-padding-y').value = 0;
    updateAnimationCellPixelsFromCounts({ preserveSource: true, quiet: true });
    const gridModeInput = document.querySelector('input[name="animation-split-mode"][value="grid"]');
    if (gridModeInput) gridModeInput.checked = true;
    setAnimationStatus(`Estimate: ${countX} cols x ${countY} rows from ${significantFrames.length}/${frames.length} auto frames. Review fields, then Apply.`);
}

document.getElementById('btn-animation').onclick = () => {
    animationState.panelOpen = !animationState.panelOpen;
    if (animationState.panelOpen) {
        animationState.panelCollapsed = false;
        animationState.previewPlaying = true;
        animationState.previewStartedAt = performance.now();
        animationState.previewPausedFrameIndex = 0;
        document.getElementById('btn-animation-play').textContent = 'Pause';
        ensureAnimationActiveImage();
    }
    animationPanel.classList.toggle('open', animationState.panelOpen);
    document.getElementById('btn-animation').style.background = animationState.panelOpen ? 'var(--primary-color)' : '';
    applyAnimationPanelLayout();
    updateAnimationFocusUi();
    drawAnimationOverlay();
};
document.getElementById('btn-animation-close').onclick = () => {
    animationState.panelOpen = false;
    animationState.panelCollapsed = false;
    animationPanel.classList.remove('open');
    document.getElementById('btn-animation').style.background = '';
    applyAnimationPanelLayout();
    updateAnimationFocusUi();
    drawAnimationOverlay();
};
document.getElementById('btn-animation-collapse').onclick = () => {
    animationState.panelCollapsed = true;
    applyAnimationPanelLayout();
};
document.getElementById('btn-animation-expand').onclick = () => {
    animationState.panelCollapsed = false;
    applyAnimationPanelLayout();
};
document.getElementById('btn-animation-apply').onclick = applyAnimationSplit;
document.getElementById('btn-animation-estimate').onclick = () => estimateAnimationSplit().catch(err => setAnimationStatus(`Estimate failed: ${err.message}`));
document.getElementById('animation-cell-count-x').oninput = updateAnimationCellPixelsFromCounts;
document.getElementById('animation-cell-count-y').oninput = updateAnimationCellPixelsFromCounts;
document.getElementById('animation-cell-width').oninput = updateAnimationCellCountsFromPixels;
document.getElementById('animation-cell-height').oninput = updateAnimationCellCountsFromPixels;
document.getElementById('animation-padding-x').oninput = () => updateAnimationCellCountsFromPixels({ preserveSource: true });
document.getElementById('animation-padding-y').oninput = () => updateAnimationCellCountsFromPixels({ preserveSource: true });
document.getElementById('animation-split-target').value = animationState.splitTarget;
document.getElementById('animation-split-target').onchange = (event) => {
    animationState.splitTarget = event.target.value;
    localStorage.setItem('animationSplitTarget', animationState.splitTarget);
    updateAnimationFocusUi();
    if (animationState.cellSizeSource === 'counts') updateAnimationCellPixelsFromCounts({ preserveSource: true, quiet: true });
    else updateAnimationCellCountsFromPixels({ preserveSource: true, quiet: true });
};
document.getElementById('animation-track-filter').oninput = (event) => {
    animationState.animationFilterText = event.target.value;
    renderAnimationTrackList();
};
document.getElementById('animation-source-filter').onchange = (event) => {
    animationState.animationSourceFilter = event.target.value;
    renderAnimationTrackList();
};
const animationTimelineDurationInput = document.getElementById('animation-timeline-duration');
if (animationTimelineDurationInput) {
    animationTimelineDurationInput.readOnly = true;
    animationTimelineDurationInput.title = 'Auto duration from FPS: 1s at FPS >= 1, otherwise 1/FPS seconds.';
}
document.getElementById('animation-timeline-zoom').value = animationState.timelineZoom;
document.getElementById('animation-timeline-zoom').oninput = (event) => {
    animationState.timelineZoom = Math.max(1, Math.min(8, parseFloat(event.target.value) || 1));
    localStorage.setItem('animationTimelineZoom', animationState.timelineZoom);
    renderAnimationPanel();
};
document.getElementById('animation-timebar').addEventListener('wheel', (event) => {
    event.preventDefault();
    const nextZoom = animationState.timelineZoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15);
    animationState.timelineZoom = Math.max(1, Math.min(8, nextZoom));
    document.getElementById('animation-timeline-zoom').value = animationState.timelineZoom;
    localStorage.setItem('animationTimelineZoom', animationState.timelineZoom);
    renderAnimationPanel();
}, { passive: false });
animationTimeline.addEventListener('scroll', () => {
    const timebar = document.getElementById('animation-timebar');
    if (timebar && timebar.scrollLeft !== animationTimeline.scrollLeft) {
        timebar.scrollLeft = animationTimeline.scrollLeft;
    }
});
document.getElementById('btn-animation-new').onclick = createEmptyAnimationTrack;
document.getElementById('animation-name').oninput = updateActiveAnimationMeta;
document.getElementById('animation-fps').oninput = updateActiveAnimationMeta;
document.getElementById('animation-name').onchange = normalizeActiveAnimationMeta;
document.getElementById('animation-fps').onchange = normalizeActiveAnimationMeta;
document.getElementById('btn-animation-save').onclick = saveAnimationJson;
document.getElementById('btn-animation-load').onclick = () => document.getElementById('animation-load-input').click();
document.getElementById('btn-animation-save-template').onclick = () => saveAnimationTemplate().catch(err => setAnimationStatus(`Template save failed: ${err.message}`));
document.getElementById('btn-animation-apply-template').onclick = () => applyAnimationTemplate().catch(err => setAnimationStatus(`Template apply failed: ${err.message}`));
document.getElementById('animation-load-input').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        await loadAnimationJson(file);
    } catch (err) {
        setAnimationStatus(`Load failed: ${err.message}`);
    } finally {
        event.target.value = '';
    }
};
document.getElementById('btn-animation-play').onclick = () => {
    if (animationState.previewPlaying) {
        animationState.previewPausedFrameIndex = getPreviewFrameIndex();
        animationState.timelineCursorSlot = getPreviewCurrentSlot();
        animationState.previewPlaying = false;
    } else {
        const { frames, fps } = getPreviewFrameSet();
        animationState.previewPlaying = true;
        if (frames.length > 0) {
            const active = getActiveAnimation();
            const duration = active ? getAnimationTimelineDuration(active) : getDefaultTimelineDurationForFps(fps);
            const slots = active ? normalizeAnimationFrameSlots(active) : frames.map((_, index) => frames.length <= 1 ? 0 : (index / frames.length) * duration);
            if (!animationState.previewLooping && animationState.timelineCursorSlot >= duration) {
                animationState.previewPausedFrameIndex = 0;
                animationState.timelineCursorSlot = 0;
            }
            setPreviewStartForSlot(slots[animationState.previewPausedFrameIndex % frames.length] || 0, fps);
        } else {
            animationState.previewStartedAt = performance.now();
        }
    }
    updateAnimationPlaybackButtons();
};
document.getElementById('btn-animation-loop').onclick = () => {
    animationState.previewLooping = !animationState.previewLooping;
    localStorage.setItem('animationPreviewLooping', String(animationState.previewLooping));
    if (animationState.previewPlaying) animationState.previewStartedAt = performance.now();
    else if (!animationState.previewLooping) {
        animationState.previewPausedFrameIndex = 0;
        animationState.timelineCursorSlot = 0;
    }
    updateAnimationPlaybackButtons();
};
updateAnimationPlaybackButtons();
document.getElementById('animation-preview-size').value = animationState.previewSize;
document.getElementById('animation-preview-size').oninput = (e) => {
    animationState.previewSize = Math.max(64, Math.min(1024, parseInt(e.target.value, 10) || 220));
    localStorage.setItem('animationPreviewSize', animationState.previewSize);
    resizeAnimationPreviewCanvas();
};
document.getElementById('animation-preview-speed').value = animationState.previewSpeed;
document.getElementById('animation-preview-speed').onchange = (e) => {
    animationState.previewSpeed = Math.max(0.1, Math.min(4, parseFloat(e.target.value) || 1));
    e.target.value = animationState.previewSpeed;
    localStorage.setItem('animationPreviewSpeed', animationState.previewSpeed);
    animationState.previewStartedAt = performance.now();
};

let isResizingAnimationPanel = false;
document.getElementById('animation-panel-resizer').addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizingAnimationPanel = true;
    animationState.panelCollapsed = false;
    document.body.classList.add('is-resizing-animation-panel');
});
window.addEventListener('mousemove', (e) => {
    if (!isResizingAnimationPanel) return;
    const rect = imgContainer.getBoundingClientRect();
    const maxWidth = Math.max(260, Math.floor(rect.width * 0.8));
    animationState.panelWidth = Math.min(maxWidth, Math.max(260, Math.round(rect.right - e.clientX)));
    localStorage.setItem('animationPanelWidth', animationState.panelWidth);
    applyAnimationPanelLayout();
});
window.addEventListener('mouseup', () => {
    if (!isResizingAnimationPanel) return;
    isResizingAnimationPanel = false;
    document.body.classList.remove('is-resizing-animation-panel');
    scheduleImageOverlayRefresh();
});

applyAnimationListHeight();
let isResizingAnimationList = false;
let animationListResizeStartY = 0;
let animationListResizeStartHeight = 0;
document.getElementById('animation-list-resizer').addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizingAnimationList = true;
    animationListResizeStartY = e.clientY;
    animationListResizeStartHeight = animationState.animationListHeight;
});
window.addEventListener('mousemove', (e) => {
    if (!isResizingAnimationList) return;
    animationState.animationListHeight = Math.max(78, Math.min(420, animationListResizeStartHeight + (e.clientY - animationListResizeStartY)));
    localStorage.setItem('animationListHeight', animationState.animationListHeight);
    applyAnimationListHeight();
});
window.addEventListener('mouseup', () => {
    isResizingAnimationList = false;
});

function clearAnimationWorkspace() {
    animationState.splits.clear();
    animationState.selectedFrameIds = [];
    animationState.lastSelectedFrameId = null;
    animationState.animations = [];
    animationState.activeAnimationId = null;
    animationState.activeImagePath = null;
    animationState.previewPlaying = true;
    animationState.previewStartedAt = performance.now();
    animationState.previewPausedFrameIndex = 0;
    animationState.previewLogKeys.clear();
    document.getElementById('btn-animation-play').textContent = 'Pause';
    updateAnimationFocusUi();
    renderAnimationPanel();
    drawAnimationOverlay();
}

function clearOverlays() {
    svgLine.style.display = 'none';
    svgText.style.display = 'none';
    svgBg.style.display = 'none';
    const selBox = document.getElementById('select-box');
    if (selBox) selBox.style.display = 'none';
}

function getImagePixelPointAt(clientX, clientY) {
    const img = getWorkspaceImageAt(clientX, clientY);
    if (!img) return null;

    const rect = img.getBoundingClientRect();
    return {
        imagePath: img.dataset.path,
        x: ((clientX - rect.left) / rect.width) * (img.naturalWidth || rect.width),
        y: ((clientY - rect.top) / rect.height) * (img.naturalHeight || rect.height)
    };
}

function measureDistancePx(startPoint, endPoint, fallbackDx, fallbackDy) {
    if (startPoint && endPoint && startPoint.imagePath === endPoint.imagePath) {
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        return { value: Math.sqrt(dx * dx + dy * dy), label: 'px' };
    }

    return { value: Math.sqrt(fallbackDx * fallbackDx + fallbackDy * fallbackDy) / imgScale, label: ' view px' };
}

function updateImageTransform() {
    wsCanvas.style.transform = `translate(calc(-50% + ${imgTx}px), calc(-50% + ${imgTy}px)) scale(${imgScale})`;
    zoomInput.value = Math.round(imgScale * 100);
    drawRulers();
    clearOverlays();
    drawAnimationOverlay();
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
    scheduleImageOverlayRefresh();
});

if (window.ResizeObserver) {
    const imageViewObserver = new ResizeObserver(scheduleImageOverlayRefresh);
    imageViewObserver.observe(imgContainer);
    imageViewObserver.observe(wsCanvas);
}

imgContainer.addEventListener('wheel', (e) => {
    if (animationPanel && animationPanel.contains(e.target)) return;
    e.preventDefault();
    // Prevent delayed wheel/trackpad events from zooming while a pan is active.
    if (isDragging || e.buttons !== 0 || performance.now() < suppressZoomUntil) return;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomImageAt(e.clientX, e.clientY, imgScale * zoomFactor);
});

function hideImageResolutionTooltip() {
    if (imageResolutionTimer) clearTimeout(imageResolutionTimer);
    imageResolutionTimer = null;
    imageResolutionHover = null;
    if (imageResolutionTooltip) imageResolutionTooltip.style.display = 'none';
}

function updateImageResolutionTooltip(e) {
    if (!imageResolutionTooltip || isDragging || isMeasuring) {
        hideImageResolutionTooltip();
        return;
    }

    const img = getWorkspaceImageAt(e.clientX, e.clientY);
    if (!img) {
        hideImageResolutionTooltip();
        return;
    }

    const rect = imgContainer.getBoundingClientRect();
    const hover = {
        imagePath: img.dataset.path,
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top + 12,
        width: img.naturalWidth || Math.round(img.getBoundingClientRect().width),
        height: img.naturalHeight || Math.round(img.getBoundingClientRect().height)
    };
    imageResolutionHover = hover;
    imageResolutionTooltip.style.left = `${hover.x}px`;
    imageResolutionTooltip.style.top = `${hover.y}px`;

    if (imageResolutionTooltip.style.display === 'block' && imageResolutionTooltip.dataset.path === hover.imagePath) return;

    if (imageResolutionTimer) clearTimeout(imageResolutionTimer);
    imageResolutionTimer = setTimeout(() => {
        if (!imageResolutionHover) return;
        imageResolutionTooltip.dataset.path = imageResolutionHover.imagePath;
        imageResolutionTooltip.textContent = `${imageResolutionHover.width} x ${imageResolutionHover.height}px`;
        imageResolutionTooltip.style.left = `${imageResolutionHover.x}px`;
        imageResolutionTooltip.style.top = `${imageResolutionHover.y}px`;
        imageResolutionTooltip.style.display = 'block';
    }, 600);
}

imgContainer.addEventListener('mousemove', updateImageResolutionTooltip);
imgContainer.addEventListener('mouseleave', hideImageResolutionTooltip);

// Block middle-mouse autoscroll globally which causes 'stuck' movement native to Chrome/Windows
window.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
}, { passive: false });

imgContainer.addEventListener('mousedown', (e) => {
    if (animationPanel && animationPanel.contains(e.target)) return;
    e.preventDefault();
    const clickedImg = getWorkspaceImageAt(e.clientX, e.clientY);
    if (clickedImg) setAnimationActiveImage(clickedImg.dataset.path, { quiet: true });
    if (e.button === 0 && animationState.panelOpen && animationState.splits.size > 0) {
        const frame = findAnimationFrameAt(e.clientX, e.clientY);
        if (frame) {
            selectAnimationFrame(frame, {
                multi: e.ctrlKey || e.metaKey,
                range: e.shiftKey
            });
            return;
        }
    }
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
        mStartImagePoint = activeTool === 'measure' ? getImagePixelPointAt(e.clientX, e.clientY) : null;
        
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
            const currentImagePoint = getImagePixelPointAt(e.clientX, e.clientY);
            const dist = measureDistancePx(mStartImagePoint, currentImagePoint, dx, dy);
            
            svgText.textContent = `${Math.round(dist.value)}${dist.label}`;
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
    isDragging = false; isMeasuring = false; mStartImagePoint = null;
    suppressZoomUntil = performance.now() + 250;
    if (activeTool === 'pan') imgContainer.style.cursor = 'grab';
});

// Keyboard controls
window.addEventListener('keydown', (e) => {
    if (elImageView.style.display !== 'flex') return;
    const targetTag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (['input', 'select', 'textarea'].includes(targetTag) || e.target.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (!copyTimelineSelection(false) && animationState.selectedFrameIds.length > 0) copySelectedAnimationFrames();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        copyTimelineSelection(true);
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteTimelineClipboard();
        return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && animationState.selectedTimelineIndexes.length > 0) {
        e.preventDefault();
        removeTimelineIndexes(animationState.selectedTimelineIndexes);
        return;
    }

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
