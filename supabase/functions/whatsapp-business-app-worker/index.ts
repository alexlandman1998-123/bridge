import { createClient } from 'npm:@supabase/supabase-js@2.55.0'
import { authorizeCampaignWorker } from '../whatsapp-campaign-worker/authorization.js'
import { createBusinessAppWorker } from './worker.js'
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
Deno.serve(async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',url=Deno.env.get('SUPABASE_URL')||''
  let secrets:string[]=[]
  try{const values=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');if(values&&typeof values==='object'&&!Array.isArray(values))secrets=Object.values(values).filter((value):value is string=>typeof value==='string'&&value.startsWith('sb_secret_'))}catch{ /* Invalid configuration never authorizes a worker. */ }
  if(!await authorizeCampaignWorker(request,{legacy:key,secrets}))return json(401,{error:'Worker authorization required.'})
  if(!key||!url)return json(503,{error:'Worker configuration is incomplete.'})
  try{return json(200,await createBusinessAppWorker({db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})})())}
  catch{return json(500,{error:'Phone app synchronization could not be processed.'})}
})
