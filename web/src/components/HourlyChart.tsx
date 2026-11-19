import { useId } from 'react';
import { LineChart } from 'lucide-react';
import { formatTime } from '@/lib/format';
import { Card, CardTitle } from './ui';

/** EPA PM2.5 category bands (µg/m³) used to colour the bars; labels are in the data table. */
const BANDS = [
  { max: 9.0, color: '#00e400', label: 'Good' },
  { max: 35.4, color: '#ffff00', label: 'Moderate' },
  { max: 55.4, color: '#ff7e00', label: 'Unhealthy for Sensitive Groups' },
  { max: 125.4, color: '#ff0000', label: 'Unhealthy' },
  { max: 225.4, color: '#8f3f97', label: 'Very Unhealthy' },
  { max: Infinity, color: '#7e0023', label: 'Hazardous' },
];
const band = (pm25: number) => BANDS.find((b) => pm25 <= b.max) ?? BANDS[BANDS.length - 1];

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

/** Next 24 hours of PM2.5 as a bar chart, with a full data table for screen readers. */
export function HourlyChart({ hourly, timeZone }: { hourly: { time: string; pm25: number }[]; timeZone: string }) {
  const tableId = useId();
  if (hourly.length === 0) return null;
  const max = Math.max(...hourly.map((h) => h.pm25), 40);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barW = plotW / hourly.length;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const lowest = hourly.reduce((a, b) => (b.pm25 < a.pm25 ? b : a));
  const highest = hourly.reduce((a, b) => (b.pm25 > a.pm25 ? b : a));
  const summary = `PM2.5 over the next ${hourly.length} hours: lowest ${lowest.pm25} µg/m³ at ${formatTime(lowest.time, timeZone)}, highest ${highest.pm25} µg/m³ at ${formatTime(highest.time, timeZone)}.`;

  return (
    <Card labelledBy="chart-title">
      <CardTitle id="chart-title" icon={<LineChart className="h-4 w-4" />}>
        Next 24 hours
      </CardTitle>
      <p className="mb-3 text-sm text-ink-muted">{summary}</p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} aria-describedby={tableId} className="h-auto w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke="#d3dad6" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#4b5b68">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {hourly.map((h, i) => (
          <rect key={h.time} x={PAD.left + i * barW + 1} y={y(h.pm25)} width={Math.max(barW - 2, 1)} height={PAD.top + plotH - y(h.pm25)} fill={band(h.pm25).color} stroke="#14202b" strokeOpacity="0.25" rx="2" />
        ))}
        {hourly.map((h, i) =>
          i % 3 === 0 ? (
            <text key={`l-${h.time}`} x={PAD.left + i * barW + barW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill="#4b5b68">
              {formatTime(h.time, timeZone)}
            </text>
          ) : null,
        )}
      </svg>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-leaf-700">Show hourly values</summary>
        <table id={tableId} className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Hourly PM2.5 forecast</caption>
          <thead>
            <tr className="text-ink-faint">
              <th scope="col" className="py-1 font-semibold">Time</th>
              <th scope="col" className="py-1 font-semibold">PM2.5 (µg/m³)</th>
              <th scope="col" className="py-1 font-semibold">Category</th>
            </tr>
          </thead>
          <tbody>
            {hourly.map((h) => (
              <tr key={h.time} className="border-t border-haze-100">
                <td className="py-1">{formatTime(h.time, timeZone)}</td>
                <td className="py-1 tabular-nums">{h.pm25}</td>
                <td className="py-1">{band(h.pm25).label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
