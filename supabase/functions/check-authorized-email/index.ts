/// <reference path="../deno.d.ts" />
/**
 * check-authorized-email — Supabase Edge Function
 *
 * Validates whether a given email is authorized to register.
 * Reads the allowlist from server-side environment variables (Supabase secrets).
 *
 * Environment variables to set in Supabase Dashboard → Edge Functions → Secrets:
 *   AUTHORIZED_EMAILS  — comma-separated list of authorized emails (lowercase)
 *   AUTHORIZED_DOMAIN  — single approved domain (e.g. myuniversity.edu), or empty
 *
 * Deploy with:
 *   supabase functions deploy check-authorized-email
 *
 * NEVER place the service-role key in frontend code.
 * This function uses the built-in Deno env (set via Supabase secrets), not the anon key.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ authorized: false, reason: 'Email is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Read from Supabase secrets (set in dashboard)
    const authorizedEmailsRaw = Deno.env.get('AUTHORIZED_EMAILS') ?? '';
    const authorizedDomain = (Deno.env.get('AUTHORIZED_DOMAIN') ?? '').trim().toLowerCase();

    const authorizedEmails = authorizedEmailsRaw
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);

    let authorized = false;
    let reason = 'Email not authorized for this application.';

    if (authorizedEmails.includes(normalizedEmail)) {
      authorized = true;
    } else if (authorizedDomain && normalizedEmail.endsWith('@' + authorizedDomain)) {
      authorized = true;
    }

    if (!authorized) {
      // Do not reveal the actual allowlist in the response
      return new Response(
        JSON.stringify({ authorized: false, reason }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ authorized: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ authorized: false, reason: 'Server error during validation.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
