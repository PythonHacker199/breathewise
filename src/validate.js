/**
 * Validation and normalisation of everything the browser sends. Missing optional fields fall
 * back to sensible defaults; anything present but wrong is reported per field.
 */
import { isCommuteMode } from './science/emissions.js';

/** @typedef {import('./science/emissions.js').CommuteMode} CommuteMode */
/** @typedef {'sealed'|'average'|'leaky'} Ventilation */
/** @typedef {'lpg'|'piped_gas'|'electric'|'biomass'|'kerosene'} CookingFuel */
/** @typedef {'none'|'electric'|'gas'|'wood_coal'|'kerosene'} Heating */

/**
 * @typedef {object} Profile
 * @property {{ adults: number, children: number, olderAdults: number }} household
 * @property {{ respiratory: boolean, heart: boolean, pregnancy: boolean }} conditions
 * @property {{ mode: CommuteMode, oneWayKm: number, daysPerWeek: number }} commute
 * @property {{ roomAreaM2: number, ventilation: Ventilation, purifierCadr: number, cookingFuel: CookingFuel, heating: Heating }} home
 * @property {{ outdoorExerciseMinutes: number, incenseOrCoils: boolean, smokingIndoors: boolean }} habits
 * @property {string} notes
 */

/** @typedef {{ lat: number, lon: number, name: string, timeZone?: string }} Location */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isTimeZone(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** @template T @typedef {{ ok: true, value: T } | { ok: false, errors: Record<string, string> }} Result */

export const VENTILATION = /** @type {const} */ (['sealed', 'average', 'leaky']);
export const COOKING_FUELS = /** @type {const} */ (['lpg', 'piped_gas', 'electric', 'biomass', 'kerosene']);
export const HEATING = /** @type {const} */ (['none', 'electric', 'gas', 'wood_coal', 'kerosene']);

export const LIMITS = Object.freeze({ name: 80, notes: 300, question: 400, search: 80, people: 12, km: 200, area: 500, cadr: 2000, minutes: 600 });

export const DEFAULT_PROFILE = Object.freeze(
  /** @type {Profile} */ ({
    household: { adults: 2, children: 0, olderAdults: 0 },
    conditions: { respiratory: false, heart: false, pregnancy: false },
    commute: { mode: 'car_petrol', oneWayKm: 10, daysPerWeek: 5 },
    home: { roomAreaM2: 15, ventilation: 'average', purifierCadr: 0, cookingFuel: 'lpg', heating: 'none' },
    habits: { outdoorExerciseMinutes: 30, incenseOrCoils: false, smokingIndoors: false },
    notes: '',
  }),
);

// Control characters (except \n and \t) and the bidi overrides used in text-spoofing attacks.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this pattern.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/**
 * Strip control characters, collapse whitespace and cap the length.
 * @param {unknown} value
 * @param {number} max
 */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads fields from one section of the request, recording errors under "section.field".
 */
class SectionReader {
  /**
   * @param {unknown} source
   * @param {string} section
   * @param {Record<string, string>} errors
   */
  constructor(source, section, errors) {
    this.source = isRecord(source) ? source : {};
    this.section = section;
    this.errors = errors;
  }

  /**
   * @param {string} field
   * @param {number} fallback
   * @param {{ min: number, max: number, integer?: boolean }} range
   */
  number(field, fallback, { min, max, integer = false }) {
    const raw = this.source[field];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      this.errors[`${this.section}.${field}`] = `Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`;
      return fallback;
    }
    return value;
  }

  /**
   * @param {string} field
   * @param {boolean} fallback
   */
  boolean(field, fallback) {
    const raw = this.source[field];
    if (raw === undefined) return fallback;
    if (typeof raw !== 'boolean') {
      this.errors[`${this.section}.${field}`] = 'Choose yes or no.';
      return fallback;
    }
    return raw;
  }

  /**
   * @template {string} T
   * @param {string} field
   * @param {T} fallback
   * @param {(value: unknown) => value is T} isAllowed
   * @returns {T}
   */
  choice(field, fallback, isAllowed) {
    const raw = this.source[field];
    if (raw === undefined) return fallback;
    if (!isAllowed(raw)) {
      this.errors[`${this.section}.${field}`] = 'Choose one of the listed options.';
      return fallback;
    }
    return raw;
  }
}

/**
 * Type guard factory for a fixed list of allowed strings.
 * @template {string} T
 * @param {ReadonlyArray<T>} options
 */
function oneOf(options) {
  /**
   * @param {unknown} value
   * @returns {value is T}
   */
  return (value) => typeof value === 'string' && /** @type {ReadonlyArray<string>} */ (options).includes(value);
}

/**
 * Validate a household profile.
 * @param {unknown} body
 * @returns {Result<Profile>}
 */
export function validateProfile(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  const source = isRecord(body) ? body : {};
  const d = DEFAULT_PROFILE;

  const household = new SectionReader(source.household, 'household', errors);
  const conditions = new SectionReader(source.conditions, 'conditions', errors);
  const commute = new SectionReader(source.commute, 'commute', errors);
  const home = new SectionReader(source.home, 'home', errors);
  const habits = new SectionReader(source.habits, 'habits', errors);

  /** @type {Profile} */
  const value = {
    household: {
      adults: household.number('adults', d.household.adults, { min: 0, max: LIMITS.people, integer: true }),
      children: household.number('children', d.household.children, { min: 0, max: LIMITS.people, integer: true }),
      olderAdults: household.number('olderAdults', d.household.olderAdults, { min: 0, max: LIMITS.people, integer: true }),
    },
    conditions: {
      respiratory: conditions.boolean('respiratory', d.conditions.respiratory),
      heart: conditions.boolean('heart', d.conditions.heart),
      pregnancy: conditions.boolean('pregnancy', d.conditions.pregnancy),
    },
    commute: {
      mode: commute.choice('mode', d.commute.mode, isCommuteMode),
      oneWayKm: commute.number('oneWayKm', d.commute.oneWayKm, { min: 0, max: LIMITS.km }),
      daysPerWeek: commute.number('daysPerWeek', d.commute.daysPerWeek, { min: 0, max: 7, integer: true }),
    },
    home: {
      roomAreaM2: home.number('roomAreaM2', d.home.roomAreaM2, { min: 4, max: LIMITS.area }),
      ventilation: home.choice('ventilation', d.home.ventilation, oneOf(VENTILATION)),
      purifierCadr: home.number('purifierCadr', d.home.purifierCadr, { min: 0, max: LIMITS.cadr }),
      cookingFuel: home.choice('cookingFuel', d.home.cookingFuel, oneOf(COOKING_FUELS)),
      heating: home.choice('heating', d.home.heating, oneOf(HEATING)),
    },
    habits: {
      outdoorExerciseMinutes: habits.number('outdoorExerciseMinutes', d.habits.outdoorExerciseMinutes, { min: 0, max: LIMITS.minutes, integer: true }),
      incenseOrCoils: habits.boolean('incenseOrCoils', d.habits.incenseOrCoils),
      smokingIndoors: habits.boolean('smokingIndoors', d.habits.smokingIndoors),
    },
    notes: cleanText(source.notes, LIMITS.notes),
  };

  if (value.household.adults + value.household.children + value.household.olderAdults === 0) {
    errors['household.adults'] = 'Add at least one person to the household.';
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/**
 * Validate a location chosen in the browser.
 * @param {unknown} body
 * @returns {Result<Location>}
 */
export function validateLocation(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  const source = isRecord(body) ? body : {};
  const reader = new SectionReader(source, 'location', errors);
  const lat = reader.number('lat', Number.NaN, { min: -90, max: 90 });
  const lon = reader.number('lon', Number.NaN, { min: -180, max: 180 });
  if (Number.isNaN(lat) && !errors['location.lat']) errors['location.lat'] = 'Choose a location.';
  if (Number.isNaN(lon) && !errors['location.lon']) errors['location.lon'] = 'Choose a location.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  // Round to ~1 km: enough for air quality, and avoids sending precise home coordinates upstream.
  /** @type {Location} */
  const value = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name: cleanText(source.name, LIMITS.name) };
  if (isTimeZone(source.timeZone)) value.timeZone = source.timeZone;
  return { ok: true, value };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateQuestion(value) {
  const question = cleanText(value, LIMITS.question);
  return question.length >= 3 ? { ok: true, value: question } : { ok: false, error: 'Ask a question of at least 3 characters.' };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateSearch(value) {
  const query = cleanText(value, LIMITS.search);
  return query.length >= 2 ? { ok: true, value: query } : { ok: false, error: 'Type at least 2 characters of a city name.' };
}
