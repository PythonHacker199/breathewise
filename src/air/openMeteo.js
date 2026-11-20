/**
 * Open-Meteo (free, no key): place search and air-quality fallback.
 * https://open-meteo.com/en/docs/air-quality-api and https://open-meteo.com/en/docs/geocoding-api
 */
import { UpstreamError, getJson } from './http.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** @typedef {{ fetchImpl?: typeof fetch, timeoutMs?: number }} FetchOptions */

/**
 * @typedef {object} Place
 * @property {string} name
 * @property {string} region
 * @property {string} country
 * @property {number} lat
 * @property {number} lon
 * @property {string} timeZone
 */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
const numberOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Search places by name.
 * @param {string} query
 * @param {FetchOptions} [options]
 * @returns {Promise<Place[]>}
 */
export async function searchPlaces(query, options = {}) {
  const url = `${GEOCODING_URL}?${new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' })}`;
  const data = /** @type {{ results?: Array<Record<string, unknown>> }} */ (
    await getJson(url, options)
  );
  return (data.results ?? [])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: String(r.name ?? ''),
      region: String(r.admin1 ?? ''),
      country: String(r.country ?? ''),
      lat: Number(r.latitude),
      lon: Number(r.longitude),
      timeZone: String(r.timezone ?? 'UTC'),
    }));
}

/**
 * Current and next-48-hour air quality.
 * @param {{ lat: number, lon: number }} location
 * @param {FetchOptions} [options]
 * @returns {Promise<import('../science/plan.js').AirData>}
 */
export async function fetchOpenMeteoAir({ lat, lon }, options = {}) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'pm2_5,pm10,nitrogen_dioxide,ozone',
    hourly: 'pm2_5,pm10',
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '2',
  });
  const data = /** @type {OpenMeteoAirResponse | null} */ (
    await getJson(`${AIR_QUALITY_URL}?${params}`, options)
  );
  return parseAirResponse(data);
}

/**
 * Turn a raw response into AirData, rejecting one with no current PM2.5 or no hourly series.
 * @param {OpenMeteoAirResponse | null} data
 * @returns {import('../science/plan.js').AirData}
 */
function parseAirResponse(data) {
  const current = data?.current;
  const series = data?.hourly;
  const pm25 = numberOrNull(current?.pm2_5);
  if (!current || pm25 === null || !Array.isArray(series?.time)) {
    throw new UpstreamError('Open-Meteo returned no PM2.5 data for this location.');
  }
  return {
    source: 'open-meteo',
    timeZone: typeof data?.timezone === 'string' ? data.timezone : 'UTC',
    current: {
      time: new Date(Number(current.time) * 1000).toISOString(),
      pm25,
      pm10: numberOrNull(current.pm10),
      no2: numberOrNull(current.nitrogen_dioxide),
      o3: numberOrNull(current.ozone),
    },
    hourly: parseHourly(series.time, series),
    localIndex: null,
  };
}

/**
 * Hourly readings with a PM2.5 value; hours the model has not filled in are dropped.
 * @param {unknown[]} times unix seconds
 * @param {{ pm2_5?: unknown[], pm10?: unknown[] }} series values aligned with `times`
 */
function parseHourly(times, series) {
  return times
    .map((t, i) => ({
      time: new Date(Number(t) * 1000).toISOString(),
      pm25: numberOrNull(series.pm2_5?.[i]),
      pm10: numberOrNull(series.pm10?.[i]),
    }))
    .filter(
      /** @returns {h is { time: string, pm25: number, pm10: number | null }} */ (h) =>
        h.pm25 !== null,
    );
}

/**
 * The fields of an Open-Meteo air-quality response this module reads. Values are untrusted,
 * so each one still goes through numberOrNull.
 * @typedef {object} OpenMeteoAirResponse
 * @property {unknown} [timezone]
 * @property {{ time?: unknown, pm2_5?: unknown, pm10?: unknown, nitrogen_dioxide?: unknown, ozone?: unknown }} [current]
 * @property {{ time?: unknown[], pm2_5?: unknown[], pm10?: unknown[] }} [hourly]
 */
