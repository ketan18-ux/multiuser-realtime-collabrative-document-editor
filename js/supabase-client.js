/**
 * supabase-client.js — Singleton Supabase client instance.
 *
 * Imports public credentials from config.js and initializes the client
 * created by the Supabase UMD script loaded in the document head.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE' ||
    !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY_HERE') {
  throw new Error('Supabase is not configured. Please edit js/config.js with your project URL and anon key.');
}

if (typeof window === 'undefined' || !window.supabase || typeof window.supabase.createClient !== 'function') {
  throw new Error(
    'Supabase client library is not loaded. Ensure the Supabase JS script tag is included in your HTML before loading this module: ' +
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>'
  );
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
