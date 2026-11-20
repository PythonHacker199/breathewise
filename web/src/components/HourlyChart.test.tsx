import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLAN_RESPONSE } from '@/test/fixtures';
import { HourlyChart } from './HourlyChart';

const { hourly, timeZone } = PLAN_RESPONSE.air;
const SUMMARY = 'PM2.5 over the next 3 hours: lowest 55.8 µg/m³ at 22:00, highest 162.1 µg/m³ at 21:00.';

describe('HourlyChart', () => {
  it('describes the forecast in words, in the location time zone', () => {
    render(<HourlyChart hourly={hourly} timeZone={timeZone} />);
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: SUMMARY })).toBeInTheDocument();
  });

  it('colours each bar with the category the server computed', () => {
    const { container } = render(<HourlyChart hourly={hourly} timeZone={timeZone} />);
    const fills = Array.from(container.querySelectorAll('rect'), (rect) => rect.getAttribute('fill'));
    expect(fills).toEqual(['#8f3f97', '#8f3f97', '#ff0000']);
  });

  it('offers every hour as a table, with the category named in text', () => {
    render(<HourlyChart hourly={hourly} timeZone={timeZone} />);
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('20:00135Very Unhealthy');
    expect(rows[3]).toHaveTextContent('22:0055.8Unhealthy');
  });

  it('renders nothing without forecast data', () => {
    const { container } = render(<HourlyChart hourly={[]} timeZone={timeZone} />);
    expect(container).toBeEmptyDOMElement();
  });
});
