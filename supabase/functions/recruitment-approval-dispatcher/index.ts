import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'supabase';
import { dispatchRecruitmentApprovals } from './handler.ts';
Deno.serve(request => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', url = Deno.env.get('SUPABASE_URL') || '';
  return dispatchRecruitmentApprovals(request, { key, admin: key && url ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null });
});
