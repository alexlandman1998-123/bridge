import { createClient } from 'supabase';
import { credentialSet, supabaseServiceKey } from '../_shared/apiCredentials.ts';
import { handleMadisonReservations } from './handler.ts';
Deno.serve((request: Request) => {
 const key=supabaseServiceKey()||'';
 const keys=credentialSet();
 return handleMadisonReservations(request,{
  client:key?createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}}):null,
  serviceKeys:[...keys.secrets,...(keys.allowLegacy?[keys.legacyService]:[])],
  enabled:Deno.env.get('MADISON_RESERVATIONS_ENABLED')==='true',
  apiKey:Deno.env.get('RESEND_API_KEY')||'',
  from:Deno.env.get('ARCH9_RESEND_FROM_EMAIL')||Deno.env.get('RESEND_FROM_EMAIL')||'',
  hashSalt:Deno.env.get('MADISON_RESERVATION_HASH_SALT')||key,
 });
});
