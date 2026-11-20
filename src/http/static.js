/**
 * Static file serving for the built React app: every file is read into memory once at startup
 * (the site is small), pre-gzipped and given an ETag. Only preloaded paths can ever be served,
 * so path traversal is impossible by construction.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

/** @type {Readonly<Record<string, string>>} */
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
});
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.json', '.webmanifest', '.txt']);
const ONE_YEAR_SECONDS = 31_536_000;

/** @typedef {{ body: Buffer, gzip: Buffer | null, type: string, etag: string, immutable: boolean }} StaticFile */
/** @typedef {Map<string, StaticFile>} StaticFiles */

/**
 * Read every servable file under `dir` into memory.
 * @param {string} dir
 * @returns {Promise<StaticFiles>}
 */
export async function loadStatic(dir) {
  /** @type {StaticFiles} */
  const files = new Map();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const type = MIME[ext];
    if (!type) continue;
    const full = path.join(entry.parentPath, entry.name);
    const body = await readFile(full);
    const urlPath = '/' + path.relative(dir, full).split(path.sep).join('/');
    files.set(urlPath, {
      body,
      gzip: COMPRESSIBLE.has(ext) ? gzipSync(body) : null,
      type,
      etag: `"${createHash('sha1').update(body).digest('base64url')}"`,
      // Vite puts content-hashed files under /assets/, so their URL changes whenever they do.
      immutable: urlPath.startsWith('/assets/'),
    });
  }
  return files;
}

/**
 * Load the built web app, or an empty set (API only) when it has not been built yet.
 * @param {{ webDir: string | null, log: Pick<Console, 'warn'> }} opts
 * @returns {Promise<StaticFiles>}
 */
export async function loadSite({ webDir, log }) {
  if (!webDir) return new Map();
  try {
    return await loadStatic(webDir);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
    log.warn(`Web build not found at ${webDir}; serving the API only. Run "npm run build".`);
    return new Map();
  }
}

/**
 * Serve a preloaded file with ETag revalidation and gzip when the client accepts it.
 * Paths without a file extension get index.html (single-page app).
 * @param {StaticFiles} files
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 */
export function serveStatic(files, req, res, pathname) {
  const file = resolveFile(files, pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const headers = cacheHeaders(file);
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const gzip = file.gzip && acceptsGzip(req) ? file.gzip : null;
  const body = gzip ?? file.body;
  res.writeHead(200, {
    ...headers,
    ...(gzip && { 'Content-Encoding': 'gzip' }),
    'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * The file for a URL path: directories map to their index.html, and extension-less paths that
 * match no file are app routes, answered with the single-page app's index.html.
 * @param {StaticFiles} files
 * @param {string} pathname
 * @returns {StaticFile | undefined}
 */
function resolveFile(files, pathname) {
  const exact = files.get(pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  if (exact) return exact;
  const isAppRoute = !path.posix.extname(pathname);
  return isAppRoute ? files.get('/index.html') : undefined;
}

/**
 * Hashed build assets can be cached forever; everything else revalidates (a 304 when unchanged).
 * @param {StaticFile} file
 */
function cacheHeaders(file) {
  return {
    'Content-Type': file.type,
    ETag: file.etag,
    'Cache-Control': file.immutable ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache',
    Vary: 'Accept-Encoding',
  };
}

/** @param {import('node:http').IncomingMessage} req */
const acceptsGzip = (req) => /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
