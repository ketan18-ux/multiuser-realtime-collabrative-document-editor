/**
 * config/authorized-emails.js
 *
 * ============================================================
 * REQUIRED CONFIGURATION — PROJECT OWNER MUST EDIT THIS FILE
 * ============================================================
 *
 * This file defines which email addresses are authorized to
 * register for this application.
 *
 * SECURITY NOTE:
 * This frontend list is a UX convenience check only.
 * The authoritative enforcement is the Supabase Edge Function
 * `check-authorized-email`, which reads from a server-side secret.
 * See README.md → "Authorized Email Configuration" for full setup.
 *
 * OPTION A — Fixed allowlist of individual emails:
 * Add each authorized email address (lowercase) to the array.
 *
 * OPTION B — Approved domain:
 * Set AUTHORIZED_DOMAIN to your organization's domain (e.g. 'myuniversity.edu').
 * Leave AUTHORIZED_EMAILS as an empty array.
 * Set REQUIRE_SERVER_SIDE_CHECK to true for stricter enforcement.
 *
 * Leave both empty to disable the frontend check (not recommended).
 */

/**
 * List of individually authorized email addresses.
 * All entries must be lowercase.
 * @type {string[]}
 */
export const AUTHORIZED_EMAILS = [
  // 'teammate1@example.com',
  // 'teammate2@example.com',
  // Add your team's email addresses here
];

/**
 * Approved email domain (alternative to individual emails).
 * Example: 'myuniversity.edu'
 * Set to null to disable domain-based authorization.
 * @type {string|null}
 */
export const AUTHORIZED_DOMAIN = 'kletech.ac.in';

/**
 * If true, registration is blocked when the Supabase Edge Function
 * cannot be reached (e.g. no connectivity). Recommended for production.
 * If false, the frontend allowlist is used as a fallback.
 * @type {boolean}
 */
export const REQUIRE_SERVER_SIDE_CHECK = false;
