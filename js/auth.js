/**
 * auth.js — Supabase authentication module with email allowlist guards.
 *
 * Provides user registration, login, logout, and session lifecycle management.
 * Sensitive data such as passwords and auth tokens are never logged.
 */

import { supabase } from './supabase-client.js';
import {
  AUTHORIZED_EMAILS,
  AUTHORIZED_DOMAIN,
  REQUIRE_SERVER_SIDE_CHECK
} from '../config/authorized-emails.js';

/**
 * Custom error class for authentication operations ensuring seamless compatibility
 * with UI error displays expecting either an Error instance (.message) or a string.
 */
export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }

  toString() {
    return this.message;
  }
}

/**
 * Checks whether an email address satisfies the frontend allowlist or domain criteria.
 * Note: This serves as a client-side UX guard; the Edge Function handles trusted enforcement.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isEmailAuthorized(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const normalized = email.trim().toLowerCase();

  if (Array.isArray(AUTHORIZED_EMAILS)) {
    const isExplicitlyAuthorized = AUTHORIZED_EMAILS.some(
      (entry) => typeof entry === 'string' && entry.trim().toLowerCase() === normalized
    );
    if (isExplicitlyAuthorized) {
      return true;
    }
  }

  if (AUTHORIZED_DOMAIN && typeof AUTHORIZED_DOMAIN === 'string') {
    const domain = AUTHORIZED_DOMAIN.trim().toLowerCase().replace(/^@/, '');
    const emailDomain = normalized.split('@')[1];
    if (emailDomain === domain) {
      return true;
    }
  }

  return false;
}

/**
 * Registers a new user account after performing authorization checks.
 *
 * @param {string} fullName - Full display name
 * @param {string} email - User email address
 * @param {string} password - User password (min 6 characters)
 * @returns {Promise<{ success: boolean, error?: AuthError, needsVerification?: boolean }>}
 */
export async function registerUser(fullName, email, password) {
  if (!fullName || !fullName.trim()) {
    return { success: false, error: new AuthError('Full name is required.') };
  }
  if (!email || !email.trim()) {
    return { success: false, error: new AuthError('Email address is required.') };
  }
  if (!password || password.length < 6) {
    return { success: false, error: new AuthError('Password must be at least 6 characters long.') };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Client-side UX allowlist guard
  if (!isEmailAuthorized(normalizedEmail)) {
    return {
      success: false,
      error: new AuthError('This email is not authorized for registration. Please contact the administrator.')
    };
  }

  // 2. Server-side Edge Function verification
  let edgeFunctionFailed = false;

  try {
    const { data, error } = await supabase.functions.invoke('check-authorized-email', {
      body: { email: normalizedEmail }
    });

    if (error) {
      edgeFunctionFailed = true;
    } else if (data && typeof data.authorized === 'boolean') {
      if (!data.authorized) {
        return {
          success: false,
          error: new AuthError(data.message || 'Email is not authorized by the server verification policy.')
        };
      }
    }
  } catch (err) {
    edgeFunctionFailed = true;
  }

  if (edgeFunctionFailed) {
    if (REQUIRE_SERVER_SIDE_CHECK) {
      return {
        success: false,
        error: new AuthError('Unable to reach the verification server. Server-side check is required for registration.')
      };
    }
    console.warn(
      'Warning: Server-side email authorization check could not be completed; proceeding with client allowlist validation.'
    );
  }

  // 3. Supabase Auth signup
  try {
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim()
        }
      }
    });

    if (error) {
      return { success: false, error: new AuthError(error.message) };
    }

    // In Supabase, if email confirmation is turned on, session is null upon signup
    const needsVerification = !data.session && !!data.user;

    return {
      success: true,
      needsVerification
    };
  } catch (err) {
    return {
      success: false,
      error: new AuthError(err.message || 'An unexpected registration error occurred.')
    };
  }
}

/**
 * Authenticates an existing user and validates workspace authorization.
 *
 * @param {string} email - User email address
 * @param {string} password - User password
 * @returns {Promise<{ success: boolean, error?: AuthError, user?: Object }>}
 */
export async function loginUser(email, password) {
  if (!email || !email.trim()) {
    return { success: false, error: new AuthError('Email address is required.') };
  }
  if (!password) {
    return { success: false, error: new AuthError('Password is required.') };
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      return { success: false, error: new AuthError(error.message) };
    }

    // Client-side UX allowlist check on authenticated email
    const authenticatedEmail = data.user?.email || normalizedEmail;
    if (!isEmailAuthorized(authenticatedEmail)) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: new AuthError('Your email address is not authorized to access this application.')
      };
    }

    return {
      success: true,
      user: data.user
    };
  } catch (err) {
    return {
      success: false,
      error: new AuthError(err.message || 'An unexpected login error occurred.')
    };
  }
}

/**
 * Signs out the current user session.
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function logoutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'An unexpected error occurred during logout.'
    };
  }
}

/**
 * Retrieves the currently authenticated Supabase user, or null if unauthenticated.
 *
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      const sessionResult = await restoreSession();
      return sessionResult ? sessionResult.user : null;
    }
    return user;
  } catch (err) {
    return null;
  }
}

/**
 * Restores an existing session from client storage.
 *
 * @returns {Promise<{ session: Object, user: Object }|null>}
 */
export async function restoreSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || !session.user) {
      return null;
    }
    return {
      session,
      user: session.user
    };
  } catch (err) {
    return null;
  }
}

/**
 * Listens for Supabase authentication state transitions.
 *
 * @param {Function} callback - Invoked with (event, session)
 * @returns {Function} Unsubscribe teardown function
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => {
    subscription.unsubscribe();
  };
}
