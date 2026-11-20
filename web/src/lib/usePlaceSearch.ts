import { useState } from 'react';
import { api, ApiError, type Location, type Place } from './api';

/** "Delhi, National Capital Territory of Delhi, India": enough to tell same-named places apart. */
export const placeLabel = (p: Place) => [p.name, p.region, p.country].filter(Boolean).join(', ');

const GEOLOCATION_OPTIONS: PositionOptions = { maximumAge: 10 * 60 * 1000, timeout: 10_000 };

/**
 * City search through the server, and the browser's own location as an alternative.
 * `status` is a short message for an aria-live region.
 */
export function usePlaceSearch(onLocate: (location: Location) => void) {
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState('');

  async function search(query: string) {
    if (query.trim().length < 2) {
      setStatus('Type at least 2 letters of a city name.');
      return;
    }
    setStatus('Searching…');
    try {
      const { places } = await api.places(query.trim());
      setResults(places);
      setStatus(
        places.length ? `${places.length} places found.` : 'No places found. Try another spelling.',
      );
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Search failed.');
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setStatus('Your browser cannot share its location. Search for your city instead.');
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        onLocate({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: 'Your location',
          timeZone,
        });
        setStatus('Using your current location.');
      },
      () => setStatus('Location permission was denied. Search for your city instead.'),
      GEOLOCATION_OPTIONS,
    );
  }

  return { results, status, search, locateMe };
}
