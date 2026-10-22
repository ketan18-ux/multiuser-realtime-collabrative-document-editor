/**
 * security.js — DOM-based HTML sanitizer and output encoders.
 *
 * Provides XSS prevention and safe DOM manipulation utilities.
 * Critical security infrastructure for the collaborative document editor.
 */

/**
 * Whitelist of permitted HTML tags for rich-text document content.
 * Any elements outside this set are either unwrapped (preserving text) or pruned.
 */
const SAFE_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'span', 'div'
]);

/**
 * Elements that pose active execution or embedding risks.
 * These elements and all of their descendant contents are permanently removed.
 */
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'select', 'textarea', 'style', 'link', 'meta', 'base', 'applet',
  'frame', 'frameset', 'video', 'audio', 'canvas', 'svg', 'math',
  'noscript', 'template'
]);

/**
 * Regular expression detecting dangerous CSS expressions, scripts, or external loads.
 */
const DANGEROUS_STYLE_REGEX = /expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|url\s*\(|@import|binding\s*:/i;

/**
 * Sanitizes an inline style string, removing any unsafe CSS properties,
 * dynamic expressions, or URI references.
 *
 * @param {string} styleString - Raw CSS style attribute content
 * @returns {string} Cleaned, safe CSS declarations
 */
function sanitizeStyle(styleString) {
  if (!styleString || typeof styleString !== 'string') return '';

  const declarations = styleString.split(';');
  const safeDeclarations = [];

  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;

    if (DANGEROUS_STYLE_REGEX.test(trimmed)) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const prop = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const val = trimmed.slice(colonIndex + 1).trim();

    if (!prop || !val) continue;
    if (DANGEROUS_STYLE_REGEX.test(prop) || DANGEROUS_STYLE_REGEX.test(val)) continue;

    safeDeclarations.push(`${prop}: ${val}`);
  }

  return safeDeclarations.join('; ');
}

/**
 * Recursively cleans attributes on a DOM element, retaining only safe inline styles.
 *
 * @param {Element} element
 */
function cleanAttributes(element) {
  const attrs = Array.from(element.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    // Remove any event listener attributes (e.g., onclick, onload, onerror)
    if (name.startsWith('on')) {
      element.removeAttribute(attr.name);
      continue;
    }

    // Only allow the 'style' attribute, with strict sanitization
    if (name === 'style') {
      const sanitizedStyle = sanitizeStyle(value);
      if (sanitizedStyle) {
        element.setAttribute('style', sanitizedStyle);
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }

    // Remove all other attributes (including any href/src with javascript:)
    element.removeAttribute(attr.name);
  }
}

/**
 * Recursively walks and sanitizes DOM nodes starting from the given node.
 *
 * @param {Node} node
 */
function cleanNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.remove();
    return;
  }

  const tagName = node.tagName.toLowerCase();

  // Remove dangerous tags and all their descendants immediately
  if (DANGEROUS_TAGS.has(tagName)) {
    node.remove();
    return;
  }

  // Recursively sanitize all children first
  const children = Array.from(node.childNodes);
  for (const child of children) {
    cleanNode(child);
  }

  // Normalize legacy formatting tags to standard safe tags
  if (tagName === 'b') {
    const strong = node.ownerDocument.createElement('strong');
    while (node.firstChild) strong.appendChild(node.firstChild);
    node.parentNode.replaceChild(strong, node);
    cleanAttributes(strong);
    return;
  }

  if (tagName === 'i') {
    const em = node.ownerDocument.createElement('em');
    while (node.firstChild) em.appendChild(node.firstChild);
    node.parentNode.replaceChild(em, node);
    cleanAttributes(em);
    return;
  }

  // If the tag is not in the whitelist, unwrap its children and remove the container
  if (!SAFE_TAGS.has(tagName)) {
    const parent = node.parentNode;
    if (parent) {
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    } else {
      node.remove();
    }
    return;
  }

  // Tag is safe: sanitize all attributes
  cleanAttributes(node);
}

/**
 * Parses and sanitizes an HTML string using DOMParser.
 * Walks the DOM tree allowing only safe tags and attributes.
 *
 * @param {string} html - Raw HTML string to sanitize
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    // Non-browser fallback: strip all HTML tags
    return html.replace(/<[^>]*>/g, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const bodyChildren = Array.from(doc.body.childNodes);
  for (const child of bodyChildren) {
    cleanNode(child);
  }

  return doc.body.innerHTML;
}

/**
 * Safely sets textContent of a DOM element, guarding against null references and XSS.
 *
 * @param {Element|null} element - The DOM element
 * @param {*} text - Text value to assign
 */
export function safeSetText(element, text) {
  if (!element || !(element instanceof Node)) {
    return;
  }
  element.textContent = text !== null && text !== undefined ? String(text) : '';
}

/**
 * Escapes characters with special meaning in HTML contexts.
 *
 * @param {*} str - Input string to escape
 * @returns {string} Escaped HTML string
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
