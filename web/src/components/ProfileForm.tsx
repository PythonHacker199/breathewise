import type { ReactNode } from 'react';
import type { Profile } from '@/lib/api';
import { COMMUTE_OPTIONS, COOKING_OPTIONS, HEATING_OPTIONS, VENTILATION_OPTIONS } from '@/lib/profile';
import { Checkbox, Field, NumberField, SelectField } from './ui';

type Section = Exclude<keyof Profile, 'notes'>;
type SetField = <S extends Section, K extends keyof Profile[S]>(section: S, key: K, value: Profile[S][K]) => void;

/** What every section of the form receives. Field errors are keyed "section.field", as the API returns them. */
interface SectionProps {
  profile: Profile;
  errors: Record<string, string>;
  set: SetField;
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-haze-200 pt-4">
      <legend className="pr-2 text-sm font-bold uppercase tracking-wide text-leaf-700">{legend}</legend>
      {children}
    </fieldset>
  );
}

function HouseholdFields({ profile, errors, set }: SectionProps) {
  const { household, conditions } = profile;
  return (
    <Group legend="Household">
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          id="household-adults"
          label="Adults"
          min={0}
          max={12}
          value={household.adults}
          error={errors['household.adults']}
          onChange={(v) => set('household', 'adults', v)}
        />
        <NumberField
          id="household-children"
          label="Children"
          min={0}
          max={12}
          value={household.children}
          error={errors['household.children']}
          onChange={(v) => set('household', 'children', v)}
        />
        <NumberField
          id="household-olderAdults"
          label="Over 65"
          min={0}
          max={12}
          value={household.olderAdults}
          error={errors['household.olderAdults']}
          onChange={(v) => set('household', 'olderAdults', v)}
        />
      </div>
      <p className="text-sm font-semibold text-ink">Anyone in the home with…</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Checkbox id="cond-respiratory" label="Asthma or lung disease" checked={conditions.respiratory} onChange={(v) => set('conditions', 'respiratory', v)} />
        <Checkbox id="cond-heart" label="Heart disease" checked={conditions.heart} onChange={(v) => set('conditions', 'heart', v)} />
        <Checkbox id="cond-pregnancy" label="Pregnancy" checked={conditions.pregnancy} onChange={(v) => set('conditions', 'pregnancy', v)} />
      </div>
    </Group>
  );
}

function CommuteFields({ profile, errors, set }: SectionProps) {
  const { commute } = profile;
  return (
    <Group legend="Daily commute">
      <SelectField
        id="commute-mode"
        label="How do you usually travel?"
        value={commute.mode}
        options={COMMUTE_OPTIONS}
        error={errors['commute.mode']}
        onChange={(v) => set('commute', 'mode', v)}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          id="commute-oneWayKm"
          label="One-way distance (km)"
          min={0}
          max={200}
          step={0.5}
          value={commute.oneWayKm}
          error={errors['commute.oneWayKm']}
          onChange={(v) => set('commute', 'oneWayKm', v)}
        />
        <NumberField
          id="commute-daysPerWeek"
          label="Days per week"
          min={0}
          max={7}
          value={commute.daysPerWeek}
          error={errors['commute.daysPerWeek']}
          onChange={(v) => set('commute', 'daysPerWeek', v)}
        />
      </div>
    </Group>
  );
}

function HomeFields({ profile, errors, set }: SectionProps) {
  const { home } = profile;
  return (
    <Group legend="Home">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          id="home-roomAreaM2"
          label="Main room size (m²)"
          hint="The room where the family spends most time."
          min={4}
          max={500}
          value={home.roomAreaM2}
          error={errors['home.roomAreaM2']}
          onChange={(v) => set('home', 'roomAreaM2', v)}
        />
        <NumberField
          id="home-purifierCadr"
          label="Air purifier CADR (m³/h)"
          hint="0 if none. CFM on the box × 1.7."
          min={0}
          max={2000}
          value={home.purifierCadr}
          error={errors['home.purifierCadr']}
          onChange={(v) => set('home', 'purifierCadr', v)}
        />
      </div>
      <SelectField
        id="home-ventilation"
        label="How airtight is the home?"
        value={home.ventilation}
        options={VENTILATION_OPTIONS}
        error={errors['home.ventilation']}
        onChange={(v) => set('home', 'ventilation', v)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="home-cooking"
          label="Cooking fuel"
          value={home.cookingFuel}
          options={COOKING_OPTIONS}
          error={errors['home.cookingFuel']}
          onChange={(v) => set('home', 'cookingFuel', v)}
        />
        <SelectField
          id="home-heating"
          label="Heating"
          value={home.heating}
          options={HEATING_OPTIONS}
          error={errors['home.heating']}
          onChange={(v) => set('home', 'heating', v)}
        />
      </div>
    </Group>
  );
}

function HabitsFields({ profile, errors, set, onNotesChange }: SectionProps & { onNotesChange: (notes: string) => void }) {
  const { habits } = profile;
  return (
    <Group legend="Habits">
      <NumberField
        id="habits-outdoorExerciseMinutes"
        label="Outdoor exercise or play (minutes a day)"
        min={0}
        max={600}
        value={habits.outdoorExerciseMinutes}
        error={errors['habits.outdoorExerciseMinutes']}
        onChange={(v) => set('habits', 'outdoorExerciseMinutes', v)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox
          id="habit-coils"
          label="We burn incense or mosquito coils"
          checked={habits.incenseOrCoils}
          onChange={(v) => set('habits', 'incenseOrCoils', v)}
        />
        <Checkbox id="habit-smoking" label="Someone smokes indoors" checked={habits.smokingIndoors} onChange={(v) => set('habits', 'smokingIndoors', v)} />
      </div>
      <Field
        id="notes"
        label="Anything else the coach should know? (optional)"
        hint="Up to 300 characters, e.g. a newborn at home, night shifts."
        error={errors.notes}
      >
        {(props) => <textarea {...props} rows={2} maxLength={300} value={profile.notes} onChange={(e) => onNotesChange(e.target.value)} />}
      </Field>
    </Group>
  );
}

/** Household, health, commute, home and habits: everything the plan is tailored to. */
export function ProfileForm({ profile, errors, onChange }: { profile: Profile; errors: Record<string, string>; onChange: (profile: Profile) => void }) {
  const set: SetField = (section, key, value) => onChange({ ...profile, [section]: { ...profile[section], [key]: value } });
  const sectionProps = { profile, errors, set };
  return (
    <div className="space-y-5">
      <HouseholdFields {...sectionProps} />
      <CommuteFields {...sectionProps} />
      <HomeFields {...sectionProps} />
      <HabitsFields {...sectionProps} onNotesChange={(notes) => onChange({ ...profile, notes })} />
    </div>
  );
}
