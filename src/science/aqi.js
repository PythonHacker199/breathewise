/**
 * Air Quality Index maths and health guideline references.
 *
 * Sources:
 * - US EPA AQI breakpoints, PM2.5 table as revised on 6 May 2024 (40 CFR Part 58, Appendix G):
 *   https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf
 * - India National Air Quality Index (CPCB, 2014) concentration bands.
 * - WHO Global Air Quality Guidelines (2021), 24-hour guideline levels.
 *
 * The EPA index is defined on 24-hour averages for particles. Applied to an hourly value it is
 * an approximation of "what the day looks like if it stays like this", and the UI says so.
 */

/** @typedef {'good'|'moderate'|'sensitive'|'unhealthy'|'very-unhealthy'|'hazardous'} AqiCategoryKey */

/**
 * @typedef {object} AqiCategory
 * @property {AqiCategoryKey} key
 * @property {string} label EPA category name
 * @property {number} min lowest AQI value in the band
 * @property {number} max highest AQI value in the band
 * @property {string} color official EPA colour (always shown together with the label, never alone)
 * @property {number} level 0 (good) to 5 (hazardous), for comparisons
 */

/** Category levels by name, so rules read `level >= AQI_LEVEL.SENSITIVE` instead of a bare number. */
export const AQI_LEVEL = Object.freeze({ GOOD: 0, MODERATE: 1, SENSITIVE: 2, UNHEALTHY: 3, VERY_UNHEALTHY: 4, HAZARDOUS: 5 });

/** @type {ReadonlyArray<AqiCategory>} */
export const AQI_CATEGORIES = Object.freeze([
  { key: 'good', label: 'Good', min: 0, max: 50, color: '#00e400', level: AQI_LEVEL.GOOD },
  { key: 'moderate', label: 'Moderate', min: 51, max: 100, color: '#ffff00', level: AQI_LEVEL.MODERATE },
  { key: 'sensitive', label: 'Unhealthy for Sensitive Groups', min: 101, max: 150, color: '#ff7e00', level: AQI_LEVEL.SENSITIVE },
  { key: 'unhealthy', label: 'Unhealthy', min: 151, max: 200, color: '#ff0000', level: AQI_LEVEL.UNHEALTHY },
  { key: 'very-unhealthy', label: 'Very Unhealthy', min: 201, max: 300, color: '#8f3f97', level: AQI_LEVEL.VERY_UNHEALTHY },
  { key: 'hazardous', label: 'Hazardous', min: 301, max: 500, color: '#7e0023', level: AQI_LEVEL.HAZARDOUS },
]);

/** [concentration low, concentration high, AQI low, AQI high] */
/** @typedef {[number, number, number, number]} Breakpoint */

/** PM2.5 (µg/m³, truncated to 0.1), EPA 2024 revision. */
/** @type {ReadonlyArray<Breakpoint>} */
export const PM25_BREAKPOINTS = Object.freeze([
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
]);

/** PM10 (µg/m³, truncated to an integer), EPA. */
/** @type {ReadonlyArray<Breakpoint>} */
export const PM10_BREAKPOINTS = Object.freeze([
  [0, 54, 0, 50],
  [55, 154, 51, 100],
  [155, 254, 101, 150],
  [255, 354, 151, 200],
  [355, 424, 201, 300],
  [425, 604, 301, 500],
]);

/** WHO 2021 24-hour air quality guideline levels, µg/m³. */
export const WHO_24H_GUIDELINE = Object.freeze({ pm25: 15, pm10: 45, no2: 25 });

/**
 * India NAQI categories by 24-hour PM2.5 concentration (µg/m³), CPCB 2014.
 * `max` is the upper bound of the band (inclusive); Severe has no upper bound.
 */
export const INDIA_PM25_BANDS = Object.freeze([
  { label: 'Good', max: 30 },
  { label: 'Satisfactory', max: 60 },
  { label: 'Moderate', max: 90 },
  { label: 'Poor', max: 120 },
  { label: 'Very Poor', max: 250 },
  { label: 'Severe', max: Infinity },
]);

/**
 * Truncate (not round) to a number of decimals, as the EPA method specifies.
 * @param {number} value
 * @param {number} decimals
 */
function truncate(value, decimals) {
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

/**
 * Linear interpolation inside the matching breakpoint band.
 * Above the top of the table the index is capped at 500 ("beyond the AQI").
 * @param {number} concentration already truncated
 * @param {ReadonlyArray<Breakpoint>} table
 * @returns {number}
 */
function interpolate(concentration, table) {
  for (const [cLow, cHigh, iLow, iHigh] of table) {
    if (concentration >= cLow && concentration <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow);
    }
  }
  return 500;
}

/**
 * US EPA AQI for a PM2.5 concentration.
 * @param {number} pm25 µg/m³
 */
export function aqiFromPm25(pm25) {
  if (!Number.isFinite(pm25) || pm25 < 0) throw new RangeError('PM2.5 must be a non-negative number.');
  return interpolate(truncate(pm25, 1), PM25_BREAKPOINTS);
}

/**
 * US EPA AQI for a PM10 concentration.
 * @param {number} pm10 µg/m³
 */
export function aqiFromPm10(pm10) {
  if (!Number.isFinite(pm10) || pm10 < 0) throw new RangeError('PM10 must be a non-negative number.');
  return interpolate(truncate(pm10, 0), PM10_BREAKPOINTS);
}

/**
 * EPA category for an AQI value.
 * @param {number} aqi
 * @returns {AqiCategory}
 */
export function categoryForAqi(aqi) {
  return AQI_CATEGORIES.find((c) => aqi <= c.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/**
 * India NAQI category label for a PM2.5 concentration.
 * @param {number} pm25 µg/m³
 */
export function indiaCategoryForPm25(pm25) {
  return (INDIA_PM25_BANDS.find((b) => pm25 <= b.max) ?? INDIA_PM25_BANDS[INDIA_PM25_BANDS.length - 1]).label;
}

/**
 * How many times above the WHO 24-hour guideline a concentration is, to one decimal.
 * @param {number} value µg/m³
 * @param {keyof typeof WHO_24H_GUIDELINE} pollutant
 */
export function timesWhoGuideline(value, pollutant) {
  return Math.round((value / WHO_24H_GUIDELINE[pollutant]) * 10) / 10;
}

/**
 * The overall AQI is the highest of the pollutant sub-indices; the pollutant that sets it is "dominant".
 * @param {{ pm25: number, pm10?: number | null }} reading µg/m³
 * @returns {{ aqi: number, dominant: 'pm25' | 'pm10', category: AqiCategory }}
 */
export function overallAqi({ pm25, pm10 }) {
  const fromPm25 = aqiFromPm25(pm25);
  const fromPm10 = typeof pm10 === 'number' ? aqiFromPm10(pm10) : -1;
  const aqi = Math.max(fromPm25, fromPm10);
  return { aqi, dominant: fromPm10 > fromPm25 ? 'pm10' : 'pm25', category: categoryForAqi(aqi) };
}
