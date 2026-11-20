import { useState, type FormEvent } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import type { Location, Place } from '@/lib/api';
import { placeLabel, usePlaceSearch } from '@/lib/usePlaceSearch';
import { BUTTON_SECONDARY, Field } from './ui';

const isSelected = (value: Location | null, place: Place) =>
  value?.lat === place.lat && value?.lon === place.lon;

function PlaceResults({
  places,
  value,
  onPick,
}: {
  places: Place[];
  value: Location | null;
  onPick: (place: Place) => void;
}) {
  if (places.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Search results">
      {places.map((place) => {
        const selected = isSelected(value, place);
        return (
          <li key={`${place.lat},${place.lon}`}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(place)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${selected ? 'border-leaf-700 bg-haze-100 font-semibold' : 'border-haze-200 hover:bg-haze-50'}`}
            >
              <MapPin className="h-4 w-4 flex-shrink-0 text-leaf-700" aria-hidden="true" />
              {placeLabel(place)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** City search (Open-Meteo geocoding via the server) or the browser's own location. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: Location | null;
  onChange: (location: Location) => void;
}) {
  const [query, setQuery] = useState('');
  const { results, status, search, locateMe } = usePlaceSearch(onChange);
  const selectedPlace = results.find((place) => isSelected(value, place));

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void search(query);
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={onSearch}
        role="search"
        aria-label="Find your city"
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <Field id="city" label="Where are you?">
            {(props) => (
              <input
                {...props}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Delhi, Lahore, Beijing"
                autoComplete="address-level2"
              />
            )}
          </Field>
        </div>
        <button type="submit" className={BUTTON_SECONDARY} aria-label="Search for city">
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      <button type="button" onClick={locateMe} className={`${BUTTON_SECONDARY} w-full`}>
        <LocateFixed className="h-4 w-4" aria-hidden="true" /> Use my current location
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-muted">
        {status}
      </p>
      <PlaceResults
        places={results}
        value={value}
        onPick={(p) => onChange({ lat: p.lat, lon: p.lon, name: p.name, timeZone: p.timeZone })}
      />
      {value && (
        <p className="text-sm text-ink" aria-live="polite">
          Selected: <strong>{selectedPlace ? placeLabel(selectedPlace) : value.name}</strong>
        </p>
      )}
    </div>
  );
}
