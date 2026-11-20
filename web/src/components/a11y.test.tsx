import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STARTER_PROFILE } from '@/lib/profile';
import { expectNoAxeViolations } from '@/test/axe';
import { PLAN_RESPONSE } from '@/test/fixtures';
import { AirSummary } from './AirSummary';
import { AskCard, CoachCard } from './CoachCard';
import { HourlyChart } from './HourlyChart';
import { LocationPicker } from './LocationPicker';
import { ActionsCard, CommuteCard, RoutineCard } from './PlanSections';
import { ProfileForm } from './ProfileForm';

const { place, air, plan, coach } = PLAN_RESPONSE;
const noop = () => {};

/** Automated WCAG 2.2 AA checks (axe-core) on every part of the page a user can reach. */
describe('accessibility (axe-core, WCAG 2.2 AA)', () => {
  it('really catches violations (guards against a check that always passes)', async () => {
    const { container } = render(
      <form>
        <input type="text" />
        <img src="/chart.png" />
      </form>,
    );
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/image-alt|label/);
  });

  it('air summary', async () => {
    const { container } = render(
      <AirSummary assessment={plan.assessment} placeName={place.name} />,
    );
    await expectNoAxeViolations(container);
  });

  it('profile form, including field errors', async () => {
    const errors = {
      'home.roomAreaM2': 'Enter a number from 4 to 500.',
      'commute.mode': 'Choose one of the options.',
    };
    const { container } = render(
      <ProfileForm profile={STARTER_PROFILE} errors={errors} onChange={noop} />,
    );
    await expectNoAxeViolations(container);
  });

  it('location picker', async () => {
    const { container } = render(<LocationPicker value={place} onChange={noop} />);
    await expectNoAxeViolations(container);
  });

  it('hourly chart with its data table', async () => {
    const { container } = render(<HourlyChart hourly={air.hourly} timeZone={air.timeZone} />);
    await expectNoAxeViolations(container);
  });

  it('routine, actions and commute cards', async () => {
    const { container } = render(
      <>
        <RoutineCard items={plan.routine.items} placeName={place.name} />
        <ActionsCard actions={plan.actions} />
        <CommuteCard commute={plan.commute} />
      </>,
    );
    await expectNoAxeViolations(container);
  });

  it('coach and ask cards', async () => {
    const { container } = render(
      <>
        <CoachCard coach={coach} />
        <AskCard location={place} profile={STARTER_PROFILE} enabled />
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
