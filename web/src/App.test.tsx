import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '@/lib/api';
import { expectNoAxeViolations } from '@/test/axe';
import { PLAN_RESPONSE } from '@/test/fixtures';
import App from './App';

const PLACES: Place[] = [
  {
    name: 'Delhi',
    region: 'National Capital Territory of Delhi',
    country: 'India',
    lat: 28.65,
    lon: 77.23,
    timeZone: 'Asia/Kolkata',
  },
  {
    name: 'Delhi',
    region: 'New York',
    country: 'United States',
    lat: 42.28,
    lon: -74.92,
    timeZone: 'America/New_York',
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake backend: the same routes the real server exposes, answering with fixtures. */
function fakeApi(planStatus = 200) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/health'))
      return json({
        status: 'ok',
        ai: { enabled: true, model: 'gemini-flash-lite-latest' },
        airSource: 'open-meteo',
      });
    if (url.startsWith('/api/places')) return json({ places: PLACES });
    if (url.startsWith('/api/plan')) {
      return planStatus === 200
        ? json(PLAN_RESPONSE)
        : json(
            {
              error: 'Please check the highlighted details.',
              errors: { 'home.roomAreaM2': 'Enter a number from 4 to 500.' },
            },
            planStatus,
          );
    }
    return json({ error: 'Unknown API route.' }, 404);
  });
}

async function chooseDelhi() {
  await userEvent.type(screen.getByRole('searchbox', { name: 'Where are you?' }), 'Delhi{Enter}');
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Delhi, National Capital Territory of Delhi, India',
    }),
  );
}

describe('BreatheWise journey', () => {
  let fetchMock: ReturnType<typeof fakeApi>;
  beforeEach(() => {
    fetchMock = fakeApi();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a location before building a plan', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Build my plan' }));
    expect(
      screen.getByText('Choose your city or use your current location first.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/plan'))).toBe(false);
  });

  it('searches, tells same-named places apart, and builds a plan for the one chosen', async () => {
    render(<App />);
    await chooseDelhi();
    expect(
      screen.getByText('Delhi, National Capital Territory of Delhi, India', { selector: 'strong' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Build my plan' }));
    expect(await screen.findByRole('heading', { name: 'US AQI 210' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your plan for Delhi' })).toHaveFocus();
    expect(screen.getByText('Your plan is ready.')).toBeInTheDocument();

    const planCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith('/api/plan'));
    const sent = JSON.parse(String(planCall?.[1]?.body));
    expect(sent.location).toEqual({
      lat: 28.65,
      lon: 77.23,
      name: 'Delhi',
      timeZone: 'Asia/Kolkata',
    });
    expect(sent.profile.household.adults).toBe(2);
  });

  it('passes the full-page accessibility audit once the plan is shown', async () => {
    const { container } = render(<App />);
    await chooseDelhi();
    await userEvent.click(screen.getByRole('button', { name: 'Build my plan' }));
    await screen.findByRole('heading', { name: 'US AQI 210' });
    await expectNoAxeViolations(container, { scope: 'page' });
  });

  it('shows field errors from the server next to the right input', async () => {
    vi.stubGlobal('fetch', fakeApi(400));
    render(<App />);
    await chooseDelhi();
    await userEvent.click(screen.getByRole('button', { name: 'Build my plan' }));
    expect(await screen.findByText('Please check the highlighted details.')).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Main room size (m²)' }),
    ).toHaveAccessibleDescription(/Enter a number from 4 to 500\./);
  });
});
