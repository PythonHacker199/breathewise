/**
 * JSON over HTTP for the air-data providers, with a timeout and errors that never leak
 * upstream response bodies or API keys.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export class UpstreamError extends Error {
  /**
   * @param {string} message safe to log
   * @param {{ status?: number, cause?: unknown }} [opts]
   */
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'UpstreamError';
    this.status = status;
  }
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<unknown>}
 */
async function request(url, init, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const host = new URL(url).host;
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new UpstreamError(timedOut ? `${host} timed out.` : `Could not reach ${host}.`, {
      cause: err,
    });
  }
  if (!res.ok) {
    throw new UpstreamError(`${host} returned HTTP ${res.status}.`, { status: res.status });
  }
  try {
    return await res.json();
  } catch (err) {
    throw new UpstreamError(`${host} returned invalid JSON.`, { cause: err });
  }
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function getJson(url, options = {}) {
  return request(url, { method: 'GET', headers: { accept: 'application/json' } }, options);
}

/**
 * @param {string} url
 * @param {unknown} body
 * @param {{ headers?: Record<string, string>, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function postJson(url, body, { headers = {}, ...options } = {}) {
  return request(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    options,
  );
}
