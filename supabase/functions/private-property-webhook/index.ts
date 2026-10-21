import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'supabase';
import { handlePrivatePropertyLeadWebhook } from '../_shared/privatePropertyLeadWebhook.ts';

Deno.serve(withApiCredentials(async (request) => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = supabaseServiceKey() || '';
  return handlePrivatePropertyLeadWebhook(request, {
    client: url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null,
    secretFromEnv: (name) => name ? Deno.env.get(name) || '' : '',
  });
}));
