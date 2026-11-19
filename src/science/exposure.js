/**
 * Personal exposure maths: what a choice changes in the air a person actually breathes.
 *
 * Sources:
 * - Cigarette equivalence: Berkeley Earth (Muller & Muller, 2015), "Air Pollution and Cigarette
 *   Equivalence": breathing 22 µg/m³ of PM2.5 for a day is roughly equivalent in mortality risk
 *   to smoking one cigarette. https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/
 * - Indoor/outdoor mass balance for particles (single well-mixed zone, no indoor sources):
 *   C_in = C_out · P · a / (a + k + CADR / V)
 *   with penetration P, air exchange rate a (1/h), deposition rate k (1/h), purifier clean air
 *   delivery rate CADR (m³/h) and room volume V (m³). See US EPA, "Guide to Air Cleaners in the
 *   Home" (2018) and Riley et al. (2002), Environ. Sci. Technol. 36:200-207.
 * - Breathing rates: US EPA Exposure Factors Handbook (2011), Chapter 6 (adult at rest about
 *   0.5 m³/h; moderate activity about 1.6 m³/h).
 */

/** µg/m³ of PM2.5 over 24 hours ≈ one cigarette (Berkeley Earth). */
export const CIGARETTE_PM25_UG_M3 = 22;

/** Typical whole-home air exchange rates (per hour) with windows closed, and with windows open. */
export const AIR_EXCHANGE_PER_HOUR = Object.freeze({ sealed: 0.3, average: 0.5, leaky: 1.0, windowsOpen: 5.0 });

/** Fraction of outdoor fine particles that get through the building shell (conservative). */
export const PENETRATION = 1.0;
/** Typical indoor deposition rate of PM2.5 onto surfaces, per hour. */
export const DEPOSITION_PER_HOUR = 0.2;
/** Assumed ceiling height when only floor area is known, metres. */
export const CEILING_HEIGHT_M = 2.7;

/** Breathing rates in m³ of air per hour. */
export const BREATHING_M3_PER_HOUR = Object.freeze({ rest: 0.5, moderate: 1.6 });

/**
 * Cigarette-equivalents of breathing a PM2.5 level for one day, to one decimal.
 * @param {number} pm25 µg/m³
 */
export function cigarettesPerDay(pm25) {
  return Math.round((Math.max(0, pm25) / CIGARETTE_PM25_UG_M3) * 10) / 10;
}

/** @param {number} floorAreaM2 */
export function roomVolume(floorAreaM2) {
  return Math.round(floorAreaM2 * CEILING_HEIGHT_M * 10) / 10;
}

/**
 * Steady-state indoor PM2.5 for an outdoor level, with or without an air purifier.
 * @param {object} p
 * @param {number} p.outdoorPm25 µg/m³
 * @param {number} p.airExchange per hour
 * @param {number} p.roomVolume m³
 * @param {number} [p.cadr] purifier clean air delivery rate, m³/h (0 = none)
 * @returns {number} µg/m³, to one decimal
 */
export function indoorPm25({ outdoorPm25, airExchange, roomVolume: volume, cadr = 0 }) {
  if (volume <= 0) throw new RangeError('Room volume must be positive.');
  const removal = airExchange + DEPOSITION_PER_HOUR + cadr / volume;
  return Math.round(((outdoorPm25 * PENETRATION * airExchange) / removal) * 10) / 10;
}

/**
 * Purifier size needed for a target number of clean-air changes per hour.
 * EPA's rule of thumb (CADR in cfm ≥ 2/3 of floor area in ft², 8 ft ceiling) works out to about 5.
 * @param {number} volume m³
 * @param {number} [targetChanges]
 * @returns {number} m³/h, rounded up to the next 10
 */
export function recommendedCadr(volume, targetChanges = 5) {
  return Math.ceil((volume * targetChanges) / 10) * 10;
}

/**
 * Mass of PM2.5 inhaled, µg, rounded to a whole number.
 * @param {number} pm25 µg/m³
 * @param {number} hours
 * @param {keyof typeof BREATHING_M3_PER_HOUR} activity
 */
export function inhaledDose(pm25, hours, activity) {
  return Math.round(pm25 * BREATHING_M3_PER_HOUR[activity] * hours);
}

/**
 * Percentage reduction from `before` to `after`, rounded to a whole number (never negative).
 * @param {number} before
 * @param {number} after
 */
export function percentReduction(before, after) {
  if (before <= 0) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 100));
}
