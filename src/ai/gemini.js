/**
 * Minimal Gemini API client (REST, no SDK) so the app has zero runtime dependencies.
 * The API key lives only on the server and is sent in a header, never in a URL.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Upstream statuses worth retrying on another model: rate limits, overload, transient server errors. */
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

/** Longest slice of Google's error message kept for server logs. */
const MAX_DETAIL_CHARS = 300;

export class GeminiError extends Error {
  /**
   * @param {string} message safe to show to users
   * @param {{ status?: number, cause?: unknown, detail?: string, retryable?: boolean }} [opts]
   *   `detail` is for server logs only; `retryable` means another model may succeed.
   */
  constructor(message, { status, cause, detail, retryable = false } = {}) {
    super(message, { cause });
    this.name = 'GeminiError';
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
  }
}

/**
 * The parts of a generateContent response this client reads.
 * @typedef {{ text?: string, thought?: boolean }} Part
 * @typedef {{ content?: { parts?: Part[] }, finishReason?: string }} Candidate
 * @typedef {object} GenerateContentResponse
 * @property {Candidate[]} [candidates]
 * @property {{ blockReason?: string }} [promptFeedback]
 * @property {{ status?: string, message?: string }} [error]
 */

/** @typedef {{ system: string, prompt: string, generationConfig: object }} ModelRequest */
/** @typedef {{ apiKey: string, fetchImpl: typeof fetch, timeoutMs: number }} Connection */

/**
 * Join the visible text parts of the first candidate (skipping "thought" parts).
 * @param {GenerateContentResponse | null} data generateContent response body
 * @returns {string}
 */
export function extractText(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    throw new GeminiError(
      reason ? `Request blocked by safety filters (${reason}).` : 'Gemini returned no candidates.',
    );
  }
  const text = visibleText(candidate);
  if (!text.trim()) {
    throw new GeminiError(
      `Gemini returned an empty response (finishReason: ${candidate.finishReason ?? 'unknown'}).`,
    );
  }
  return text;
}

/** @param {Candidate} candidate */
function visibleText(candidate) {
  return (candidate.content?.parts ?? [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
}

/**
 * POST one generateContent request. The timeout covers both the response headers and the body.
 * Network failures and timeouts become retryable GeminiErrors.
 * @param {Connection} conn
 * @param {string} model
 * @param {ModelRequest} req
 * @returns {Promise<{ res: Response, body: GenerateContentResponse | null }>}
 */
async function postGenerateContent(
  { apiKey, fetchImpl, timeoutMs },
  model,
  { system, prompt, generationConfig },
) {
  try {
    const res = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch((err) => {
      if (err instanceof Error && err.name === 'TimeoutError') throw err;
      return null;
    });
    return { res, body: /** @type {GenerateContentResponse | null} */ (body) };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new GeminiError(timedOut ? 'Gemini request timed out.' : 'Could not reach Gemini.', {
      cause: err,
      detail: `${model}: ${timedOut ? `no response within ${timeoutMs} ms` : String(err)}`,
      retryable: true,
    });
  }
}

/**
 * An HTTP error from the API. Google's reason is kept for server logs but never echoed to clients.
 * @param {Response} res
 * @param {GenerateContentResponse | null} body
 */
function apiError(res, body) {
  const detail = body?.error
    ? `${body.error.status ?? ''}: ${String(body.error.message ?? '').slice(0, MAX_DETAIL_CHARS)}`
    : undefined;
  return new GeminiError(`Gemini API error (HTTP ${res.status}).`, {
    status: res.status,
    detail,
    retryable: RETRYABLE_STATUS.has(res.status),
  });
}

/**
 * One generateContent call against one model, returning its visible text.
 * @param {Connection} conn
 * @param {string} model
 * @param {ModelRequest} req
 */
async function callModel(conn, model, req) {
  const { res, body } = await postGenerateContent(conn, model, req);
  if (!res.ok) throw apiError(res, body);
  return extractText(body);
}

/**
 * Try each model in order, moving on only for retryable errors (overload, rate limit, timeout, network).
 * @param {Connection} conn
 * @param {string[]} models
 * @param {ModelRequest} req
 * @param {Pick<Console, 'warn'> | undefined} log receives one structured warning per skipped model
 * @returns {Promise<{ text: string, model: string }>}
 */
async function generateWithFallback(conn, models, req, log) {
  let lastError;
  for (const model of models) {
    try {
      return { text: await callModel(conn, model, req), model };
    } catch (err) {
      if (!(err instanceof GeminiError && err.retryable)) throw err;
      lastError = err;
      log?.warn(
        JSON.stringify({
          severity: 'WARNING',
          message: 'Gemini model skipped',
          model,
          status: err.status ?? null,
          detail: err.detail ?? err.message,
        }),
      );
    }
  }
  throw lastError;
}

/**
 * @param {{ apiKey: string, model?: string, fallbackModels?: string[], fetchImpl?: typeof fetch, timeoutMs?: number, log?: Pick<Console, 'warn'> }} options
 *   `fallbackModels` are tried in order when the primary model is overloaded, rate limited or too slow.
 *   `timeoutMs` is per model attempt, so a hung model costs at most this long before the fallback runs.
 *   `log` receives one structured warning per skipped model (never the key or the prompt).
 */
export function createGeminiClient({
  apiKey,
  model = 'gemini-flash-latest',
  fallbackModels = ['gemini-flash-lite-latest'],
  fetchImpl = fetch,
  timeoutMs = 15_000,
  log,
}) {
  if (!apiKey) throw new Error('createGeminiClient requires an apiKey');
  /** @type {Connection} */
  const conn = { apiKey, fetchImpl, timeoutMs };
  const models = [...new Set([model, ...fallbackModels].filter(Boolean))];
  /** @param {ModelRequest} req */
  const generate = (req) => generateWithFallback(conn, models, req, log);

  return {
    model,
    models,

    /**
     * Ask for JSON that matches a response schema.
     * @param {{ system: string, prompt: string, schema: object, maxOutputTokens?: number, temperature?: number }} req
     * @returns {Promise<{ data: unknown, model: string }>} parsed JSON (validate before use) and the model that produced it
     */
    async generateJson({ system, prompt, schema, maxOutputTokens = 4096, temperature = 0.8 }) {
      const { text, model: used } = await generate({
        system,
        prompt,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens,
          temperature,
        },
      });
      try {
        return { data: JSON.parse(text), model: used };
      } catch (err) {
        throw new GeminiError('Gemini returned malformed JSON.', { cause: err });
      }
    },

    /**
     * Ask for a plain-text answer.
     * @param {{ system: string, prompt: string, maxOutputTokens?: number, temperature?: number }} req
     * @returns {Promise<{ text: string, model: string }>}
     */
    async generateText({ system, prompt, maxOutputTokens = 2048, temperature = 0.6 }) {
      return generate({ system, prompt, generationConfig: { maxOutputTokens, temperature } });
    },
  };
}
