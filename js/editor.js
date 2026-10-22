/**
 * editor.js — ContentEditable DOM editor controller and formatting toolbar.
 *
 * Manages the rich-text editing surface, word/character count calculations,
 * and text formatting commands. Does NOT import documents.js to prevent circular dependencies.
 */

// Cached DOM element references
let editorContentEl = null;
let documentTitleEl = null;
let wordCountEl = null;
let charCountEl = null;
let emptyStateEl = null;
let editorAreaEl = null;

// Callbacks for changes
let contentChangeCallback = null;
let titleChangeCallback = null;

/**
 * Executes a formatting command on the active selection within the contenteditable region.
 *
 * @param {string} command - document.execCommand identifier
 * @param {string|null} [value=null] - Optional argument for commands like formatBlock
 */
export function execFormat(command, value = null) {
  if (typeof document === 'undefined') return;

  if (editorContentEl) {
    editorContentEl.focus();
  }

  if (command === 'formatBlock' && value) {
    const tag = String(value).replace(/[<>]/g, '').toLowerCase();
    try {
      const ok = document.execCommand('formatBlock', false, `<${tag}>`);
      if (!ok) {
        document.execCommand('formatBlock', false, tag);
      }
    } catch (err) {
      document.execCommand('formatBlock', false, tag);
    }
  } else {
    document.execCommand(command, false, value);
  }

  updateCounts();

  if (typeof contentChangeCallback === 'function') {
    contentChangeCallback();
  }
}

/**
 * Calculates current word and character counts and updates the status bar elements.
 */
export function updateCounts() {
  const text = editorContentEl ? (editorContentEl.innerText || editorContentEl.textContent || '') : '';
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;

  if (wordCountEl) {
    wordCountEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  }
  if (charCountEl) {
    charCountEl.textContent = `${chars} ${chars === 1 ? 'character' : 'characters'}`;
  }
}

/**
 * Retrieves the inner HTML of the editable area.
 *
 * @returns {string}
 */
export function getContent() {
  return editorContentEl ? editorContentEl.innerHTML : '';
}

/**
 * Replaces the inner HTML of the editable area and recalculates metrics.
 *
 * @param {string} html - Sanitized HTML string
 */
export function setContent(html) {
  if (editorContentEl) {
    editorContentEl.innerHTML = html !== null && html !== undefined ? String(html) : '';
  }
  updateCounts();
}

/**
 * Retrieves the current document title from the title input field.
 *
 * @returns {string}
 */
export function getTitle() {
  return documentTitleEl ? documentTitleEl.value : '';
}

/**
 * Sets the document title input value.
 *
 * @param {string} title
 */
export function setTitle(title) {
  if (documentTitleEl) {
    documentTitleEl.value = title !== null && title !== undefined ? String(title) : '';
  }
}

/**
 * Clears both editor content and title input, resetting counts to zero.
 */
export function clearEditor() {
  setContent('');
  setTitle('');
  updateCounts();
}

/**
 * Displays the empty state placeholder and hides the active editing surface.
 */
export function showEmptyState() {
  if (emptyStateEl) {
    emptyStateEl.removeAttribute('hidden');
    emptyStateEl.style.display = 'flex';
  }
  if (editorAreaEl) {
    editorAreaEl.setAttribute('hidden', '');
    editorAreaEl.style.display = 'none';
  }
}

/**
 * Hides the empty state placeholder and displays the active editing surface.
 */
export function hideEmptyState() {
  if (emptyStateEl) {
    emptyStateEl.setAttribute('hidden', '');
    emptyStateEl.style.display = 'none';
  }
  if (editorAreaEl) {
    editorAreaEl.removeAttribute('hidden');
    editorAreaEl.style.display = 'flex';
  }
}

/**
 * Places keyboard focus directly inside the editable content container.
 */
export function focusEditor() {
  if (editorContentEl) {
    editorContentEl.focus();
  }
}

/**
 * Registers a listener invoked whenever the editor content changes.
 *
 * @param {Function} callback
 */
export function onContentChange(callback) {
  contentChangeCallback = callback;
}

/**
 * Registers a listener invoked whenever the title input changes.
 *
 * @param {Function} callback
 */
export function onTitleChange(callback) {
  titleChangeCallback = callback;
}

/**
 * Initializes the editor by querying DOM elements and attaching event listeners.
 */
export function initEditor() {
  editorContentEl = document.getElementById('editor-content');
  documentTitleEl = document.getElementById('document-title');
  wordCountEl = document.getElementById('word-count');
  charCountEl = document.getElementById('char-count');
  emptyStateEl = document.getElementById('empty-state');
  editorAreaEl = document.getElementById('editor-area') || document.querySelector('.editor-workspace');

  if (editorContentEl) {
    editorContentEl.setAttribute('contenteditable', 'true');

    editorContentEl.addEventListener('input', () => {
      updateCounts();
      if (typeof contentChangeCallback === 'function') {
        contentChangeCallback();
      }
    });

    editorContentEl.addEventListener('keyup', () => {
      updateCounts();
    });

    editorContentEl.addEventListener('paste', () => {
      setTimeout(updateCounts, 0);
    });
  }

  if (documentTitleEl) {
    documentTitleEl.addEventListener('input', () => {
      if (typeof titleChangeCallback === 'function') {
        titleChangeCallback();
      }
    });
  }

  // Setup toolbar buttons via data attributes
  const toolbar = document.querySelector('.toolbar') || document.getElementById('toolbar');
  if (toolbar) {
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-command]');
      if (!btn) return;

      e.preventDefault();
      const command = btn.getAttribute('data-command');
      const value = btn.getAttribute('data-value') || null;
      if (command) {
        execFormat(command, value);
      }
    });

    const formatSelect = toolbar.querySelector('select[data-command="formatBlock"]') ||
                         document.getElementById('select-format-block');
    if (formatSelect) {
      formatSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          execFormat('formatBlock', val);
        }
      });
    }
  }

  // Bind specific toolbar button IDs if present in DOM
  const commandMap = {
    'btn-bold': { cmd: 'bold' },
    'btn-italic': { cmd: 'italic' },
    'btn-underline': { cmd: 'underline' },
    'btn-h1': { cmd: 'formatBlock', val: 'h1' },
    'btn-h2': { cmd: 'formatBlock', val: 'h2' },
    'btn-h3': { cmd: 'formatBlock', val: 'h3' },
    'btn-p': { cmd: 'formatBlock', val: 'p' },
    'btn-ul': { cmd: 'insertUnorderedList' },
    'btn-ol': { cmd: 'insertOrderedList' },
    'btn-undo': { cmd: 'undo' },
    'btn-redo': { cmd: 'redo' }
  };

  Object.entries(commandMap).forEach(([id, config]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        execFormat(config.cmd, config.val || null);
      });
    }
  });

  updateCounts();
}
