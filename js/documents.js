/**
 * documents.js — Active document state manager and autosave lifecycle.
 *
 * Coordinates between the editor UI, IndexedDB persistence, and sanitization.
 * Injects editor callbacks to prevent circular dependencies.
 */

import {
  createDocument,
  getDocument,
  getUserDocuments,
  updateDocument,
  deleteDocument,
  duplicateDocument
} from './database.js';
import { sanitizeHTML } from './security.js';

/**
 * Currently active document record.
 * @type {Object|null}
 */
let activeDocument = null;

/**
 * Timer ID for debounced/interval autosave.
 * @type {number|null}
 */
let autosaveTimer = null;

/**
 * Indicates whether the editor has unsaved changes.
 * @type {boolean}
 */
let isDirty = false;

/**
 * Flag to enable or disable automatic saving.
 * @type {boolean}
 */
let autosaveEnabled = true;

/**
 * Injected editor function bindings.
 */
let editorCallbacks = {
  getContent: () => '',
  getTitle: () => '',
  setContent: () => {},
  setTitle: () => {},
  clearEditor: () => {},
  showEmptyState: () => {}
};

/**
 * Registered callback for save status changes.
 * @type {Function|null}
 */
let saveStatusCallback = null;

/**
 * Registers editor UI callbacks to allow decoupled state synchronization.
 *
 * @param {Object} callbacks
 * @param {Function} callbacks.getContent
 * @param {Function} callbacks.getTitle
 * @param {Function} callbacks.setContent
 * @param {Function} callbacks.setTitle
 * @param {Function} callbacks.clearEditor
 * @param {Function} callbacks.showEmptyState
 */
export function setEditorCallbacks(callbacks) {
  editorCallbacks = { ...editorCallbacks, ...callbacks };
}

/**
 * Retrieves the currently active document record.
 *
 * @returns {Object|null}
 */
export function getActiveDocument() {
  return activeDocument;
}

/**
 * Sets the active document in memory without persisting changes to the database.
 *
 * @param {Object|null} doc
 */
export function setActiveDocument(doc) {
  activeDocument = doc;
}

/**
 * Returns whether there are unsaved local modifications.
 *
 * @returns {boolean}
 */
export function getIsDirty() {
  return isDirty;
}

/**
 * Loads all documents for the specified owner, sorted by last update descending.
 *
 * @param {string} ownerId - Supabase user ID
 * @returns {Promise<Array<Object>>}
 */
export async function loadUserLibrary(ownerId) {
  if (!ownerId) {
    throw new Error('loadUserLibrary: ownerId is required.');
  }
  return await getUserDocuments(ownerId);
}

/**
 * Creates a brand new document, assigns it as active, and initializes editor state.
 *
 * @param {string} ownerId - Supabase user ID
 * @returns {Promise<Object>} Newly created document record
 */
export async function newDocument(ownerId) {
  if (!ownerId) {
    throw new Error('newDocument: ownerId is required.');
  }

  // Flush any pending unsaved work before opening a new document
  if (isDirty && activeDocument) {
    await flushPendingSave();
  }

  const newDoc = await createDocument({
    ownerId,
    title: 'Untitled Document',
    content: '',
    contentFormat: 'html'
  });

  setActiveDocument(newDoc);
  editorCallbacks.setContent('');
  editorCallbacks.setTitle('Untitled Document');
  isDirty = false;

  return newDoc;
}

/**
 * Opens an existing document by its ID.
 * If there are unsaved changes, returns an object indicating confirmation is needed.
 *
 * @param {string} id - Document UUID
 * @returns {Promise<Object|{ needsConfirmation: true }>}
 */
export async function openDocument(id) {
  if (!id) {
    throw new Error('openDocument: id is required.');
  }

  if (isDirty) {
    return { needsConfirmation: true };
  }

  const doc = await getDocument(id);
  if (!doc) {
    throw new Error(`Document with ID "${id}" was not found.`);
  }

  const cleanContent = sanitizeHTML(doc.content || '');
  editorCallbacks.setContent(cleanContent);
  editorCallbacks.setTitle(doc.title || 'Untitled Document');

  setActiveDocument(doc);
  isDirty = false;

  return doc;
}

/**
 * Forces opening a document even if dirty, discarding unsaved changes.
 *
 * @param {string} id - Document UUID
 * @returns {Promise<Object>}
 */
export async function forceOpenDocument(id) {
  isDirty = false;
  return await openDocument(id);
}

/**
 * Persists the current editor content and title to storage.
 *
 * Emits 'saved_cloud' when Supabase confirmed the write.
 * Emits 'saved_local' when the document was saved to IndexedDB only (sync pending).
 * Emits 'failed' only when even the local save threw an exception.
 *
 * @returns {Promise<{ success: boolean, cloudSynced?: boolean, error?: string, doc?: Object }>}
 */
export async function saveCurrentDocument() {
  if (!activeDocument) {
    return { success: false, error: 'No active document to save.' };
  }

  emitSaveStatus('saving');

  try {
    const rawContent = editorCallbacks.getContent();
    const cleanContent = sanitizeHTML(rawContent);
    const title = (editorCallbacks.getTitle() || '').trim() || 'Untitled Document';

    const updated = await updateDocument(activeDocument.id, {
      content: cleanContent,
      title
    });

    activeDocument = updated;
    isDirty = false;

    // Distinguish a confirmed cloud save from a local-only save
    if (updated.cloudSynced === true) {
      emitSaveStatus('saved_cloud');
    } else {
      emitSaveStatus('saved_local');
    }

    return { success: true, cloudSynced: updated.cloudSynced === true, doc: updated };
  } catch (err) {
    emitSaveStatus('failed');
    return { success: false, error: err.message || 'Failed to save document.' };
  }
}

/**
 * Duplicates the active document under a new title and activates it in the editor.
 *
 * @param {string} newTitle - New document title
 * @returns {Promise<{ success: boolean, error?: string, doc?: Object }>}
 */
export async function saveAsDocument(newTitle) {
  if (!activeDocument) {
    return { success: false, error: 'No active document open to duplicate.' };
  }

  const cleanTitle = (newTitle || '').trim();
  if (!cleanTitle) {
    return { success: false, error: 'Document title cannot be empty.' };
  }

  try {
    // Duplicate document record in database
    const duplicated = await duplicateDocument(activeDocument.id, cleanTitle, activeDocument.ownerId);

    // Ensure duplicate contains any current unsaved editor content
    const currentContent = sanitizeHTML(editorCallbacks.getContent());
    const finalDoc = await updateDocument(duplicated.id, { content: currentContent });

    setActiveDocument(finalDoc);
    editorCallbacks.setTitle(finalDoc.title);
    editorCallbacks.setContent(sanitizeHTML(finalDoc.content || ''));
    isDirty = false;
    emitSaveStatus('saved');

    return { success: true, doc: finalDoc };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to duplicate document.' };
  }
}

/**
 * Renames a document and synchronizes the active document title if matched.
 *
 * @param {string} id - Document UUID
 * @param {string} newTitle - New title
 * @returns {Promise<{ success: boolean, error?: string, doc?: Object }>}
 */
export async function renameDocument(id, newTitle) {
  if (!id) {
    return { success: false, error: 'Document ID is required.' };
  }

  const cleanTitle = (newTitle || '').trim();
  if (!cleanTitle) {
    return { success: false, error: 'Title cannot be empty.' };
  }

  try {
    const updated = await updateDocument(id, { title: cleanTitle });

    if (activeDocument && activeDocument.id === id) {
      activeDocument.title = updated.title;
      editorCallbacks.setTitle(updated.title);
    }

    return { success: true, doc: updated };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to rename document.' };
  }
}

/**
 * Deletes a document by ID and clears editor state if the active document was deleted.
 *
 * @param {string} id - Document UUID
 * @param {string} [ownerId] - Optional owner verification
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function deleteDocumentById(id, ownerId) {
  if (!id) {
    return { success: false, error: 'Document ID is required.' };
  }

  try {
    await deleteDocument(id);

    if (activeDocument && activeDocument.id === id) {
      activeDocument = null;
      isDirty = false;
      editorCallbacks.clearEditor();
      editorCallbacks.showEmptyState();
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to delete document.' };
  }
}

/**
 * Starts periodic background autosave watching the dirty flag.
 *
 * @param {number} [intervalMs=2000] - Polling interval in milliseconds
 */
export function startAutosave(intervalMs = 2000) {
  autosaveEnabled = true;

  if (autosaveTimer) {
    clearInterval(autosaveTimer);
  }

  autosaveTimer = window.setInterval(async () => {
    if (autosaveEnabled && isDirty && activeDocument) {
      await saveCurrentDocument();
    }
  }, intervalMs);
}

/**
 * Stops autosave polling and flushes any pending unsaved changes.
 *
 * @returns {Promise<void>}
 */
export async function stopAutosave() {
  autosaveEnabled = false;

  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  if (isDirty && activeDocument) {
    await flushPendingSave();
  }
}

/**
 * Marks that local changes have occurred in the active document.
 */
export function markDirty() {
  isDirty = true;
}

/**
 * Immediately saves current document if dirty changes exist.
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function flushPendingSave() {
  if (isDirty && activeDocument) {
    return await saveCurrentDocument();
  }
  return { success: true };
}

/**
 * Registers a listener for save status transitions.
 *
 * @param {Function} callback - Invoked with 'saving' | 'saved' | 'failed'
 */
export function onSaveStatus(callback) {
  saveStatusCallback = callback;
}

/**
 * Emits a save status event to the registered listener.
 *
 * @param {'saving'|'saved'|'failed'} status
 */
export function emitSaveStatus(status) {
  if (typeof saveStatusCallback === 'function') {
    saveStatusCallback(status);
  }
}
