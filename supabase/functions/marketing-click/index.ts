import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.9';
import { supabaseServiceKey, withApiCredentials } from '../_shared/apiCredentials.ts';
import { createMarketingClickHandler } from './handler.ts';
Deno.serve(withApiCredentials(createMarketingClickHandler({
  db: createClient(Deno.env.get('SUPABASE_URL') || '', supabaseServiceKey() || '', {auth:{persistSession:false,autoRefreshToken:false}}),
  defer: task => { if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task); },
})));
