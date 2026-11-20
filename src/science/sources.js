/**
 * Published sources behind every action's impact statement, shown to users next to each action.
 */

/** @typedef {{ label: string, url?: string }} Source */

export const SOURCES = Object.freeze({
  epaAirCleaners: {
    label: 'US EPA, Guide to Air Cleaners in the Home (2018)',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
  },
  epaDiyCleaners: {
    label: 'US EPA research on DIY air cleaners',
    url: 'https://www.epa.gov/air-research/research-diy-air-cleaners-reduce-wildfire-smoke-indoors',
  },
  berkeley: {
    label: 'Berkeley Earth, Air Pollution and Cigarette Equivalence (2015)',
    url: 'https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/',
  },
  whoHousehold: {
    label: 'WHO fact sheet: Household air pollution',
    url: 'https://www.who.int/news-room/fact-sheets/detail/household-air-pollution-and-health',
  },
  whoAqg: {
    label: 'WHO Global Air Quality Guidelines (2021)',
    url: 'https://www.who.int/publications/i/item/9789240034228',
  },
  plants: {
    label: 'Cummings & Waring (2020), J. Expo. Sci. Environ. Epidemiol. 30:253–261',
    url: 'https://doi.org/10.1038/s41370-019-0175-9',
  },
  coils: { label: 'Liu et al. (2003), Environmental Health Perspectives 111:1454–1460' },
  niosh: { label: 'NIOSH respirator certification, 42 CFR Part 84' },
  desnz: {
    label: 'UK DESNZ greenhouse gas conversion factors (2022), via Our World in Data',
    url: 'https://ourworldindata.org/grapher/carbon-footprint-travel-mode',
  },
});
