import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { aqiFromPm10, aqiFromPm25, categoryForAqi, indiaCategoryForPm25, overallAqi, timesWhoGuideline, AQI_CATEGORIES } from '../src/science/aqi.js';
import { cigarettesPerDay, indoorPm25, inhaledDose, percentReduction, recommendedCadr, roomVolume } from '../src/science/exposure.js';
import { commuteAlternatives, commuteEmissions, GRAMS_CO2E_PER_KM, isCommuteMode } from '../src/science/emissions.js';
import { buildRoutine, findWindow, localTime, upcomingHours } from '../src/science/routine.js';
import { buildActions } from '../src/science/actions.js';
import { buildPlan, hasSensitiveMembers } from '../src/science/plan.js';
import { DEFAULT_PROFILE } from '../src/validate.js';
import { NOW, BASE_UNIX, HOUR, pm25At } from './helpers.js';

const hourly = Array.from({ length: 48 }, (_, i) => ({ time: new Date((BASE_UNIX + i * HOUR) * 1000).toISOString(), pm25: pm25At(i), pm10: 90 }));
/** @param {object} [over] */
const profile = (over = {}) => structuredClone({ ...DEFAULT_PROFILE, ...over });

describe('US EPA AQI (2024 PM2.5 breakpoints)', () => {
  test('band edges map to the published index values', () => {
    const cases = [
      [0, 0],
      [9.0, 50],
      [9.1, 51],
      [35.4, 100],
      [35.5, 101],
      [55.4, 150],
      [55.5, 151],
      [125.4, 200],
      [125.5, 201],
      [225.4, 300],
      [225.5, 301],
      [325.4, 500],
    ];
    for (const [pm25, aqi] of cases) assert.equal(aqiFromPm25(pm25), aqi, `PM2.5 ${pm25}`);
  });

  test('concentrations are truncated, not rounded, before lookup', () => {
    assert.equal(aqiFromPm25(9.09), 50);
    assert.equal(aqiFromPm25(35.49), 100);
  });

  test('interpolates inside a band and caps beyond the scale', () => {
    assert.equal(aqiFromPm25(64.3), 157);
    assert.equal(aqiFromPm25(20), 71);
    assert.equal(aqiFromPm25(900), 500);
  });

  test('PM10 breakpoints', () => {
    for (const [pm10, aqi] of [
      [54, 50],
      [55, 51],
      [154, 100],
      [155, 101],
      [424, 300],
      [425, 301],
    ]) {
      assert.equal(aqiFromPm10(pm10), aqi);
    }
  });

  test('rejects invalid input', () => {
    assert.throws(() => aqiFromPm25(-1), RangeError);
    assert.throws(() => aqiFromPm10(Number.NaN), RangeError);
  });

  test('categories cover 0–500 without gaps', () => {
    for (let i = 1; i < AQI_CATEGORIES.length; i += 1) assert.equal(AQI_CATEGORIES[i].min, AQI_CATEGORIES[i - 1].max + 1);
    assert.equal(categoryForAqi(0).key, 'good');
    assert.equal(categoryForAqi(101).key, 'sensitive');
    assert.equal(categoryForAqi(500).key, 'hazardous');
  });

  test('overall AQI is the worse of PM2.5 and PM10', () => {
    assert.equal(overallAqi({ pm25: 10, pm10: 300 }).dominant, 'pm10');
    assert.equal(overallAqi({ pm25: 64.3, pm10: 65 }).aqi, 157);
    assert.equal(overallAqi({ pm25: 64.3, pm10: null }).dominant, 'pm25');
  });

  test('India NAQI bands and WHO multiples', () => {
    for (const [pm25, label] of [
      [30, 'Good'],
      [31, 'Satisfactory'],
      [90, 'Moderate'],
      [120, 'Poor'],
      [250, 'Very Poor'],
      [251, 'Severe'],
    ]) {
      assert.equal(indiaCategoryForPm25(pm25), label);
    }
    assert.equal(timesWhoGuideline(64.3, 'pm25'), 4.3);
  });
});

describe('exposure physics', () => {
  test('cigarette equivalence uses 22 µg/m³ per cigarette', () => {
    assert.equal(cigarettesPerDay(22), 1);
    assert.equal(cigarettesPerDay(64.3), 2.9);
    assert.equal(cigarettesPerDay(-5), 0);
  });

  test('indoor mass balance with and without a purifier', () => {
    const volume = roomVolume(15);
    assert.equal(volume, 40.5);
    assert.equal(indoorPm25({ outdoorPm25: 100, airExchange: 0.5, roomVolume: volume }), 71.4);
    assert.equal(recommendedCadr(volume), 210);
    assert.equal(indoorPm25({ outdoorPm25: 100, airExchange: 0.5, roomVolume: volume, cadr: 210 }), 8.5);
    assert.throws(() => indoorPm25({ outdoorPm25: 1, airExchange: 1, roomVolume: 0 }), RangeError);
  });

  test('inhaled dose and percentage change', () => {
    assert.equal(inhaledDose(150, 0.5, 'moderate'), 120);
    assert.equal(inhaledDose(20, 1, 'rest'), 10);
    assert.equal(percentReduction(71.4, 8.5), 88);
    assert.equal(percentReduction(0, 5), 0);
    assert.equal(percentReduction(5, 10), 0);
  });
});

describe('travel emissions (DESNZ 2022 factors)', () => {
  test('factors match the published values', () => {
    assert.equal(GRAMS_CO2E_PER_KM.car_petrol, 170.48);
    assert.equal(GRAMS_CO2E_PER_KM.metro, 27.81);
    assert.equal(isCommuteMode('car_petrol'), true);
    assert.equal(isCommuteMode('rocket'), false);
  });

  test('round-trip commute emissions', () => {
    assert.deepEqual(commuteEmissions({ mode: 'car_petrol', oneWayKm: 10, daysPerWeek: 5 }), { kgPerWeek: 17, kgPerYear: 886.5 });
    assert.equal(commuteEmissions({ mode: 'car_petrol', oneWayKm: 10, daysPerWeek: 5, occupants: 2 }).kgPerYear, 443.2);
    assert.equal(commuteEmissions({ mode: 'bus', oneWayKm: 10, daysPerWeek: 5, occupants: 4 }).kgPerYear, 501.8);
  });

  test('alternatives are ranked by savings and realistic for the distance', () => {
    const alts = commuteAlternatives({ mode: 'car_petrol', oneWayKm: 10, daysPerWeek: 5 });
    assert.equal(alts[0].mode, 'metro');
    assert.equal(alts[0].kgSavedPerYear, 741.9);
    assert.equal(alts[0].percentSaved, 84);
    assert.ok(!alts.some((a) => a.mode === 'bicycle' || a.mode === 'walk'));
    assert.ok(commuteAlternatives({ mode: 'car_petrol', oneWayKm: 2, daysPerWeek: 5 }).some((a) => a.mode === 'walk'));
    assert.deepEqual(commuteAlternatives({ mode: 'walk', oneWayKm: 1, daysPerWeek: 5 }), []);
  });
});

describe('daily routine', () => {
  test('time labels use the location time zone', () => {
    assert.equal(localTime('2026-11-19T14:00:00Z', 'Asia/Kolkata'), '19:30');
  });

  test('upcoming hours start at the current hour and span a day', () => {
    const hours = upcomingHours(hourly, NOW);
    assert.equal(hours[0].time, '2026-11-19T10:00:00.000Z');
    assert.equal(hours.length, 25);
  });

  test('finds the cleanest and worst daytime hours', () => {
    const hours = upcomingHours(hourly, NOW);
    assert.equal(findWindow(hours, 'Asia/Kolkata')?.startLabel, '19:30');
    const worst = findWindow(hours, 'Asia/Kolkata', { pick: 'worst' });
    assert.equal(worst?.pm25, 150);
    assert.equal(worst?.startLabel, '17:30');
    assert.equal(findWindow([], 'UTC'), null);
  });

  test('routine quantifies the exercise-timing benefit and flags sensitive members', () => {
    const routine = buildRoutine({ hourly, timeZone: 'Asia/Kolkata', now: NOW, exerciseMinutes: 30, hasSensitiveMembers: true });
    assert.equal(routine.exerciseDoseSavedUg, 104); // 150 × 1.6 × 0.5 − 20 × 1.6 × 0.5
    assert.deepEqual(
      routine.items.map((i) => i.id),
      ['exercise-window', 'ventilate', 'avoid-peak', 'sensitive'],
    );
  });

  test('very polluted days move exercise indoors and keep windows shut', () => {
    const smog = hourly.map((h) => ({ ...h, pm25: 180 }));
    const routine = buildRoutine({ hourly: smog, timeZone: 'Asia/Kolkata', now: NOW, exerciseMinutes: 30, hasSensitiveMembers: false });
    assert.deepEqual(
      routine.items.map((i) => i.id),
      ['exercise-indoors', 'keep-closed', 'avoid-peak'],
    );
  });

  test('no forecast means no routine', () => {
    assert.deepEqual(buildRoutine({ hourly: [], timeZone: 'UTC', now: NOW, exerciseMinutes: 0, hasSensitiveMembers: false }).items, []);
  });
});

describe('personalised actions', () => {
  test('purifier sizing uses the household room and quotes the computed reduction', () => {
    const actions = buildActions({ outdoorPm25: 100, level: 3, profile: profile() });
    const purifier = actions.find((a) => a.id === 'purifier-size');
    assert.match(purifier?.impact ?? '', /at least 210 m³\/h/);
    assert.match(purifier?.impact ?? '', /from about 71\.4 to about 8\.5/);
    assert.ok(actions.every((a) => a.source.label));
  });

  test('an adequate purifier gets a "keep it running" action instead', () => {
    const actions = buildActions({ outdoorPm25: 100, level: 3, profile: profile({ home: { ...DEFAULT_PROFILE.home, purifierCadr: 300 } }) });
    assert.ok(actions.some((a) => a.id === 'purifier-run'));
    assert.ok(!actions.some((a) => a.id === 'diy-filter'));
  });

  test('habit- and fuel-specific actions appear only when relevant', () => {
    const risky = profile({
      home: { ...DEFAULT_PROFILE.home, cookingFuel: 'biomass', heating: 'wood_coal' },
      habits: { outdoorExerciseMinutes: 0, incenseOrCoils: true, smokingIndoors: true },
    });
    const ids = buildActions({ outdoorPm25: 100, level: 3, profile: risky }).map((a) => a.id);
    for (const id of ['clean-cooking', 'clean-heating', 'coils', 'smoking']) assert.ok(ids.includes(id), id);
    const clean = buildActions({ outdoorPm25: 5, level: 0, profile: profile() }).map((a) => a.id);
    for (const id of ['clean-cooking', 'clean-heating', 'coils', 'smoking', 'mask', 'windows']) assert.ok(!clean.includes(id), id);
  });

  test('on a clean-air day the purifier is framed as smog-day preparation, not the top priority', () => {
    const actions = buildActions({ outdoorPm25: 2.5, level: 0, profile: profile() });
    const purifier = actions.find((a) => a.id === 'purifier-size');
    assert.match(purifier?.title ?? '', /^Be ready for smog days/);
    assert.notEqual(actions[0].id, 'purifier-size');
  });

  test('actions are sorted by priority', () => {
    const priorities = buildActions({ outdoorPm25: 100, level: 3, profile: profile() }).map((a) => a.priority);
    assert.deepEqual(
      [...priorities].sort((a, b) => b - a),
      priorities,
    );
  });
});

describe('plan', () => {
  const air = {
    source: /** @type {const} */ ('open-meteo'),
    timeZone: 'Asia/Kolkata',
    current: { time: NOW.toISOString(), pm25: 64.3, pm10: 65, no2: 67.5, o3: 112 },
    hourly,
    localIndex: null,
  };

  test('combines assessment, routine, commute and actions', () => {
    const plan = buildPlan({ air, profile: profile(), now: NOW });
    assert.equal(plan.assessment.aqi, 157);
    assert.equal(plan.assessment.category.key, 'unhealthy');
    assert.equal(plan.assessment.cigarettesPerDay, 2.9);
    assert.equal(plan.assessment.indiaCategory, 'Moderate');
    assert.equal(plan.commute.kgPerYear, 886.5);
    assert.ok(plan.actions.length > 3);
    assert.equal(plan.assessment.sensitiveAlert, false);
  });

  test('sensitive members are detected from household and conditions', () => {
    assert.equal(hasSensitiveMembers(profile()), false);
    assert.equal(hasSensitiveMembers(profile({ household: { adults: 2, children: 1, olderAdults: 0 } })), true);
    assert.equal(hasSensitiveMembers(profile({ conditions: { respiratory: true, heart: false, pregnancy: false } })), true);
  });

  test('is deterministic', () => {
    assert.deepEqual(buildPlan({ air, profile: profile(), now: NOW }), buildPlan({ air, profile: profile(), now: NOW }));
  });
});
