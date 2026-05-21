import { useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { TopBar } from './components/TopBar';
import { SettingsPanel } from './components/SettingsPanel';
import { ChatDrawer } from './components/ChatDrawer';
import { useStore, useUI } from './lib/store';

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const settings = useStore((s) => s.settings);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const chatOpen = useUI((s) => s.chatOpen);

  useEffect(() => { init(); }, [init]);

  return (
    <div className={`relative h-full w-full no-scroll ${settings.reduceMotion ? '' : 'aurora-bg'}`}>
      <TopBar />
      {ready ? <Dashboard /> : <BootSplash />}
      {settingsOpen && <SettingsPanel />}
      {chatOpen && <ChatDrawer />}
    </div>
  );
}

function BootSplash() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-2xl font-display gradient-text">Aurora</div>
    </div>
  );
}
