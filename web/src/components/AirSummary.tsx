import { Cigarette, Home, Wind } from 'lucide-react';
import type { Assessment } from '@/lib/api';
import { textOn } from '@/lib/format';
import { Card } from './ui';

const SOURCE_LABEL = {
  google: 'Google Air Quality API',
  'open-meteo': 'Open-Meteo (CAMS)',
} as const;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-haze-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-ink">{value}</dd>
      {note && <dd className="mt-0.5 text-sm text-ink-muted">{note}</dd>}
    </div>
  );
}

type AssessmentProps = { assessment: Assessment };

/** AQI with its category name in text (colour is never the only signal). */
function AqiHeading({ assessment, placeName }: AssessmentProps & { placeName: string }) {
  const { category } = assessment;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-ink-muted">Air quality now · {placeName}</p>
        <h2 id="air-now" className="mt-1 font-display text-3xl font-bold text-ink">
          US AQI {assessment.aqi}
        </h2>
      </div>
      <p
        className="rounded-full px-4 py-1.5 text-sm font-bold"
        style={{ background: category.color, color: textOn(category.color) }}
      >
        {category.label}
      </p>
    </div>
  );
}

/** What this air means for the body: WHO multiple, cigarette equivalent, indoor estimate. */
function ExposureStats({ assessment }: AssessmentProps) {
  return (
    <dl className="mt-5 grid gap-3 sm:grid-cols-3">
      <Stat
        label="PM2.5"
        value={`${assessment.pm25} µg/m³`}
        note={`${assessment.whoMultiple}× the WHO 24-hour guideline`}
      />
      <Stat
        label="Like smoking"
        value={`${assessment.cigarettesPerDay} cigarettes`}
        note="a day, if breathed outdoors all day"
      />
      <Stat
        label="Your main room"
        value={`≈ ${assessment.indoorEstimate} µg/m³`}
        note={`with windows shut (${assessment.indoorCigarettesPerDay} cigarettes a day)`}
      />
    </dl>
  );
}

/** Local index, the cigarette rule of thumb, and where the data came from. */
function ReadingNotes({ assessment }: AssessmentProps) {
  return (
    <>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        <li className="flex items-center gap-1.5">
          <Wind className="h-4 w-4" aria-hidden="true" /> India NAQI band for PM2.5:{' '}
          <strong className="text-ink">{assessment.indiaCategory}</strong>
        </li>
        {assessment.localIndex && (
          <li className="flex items-center gap-1.5">
            <Home className="h-4 w-4" aria-hidden="true" /> {assessment.localIndex.name}:{' '}
            <strong className="text-ink">{assessment.localIndex.aqi}</strong>
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <Cigarette className="h-4 w-4" aria-hidden="true" /> 22 µg/m³ for a day ≈ 1 cigarette
          (Berkeley Earth)
        </li>
      </ul>
      <p className="mt-3 text-xs text-ink-faint">
        Data: {SOURCE_LABEL[assessment.source]}. The US AQI is computed with the EPA&apos;s 2024
        breakpoints from the latest hourly PM2.5, so it shows what the day looks like if the air
        stays this way.
      </p>
    </>
  );
}

/** Today's air at a glance: the AQI, what it means for the household, and the data source. */
export function AirSummary({ assessment, placeName }: AssessmentProps & { placeName: string }) {
  return (
    <Card labelledBy="air-now">
      <AqiHeading assessment={assessment} placeName={placeName} />
      {assessment.sensitiveAlert && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-950"
        >
          Someone in your household is more sensitive to this air. Follow the routine below closely.
        </p>
      )}
      <ExposureStats assessment={assessment} />
      <ReadingNotes assessment={assessment} />
    </Card>
  );
}
