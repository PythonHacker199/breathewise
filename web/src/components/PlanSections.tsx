import { Bus, CalendarPlus, Clock, ExternalLink, House, Leaf, ShieldCheck } from 'lucide-react';
import type { Action, CommuteSummary, RoutineItem } from '@/lib/api';
import { formatNumber, googleCalendarUrl } from '@/lib/format';
import { Card, CardTitle } from './ui';

/** Today's low-exposure routine, with Google Calendar reminders for timed items. */
export function RoutineCard({ items, placeName }: { items: RoutineItem[]; placeName: string }) {
  if (items.length === 0) return null;
  return (
    <Card labelledBy="routine-title">
      <CardTitle id="routine-title" icon={<Clock className="h-4 w-4" />}>
        Your low-exposure day
      </CardTitle>
      <ol className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="border-l-4 border-leaf-600 pl-4">
            {item.when && <p className="text-sm font-bold tabular-nums text-leaf-700">{item.when}</p>}
            <h3 className="font-semibold text-ink">{item.title}</h3>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{item.detail}</p>
            {item.startIso && item.endIso && (
              <a
                href={googleCalendarUrl(`${item.title} (${placeName})`, item.startIso, item.endIso, item.detail)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-700 underline-offset-2 hover:underline"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add to Google Calendar
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

const GROUPS = [
  { key: 'indoor', title: 'Indoor air fixes', icon: <House className="h-4 w-4" /> },
  { key: 'routine', title: 'Protect yourself outside', icon: <ShieldCheck className="h-4 w-4" /> },
  { key: 'sustainable', title: 'Cut pollution at the source', icon: <Leaf className="h-4 w-4" /> },
] as const;

/** Personalised actions grouped by kind, each with its measured impact and source. */
export function ActionsCard({ actions }: { actions: Action[] }) {
  return (
    <Card labelledBy="actions-title">
      <h2 id="actions-title" className="mb-1 font-display text-xl font-semibold text-ink">
        What to do, and what it changes
      </h2>
      <p className="mb-5 text-sm text-ink-muted">Every impact below is calculated for your household; sources are linked.</p>
      <div className="space-y-6">
        {GROUPS.map((group) => {
          const list = actions.filter((a) => a.category === group.key);
          if (list.length === 0) return null;
          return (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              <h3 id={`group-${group.key}`} className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-leaf-700">
                <span aria-hidden="true">{group.icon}</span> {group.title}
              </h3>
              <ul className="grid gap-3 md:grid-cols-2">
                {list.map((a) => (
                  <li key={a.id} className="rounded-xl border border-haze-200 p-4">
                    <h4 className="font-semibold text-ink">{a.title}</h4>
                    <p className="mt-1.5 rounded-lg bg-haze-50 px-3 py-2 text-sm font-medium text-ink">
                      <span className="sr-only">Impact: </span>
                      {a.impact}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a.why}</p>
                    <p className="mt-2 text-xs text-ink-faint">
                      Source:{' '}
                      {a.source.url ? (
                        <a
                          href={a.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-2"
                        >
                          {a.source.label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : (
                        a.source.label
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

/** Yearly commute emissions and the best lower-carbon alternatives. */
export function CommuteCard({ commute }: { commute: CommuteSummary }) {
  return (
    <Card labelledBy="commute-title">
      <CardTitle id="commute-title" icon={<Bus className="h-4 w-4" />}>
        Your commute&apos;s footprint
      </CardTitle>
      <p className="text-ink">
        <strong>{commute.label}:</strong> about <strong>{formatNumber(commute.kgPerYear)} kg CO₂e a year</strong> ({formatNumber(commute.kgPerWeek)} kg a week).
      </p>
      {commute.alternatives.length > 0 && (
        <table className="mt-4 w-full text-left text-sm">
          <caption className="mb-2 text-left text-sm font-semibold text-ink">Lower-emission alternatives</caption>
          <thead className="text-ink-faint">
            <tr>
              <th scope="col" className="py-1.5 font-semibold">
                Option
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                kg CO₂e a year
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                You save
              </th>
            </tr>
          </thead>
          <tbody>
            {commute.alternatives.map((alt) => (
              <tr key={alt.mode} className="border-t border-haze-100">
                <th scope="row" className="py-1.5 font-medium text-ink">
                  {alt.label}
                </th>
                <td className="py-1.5 text-right tabular-nums">{formatNumber(alt.kgPerYear)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-leaf-700">
                  {formatNumber(alt.kgSavedPerYear)} kg ({alt.percentSaved}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-ink-faint">Factors: UK DESNZ 2022 greenhouse gas conversion factors (per passenger-km, one person per car).</p>
    </Card>
  );
}
