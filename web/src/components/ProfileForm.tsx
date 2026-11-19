import type { ReactNode } from 'react';
import type { Profile } from '@/lib/api';
import { COMMUTE_OPTIONS, COOKING_OPTIONS, HEATING_OPTIONS, VENTILATION_OPTIONS } from '@/lib/profile';
import { Checkbox, Field } from './ui';

type Section = Exclude<keyof Profile, 'notes'>;

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-haze-200 pt-4">
      <legend className="pr-2 text-sm font-bold uppercase tracking-wide text-leaf-700">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** Household, health, commute, home and habits: everything the plan is tailored to. */
export function ProfileForm({ profile, errors, onChange }: { profile: Profile; errors: Record<string, string>; onChange: (profile: Profile) => void }) {
  function set<S extends Section, K extends keyof Profile[S]>(section: S, key: K, value: Profile[S][K]) {
    onChange({ ...profile, [section]: { ...profile[section], [key]: value } });
  }

  function numberField<S extends Section>(section: S, key: keyof Profile[S] & string, label: string, opts: { min: number; max: number; step?: number; hint?: string }) {
    const id = `${section}-${key}`;
    return (
      <Field id={id} label={label} hint={opts.hint} error={errors[`${section}.${key}`]}>
        {(props) => (
          <input
            {...props}
            type="number"
            inputMode="decimal"
            min={opts.min}
            max={opts.max}
            step={opts.step ?? 1}
            value={String(profile[section][key])}
            onChange={(e) => set(section, key as keyof Profile[S], (e.target.value === '' ? 0 : Number(e.target.value)) as Profile[S][keyof Profile[S]])}
          />
        )}
      </Field>
    );
  }

  return (
    <div className="space-y-5">
      <Group legend="Household">
        <div className="grid grid-cols-3 gap-3">
          {numberField('household', 'adults', 'Adults', { min: 0, max: 12 })}
          {numberField('household', 'children', 'Children', { min: 0, max: 12 })}
          {numberField('household', 'olderAdults', 'Over 65', { min: 0, max: 12 })}
        </div>
        <p className="text-sm font-semibold text-ink">Anyone in the home with…</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Checkbox id="cond-respiratory" label="Asthma or lung disease" checked={profile.conditions.respiratory} onChange={(v) => set('conditions', 'respiratory', v)} />
          <Checkbox id="cond-heart" label="Heart disease" checked={profile.conditions.heart} onChange={(v) => set('conditions', 'heart', v)} />
          <Checkbox id="cond-pregnancy" label="Pregnancy" checked={profile.conditions.pregnancy} onChange={(v) => set('conditions', 'pregnancy', v)} />
        </div>
      </Group>

      <Group legend="Daily commute">
        <Field id="commute-mode" label="How do you usually travel?" error={errors['commute.mode']}>
          {(props) => (
            <select {...props} value={profile.commute.mode} onChange={(e) => set('commute', 'mode', e.target.value as Profile['commute']['mode'])}>
              {COMMUTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {numberField('commute', 'oneWayKm', 'One-way distance (km)', { min: 0, max: 200, step: 0.5 })}
          {numberField('commute', 'daysPerWeek', 'Days per week', { min: 0, max: 7 })}
        </div>
      </Group>

      <Group legend="Home">
        <div className="grid grid-cols-2 gap-3">
          {numberField('home', 'roomAreaM2', 'Main room size (m²)', { min: 4, max: 500, hint: 'The room where the family spends most time.' })}
          {numberField('home', 'purifierCadr', 'Air purifier CADR (m³/h)', { min: 0, max: 2000, hint: '0 if none. CFM on the box × 1.7.' })}
        </div>
        <Field id="home-ventilation" label="How airtight is the home?">
          {(props) => (
            <select {...props} value={profile.home.ventilation} onChange={(e) => set('home', 'ventilation', e.target.value as Profile['home']['ventilation'])}>
              {VENTILATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="home-cooking" label="Cooking fuel">
            {(props) => (
              <select {...props} value={profile.home.cookingFuel} onChange={(e) => set('home', 'cookingFuel', e.target.value as Profile['home']['cookingFuel'])}>
                {COOKING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="home-heating" label="Heating">
            {(props) => (
              <select {...props} value={profile.home.heating} onChange={(e) => set('home', 'heating', e.target.value as Profile['home']['heating'])}>
                {HEATING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Group>

      <Group legend="Habits">
        {numberField('habits', 'outdoorExerciseMinutes', 'Outdoor exercise or play (minutes a day)', { min: 0, max: 600 })}
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox id="habit-coils" label="We burn incense or mosquito coils" checked={profile.habits.incenseOrCoils} onChange={(v) => set('habits', 'incenseOrCoils', v)} />
          <Checkbox id="habit-smoking" label="Someone smokes indoors" checked={profile.habits.smokingIndoors} onChange={(v) => set('habits', 'smokingIndoors', v)} />
        </div>
        <Field id="notes" label="Anything else the coach should know? (optional)" hint="Up to 300 characters, e.g. a newborn at home, night shifts.">
          {(props) => (
            <textarea {...props} rows={2} maxLength={300} value={profile.notes} onChange={(e) => onChange({ ...profile, notes: e.target.value })} />
          )}
        </Field>
      </Group>
    </div>
  );
}
