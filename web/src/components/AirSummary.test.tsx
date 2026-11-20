import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Assessment } from '@/lib/api';
import { AirSummary } from './AirSummary';

const assessment: Assessment = {
  pm25: 180,
  pm10: 260,
  aqi: 263,
  dominant: 'pm25',
  category: {
    key: 'very-unhealthy',
    label: 'Very Unhealthy',
    min: 201,
    max: 300,
    color: '#8f3f97',
    level: 4,
  },
  whoMultiple: 12,
  cigarettesPerDay: 8.2,
  indiaCategory: 'Very Poor',
  localIndex: { name: 'India (CPCB) AQI', aqi: 340, category: 'Very poor air quality' },
  indoorEstimate: 54,
  indoorCigarettesPerDay: 2.5,
  sensitiveAlert: true,
  observedAt: '2026-11-19T10:00:00Z',
  source: 'google',
};

describe('AirSummary', () => {
  it('names the AQI category in text, not colour alone', () => {
    render(<AirSummary assessment={assessment} placeName="New Delhi" />);
    expect(screen.getByRole('heading', { name: 'US AQI 263' })).toBeInTheDocument();
    expect(screen.getByText('Very Unhealthy')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'US AQI 263' })).toBeInTheDocument();
  });

  it('explains the impact with the computed numbers', () => {
    render(<AirSummary assessment={assessment} placeName="New Delhi" />);
    expect(screen.getByText('12× the WHO 24-hour guideline')).toBeInTheDocument();
    expect(screen.getByText('8.2 cigarettes')).toBeInTheDocument();
    expect(screen.getByText('≈ 54 µg/m³')).toBeInTheDocument();
    expect(screen.getByText('Very Poor')).toBeInTheDocument();
    expect(screen.getByText(/Google Air Quality API/)).toBeInTheDocument();
  });

  it('alerts when someone sensitive lives in the household', () => {
    const { rerender } = render(<AirSummary assessment={assessment} placeName="New Delhi" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/more sensitive/);
    rerender(
      <AirSummary assessment={{ ...assessment, sensitiveAlert: false }} placeName="New Delhi" />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
