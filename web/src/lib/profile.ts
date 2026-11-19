import type { CommuteMode, CookingFuel, Heating, Profile, Ventilation } from './api';

/** Mirrors DEFAULT_PROFILE in src/validate.js. */
export const DEFAULT_PROFILE: Profile = {
  household: { adults: 2, children: 1, olderAdults: 1 },
  conditions: { respiratory: false, heart: false, pregnancy: false },
  commute: { mode: 'car_petrol', oneWayKm: 10, daysPerWeek: 5 },
  home: { roomAreaM2: 15, ventilation: 'average', purifierCadr: 0, cookingFuel: 'lpg', heating: 'none' },
  habits: { outdoorExerciseMinutes: 30, incenseOrCoils: false, smokingIndoors: false },
  notes: '',
};

export const COMMUTE_OPTIONS: { value: CommuteMode; label: string }[] = [
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
];

export const VENTILATION_OPTIONS: { value: Ventilation; label: string }[] = [
  { value: 'sealed', label: 'Well sealed (new building, tight windows)' },
  { value: 'average', label: 'Average' },
  { value: 'leaky', label: 'Draughty (gaps around doors and windows)' },
];

export const COOKING_OPTIONS: { value: CookingFuel; label: string }[] = [
  { value: 'lpg', label: 'LPG cylinder' },
  { value: 'piped_gas', label: 'Piped gas' },
  { value: 'electric', label: 'Electric or induction' },
  { value: 'biomass', label: 'Wood, coal, dung or crop waste' },
  { value: 'kerosene', label: 'Kerosene' },
];

export const HEATING_OPTIONS: { value: Heating; label: string }[] = [
  { value: 'none', label: 'No heating' },
  { value: 'electric', label: 'Electric heater' },
  { value: 'gas', label: 'Gas heater' },
  { value: 'wood_coal', label: 'Wood or coal fire' },
  { value: 'kerosene', label: 'Kerosene heater' },
];
