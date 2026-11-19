import { useState, type FormEvent } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { api, ApiError, type Location, type Place } from '@/lib/api';
import { BUTTON_SECONDARY, Field } from './ui';

/** City search (Open-Meteo geocoding via the server) or the browser's own location. */
export function LocationPicker({ value, onChange }: { value: Location | null; onChange: (location: Location) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState('');
  const placeLabel = (p: Place) => [p.name, p.region, p.country].filter(Boolean).join(', ');
  const selectedPlace = value ? results.find((p) => p.lat === value.lat && p.lon === value.lon) : undefined;

  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      setStatus('Type at least 2 letters of a city name.');
      return;
    }
    setStatus('Searching…');
    try {
      const { places } = await api.places(query.trim());
      setResults(places);
      setStatus(places.length ? `${places.length} places found.` : 'No places found. Try another spelling.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Search failed.');
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus('Your browser cannot share its location. Search for your city instead.');
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Your location', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        setStatus('Using your current location.');
      },
      () => setStatus('Location permission was denied. Search for your city instead.'),
      { maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} role="search" aria-label="Find your city" className="flex items-end gap-2">
        <div className="flex-1">
          <Field id="city" label="Where are you?">
            {(props) => <input {...props} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Delhi, Lahore, Beijing" autoComplete="address-level2" />}
          </Field>
        </div>
        <button type="submit" className={BUTTON_SECONDARY} aria-label="Search for city">
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      <button type="button" onClick={useMyLocation} className={`${BUTTON_SECONDARY} w-full`}>
        <LocateFixed className="h-4 w-4" aria-hidden="true" /> Use my current location
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-muted">
        {status}
      </p>
      {results.length > 0 && (
        <ul className="space-y-1.5" aria-label="Search results">
          {results.map((p) => {
            const selected = value?.lat === p.lat && value?.lon === p.lon;
            return (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ lat: p.lat, lon: p.lon, name: p.name, timeZone: p.timeZone })}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${selected ? 'border-leaf-700 bg-haze-100 font-semibold' : 'border-haze-200 hover:bg-haze-50'}`}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0 text-leaf-700" aria-hidden="true" />
                  {placeLabel(p)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {value && (
        <p className="text-sm text-ink" aria-live="polite">
          Selected: <strong>{selectedPlace ? placeLabel(selectedPlace) : value.name}</strong>
        </p>
      )}
    </div>
  );
}
