import { useId } from 'react';
import { LineChart } from 'lucide-react';
import type { HourlyPoint } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { Card, CardTitle } from './ui';

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };
/** The y-axis always reaches at least 40 µg/m³, so a clean day doesn't look alarming. */
const MIN_Y_MAX = 40;
/** Label every third hour so the axis stays readable on phones. */
const LABEL_EVERY = 3;
const GRID_FRACTIONS = [0, 0.5, 1];

function describe(hourly: HourlyPoint[], timeZone: string) {
  const lowest = hourly.reduce((a, b) => (b.pm25 < a.pm25 ? b : a));
  const highest = hourly.reduce((a, b) => (b.pm25 > a.pm25 ? b : a));
  return `PM2.5 over the next ${hourly.length} hours: lowest ${lowest.pm25} µg/m³ at ${formatTime(lowest.time, timeZone)}, highest ${highest.pm25} µg/m³ at ${formatTime(highest.time, timeZone)}.`;
}

/** Pixel geometry for one chart: where each hour's bar sits and how tall a value is. */
function chartScale(hourly: HourlyPoint[]) {
  const max = Math.max(...hourly.map((h) => h.pm25), MIN_Y_MAX);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barW = plotW / hourly.length;
  const baseline = PAD.top + plotH;
  return {
    max,
    barW,
    baseline,
    x: (i: number) => PAD.left + i * barW,
    y: (value: number) => baseline - (value / max) * plotH,
  };
}

type Scale = ReturnType<typeof chartScale>;

function GridLines({ scale }: { scale: Scale }) {
  return GRID_FRACTIONS.map((f) => {
    const y = scale.y(scale.max * f);
    return (
      <g key={f}>
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={y}
          y2={y}
          stroke="#d3dad6"
          strokeDasharray="3 3"
        />
        <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#4b5b68">
          {Math.round(scale.max * f)}
        </text>
      </g>
    );
  });
}

function TimeLabels({
  hourly,
  timeZone,
  scale,
}: {
  hourly: HourlyPoint[];
  timeZone: string;
  scale: Scale;
}) {
  return hourly.map((h, i) =>
    i % LABEL_EVERY === 0 ? (
      <text
        key={h.time}
        x={scale.x(i) + scale.barW / 2}
        y={HEIGHT - 8}
        textAnchor="middle"
        fontSize="11"
        fill="#4b5b68"
      >
        {formatTime(h.time, timeZone)}
      </text>
    ) : null,
  );
}

/** Bars coloured by the server's EPA category for each hour (the category name is in the table). */
function Bars({
  hourly,
  timeZone,
  label,
  describedBy,
}: {
  hourly: HourlyPoint[];
  timeZone: string;
  label: string;
  describedBy: string;
}) {
  const scale = chartScale(hourly);
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      className="h-auto w-full"
    >
      <GridLines scale={scale} />
      {hourly.map((h, i) => (
        <rect
          key={h.time}
          x={scale.x(i) + 1}
          y={scale.y(h.pm25)}
          width={Math.max(scale.barW - 2, 1)}
          height={scale.baseline - scale.y(h.pm25)}
          fill={h.category.color}
          stroke="#14202b"
          strokeOpacity="0.25"
          rx="2"
        />
      ))}
      <TimeLabels hourly={hourly} timeZone={timeZone} scale={scale} />
    </svg>
  );
}

function HourlyTable({
  id,
  hourly,
  timeZone,
}: {
  id: string;
  hourly: HourlyPoint[];
  timeZone: string;
}) {
  return (
    <table id={id} className="mt-2 w-full text-left text-sm">
      <caption className="sr-only">Hourly PM2.5 forecast</caption>
      <thead>
        <tr className="text-ink-faint">
          <th scope="col" className="py-1 font-semibold">
            Time
          </th>
          <th scope="col" className="py-1 font-semibold">
            PM2.5 (µg/m³)
          </th>
          <th scope="col" className="py-1 font-semibold">
            Category
          </th>
        </tr>
      </thead>
      <tbody>
        {hourly.map((h) => (
          <tr key={h.time} className="border-t border-haze-100">
            <td className="py-1">{formatTime(h.time, timeZone)}</td>
            <td className="py-1 tabular-nums">{h.pm25}</td>
            <td className="py-1">{h.category.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Next 24 hours of PM2.5 as a bar chart, with a text summary and a full data table for screen readers. */
export function HourlyChart({ hourly, timeZone }: { hourly: HourlyPoint[]; timeZone: string }) {
  const tableId = useId();
  if (hourly.length === 0) return null;
  const summary = describe(hourly, timeZone);
  return (
    <Card labelledBy="chart-title">
      <CardTitle id="chart-title" icon={<LineChart className="h-4 w-4" />}>
        Next 24 hours
      </CardTitle>
      <p className="mb-3 text-sm text-ink-muted">{summary}</p>
      <Bars hourly={hourly} timeZone={timeZone} label={summary} describedBy={tableId} />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-leaf-700">
          Show hourly values
        </summary>
        <HourlyTable id={tableId} hourly={hourly} timeZone={timeZone} />
      </details>
    </Card>
  );
}
