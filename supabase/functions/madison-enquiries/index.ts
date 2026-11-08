import { createClient } from 'supabase';
import { supabaseServiceKey } from '../_shared/apiCredentials.ts';
import { handleMadisonEnquiry } from './handler.ts';
Deno.serve((request: Request) => {
  const key = supabaseServiceKey() || '';
  return handleMadisonEnquiry(request, {
    client: key ? createClient(Deno.env.get('SUPABASE_URL') || '', key, { auth: { persistSession: false, autoRefreshToken: false } }) : null,
    hashSalt: Deno.env.get('MADISON_ENQUIRY_HASH_SALT') || key,
  });
});
