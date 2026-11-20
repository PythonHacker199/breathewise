import { useState, type FormEvent } from 'react';
import { api, ApiError, type Location, type Profile } from './api';

/** Shortest question worth sending; the server enforces the same minimum. */
const MIN_QUESTION_LENGTH = 3;

/** A follow-up question about the current plan, its answer, and a status line for screen readers. */
export function useAsk(location: Location, profile: Profile) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim().length < MIN_QUESTION_LENGTH) {
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

  return { question, setQuestion, answer, status, busy, submit };
}
