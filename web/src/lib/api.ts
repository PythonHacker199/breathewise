/** Types mirroring the server's JSON (src/science/plan.js, src/ai/coach.js) and a small client. */

export type CategoryKey = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous';
export type CommuteMode = 'car_petrol' | 'car_diesel' | 'car_hybrid' | 'car_electric' | 'motorbike' | 'bus' | 'metro' | 'rail' | 'bicycle' | 'walk' | 'remote';
export type Ventilation = 'sealed' | 'average' | 'leaky';
export type CookingFuel = 'lpg' | 'piped_gas' | 'electric' | 'biomass' | 'kerosene';
export type Heating = 'none' | 'electric' | 'gas' | 'wood_coal' | 'kerosene';

export interface AqiCategory {
  key: CategoryKey;
  label: string;
  min: number;
  max: number;
  color: string;
  level: number;
}

export interface Place {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timeZone: string;
}

export interface Location {
  lat: number;
  lon: number;
  name: string;
  timeZone?: string;
}

export interface Profile {
  household: { adults: number; children: number; olderAdults: number };
  conditions: { respiratory: boolean; heart: boolean; pregnancy: boolean };
  commute: { mode: CommuteMode; oneWayKm: number; daysPerWeek: number };
  home: { roomAreaM2: number; ventilation: Ventilation; purifierCadr: number; cookingFuel: CookingFuel; heating: Heating };
  habits: { outdoorExerciseMinutes: number; incenseOrCoils: boolean; smokingIndoors: boolean };
  notes: string;
}

export interface Assessment {
  pm25: number;
  pm10: number | null;
  aqi: number;
  dominant: 'pm25' | 'pm10';
  category: AqiCategory;
  whoMultiple: number;
  cigarettesPerDay: number;
  indiaCategory: string;
  localIndex: { name: string; aqi: number; category: string } | null;
  indoorEstimate: number;
  indoorCigarettesPerDay: number;
  sensitiveAlert: boolean;
  observedAt: string;
  source: 'google' | 'open-meteo';
}

export interface RoutineItem {
  id: string;
  kind: 'exercise' | 'ventilate' | 'avoid' | 'sensitive';
  title: string;
  detail: string;
  when?: string;
  startIso?: string;
  endIso?: string;
}

export interface Action {
  id: string;
  category: 'indoor' | 'routine' | 'sustainable';
  title: string;
  impact: string;
  why: string;
  priority: number;
  source: { label: string; url?: string };
}

export interface CommuteSummary {
  mode: CommuteMode;
  label: string;
  kgPerWeek: number;
  kgPerYear: number;
  alternatives: { mode: CommuteMode; label: string; kgPerYear: number; kgSavedPerYear: number; percentSaved: number }[];
}

export interface Coach {
  source: 'gemini' | 'curated';
  model?: string;
  summary: string;
  todayPlan: { time: string; action: string }[];
  familyTips: string[];
  whyItMatters: string[];
  oneThing: string;
}

/** One forecast hour for the chart, with its EPA category computed on the server. */
export interface HourlyPoint {
  time: string;
  pm25: number;
  category: Pick<AqiCategory, 'key' | 'label' | 'color'>;
}

export interface PlanResponse {
  place: Location;
  air: { source: 'google' | 'open-meteo'; timeZone: string; hourly: HourlyPoint[] };
  plan: {
    assessment: Assessment;
    routine: { items: RoutineItem[]; exerciseDoseSavedUg: number };
    commute: CommuteSummary;
    actions: Action[];
    timeZone: string;
  };
  coach: Coach;
}

export interface Health {
  status: string;
  ai: { enabled: boolean; model: string | null };
  airSource: 'google' | 'open-meteo';
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Could not reach BreatheWise. Check your connection and try again.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: Record<string, string> };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, res.status, data.errors);
  return data as T;
}

const postJson = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});

export const api = {
  health: () => request<Health>('/api/health'),
  places: (query: string, signal?: AbortSignal) => request<{ places: Place[] }>(`/api/places?${new URLSearchParams({ q: query })}`, { signal }),
  plan: (location: Location, profile: Profile, signal?: AbortSignal) => request<PlanResponse>('/api/plan', postJson({ location, profile }, signal)),
  ask: (location: Location, profile: Profile, question: string) =>
    request<{ answer: string; model: string }>('/api/ask', postJson({ location, profile, question })),
};
