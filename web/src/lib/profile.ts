import { DEFAULT_PROFILE } from '@shared/profile-schema.js';
import type { Profile } from './api';

/** Options, ranges and defaults come from the schema the server validates against. */
export {
  COMMUTE_OPTIONS,
  COOKING_FUEL_OPTIONS,
  HEATING_OPTIONS,
  NUMBER_RANGES,
  VENTILATION_OPTIONS,
} from '@shared/profile-schema.js';

/**
 * What the form shows first: the server's defaults, with an example family that includes a child
 * and an older adult, so a first-time visitor sees the advice for sensitive groups.
 */
export const STARTER_PROFILE: Profile = {
  ...DEFAULT_PROFILE,
  household: { adults: 2, children: 1, olderAdults: 1 },
};
