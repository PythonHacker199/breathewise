import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type Location, type PlanResponse, type Profile } from '@/lib/api';
import { DEFAULT_PROFILE } from '@/lib/profile';
import { AirSummary } from '@/components/AirSummary';
import { AskCard, CoachCard } from '@/components/CoachCard';
import { HourlyChart } from '@/components/HourlyChart';
import { LocationPicker } from '@/components/LocationPicker';
import { ActionsCard, CommuteCard, RoutineCard } from '@/components/PlanSections';
import { ProfileForm } from '@/components/ProfileForm';
import { BUTTON_PRIMARY, Card } from '@/components/ui';

export default function App() {
  const [location, setLocation] = useState<Location | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    api.health().then((h) => setAiEnabled(h.ai.enabled), () => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (result) resultsRef.current?.focus();
  }, [result]);

  async function buildPlan(e: FormEvent) {
    e.preventDefault();
    if (!location) {
      setStatus('Choose your city or use your current location first.');
      return;
    }
    setBusy(true);
    setErrors({});
    setStatus('Checking the air and building your plan…');
    try {
      setResult(await api.plan(location, profile));
      setStatus('Your plan is ready.');
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors);
      setStatus(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-leaf-700 focus:px-4 focus:py-2 focus:text-white">
        Skip to main content
      </a>
      <header className="border-b border-haze-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <div>
            <p className="font-display text-2xl font-bold text-ink">BreatheWise</p>
            <p className="text-sm text-ink-muted">A clean-air plan for your family during smog season</p>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[400px_1fr] lg:items-start">
        <Card labelledBy="setup-title" className="lg:sticky lg:top-4">
          <h1 id="setup-title" className="mb-1 font-display text-2xl font-bold text-ink">
            Plan your clean-air day
          </h1>
          <p className="mb-5 text-sm text-ink-muted">Tell us where you are and about your home. Every number in your plan is calculated, not guessed.</p>
          <LocationPicker value={location} onChange={setLocation} />
          <form onSubmit={buildPlan} noValidate className="mt-5 space-y-5">
            <ProfileForm profile={profile} errors={errors} onChange={setProfile} />
            <button type="submit" className={`${BUTTON_PRIMARY} w-full`} disabled={busy}>
              {busy ? 'Building your plan…' : 'Build my plan'}
            </button>
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-muted">
              {status}
            </p>
          </form>
        </Card>

        <div className="space-y-6" aria-busy={busy}>
          {!result ? (
            <Card labelledBy="intro-title">
              <h2 id="intro-title" className="font-display text-xl font-semibold text-ink">
                What you&apos;ll get
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-muted">
                <li>Live air quality for your location, with what it means in plain words.</li>
                <li>The cleanest and worst hours today, so you can time exercise, school runs and airing the home.</li>
                <li>Indoor fixes sized to your room, and how much each one lowers what you breathe.</li>
                <li>Lower-emission travel options and the CO₂ they save each year.</li>
                <li>A Gemini coach that explains it all for your family, without making up numbers.</li>
              </ul>
            </Card>
          ) : (
            <>
              <h2 ref={resultsRef} tabIndex={-1} className="sr-only">
                Your plan for {result.place.name}
              </h2>
              <AirSummary assessment={result.plan.assessment} placeName={result.place.name} />
              <CoachCard coach={result.coach} />
              <RoutineCard items={result.plan.routine.items} placeName={result.place.name} />
              <HourlyChart hourly={result.air.hourly} timeZone={result.air.timeZone} />
              <ActionsCard actions={result.plan.actions} />
              <CommuteCard commute={result.plan.commute} />
              <AskCard location={result.place} profile={profile} enabled={aiEnabled} />
            </>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-faint">
        Health guidance follows the US EPA, WHO and India&apos;s CPCB; it is general information, not medical advice. If anyone has trouble breathing or chest pain, seek
        medical help.
      </footer>
    </>
  );
}
