import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.9';
import { dispatchAttorneyAppointmentJob } from '../_shared/attorneyAppointmentDelivery.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async request => {
  if (request.method !== 'POST') return json(405,{error:'POST is required.'});
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceRoleKey || request.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) return json(403,{error:'Worker authorization required.'});
  const appUrl = Deno.env.get('ARCH9_APP_URL') || '';
  if (!supabaseUrl || !/^https:\/\/[^/]+/.test(appUrl)) return json(500,{error:'Worker environment configuration is incomplete.'});
  const client = createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const input = await request.json().catch(() => ({}));
  const claimed = await client.rpc('claim_attorney_appointment_delivery',{p_limit:Math.max(1,Math.min(Number(input.limit) || 10,25))});
  if (claimed.error) return json(500,{error:'Delivery queue could not be claimed.'});
  const results = await Promise.all((claimed.data || []).map((job: Record<string, unknown>) => dispatchAttorneyAppointmentJob(client,job,{supabaseUrl,serviceRoleKey,appUrl})));
  return json(200,{ok:true,claimed:results.length,results});
});
