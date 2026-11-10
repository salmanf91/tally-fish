import { openDB } from 'idb';

const DB_NAME = 'tally_fish_local_db';
const DB_VERSION = 2;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Master caches for offline quick-picking
        if (!db.objectStoreNames.contains('masters')) {
          db.createObjectStore('masters', { keyPath: 'cacheKey' });
        }
        // Offline entry sync queue
        if (!db.objectStoreNames.contains('offline_entries')) {
          const entryStore = db.createObjectStore('offline_entries', { keyPath: 'tempId' });
          entryStore.createIndex('by_branch', 'branchId');
          entryStore.createIndex('by_created_at', 'createdAt');
        }
        // Offline rate locks sync queue (Version 2)
        if (!db.objectStoreNames.contains('offline_rate_fixes')) {
          const rateStore = db.createObjectStore('offline_rate_fixes', { keyPath: 'entryId' });
          rateStore.createIndex('by_created_at', 'createdAt');
        }
        // Local metadata and settings
        if (!db.objectStoreNames.contains('app_meta')) {
          db.createObjectStore('app_meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Persist masters in IndexedDB for offline quick-picking
 * @param {'parties' | 'vehicles' | 'fish_types'} entityType
 * @param {string} branchId
 * @param {Array} records
 */
export async function persistMasters(entityType, branchId, records) {
  try {
    const db = await getDB();
    const cacheKey = `${entityType}_${branchId || 'global'}`;
    await db.put('masters', {
      cacheKey,
      entityType,
      branchId,
      data: records,
      cachedAt: new Date().toISOString(),
    });
    // Also save a fallback global copy
    if (branchId) {
      await db.put('masters', {
        cacheKey: `${entityType}_latest`,
        entityType,
        branchId,
        data: records,
        cachedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn(`[IDB] Failed to cache ${entityType}:`, err);
  }
}

/**
 * Retrieve cached masters from IndexedDB
 * @param {'parties' | 'vehicles' | 'fish_types'} entityType
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export async function getCachedMasters(entityType, branchId) {
  try {
    const db = await getDB();
    const cacheKey = `${entityType}_${branchId || 'global'}`;
    const result = await db.get('masters', cacheKey);
    if (result && Array.isArray(result.data)) {
      return result.data;
    }
    // Fallback to latest available
    const fallback = await db.get('masters', `${entityType}_latest`);
    return (fallback && fallback.data) || [];
  } catch (err) {
    console.warn(`[IDB] Failed to read cached ${entityType}:`, err);
    return [];
  }
}

/**
 * Save offline entry to sync queue
 */
export async function saveOfflineEntry(entry) {
  const db = await getDB();
  await db.put('offline_entries', entry);
}

/**
 * Get all queued offline entries
 */
export async function getOfflineEntries() {
  const db = await getDB();
  return db.getAll('offline_entries');
}

/**
 * Remove synced entry from queue
 */
export async function removeOfflineEntry(tempId) {
  const db = await getDB();
  await db.delete('offline_entries', tempId);
}

/**
 * Save offline rate fix to sync queue
 * @param {{ entryId: string, rates: Array, branchId?: string, createdAt?: string, entrySnapshot?: object }} rateFix
 */
export async function saveOfflineRateFix(rateFix) {
  const db = await getDB();
  await db.put('offline_rate_fixes', {
    ...rateFix,
    createdAt: rateFix.createdAt || new Date().toISOString(),
  });
}

/**
 * Get all queued offline rate fixes
 */
export async function getOfflineRateFixes() {
  const db = await getDB();
  return db.getAll('offline_rate_fixes');
}

/**
 * Get single offline rate fix by entryId
 */
export async function getOfflineRateFix(entryId) {
  const db = await getDB();
  return db.get('offline_rate_fixes', entryId);
}

/**
 * Remove synced rate fix from queue
 */
export async function removeOfflineRateFix(entryId) {
  const db = await getDB();
  await db.delete('offline_rate_fixes', entryId);
}
