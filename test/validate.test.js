import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROFILE,
  cleanText,
  isTimeZone,
  validateLocation,
  validateProfile,
  validateQuestion,
  validateSearch,
} from '../src/validate.js';
import { COMMUTE_OPTIONS, NUMBER_RANGES } from '../shared/profile-schema.js';
import { GRAMS_CO2E_PER_KM, MODE_LABELS } from '../src/science/emissions.js';

describe('profile validation', () => {
  test('an empty body gives the default profile', () => {
    const result = validateProfile({});
    assert.ok(result.ok);
    assert.deepEqual(result.value, DEFAULT_PROFILE);
  });

  test('accepts a full valid profile and numeric strings', () => {
    const result = validateProfile({
      household: { adults: 2, children: '1', olderAdults: 1 },
      conditions: { respiratory: true },
      commute: { mode: 'bus', oneWayKm: 12.5, daysPerWeek: 6 },
      home: {
        roomAreaM2: 20,
        ventilation: 'leaky',
        purifierCadr: 250,
        cookingFuel: 'biomass',
        heating: 'wood_coal',
      },
      habits: { outdoorExerciseMinutes: 45, incenseOrCoils: true },
      notes: '  Grandma has asthma\u0000  ',
    });
    assert.ok(result.ok);
    assert.equal(result.value.household.children, 1);
    assert.equal(result.value.commute.mode, 'bus');
    assert.equal(result.value.notes, 'Grandma has asthma');
  });

  test('reports every invalid field by path', () => {
    const result = validateProfile({
      household: { adults: -1, children: 1.5 },
      conditions: { heart: 'yes' },
      commute: { mode: 'rocket', daysPerWeek: 9 },
      home: { ventilation: 'open', roomAreaM2: 1 },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors).sort(), [
      'commute.daysPerWeek',
      'commute.mode',
      'conditions.heart',
      'home.roomAreaM2',
      'home.ventilation',
      'household.adults',
      'household.children',
    ]);
  });

  test('requires at least one person', () => {
    const result = validateProfile({ household: { adults: 0, children: 0, olderAdults: 0 } });
    assert.equal(result.ok, false);
  });
});

describe('location, search and question validation', () => {
  test('rounds coordinates to about 1 km and keeps a valid time zone', () => {
    const result = validateLocation({
      lat: 28.65195,
      lon: 77.23149,
      name: 'Delhi',
      timeZone: 'Asia/Kolkata',
    });
    assert.ok(result.ok);
    assert.deepEqual(result.value, {
      lat: 28.65,
      lon: 77.23,
      name: 'Delhi',
      timeZone: 'Asia/Kolkata',
    });
  });

  test('drops an invalid time zone and rejects bad coordinates', () => {
    const ok = validateLocation({ lat: 1, lon: 2, timeZone: 'Mars/Olympus' });
    assert.ok(ok.ok && !('timeZone' in ok.value));
    assert.equal(validateLocation({ lat: 91, lon: 0 }).ok, false);
    assert.equal(validateLocation({}).ok, false);
    assert.equal(validateLocation(null).ok, false);
  });

  test('time zones, search terms, questions and text cleaning', () => {
    assert.equal(isTimeZone('Europe/London'), true);
    assert.equal(isTimeZone(''), false);
    assert.equal(validateSearch('D').ok, false);
    assert.equal(validateSearch(' Delhi ').ok, true);
    assert.equal(validateQuestion('hi').ok, false);
    assert.equal(validateQuestion('Is a purifier worth it?').ok, true);
    assert.equal(cleanText('a‮b   c', 10), 'ab c');
    assert.equal(cleanText(42, 10), '');
  });
});

describe('shared profile schema', () => {
  test('the validator accepts exactly the ranges the form is built from', () => {
    for (const [section, fields] of Object.entries(NUMBER_RANGES)) {
      for (const [field, range] of Object.entries(fields)) {
        const at = (value) =>
          validateProfile({ household: { adults: 1 }, [section]: { [field]: value } });
        const key = `${section}.${field}`;
        assert.ok(
          at(range.max).ok || at(range.max).errors?.[key] === undefined,
          `${key} max accepted`,
        );
        assert.equal(
          at(range.max + 1).errors?.[key] !== undefined,
          true,
          `${key} above max rejected`,
        );
        assert.equal(
          at(range.min - 1).errors?.[key] !== undefined,
          true,
          `${key} below min rejected`,
        );
      }
    }
  });

  test('every commute option has a label and an emission factor', () => {
    for (const { value, label } of COMMUTE_OPTIONS) {
      assert.equal(MODE_LABELS[value], label);
      assert.equal(typeof GRAMS_CO2E_PER_KM[value], 'number', value);
    }
  });
});
