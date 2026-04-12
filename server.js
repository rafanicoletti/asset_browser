const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');

const configPath = path.join(__dirname, 'config.json');
let config = { rootPath: path.resolve(__dirname, '..') };
try {
    if (fs.existsSync(configPath)) {
        const u = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (u.rootPath && fs.existsSync(u.rootPath)) config.rootPath = u.rootPath;
    }
} catch(e) {}

let ASSETS_DIR = config.rootPath;

const MIME_TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown' };

function loadFavorites() {
    try {
        if (fs.existsSync(FAVORITES_FILE)) {
            return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
        }
    } catch(e) {}
    return [];
}

function saveFavorites(favs) {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favs, null, 2), 'utf8');
}

const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = url.parse(req.url, true);
        const pathname = decodeURI(parsedUrl.pathname);

        // API endpoints
        if (req.method === 'GET' && pathname === '/api/ls') {
            const queryDir = parsedUrl.query.dir || '';
            const targetPath = path.join(ASSETS_DIR, queryDir);
            
            if (!targetPath.startsWith(ASSETS_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

            async function getDirContents(basePath, subPath = '', currentDepth = 0, maxDepth = Infinity, globalCount = { val: 0 }) {
                const target = path.join(basePath, subPath);
                let folders = [], files = [];
                if (globalCount.val > 2000) return { folders, files }; // Increased to 2000 for safety buffer
                
                try {
                    const items = await fs.promises.readdir(target, { withFileTypes: true });
                    for (const item of items) {
                        if (globalCount.val > 2000) break;
                        if (subPath === '' && item.name === 'asset_browser') continue;
                        if (item.name.startsWith('.')) continue;

                        const itemPath = path.join(target, item.name);
                        const relPath = path.join(subPath, item.name).replace(/\\/g, '/');
                        
                        try {
                            const stats = await fs.promises.stat(itemPath);
                            if (item.isDirectory()) {
                                folders.push({ name: item.name, path: relPath, size: stats.size, type: 'folder' });
                                if (currentDepth < maxDepth) {
                                    const sub = await getDirContents(basePath, relPath, currentDepth + 1, maxDepth, globalCount);
                                    folders.push(...sub.folders);
                                    files.push(...sub.files);
                                }
                            } else {
                                globalCount.val++;
                                const ext = path.extname(item.name).toLowerCase();
                                let type = 'unknown';
                                if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) type = 'image';
                                else if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';
                                else if (['.txt', '.md'].includes(ext) || item.name.toLowerCase().includes('readme') || item.name.toLowerCase().includes('license')) type = 'text';

                                files.push({ name: item.name, path: relPath, size: stats.size, type: type, ext: ext });
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
                return { folders, files };
            }

            try {
                const isRecursive = parsedUrl.query.recursive === 'true';
                let maxDepth = 0;
                if (isRecursive) {
                    const depthParam = parsedUrl.query.depth;
                    maxDepth = depthParam ? (depthParam === 'inf' ? Infinity : parseInt(depthParam) || 1) : Infinity;
                }
                const result = await getDirContents(ASSETS_DIR, queryDir, 0, maxDepth, { val: 0 });
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
                            config.rootPath = newPath;
                            ASSETS_DIR = newPath;
                            fs.writeFileSync(configPath, JSON.stringify(config));
                            res.writeHead(200);
                            res.end(JSON.stringify({success: true, rootPath: ASSETS_DIR}));
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
            res.writeHead(200, { 'Content-Type': mimeType });
            fs.createReadStream(fileToServe).pipe(res);
        } catch (err) {
            res.writeHead(404);
            res.end('Not Found');
        }
    } catch(err) {
        res.writeHead(500); res.end('Internal Server Error');
    }
});

server.listen(PORT, () => console.log(`Asset Browser running at http://localhost:${PORT}`));
