import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import serverless, {
  createApp,
  createHandler,
  optionsFromEnv,
  SECURITY_HEADERS,
} from '../server.js';
import { overallAqi } from '../src/science/aqi.js';
import {
  NOW,
  fakeFetch,
  geminiReply,
  geocodingFixture,
  json,
  openMeteoAirFixture,
} from './helpers.js';

const quiet = { log() {}, warn() {}, error() {} };
const LOCATION = { lat: 28.65, lon: 77.23, name: 'Delhi', timeZone: 'Asia/Kolkata' };
const upstream = {
  'geocoding-api': () => json(geocodingFixture()),
  'air-quality-api': () => json(openMeteoAirFixture()),
  generateContent: () =>
    json(geminiReply('Today PM2.5 is 64.3 µg/m³. It is 50 times worse than ever.')),
};

/** @param {Parameters<typeof createApp>[0]} [options] */
async function start(options = {}) {
  const server = await createApp({
    now: () => NOW,
    log: quiet,
    webDir: null,
    fetchImpl: fakeFetch(upstream),
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

/** @param {string} base @param {string} route @param {unknown} body */
const post = (base, route, body) =>
  fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('API without Gemini', () => {
  /** @type {Awaited<ReturnType<typeof start>>} */
  let app;
  before(async () => {
    app = await start();
  });
  after(() => app.close());

  test('health reports the data sources', async () => {
    const res = await fetch(`${app.base}/api/health`);
    assert.deepEqual(await res.json(), {
      status: 'ok',
      ai: { enabled: false, model: null },
      airSource: 'open-meteo',
    });
    for (const name of Object.keys(SECURITY_HEADERS)) assert.ok(res.headers.get(name), name);
  });

  test('place search', async () => {
    const { places } = await (await fetch(`${app.base}/api/places?q=Delhi`)).json();
    assert.equal(places[0].timeZone, 'Asia/Kolkata');
    assert.equal((await fetch(`${app.base}/api/places?q=D`)).status, 400);
  });

  test('plan returns computed numbers, a 24-hour chart and a curated coach', async () => {
    const res = await post(app.base, '/api/plan', { location: LOCATION, profile: {} });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.plan.assessment.aqi, 157);
    assert.equal(body.plan.assessment.category.label, 'Unhealthy');
    assert.equal(body.air.hourly.length, 24);
    assert.equal(body.coach.source, 'curated');
    assert.equal(body.place.name, 'Delhi');
  });

  test('every chart hour carries the EPA category the server computed, so the browser never re-derives it', async () => {
    const body = await (
      await post(app.base, '/api/plan', { location: LOCATION, profile: {} })
    ).json();
    for (const hour of body.air.hourly) {
      assert.deepEqual(Object.keys(hour).sort(), ['category', 'pm25', 'time']);
      const { key, label, color } = overallAqi({ pm25: hour.pm25 }).category;
      assert.deepEqual(hour.category, { key, label, color });
    }
  });

  test('invalid input lists field errors', async () => {
    const res = await post(app.base, '/api/plan', {
      location: { lat: 200 },
      profile: { commute: { mode: 'rocket' } },
    });
    assert.equal(res.status, 400);
    const { errors } = await res.json();
    assert.ok(errors['location.lat']);
    assert.ok(errors['commute.mode']);
  });

  test('ask needs Gemini', async () => {
    assert.equal(
      (
        await post(app.base, '/api/ask', {
          location: LOCATION,
          profile: {},
          question: 'Is it safe?',
        })
      ).status,
      503,
    );
  });

  test('rejects wrong content type, malformed JSON, oversized bodies and unknown routes', async () => {
    assert.equal(
      (
        await fetch(`${app.base}/api/plan`, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'x',
        })
      ).status,
      415,
    );
    assert.equal((await post(app.base, '/api/plan', '{oops')).status, 400);
    assert.equal(
      (await post(app.base, '/api/plan', { profile: { notes: 'x'.repeat(20_000) } })).status,
      413,
    );
    assert.equal((await fetch(`${app.base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/plan`)).status, 405);
    assert.equal((await fetch(`${app.base}/`, { method: 'DELETE' })).status, 405);
  });
});

describe('API with Gemini', () => {
  test('answers are grounded in the plan', async () => {
    const app = await start({ geminiApiKey: 'k', fallbackModels: [] });
    try {
      const res = await post(app.base, '/api/ask', {
        location: LOCATION,
        profile: {},
        question: 'How bad is it today?',
      });
      const body = await res.json();
      assert.equal(body.answer, 'Today PM2.5 is 64.3 µg/m³.');
      assert.equal(
        (await post(app.base, '/api/ask', { location: LOCATION, profile: {}, question: '?' }))
          .status,
        400,
      );
    } finally {
      await app.close();
    }
  });
});

describe('upstream failure and rate limiting', () => {
  test('air data outage is a clear 502', async () => {
    const app = await start({ fetchImpl: fakeFetch({ 'air-quality-api': () => json({}, 503) }) });
    try {
      const res = await post(app.base, '/api/plan', { location: LOCATION, profile: {} });
      assert.equal(res.status, 502);
      assert.match((await res.json()).error, /unavailable/);
    } finally {
      await app.close();
    }
  });

  test('returns 429 with Retry-After once the limit is hit', async () => {
    const app = await start({ rateLimit: { windowMs: 60_000, max: 1 } });
    try {
      assert.equal((await fetch(`${app.base}/api/places?q=Delhi`)).status, 200);
      const limited = await fetch(`${app.base}/api/places?q=Delhi`);
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get('retry-after')) > 0);
    } finally {
      await app.close();
    }
  });
});

describe('static app', () => {
  test('serves the build with SPA fallback, immutable assets and no traversal', async () => {
    const webDir = await mkdtemp(path.join(tmpdir(), 'breathewise-web-'));
    await mkdir(path.join(webDir, 'assets'));
    await writeFile(path.join(webDir, 'index.html'), '<!doctype html><title>BreatheWise</title>');
    await writeFile(path.join(webDir, 'assets', 'app-1a2b.js'), 'console.log(1)');
    const app = await start({ webDir });
    try {
      const page = await fetch(`${app.base}/`, { headers: { 'accept-encoding': 'gzip' } });
      assert.match(await page.text(), /BreatheWise/);
      assert.equal(page.headers.get('content-encoding'), 'gzip');
      assert.equal(
        (
          await fetch(`${app.base}/`, {
            headers: { 'if-none-match': page.headers.get('etag') ?? '' },
          })
        ).status,
        304,
      );
      assert.match(await (await fetch(`${app.base}/plan`)).text(), /BreatheWise/);
      assert.match(
        (await fetch(`${app.base}/assets/app-1a2b.js`)).headers.get('cache-control') ?? '',
        /immutable/,
      );
      for (const route of ['/missing.js', '/../server.js', '/src/app.js']) {
        assert.equal((await fetch(`${app.base}${route}`)).status, 404, route);
      }
      // Extension-less paths get the app shell, never a file from disk.
      assert.match(await (await fetch(`${app.base}/.env`)).text(), /BreatheWise/);
    } finally {
      await app.close();
      await rm(webDir, { recursive: true, force: true });
    }
  });
});

describe('optionsFromEnv', () => {
  test('reads keys, models and proxy trust', () => {
    const opts = optionsFromEnv({
      GEMINI_API_KEY: ' g ',
      GOOGLE_AIR_QUALITY_API_KEY: 'a',
      GEMINI_FALLBACK_MODELS: 'x, ,y',
      K_SERVICE: 'svc',
    });
    assert.deepEqual(opts, {
      geminiApiKey: 'g',
      airQualityApiKey: 'a',
      model: undefined,
      fallbackModels: ['x', 'y'],
      trustProxy: true,
    });
    assert.equal(optionsFromEnv({ GEMINI_API_KEY: '  ' }).geminiApiKey, undefined);
  });
});

/** Start a plain http server around a request handler and check /api/health. @param {http.RequestListener} handle */
async function assertHealthy(handle) {
  const server = http.createServer(handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.ai.enabled, 'boolean');
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('Vercel deployment', () => {
  test('trusts the proxy on Vercel', () => {
    assert.equal(optionsFromEnv({ VERCEL: '1' }).trustProxy, true);
    assert.equal(optionsFromEnv({}).trustProxy, false);
  });

  test('vercel.json sends the same security headers as the server and ships the built app with the function', async () => {
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    const all = config.headers.find((/** @type {{ source: string }} */ h) => h.source === '/(.*)');
    assert.deepEqual(
      Object.fromEntries(
        all.headers.map((/** @type {{ key: string, value: string }} */ h) => [h.key, h.value]),
      ),
      { ...SECURITY_HEADERS },
    );
    assert.equal(config.functions['server.js'].includeFiles, 'web/dist/**');
    assert.equal(config.outputDirectory, 'web/dist');
  });

  test('the shared handler answers API requests like the standalone server', async () => {
    await assertHealthy(
      await createHandler({
        now: () => NOW,
        log: quiet,
        webDir: null,
        fetchImpl: fakeFetch(upstream),
      }),
    );
  });

  test('the default export is a working serverless handler', async () => {
    await assertHealthy(serverless);
  });
});
