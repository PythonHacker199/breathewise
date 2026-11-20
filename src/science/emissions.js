/**
 * Greenhouse-gas impact of everyday travel choices.
 *
 * Factors: UK Government, Department for Energy Security and Net Zero (DESNZ), greenhouse gas
 * conversion factors 2022, as published by Our World in Data ("Carbon footprint of travel per
 * kilometer", https://ourworldindata.org/grapher/carbon-footprint-travel-mode). Grams of CO2e per
 * passenger-kilometre; car figures assume one occupant. Real factors vary by country, vehicle and
 * occupancy, so the app shows them as estimates and names the source.
 */

import { COMMUTE_OPTIONS } from '../../shared/profile-schema.js';

/** @typedef {import('../../shared/profile-schema.js').CommuteMode} CommuteMode */

/**
 * g CO2e per passenger-km. Active travel and working from home have no direct travel emissions.
 * Typed as a full Record so TypeScript fails the build if a commute mode has no factor.
 * @type {Readonly<Record<CommuteMode, number>>}
 */
export const GRAMS_CO2E_PER_KM = Object.freeze({
  car_petrol: 170.48,
  car_diesel: 170.82,
  car_hybrid: 68.4, // plug-in hybrid
  car_electric: 47.09,
  motorbike: 113.55,
  bus: 96.5, // average bus
  metro: 27.81, // London Underground
  rail: 35.49, // national rail
  bicycle: 0,
  walk: 0,
  remote: 0,
});

/** Display label of each commute mode, from the shared profile schema. */
export const MODE_LABELS = /** @type {Readonly<Record<CommuteMode, string>>} */ (
  Object.freeze(Object.fromEntries(COMMUTE_OPTIONS.map(({ value, label }) => [value, label])))
);

/** Modes that put exhaust into the street (electric cars still shed brake and tyre dust). */
export const TAILPIPE_MODES = Object.freeze(
  new Set(['car_petrol', 'car_diesel', 'car_hybrid', 'motorbike']),
);

/** Modes where the traveller breathes street air directly. */
export const EXPOSED_MODES = Object.freeze(new Set(['motorbike', 'bicycle', 'walk']));

/** Weeks per year used to annualise a weekly routine. */
export const WEEKS_PER_YEAR = 52;

/**
 * @param {unknown} value
 * @returns {value is CommuteMode}
 */
export function isCommuteMode(value) {
  return typeof value === 'string' && Object.hasOwn(GRAMS_CO2E_PER_KM, value);
}

/**
 * Weekly and yearly emissions of a round-trip commute.
 * @param {object} c
 * @param {CommuteMode} c.mode
 * @param {number} c.oneWayKm
 * @param {number} c.daysPerWeek
 * @param {number} [c.occupants] people sharing a car (car modes only)
 * @returns {{ kgPerWeek: number, kgPerYear: number }} rounded to 0.1 kg
 */
export function commuteEmissions({ mode, oneWayKm, daysPerWeek, occupants = 1 }) {
  const share = mode.startsWith('car_') ? Math.max(1, occupants) : 1;
  const gramsPerWeek = (GRAMS_CO2E_PER_KM[mode] * oneWayKm * 2 * daysPerWeek) / share;
  return {
    kgPerWeek: Math.round(gramsPerWeek / 100) / 10,
    kgPerYear: Math.round((gramsPerWeek * WEEKS_PER_YEAR) / 100) / 10,
  };
}

/**
 * @typedef {object} CommuteAlternative
 * @property {CommuteMode} mode
 * @property {string} label
 * @property {number} kgPerYear
 * @property {number} kgSavedPerYear
 * @property {number} percentSaved
 */

/**
 * Lower-emission alternatives to the current commute, biggest saving first.
 * Walking and cycling are only suggested for distances where they are realistic.
 * @param {{ mode: CommuteMode, oneWayKm: number, daysPerWeek: number }} commute
 * @returns {CommuteAlternative[]}
 */
export function commuteAlternatives(commute) {
  const current = commuteEmissions(commute).kgPerYear;
  if (current === 0) return [];
  /** @type {CommuteMode[]} */
  const candidates = ['metro', 'rail', 'bus', 'car_electric'];
  if (commute.oneWayKm <= 8) candidates.push('bicycle');
  if (commute.oneWayKm <= 2) candidates.push('walk');
  return candidates
    .filter((mode) => mode !== commute.mode)
    .map((mode) => {
      const kgPerYear = commuteEmissions({ ...commute, mode }).kgPerYear;
      const kgSavedPerYear = Math.round((current - kgPerYear) * 10) / 10;
      return {
        mode,
        label: MODE_LABELS[mode],
        kgPerYear,
        kgSavedPerYear,
        percentSaved: Math.round((kgSavedPerYear / current) * 100),
      };
    })
    .filter((alt) => alt.kgSavedPerYear > 0)
    .sort((a, b) => b.kgSavedPerYear - a.kgSavedPerYear);
}
