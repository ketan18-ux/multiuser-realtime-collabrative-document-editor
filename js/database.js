/**
 * database.js — Supabase-first storage with IndexedDB offline fallback.
 *
 * When online, all CRUD operations go to Supabase cloud database.
 * When offline, operations fall back to IndexedDB local storage.
 * Successful cloud operations are also cached locally in IndexedDB.
 *
 * Each document record carries two sync-state flags (local only, not in Supabase):
 *   cloudSynced  {boolean} — true when Supabase confirmed the last write
 *   syncPending  {boolean} — true when a local change has not yet reached Supabase
 */

import { supabase } from './supabase-client.js';
import { isOnline } from './offline.js';

const DB_NAME = 'collaborative_document_editor';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

/**
 * Module-level cached IDBDatabase instance.
 * @type {IDBDatabase|null}
 */
let db = null;

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Generates a standard UUID v4 string with browser compatibility fallback.
 *
 * @returns {string}
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Converts a camelCase JS document object to snake_case for Supabase.
 * Strips local-only flags (cloudSynced, syncPending) before sending to Supabase.
 *
 * @param {Object} doc - Document with camelCase keys
 * @returns {Object} Document with snake_case keys
 */
function toSnakeCase(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const mapped = {};
  const keyMap = {
    ownerId: 'owner_id',
    contentFormat: 'content_format',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  };
  // Local-only flags — never sent to Supabase
  const localOnlyKeys = new Set(['cloudSynced', 'syncPending']);

  for (const [key, value] of Object.entries(doc)) {
    if (localOnlyKeys.has(key)) continue;
    mapped[keyMap[key] || key] = value;
  }
  return mapped;
}

/**
 * Converts a snake_case Supabase row to camelCase for JS consumption.
 *
 * @param {Object} row - Row with snake_case keys
 * @returns {Object} Document with camelCase keys
 */
function toCamelCase(row) {
  if (!row || typeof row !== 'object') return row;
  const mapped = {};
  const keyMap = {
    owner_id: 'ownerId',
    content_format: 'contentFormat',
    created_at: 'createdAt',
    updated_at: 'updatedAt'
  };
  for (const [key, value] of Object.entries(row)) {
    mapped[keyMap[key] || key] = value;
  }
  return mapped;
}

/**
 * Formats a Supabase error into a human-readable diagnostic string.
 *
 * @param {Object} err - Supabase error object or standard Error
 * @returns {string}
 */
function formatSupabaseError(err) {
  if (!err) return 'Unknown error';
  const parts = [];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.status) parts.push(`status=${err.status}`);
  if (err.message) parts.push(err.message);
  if (err.details) parts.push(`details=${err.details}`);
  if (err.hint) parts.push(`hint=${err.hint}`);
  return parts.length ? parts.join(' | ') : String(err);
}

// ─── IndexedDB Internal Helpers ─────────────────────────────────

/**
 * Initializes and caches the IndexedDB connection.
 * Creates the 'documents' object store and indexes if not already present.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this browser environment.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('ownerId', 'ownerId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;

      db.onclose = () => {
        db = null;
      };

      db.onversionchange = () => {
        if (db) {
          db.close();
          db = null;
        }
      };

      resolve(db);
    };

    request.onerror = (event) => {
      const errorMsg = event.target.error ? event.target.error.message : 'Unknown IndexedDB error';
      reject(new Error(`Failed to open IndexedDB (${DB_NAME}): ${errorMsg}`));
    };

    request.onblocked = () => {
      console.warn('IndexedDB database upgrade blocked. Close other tabs running this application.');
    };
  });
}

/**
 * Saves a document record into IndexedDB (put = insert or update).
 *
 * @param {Object} record - Document with camelCase keys
 * @returns {Promise<void>}
 */
async function idbPut(record) {
  if (!db) {
    try { await initDB(); } catch { return; }
  }
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // silently fail — IndexedDB is just cache
    } catch {
      resolve();
    }
  });
}

/**
 * Gets a document from IndexedDB by ID.
 *
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function idbGet(id) {
  if (!db) {
    try { await initDB(); } catch { return null; }
  }
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(String(id));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Gets all documents from IndexedDB for a given owner.
 *
 * @param {string} ownerId
 * @returns {Promise<Array<Object>>}
 */
async function idbGetAllByOwner(ownerId) {
  if (!db) {
    try { await initDB(); } catch { return []; }
  }
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('ownerId');
      const request = index.getAll(String(ownerId));
      request.onsuccess = () => {
        const docs = request.result || [];
        docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(docs);
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Gets ALL documents from IndexedDB (all owners).
 *
 * @returns {Promise<Array<Object>>}
 */
async function idbGetAll() {
  if (!db) {
    try { await initDB(); } catch { return []; }
  }
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Deletes a document from IndexedDB by ID.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
async function idbDelete(id) {
  if (!db) {
    try { await initDB(); } catch { return; }
  }
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(String(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ─── Public CRUD Functions ──────────────────────────────────────

/**
 * Creates a new document record.
 * When online: saves to Supabase and caches in IndexedDB.
 * When offline: saves to IndexedDB only with syncPending=true.
 *
 * The returned record includes:
 *   cloudSynced {boolean} — true only if Supabase confirmed the insert
 *   syncPending {boolean} — true if the document still needs to reach Supabase
 *
 * @param {Object} doc - Document data
 * @param {string} doc.ownerId - Supabase user ID
 * @param {string} [doc.id] - Optional UUID
 * @param {string} [doc.title] - Document title
 * @param {string} [doc.content] - HTML content
 * @returns {Promise<Object>} Created document record (camelCase)
 */
export async function createDocument(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('createDocument: Invalid document payload.');
  }
  if (!doc.ownerId) {
    throw new Error('createDocument: ownerId is required.');
  }

  const now = new Date().toISOString();
  const record = {
    id: doc.id || generateUUID(),
    ownerId: String(doc.ownerId),
    title: (doc.title !== undefined && doc.title !== null) ? String(doc.title).trim() || 'Untitled Document' : 'Untitled Document',
    content: doc.content !== undefined && doc.content !== null ? String(doc.content) : '',
    contentFormat: 'html',
    createdAt: doc.createdAt || now,
    updatedAt: doc.updatedAt || now,
    cloudSynced: false,
    syncPending: true
  };

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .insert(toSnakeCase(record))
        .select()
        .single();

      if (error) {
        // Surface the actual Supabase error — never silently swallow it
        console.error(
          `[DB] createDocument: Supabase insert FAILED for doc "${record.id}". ${formatSupabaseError(error)}`
        );
        // Fall through to IndexedDB with syncPending=true
      } else {
        const result = {
          ...toCamelCase(data),
          cloudSynced: true,
          syncPending: false
        };
        // Cache confirmed cloud record in IndexedDB
        await idbPut(result);
        console.info(`[DB] createDocument: Supabase insert OK — id=${result.id}`);
        return result;
      }
    } catch (err) {
      console.error(
        `[DB] createDocument: Supabase request threw an exception for doc "${record.id}":`,
        err.message || err
      );
    }
  }

  // Offline fallback — save locally and mark as pending sync
  await idbPut(record);
  console.info(`[DB] createDocument: Saved locally (syncPending) — id=${record.id}, online=${isOnline()}`);
  return record;
}

/**
 * Retrieves a single document by its ID.
 * When online: fetches from Supabase.
 * When offline: fetches from IndexedDB.
 *
 * @param {string} id - Document UUID
 * @returns {Promise<Object|null>} Document record or null if not found
 */
export async function getDocument(id) {
  if (!id) {
    throw new Error('getDocument: id parameter is required.');
  }

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', String(id))
        .single();

      if (error) {
        console.error(`[DB] getDocument: Supabase fetch FAILED for id="${id}". ${formatSupabaseError(error)}`);
      } else if (data) {
        const result = {
          ...toCamelCase(data),
          cloudSynced: true,
          syncPending: false
        };
        // Cache in IndexedDB
        await idbPut(result);
        return result;
      } else {
        return null;
      }
    } catch (err) {
      console.error(`[DB] getDocument: Exception for id="${id}":`, err.message || err);
    }
  }

  // Offline fallback
  return await idbGet(id);
}

/**
 * Retrieves all documents owned by a specific user, sorted by updatedAt descending.
 * When online: fetches from Supabase.
 * When offline: fetches from IndexedDB.
 *
 * @param {string} ownerId - Supabase user ID
 * @returns {Promise<Array<Object>>} List of document records
 */
export async function getUserDocuments(ownerId) {
  if (!ownerId) {
    throw new Error('getUserDocuments: ownerId parameter is required.');
  }

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('owner_id', String(ownerId))
        .order('updated_at', { ascending: false });

      if (error) {
        console.error(`[DB] getUserDocuments: Supabase fetch FAILED for ownerId="${ownerId}". ${formatSupabaseError(error)}`);
      } else {
        const results = (data || []).map((row) => ({
          ...toCamelCase(row),
          cloudSynced: true,
          syncPending: false
        }));
        // Cache all results in IndexedDB
        for (const doc of results) {
          await idbPut(doc);
        }
        console.info(`[DB] getUserDocuments: Fetched ${results.length} document(s) from Supabase.`);
        return results;
      }
    } catch (err) {
      console.error(`[DB] getUserDocuments: Exception for ownerId="${ownerId}":`, err.message || err);
    }
  }

  // Offline fallback
  return await idbGetAllByOwner(ownerId);
}

/**
 * Updates an existing document by merging changes and refreshing updatedAt.
 * When online: updates in Supabase and caches result in IndexedDB.
 * When offline: updates in IndexedDB only with syncPending=true.
 *
 * The returned record includes:
 *   cloudSynced {boolean} — true only if Supabase confirmed the update
 *   syncPending {boolean} — true if the update still needs to reach Supabase
 *
 * @param {string} id - Document UUID
 * @param {Object} changes - Key/value pairs to merge (e.g. title, content)
 * @returns {Promise<Object>} Updated document record
 */
export async function updateDocument(id, changes) {
  if (!id) {
    throw new Error('updateDocument: id parameter is required.');
  }
  if (!changes || typeof changes !== 'object') {
    throw new Error('updateDocument: changes payload must be an object.');
  }

  if (isOnline()) {
    try {
      // Convert changes to snake_case for Supabase
      const snakeChanges = toSnakeCase(changes);
      // Remove fields that must not be patched directly
      delete snakeChanges.id;
      delete snakeChanges.owner_id;
      delete snakeChanges.created_at;
      delete snakeChanges.updated_at;

      const { data, error } = await supabase
        .from('documents')
        .update(snakeChanges)
        .eq('id', String(id))
        .select()
        .single();

      if (error) {
        console.error(
          `[DB] updateDocument: Supabase update FAILED for id="${id}". ${formatSupabaseError(error)}`
        );
        // Fall through to IndexedDB with syncPending=true
      } else {
        const result = {
          ...toCamelCase(data),
          cloudSynced: true,
          syncPending: false
        };
        // Cache confirmed cloud record in IndexedDB
        await idbPut(result);
        console.info(`[DB] updateDocument: Supabase update OK — id=${result.id}`);
        return result;
      }
    } catch (err) {
      console.error(
        `[DB] updateDocument: Exception for id="${id}":`,
        err.message || err
      );
    }
  }

  // Offline fallback — merge changes into existing IndexedDB record
  const existing = await idbGet(id);
  if (!existing) {
    throw new Error(`updateDocument: Document with ID "${id}" does not exist.`);
  }

  const updated = {
    ...existing,
    ...changes,
    id: String(id),       // ID is immutable
    updatedAt: new Date().toISOString(),
    cloudSynced: false,
    syncPending: true
  };

  await idbPut(updated);
  console.info(`[DB] updateDocument: Saved locally (syncPending) — id=${id}, online=${isOnline()}`);
  return updated;
}

/**
 * Deletes a document by its ID.
 * When online: deletes from Supabase and IndexedDB.
 * When offline: deletes from IndexedDB only.
 *
 * @param {string} id - Document UUID
 * @returns {Promise<void>}
 */
export async function deleteDocument(id) {
  if (!id) {
    throw new Error('deleteDocument: id parameter is required.');
  }

  if (isOnline()) {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', String(id));

      if (error) {
        console.error(`[DB] deleteDocument: Supabase delete FAILED for id="${id}". ${formatSupabaseError(error)}`);
      } else {
        console.info(`[DB] deleteDocument: Supabase delete OK — id=${id}`);
      }
    } catch (err) {
      console.error(`[DB] deleteDocument: Exception for id="${id}":`, err.message || err);
    }
  }

  // Always remove from IndexedDB (offline or after cloud delete)
  await idbDelete(id);
}

/**
 * Duplicates a source document with a new ID, timestamps, and title.
 *
 * @param {string} sourceId - ID of document to duplicate
 * @param {string} [newTitle] - Title for the duplicate document
 * @param {string} [newOwnerId] - Optional new owner ID; defaults to source owner
 * @returns {Promise<Object>} Newly created duplicate document
 */
export async function duplicateDocument(sourceId, newTitle, newOwnerId) {
  if (!sourceId) {
    throw new Error('duplicateDocument: sourceId parameter is required.');
  }

  const sourceDoc = await getDocument(sourceId);
  if (!sourceDoc) {
    throw new Error(`duplicateDocument: Source document with ID "${sourceId}" was not found.`);
  }

  const duplicateTitle = (newTitle !== undefined && newTitle !== null && String(newTitle).trim())
    ? String(newTitle).trim()
    : `${sourceDoc.title || 'Untitled Document'} (Copy)`;

  const newDocData = {
    id: generateUUID(),
    ownerId: newOwnerId || sourceDoc.ownerId,
    title: duplicateTitle,
    content: sourceDoc.content || '',
    contentFormat: sourceDoc.contentFormat || 'html',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return await createDocument(newDocData);
}

// ─── Sync & Migration ───────────────────────────────────────────

/**
 * Syncs pending IndexedDB documents to Supabase for a specific owner.
 * Only syncs documents where syncPending === true to avoid redundant uploads.
 * Called when the app comes back online to push offline changes to the cloud.
 *
 * @param {string} ownerId - Supabase user ID (required to scope the sync correctly)
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export async function syncPendingChanges(ownerId) {
  if (!isOnline()) {
    return { synced: 0, failed: 0 };
  }

  if (!ownerId) {
    console.warn('[DB] syncPendingChanges: ownerId is required. Skipping sync.');
    return { synced: 0, failed: 0 };
  }

  // Only fetch this user's documents to respect RLS boundaries
  const ownerDocs = await idbGetAllByOwner(ownerId);
  if (ownerDocs.length === 0) {
    return { synced: 0, failed: 0 };
  }

  // Only sync documents that are marked as pending — avoid re-uploading everything
  const pendingDocs = ownerDocs.filter((doc) => doc.syncPending === true);
  if (pendingDocs.length === 0) {
    console.info('[DB] syncPendingChanges: No pending documents to sync.');
    return { synced: 0, failed: 0 };
  }

  console.info(`[DB] syncPendingChanges: Syncing ${pendingDocs.length} pending document(s) for owner=${ownerId}`);

  let synced = 0;
  let failed = 0;

  for (const doc of pendingDocs) {
    try {
      const snakeDoc = toSnakeCase(doc);

      const { error } = await supabase
        .from('documents')
        .upsert(snakeDoc, { onConflict: 'id' });

      if (error) {
        console.error(
          `[DB] syncPendingChanges: Failed to sync doc "${doc.id}". ${formatSupabaseError(error)}`
        );
        failed++;
      } else {
        // Mark as synced in IndexedDB
        await idbPut({ ...doc, cloudSynced: true, syncPending: false });
        console.info(`[DB] syncPendingChanges: Synced doc "${doc.id}" OK.`);
        synced++;
      }
    } catch (err) {
      console.error(`[DB] syncPendingChanges: Exception syncing doc "${doc.id}":`, err.message || err);
      failed++;
    }
  }

  console.info(`[DB] syncPendingChanges: Done — synced=${synced}, failed=${failed}`);
  return { synced, failed };
}

/**
 * One-time migration of existing IndexedDB documents to Supabase.
 * Upserts all local documents for the given owner to the cloud.
 *
 * @param {string} ownerId - Supabase user ID
 * @returns {Promise<{ migrated: number, failed: number }>}
 */
export async function migrateIndexedDBToSupabase(ownerId) {
  if (!ownerId) {
    return { migrated: 0, failed: 0 };
  }

  if (!isOnline()) {
    return { migrated: 0, failed: 0 };
  }

  const localDocs = await idbGetAllByOwner(ownerId);
  if (localDocs.length === 0) {
    return { migrated: 0, failed: 0 };
  }

  console.info(`[DB] migrateIndexedDBToSupabase: Migrating ${localDocs.length} document(s) for owner=${ownerId}`);

  let migrated = 0;
  let failed = 0;

  for (const doc of localDocs) {
    try {
      const { error } = await supabase
        .from('documents')
        .upsert(toSnakeCase(doc), { onConflict: 'id' });

      if (error) {
        console.error(
          `[DB] migrateIndexedDBToSupabase: Failed to migrate doc "${doc.id}". ${formatSupabaseError(error)}`
        );
        failed++;
      } else {
        // Mark as synced in IndexedDB
        await idbPut({ ...doc, cloudSynced: true, syncPending: false });
        migrated++;
      }
    } catch (err) {
      console.error(`[DB] migrateIndexedDBToSupabase: Exception for doc "${doc.id}":`, err.message || err);
      failed++;
    }
  }

  console.info(`[DB] migrateIndexedDBToSupabase: Done — migrated=${migrated}, failed=${failed}`);
  return { migrated, failed };
}
