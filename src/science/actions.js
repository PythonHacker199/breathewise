/**
 * Personalised actions (indoor air fixes, low-exposure habits and sustainable alternatives),
 * each with the measured impact for this household and the source behind it.
 *
 * Every action is a small rule: `(ctx) => Action | null`. A rule returns null when it does not
 * apply to this household or today's air. `buildActions` runs every rule and sorts by priority
 * (higher first; ties keep the order of RULES below).
 */
import { AQI_LEVEL } from './aqi.js';
import {
  EXPOSED_MODES,
  MODE_LABELS,
  TAILPIPE_MODES,
  commuteAlternatives,
  commuteEmissions,
} from './emissions.js';
import {
  AIR_EXCHANGE_PER_HOUR,
  cigarettesPerDay,
  indoorPm25,
  percentReduction,
  recommendedCadr,
  roomVolume,
} from './exposure.js';
import { SOURCES } from './sources.js';

export { SOURCES };

/** @typedef {import('../validate.js').Profile} Profile */
/** @typedef {import('./sources.js').Source} Source */

/**
 * @typedef {object} Action
 * @property {string} id
 * @property {'indoor'|'routine'|'sustainable'} category
 * @property {string} title
 * @property {string} impact what changes, with numbers computed for this household
 * @property {string} why
 * @property {number} priority higher first
 * @property {Source} source
 */

/**
 * @typedef {object} ActionContext
 * @property {number} outdoorPm25 current outdoor PM2.5, µg/m³
 * @property {number} level EPA category level of the current air (see AQI_LEVEL)
 * @property {Profile} profile
 */

/**
 * Indoor PM2.5 in the household's main room under different set-ups, µg/m³.
 * @typedef {object} RoomModel
 * @property {number} targetCadr purifier CADR for about 5 clean-air changes per hour, m³/h
 * @property {number} closed windows shut, no purifier
 * @property {number} withOwnPurifier windows shut, the household's own purifier
 * @property {number} withTargetPurifier windows shut, a purifier of at least the target CADR
 * @property {number} windowsOpen windows open, no purifier
 */

/** @typedef {ActionContext & { room: RoomModel }} RuleContext */
/** @typedef {(ctx: RuleContext) => Action | null} ActionRule */

/**
 * Model the main room once, so every rule quotes the same numbers.
 * @param {ActionContext} ctx
 * @returns {RoomModel}
 */
function modelRoom({ outdoorPm25, profile }) {
  const { roomAreaM2, ventilation, purifierCadr } = profile.home;
  const volume = roomVolume(roomAreaM2);
  const targetCadr = recommendedCadr(volume);
  /** @param {number} cadr @param {number} [airExchange] */
  const indoor = (cadr, airExchange = AIR_EXCHANGE_PER_HOUR[ventilation]) =>
    indoorPm25({ outdoorPm25, airExchange, roomVolume: volume, cadr });
  return {
    targetCadr,
    closed: indoor(0),
    withOwnPurifier: indoor(purifierCadr),
    withTargetPurifier: indoor(Math.max(targetCadr, purifierCadr)),
    windowsOpen: indoor(0, AIR_EXCHANGE_PER_HOUR.windowsOpen),
  };
}

/** "from about X to about Y µg/m³ of PM2.5, Z% lower" for a room before and after a change. */
const roomChange = (/** @type {number} */ before, /** @type {number} */ after) =>
  `from about ${before} to about ${after} µg/m³ of PM2.5, ${percentReduction(before, after)}% lower`;

const hasCommute = (/** @type {Profile['commute']} */ commute) =>
  commute.oneWayKm > 0 && commute.daysPerWeek > 0;

// ---------------------------------------------------------------- indoor air

/** @type {ActionRule} */
function purifierRun({ profile, room }) {
  const { purifierCadr, roomAreaM2 } = profile.home;
  if (purifierCadr < room.targetCadr) return null;
  return {
    id: 'purifier-run',
    category: 'indoor',
    title: 'Run your purifier continuously with doors and windows shut',
    impact: `Your purifier (${purifierCadr} m³/h) brings this ${roomAreaM2} m² room ${roomChange(room.closed, room.withOwnPurifier)}.`,
    why: 'A purifier only cleans the air of a closed room; open doors and windows let outdoor smoke back in faster than it can filter.',
    priority: 90,
    source: SOURCES.epaAirCleaners,
  };
}

/**
 * Purifier sizing advice. On a clean-air day the gain is tiny in absolute terms, so it is framed
 * as smog-day preparation and drops below source-reduction actions.
 * @type {ActionRule}
 */
function purifierSize({ level, profile, room }) {
  const { purifierCadr, roomAreaM2 } = profile.home;
  if (purifierCadr >= room.targetCadr) return null;
  let title = 'Clean the air of one room with a HEPA purifier';
  if (purifierCadr > 0) title = 'Your purifier is undersized for this room';
  else if (level === AQI_LEVEL.GOOD) {
    title = 'Be ready for smog days: size a HEPA purifier for one room';
  }
  let priority = 40;
  if (level >= AQI_LEVEL.SENSITIVE) priority = 95;
  else if (level === AQI_LEVEL.MODERATE) priority = 70;
  return {
    id: 'purifier-size',
    category: 'indoor',
    title,
    impact: `A purifier with a clean air delivery rate of at least ${room.targetCadr} m³/h would bring this ${roomAreaM2} m² room ${roomChange(room.closed, room.withTargetPurifier)}.`,
    why: "Pick the room where the family sleeps. Size by clean air delivery rate (CADR), not by the box's room-size claim; about 5 clean-air changes per hour is the usual target.",
    priority,
    source: SOURCES.epaAirCleaners,
  };
}

/** @type {ActionRule} */
function diyFilter({ profile }) {
  if (profile.home.purifierCadr > 0) return null;
  return {
    id: 'diy-filter',
    category: 'indoor',
    title: 'Low-cost option: a box-fan filter',
    impact:
      'Four MERV-13 furnace filters taped around a box fan (a "Corsi-Rosenthal box") have measured clean-air delivery rates comparable to many commercial purifiers.',
    why: 'Useful when a purifier is unaffordable or for a second room. Run it on medium or high in a closed room.',
    priority: 60,
    source: SOURCES.epaDiyCleaners,
  };
}

/** @type {ActionRule} */
function keepWindowsClosed({ level, room }) {
  if (level < AQI_LEVEL.SENSITIVE) return null;
  return {
    id: 'windows',
    category: 'indoor',
    title: 'Keep windows closed outside the cleanest hour',
    impact: `With windows open the room tracks outdoor air (about ${room.windowsOpen} µg/m³); closed, it settles near ${room.closed} µg/m³ even without a purifier.`,
    why: "Seal obvious gaps under doors with a towel or draught stopper; use your car's recirculation mode in traffic.",
    priority: 80,
    source: SOURCES.epaAirCleaners,
  };
}

/** @type {ActionRule} */
function swapCoils({ profile }) {
  if (!profile.habits.incenseOrCoils) return null;
  return {
    id: 'coils',
    category: 'indoor',
    title: 'Swap mosquito coils and incense for smoke-free options',
    impact:
      'Burning one mosquito coil released as much PM2.5 as 75 to 137 cigarettes in laboratory tests.',
    why: 'Use mosquito nets, window screens or plug-in electric repellents, and keep incense for well-ventilated days.',
    priority: 85,
    source: SOURCES.coils,
  };
}

/** @type {ActionRule} */
function smokeFreeHome({ profile }) {
  if (!profile.habits.smokingIndoors) return null;
  return {
    id: 'smoking',
    category: 'indoor',
    title: 'Make the home smoke-free',
    impact:
      'Tobacco smoke is one of the largest indoor sources of fine particles and undoes the work of a purifier.',
    why: 'Smoke outside, away from doors and windows, and never in the car with children.',
    priority: 88,
    source: SOURCES.whoHousehold,
  };
}

const POLLUTING_COOKING_FUELS = new Set(['biomass', 'kerosene']);

/** @type {ActionRule} */
function cleanCooking({ profile }) {
  if (!POLLUTING_COOKING_FUELS.has(profile.home.cookingFuel)) return null;
  return {
    id: 'clean-cooking',
    category: 'indoor',
    title: 'Move cooking to LPG, piped gas or electric',
    impact:
      'Household air pollution from cooking with polluting fuels was linked to an estimated 3.2 million deaths a year worldwide in 2020.',
    why: 'If switching is not possible yet, cook with a lid on, use a chimney or exhaust fan, and keep children away from the stove.',
    priority: 92,
    source: SOURCES.whoHousehold,
  };
}

/** @type {ActionRule} */
function cookingFan({ profile }) {
  if (POLLUTING_COOKING_FUELS.has(profile.home.cookingFuel)) return null;
  return {
    id: 'cooking-fan',
    category: 'indoor',
    title: 'Run the kitchen exhaust while cooking',
    impact:
      'Frying and roasting produce fine particles indoors even with clean fuels; venting them stops them spreading through the home.',
    why: 'Cook with lids on and run the exhaust fan or chimney for 10 minutes after cooking.',
    priority: 40,
    source: SOURCES.whoHousehold,
  };
}

/** @type {ActionRule} */
function plantsMyth() {
  return {
    id: 'plants-myth',
    category: 'indoor',
    title: "Don't count on houseplants to clean the air",
    impact:
      'Matching the air cleaning of ordinary ventilation would take 10 to 1,000 plants per square metre of floor.',
    why: 'Plants are pleasant, but a purifier or filter does the real work during smog.',
    priority: 20,
    source: SOURCES.plants,
  };
}

// ---------------------------------------------------------------- outdoor habits

/** @type {ActionRule} */
function wearMask({ outdoorPm25, level, profile }) {
  if (level < AQI_LEVEL.SENSITIVE) return null;
  const { mode } = profile.commute;
  const exposed = EXPOSED_MODES.has(mode);
  return {
    id: 'mask',
    category: 'routine',
    title: exposed
      ? `Wear a well-fitted N95 or FFP2 mask on your ${MODE_LABELS[mode].toLowerCase()} commute`
      : 'Wear a well-fitted N95 or FFP2 mask outdoors',
    impact:
      'Certified N95 filters capture at least 95% of test particles; a tight seal around the nose and chin matters as much as the filter. Cloth and surgical masks protect far less.',
    why: `Today's PM2.5 of ${outdoorPm25} µg/m³ is like breathing in about ${cigarettesPerDay(outdoorPm25)} cigarettes a day for anyone outside all day.`,
    priority: exposed ? 93 : 75,
    source: SOURCES.niosh,
  };
}

// ---------------------------------------------------------------- sustainable alternatives

/** @type {ActionRule} */
function switchCommute({ profile }) {
  const { commute } = profile;
  const best = commuteAlternatives(commute)[0];
  if (!best || !hasCommute(commute)) return null;
  const current = commuteEmissions(commute);
  return {
    id: 'commute-switch',
    category: 'sustainable',
    title: `Try ${best.label.toLowerCase()} instead of the ${MODE_LABELS[commute.mode].toLowerCase()}`,
    impact: `Your ${commute.oneWayKm} km commute, ${commute.daysPerWeek} days a week, emits about ${current.kgPerYear} kg CO2e a year. Switching saves about ${best.kgSavedPerYear} kg a year (${best.percentSaved}%).`,
    why: TAILPIPE_MODES.has(commute.mode)
      ? 'Every car or motorbike trip left at home also removes exhaust from the street where your neighbours walk and breathe.'
      : 'Lower-carbon travel also means less fuel burned in the city during smog season.',
    priority: 65,
    source: SOURCES.desnz,
  };
}

/** @type {ActionRule} */
function carpool({ profile }) {
  const { commute } = profile;
  const fuelCar = commute.mode.startsWith('car_') && commute.mode !== 'car_electric';
  if (!fuelCar || !hasCommute(commute)) return null;
  const alone = commuteEmissions(commute);
  const shared = commuteEmissions({ ...commute, occupants: 2 });
  return {
    id: 'carpool',
    category: 'sustainable',
    title: 'Share the car with one colleague or neighbour',
    impact: `Carpooling with one other person halves your share: about ${shared.kgPerYear} kg CO2e a year instead of ${alone.kgPerYear} kg.`,
    why: 'Turn the engine off at long signals and in queues; idling adds exhaust where people are waiting.',
    priority: 55,
    source: SOURCES.desnz,
  };
}

const POLLUTING_HEATING = new Set(['wood_coal', 'kerosene']);

/** @type {ActionRule} */
function cleanHeating({ profile }) {
  if (!POLLUTING_HEATING.has(profile.home.heating)) return null;
  return {
    id: 'clean-heating',
    category: 'sustainable',
    title: 'Heat with electricity instead of wood, coal or kerosene',
    impact:
      'Burning solid fuels and kerosene indoors is a major source of household air pollution, and the smoke also adds to winter smog outside.',
    why: 'Heat the room you are in with an electric heater and keep doors closed to hold the warmth.',
    priority: 89,
    source: SOURCES.whoHousehold,
  };
}

/** @type {ActionRule} */
function noOpenBurning() {
  return {
    id: 'no-burning',
    category: 'sustainable',
    title: 'Never burn leaves, waste or crop residue',
    impact:
      'Open burning releases smoke at ground level, right where people breathe, and adds to the winter smog over the whole neighbourhood.',
    why: 'Compost garden waste or hand it to municipal collection, skip firecrackers, and report open burning to your local authority.',
    priority: 50,
    source: SOURCES.whoAqg,
  };
}

/** Every rule, in tie-break order. */
const RULES = Object.freeze([
  purifierRun,
  purifierSize,
  diyFilter,
  keepWindowsClosed,
  swapCoils,
  smokeFreeHome,
  cleanCooking,
  cookingFan,
  plantsMyth,
  wearMask,
  switchCommute,
  carpool,
  cleanHeating,
  noOpenBurning,
]);

/**
 * All actions for this household, most important first.
 * @param {ActionContext} ctx
 * @returns {Action[]}
 */
export function buildActions(ctx) {
  const ruleContext = { ...ctx, room: modelRoom(ctx) };
  return RULES.map((rule) => rule(ruleContext))
    .filter(/** @returns {action is Action} */ (action) => action !== null)
    .sort((a, b) => b.priority - a.priority);
}
