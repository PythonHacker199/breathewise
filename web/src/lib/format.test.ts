import { describe, expect, it } from 'vitest';
import { formatNumber, formatTime, googleCalendarUrl, luminance, textOn } from './format';

describe('luminance and textOn', () => {
  it('matches the WCAG definition at the extremes', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('picks the more readable text colour for each EPA category colour', () => {
    expect(textOn('#00e400')).toBe('#000000'); // Good
    expect(textOn('#ffff00')).toBe('#000000'); // Moderate
    expect(textOn('#ff7e00')).toBe('#000000'); // Sensitive groups
    expect(textOn('#8f3f97')).toBe('#ffffff'); // Very unhealthy
    expect(textOn('#7e0023')).toBe('#ffffff'); // Hazardous
  });
});

describe('formatTime', () => {
  it('shows the clock time in the location time zone', () => {
    expect(formatTime('2026-11-19T01:30:00Z', 'Asia/Kolkata')).toBe('07:00');
    expect(formatTime('2026-11-19T01:30:00Z', 'UTC')).toBe('01:30');
  });
});

describe('googleCalendarUrl', () => {
  it('builds a TEMPLATE link with UTC dates and encoded text', () => {
    const url = new URL(googleCalendarUrl('Walk & stretch', '2026-11-19T01:30:00.000Z', '2026-11-19T02:30:00Z', 'Cleanest hour'));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Walk & stretch');
    expect(url.searchParams.get('dates')).toBe('20261119T013000Z/20261119T023000Z');
    expect(url.searchParams.get('details')).toBe('Cleanest hour');
  });
});

describe('formatNumber', () => {
  it('uses Indian digit grouping and one decimal', () => {
    expect(formatNumber(123456.78)).toBe('1,23,456.8');
    expect(formatNumber(12)).toBe('12');
  });
});
