const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');
const CACHE_FILE = path.join(__dirname, '.asset-browser-cache.json');

const configPath = path.join(__dirname, 'config.json');
let config = { rootPath: path.resolve(__dirname, '..') };
try {
    if (fs.existsSync(configPath)) {
        const u = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (u.rootPath && fs.existsSync(u.rootPath)) config.rootPath = u.rootPath;
    }
} catch(e) {}

let ASSETS_DIR = config.rootPath;
const DEBUG_LOGS = process.env.ASSET_BROWSER_DEBUG === '1';

const MIME_TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.opus': 'audio/ogg; codecs=opus', '.m4a': 'audio/mp4', '.wma': 'audio/x-ms-wma', '.aac': 'audio/aac', '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown' };
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aif', '.aiff', '.opus', '.m4a', '.wma', '.aac']);
const TEXT_EXTS = new Set(['.txt', '.md']);

function getFileType(name, ext) {
    const lowerName = name.toLowerCase();
    if (IMAGE_EXTS.has(ext)) return 'image';
    if (AUDIO_EXTS.has(ext)) return 'audio';
    if (TEXT_EXTS.has(ext) || lowerName.includes('readme') || lowerName.includes('license')) return 'text';
    return 'unknown';
}

async function scanAssets(basePath, subPath = '', currentDepth = 0, maxDepth = Infinity) {
    const target = path.join(basePath, subPath);
    let folders = [], files = [];

    try {
        const items = await fs.promises.readdir(target, { withFileTypes: true });
        for (const item of items) {
            if (subPath === '' && item.name === 'asset_browser') continue;
            if (item.name.startsWith('.')) continue;

            const itemPath = path.join(target, item.name);
            const relPath = path.join(subPath, item.name).replace(/\\/g, '/');

            try {
                const stats = await fs.promises.stat(itemPath);
                if (item.isDirectory()) {
                    folders.push({ name: item.name, path: relPath, size: stats.size, type: 'folder' });
                    if (currentDepth < maxDepth) {
                        const sub = await scanAssets(basePath, relPath, currentDepth + 1, maxDepth);
                        folders.push(...sub.folders);
                        files.push(...sub.files);
                    }
                } else {
                    const ext = path.extname(item.name).toLowerCase();
                    files.push({ name: item.name, path: relPath, size: stats.size, type: getFileType(item.name, ext), ext: ext });
                }
            } catch(e) {}
        }
    } catch(e) {}
    return { folders, files };
}

function pathDepthFrom(baseDir, relPath) {
    const prefix = baseDir ? baseDir + '/' : '';
    if (prefix && !relPath.startsWith(prefix)) return null;
    const remainder = prefix ? relPath.slice(prefix.length) : relPath;
    if (!remainder) return null;
    return remainder.split('/').length - 1;
}

function filterIndex(index, queryDir, maxDepth) {
    return {
        folders: index.folders.filter(item => {
            const depth = pathDepthFrom(queryDir, item.path);
            return depth !== null && depth <= maxDepth;
        }),
        files: index.files.filter(item => {
            const depth = pathDepthFrom(queryDir, item.path);
            return depth !== null && depth <= maxDepth;
        })
    };
}

function readAssetCache() {
    try {
        if (!fs.existsSync(CACHE_FILE)) return null;
        const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (cache.rootPath !== ASSETS_DIR) return null;
        return cache;
    } catch(e) {
        return null;
    }
}

async function buildAssetCache() {
    const index = await scanAssets(ASSETS_DIR, '', 0, Infinity);
    const cache = {
        rootPath: ASSETS_DIR,
        createdAt: new Date().toISOString(),
        folders: index.folders,
        files: index.files
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    return cache;
}

function loadFavorites() {
    return loadFavoritesForRoot(ASSETS_DIR);
}

function saveFavorites(favs) {
    saveFavoritesForRoot(ASSETS_DIR, favs);
}

function favoriteRootKey(rootPath) {
    const resolved = path.resolve(rootPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readFavoritesStore() {
    try {
        if (fs.existsSync(FAVORITES_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
            if (Array.isArray(parsed)) {
                return { version: 2, roots: { [favoriteRootKey(ASSETS_DIR)]: parsed } };
            }
            if (parsed && parsed.roots && typeof parsed.roots === 'object') {
                return parsed;
            }
        }
    } catch(e) {}
    return { version: 2, roots: {} };
}

function writeFavoritesStore(store) {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function loadFavoritesForRoot(rootPath) {
    const store = readFavoritesStore();
    const favs = store.roots[favoriteRootKey(rootPath)];
    return Array.isArray(favs) ? favs : [];
}

function saveFavoritesForRoot(rootPath, favs) {
    const store = readFavoritesStore();
    store.roots[favoriteRootKey(rootPath)] = Array.isArray(favs) ? favs : [];
    writeFavoritesStore(store);
}

function isPathInside(rootPath, targetPath) {
    const rel = path.relative(path.resolve(rootPath), path.resolve(targetPath));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function areRelatedRoots(a, b) {
    return isPathInside(a, b) || isPathInside(b, a);
}

function dedupeFavorites(favs) {
    const seen = new Set();
    return favs.filter(fav => {
        if (!fav || !fav.path || seen.has(fav.path)) return false;
        seen.add(fav.path);
        return true;
    });
}

function moveFavoritesForRootChange(oldRoot, newRoot) {
    const currentFavs = loadFavoritesForRoot(oldRoot);
    saveFavoritesForRoot(oldRoot, currentFavs);

    if (!areRelatedRoots(oldRoot, newRoot)) {
        return loadFavoritesForRoot(newRoot);
    }

    const transformed = currentFavs.map(fav => {
        const absFavPath = path.resolve(oldRoot, fav.path);
        if (!isPathInside(newRoot, absFavPath) || !fs.existsSync(absFavPath)) return null;

        return {
            ...fav,
            path: path.relative(newRoot, absFavPath).replace(/\\/g, '/')
        };
    }).filter(Boolean);

    const existingForNewRoot = loadFavoritesForRoot(newRoot);
    const nextFavs = dedupeFavorites([...transformed, ...existingForNewRoot]);
    saveFavoritesForRoot(newRoot, nextFavs);
    return nextFavs;
}

function streamFile(filePath, res, options = {}) {
    let stream;
    try {
        stream = fs.createReadStream(filePath, options);
    } catch (err) {
        if (DEBUG_LOGS) console.warn(`Failed to open ${filePath}: ${err.code || err.message}`);
        if (!res.headersSent) {
            res.writeHead(404);
            res.end('Not Found');
        } else {
            res.destroy();
        }
        return;
    }
    stream.on('error', err => {
        if (DEBUG_LOGS) console.warn(`Failed to stream ${filePath}: ${err.code || err.message}`);
        if (!res.headersSent) {
            res.writeHead(404);
            res.end('Not Found');
        } else {
            res.destroy();
        }
    });
    stream.pipe(res);
}

async function assertFileReadable(filePath, size) {
    if (size === 0) return;
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const probe = Buffer.alloc(1);
        await handle.read(probe, 0, 1, 0);
    } finally {
        await handle.close();
    }
}

const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = url.parse(req.url, true);
        const pathname = decodeURIComponent(parsedUrl.pathname);

        // API endpoints
        if (req.method === 'GET' && pathname === '/api/ls') {
            const queryDir = parsedUrl.query.dir || '';
            const targetPath = path.join(ASSETS_DIR, queryDir);
            
            if (!targetPath.startsWith(ASSETS_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

            try {
                const isRecursive = parsedUrl.query.recursive === 'true';
                let maxDepth = 0;
                if (isRecursive) {
                    const depthParam = parsedUrl.query.depth;
                    maxDepth = depthParam ? (depthParam === 'inf' ? Infinity : parseInt(depthParam) || 1) : Infinity;
                }
                let result;
                let cache = null;
                if (isRecursive) {
                    cache = parsedUrl.query.refresh === 'true' ? null : readAssetCache();
                    if (!cache) cache = await buildAssetCache();
                    result = filterIndex(cache, queryDir, maxDepth);
                    result.cache = { createdAt: cache.createdAt, fileCount: cache.files.length, folderCount: cache.folders.length };
                } else {
                    result = await scanAssets(ASSETS_DIR, queryDir, 0, 0);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        if (req.method === 'GET' && pathname === '/api/favorites') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(loadFavorites()));
            return;
        }

        if (req.method === 'GET' && pathname === '/api/config') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(config));
            return;
        }

        if (req.method === 'GET' && pathname === '/api/choose-folder') {
            const psPath = path.join(__dirname, 'temp_folder_picker.ps1');
            const psCode = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.WindowState = 'Minimized'
$form.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.SelectedPath = '${ASSETS_DIR.replace(/\\/g, '\\\\')}'
$result = $dialog.ShowDialog($form)
if ($result -eq 'OK') { Write-Output $dialog.SelectedPath }
$form.Close()
            `;
            fs.writeFileSync(psPath, psCode);
            exec(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, (error, stdout, stderr) => {
                try { fs.unlinkSync(psPath); } catch(e) {}
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ path: stdout.trim() }));
            });
            return;
        }

        // Post endpoints
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);

                    if (pathname === '/api/config') {
                        const newPath = data.rootPath;
                        if (newPath && fs.existsSync(newPath)) {
                            const oldPath = ASSETS_DIR;
                            const nextFavorites = moveFavoritesForRootChange(oldPath, newPath);
                            config.rootPath = newPath;
                            ASSETS_DIR = newPath;
                            fs.writeFileSync(configPath, JSON.stringify(config));
                            res.writeHead(200);
                            res.end(JSON.stringify({success: true, rootPath: ASSETS_DIR, favorites: nextFavorites}));
                        } else {
                            res.writeHead(400); res.end(JSON.stringify({error: 'Invalid directory'}));
                        }
                        return;
                    }

                    if (pathname === '/api/open-folder') {
                        const relPath = data.path;
                        if (!relPath) { res.writeHead(400); return res.end(JSON.stringify({error: "Missing Path"})); }
                        const fullPath = path.join(ASSETS_DIR, decodeURIComponent(relPath));
                        if (!fs.existsSync(fullPath)) { res.writeHead(404); return res.end(JSON.stringify({error: "Not Found"})); }
                        
                        const winPath = fullPath.split('/').join('\\');
                        exec(`explorer /select,"${winPath}"`);
                        
                        res.writeHead(200);
                        res.end(JSON.stringify({success: true}));
                        return;
                    }

                    if (pathname === '/api/rename') {
                        const { oldPath, newName } = data;
                        if (!oldPath || !newName) { res.writeHead(400); return res.end('Bad Request'); }
                        
                        const fullOldPath = path.join(ASSETS_DIR, decodeURIComponent(oldPath));
                        const dir = path.dirname(fullOldPath);
                        const fullNewPath = path.join(dir, decodeURIComponent(newName));

                        if (!fullOldPath.startsWith(ASSETS_DIR) || !fullNewPath.startsWith(ASSETS_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

                        await fs.promises.rename(fullOldPath, fullNewPath);
                        
                        // update favorites if we renamed a favorite
                        let favs = loadFavorites();
                        const favIndex = favs.findIndex(f => f.path === oldPath);
                        if (favIndex !== -1) {
                            const ext = path.extname(newName).toLowerCase();
                            let type = 'unknown';
                            if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) type = 'image';
                            else if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';
                            else if (['.txt', '.md'].includes(ext)) type = 'text';
                            
                            favs[favIndex].path = path.join(path.dirname(oldPath), newName).replace(/\\/g, '/');
                            favs[favIndex].name = newName;
                            saveFavorites(favs);
                        }

                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true }));
                        return;
                    }

                    if (pathname === '/api/favorite') {
                        const { fileInfo, action } = data; // action: 'add' | 'remove'
                        if (!fileInfo || !action) { res.writeHead(400); return res.end('Bad Request'); }

                        let favs = loadFavorites();
                        if (action === 'add' && !favs.find(f => f.path === fileInfo.path)) {
                            favs.push(fileInfo);
                        } else if (action === 'remove') {
                            favs = favs.filter(f => f.path !== fileInfo.path);
                        }
                        saveFavorites(favs);

                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, favorites: favs }));
                        return;
                    }
                } catch(err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        // Static file serving logic
        let fileToServe;
        if (pathname === '/') fileToServe = path.join(PUBLIC_DIR, 'index.html');
        else if (pathname.startsWith('/public/')) fileToServe = path.join(PUBLIC_DIR, pathname.replace('/public/', ''));
        else if (pathname.startsWith('/assets/')) fileToServe = path.join(ASSETS_DIR, pathname.replace('/assets/', ''));
        else fileToServe = path.join(PUBLIC_DIR, pathname);

        if (!fileToServe.startsWith(PUBLIC_DIR) && !fileToServe.startsWith(ASSETS_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

        try {
            const stats = await fs.promises.stat(fileToServe);
            if (stats.isDirectory()) { res.writeHead(403); return res.end('Forbidden'); }

            const ext = path.extname(fileToServe).toLowerCase();
            const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
            try {
                await assertFileReadable(fileToServe, stats.size);
            } catch (err) {
                if (DEBUG_LOGS) console.warn(`File unavailable ${fileToServe}: ${err.code || err.message}`);
                res.writeHead(503, { 'Content-Type': 'text/plain' });
                res.end('File unavailable');
                return;
            }
            
            const range = req.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const partialstart = parts[0];
                const partialend = parts[1];
                
                const start = parseInt(partialstart, 10);
                const end = partialend ? parseInt(partialend, 10) : stats.size - 1;
                const chunksize = (end - start) + 1;
                
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': mimeType
                });
                streamFile(fileToServe, res, { start, end });
            } else {
                res.writeHead(200, { 
                    'Content-Length': stats.size,
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes'
                });
                streamFile(fileToServe, res);
            }
        } catch (err) {
            res.writeHead(404);
            res.end('Not Found');
        }
    } catch(err) {
        res.writeHead(500); res.end('Internal Server Error');
    }
});

server.listen(PORT, () => console.log(`Asset Browser running at http://localhost:${PORT}`));
