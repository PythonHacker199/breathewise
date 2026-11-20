/**
 * Shared test fixtures: a fixed clock and a fake `fetch` that answers like Open-Meteo,
 * Google Air Quality and Gemini without touching the network.
 */

/** 10:30 UTC = 16:00 in Asia/Kolkata. */
export const NOW = new Date('2026-11-19T10:30:00Z');
export const BASE_UNIX = Date.UTC(2026, 10, 19, 0, 0) / 1000;
export const HOUR = 3600;

/**
 * PM2.5 by UTC hour index: 80 everywhere except a clean hour (14:00 UTC = 19:30 IST)
 * and a peak (12:00 UTC = 17:30 IST).
 * @param {number} i
 */
export const pm25At = (i) => (i % 24 === 14 ? 20 : i % 24 === 12 ? 150 : 80);

export function openMeteoAirFixture() {
  const time = Array.from({ length: 48 }, (_, i) => BASE_UNIX + i * HOUR);
  return {
    timezone: 'Asia/Kolkata',
    current: {
      time: BASE_UNIX + 10 * HOUR,
      pm2_5: 64.3,
      pm10: 65,
      nitrogen_dioxide: 67.5,
      ozone: 112,
    },
    hourly: {
      time,
      pm2_5: time.map((_, i) => (i === 47 ? null : pm25At(i))),
      pm10: time.map(() => 90),
    },
  };
}

export function geocodingFixture() {
  return {
    results: [
      {
        name: 'Delhi',
        admin1: 'Delhi',
        country: 'India',
        latitude: 28.65195,
        longitude: 77.23149,
        timezone: 'Asia/Kolkata',
      },
      { name: 'No coordinates' },
    ],
  };
}

export function googleCurrentFixture() {
  return {
    dateTime: '2026-11-19T10:00:00Z',
    indexes: [
      { code: 'uaqi', displayName: 'Universal AQI', aqi: 30, category: 'Low air quality' },
      { code: 'ind_cpcb', displayName: 'AQI (IN)', aqi: 182, category: 'Moderate air quality' },
    ],
    pollutants: [
      { code: 'pm25', concentration: { value: 70.2, units: 'MICROGRAMS_PER_CUBIC_METER' } },
      { code: 'pm10', concentration: { value: 120.5, units: 'MICROGRAMS_PER_CUBIC_METER' } },
      { code: 'no2', concentration: { value: 30, units: 'PARTS_PER_BILLION' } },
      { code: 'o3', concentration: { value: 10, units: 'PARTS_PER_BILLION' } },
    ],
  };
}

export function googleForecastFixture() {
  return {
    hourlyForecasts: Array.from({ length: 24 }, (_, k) => {
      const i = 11 + k;
      return {
        dateTime: new Date((BASE_UNIX + i * HOUR) * 1000).toISOString(),
        pollutants: [
          {
            code: 'pm25',
            concentration: { value: pm25At(i), units: 'MICROGRAMS_PER_CUBIC_METER' },
          },
        ],
      };
    }),
  };
}

/** @param {unknown} data @param {number} [status] */
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/**
 * Fake fetch routing by URL substring. Calls are recorded on `.calls`.
 * @param {Record<string, (url: string, init: RequestInit) => Response | Promise<Response>>} routes
 */
export function fakeFetch(routes) {
  /** @type {{ url: string, init: any }[]} */
  const calls = [];
  const fn = async (/** @type {any} */ url, /** @type {any} */ init = {}) => {
    calls.push({ url: String(url), init });
    const match = Object.keys(routes).find((key) => String(url).includes(key));
    if (!match) throw new Error(`Unexpected fetch: ${url}`);
    return routes[match](String(url), init);
  };
  return Object.assign(fn, { calls });
}

/** Gemini response wrapper. @param {string} text */
export const geminiReply = (text) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
});
