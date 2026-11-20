# BreatheWise

**A GenAI clean-air coach for families and communities living through winter smog.**

**Live:** https://breathewise-seven.vercel.app

BreatheWise looks up the live air where you are and asks a few questions about your household. It then builds a plan for today:

- **Low-exposure routine:** the cleanest and worst hours of the next 24, when to exercise or air the home, and when to keep children and older relatives inside. Each item has a one-click Google Calendar reminder.
- **Indoor air fixes sized to your room:** purifier CADR, a DIY box-fan filter, sealing up, and sources to remove (mosquito coils, incense, smoking, solid-fuel cooking). Each fix shows how much it lowers the PM2.5 you breathe.
- **Sustainable alternatives:** your commute's yearly CO₂e next to metro, rail, bus, EV, cycling or walking, plus clean heating and no-burning advice.
- **A Gemini coach** that explains the plan in plain language for your family and answers follow-up questions. It is **not allowed to invent numbers**: any sentence quoting a number that is not in the computed plan is removed before you see it.

> General information, not medical advice. If anyone has trouble breathing or chest pain, seek medical help.

## How it works

```
Browser (React, accessible)  ──POST /api/plan──▶  Node server (zero runtime deps)
                                                   │
                     ┌─────────────────────────────┼─────────────────────────────┐
                     ▼                             ▼                             ▼
          Google Air Quality API         Science engine (pure,          Gemini (structured
          (current + 24 h forecast)      tested functions)              JSON, fallback chain)
          ↳ Open-Meteo CAMS fallback     AQI · exposure · routine ·     ↳ number-grounding filter
                                         actions · emissions            ↳ curated fallback
```

1. **Air data:** the Google Air Quality API (current conditions plus a 24-hour forecast, including the local index such as India's CPCB AQI). If no key is set, or Google fails, Open-Meteo's CAMS air quality model is used instead. Results are cached for 15 minutes per rounded location.
2. **Science engine (`src/science`):** deterministic, unit-tested functions turn the readings and the household profile into an assessment, a routine, actions and commute numbers. Every constant is cited in the code.
3. **Coach (`src/ai`):** Gemini receives *only the computed facts* as JSON and returns a structured reply (`responseSchema`). `groundText` drops any sentence containing a number that is not in the facts. If Gemini is unavailable, a curated summary built from the same numbers is shown and clearly labelled.

## The science (and where every number comes from)

| What | Value / method | Source |
|---|---|---|
| US AQI | EPA piecewise-linear formula, PM2.5 breakpoints as revised 6 May 2024, PM10 breakpoints; concentrations truncated as the EPA specifies | US EPA, 40 CFR Part 58 App. G |
| India band | CPCB NAQI PM2.5 bands (Good ≤30 … Severe >250) | CPCB (2014) |
| WHO multiple | PM2.5 24-hour guideline 15 µg/m³, PM10 45, NO₂ 25 | WHO Global Air Quality Guidelines (2021) |
| "Like smoking" | 22 µg/m³ of PM2.5 for a day ≈ 1 cigarette | Berkeley Earth (2015) |
| Indoor estimate | C_in = C_out · P · a / (a + k + CADR/V); P = 1, k = 0.2/h, ceiling 2.7 m; air changes 0.3 / 0.5 / 1.0 per hour (sealed / average / leaky), 5 with windows open | US EPA *Guide to Air Cleaners in the Home* (2018); Riley et al. (2002) |
| Purifier size | CADR for 5 air changes per hour in your room | US EPA rule of thumb |
| Dose saved by timing exercise | Breathing 1.6 m³/h (moderate activity) × PM2.5 difference between the cleanest and worst hour | US EPA Exposure Factors Handbook (2011) |
| Commute CO₂e | g CO₂e per passenger-km: petrol car 170, diesel 171, plug-in hybrid 68, EV 47, motorbike 114, bus 97, metro 28, rail 35 | UK DESNZ conversion factors (2022), via Our World in Data |
| Mosquito coils | One coil ≈ 75–137 cigarettes of PM2.5 | Liu et al. (2003), *Environ. Health Perspect.* |
| Houseplants | 10–1,000 plants per m² needed to match normal ventilation, so they are flagged as a myth | Cummings & Waring (2020) |
| Household fuel | 3.2 million deaths in 2020 from household air pollution | WHO fact sheet |
| Masks | N95 filters capture at least 95% of test particles, and the fit matters as much; cloth and surgical masks protect far less | NIOSH, 42 CFR Part 84 |

Google's NO₂ and O₃ values (ppb) are converted to µg/m³ at 25 °C (× 46.0055 / 24.45 and × 47.9982 / 24.45).

## Google services used

- **Gemini API:** the coach and follow-up answers, using structured output, with a model fallback chain (the live site uses `gemini-flash-lite-latest` first, then `gemini-flash-latest`).
- **Google Air Quality API:** current conditions, local index and hourly forecast, used whenever `GOOGLE_AIR_QUALITY_API_KEY` is set. The public demo runs without it and uses Open-Meteo.
- **Google Calendar:** event-template links for each routine window.
- **Cloud Run and Secret Manager:** a ready `Dockerfile` and deploy command (below); keys are injected from Secret Manager.

## Security

- API keys live only on the server (Vercel encrypted environment variables or Secret Manager on Cloud Run, `.env` locally). The browser never sees them, and the Google key is sent in the `x-goog-api-key` header, not the URL.
- Strict Content Security Policy, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (geolocation only for this site) and `Cross-Origin-Opener-Policy`.
- All input is validated with explicit limits (`src/validate.js`); unknown fields are ignored and text is cleaned of control characters.
- Body-size limit, JSON-only API, per-IP rate limit (30 requests a minute), and upstream timeouts (8 s for air data, 15 s per Gemini model).
- Upstream error bodies are never sent to the client; logs are structured and contain no keys.
- Location is rounded to about 1 km before use or caching.
- The container runs as the unprivileged `node` user.

## Accessibility

- Semantic landmarks, a skip link, one `h1`, labelled regions and fieldsets, and every input tied to its label, hint and error.
- AQI categories are always named in text; colour is never the only signal, and text colour is picked for WCAG contrast against the EPA colours.
- The forecast chart has a text summary and a full data table.
- Status messages use `aria-live`, alerts use `role="alert"`, focus moves to the results when the plan is ready, and new-tab links say so.
- **Tested automatically:** every component, and the whole page after a plan is built, is audited with [axe-core](https://github.com/dequelabs/axe-core) against WCAG 2.2 AA on every push, and a guard test proves the audit really catches violations.

## Run locally

Requires Node 22+.

```bash
npm run setup
```

```bash
cp .env.example .env
```

Optionally add your keys to `.env`; the app works without them, using Open-Meteo and the curated coach.

```bash
npm run build
```

```bash
npm run dev
```

Open http://localhost:8788. For live-reloading UI work, run `npm run dev:web` in a second terminal; it proxies `/api` to the server.

## Quality checks

```bash
npm run check
```

This runs, in order, and the same steps run in GitHub Actions on every push:

- **Prettier** formatting check.
- **ESLint** with enforced maintainability limits on application code: cyclomatic complexity ≤ 10, nesting depth ≤ 3, functions of at most 50 lines (60 for React components), and at most 4 parameters per server function.
- **Strict TypeScript**: `checkJs` with JSDoc types on the server, `strict` on the web app, and no `any`.
- **71 server tests** (node:test): AQI breakpoints, exposure and emission maths, the routine and action rules, validation, both air providers, the Gemini client's fallback and the coach's number-grounding filter, and the HTTP layer (security headers, rate limits, body limits, static files, Vercel entry).
- **27 web tests** (Vitest + Testing Library): component behaviour, a full user journey with a fake backend (search, pick the right Delhi, build a plan, focus moves to the results, server field errors shown on the right input), and axe-core accessibility audits.

### Design notes

- **Rules, not branches.** Each personalised action in `src/science/actions.js` is a small rule that returns an action or `null`; `buildActions` runs them all and sorts by priority. Adding an action means adding one rule.
- **One source of truth.** AQI categories, levels and colours live in `src/science/aqi.js`; the API sends each forecast hour's category, so the browser never re-implements the EPA bands.
- **Shared handler.** `createHandler` in `server.js` serves the same app as a standalone Node server (Docker, Cloud Run) and as a Vercel function.

## Deploy

### Vercel (the live site)

`server.js` exports a default request handler, so Vercel runs the whole app as one function. `vercel.json` builds the React app, bundles `web/dist` with the function, pins the Mumbai region and sets the same security headers as the server (a test keeps them in sync).

```bash
vercel env add GEMINI_API_KEY production --sensitive
```

```bash
vercel deploy --prod
```

### Cloud Run

```bash
gcloud run deploy breathewise --source . --region asia-south1 --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest,GOOGLE_AIR_QUALITY_API_KEY=air-quality-api-key:latest
```

## Project layout

```
server.js              request handler, HTTP server, Vercel entry, env options
src/http/              JSON, static files, limits, security headers
src/routes/api.js      /api/health, /api/places, /api/plan, /api/ask
src/air/               Google Air Quality, Open-Meteo, provider with cache + fallback
src/science/           aqi, exposure, routine, actions (rules), sources, emissions, plan
src/ai/                Gemini client, coach prompts, number grounding
src/validate.js        profile, location and question validation
web/                   React + TypeScript + Tailwind UI (components, lib hooks, tests)
test/                  node:test suites
```

## License

MIT
