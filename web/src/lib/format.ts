/** Display helpers. */

/** Relative luminance of a #rrggbb colour (WCAG 2.x definition). */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Black or white text, whichever contrasts more with the background colour. */
export function textOn(hex: string): '#000000' | '#ffffff' {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
}

/** "19:30" in the location's time zone. */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Google Calendar event template for a time window (UTC instants). */
export function googleCalendarUrl(
  title: string,
  startIso: string,
  endIso: string,
  details: string,
): string {
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(startIso)}/${stamp(endIso)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const formatNumber = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n);
