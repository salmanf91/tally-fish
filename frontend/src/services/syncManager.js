import {
  getOfflineEntries,
  removeOfflineEntry,
  saveOfflineEntry,
  getOfflineRateFixes,
  removeOfflineRateFix,
} from './db';
import { api } from './api';

let isSyncing = false;

/**
 * Flush all offline-buffered entries and rate fixes to the server
 * @param {import('@tanstack/react-query').QueryClient} [queryClient]
 * @returns {Promise<{ flushed: number, ratesFlushed: number, conflicts: number, errors: number }>}
 */
export async function flushOfflineQueue(queryClient = null) {
  if (isSyncing || !navigator.onLine) {
    return { flushed: 0, ratesFlushed: 0, conflicts: 0, errors: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;
  let ratesFlushedCount = 0;
  let conflictsCount = 0;
  let errorsCount = 0;

  try {
    // -------------------------------------------------------------------------
    // 1. Flush Offline Weighbridge Intake Entries
    // -------------------------------------------------------------------------
    const allOffline = await getOfflineEntries();
    const pendingEntries = allOffline.filter(
      (e) => e.status === 'QUEUED_SYNC' || e.status === 'OFFLINE_PENDING'
    );

    if (pendingEntries.length > 0) {
      console.log(`[SyncManager] Flushing ${pendingEntries.length} offline entries...`);
      try {
        const res = await api.post('/entries/sync', { entries: pendingEntries });
        const { synced = [], conflicts = [], errors = [] } = res.data || {};

        syncedCount = synced.length;
        conflictsCount = conflicts.length;
        errorsCount += errors.length;

        // Remove synced from IDB
        for (const item of synced) {
          if (item.tempId) {
            await removeOfflineEntry(item.tempId);
          }
        }

        // Mark conflicts in IDB
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
      } catch (err) {
        console.warn('[SyncManager] Entry flush error:', err.message);
        errorsCount++;
      }
    }

    // -------------------------------------------------------------------------
    // 2. Flush Offline Rate Fixes
    // -------------------------------------------------------------------------
    const pendingRates = await getOfflineRateFixes();
    if (pendingRates.length > 0) {
      console.log(`[SyncManager] Flushing ${pendingRates.length} offline rate fixes...`);
      for (const rf of pendingRates) {
        try {
          await api.post(`/entries/${rf.entryId}/rates`, { rates: rf.rates });
          await removeOfflineRateFix(rf.entryId);
          ratesFlushedCount++;
        } catch (rfErr) {
          console.warn(`[SyncManager] Rate fix flush error for entry ${rf.entryId}:`, rfErr.message);
          errorsCount++;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. Invalidate Query Caches & Notify Listeners
    // -------------------------------------------------------------------------
    if (syncedCount > 0 || ratesFlushedCount > 0 || conflictsCount > 0) {
      if (queryClient) {
        queryClient.invalidateQueries({ queryKey: ['entries'] });
        queryClient.invalidateQueries({ queryKey: ['masters'] });
      }

      window.dispatchEvent(
        new CustomEvent('tally:sync-complete', {
          detail: {
            syncedCount,
            ratesFlushedCount,
            conflictsCount,
            errorsCount,
          },
        })
      );
    }

    return {
      flushed: syncedCount,
      ratesFlushed: ratesFlushedCount,
      conflicts: conflictsCount,
      errors: errorsCount,
    };
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
