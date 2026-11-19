/**
 * Personalised actions (indoor air hacks, low-exposure habits and sustainable alternatives),
 * each with the measured impact for this household and the source behind it.
 */
import { AIR_EXCHANGE_PER_HOUR, cigarettesPerDay, indoorPm25, percentReduction, recommendedCadr, roomVolume } from './exposure.js';
import { MODE_LABELS, EXPOSED_MODES, TAILPIPE_MODES, commuteAlternatives, commuteEmissions } from './emissions.js';

/** @typedef {import('../validate.js').Profile} Profile */
/** @typedef {{ label: string, url?: string }} Source */

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

export const SOURCES = Object.freeze({
  epaAirCleaners: { label: 'US EPA, Guide to Air Cleaners in the Home (2018)', url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home' },
  epaDiyCleaners: { label: 'US EPA research on DIY air cleaners', url: 'https://www.epa.gov/air-research/research-diy-air-cleaners-reduce-wildfire-smoke-indoors' },
  berkeley: { label: 'Berkeley Earth, Air Pollution and Cigarette Equivalence (2015)', url: 'https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/' },
  whoHousehold: { label: 'WHO fact sheet: Household air pollution', url: 'https://www.who.int/news-room/fact-sheets/detail/household-air-pollution-and-health' },
  whoAqg: { label: 'WHO Global Air Quality Guidelines (2021)', url: 'https://www.who.int/publications/i/item/9789240034228' },
  plants: { label: 'Cummings & Waring (2020), J. Expo. Sci. Environ. Epidemiol. 30:253–261', url: 'https://doi.org/10.1038/s41370-019-0175-9' },
  coils: { label: 'Liu et al. (2003), Environmental Health Perspectives 111:1454–1460' },
  niosh: { label: 'NIOSH respirator certification, 42 CFR Part 84' },
  desnz: { label: 'UK DESNZ greenhouse gas conversion factors (2022), via Our World in Data', url: 'https://ourworldindata.org/grapher/carbon-footprint-travel-mode' },
});

/**
 * @typedef {object} ActionContext
 * @property {number} outdoorPm25 current outdoor PM2.5, µg/m³
 * @property {number} level EPA category level of the current air (0 good … 5 hazardous)
 * @property {Profile} profile
 */

/**
 * Indoor-air actions: purifier sizing, windows, combustion indoors, myths.
 * @param {ActionContext} ctx
 * @returns {Action[]}
 */
function indoorActions({ outdoorPm25, level, profile }) {
  const { home, habits } = profile;
  const volume = roomVolume(home.roomAreaM2);
  const airExchange = AIR_EXCHANGE_PER_HOUR[home.ventilation];
  const target = recommendedCadr(volume);
  const without = indoorPm25({ outdoorPm25, airExchange, roomVolume: volume });
  const withTarget = indoorPm25({ outdoorPm25, airExchange, roomVolume: volume, cadr: Math.max(target, home.purifierCadr) });
  /** @type {Action[]} */
  const actions = [];

  if (home.purifierCadr >= target) {
    const current = indoorPm25({ outdoorPm25, airExchange, roomVolume: volume, cadr: home.purifierCadr });
    actions.push({
      id: 'purifier-run',
      category: 'indoor',
      title: 'Run your purifier continuously with doors and windows shut',
      impact: `Your purifier (${home.purifierCadr} m³/h) brings this ${home.roomAreaM2} m² room from about ${without} to about ${current} µg/m³ of PM2.5, ${percentReduction(without, current)}% lower.`,
      why: 'A purifier only cleans the air of a closed room; open doors and windows let outdoor smoke back in faster than it can filter.',
      priority: 90,
      source: SOURCES.epaAirCleaners,
    });
  } else {
    const has = home.purifierCadr > 0;
    actions.push({
      id: 'purifier-size',
      category: 'indoor',
      title: has
        ? 'Your purifier is undersized for this room'
        : level === 0
          ? 'Be ready for smog days: size a HEPA purifier for one room'
          : 'Clean the air of one room with a HEPA purifier',
      impact: `A purifier with a clean air delivery rate of at least ${target} m³/h would bring this ${home.roomAreaM2} m² room from about ${without} to about ${withTarget} µg/m³ of PM2.5, ${percentReduction(without, withTarget)}% lower.`,
      why: 'Pick the room where the family sleeps. Size by clean air delivery rate (CADR), not by the box\'s room-size claim; about 5 clean-air changes per hour is the usual target.',
      // On a clean-air day the gain is tiny in absolute terms, so it drops below source-reduction actions.
      priority: level >= 2 ? 95 : level === 1 ? 70 : 40,
      source: SOURCES.epaAirCleaners,
    });
    if (!has) {
      actions.push({
        id: 'diy-filter',
        category: 'indoor',
        title: 'Low-cost option: a box-fan filter',
        impact: 'Four MERV-13 furnace filters taped around a box fan (a "Corsi-Rosenthal box") have measured clean-air delivery rates comparable to many commercial purifiers.',
        why: 'Useful when a purifier is unaffordable or for a second room. Run it on medium or high in a closed room.',
        priority: 60,
        source: SOURCES.epaDiyCleaners,
      });
    }
  }

  const windowsOpen = indoorPm25({ outdoorPm25, airExchange: AIR_EXCHANGE_PER_HOUR.windowsOpen, roomVolume: volume });
  if (level >= 2) {
    actions.push({
      id: 'windows',
      category: 'indoor',
      title: 'Keep windows closed outside the cleanest hour',
      impact: `With windows open the room tracks outdoor air (about ${windowsOpen} µg/m³); closed, it settles near ${without} µg/m³ even without a purifier.`,
      why: 'Seal obvious gaps under doors with a towel or draught stopper; use your car\'s recirculation mode in traffic.',
      priority: 80,
      source: SOURCES.epaAirCleaners,
    });
  }

  if (habits.incenseOrCoils) {
    actions.push({
      id: 'coils',
      category: 'indoor',
      title: 'Swap mosquito coils and incense for smoke-free options',
      impact: 'Burning one mosquito coil released as much PM2.5 as 75 to 137 cigarettes in laboratory tests.',
      why: 'Use mosquito nets, window screens or plug-in electric repellents, and keep incense for well-ventilated days.',
      priority: 85,
      source: SOURCES.coils,
    });
  }

  if (habits.smokingIndoors) {
    actions.push({
      id: 'smoking',
      category: 'indoor',
      title: 'Make the home smoke-free',
      impact: 'Tobacco smoke is one of the largest indoor sources of fine particles and undoes the work of a purifier.',
      why: 'Smoke outside, away from doors and windows, and never in the car with children.',
      priority: 88,
      source: SOURCES.whoHousehold,
    });
  }

  if (home.cookingFuel === 'biomass' || home.cookingFuel === 'kerosene') {
    actions.push({
      id: 'clean-cooking',
      category: 'indoor',
      title: 'Move cooking to LPG, piped gas or electric',
      impact: 'Household air pollution from cooking with polluting fuels was linked to an estimated 3.2 million deaths a year worldwide in 2020.',
      why: 'If switching is not possible yet, cook with a lid on, use a chimney or exhaust fan, and keep children away from the stove.',
      priority: 92,
      source: SOURCES.whoHousehold,
    });
  } else {
    actions.push({
      id: 'cooking-fan',
      category: 'indoor',
      title: 'Run the kitchen exhaust while cooking',
      impact: 'Frying and roasting produce fine particles indoors even with clean fuels; venting them stops them spreading through the home.',
      why: 'Cook with lids on and run the exhaust fan or chimney for 10 minutes after cooking.',
      priority: 40,
      source: SOURCES.whoHousehold,
    });
  }

  actions.push({
    id: 'plants-myth',
    category: 'indoor',
    title: 'Don\'t count on houseplants to clean the air',
    impact: 'Matching the air cleaning of ordinary ventilation would take 10 to 1,000 plants per square metre of floor.',
    why: 'Plants are pleasant, but a purifier or filter does the real work during smog.',
    priority: 20,
    source: SOURCES.plants,
  });

  return actions;
}

/**
 * Habits that cut personal exposure outdoors.
 * @param {ActionContext} ctx
 * @returns {Action[]}
 */
function routineActions({ outdoorPm25, level, profile }) {
  /** @type {Action[]} */
  const actions = [];
  const { commute } = profile;
  if (level >= 2) {
    const exposed = EXPOSED_MODES.has(commute.mode);
    actions.push({
      id: 'mask',
      category: 'routine',
      title: exposed ? `Wear a well-fitted N95 or FFP2 mask on your ${MODE_LABELS[commute.mode].toLowerCase()} commute` : 'Wear a well-fitted N95 or FFP2 mask outdoors',
      impact: 'Certified N95 filters capture at least 95% of test particles; a tight seal around the nose and chin matters as much as the filter. Cloth and surgical masks protect far less.',
      why: `Today's PM2.5 of ${outdoorPm25} µg/m³ is like breathing in about ${cigarettesPerDay(outdoorPm25)} cigarettes a day for anyone outside all day.`,
      priority: exposed ? 93 : 75,
      source: SOURCES.niosh,
    });
  }
  return actions;
}

/**
 * Lower-emission alternatives that also cut the smog the community breathes.
 * @param {ActionContext} ctx
 * @returns {Action[]}
 */
function sustainableActions({ profile }) {
  const { commute, home } = profile;
  /** @type {Action[]} */
  const actions = [];
  const current = commuteEmissions(commute);
  const best = commuteAlternatives(commute)[0];
  if (best && commute.oneWayKm > 0 && commute.daysPerWeek > 0) {
    const tailpipe = TAILPIPE_MODES.has(commute.mode);
    actions.push({
      id: 'commute-switch',
      category: 'sustainable',
      title: `Try ${best.label.toLowerCase()} instead of the ${MODE_LABELS[commute.mode].toLowerCase()}`,
      impact: `Your ${commute.oneWayKm} km commute, ${commute.daysPerWeek} days a week, emits about ${current.kgPerYear} kg CO2e a year. Switching saves about ${best.kgSavedPerYear} kg a year (${best.percentSaved}%).`,
      why: tailpipe
        ? 'Every car or motorbike trip left at home also removes exhaust from the street where your neighbours walk and breathe.'
        : 'Lower-carbon travel also means less fuel burned in the city during smog season.',
      priority: 65,
      source: SOURCES.desnz,
    });
  }
  if (commute.mode.startsWith('car_') && commute.mode !== 'car_electric' && commute.oneWayKm > 0 && commute.daysPerWeek > 0) {
    const shared = commuteEmissions({ ...commute, occupants: 2 });
    actions.push({
      id: 'carpool',
      category: 'sustainable',
      title: 'Share the car with one colleague or neighbour',
      impact: `Carpooling with one other person halves your share: about ${shared.kgPerYear} kg CO2e a year instead of ${current.kgPerYear} kg.`,
      why: 'Turn the engine off at long signals and in queues; idling adds exhaust where people are waiting.',
      priority: 55,
      source: SOURCES.desnz,
    });
  }
  if (home.heating === 'wood_coal' || home.heating === 'kerosene') {
    actions.push({
      id: 'clean-heating',
      category: 'sustainable',
      title: 'Heat with electricity instead of wood, coal or kerosene',
      impact: 'Burning solid fuels and kerosene indoors is a major source of household air pollution, and the smoke also adds to winter smog outside.',
      why: 'Heat the room you are in with an electric heater and keep doors closed to hold the warmth.',
      priority: 89,
      source: SOURCES.whoHousehold,
    });
  }
  actions.push({
    id: 'no-burning',
    category: 'sustainable',
    title: 'Never burn leaves, waste or crop residue',
    impact: 'Open burning releases smoke at ground level, right where people breathe, and adds to the winter smog over the whole neighbourhood.',
    why: 'Compost garden waste or hand it to municipal collection, skip firecrackers, and report open burning to your local authority.',
    priority: 50,
    source: SOURCES.whoAqg,
  });
  return actions;
}

/**
 * All actions for this household, most important first.
 * @param {ActionContext} ctx
 * @returns {Action[]}
 */
export function buildActions(ctx) {
  return [...indoorActions(ctx), ...routineActions(ctx), ...sustainableActions(ctx)].sort((a, b) => b.priority - a.priority);
}
