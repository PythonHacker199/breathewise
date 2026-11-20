/**
 * Turns an air-quality reading and a household profile into the full, deterministic plan.
 * Every number the user sees comes from here, never from the language model.
 */
import { AQI_LEVEL, indiaCategoryForPm25, overallAqi, timesWhoGuideline } from './aqi.js';
import { AIR_EXCHANGE_PER_HOUR, cigarettesPerDay, indoorPm25, roomVolume } from './exposure.js';
import { commuteAlternatives, commuteEmissions, MODE_LABELS } from './emissions.js';
import { buildRoutine } from './routine.js';
import { buildActions } from './actions.js';

/** @typedef {import('../validate.js').Profile} Profile */

/**
 * Air data normalised by the providers in src/air.
 * @typedef {object} AirData
 * @property {'google' | 'open-meteo'} source
 * @property {string} timeZone IANA name for the location
 * @property {{ time: string, pm25: number, pm10: number | null, no2: number | null, o3: number | null }} current
 * @property {import('./routine.js').HourlyReading[]} hourly
 * @property {{ name: string, aqi: number, category: string } | null} localIndex e.g. India's CPCB AQI from Google
 */

/**
 * @param {Profile} profile
 */
export function hasSensitiveMembers(profile) {
  const { household, conditions } = profile;
  return household.children > 0 || household.olderAdults > 0 || conditions.respiratory || conditions.heart || conditions.pregnancy;
}

/**
 * @param {object} input
 * @param {AirData} input.air
 * @param {Profile} input.profile
 * @param {Date} input.now
 */
export function buildPlan({ air, profile, now }) {
  const { pm25, pm10 } = air.current;
  const { aqi, dominant, category } = overallAqi({ pm25, pm10 });
  const indoorEstimate = indoorPm25({
    outdoorPm25: pm25,
    airExchange: AIR_EXCHANGE_PER_HOUR[profile.home.ventilation],
    roomVolume: roomVolume(profile.home.roomAreaM2),
    cadr: profile.home.purifierCadr,
  });
  const sensitive = hasSensitiveMembers(profile);

  const assessment = {
    pm25,
    pm10,
    no2: air.current.no2,
    o3: air.current.o3,
    aqi,
    dominant,
    category,
    whoMultiple: timesWhoGuideline(pm25, 'pm25'),
    cigarettesPerDay: cigarettesPerDay(pm25),
    indiaCategory: indiaCategoryForPm25(pm25),
    localIndex: air.localIndex,
    indoorEstimate,
    indoorCigarettesPerDay: cigarettesPerDay(indoorEstimate),
    sensitiveAlert: sensitive && category.level >= AQI_LEVEL.SENSITIVE,
    observedAt: air.current.time,
    source: air.source,
  };

  const routine = buildRoutine({
    hourly: air.hourly,
    timeZone: air.timeZone,
    now,
    exerciseMinutes: profile.habits.outdoorExerciseMinutes,
    hasSensitiveMembers: sensitive,
  });

  const commute = {
    mode: profile.commute.mode,
    label: MODE_LABELS[profile.commute.mode],
    ...commuteEmissions(profile.commute),
    alternatives: commuteAlternatives(profile.commute).slice(0, 3),
  };

  const actions = buildActions({ outdoorPm25: pm25, level: category.level, profile });

  return { assessment, routine, commute, actions, timeZone: air.timeZone };
}

/** @typedef {ReturnType<typeof buildPlan>} Plan */
