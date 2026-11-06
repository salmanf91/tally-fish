import { getOfflineEntries, removeOfflineEntry, saveOfflineEntry } from './db';
import { api } from './api';

let isSyncing = false;

/**
 * Flush all offline-buffered entries to the server batch sync endpoint
 * @param {import('@tanstack/react-query').QueryClient} [queryClient]
 * @returns {Promise<{ flushed: number, conflicts: number, errors: number }>}
 */
export async function flushOfflineQueue(queryClient = null) {
  if (isSyncing || !navigator.onLine) {
    return { flushed: 0, conflicts: 0, errors: 0 };
  }

  isSyncing = true;
  try {
    const allOffline = await getOfflineEntries();
    // Only flush entries that are awaiting sync (status QUEUED_SYNC or OFFLINE_PENDING)
    const pendingEntries = allOffline.filter(
      (e) => e.status === 'QUEUED_SYNC' || e.status === 'OFFLINE_PENDING'
    );

    if (pendingEntries.length === 0) {
      return { flushed: 0, conflicts: 0, errors: 0 };
    }

    console.log(`[SyncManager] Flushing ${pendingEntries.length} offline entries...`);

    const res = await api.post('/entries/sync', { entries: pendingEntries });
    const { synced = [], conflicts = [], errors = [] } = res.data || {};

    // 1. Remove successfully synced entries from IndexedDB
    for (const item of synced) {
      if (item.tempId) {
        await removeOfflineEntry(item.tempId);
      }
    }

    // 2. Mark conflicting entries as 'HOLD_REVIEW' (Held for Admin Review) in IndexedDB
    for (const conflict of conflicts) {
      const match = pendingEntries.find((e) => e.tempId === conflict.tempId);
      if (match) {
        await saveOfflineEntry({
          ...match,
          status: 'HOLD_REVIEW',
          conflictMessage: conflict.message || 'Conflict: Entry locked by Admin while offline.',
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 3. Notify app components and refresh Query cache
    if (queryClient) {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['masters'] });
    }

    window.dispatchEvent(
      new CustomEvent('tally:sync-complete', {
        detail: {
          syncedCount: synced.length,
          conflictsCount: conflicts.length,
          errorsCount: errors.length,
        },
      })
    );

    return {
      flushed: synced.length,
      conflicts: conflicts.length,
      errors: errors.length,
    };
  } catch (err) {
    console.warn('[SyncManager] Offline flush error:', err.message);
    return { flushed: 0, conflicts: 0, errors: 1 };
  } finally {
    isSyncing = false;
  }
}

/**
 * Register Service Worker Background Sync tag if supported
 */
export async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-entries');
      console.log('[SyncManager] Registered SW background sync for "sync-entries"');
    } catch (err) {
      console.warn('[SyncManager] Could not register SW background sync:', err.message);
    }
  }
}

/**
 * Initialize automatic sync listeners on reconnect & SW messages
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 */
export function initSyncManager(queryClient) {
  // 1. Flush automatically on browser 'online' event
  window.addEventListener('online', () => {
    console.log('[SyncManager] Connection restored (online). Initiating flush...');
    flushOfflineQueue(queryClient);
  });

  // 2. Listen for messages from Service Worker (e.g., sync event trigger)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_TRIGGERED') {
        console.log('[SyncManager] Received SYNC_TRIGGERED message from SW');
        flushOfflineQueue(queryClient);
      }
    });
  }

  // 3. If online at boot, attempt initial flush of any leftover queued items
  if (navigator.onLine) {
    setTimeout(() => {
      flushOfflineQueue(queryClient);
    }, 1500);
  }
}
