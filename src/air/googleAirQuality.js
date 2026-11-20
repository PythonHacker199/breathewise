/**
 * Google Maps Platform Air Quality API: current conditions, the local index (e.g. India's CPCB
 * AQI) and an hourly forecast. https://developers.google.com/maps/documentation/air-quality
 */
import { UpstreamError, postJson } from './http.js';

const BASE_URL = 'https://airquality.googleapis.com/v1';
const HOUR_MS = 3_600_000;
const FORECAST_HOURS = 24;

/**
 * ppb → µg/m³ at 25 °C and 1 atm: molecular weight / 24.45.
 * Google reports NO2 and O3 in ppb; particles are already in µg/m³.
 */
export const PPB_TO_UG_M3 = Object.freeze({ no2: 46.0055 / 24.45, o3: 47.9982 / 24.45 });

/**
 * @typedef {object} GooglePollutant
 * @property {string} code
 * @property {{ value?: number, units?: string }} [concentration]
 */

/**
 * @typedef {object} GoogleIndex
 * @property {string} code
 * @property {string} [displayName]
 * @property {number} [aqi]
 * @property {string} [category]
 */

/**
 * @typedef {object} GoogleConditions
 * @property {string} [dateTime]
 * @property {GoogleIndex[]} [indexes]
 * @property {GooglePollutant[]} [pollutants]
 */

/**
 * Concentration in µg/m³ for a pollutant code, converting from ppb when needed.
 * @param {GooglePollutant[] | undefined} pollutants
 * @param {'pm25' | 'pm10' | 'no2' | 'o3'} code
 * @returns {number | null}
 */
export function concentration(pollutants, code) {
  const found = pollutants?.find((p) => p.code === code)?.concentration;
  if (!found || typeof found.value !== 'number') return null;
  if (found.units === 'PARTS_PER_BILLION' && (code === 'no2' || code === 'o3')) {
    return Math.round(found.value * PPB_TO_UG_M3[code] * 10) / 10;
  }
  return found.value;
}

/**
 * The local (non-universal) index, e.g. "AQI (IN)" for India.
 * @param {GoogleIndex[] | undefined} indexes
 */
export function localIndex(indexes) {
  const local = indexes?.find((i) => i.code !== 'uaqi' && typeof i.aqi === 'number');
  return local
    ? {
        name: local.displayName ?? local.code,
        aqi: /** @type {number} */ (local.aqi),
        category: local.category ?? '',
      }
    : null;
}

/** @typedef {{ headers: Record<string, string>, fetchImpl?: typeof fetch, timeoutMs?: number }} RequestOptions */
/** @typedef {{ latitude: number, longitude: number }} GoogleLocation */

/**
 * Current conditions, with the local index (e.g. India's CPCB AQI) and pollutant concentrations.
 * @param {GoogleLocation} location
 * @param {RequestOptions} request
 * @returns {Promise<GoogleConditions>}
 */
function lookupCurrent(location, request) {
  const body = {
    location,
    extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'],
    languageCode: 'en',
  };
  return /** @type {Promise<GoogleConditions>} */ (
    postJson(`${BASE_URL}/currentConditions:lookup`, body, request)
  );
}

/**
 * Hourly forecast for the next FORECAST_HOURS, starting at the next full hour.
 * @param {GoogleLocation} location
 * @param {Date} now
 * @param {RequestOptions} request
 * @returns {Promise<{ hourlyForecasts?: GoogleConditions[] }>}
 */
function lookupForecast(location, now, request) {
  const start = new Date(Math.ceil(now.getTime() / HOUR_MS) * HOUR_MS);
  const end = new Date(start.getTime() + (FORECAST_HOURS - 1) * HOUR_MS);
  const body = {
    location,
    period: { startTime: start.toISOString(), endTime: end.toISOString() },
    extraComputations: ['POLLUTANT_CONCENTRATION'],
    pageSize: FORECAST_HOURS,
  };
  return /** @type {Promise<{ hourlyForecasts?: GoogleConditions[] }>} */ (
    postJson(`${BASE_URL}/forecast:lookup`, body, request)
  );
}

/**
 * Forecast hours that carry a PM2.5 value.
 * @param {GoogleConditions[]} forecasts
 */
function forecastHours(forecasts) {
  return forecasts
    .map((h) => ({
      time: h.dateTime ?? '',
      pm25: concentration(h.pollutants, 'pm25'),
      pm10: concentration(h.pollutants, 'pm10'),
    }))
    .filter(
      /** @returns {h is { time: string, pm25: number, pm10: number | null }} */ (h) =>
        h.pm25 !== null && h.time !== '',
    );
}

/**
 * Current conditions and the 24-hour forecast for a location. Google returns no time zone,
 * so the caller supplies it (from the browser or Open-Meteo).
 * @param {{ lat: number, lon: number }} location
 * @param {{ apiKey: string, timeZone: string, now?: Date, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<import('../science/plan.js').AirData>}
 */
export async function fetchGoogleAir(
  { lat, lon },
  { apiKey, timeZone, now = new Date(), fetchImpl, timeoutMs },
) {
  /** @type {RequestOptions} */
  const request = { headers: { 'x-goog-api-key': apiKey }, fetchImpl, timeoutMs };
  const location = { latitude: lat, longitude: lon };
  const [current, forecast] = await Promise.all([
    lookupCurrent(location, request),
    lookupForecast(location, now, request),
  ]);
  const pm25 = concentration(current.pollutants, 'pm25');
  if (pm25 === null) {
    throw new UpstreamError('Google Air Quality returned no PM2.5 data for this location.');
  }
  return {
    source: 'google',
    timeZone,
    current: {
      time: current.dateTime ?? now.toISOString(),
      pm25,
      pm10: concentration(current.pollutants, 'pm10'),
      no2: concentration(current.pollutants, 'no2'),
      o3: concentration(current.pollutants, 'o3'),
    },
    hourly: forecastHours(forecast.hourlyForecasts ?? []),
    localIndex: localIndex(current.indexes),
  };
}
