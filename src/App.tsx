import { useEffect, useState } from 'react';
import { App as AntdApp, ConfigProvider, Layout, Typography } from 'antd';
import { Dashboard } from './components/Dashboard';
import { TopBar } from './components/TopBar';
import { SettingsPanel } from './components/SettingsPanel';
import { BriefingPlayer } from './components/BriefingPlayer';
import { useStore } from './lib/store';
import { migrateBrowserDataToBackend } from './lib/dataStore';
import { GEO_ATTEMPTED_KEY, isGeoPermissionDenied, locateCurrentCity } from './lib/weather';
import useIllustrationTheme from './illustrationTheme';
import type { AppSettings } from './types';

/**
 * Seed the weather city from browser geolocation on first launch. The "attempted"
 * flag is only set once the result is decisive — success, or an explicit
 * permission denial — so a transient failure (timeout, position unavailable, or
 * a non-secure context where geolocation is blocked) retries on the next load
 * instead of locking in the default city forever. Manual edits in the settings
 * panel take precedence.
 */
async function tryAutoLocate(updateSettings: (p: { weatherLat: number; weatherLon: number; weatherCityLabel: string }) => Promise<void>) {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
  if (localStorage.getItem(GEO_ATTEMPTED_KEY)) return;
  try {
    const loc = await locateCurrentCity();
    localStorage.setItem(GEO_ATTEMPTED_KEY, '1');
    await updateSettings({
      weatherLat: loc.lat,
      weatherLon: loc.lon,
      weatherCityLabel: loc.name,
    });
  } catch (err) {
    // Respect an explicit "block" and stop asking; let transient failures retry.
    if (isGeoPermissionDenied(err)) localStorage.setItem(GEO_ATTEMPTED_KEY, '1');
  }
}

/**
 * Resolve the effective dark flag from the `theme` preference: 'dark'/'light'
 * are explicit; 'system' tracks the OS `prefers-color-scheme` live.
 */
function useDarkMode(pref: AppSettings['theme']): boolean {
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return pref === 'dark' || (pref === 'system' && systemDark);
}

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const dark = useDarkMode(settings.theme);
  const configProps = useIllustrationTheme({
    reduceMotion: settings.reduceMotion,
    dark,
  });

  useEffect(() => { init(); }, [init]);

  // Drive the [data-theme] CSS hook for the handful of hardcoded surfaces
  // (body background, top bar) that aren't antd-token-driven.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!ready) return;
    void tryAutoLocate(updateSettings);
    // Best-effort, run-once import of any legacy browser-stored data into the
    // backend so existing todos/note/dismiss-state aren't stranded after upgrade.
    void migrateBrowserDataToBackend();
  }, [ready, updateSettings]);

  return (
    <ConfigProvider {...configProps}>
      {/* component={false} → no wrapper DOM node, just message/notification context. */}
      <AntdApp component={false}>
        <Layout
          className={`app-shell paper-grain ${settings.reduceMotion ? 'reduce-motion' : 'motion-ok'}`}
        >
          <TopBar />
          <Layout.Content className="app-content">
            {ready ? <Dashboard /> : <BootSplash />}
          </Layout.Content>
          {ready && <BriefingPlayer />}
          <SettingsPanel />
        </Layout>
      </AntdApp>
    </ConfigProvider>
  );
}

function BootSplash() {
  return (
    <Layout.Content className="boot-splash">
      <Typography.Text className="kicker">Personal Almanac</Typography.Text>
      <Typography.Title level={1}>Aurora<span className="brand-dot">.</span></Typography.Title>
    </Layout.Content>
  );
}
