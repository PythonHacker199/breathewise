import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { fetchOpenMeteoAir, searchPlaces } from '../src/air/openMeteo.js';
import { concentration, fetchGoogleAir, localIndex, PPB_TO_UG_M3 } from '../src/air/googleAirQuality.js';
import { createAirProvider } from '../src/air/provider.js';
import { UpstreamError } from '../src/air/http.js';
import { NOW, fakeFetch, geocodingFixture, googleCurrentFixture, googleForecastFixture, json, openMeteoAirFixture } from './helpers.js';

const silent = { warn() {} };
const DELHI = { lat: 28.65, lon: 77.23 };

describe('Open-Meteo', () => {
  test('place search keeps only results with coordinates', async () => {
    const places = await searchPlaces('Delhi', { fetchImpl: fakeFetch({ 'geocoding-api': () => json(geocodingFixture()) }) });
    assert.deepEqual(places, [{ name: 'Delhi', region: 'Delhi', country: 'India', lat: 28.65195, lon: 77.23149, timeZone: 'Asia/Kolkata' }]);
  });

  test('air data is normalised to UTC instants and skips missing hours', async () => {
    const air = await fetchOpenMeteoAir(DELHI, { fetchImpl: fakeFetch({ 'air-quality-api': () => json(openMeteoAirFixture()) }) });
    assert.equal(air.source, 'open-meteo');
    assert.equal(air.timeZone, 'Asia/Kolkata');
    assert.equal(air.current.pm25, 64.3);
    assert.equal(air.current.time, '2026-11-19T10:00:00.000Z');
    assert.equal(air.hourly.length, 47);
    assert.equal(air.hourly[0].time, '2026-11-19T00:00:00.000Z');
  });

  test('errors are wrapped without leaking the response body', async () => {
    await assert.rejects(fetchOpenMeteoAir(DELHI, { fetchImpl: fakeFetch({ 'air-quality-api': () => json({ secret: 'x' }, 500) }) }), (err) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.status, 500);
      assert.ok(!err.message.includes('secret'));
      return true;
    });
    await assert.rejects(fetchOpenMeteoAir(DELHI, { fetchImpl: fakeFetch({ 'air-quality-api': () => json({ current: {} }) }) }), UpstreamError);
    await assert.rejects(
      fetchOpenMeteoAir(DELHI, {
        fetchImpl: async () => {
          throw new TypeError('offline');
        },
      }),
      /Could not reach/,
    );
  });
});

describe('Google Air Quality', () => {
  test('converts NO2 and O3 from ppb to µg/m³ at 25 °C', () => {
    const pollutants = googleCurrentFixture().pollutants;
    assert.equal(concentration(pollutants, 'pm25'), 70.2);
    assert.equal(concentration(pollutants, 'no2'), Math.round(30 * PPB_TO_UG_M3.no2 * 10) / 10);
    assert.equal(concentration(pollutants, 'no2'), 56.4);
    assert.equal(concentration(pollutants, 'o3'), 19.6);
    assert.equal(concentration(undefined, 'pm25'), null);
  });

  test('picks the local index, not the universal one', () => {
    assert.deepEqual(localIndex(googleCurrentFixture().indexes), { name: 'AQI (IN)', aqi: 182, category: 'Moderate air quality' });
    assert.equal(localIndex([{ code: 'uaqi', aqi: 10 }]), null);
  });

  test('requests current conditions and a 24-hour forecast with the key in a header', async () => {
    const fetchImpl = fakeFetch({ 'currentConditions:lookup': () => json(googleCurrentFixture()), 'forecast:lookup': () => json(googleForecastFixture()) });
    const air = await fetchGoogleAir(DELHI, { apiKey: 'secret-key', timeZone: 'Asia/Kolkata', now: NOW, fetchImpl });
    assert.equal(air.source, 'google');
    assert.equal(air.current.pm25, 70.2);
    assert.equal(air.hourly.length, 24);
    assert.equal(air.localIndex?.aqi, 182);
    for (const call of fetchImpl.calls) {
      assert.ok(!call.url.includes('secret-key'));
      assert.equal(call.init.headers['x-goog-api-key'], 'secret-key');
    }
    const forecastBody = JSON.parse(String(fetchImpl.calls.find((c) => c.url.includes('forecast'))?.init.body));
    assert.equal(forecastBody.period.startTime, '2026-11-19T11:00:00.000Z');
    assert.equal(forecastBody.period.endTime, '2026-11-20T10:00:00.000Z');
  });
});

describe('provider', () => {
  const routes = {
    'air-quality-api': () => json(openMeteoAirFixture()),
    'currentConditions:lookup': () => json(googleCurrentFixture()),
    'forecast:lookup': () => json(googleForecastFixture()),
  };

  test('prefers Google and takes the time zone from the browser', async () => {
    const provider = createAirProvider({ googleApiKey: 'k', fetchImpl: fakeFetch(routes), now: () => NOW, log: silent });
    const air = await provider.lookup({ ...DELHI, timeZone: 'Asia/Kolkata' });
    assert.equal(air.source, 'google');
    assert.equal(air.timeZone, 'Asia/Kolkata');
    assert.equal(provider.source, 'google');
  });

  test('falls back to Open-Meteo when Google fails', async () => {
    const fetchImpl = fakeFetch({ ...routes, 'currentConditions:lookup': () => json({}, 403) });
    const air = await createAirProvider({ googleApiKey: 'k', fetchImpl, now: () => NOW, log: silent }).lookup(DELHI);
    assert.equal(air.source, 'open-meteo');
  });

  test('uses Open-Meteo without a key and caches lookups', async () => {
    const fetchImpl = fakeFetch(routes);
    const provider = createAirProvider({ fetchImpl, now: () => NOW, log: silent });
    const first = await provider.lookup(DELHI);
    const calls = fetchImpl.calls.length;
    assert.deepEqual(await provider.lookup(DELHI), first);
    assert.equal(fetchImpl.calls.length, calls);
    assert.equal(provider.source, 'open-meteo');
  });

  test('fails when no source has data', async () => {
    const provider = createAirProvider({ fetchImpl: fakeFetch({ 'air-quality-api': () => json({}, 503) }), log: silent });
    await assert.rejects(provider.lookup(DELHI), UpstreamError);
  });
});
