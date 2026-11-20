import type { Assessment, HourlyPoint, PlanResponse } from '@/lib/api';

/** A smoggy Delhi evening, shaped exactly like the /api/plan response. All values are synthetic. */
export const ASSESSMENT: Assessment = {
  pm25: 135,
  pm10: 190,
  aqi: 210,
  dominant: 'pm25',
  category: {
    key: 'very-unhealthy',
    label: 'Very Unhealthy',
    min: 201,
    max: 300,
    color: '#8f3f97',
    level: 4,
  },
  whoMultiple: 9,
  cigarettesPerDay: 6.1,
  indiaCategory: 'Very Poor',
  localIndex: null,
  indoorEstimate: 96.4,
  indoorCigarettesPerDay: 4.4,
  sensitiveAlert: true,
  observedAt: '2026-11-19T14:30:00Z',
  source: 'open-meteo',
};

const HOURLY: HourlyPoint[] = [
  {
    time: '2026-11-19T14:30:00Z',
    pm25: 135,
    category: { key: 'very-unhealthy', label: 'Very Unhealthy', color: '#8f3f97' },
  },
  {
    time: '2026-11-19T15:30:00Z',
    pm25: 162.1,
    category: { key: 'very-unhealthy', label: 'Very Unhealthy', color: '#8f3f97' },
  },
  {
    time: '2026-11-19T16:30:00Z',
    pm25: 55.8,
    category: { key: 'unhealthy', label: 'Unhealthy', color: '#ff0000' },
  },
];

export const PLAN_RESPONSE: PlanResponse = {
  place: { lat: 28.65, lon: 77.23, name: 'Delhi', timeZone: 'Asia/Kolkata' },
  air: { source: 'open-meteo', timeZone: 'Asia/Kolkata', hourly: HOURLY },
  plan: {
    assessment: ASSESSMENT,
    routine: {
      exerciseDoseSavedUg: 0,
      items: [
        {
          id: 'exercise-indoors',
          kind: 'exercise',
          title: 'Move exercise and play indoors today',
          detail: 'Even the cleanest daytime hour (22:00–23:00) is forecast at PM2.5 55.8 µg/m³.',
          when: '22:00–23:00',
        },
        {
          id: 'ventilate',
          kind: 'ventilate',
          title: 'Air out your home briefly',
          detail: 'Open windows for 10–15 minutes around 22:00.',
          when: '22:00–23:00',
          startIso: '2026-11-19T16:30:00.000Z',
          endIso: '2026-11-19T17:30:00.000Z',
        },
      ],
    },
    commute: {
      mode: 'car_petrol',
      label: 'Petrol car',
      kgPerWeek: 17,
      kgPerYear: 886.5,
      alternatives: [
        {
          mode: 'metro',
          label: 'Metro',
          kgPerYear: 144.6,
          kgSavedPerYear: 741.9,
          percentSaved: 84,
        },
      ],
    },
    actions: [
      {
        id: 'purifier-size',
        category: 'indoor',
        title: 'Clean the air of one room with a HEPA purifier',
        impact:
          'A purifier with a clean air delivery rate of at least 210 m³/h would bring this room from about 96.4 to about 11.4 µg/m³.',
        why: 'Pick the room where the family sleeps.',
        priority: 95,
        source: {
          label: 'US EPA, Guide to Air Cleaners in the Home (2018)',
          url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
        },
      },
      {
        id: 'mask',
        category: 'routine',
        title: 'Wear a well-fitted N95 or FFP2 mask outdoors',
        impact: 'Certified N95 filters capture at least 95% of test particles.',
        why: 'Cloth and surgical masks protect far less.',
        priority: 75,
        source: { label: 'NIOSH respirator certification, 42 CFR Part 84' },
      },
    ],
    timeZone: 'Asia/Kolkata',
  },
  coach: {
    source: 'gemini',
    model: 'gemini-flash-lite-latest',
    summary: 'The air in Delhi is Very Unhealthy today.',
    todayPlan: [{ time: '22:00–23:00', action: 'Air out the home briefly.' }],
    familyTips: ['Keep children indoors.'],
    whyItMatters: ['PM2.5 is 9 times the WHO guideline.'],
    oneThing: 'Clean the air of one room with a HEPA purifier.',
  },
};
