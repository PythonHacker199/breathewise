/**
 * JSON API: /api/health, /api/places, /api/plan, /api/ask.
 *
 * Handlers are plain module-level functions that receive a shared RouterContext, so each one
 * stays short and can be read (and tested through the server) on its own.
 */
import { createHash } from 'node:crypto';

import { answerQuestion, buildFacts, generateCoach } from '../ai/coach.js';
import { describeError } from '../ai/errors.js';
import { UpstreamError } from '../air/http.js';
import { searchPlaces } from '../air/openMeteo.js';
import { HttpError, readJsonBody, sendJson } from '../http/json.js';
import { clientIp, createRateLimiter, createTtlCache } from '../http/limits.js';
import { overallAqi } from '../science/aqi.js';
import { buildPlan } from '../science/plan.js';
import { upcomingHours } from '../science/routine.js';
import {
  validateLocation,
  validateProfile,
  validateQuestion,
  validateSearch,
} from '../validate.js';

/** Identical facts reuse the coach's explanation for this long. */
const COACH_CACHE_TTL_MS = 15 * 60 * 1000;
const COACH_CACHE_MAX = 300;
/** Hours of forecast sent to the browser for the chart. */
const CHART_HOURS = 24;

const MESSAGES = Object.freeze({
  aiNotConfigured: 'The AI assistant is not configured on this server (missing GEMINI_API_KEY).',
  airUnavailable:
    'Air-quality data for this location is unavailable right now. Please try again in a minute.',
  placesUnavailable:
    'Place search is unavailable right now. You can use your current location instead.',
  askFailed: 'The AI assistant could not answer right now. Please try again.',
  invalidInput: 'Please check the highlighted details.',
  rateLimited: 'Too many requests. Please wait a moment and try again.',
});

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */
/** @typedef {Awaited<ReturnType<typeof generateCoach>>} Coach */
/** @typedef {import('../science/plan.js').AirData} AirData */

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
 * @typedef {ApiDeps & {
 *   limiter: ReturnType<typeof createRateLimiter>,
 *   coachCache: ReturnType<typeof createTtlCache<Coach>>,
 * }} RouterContext
 */

/** @typedef {(ctx: RouterContext, req: Req, res: Res, url: URL) => Promise<void>} Handler */

/**
 * @param {RouterContext} ctx
 * @param {Req} req
 */
function enforceRateLimit(ctx, req) {
  const { allowed, retryAfterSec } = ctx.limiter(clientIp(req, ctx.trustProxy));
  if (!allowed) throw new HttpError(429, MESSAGES.rateLimited, { retryAfterSec });
}

/**
 * Validate the location and profile of a plan or ask request, reporting every field error at once.
 * @param {unknown} body
 */
function parsePlanRequest(body) {
  const source = /** @type {{ location?: unknown, profile?: unknown } | null} */ (body);
  const location = validateLocation(source?.location);
  const profile = validateProfile(source?.profile);
  if (location.ok && profile.ok) return { location: location.value, profile: profile.value };
  const errors = { ...(location.ok ? {} : location.errors), ...(profile.ok ? {} : profile.errors) };
  throw new HttpError(400, MESSAGES.invalidInput, { errors });
}

/**
 * @param {RouterContext} ctx
 * @param {import('../validate.js').Location} location
 * @returns {Promise<AirData>}
 */
async function lookupAir(ctx, location) {
  try {
    return await ctx.air.lookup(location);
  } catch (err) {
    ctx.log.warn(
      `Air lookup failed: ${err instanceof UpstreamError ? err.message : describeError(err)}`,
    );
    throw new HttpError(502, MESSAGES.airUnavailable);
  }
}

/**
 * Validate the request, fetch the air and build the deterministic plan plus the coach's facts.
 * @param {RouterContext} ctx
 * @param {unknown} body
 */
async function planFromBody(ctx, body) {
  const { location, profile } = parsePlanRequest(body);
  const airData = await lookupAir(ctx, location);
  const plan = buildPlan({ air: airData, profile, now: ctx.now() });
  const facts = buildFacts({ plan, profile, placeName: location.name });
  return { location, profile, airData, plan, facts };
}

/**
 * The coach's explanation, reusing a cached Gemini answer for identical facts.
 * Only real AI output is cached; a fallback is retried next time.
 * @param {RouterContext} ctx
 * @param {ReturnType<typeof buildFacts>} facts
 * @returns {Promise<Coach>}
 */
async function coachFor(ctx, facts) {
  const key = createHash('sha256').update(JSON.stringify(facts)).digest('base64url');
  const cached = ctx.coachCache.get(key);
  if (cached) return cached;
  const coach = await generateCoach(facts, ctx.gemini, ctx.log);
  if (coach.source === 'gemini') ctx.coachCache.set(key, coach);
  return coach;
}

/**
 * The next CHART_HOURS of PM2.5 with each hour's EPA category, so the browser never re-implements the bands.
 * @param {AirData} airData
 * @param {Date} now
 */
function chartHours(airData, now) {
  return upcomingHours(airData.hourly, now, CHART_HOURS)
    .slice(0, CHART_HOURS)
    .map(({ time, pm25 }) => {
      const { key, label, color } = overallAqi({ pm25 }).category;
      return { time, pm25, category: { key, label, color } };
    });
}

/** @type {Handler} */
async function handleHealth(ctx, _req, res) {
  const ai = { enabled: Boolean(ctx.gemini), model: ctx.gemini?.model ?? null };
  sendJson(res, 200, { status: 'ok', ai, airSource: ctx.air.source });
}

/** @type {Handler} */
async function handlePlaces(ctx, req, res, url) {
  enforceRateLimit(ctx, req);
  const query = validateSearch(url.searchParams.get('q'));
  if (!query.ok) throw new HttpError(400, query.error);
  try {
    sendJson(res, 200, { places: await searchPlaces(query.value, { fetchImpl: ctx.fetchImpl }) });
  } catch (err) {
    ctx.log.warn(`Place search failed: ${describeError(err)}`);
    throw new HttpError(502, MESSAGES.placesUnavailable);
  }
}

/** @type {Handler} */
async function handlePlan(ctx, req, res) {
  enforceRateLimit(ctx, req);
  const built = await planFromBody(ctx, await readJsonBody(req));
  sendJson(res, 200, {
    place: built.location,
    air: {
      source: built.airData.source,
      timeZone: built.airData.timeZone,
      hourly: chartHours(built.airData, ctx.now()),
    },
    plan: built.plan,
    coach: await coachFor(ctx, built.facts),
  });
}

/** @type {Handler} */
async function handleAsk(ctx, req, res) {
  enforceRateLimit(ctx, req);
  if (!ctx.gemini) throw new HttpError(503, MESSAGES.aiNotConfigured);
  const body = /** @type {{ question?: unknown } | null} */ (await readJsonBody(req));
  const question = validateQuestion(body?.question);
  if (!question.ok) throw new HttpError(400, question.error);
  const built = await planFromBody(ctx, body);
  try {
    sendJson(res, 200, await answerQuestion(built.facts, question.value, ctx.gemini));
  } catch (err) {
    ctx.log.warn(`Gemini ask failed: ${describeError(err)}`);
    throw new HttpError(502, MESSAGES.askFailed);
  }
}

/** @type {Readonly<Record<string, Readonly<Record<string, Handler>>>>} path -> method -> handler */
const ROUTES = Object.freeze({
  '/api/health': { GET: handleHealth },
  '/api/places': { GET: handlePlaces },
  '/api/plan': { POST: handlePlan },
  '/api/ask': { POST: handleAsk },
});

/**
 * Build the API request handler.
 * @param {ApiDeps} deps
 * @returns {(req: Req, res: Res, method: string, url: URL) => Promise<void>}
 */
export function createApiRouter(deps) {
  /** @type {RouterContext} */
  const ctx = {
    ...deps,
    limiter: createRateLimiter(deps.rateLimit),
    coachCache: createTtlCache({ max: COACH_CACHE_MAX, ttlMs: COACH_CACHE_TTL_MS }),
  };
  return async (req, res, method, url) => {
    const byMethod = ROUTES[url.pathname];
    if (!byMethod) throw new HttpError(404, 'Unknown API route.');
    const handler = byMethod[method];
    if (!handler) throw new HttpError(405, 'Method not allowed.');
    await handler(ctx, req, res, url);
  };
}
