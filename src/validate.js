/**
 * Validation and normalisation of everything the browser sends. Missing optional fields fall
 * back to sensible defaults; anything present but wrong is reported per field.
 */
import {
  COMMUTE_OPTIONS,
  COOKING_FUEL_OPTIONS,
  DEFAULT_PROFILE,
  HEATING_OPTIONS,
  NUMBER_RANGES,
  TEXT_LIMITS,
  VENTILATION_OPTIONS,
  optionValues,
} from '../shared/profile-schema.js';

export { DEFAULT_PROFILE };

/** @typedef {import('../shared/profile-schema.js').Profile} Profile */

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

/** A field left empty by a form: absent, null or an empty string. @param {unknown} value */
const isBlank = (value) => value === undefined || value === null || value === '';

/**
 * @param {unknown} value
 * @param {{ min: number, max: number, integer: boolean }} range
 * @returns {value is number}
 */
function isNumberInRange(value, { min, max, integer }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (integer && !Number.isInteger(value)) return false;
  return value >= min && value <= max;
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
    if (isBlank(raw)) return fallback;
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (isNumberInRange(value, { min, max, integer })) return value;
    this.errors[`${this.section}.${field}`] =
      `Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`;
    return fallback;
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
  return (value) =>
    typeof value === 'string' && /** @type {ReadonlyArray<string>} */ (options).includes(value);
}

/** Allow-lists for the profile's choice fields, built once from the shared schema. */
const IS_ALLOWED = Object.freeze({
  mode: oneOf(optionValues(COMMUTE_OPTIONS)),
  ventilation: oneOf(optionValues(VENTILATION_OPTIONS)),
  cookingFuel: oneOf(optionValues(COOKING_FUEL_OPTIONS)),
  heating: oneOf(optionValues(HEATING_OPTIONS)),
});

/** @param {SectionReader} r @returns {Profile['household']} */
function readHousehold(r) {
  const d = DEFAULT_PROFILE.household;
  const range = NUMBER_RANGES.household;
  return {
    adults: r.number('adults', d.adults, range.adults),
    children: r.number('children', d.children, range.children),
    olderAdults: r.number('olderAdults', d.olderAdults, range.olderAdults),
  };
}

/** @param {SectionReader} r @returns {Profile['conditions']} */
function readConditions(r) {
  const d = DEFAULT_PROFILE.conditions;
  return {
    respiratory: r.boolean('respiratory', d.respiratory),
    heart: r.boolean('heart', d.heart),
    pregnancy: r.boolean('pregnancy', d.pregnancy),
  };
}

/** @param {SectionReader} r @returns {Profile['commute']} */
function readCommute(r) {
  const d = DEFAULT_PROFILE.commute;
  const range = NUMBER_RANGES.commute;
  return {
    mode: r.choice('mode', d.mode, IS_ALLOWED.mode),
    oneWayKm: r.number('oneWayKm', d.oneWayKm, range.oneWayKm),
    daysPerWeek: r.number('daysPerWeek', d.daysPerWeek, range.daysPerWeek),
  };
}

/** @param {SectionReader} r @returns {Profile['home']} */
function readHome(r) {
  const d = DEFAULT_PROFILE.home;
  const range = NUMBER_RANGES.home;
  return {
    roomAreaM2: r.number('roomAreaM2', d.roomAreaM2, range.roomAreaM2),
    ventilation: r.choice('ventilation', d.ventilation, IS_ALLOWED.ventilation),
    purifierCadr: r.number('purifierCadr', d.purifierCadr, range.purifierCadr),
    cookingFuel: r.choice('cookingFuel', d.cookingFuel, IS_ALLOWED.cookingFuel),
    heating: r.choice('heating', d.heating, IS_ALLOWED.heating),
  };
}

/** @param {SectionReader} r @returns {Profile['habits']} */
function readHabits(r) {
  const d = DEFAULT_PROFILE.habits;
  const range = NUMBER_RANGES.habits;
  return {
    outdoorExerciseMinutes: r.number(
      'outdoorExerciseMinutes',
      d.outdoorExerciseMinutes,
      range.outdoorExerciseMinutes,
    ),
    incenseOrCoils: r.boolean('incenseOrCoils', d.incenseOrCoils),
    smokingIndoors: r.boolean('smokingIndoors', d.smokingIndoors),
  };
}

/**
 * Validate a household profile. Missing fields take the shared defaults; every invalid field is
 * reported under "section.field", all at once, so the form can mark them together.
 * @param {unknown} body
 * @returns {Result<Profile>}
 */
export function validateProfile(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  const source = isRecord(body) ? body : {};
  /** @param {Exclude<keyof Profile, 'notes'>} section */
  const reader = (section) => new SectionReader(source[section], section, errors);

  /** @type {Profile} */
  const value = {
    household: readHousehold(reader('household')),
    conditions: readConditions(reader('conditions')),
    commute: readCommute(reader('commute')),
    home: readHome(reader('home')),
    habits: readHabits(reader('habits')),
    notes: cleanText(source.notes, TEXT_LIMITS.notes),
  };

  const { adults, children, olderAdults } = value.household;
  if (adults + children + olderAdults === 0) {
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
  const value = {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    name: cleanText(source.name, TEXT_LIMITS.placeName),
  };
  if (isTimeZone(source.timeZone)) value.timeZone = source.timeZone;
  return { ok: true, value };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateQuestion(value) {
  const question = cleanText(value, TEXT_LIMITS.question);
  return question.length >= 3
    ? { ok: true, value: question }
    : { ok: false, error: 'Ask a question of at least 3 characters.' };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateSearch(value) {
  const query = cleanText(value, TEXT_LIMITS.search);
  return query.length >= 2
    ? { ok: true, value: query }
    : { ok: false, error: 'Type at least 2 characters of a city name.' };
}
