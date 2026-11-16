const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3456;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STORE_PATH = path.join(DATA_DIR, 'library.json');

const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

const STATIC_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const DEFAULT_STORE = {
  currentFolder: '',
  recursive: false,
  recentFolders: [],
  tags: [],
  groups: [],
  collections: [],
  imageTags: {}, // { [normalizedFilePath]: string[] }
};

let store = structuredClone(DEFAULT_STORE);
let writeQueue = Promise.resolve();

async function loadStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fsp.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    store = {
      ...structuredClone(DEFAULT_STORE),
      ...parsed,
      recentFolders: Array.isArray(parsed.recentFolders) ? parsed.recentFolders : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      imageTags: parsed.imageTags && typeof parsed.imageTags === 'object' ? parsed.imageTags : {},
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to load store, using defaults:', err.message);
    }
    await saveStore();
  }
}

function saveStore() {
  const payload = JSON.stringify(store, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmpPath = STORE_PATH + '.tmp';
    await fsp.writeFile(tmpPath, payload, 'utf8');
    await fsp.rename(tmpPath, STORE_PATH);
  }).catch((err) => {
    console.error('Failed to save store:', err);
  });
  return writeQueue;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 5 * 1024 * 1024) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function scanImages(folderPath, recursive = false) {
  const resolvedRoot = path.resolve(folderPath);
  const stat = await fsp.stat(resolvedRoot);
  if (!stat.isDirectory()) {
    throw new Error('Указанный путь не является папкой');
  }

  const results = [];
  const stack = [resolvedRoot];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) {
          stack.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_MIME_TYPES[ext]) continue;

      try {
        const fileStat = await fsp.stat(fullPath);
        results.push({
          path: fullPath,
          name: entry.name,
          relativePath: path.relative(resolvedRoot, fullPath),
          ext,
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs,
        });
      } catch {
        // Skip inaccessible files
      }
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return results;
}

async function listDrivesOrDirs(targetPath) {
  if (!targetPath) {
    if (process.platform === 'win32') {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const checks = await Promise.all(
        letters.map(async (letter) => {
          const drive = `${letter}:\\`;
          try {
            await fsp.access(drive);
            return { name: drive, path: drive };
          } catch {
            return null;
          }
        })
      );
      return {
        currentPath: '',
        parentPath: '',
        directories: checks.filter(Boolean),
        isRoot: true,
      };
    }
    targetPath = '/';
  }

  const resolved = path.resolve(targetPath);
  const entries = await fsp.readdir(resolved, { withFileTypes: true });
  const directories = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({
      name: e.name,
      path: path.join(resolved, e.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const parsed = path.parse(resolved);
  const atDriveRoot = resolved === parsed.root;
  const parentPath = atDriveRoot ? (process.platform === 'win32' ? '' : '') : path.dirname(resolved);

  return {
    currentPath: resolved,
    parentPath,
    directories,
    isRoot: false,
  };
}

function pickFolderNative(initialDir) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('Нативный диалог поддерживается только на Windows'));
    }

    const safeInitial = (initialDir || '').replace(/'/g, "''");
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-32000, -32000)
$owner.Show()
$owner.Hide()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Выберите папку с изображениями'
$dialog.ShowNewFolderButton = $false
if ('${safeInitial}' -ne '' -and (Test-Path -LiteralPath '${safeInitial}')) {
  $dialog.SelectedPath = '${safeInitial}'
}
$result = $dialog.ShowDialog($owner)
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.SelectedPath
}
`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', psScript],
      { timeout: 120000, encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          return reject(err);
        }
        const selected = stdout.trim();
        if (!selected) {
          return resolve({ cancelled: true });
        }
        resolve({ cancelled: false, path: selected });
      }
    );
  });
}

function addRecentFolder(folderPath) {
  const normalized = path.resolve(folderPath);
  store.recentFolders = [
    normalized,
    ...store.recentFolders.filter((p) => p.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, 10);
}

function ensureGroup(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return '';
  if (!store.groups.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
    store.groups.push(trimmed);
  }
  return trimmed;
}

function getClientState() {
  return {
    currentFolder: store.currentFolder,
    recursive: store.recursive,
    recentFolders: store.recentFolders,
    tags: store.tags,
    groups: store.groups,
    collections: store.collections,
    imageTags: store.imageTags,
  };
}

async function handleApi(req, res, urlObj) {
  const pathname = urlObj.pathname;

  if (req.method === 'GET' && pathname === '/api/state') {
    let images = [];
    let folderError = null;
    if (store.currentFolder) {
      try {
        images = await scanImages(store.currentFolder, store.recursive);
      } catch (err) {
        folderError = err.message;
      }
    }
    return sendJson(res, 200, {
      ...getClientState(),
      images,
      folderError,
    });
  }

  if (req.method === 'POST' && pathname === '/api/folder/select') {
    const body = await readJsonBody(req);
    const folderPath = typeof body.path === 'string' ? body.path.trim() : '';
    const recursive = Boolean(body.recursive);
    if (!folderPath) {
      return sendError(res, 400, 'Не указан путь к папке');
    }

    const resolved = path.resolve(folderPath);
    const images = await scanImages(resolved, recursive);
    store.currentFolder = resolved;
    store.recursive = recursive;
    addRecentFolder(resolved);
    await saveStore();

    return sendJson(res, 200, {
      ...getClientState(),
      images,
    });
  }

  if (req.method === 'GET' && pathname === '/api/fs/list') {
    const targetPath = urlObj.searchParams.get('path') || '';
    const listing = await listDrivesOrDirs(targetPath);
    return sendJson(res, 200, listing);
  }

  if (req.method === 'POST' && pathname === '/api/fs/pick') {
    const body = await readJsonBody(req);
    const result = await pickFolderNative(body.initialDir || store.currentFolder);
    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && pathname === '/api/image') {
    const filePath = urlObj.searchParams.get('path');
    if (!filePath) {
      return sendError(res, 400, 'Не указан путь к изображению');
    }
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    const mime = IMAGE_MIME_TYPES[ext];
    if (!mime) {
      return sendError(res, 403, 'Неподдерживаемый тип файла');
    }

    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) {
      return sendError(res, 404, 'Файл не найден');
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'private, max-age=3600',
    });
    fs.createReadStream(resolved).pipe(res);
    return;
  }

  // Tags CRUD
  if (req.method === 'POST' && pathname === '/api/tags') {
    const body = await readJsonBody(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const color = typeof body.color === 'string' && body.color.trim() ? body.color.trim() : '#6366f1';
    if (!name) {
      return sendError(res, 400, 'Имя тэга не может быть пустым');
    }

    const existing = store.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return sendError(res, 409, 'Тэг с таким именем уже существует');
    }

    const groupName = ensureGroup(body.group);
    const tag = {
      id: crypto.randomUUID(),
      name,
      color,
      group: groupName,
      createdAt: Date.now(),
    };
    store.tags.push(tag);
    await saveStore();
    return sendJson(res, 201, { tag, tags: store.tags, groups: store.groups });
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/tags/')) {
    const id = pathname.slice('/api/tags/'.length);
    const body = await readJsonBody(req);
    const tag = store.tags.find((t) => t.id === id);
    if (!tag) {
      return sendError(res, 404, 'Тэг не найден');
    }

    if (typeof body.name === 'string') {
      const nextName = body.name.trim();
      if (!nextName) return sendError(res, 400, 'Имя тэга не может быть пустым');
      const dup = store.tags.find((t) => t.id !== id && t.name.toLowerCase() === nextName.toLowerCase());
      if (dup) return sendError(res, 409, 'Тэг с таким именем уже существует');
      tag.name = nextName;
    }
    if (typeof body.color === 'string' && body.color.trim()) {
      tag.color = body.color.trim();
    }
    if (typeof body.group === 'string') {
      tag.group = ensureGroup(body.group);
    }

    await saveStore();
    return sendJson(res, 200, { tag, tags: store.tags, groups: store.groups });
  }

  if (req.method === 'POST' && pathname === '/api/groups') {
    const body = await readJsonBody(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return sendError(res, 400, 'Название группы не может быть пустым');
    }
    ensureGroup(name);
    await saveStore();
    return sendJson(res, 201, { groups: store.groups });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/groups/')) {
    const name = decodeURIComponent(pathname.slice('/api/groups/'.length)).trim();
    store.groups = store.groups.filter((g) => g.toLowerCase() !== name.toLowerCase());
    for (const tag of store.tags) {
      if ((tag.group || '').toLowerCase() === name.toLowerCase()) {
        tag.group = '';
      }
    }
    await saveStore();
    return sendJson(res, 200, { groups: store.groups, tags: store.tags });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/tags/')) {
    const id = pathname.slice('/api/tags/'.length);
    const idx = store.tags.findIndex((t) => t.id === id);
    if (idx === -1) {
      return sendError(res, 404, 'Тэг не найден');
    }
    store.tags.splice(idx, 1);

    // Clean references from imageTags and collections
    for (const [imgPath, tagIds] of Object.entries(store.imageTags)) {
      const filtered = tagIds.filter((tid) => tid !== id);
      if (filtered.length === 0) {
        delete store.imageTags[imgPath];
      } else {
        store.imageTags[imgPath] = filtered;
      }
    }

    for (const col of store.collections) {
      col.includeTags = (col.includeTags || []).filter((tid) => tid !== id);
      col.excludeTags = (col.excludeTags || []).filter((tid) => tid !== id);
    }

    await saveStore();
    return sendJson(res, 200, {
      tags: store.tags,
      imageTags: store.imageTags,
      collections: store.collections,
    });
  }

  // Batch / single image tagging
  if (req.method === 'POST' && pathname === '/api/images/tags') {
    const body = await readJsonBody(req);
    const paths = Array.isArray(body.paths) ? body.paths.map((p) => path.resolve(p)) : [];
    const addTagIds = Array.isArray(body.addTagIds) ? body.addTagIds : [];
    const removeTagIds = Array.isArray(body.removeTagIds) ? body.removeTagIds : [];

    if (paths.length === 0) {
      return sendError(res, 400, 'Не выбраны изображения');
    }

    const validTagIds = new Set(store.tags.map((t) => t.id));
    const addFiltered = addTagIds.filter((id) => validTagIds.has(id));
    const removeSet = new Set(removeTagIds);

    for (const imgPath of paths) {
      const current = new Set(store.imageTags[imgPath] || []);
      for (const id of addFiltered) current.add(id);
      for (const id of removeSet) current.delete(id);

      if (current.size === 0) {
        delete store.imageTags[imgPath];
      } else {
        store.imageTags[imgPath] = Array.from(current);
      }
    }

    await saveStore();
    return sendJson(res, 200, { imageTags: store.imageTags });
  }

  // Dynamic collections CRUD
  if (req.method === 'POST' && pathname === '/api/collections') {
    const body = await readJsonBody(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return sendError(res, 400, 'Название коллекции не может быть пустым');
    }

    const collection = {
      id: crypto.randomUUID(),
      name,
      mode: body.mode === 'OR' ? 'OR' : 'AND',
      includeTags: Array.isArray(body.includeTags) ? [...new Set(body.includeTags)] : [],
      excludeTags: Array.isArray(body.excludeTags) ? [...new Set(body.excludeTags)] : [],
      search: typeof body.search === 'string' ? body.search : '',
      createdAt: Date.now(),
    };
    store.collections.push(collection);
    await saveStore();
    return sendJson(res, 201, { collection, collections: store.collections });
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/collections/')) {
    const id = pathname.slice('/api/collections/'.length);
    const body = await readJsonBody(req);
    const col = store.collections.find((c) => c.id === id);
    if (!col) {
      return sendError(res, 404, 'Коллекция не найдена');
    }

    if (typeof body.name === 'string' && body.name.trim()) col.name = body.name.trim();
    if (body.mode === 'AND' || body.mode === 'OR') col.mode = body.mode;
    if (Array.isArray(body.includeTags)) col.includeTags = [...new Set(body.includeTags)];
    if (Array.isArray(body.excludeTags)) col.excludeTags = [...new Set(body.excludeTags)];
    if (typeof body.search === 'string') col.search = body.search;

    await saveStore();
    return sendJson(res, 200, { collection: col, collections: store.collections });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/collections/')) {
    const id = pathname.slice('/api/collections/'.length);
    const idx = store.collections.findIndex((c) => c.id === id);
    if (idx === -1) {
      return sendError(res, 404, 'Коллекция не найдена');
    }
    store.collections.splice(idx, 1);
    await saveStore();
    return sendJson(res, 200, { collections: store.collections });
  }

  if (req.method === 'POST' && pathname === '/api/shutdown') {
    await writeQueue;
    sendJson(res, 200, { ok: true });
    setTimeout(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500);
    }, 50);
    return;
  }

  sendError(res, 404, 'Маршрут не найден');
}

async function serveStatic(res, pathname) {
  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const fullPath = path.resolve(PUBLIC_DIR, relPath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'Доступ запрещен');
  }

  try {
    const stat = await fsp.stat(fullPath);
    if (!stat.isFile()) {
      return sendError(res, 404, 'Файл не найден');
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': STATIC_MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    fs.createReadStream(fullPath).pipe(res);
  } catch {
    sendError(res, 404, 'Файл не найден');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (urlObj.pathname.startsWith('/api/')) {
      await handleApi(req, res, urlObj);
    } else {
      await serveStatic(res, urlObj.pathname);
    }
  } catch (err) {
    console.error('Request error:', err);
    if (!res.headersSent) {
      sendError(res, 500, err.message || 'Внутренняя ошибка сервера');
    }
  }
});

function openBrowser(url) {
  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

const shouldOpen = process.argv.includes('--open');

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && shouldOpen) {
    openBrowser(`http://${HOST}:${PORT}`);
    setTimeout(() => process.exit(0), 400);
    return;
  }
  console.error('Ошибка запуска сервера:', err.message);
  process.exit(1);
});

loadStore().then(() => {
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`PictureTagger запущен: ${url}`);
    if (shouldOpen) {
      openBrowser(url);
    }
  });
});
