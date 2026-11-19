/**
 * Low-exposure daily routine from the hourly PM2.5 forecast: when to go out, when to air the
 * home, and which hours to avoid. Times are shown in the location's own time zone.
 */
import { overallAqi } from './aqi.js';
import { inhaledDose } from './exposure.js';

const HOUR_MS = 3_600_000;

/** Local hours considered for outdoor activity: from 06:00 up to (not including) 21:00. */
export const DAYTIME = Object.freeze({ start: 6, end: 21 });

/** PM2.5 at or below the top of the EPA "Moderate" band; above this, keep windows shut. */
export const VENTILATION_MAX_PM25 = 35.4;

/** @typedef {{ time: string, pm25: number, pm10?: number | null }} HourlyReading time is an ISO instant */

/**
 * @typedef {object} TimeWindow
 * @property {string} start ISO instant
 * @property {string} end ISO instant
 * @property {string} startLabel local "HH:MM"
 * @property {string} endLabel local "HH:MM"
 * @property {number} pm25 mean over the window, µg/m³
 * @property {number} aqi
 * @property {import('./aqi.js').AqiCategory} category
 */

/**
 * @typedef {object} RoutineItem
 * @property {string} id
 * @property {'exercise'|'ventilate'|'avoid'|'sensitive'} kind
 * @property {string} title
 * @property {string} detail
 * @property {string} [when] local time range
 * @property {string} [startIso] for calendar reminders
 * @property {string} [endIso]
 */

/**
 * @param {string} iso
 * @param {string} timeZone IANA name
 */
export function localHour(iso, timeZone) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}

/**
 * @param {string} iso
 * @param {string} timeZone IANA name
 * @returns {string} "HH:MM"
 */
export function localTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/**
 * Hourly readings from the current hour up to `hours` ahead, oldest first.
 * @param {HourlyReading[]} hourly
 * @param {Date} now
 * @param {number} [hours]
 */
export function upcomingHours(hourly, now, hours = 24) {
  const from = now.getTime() - HOUR_MS;
  const to = now.getTime() + hours * HOUR_MS;
  return hourly
    .filter((h) => {
      const t = Date.parse(h.time);
      return t > from && t < to;
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

/**
 * Cleanest (or most polluted) run of consecutive daytime hours.
 * @param {HourlyReading[]} hours sorted oldest first
 * @param {string} timeZone
 * @param {{ length?: number, pick?: 'cleanest' | 'worst' }} [options]
 * @returns {TimeWindow | null}
 */
export function findWindow(hours, timeZone, { length = 1, pick = 'cleanest' } = {}) {
  /** @type {{ start: string, mean: number } | null} */
  let chosen = null;
  for (let i = 0; i + length <= hours.length; i += 1) {
    const slice = hours.slice(i, i + length);
    const consecutive = slice.every((h, j) => j === 0 || Date.parse(h.time) - Date.parse(slice[j - 1].time) === HOUR_MS);
    const daytime = slice.every((h) => {
      const hour = localHour(h.time, timeZone);
      return hour >= DAYTIME.start && hour < DAYTIME.end;
    });
    if (!consecutive || !daytime) continue;
    const mean = slice.reduce((sum, h) => sum + h.pm25, 0) / length;
    const better = !chosen || (pick === 'cleanest' ? mean < chosen.mean : mean > chosen.mean);
    if (better) chosen = { start: slice[0].time, mean };
  }
  if (!chosen) return null;
  const end = new Date(Date.parse(chosen.start) + length * HOUR_MS).toISOString();
  const pm25 = Math.round(chosen.mean * 10) / 10;
  const { aqi, category } = overallAqi({ pm25 });
  return {
    start: new Date(chosen.start).toISOString(),
    end,
    startLabel: localTime(chosen.start, timeZone),
    endLabel: localTime(end, timeZone),
    pm25,
    aqi,
    category,
  };
}

/**
 * @typedef {object} RoutineInput
 * @property {HourlyReading[]} hourly
 * @property {string} timeZone
 * @property {Date} now
 * @property {number} exerciseMinutes daily outdoor exercise or play
 * @property {boolean} hasSensitiveMembers children, older adults, pregnancy, heart or lung conditions
 */

/**
 * Build the day's routine.
 * @param {RoutineInput} input
 * @returns {{ cleanest: TimeWindow | null, worst: TimeWindow | null, items: RoutineItem[], exerciseDoseSavedUg: number }}
 */
export function buildRoutine({ hourly, timeZone, now, exerciseMinutes, hasSensitiveMembers }) {
  const hours = upcomingHours(hourly, now);
  const cleanest = findWindow(hours, timeZone, { length: 1, pick: 'cleanest' });
  const worst = findWindow(hours, timeZone, { length: 1, pick: 'worst' });
  /** @type {RoutineItem[]} */
  const items = [];
  let exerciseDoseSavedUg = 0;

  if (cleanest && worst) {
    const activeHours = Math.max(exerciseMinutes, 30) / 60;
    exerciseDoseSavedUg = Math.max(0, inhaledDose(worst.pm25, activeHours, 'moderate') - inhaledDose(cleanest.pm25, activeHours, 'moderate'));
    const when = `${cleanest.startLabel}–${cleanest.endLabel}`;
    if (cleanest.category.level >= 3) {
      items.push({
        id: 'exercise-indoors',
        kind: 'exercise',
        title: 'Move exercise and play indoors today',
        detail: `Even the cleanest daytime hour (${when}) is forecast at PM2.5 ${cleanest.pm25} µg/m³, which is "${cleanest.category.label}".`,
        when,
      });
    } else {
      items.push({
        id: 'exercise-window',
        kind: 'exercise',
        title: 'Best time for outdoor exercise or play',
        detail: `PM2.5 is forecast at its daytime low of ${cleanest.pm25} µg/m³ (${cleanest.category.label}). Exercising then instead of at the worst hour means breathing in about ${exerciseDoseSavedUg} µg less PM2.5.`,
        when,
        startIso: cleanest.start,
        endIso: cleanest.end,
      });
    }

    items.push(
      cleanest.pm25 <= VENTILATION_MAX_PM25
        ? {
            id: 'ventilate',
            kind: 'ventilate',
            title: 'Air out your home briefly',
            detail: `Open windows for 10–15 minutes around ${cleanest.startLabel}, when outdoor PM2.5 is lowest (${cleanest.pm25} µg/m³), then close them again.`,
            when,
            startIso: cleanest.start,
            endIso: cleanest.end,
          }
        : {
            id: 'keep-closed',
            kind: 'ventilate',
            title: 'Keep windows closed today',
            detail: `Outdoor PM2.5 stays above ${VENTILATION_MAX_PM25} µg/m³ all day (lowest ${cleanest.pm25} µg/m³ at ${cleanest.startLabel}). Clean the air inside instead of airing out.`,
          },
    );

    items.push({
      id: 'avoid-peak',
      kind: 'avoid',
      title: 'Most polluted daytime hour to avoid',
      detail: `PM2.5 is forecast to reach its daytime high of ${worst.pm25} µg/m³ (${worst.category.label}). Keep errands, walks and time near traffic out of this hour.`,
      when: `${worst.startLabel}–${worst.endLabel}`,
    });

    if (hasSensitiveMembers && worst.category.level >= 2) {
      items.push({
        id: 'sensitive',
        kind: 'sensitive',
        title: 'Protect sensitive family members',
        detail: 'Children, older adults, anyone who is pregnant and people with heart or lung conditions should keep outdoor time to the cleanest hour and avoid strenuous activity outside. Anyone with asthma should keep their reliever inhaler at hand and follow their action plan.',
        when,
      });
    }
  }

  return { cleanest, worst, items, exerciseDoseSavedUg };
}
