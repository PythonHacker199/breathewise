/**
 * JSON API: /api/health, /api/places, /api/plan, /api/ask.
 */
import { createHash } from 'node:crypto';

import { validateLocation, validateProfile, validateQuestion, validateSearch } from '../validate.js';
import { buildPlan } from '../science/plan.js';
import { upcomingHours } from '../science/routine.js';
import { searchPlaces } from '../air/openMeteo.js';
import { UpstreamError } from '../air/http.js';
import { answerQuestion, buildFacts, generateCoach } from '../ai/coach.js';
import { describeError } from '../ai/errors.js';
import { HttpError, readJsonBody, sendJson } from '../http/json.js';
import { clientIp, createRateLimiter, createTtlCache } from '../http/limits.js';

/** Identical facts reuse the coach's explanation for this long. */
const COACH_CACHE_TTL_MS = 15 * 60 * 1000;
const COACH_CACHE_MAX = 300;
/** Hours of forecast sent to the browser for the chart. */
const CHART_HOURS = 24;
const AI_NOT_CONFIGURED = 'The AI assistant is not configured on this server (missing GEMINI_API_KEY).';
const AIR_UNAVAILABLE = 'Air-quality data for this location is unavailable right now. Please try again in a minute.';

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */
/** @typedef {(req: Req, res: Res, url: URL) => Promise<void>} Handler */
/** @typedef {Awaited<ReturnType<typeof generateCoach>>} Coach */

/**
 * @typedef {object} ApiDeps
 * @property {ReturnType<typeof import('../ai/gemini.js').createGeminiClient> | null} gemini
 * @property {ReturnType<typeof import('../air/provider.js').createAirProvider>} air
 * @property {typeof fetch | undefined} fetchImpl
 * @property {() => Date} now
 * @property {Pick<Console, 'log' | 'warn' | 'error'>} log
 * @property {{ windowMs: number, max: number }} rateLimit
 * @property {boolean} trustProxy
 */

/**
 * Build the API request handler.
 * @param {ApiDeps} deps
 * @returns {(req: Req, res: Res, method: string, url: URL) => Promise<void>}
 */
export function createApiRouter({ gemini, air, fetchImpl, now, log, rateLimit, trustProxy }) {
  const limiter = createRateLimiter(rateLimit);
  /** @type {ReturnType<typeof createTtlCache<Coach>>} */
  const coachCache = createTtlCache({ max: COACH_CACHE_MAX, ttlMs: COACH_CACHE_TTL_MS });
  const aiInfo = { enabled: Boolean(gemini), model: gemini?.model ?? null };

  /** @param {Req} req */
  function enforceRateLimit(req) {
    const { allowed, retryAfterSec } = limiter(clientIp(req, trustProxy));
    if (!allowed) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', { retryAfterSec });
  }

  /**
   * Validate location + profile and build the deterministic plan.
   * @param {unknown} body
   */
  async function planFromBody(body) {
    const source = /** @type {{ location?: unknown, profile?: unknown } | null} */ (body);
    const location = validateLocation(source?.location);
    const profile = validateProfile(source?.profile);
    const errors = { ...(location.ok ? {} : location.errors), ...(profile.ok ? {} : profile.errors) };
    if (!location.ok || !profile.ok) throw new HttpError(400, 'Please check the highlighted details.', { errors });

    let airData;
    try {
      airData = await air.lookup(location.value);
    } catch (err) {
      log.warn(`Air lookup failed: ${err instanceof UpstreamError ? err.message : describeError(err)}`);
      throw new HttpError(502, AIR_UNAVAILABLE);
    }
    const plan = buildPlan({ air: airData, profile: profile.value, now: now() });
    const facts = buildFacts({ plan, profile: profile.value, placeName: location.value.name });
    return { location: location.value, profile: profile.value, airData, plan, facts };
  }

  /** @type {Handler} */
  async function handlePlaces(req, res, url) {
    enforceRateLimit(req);
    const query = validateSearch(url.searchParams.get('q'));
    if (!query.ok) throw new HttpError(400, query.error);
    try {
      sendJson(res, 200, { places: await searchPlaces(query.value, { fetchImpl }) });
    } catch (err) {
      log.warn(`Place search failed: ${describeError(err)}`);
      throw new HttpError(502, 'Place search is unavailable right now. You can use your current location instead.');
    }
  }

  /** @type {Handler} */
  async function handlePlan(req, res) {
    enforceRateLimit(req);
    const built = await planFromBody(await readJsonBody(req));
    const cacheKey = createHash('sha256').update(JSON.stringify(built.facts)).digest('base64url');
    let coach = coachCache.get(cacheKey);
    if (!coach) {
      coach = await generateCoach(built.facts, gemini, log);
      // Cache only real AI output; a fallback should be retried next time.
      if (coach.source === 'gemini') coachCache.set(cacheKey, coach);
    }
    sendJson(res, 200, {
      place: built.location,
      air: {
        source: built.airData.source,
        timeZone: built.airData.timeZone,
        hourly: upcomingHours(built.airData.hourly, now(), CHART_HOURS).slice(0, CHART_HOURS).map(({ time, pm25 }) => ({ time, pm25 })),
      },
      plan: built.plan,
      coach,
    });
  }

  /** @type {Handler} */
  async function handleAsk(req, res) {
    enforceRateLimit(req);
    if (!gemini) throw new HttpError(503, AI_NOT_CONFIGURED);
    const body = /** @type {{ question?: unknown } | null} */ (await readJsonBody(req));
    const question = validateQuestion(body?.question);
    if (!question.ok) throw new HttpError(400, question.error);
    const built = await planFromBody(body);
    try {
      sendJson(res, 200, await answerQuestion(built.facts, question.value, gemini));
    } catch (err) {
      log.warn(`Gemini ask failed: ${describeError(err)}`);
      throw new HttpError(502, 'The AI assistant could not answer right now. Please try again.');
    }
  }

  /** @type {Record<string, Record<string, Handler>>} path -> method -> handler */
  const routes = {
    '/api/health': { GET: async (_req, res) => sendJson(res, 200, { status: 'ok', ai: aiInfo, airSource: air.source }) },
    '/api/places': { GET: handlePlaces },
    '/api/plan': { POST: handlePlan },
    '/api/ask': { POST: handleAsk },
  };

  return async (req, res, method, url) => {
    const byMethod = routes[url.pathname];
    if (!byMethod) throw new HttpError(404, 'Unknown API route.');
    const handler = byMethod[method];
    if (!handler) throw new HttpError(405, 'Method not allowed.');
    await handler(req, res, url);
  };
}
