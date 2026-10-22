/**
 * app.js — Main application bootstrap for index.html.
 *
 * Coordinates authentication state, database initialization, offline detection,
 * document management, and DOM event bindings for the editor interface.
 */

import {
  restoreSession,
  logoutUser,
  onAuthStateChange
} from './auth.js';

import {
  initDB,
  syncPendingChanges,
  migrateIndexedDBToSupabase
} from './database.js';

import {
  setEditorCallbacks,
  getActiveDocument,
  loadUserLibrary,
  newDocument,
  openDocument,
  forceOpenDocument,
  saveCurrentDocument,
  saveAsDocument,
  renameDocument,
  deleteDocumentById,
  startAutosave,
  stopAutosave,
  markDirty,
  flushPendingSave,
  getIsDirty,
  onSaveStatus,
  emitSaveStatus
} from './documents.js';

import {
  initEditor,
  getContent,
  setContent,
  getTitle,
  setTitle,
  clearEditor,
  showEmptyState,
  hideEmptyState,
  focusEditor,
  onContentChange,
  onTitleChange,
  updateCounts
} from './editor.js';

import {
  registerServiceWorker,
  initOfflineMonitor,
  isOnline
} from './offline.js';

import {
  safeSetText,
  escapeHTML,
  sanitizeHTML
} from './security.js';

// Application state
let currentUser = null;
let cachedLibrary = [];
let pendingDocumentIdToOpen = null;
let pendingDocumentIdToDelete = null;
let pendingDocumentIdToRename = null;

/**
 * Formats an ISO date string into a user-friendly timestamp.
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Displays user name or email in the top navigation bar.
 *
 * @param {Object} user
 */
function displayUserInfo(user) {
  const userDisplayEl = document.getElementById('user-display');
  if (!userDisplayEl || !user) return;

  const displayName = (user.user_metadata && user.user_metadata.full_name)
    ? user.user_metadata.full_name
    : user.email || 'User';

  safeSetText(userDisplayEl, displayName);
}

/**
 * Updates the save status indicator in the UI.
 *
 * Status values:
 *   'saving'      — write is in progress
 *   'saved_cloud' — Supabase confirmed the write (only this shows cloud icon)
 *   'saved_local' — saved to IndexedDB only; sync still pending
 *   'syncing'     — background sync in progress
 *   'failed'      — both cloud and local saves failed
 *
 * @param {'saving'|'saved_cloud'|'saved_local'|'syncing'|'failed'} status
 */
function updateSaveStatusUI(status) {
  const statusEl = document.getElementById('save-status');
  if (!statusEl) return;

  statusEl.classList.remove('saving', 'saved', 'error', 'syncing', 'local');

  if (status === 'saving') {
    safeSetText(statusEl, 'Saving...');
    statusEl.classList.add('saving');
  } else if (status === 'saved_cloud') {
    safeSetText(statusEl, 'Saved to cloud ☁️');
    statusEl.classList.add('saved');
  } else if (status === 'saved_local') {
    safeSetText(statusEl, 'Saved locally 💾 (sync pending)');
    statusEl.classList.add('local');
  } else if (status === 'syncing') {
    safeSetText(statusEl, 'Syncing to cloud...');
    statusEl.classList.add('syncing');
  } else if (status === 'failed') {
    safeSetText(statusEl, 'Save failed ❌');
    statusEl.classList.add('error');
  }
}

/**
 * Updates UI network badge and toggles offline alert banner.
 *
 * @param {'online'|'offline'} status
 */
async function handleNetworkChange(status) {
  const networkStatusEl = document.getElementById('network-status');
  const offlineBannerEl = document.getElementById('offline-banner');

  if (networkStatusEl) {
    networkStatusEl.classList.remove('online', 'offline');
    if (status === 'online') {
      safeSetText(networkStatusEl, 'Online');
      networkStatusEl.classList.add('online');
    } else {
      safeSetText(networkStatusEl, 'Offline');
      networkStatusEl.classList.add('offline');
    }
  }

  if (offlineBannerEl) {
    if (status === 'offline') {
      offlineBannerEl.removeAttribute('hidden');
    } else {
      offlineBannerEl.setAttribute('hidden', '');
    }
  }

  // When coming back online, sync any pending offline changes to Supabase
  if (status === 'online' && currentUser) {
    try {
      updateSaveStatusUI('syncing');
      const syncResult = await syncPendingChanges(currentUser.id);
      if (syncResult.synced > 0) {
        console.info(`[App] Background sync complete: ${syncResult.synced} synced, ${syncResult.failed} failed.`);
      }
      updateSaveStatusUI('saved_cloud');
      await renderLibrary();
    } catch (err) {
      console.warn('[App] Background sync failed:', err);
      updateSaveStatusUI('saved_local');
    }
  }
}

/**
 * Finds a modal element by supporting both markup ID variants.
 *
 * @param {string} modalId
 * @returns {HTMLElement|null}
 */
function getModalElement(modalId) {
  return document.getElementById(modalId) ||
         (modalId === 'modal-delete-confirm' ? document.getElementById('modal-delete') : null) ||
         (modalId === 'modal-unsaved-changes' ? document.getElementById('modal-unsaved') : null);
}

/**
 * Opens a modal window by ID.
 *
 * @param {string} modalId
 */
function openModal(modalId) {
  const modal = getModalElement(modalId);
  if (modal) {
    modal.removeAttribute('hidden');
    const firstInput = modal.querySelector('input');
    if (firstInput) {
      firstInput.focus();
      if (typeof firstInput.select === 'function') firstInput.select();
    }
  }
}

/**
 * Closes a specific modal or all open modals if no ID is passed.
 *
 * @param {string} [modalId]
 */
function closeModal(modalId) {
  if (modalId) {
    const modal = getModalElement(modalId);
    if (modal) {
      modal.setAttribute('hidden', '');
      const err = modal.querySelector('.modal-error');
      if (err) {
        err.textContent = '';
        err.setAttribute('hidden', '');
      }
    }
  } else {
    document.querySelectorAll('.modal-overlay').forEach((m) => {
      m.setAttribute('hidden', '');
      const err = m.querySelector('.modal-error');
      if (err) {
        err.textContent = '';
        err.setAttribute('hidden', '');
      }
    });
  }
}

/**
 * Updates the visual active selection state of sidebar items.
 *
 * @param {string} docId
 */
function updateActiveSidebarItem(docId) {
  const items = document.querySelectorAll('.document-item, [data-doc-id]');
  items.forEach((item) => {
    if (item.getAttribute('data-doc-id') === docId) {
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
    } else {
      item.classList.remove('active');
      item.removeAttribute('aria-selected');
    }
  });
}

/**
 * Loads user documents from storage (Supabase when online, IndexedDB when offline) and updates the sidebar document list.
 */
async function renderLibrary() {
  if (!currentUser) return;

  try {
    cachedLibrary = await loadUserLibrary(currentUser.id);
  } catch (err) {
    console.error('Failed to load document library:', err);
    return;
  }

  const listContainer = document.getElementById('document-list') ||
                        document.getElementById('sidebar-docs') ||
                        document.querySelector('.document-list');

  if (!listContainer) return;

  const searchInput = document.getElementById('search-docs');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filteredDocs = query
    ? cachedLibrary.filter((d) => (d.title || '').toLowerCase().includes(query))
    : cachedLibrary;

  listContainer.innerHTML = '';

  if (filteredDocs.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'sidebar-empty';
    safeSetText(emptyLi, query ? 'No matching documents' : 'No documents yet');
    listContainer.appendChild(emptyLi);
    return;
  }

  const activeDoc = getActiveDocument();

  filteredDocs.forEach((doc) => {
    const item = document.createElement('li');
    item.className = 'document-item';
    item.setAttribute('data-doc-id', doc.id);

    if (activeDoc && activeDoc.id === doc.id) {
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
    }

    // Title & info wrapper
    const infoDiv = document.createElement('div');
    infoDiv.className = 'document-item-info';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'document-item-title';
    safeSetText(titleSpan, doc.title || 'Untitled Document');

    const metaSpan = document.createElement('span');
    metaSpan.className = 'document-item-time';
    safeSetText(metaSpan, formatTimestamp(doc.updatedAt));

    infoDiv.appendChild(titleSpan);
    infoDiv.appendChild(metaSpan);

    // Actions wrapper
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'document-item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'btn-icon btn-rename-doc';
    renameBtn.title = 'Rename';
    renameBtn.setAttribute('data-action', 'rename');
    renameBtn.setAttribute('data-id', doc.id);
    renameBtn.setAttribute('aria-label', `Rename ${doc.title || 'document'}`);
    renameBtn.innerHTML = '&#9998;'; // Pencil icon

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-icon btn-delete-doc';
    deleteBtn.title = 'Delete';
    deleteBtn.setAttribute('data-action', 'delete');
    deleteBtn.setAttribute('data-id', doc.id);
    deleteBtn.setAttribute('aria-label', `Delete ${doc.title || 'document'}`);
    deleteBtn.innerHTML = '&times;'; // Cross icon

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);

    item.appendChild(infoDiv);
    item.appendChild(actionsDiv);

    listContainer.appendChild(item);
  });
}

/**
 * Handles creation of a new document.
 */
async function newDocumentFlow() {
  if (!currentUser) return;

  if (getIsDirty()) {
    await flushPendingSave();
  }

  try {
    const doc = await newDocument(currentUser.id);
    hideEmptyState();
    await renderLibrary();
    updateActiveSidebarItem(doc.id);
    focusEditor();
  } catch (err) {
    console.error('Error creating new document:', err);
  }
}

/**
 * Handles switching to or opening a specific document by ID.
 *
 * @param {string} id
 */
async function openDocumentFlow(id) {
  const currentActive = getActiveDocument();
  if (currentActive && currentActive.id === id && !getIsDirty()) {
    return;
  }

  if (getIsDirty()) {
    pendingDocumentIdToOpen = id;
    openModal('modal-unsaved');
    return;
  }

  try {
    const doc = await openDocument(id);
    if (doc && !doc.needsConfirmation) {
      hideEmptyState();
      updateActiveSidebarItem(id);
      await renderLibrary();
    }
  } catch (err) {
    console.error('Error opening document:', err);
  }
}

/**
 * Handles saving the active document to storage (Supabase when online, IndexedDB when offline).
 */
async function saveFlow() {
  const active = getActiveDocument();
  if (!active) return;

  emitSaveStatus('saving');
  const result = await saveCurrentDocument();
  if (result.success) {
    // saveCurrentDocument already emitted the correct status (saved_cloud / saved_local)
    await renderLibrary();
  } else {
    emitSaveStatus('failed');
    console.error('[App] Save failed:', result.error);
  }
}

/**
 * Prompts the user to save a copy of the active document under a new title.
 */
function saveAsFlow() {
  const active = getActiveDocument();
  if (!active) return;

  const titleInput = document.getElementById('save-as-title') || document.getElementById('input-save-as-title');
  if (titleInput) {
    titleInput.value = `${active.title || 'Untitled Document'} (Copy)`;
  }
  const errEl = document.getElementById('save-as-error');
  if (errEl) {
    errEl.textContent = '';
    errEl.setAttribute('hidden', '');
  }
  openModal('modal-save-as');
}

/**
 * Finalizes the Save As operation.
 */
async function confirmSaveAs() {
  const titleInput = document.getElementById('save-as-title') || document.getElementById('input-save-as-title');
  const newTitle = titleInput ? titleInput.value.trim() : '';
  const errEl = document.getElementById('save-as-error');

  if (!newTitle) {
    if (errEl) {
      safeSetText(errEl, 'Please enter a valid document title.');
      errEl.removeAttribute('hidden');
    }
    return;
  }

  const result = await saveAsDocument(newTitle);
  if (result.success) {
    await renderLibrary();
    if (result.doc) {
      updateActiveSidebarItem(result.doc.id);
    }
    closeModal('modal-save-as');
  } else {
    if (errEl) {
      safeSetText(errEl, result.error || 'Failed to save duplicate document.');
      errEl.removeAttribute('hidden');
    } else {
      alert(result.error || 'Failed to save duplicate document.');
    }
  }
}

/**
 * Opens the rename confirmation modal for a document.
 *
 * @param {string} id
 */
function renameFlow(id) {
  pendingDocumentIdToRename = id;
  const doc = cachedLibrary.find((d) => d.id === id);
  const titleInput = document.getElementById('rename-title') || document.getElementById('input-rename-title');
  if (titleInput && doc) {
    titleInput.value = doc.title || '';
  }
  const errEl = document.getElementById('rename-error');
  if (errEl) {
    errEl.textContent = '';
    errEl.setAttribute('hidden', '');
  }
  openModal('modal-rename');
}

/**
 * Confirms and executes renaming a document.
 */
async function confirmRename() {
  if (!pendingDocumentIdToRename) return;

  const titleInput = document.getElementById('rename-title') || document.getElementById('input-rename-title');
  const newTitle = titleInput ? titleInput.value.trim() : '';
  const errEl = document.getElementById('rename-error');

  if (!newTitle) {
    if (errEl) {
      safeSetText(errEl, 'Title cannot be empty.');
      errEl.removeAttribute('hidden');
    }
    return;
  }

  const result = await renameDocument(pendingDocumentIdToRename, newTitle);
  if (result.success) {
    await renderLibrary();
    closeModal('modal-rename');
    pendingDocumentIdToRename = null;
  } else {
    if (errEl) {
      safeSetText(errEl, result.error || 'Failed to rename document.');
      errEl.removeAttribute('hidden');
    } else {
      alert(result.error || 'Failed to rename document.');
    }
  }
}

/**
 * Prompts user to confirm deletion of a document.
 *
 * @param {string} id
 */
function deleteFlow(id) {
  pendingDocumentIdToDelete = id;
  const doc = cachedLibrary.find((d) => d.id === id);
  const msgEl = document.getElementById('modal-delete-msg');
  if (msgEl && doc) {
    safeSetText(msgEl, `Are you sure you want to delete "${doc.title || 'Untitled Document'}"? This cannot be undone.`);
  }
  openModal('modal-delete');
}

/**
 * Confirms and deletes the designated document.
 */
async function confirmDelete() {
  if (!pendingDocumentIdToDelete || !currentUser) return;

  const result = await deleteDocumentById(pendingDocumentIdToDelete, currentUser.id);
  closeModal('modal-delete');
  pendingDocumentIdToDelete = null;

  if (result.success) {
    await renderLibrary();
  } else {
    alert(result.error || 'Failed to delete document.');
  }
}

/**
 * Exports current document as a standalone downloadable HTML file.
 */
function exportFlow() {
  const active = getActiveDocument();
  if (!active) return;

  const docTitle = active.title || 'Untitled Document';
  const docContent = active.content || '';

  const exportDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHTML(docTitle)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1a202c;
    }
    h1, h2, h3 { color: #1a202c; }
  </style>
</head>
<body>
  <h1>${escapeHTML(docTitle)}</h1>
  ${docContent}
</body>
</html>`;

  const blob = new Blob([exportDocument], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${docTitle.replace(/[\\/:*?"<>|]/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Stops autosave, signs out the user, resets state, and redirects to login.
 */
async function logoutFlow() {
  await stopAutosave();
  await logoutUser();
  clearEditor();
  showEmptyState();
  window.location.href = 'login.html';
}

/**
 * Reacts to Supabase auth events.
 *
 * @param {string} event
 * @param {Object|null} session
 */
function handleAuthChange(event, session) {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = 'login.html';
  } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    currentUser = session.user;
    displayUserInfo(currentUser);
  }
}

/**
 * Displays an unrecoverable fatal error UI when essential dependencies like IndexedDB fail.
 *
 * @param {Error} error
 */
function showFatalErrorUI(error) {
  console.error('Fatal initialization error:', error);
  const container = document.body;
  if (!container) return;

  const banner = document.createElement('div');
  banner.className = 'fatal-error-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:sans-serif;';

  const heading = document.createElement('h2');
  safeSetText(heading, 'Storage Initialization Failed');

  const desc = document.createElement('p');
  safeSetText(
    desc,
    'This application requires IndexedDB local storage to operate. Please enable local storage or try opening the app in a non-incognito window. Error: ' +
    (error.message || 'Unknown storage error')
  );

  banner.appendChild(heading);
  banner.appendChild(desc);
  container.prepend(banner);
}

/**
 * Binds all interactive DOM event listeners.
 */
function wireUIEvents() {
  // Top toolbar buttons
  const btnNew = document.getElementById('btn-new');
  if (btnNew) btnNew.addEventListener('click', newDocumentFlow);

  const btnSave = document.getElementById('btn-save');
  if (btnSave) btnSave.addEventListener('click', saveFlow);

  const btnSaveAs = document.getElementById('btn-save-as');
  if (btnSaveAs) btnSaveAs.addEventListener('click', saveAsFlow);

  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', exportFlow);

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', logoutFlow);

  // Sidebar document list delegation
  const docList = document.getElementById('document-list') ||
                  document.getElementById('sidebar-docs') ||
                  document.querySelector('.document-list');

  if (docList) {
    docList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-delete-doc, [data-action="delete"]');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.getAttribute('data-id');
        if (id) deleteFlow(id);
        return;
      }

      const renameBtn = e.target.closest('.btn-rename-doc, [data-action="rename"]');
      if (renameBtn) {
        e.stopPropagation();
        const id = renameBtn.getAttribute('data-id');
        if (id) renameFlow(id);
        return;
      }

      const docItem = e.target.closest('.document-item, [data-doc-id]');
      if (docItem) {
        const id = docItem.getAttribute('data-doc-id');
        if (id) openDocumentFlow(id);
      }
    });
  }

  // Search filter input
  const searchInput = document.getElementById('search-docs');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderLibrary();
    });
  }

  // Modal: Save As confirmation & cancel
  const btnConfirmSaveAs = document.getElementById('btn-save-as-confirm') || document.getElementById('btn-confirm-save-as');
  if (btnConfirmSaveAs) btnConfirmSaveAs.addEventListener('click', confirmSaveAs);

  const btnCancelSaveAs = document.getElementById('btn-save-as-cancel');
  if (btnCancelSaveAs) btnCancelSaveAs.addEventListener('click', () => closeModal('modal-save-as'));

  // Modal: Rename confirmation & cancel
  const btnConfirmRename = document.getElementById('btn-rename-confirm') || document.getElementById('btn-confirm-rename');
  if (btnConfirmRename) btnConfirmRename.addEventListener('click', confirmRename);

  const btnCancelRename = document.getElementById('btn-rename-cancel');
  if (btnCancelRename) btnCancelRename.addEventListener('click', () => closeModal('modal-rename'));

  // Modal: Delete confirmation & cancel
  const btnConfirmDelete = document.getElementById('btn-delete-confirm') || document.getElementById('btn-confirm-delete');
  if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', confirmDelete);

  const btnCancelDelete = document.getElementById('btn-delete-cancel');
  if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => closeModal('modal-delete'));

  // Modal: Unsaved changes choices
  const btnDiscardUnsaved = document.getElementById('btn-unsaved-discard') || document.getElementById('btn-discard-unsaved');
  if (btnDiscardUnsaved) {
    btnDiscardUnsaved.addEventListener('click', async () => {
      closeModal('modal-unsaved');
      if (pendingDocumentIdToOpen) {
        const id = pendingDocumentIdToOpen;
        pendingDocumentIdToOpen = null;
        await forceOpenDocument(id);
        hideEmptyState();
        updateActiveSidebarItem(id);
        await renderLibrary();
      }
    });
  }

  const btnSaveAndProceed = document.getElementById('btn-unsaved-save') || document.getElementById('btn-save-and-proceed');
  if (btnSaveAndProceed) {
    btnSaveAndProceed.addEventListener('click', async () => {
      await saveCurrentDocument();
      closeModal('modal-unsaved');
      if (pendingDocumentIdToOpen) {
        const id = pendingDocumentIdToOpen;
        pendingDocumentIdToOpen = null;
        await openDocument(id);
        hideEmptyState();
        updateActiveSidebarItem(id);
        await renderLibrary();
      }
    });
  }

  const btnCancelUnsaved = document.getElementById('btn-unsaved-cancel') || document.getElementById('btn-cancel-unsaved');
  if (btnCancelUnsaved) {
    btnCancelUnsaved.addEventListener('click', () => {
      pendingDocumentIdToOpen = null;
      closeModal('modal-unsaved');
    });
  }

  // Generic modal cancel / close buttons
  document.querySelectorAll('[data-close-modal], .modal-cancel, .btn-modal-cancel').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal();
    });
  });

  // Keyboard shortcuts: Ctrl+S or Cmd+S to save
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveFlow();
    }
  });
}

/**
 * Main application initialization pipeline.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize IndexedDB storage (used as offline fallback and local cache)
  try {
    await initDB();
  } catch (err) {
    // IndexedDB failure is no longer fatal since Supabase is the primary store
    console.warn('IndexedDB initialization failed, cloud storage will be used:', err);
  }

  // 2. Service worker registration for offline support
  await registerServiceWorker();

  // 3. Offline monitor
  initOfflineMonitor(handleNetworkChange);

  // 4. Session restoration and authentication guard
  const sessionResult = await restoreSession();
  if (!sessionResult || !sessionResult.session || !sessionResult.user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = sessionResult.user;
  displayUserInfo(currentUser);

  // 5. Connect editor and document subsystems
  setEditorCallbacks({
    getContent,
    getTitle,
    setContent,
    setTitle,
    clearEditor,
    showEmptyState
  });

  initEditor();

  onContentChange(markDirty);
  onTitleChange(markDirty);

  // 6. Autosave and status subscription
  startAutosave(2000);
  onSaveStatus(updateSaveStatusUI);

  // 7. Supabase Auth state listener
  onAuthStateChange(handleAuthChange);

  // 8. Bind UI controls and events
  wireUIEvents();

  // 9. One-time migration of existing IndexedDB documents to Supabase
  try {
    const migrationKey = `supabase_migrated_${currentUser.id}`;
    if (!localStorage.getItem(migrationKey)) {
      const result = await migrateIndexedDBToSupabase(currentUser.id);
      if (result.migrated > 0) {
        console.info(`Migrated ${result.migrated} document(s) to Supabase cloud storage.`);
      }
      localStorage.setItem(migrationKey, 'true');
    }
  } catch (err) {
    console.warn('Document migration to Supabase skipped:', err);
  }

  // 10. Initial library load
  await renderLibrary();

  // 11. Automatically open most recent document or show empty state
  if (cachedLibrary.length > 0) {
    await openDocumentFlow(cachedLibrary[0].id);
  } else {
    showEmptyState();
  }
});
