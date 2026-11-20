/**
 * Air-quality lookup with Google as the primary source and Open-Meteo as the fallback.
 * Both are queried in parallel: Open-Meteo also supplies the location's time zone when the
 * browser didn't, and keeps the app working if Google is unavailable or not configured.
 */
import { createTtlCache } from '../http/limits.js';
import { fetchGoogleAir } from './googleAirQuality.js';
import { fetchOpenMeteoAir } from './openMeteo.js';
import { UpstreamError } from './http.js';

/** Air quality changes hourly; reuse a lookup for the same spot for this long. */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/**
 * @param {{ googleApiKey?: string, fetchImpl?: typeof fetch, now?: () => Date, log?: Pick<Console, 'warn'> }} options
 */
export function createAirProvider({
  googleApiKey,
  fetchImpl,
  now = () => new Date(),
  log = console,
}) {
  /** @type {ReturnType<typeof createTtlCache<import('../science/plan.js').AirData>>} */
  const cache = createTtlCache({ max: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS });

  /**
   * @param {{ lat: number, lon: number, timeZone?: string }} location coordinates already rounded to ~1 km
   * @returns {Promise<import('../science/plan.js').AirData>}
   */
  async function lookup(location) {
    const key = `${location.lat},${location.lon}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const openMeteo = fetchOpenMeteoAir(location, { fetchImpl });
    let air;
    if (googleApiKey) {
      try {
        const timeZone =
          location.timeZone ??
          (await openMeteo.then(
            (d) => d.timeZone,
            () => 'UTC',
          ));
        air = await fetchGoogleAir(location, {
          apiKey: googleApiKey,
          timeZone,
          now: now(),
          fetchImpl,
        });
        if (air.hourly.length === 0) {
          throw new UpstreamError('Google Air Quality returned no forecast.');
        }
      } catch (err) {
        log.warn(
          `Google Air Quality failed, using Open-Meteo: ${err instanceof Error ? err.message : String(err)}`,
        );
        air = undefined;
      }
    }
    if (!air) {
      air = await openMeteo;
      if (location.timeZone) air = { ...air, timeZone: location.timeZone };
    } else {
      openMeteo.catch(() => {}); // fallback not needed; ignore its outcome
    }
    cache.set(key, air);
    return air;
  }

  return { lookup, source: googleApiKey ? 'google' : 'open-meteo' };
}
