import { useState, type FormEvent } from 'react';
import { MessageCircleQuestion, Sparkles } from 'lucide-react';
import { api, ApiError, type Coach, type Location, type Profile } from '@/lib/api';
import { BUTTON_PRIMARY, Card, CardTitle, Field } from './ui';

/** Gemini's plain-language explanation of the plan (or the curated fallback, clearly labelled). */
export function CoachCard({ coach }: { coach: Coach }) {
  return (
    <Card labelledBy="coach-title" className="border-leaf-600/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="coach-title" icon={<Sparkles className="h-4 w-4" />}>
          Your coach
        </CardTitle>
        <span className="rounded-full bg-haze-100 px-3 py-1 text-xs font-semibold text-ink-muted">
          {coach.source === 'gemini' ? `Written by Gemini${coach.model ? ` (${coach.model})` : ''}` : 'Summary from your numbers'}
        </span>
      </div>
      <p className="leading-relaxed text-ink">{coach.summary}</p>
      <p className="mt-4 rounded-xl bg-leaf-700 px-4 py-3 font-semibold text-white">
        <span className="sr-only">Most important today: </span>
        {coach.oneThing}
      </p>
      {coach.todayPlan.length > 0 && (
        <>
          <h3 className="mt-5 font-semibold text-ink">Today</h3>
          <ol className="mt-2 space-y-1.5">
            {coach.todayPlan.map((step) => (
              <li key={`${step.time}-${step.action}`} className="flex gap-3 text-sm">
                <span className="w-24 flex-shrink-0 font-semibold tabular-nums text-leaf-700">{step.time}</span>
                <span className="text-ink">{step.action}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {coach.familyTips.length > 0 && (
        <>
          <h3 className="mt-5 font-semibold text-ink">For your family</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {coach.familyTips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {coach.whyItMatters.length > 0 && (
        <>
          <h3 className="mt-5 font-semibold text-ink">Why it matters</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {coach.whyItMatters.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-ink-faint">The coach can only quote numbers from your plan; any sentence with a number it made up is removed. Not medical advice.</p>
    </Card>
  );
}

/** Follow-up questions about the plan, answered by Gemini with the same number guardrail. */
export function AskCard({ location, profile, enabled }: { location: Location; profile: Profile; enabled: boolean }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim().length < 3) {
      setStatus('Type a question first.');
      return;
    }
    setBusy(true);
    setStatus('Thinking…');
    try {
      const res = await api.ask(location, profile, question.trim());
      setAnswer(res.answer);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Could not get an answer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card labelledBy="ask-title">
      <CardTitle id="ask-title" icon={<MessageCircleQuestion className="h-4 w-4" />}>
        Ask about your plan
      </CardTitle>
      {!enabled ? (
        <p className="text-sm text-ink-muted">Questions need the Gemini key on the server. Everything else above works without it.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field id="question" label="Your question" hint="e.g. Is it safe for my kids to play outside after school?">
            {(props) => <textarea {...props} rows={2} maxLength={400} value={question} onChange={(e) => setQuestion(e.target.value)} />}
          </Field>
          <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </form>
      )}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-ink-muted">
        {status}
      </p>
      {answer && <p className="whitespace-pre-line rounded-xl bg-haze-50 px-4 py-3 text-sm leading-relaxed text-ink">{answer}</p>}
    </Card>
  );
}
