import { useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { TopBar } from './components/TopBar';
import { SettingsPanel } from './components/SettingsPanel';
import { BriefingPlayer } from './components/BriefingPlayer';
import { useStore } from './lib/store';
import { reverseGeocodeLatLon } from './lib/weather';

const GEO_FLAG_KEY = 'aurora.geo.attempted';

/**
 * Request browser geolocation once per install (gated by a localStorage flag)
 * and seed the weather city if the user grants permission. Denied/unavailable
 * still sets the flag so we never pester on subsequent loads. Manual edits in
 * the settings panel take precedence — this only runs on first ever launch.
 */
async function tryAutoLocate(updateSettings: (p: { weatherLat: number; weatherLon: number; weatherCityLabel: string }) => Promise<void>) {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
  if (localStorage.getItem(GEO_FLAG_KEY)) return;
  localStorage.setItem(GEO_FLAG_KEY, '1');
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 1000 * 60 * 60,
      });
    });
    const { latitude, longitude } = pos.coords;
    const label = await reverseGeocodeLatLon(latitude, longitude);
    await updateSettings({
      weatherLat: latitude,
      weatherLon: longitude,
      weatherCityLabel: label ?? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    });
  } catch {
    // permission denied or timed out — keep defaults
  }
}

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (!ready) return;
    void tryAutoLocate(updateSettings);
  }, [ready, updateSettings]);

  return (
    <div className={`relative h-full w-full no-scroll paper-grain ${settings.reduceMotion ? '' : 'motion-ok'}`}>
      <TopBar />
      {ready ? (
        <>
          <Dashboard />
          <BriefingPlayer />
        </>
      ) : (
        <BootSplash />
      )}
      <SettingsPanel />
    </div>
  );
}

function BootSplash() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center">
        <div className="kicker mb-1">Personal Almanac</div>
        <div className="font-display text-4xl text-ink tracking-tight">
          Aurora<span className="text-ember">.</span>
        </div>
      </div>
    </div>
  );
}
