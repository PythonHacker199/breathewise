import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/lib/api';
import { STARTER_PROFILE } from '@/lib/profile';
import { ProfileForm } from './ProfileForm';

/** The form is controlled, so tests drive it through a parent that owns the state, like App does. */
function Harness({
  errors = {},
  onChange,
}: {
  errors?: Record<string, string>;
  onChange: (p: Profile) => void;
}) {
  const [profile, setProfile] = useState(STARTER_PROFILE);
  return (
    <ProfileForm
      profile={profile}
      errors={errors}
      onChange={(next) => {
        setProfile(next);
        onChange(next);
      }}
    />
  );
}

describe('ProfileForm', () => {
  it('groups the questions into labelled sections', () => {
    render(<Harness onChange={vi.fn()} />);
    for (const name of ['Household', 'Daily commute', 'Home', 'Habits']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  });

  it('ties server field errors to their inputs for screen readers', () => {
    render(
      <Harness
        errors={{ 'home.roomAreaM2': 'Enter a number from 4 to 500.' }}
        onChange={vi.fn()}
      />,
    );
    const room = screen.getByRole('spinbutton', { name: 'Main room size (m²)' });
    expect(room).toHaveAttribute('aria-invalid', 'true');
    expect(room).toHaveAccessibleDescription(/Enter a number from 4 to 500\./);
    expect(screen.getByRole('spinbutton', { name: 'Adults' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });

  it('updates only the edited field', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const adults = screen.getByRole('spinbutton', { name: 'Adults' });
    await userEvent.clear(adults);
    await userEvent.type(adults, '3');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Cooking fuel' }),
      'biomass',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Asthma or lung disease' }));

    const last: Profile = onChange.mock.calls.at(-1)?.[0];
    expect(last.household).toEqual({ ...STARTER_PROFILE.household, adults: 3 });
    expect(last.home).toEqual({ ...STARTER_PROFILE.home, cookingFuel: 'biomass' });
    expect(last.conditions.respiratory).toBe(true);
    expect(last.commute).toEqual(STARTER_PROFILE.commute);
  });

  it('reads an emptied number field as 0, never NaN', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Air purifier CADR (m³/h)' }));
    expect(onChange.mock.calls.at(-1)?.[0].home.purifierCadr).toBe(0);
  });
});
