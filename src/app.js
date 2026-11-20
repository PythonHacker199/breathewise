/**
 * The BreatheWise application: the JSON API plus the built React app, on Node's http module.
 * This module only wires the pieces together; see src/http, src/routes, src/air, src/ai and
 * src/science. server.js runs it as a standalone server and as a Vercel function.
 */
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { createGeminiClient } from './ai/gemini.js';
import { createAirProvider } from './air/provider.js';
import { HttpError, sendError } from './http/json.js';
import { applySecurityHeaders } from './http/security.js';
import { loadSite, serveStatic } from './http/static.js';
import { createApiRouter } from './routes/api.js';

export { SECURITY_HEADERS } from './http/security.js';

const DEFAULT_WEB_DIR = fileURLToPath(new URL('../web/dist', import.meta.url));
const DEFAULT_RATE_LIMIT = Object.freeze({ windowMs: 60_000, max: 30 });

/**
 * @typedef {object} AppOptions
 * @property {string} [geminiApiKey] enables the AI coach and Q&A; without it, curated explanations are used
 * @property {string} [airQualityApiKey] Google Air Quality API key; without it, Open-Meteo data is used
 * @property {string} [model]
 * @property {string[]} [fallbackModels] tried in order when the primary Gemini model is overloaded
 * @property {typeof fetch} [fetchImpl]
 * @property {() => Date} [now]
 * @property {string | null} [webDir] built React app (web/dist); null serves the API only
 * @property {{ windowMs: number, max: number }} [rateLimit]
 * @property {boolean} [trustProxy] read the client IP from X-Forwarded-For (Cloud Run and Vercel set it)
 * @property {Pick<Console, 'log' | 'warn' | 'error'>} [log]
 */

/**
 * One structured line per API request once the response is sent; Cloud Logging and Vercel
 * both parse JSON log lines.
 * @param {http.ServerResponse} res
 * @param {Pick<Console, 'log'>} log
 * @param {{ method: string, path: string, started: number }} request
 */
function logWhenFinished(res, log, { method, path, started }) {
  res.once('finish', () => {
    const severity = res.statusCode >= 500 ? 'ERROR' : 'INFO';
    log.log(
      JSON.stringify({ severity, method, path, status: res.statusCode, ms: Date.now() - started }),
    );
  });
}

/**
 * Build the request handler shared by the standalone server (Docker, Cloud Run) and the
 * serverless function (Vercel). Tests inject a fake clock and fetch.
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
    log = console,
  } = options;
  const { webDir = DEFAULT_WEB_DIR, rateLimit = DEFAULT_RATE_LIMIT, trustProxy = false } = options;

  const gemini = geminiApiKey
    ? createGeminiClient({ apiKey: geminiApiKey, model, fallbackModels, fetchImpl, log })
    : null;
  const air = createAirProvider({ googleApiKey: airQualityApiKey, fetchImpl, now, log });
  const files = await loadSite({ webDir, log });
  const api = createApiRouter({ gemini, air, fetchImpl, now, log, rateLimit, trustProxy });

  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const isApi = url.pathname.startsWith('/api/');
    applySecurityHeaders(res);
    if (isApi) logWhenFinished(res, log, { method, path: url.pathname, started: Date.now() });
    try {
      if (isApi) await api(req, res, method, url);
      else if (method === 'GET' || method === 'HEAD') serveStatic(files, req, res, url.pathname);
      else throw new HttpError(405, 'Method not allowed.');
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

/**
 * Build the HTTP server.
 * @param {AppOptions} [options]
 */
export async function createApp(options = {}) {
  return http.createServer(await createHandler(options));
}

/**
 * A comma-separated list of model ids; an empty string disables the fallback, unset keeps the default.
 * @param {string | undefined} value
 */
function parseModelList(value) {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
    fallbackModels: parseModelList(env.GEMINI_FALLBACK_MODELS),
    // K_SERVICE is set by Cloud Run and VERCEL by Vercel; both sit behind a front end that sets X-Forwarded-For.
    trustProxy: env.TRUST_PROXY === '1' || Boolean(env.K_SERVICE) || Boolean(env.VERCEL),
  };
}
