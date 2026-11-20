/**
 * BreatheWise server: the JSON API plus the built React app, on Node's built-in http module.
 * This file only wires the pieces together; see src/http, src/routes, src/air, src/ai, src/science.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGeminiClient } from './src/ai/gemini.js';
import { createAirProvider } from './src/air/provider.js';
import { applySecurityHeaders } from './src/http/security.js';
import { HttpError, sendError } from './src/http/json.js';
import { loadSite, serveStatic } from './src/http/static.js';
import { createApiRouter } from './src/routes/api.js';

export { SECURITY_HEADERS } from './src/http/security.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} AppOptions
 * @property {string} [geminiApiKey] enables the AI coach and Q&A; without it, curated explanations are used
 * @property {string} [airQualityApiKey] Google Air Quality API key; without it, Open-Meteo data is used
 * @property {string} [model]
 * @property {string[]} [fallbackModels] tried in order when the primary Gemini model is overloaded
 * @property {typeof fetch} [fetchImpl]
 * @property {() => Date} [now]
 * @property {string | null} [webDir] built React app (web/dist)
 * @property {{ windowMs: number, max: number }} [rateLimit]
 * @property {boolean} [trustProxy] read client IP from X-Forwarded-For (Cloud Run sets it)
 * @property {Pick<Console, 'log' | 'warn' | 'error'>} [log]
 */

/**
 * Build the request handler shared by the standalone server (Docker, Cloud Run) and the
 * serverless function (Vercel, api/[...path].js). Tests inject a fake clock and fetch.
 * @param {AppOptions} [options]
 * @returns {Promise<(req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>>}
 */
export async function createHandler(options = {}) {
  const {
    geminiApiKey,
    airQualityApiKey,
    model,
    fallbackModels,
    fetchImpl,
    now = () => new Date(),
    webDir = path.join(ROOT, 'web', 'dist'),
    rateLimit = { windowMs: 60_000, max: 30 },
    trustProxy = false,
    log = console,
  } = options;

  const gemini = geminiApiKey ? createGeminiClient({ apiKey: geminiApiKey, model, fallbackModels, fetchImpl, log }) : null;
  const air = createAirProvider({ googleApiKey: airQualityApiKey, fetchImpl, now, log });
  const files = await loadSite({ webDir, log });
  const api = createApiRouter({ gemini, air, fetchImpl, now, log, rateLimit, trustProxy });

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async function handler(req, res) {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const isApi = url.pathname.startsWith('/api/');
    applySecurityHeaders(res);
    if (isApi) {
      // One structured line per API request; Cloud Logging parses JSON automatically.
      res.once('finish', () => {
        const severity = res.statusCode >= 500 ? 'ERROR' : 'INFO';
        log.log(JSON.stringify({ severity, method, path: url.pathname, status: res.statusCode, ms: Date.now() - started }));
      });
    }

    try {
      if (isApi) await api(req, res, method, url);
      else if (method === 'GET' || method === 'HEAD') serveStatic(files, req, res, url.pathname);
      else throw new HttpError(405, 'Method not allowed.');
    } catch (err) {
      sendError(res, err, log);
    }
  }

  return handler;
}

/**
 * Build the HTTP server.
 * @param {AppOptions} [options]
 */
export async function createApp(options = {}) {
  return http.createServer(await createHandler(options));
}

/**
 * Read server options from environment variables.
 * @param {NodeJS.ProcessEnv} env
 * @returns {AppOptions}
 */
export function optionsFromEnv(env) {
  return {
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    airQualityApiKey: env.GOOGLE_AIR_QUALITY_API_KEY?.trim() || undefined,
    model: env.GEMINI_MODEL || undefined,
    // Comma-separated; set to an empty string to disable fallback.
    fallbackModels:
      env.GEMINI_FALLBACK_MODELS === undefined
        ? undefined
        : env.GEMINI_FALLBACK_MODELS.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    // K_SERVICE is set by Cloud Run and VERCEL by Vercel; both sit behind a front end that sets X-Forwarded-For.
    trustProxy: env.TRUST_PROXY === '1' || Boolean(env.K_SERVICE) || Boolean(env.VERCEL),
  };
}

/** @type {ReturnType<typeof createHandler> | undefined} */
let serverlessHandler;

/**
 * Serverless entry point (Vercel runs this module's default export for every request).
 * The handler is built once per instance and reused, so the air-data cache stays warm.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
export default async function serverless(req, res) {
  serverlessHandler ??= createHandler(optionsFromEnv(process.env));
  const handle = await serverlessHandler;
  await handle(req, res);
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  const options = optionsFromEnv(process.env);
  const port = Number(process.env.PORT) || 8080;
  const server = await createApp(options);
  server.listen(port, () => {
    console.log(
      `BreatheWise listening on http://localhost:${port} (AI: ${options.geminiApiKey ? 'Gemini' : 'curated'}, air data: ${options.airQualityApiKey ? 'Google + Open-Meteo' : 'Open-Meteo'})`,
    );
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
