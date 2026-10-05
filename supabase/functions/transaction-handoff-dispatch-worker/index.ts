import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.9';
import { dispatchTransactionHandoffJob } from '../_shared/transactionHandoffDelivery.ts';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async request => {
  if (request.method !== 'POST') return json(405,{error:'POST is required.'});
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) return json(403,{error:'Worker authorization required.'});
  const url = Deno.env.get('SUPABASE_URL') || '';
  const config = {appUrl:Deno.env.get('ARCH9_APP_URL') || '',sender:Deno.env.get('ARCH9_RESEND_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || '',apiKey:Deno.env.get('RESEND_API_KEY') || ''};
  if (!url || !/^https:\/\/[^/]+/.test(config.appUrl) || !config.sender || !config.apiKey) return json(500,{error:'Worker environment configuration is incomplete.'});
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const body = await request.json().catch(() => ({}));
  const input = body && typeof body === 'object' ? body : {};
  const claimed = await client.rpc('claim_transaction_handoff_dispatch',{p_limit:Math.max(1,Math.min(Math.trunc(Number(input.limit)) || 10,25))});
  if (claimed.error) return json(500,{error:'Dispatch queue could not be claimed.'});
  const results = await Promise.all((claimed.data || []).map((job: any) => dispatchTransactionHandoffJob(client,job,config)));
  return json(200,{ok:true,claimed:results.length,results});
});
