/**
 * The household profile, defined once for both halves of the app.
 *
 * The server validates and reasons about a profile (src/validate.js, src/science/*) and the
 * browser builds its form from the same definitions (web/src/lib/profile.ts). Allowed values,
 * their labels, numeric ranges and defaults all live here, so the form and the validator can
 * never disagree.
 *
 * Plain JavaScript with JSDoc types: Node imports it as-is, and TypeScript infers the literal
 * value types from the `@type {const}` assertions.
 */

/** How the household usually travels to work or school. */
export const COMMUTE_OPTIONS = Object.freeze(
  /** @type {const} */ ([
    { value: 'car_petrol', label: 'Petrol car' },
    { value: 'car_diesel', label: 'Diesel car' },
    { value: 'car_hybrid', label: 'Plug-in hybrid car' },
    { value: 'car_electric', label: 'Electric car' },
    { value: 'motorbike', label: 'Motorbike or scooter' },
    { value: 'bus', label: 'Bus' },
    { value: 'metro', label: 'Metro' },
    { value: 'rail', label: 'Train' },
    { value: 'bicycle', label: 'Bicycle' },
    { value: 'walk', label: 'Walking' },
    { value: 'remote', label: 'Work or study from home' },
  ]),
);

/** How airtight the home is; sets the air exchange rate in the indoor model. */
export const VENTILATION_OPTIONS = Object.freeze(
  /** @type {const} */ ([
    { value: 'sealed', label: 'Well sealed (new building, tight windows)' },
    { value: 'average', label: 'Average' },
    { value: 'leaky', label: 'Draughty (gaps around doors and windows)' },
  ]),
);

export const COOKING_FUEL_OPTIONS = Object.freeze(
  /** @type {const} */ ([
    { value: 'lpg', label: 'LPG cylinder' },
    { value: 'piped_gas', label: 'Piped gas' },
    { value: 'electric', label: 'Electric or induction' },
    { value: 'biomass', label: 'Wood, coal, dung or crop waste' },
    { value: 'kerosene', label: 'Kerosene' },
  ]),
);

export const HEATING_OPTIONS = Object.freeze(
  /** @type {const} */ ([
    { value: 'none', label: 'No heating' },
    { value: 'electric', label: 'Electric heater' },
    { value: 'gas', label: 'Gas heater' },
    { value: 'wood_coal', label: 'Wood or coal fire' },
    { value: 'kerosene', label: 'Kerosene heater' },
  ]),
);

/** @typedef {(typeof COMMUTE_OPTIONS)[number]['value']} CommuteMode */
/** @typedef {(typeof VENTILATION_OPTIONS)[number]['value']} Ventilation */
/** @typedef {(typeof COOKING_FUEL_OPTIONS)[number]['value']} CookingFuel */
/** @typedef {(typeof HEATING_OPTIONS)[number]['value']} Heating */

/**
 * @typedef {object} Profile
 * @property {{ adults: number, children: number, olderAdults: number }} household
 * @property {{ respiratory: boolean, heart: boolean, pregnancy: boolean }} conditions
 * @property {{ mode: CommuteMode, oneWayKm: number, daysPerWeek: number }} commute
 * @property {{ roomAreaM2: number, ventilation: Ventilation, purifierCadr: number, cookingFuel: CookingFuel, heating: Heating }} home
 * @property {{ outdoorExerciseMinutes: number, incenseOrCoils: boolean, smokingIndoors: boolean }} habits
 * @property {string} notes
 */

/** @typedef {{ min: number, max: number, integer?: boolean, step?: number }} NumberRange */

/**
 * Accepted range of every numeric field: the form's min/max/step and the validator's checks.
 * The room has a 4 m² floor so the indoor model never divides by a near-empty volume.
 */
export const NUMBER_RANGES = Object.freeze({
  household: {
    adults: { min: 0, max: 12, integer: true },
    children: { min: 0, max: 12, integer: true },
    olderAdults: { min: 0, max: 12, integer: true },
  },
  commute: {
    oneWayKm: { min: 0, max: 200, step: 0.5 },
    daysPerWeek: { min: 0, max: 7, integer: true },
  },
  home: {
    roomAreaM2: { min: 4, max: 500 },
    purifierCadr: { min: 0, max: 2000 },
  },
  habits: {
    outdoorExerciseMinutes: { min: 0, max: 600, integer: true },
  },
});

/** Longest accepted length of each free-text field, in characters. */
export const TEXT_LIMITS = Object.freeze({ placeName: 80, notes: 300, question: 400, search: 80 });

/** Values the server assumes for any field a request leaves out. */
export const DEFAULT_PROFILE = Object.freeze(
  /** @type {Profile} */ ({
    household: { adults: 2, children: 0, olderAdults: 0 },
    conditions: { respiratory: false, heart: false, pregnancy: false },
    commute: { mode: 'car_petrol', oneWayKm: 10, daysPerWeek: 5 },
    home: {
      roomAreaM2: 15,
      ventilation: 'average',
      purifierCadr: 0,
      cookingFuel: 'lpg',
      heating: 'none',
    },
    habits: { outdoorExerciseMinutes: 30, incenseOrCoils: false, smokingIndoors: false },
    notes: '',
  }),
);

/**
 * The values of a list of options, e.g. for an allow-list check.
 * @template {string} T
 * @param {ReadonlyArray<{ readonly value: T }>} options
 * @returns {ReadonlyArray<T>}
 */
export const optionValues = (options) => options.map((option) => option.value);
