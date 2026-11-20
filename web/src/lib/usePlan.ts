import { useEffect, useState } from 'react';
import { api, ApiError, type Location, type PlanResponse, type Profile } from './api';
import { STARTER_PROFILE } from './profile';

/**
 * Everything the page needs to collect a location and profile and turn them into a plan:
 * the inputs, the result, per-field errors from the API, and a status line for screen readers.
 */
export function usePlan() {
  const [location, setLocation] = useState<Location | null>(null);
  const [profile, setProfile] = useState<Profile>(STARTER_PROFILE);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function buildPlan() {
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

  return { location, setLocation, profile, setProfile, result, errors, status, busy, buildPlan };
}

/** Whether the server has Gemini configured (the Ask box is hidden behind this). */
export function useAiEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api.health().then(
      (health) => setEnabled(health.ai.enabled),
      () => setEnabled(false),
    );
  }, []);
  return enabled;
}
