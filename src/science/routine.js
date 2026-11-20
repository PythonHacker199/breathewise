/**
 * Low-exposure daily routine from the hourly PM2.5 forecast: when to go out, when to air the
 * home, and which hours to avoid. Times are shown in the location's own time zone.
 */
import { AQI_LEVEL, overallAqi } from './aqi.js';
import { inhaledDose } from './exposure.js';

const HOUR_MS = 3_600_000;

/** Local hours considered for outdoor activity: from 06:00 up to (not including) 21:00. */
export const DAYTIME = Object.freeze({ start: 6, end: 21 });

/** PM2.5 at or below the top of the EPA "Moderate" band; above this, keep windows shut. */
export const VENTILATION_MAX_PM25 = 35.4;

/** At or above this level even the cleanest hour is too polluted for outdoor exercise. */
const EXERCISE_INDOORS_LEVEL = AQI_LEVEL.UNHEALTHY;

/** At or above this level the worst hour calls for extra care for sensitive family members. */
const SENSITIVE_ALERT_LEVEL = AQI_LEVEL.SENSITIVE;

/** Dose comparisons assume at least this much activity, even if the household reports less. */
const MIN_ACTIVE_MINUTES = 30;

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
 * Building an Intl.DateTimeFormat is far slower than using one, and a plan formats dozens of
 * hours, so formatters are cached per time zone (validated IANA names, so the set is bounded).
 * @type {Map<string, Intl.DateTimeFormat>}
 */
const formatters = new Map();

/**
 * @param {string} timeZone
 * @param {boolean} withMinutes
 */
function clockFormatter(timeZone, withMinutes) {
  const key = `${timeZone}|${withMinutes}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
      ...(withMinutes && { minute: '2-digit' }),
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * @param {string} iso
 * @param {string} timeZone IANA name
 */
export function localHour(iso, timeZone) {
  return Number(clockFormatter(timeZone, false).format(new Date(iso)));
}

/**
 * @param {string} iso
 * @param {string} timeZone IANA name
 * @returns {string} "HH:MM"
 */
export function localTime(iso, timeZone) {
  return clockFormatter(timeZone, true).format(new Date(iso));
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
    if (!isDaytimeRun(slice, timeZone)) continue;
    const mean = slice.reduce((sum, h) => sum + h.pm25, 0) / length;
    const better = !chosen || (pick === 'cleanest' ? mean < chosen.mean : mean > chosen.mean);
    if (better) chosen = { start: slice[0].time, mean };
  }
  return chosen ? toTimeWindow(chosen.start, chosen.mean, length, timeZone) : null;
}

/**
 * True when the readings are back-to-back hours that all fall in local daytime.
 * @param {HourlyReading[]} slice
 * @param {string} timeZone
 */
function isDaytimeRun(slice, timeZone) {
  const consecutive = slice.every(
    (h, j) => j === 0 || Date.parse(h.time) - Date.parse(slice[j - 1].time) === HOUR_MS,
  );
  return consecutive && slice.every((h) => isDaytime(h.time, timeZone));
}

/** @param {string} iso @param {string} timeZone */
function isDaytime(iso, timeZone) {
  const hour = localHour(iso, timeZone);
  return hour >= DAYTIME.start && hour < DAYTIME.end;
}

/**
 * @param {string} startIso
 * @param {number} meanPm25
 * @param {number} length hours
 * @param {string} timeZone
 * @returns {TimeWindow}
 */
function toTimeWindow(startIso, meanPm25, length, timeZone) {
  const end = new Date(Date.parse(startIso) + length * HOUR_MS).toISOString();
  const pm25 = Math.round(meanPm25 * 10) / 10;
  const { aqi, category } = overallAqi({ pm25 });
  return {
    start: new Date(startIso).toISOString(),
    end,
    startLabel: localTime(startIso, timeZone),
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

/** @param {TimeWindow} window */
const timeRange = (window) => `${window.startLabel}–${window.endLabel}`;

/**
 * Outdoor exercise at the cleanest hour, or indoors when even that hour is unhealthy.
 * @param {TimeWindow} cleanest
 * @param {number} doseSavedUg PM2.5 not inhaled by exercising then instead of at the worst hour
 * @returns {RoutineItem}
 */
function exerciseItem(cleanest, doseSavedUg) {
  const when = timeRange(cleanest);
  if (cleanest.category.level >= EXERCISE_INDOORS_LEVEL) {
    return {
      id: 'exercise-indoors',
      kind: 'exercise',
      title: 'Move exercise and play indoors today',
      detail: `Even the cleanest daytime hour (${when}) is forecast at PM2.5 ${cleanest.pm25} µg/m³, which is "${cleanest.category.label}".`,
      when,
    };
  }
  return {
    id: 'exercise-window',
    kind: 'exercise',
    title: 'Best time for outdoor exercise or play',
    detail: `PM2.5 is forecast at its daytime low of ${cleanest.pm25} µg/m³ (${cleanest.category.label}). Exercising then instead of at the worst hour means breathing in about ${doseSavedUg} µg less PM2.5.`,
    when,
    startIso: cleanest.start,
    endIso: cleanest.end,
  };
}

/**
 * Air the home at the cleanest hour, or keep it shut when the whole day is above the threshold.
 * @param {TimeWindow} cleanest
 * @returns {RoutineItem}
 */
function ventilationItem(cleanest) {
  if (cleanest.pm25 > VENTILATION_MAX_PM25) {
    return {
      id: 'keep-closed',
      kind: 'ventilate',
      title: 'Keep windows closed today',
      detail: `Outdoor PM2.5 stays above ${VENTILATION_MAX_PM25} µg/m³ all day (lowest ${cleanest.pm25} µg/m³ at ${cleanest.startLabel}). Clean the air inside instead of airing out.`,
    };
  }
  return {
    id: 'ventilate',
    kind: 'ventilate',
    title: 'Air out your home briefly',
    detail: `Open windows for 10–15 minutes around ${cleanest.startLabel}, when outdoor PM2.5 is lowest (${cleanest.pm25} µg/m³), then close them again.`,
    when: timeRange(cleanest),
    startIso: cleanest.start,
    endIso: cleanest.end,
  };
}

/**
 * @param {TimeWindow} worst
 * @returns {RoutineItem}
 */
function avoidPeakItem(worst) {
  return {
    id: 'avoid-peak',
    kind: 'avoid',
    title: 'Most polluted daytime hour to avoid',
    detail: `PM2.5 is forecast to reach its daytime high of ${worst.pm25} µg/m³ (${worst.category.label}). Keep errands, walks and time near traffic out of this hour.`,
    when: timeRange(worst),
  };
}

/**
 * @param {TimeWindow} cleanest
 * @returns {RoutineItem}
 */
function sensitiveItem(cleanest) {
  return {
    id: 'sensitive',
    kind: 'sensitive',
    title: 'Protect sensitive family members',
    detail:
      'Children, older adults, anyone who is pregnant and people with heart or lung conditions should keep outdoor time to the cleanest hour and avoid strenuous activity outside. Anyone with asthma should keep their reliever inhaler at hand and follow their action plan.',
    when: timeRange(cleanest),
  };
}

/**
 * Build the day's routine.
 * @param {RoutineInput} input
 * @returns {{ cleanest: TimeWindow | null, worst: TimeWindow | null, items: RoutineItem[], exerciseDoseSavedUg: number }}
 */
export function buildRoutine({ hourly, timeZone, now, exerciseMinutes, hasSensitiveMembers }) {
  const hours = upcomingHours(hourly, now);
  const cleanest = findWindow(hours, timeZone, { length: 1, pick: 'cleanest' });
  const worst = findWindow(hours, timeZone, { length: 1, pick: 'worst' });
  if (!cleanest || !worst) return { cleanest, worst, items: [], exerciseDoseSavedUg: 0 };

  const activeHours = Math.max(exerciseMinutes, MIN_ACTIVE_MINUTES) / 60;
  const exerciseDoseSavedUg = Math.max(
    0,
    inhaledDose(worst.pm25, activeHours, 'moderate') -
      inhaledDose(cleanest.pm25, activeHours, 'moderate'),
  );
  const items = [
    exerciseItem(cleanest, exerciseDoseSavedUg),
    ventilationItem(cleanest),
    avoidPeakItem(worst),
  ];
  if (hasSensitiveMembers && worst.category.level >= SENSITIVE_ALERT_LEVEL) {
    items.push(sensitiveItem(cleanest));
  }
  return { cleanest, worst, items, exerciseDoseSavedUg };
}
