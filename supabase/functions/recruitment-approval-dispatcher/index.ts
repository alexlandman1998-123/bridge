import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'supabase';
import { dispatchRecruitmentApprovals } from './handler.ts';
Deno.serve(withApiCredentials(request => {
  const key = supabaseServiceKey() || '', url = Deno.env.get('SUPABASE_URL') || '';
  return dispatchRecruitmentApprovals(request, { key, admin: key && url ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null });
}));
