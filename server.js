/**
 * BreatheWise entry point. The application itself is built in src/app.js; this file runs it:
 * - `node server.js` starts a standalone HTTP server (local development, Docker, Cloud Run);
 * - the default export is the per-request handler Vercel runs as a serverless function.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, createHandler, optionsFromEnv } from './src/app.js';

export { createApp, createHandler, optionsFromEnv, SECURITY_HEADERS } from './src/app.js';

/** @type {ReturnType<typeof createHandler> | undefined} */
let serverlessHandler;

/**
 * Serverless entry point. The handler is built once per instance and reused, so the
 * air-data cache stays warm between requests.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export default async function serverless(req, res) {
  serverlessHandler ??= createHandler(optionsFromEnv(process.env));
  const handle = await serverlessHandler;
  await handle(req, res);
}

/** Start a standalone server on PORT and shut down cleanly on SIGTERM/SIGINT. */
async function main() {
  const options = optionsFromEnv(process.env);
  const port = Number(process.env.PORT) || 8080;
  const server = await createApp(options);
  server.listen(port, () => {
    const ai = options.geminiApiKey ? 'Gemini' : 'curated';
    const airSource = options.airQualityApiKey ? 'Google + Open-Meteo' : 'Open-Meteo';
    console.log(
      `BreatheWise listening on http://localhost:${port} (AI: ${ai}, air data: ${airSource})`,
    );
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) await main();
