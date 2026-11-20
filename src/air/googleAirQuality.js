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
  return local ? { name: local.displayName ?? local.code, aqi: /** @type {number} */ (local.aqi), category: local.category ?? '' } : null;
}

/**
 * @param {{ lat: number, lon: number }} location
 * @param {{ apiKey: string, timeZone: string, now?: Date, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<import('../science/plan.js').AirData>}
 */
export async function fetchGoogleAir({ lat, lon }, { apiKey, timeZone, now = new Date(), fetchImpl, timeoutMs }) {
  const request = { headers: { 'x-goog-api-key': apiKey }, fetchImpl, timeoutMs };
  const location = { latitude: lat, longitude: lon };
  const start = new Date(Math.ceil(now.getTime() / HOUR_MS) * HOUR_MS);
  const end = new Date(start.getTime() + (FORECAST_HOURS - 1) * HOUR_MS);

  const [current, forecast] = await Promise.all([
    /** @type {Promise<GoogleConditions>} */ (
      postJson(`${BASE_URL}/currentConditions:lookup`, { location, extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'], languageCode: 'en' }, request)
    ),
    /** @type {Promise<{ hourlyForecasts?: GoogleConditions[] }>} */ (
      postJson(
        `${BASE_URL}/forecast:lookup`,
        {
          location,
          period: { startTime: start.toISOString(), endTime: end.toISOString() },
          extraComputations: ['POLLUTANT_CONCENTRATION'],
          pageSize: FORECAST_HOURS,
        },
        request,
      )
    ),
  ]);

  const pm25 = concentration(current.pollutants, 'pm25');
  if (pm25 === null) throw new UpstreamError('Google Air Quality returned no PM2.5 data for this location.');
  const hourly = (forecast.hourlyForecasts ?? [])
    .map((h) => ({ time: h.dateTime ?? '', pm25: concentration(h.pollutants, 'pm25'), pm10: concentration(h.pollutants, 'pm10') }))
    .filter(/** @returns {h is { time: string, pm25: number, pm10: number | null }} */ (h) => h.pm25 !== null && h.time !== '');

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
    hourly,
    localIndex: localIndex(current.indexes),
  };
}
