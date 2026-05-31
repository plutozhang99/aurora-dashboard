/**
 * Local-data maintenance for the settings "通用" tab.
 *
 * Two destructive actions, both confined to *browser-local* state (the backend
 * JSON store — todos / note / dismiss markers — is never touched here):
 *  - `clearCache`  : drop only derived/cached data (morning-briefing cache,
 *                    geolocation-attempted flag). Settings, email accounts and
 *                    layout are preserved.
 *  - `factoryReset`: delete the entire IndexedDB + localStorage, returning the
 *                    app to a fresh-install state.
 * Both reload the page afterwards so the in-memory React Query cache and zustand
 * store are rebuilt from the new (empty) persisted state.
 */
import { db } from './storage';
import { GEO_ATTEMPTED_KEY } from './weather';

/** Clear cached/derived data only; keep settings, accounts and layout. */
export async function clearCache(): Promise<void> {
  try {
    await db.kv.bulkDelete(['briefing', 'lastBriefingDate']);
  } catch {
    // IndexedDB unavailable — nothing to clear.
  }
  try {
    localStorage.removeItem(GEO_ATTEMPTED_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Wipe ALL browser-local data (settings, accounts, layout, caches). */
export async function factoryReset(): Promise<void> {
  try {
    await db.delete(); // drops the whole IndexedDB database
  } catch {
    /* ignore */
  }
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.reload();
}
