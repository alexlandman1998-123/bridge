import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { RecordValue, text } from "../_shared/metaLeadAds.ts";

const GRAPH_VERSION=text(Deno.env.get("META_GRAPH_VERSION"))||"v23.0";
const APP_ID=text(Deno.env.get("META_APP_ID"))||"1010066162083846";
const LOGIN_CONFIG_ID=text(Deno.env.get("META_LEAD_ADS_LOGIN_CONFIG_ID"));
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,x-client-info,apikey,content-type","access-control-allow-methods":"GET,POST,OPTIONS"};
const json=(status:number,body:RecordValue)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"content-type":"application/json"}});
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
async function sha256(value:string){const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return [...b].map(v=>v.toString(16).padStart(2,"0")).join("");}
function serviceClient(){const u=text(Deno.env.get("SUPABASE_URL")),k=text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));return u&&k?createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
function callbackUrl(){return `${text(Deno.env.get("SUPABASE_URL")).replace(/\/$/,"")}/functions/v1/meta-lead-ads-admin`;}
async function encrypt(token:string){const kb=Uint8Array.from(atob(text(Deno.env.get("META_TOKEN_ENCRYPTION_KEY"))),c=>c.charCodeAt(0));if(kb.length!==32)throw new Error("Meta token encryption is not configured.");const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey("raw",kb,"AES-GCM",false,["encrypt"]);const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(token)));return `${base64(iv)}.${base64(cipher)}`;}
async function decrypt(ciphertext:string){const kb=Uint8Array.from(atob(text(Deno.env.get("META_TOKEN_ENCRYPTION_KEY"))),c=>c.charCodeAt(0)),[a,b]=ciphertext.split(".");const key=await crypto.subtle.importKey("raw",kb,"AES-GCM",false,["decrypt"]);return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(a),c=>c.charCodeAt(0))},key,Uint8Array.from(atob(b),c=>c.charCodeAt(0))));}
async function graph(path:string,token:string,init?:RequestInit){const join=path.includes("?")?"&":"?";const r=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}${join}access_token=${encodeURIComponent(token)}`,init);const body=await r.json() as RecordValue;if(!r.ok)throw new Error(text((body.error as RecordValue)?.message)||"Meta API request failed.");return body;}
async function actor(req:Request,db:any,organisationId:string){const jwt=text(req.headers.get("authorization")).replace(/^Bearer\s+/i,"");const user=(await db.auth.getUser(jwt)).data.user;if(!user)throw new Error("Unauthenticated.");const member=await db.from("organisation_users").select("role,status").eq("organisation_id",organisationId).eq("user_id",user.id).maybeSingle();if(!member.data||member.data.status!=="active"||!["principal","owner","director","admin","super_admin","developer","agency_admin"].includes(member.data.role))throw new Error("Organisation administrator access required.");return user.id;}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS}); const db=serviceClient();if(!db)return json(500,{error:"Service is not configured."});
  const url=new URL(req.url), code=text(url.searchParams.get("code")), state=text(url.searchParams.get("state"));
  if(req.method==="GET"&&code&&state){
    const stateHash=await sha256(state), stateRow=await db.from("meta_lead_ads_oauth_states").select("*").eq("state_hash",stateHash).is("consumed_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(!stateRow.data)return json(400,{error:"OAuth state is invalid or expired."});
    await db.from("meta_lead_ads_oauth_states").update({consumed_at:new Date().toISOString()}).eq("state_hash",stateHash);
    const params=new URLSearchParams({client_id:APP_ID,client_secret:text(Deno.env.get("META_APP_SECRET")),redirect_uri:callbackUrl(),code});
    const tokenResponse=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`),tokenBody=await tokenResponse.json() as RecordValue;
    if(!tokenResponse.ok)return json(400,{error:"Meta authorisation failed."});
    const encrypted=await encrypt(text(tokenBody.access_token));
    await db.from("meta_lead_ads_oauth_states").update({token_ciphertext:encrypted}).eq("state_hash",stateHash);
    return Response.redirect(`${stateRow.data.return_url}${stateRow.data.return_url.includes("?")?"&":"?"}meta_authorized=1&state=${encodeURIComponent(state)}`,302);
  }
  if(req.method!=="POST")return json(405,{error:"Method not allowed."});
  let body:RecordValue;try{body=await req.json();}catch{return json(400,{error:"Invalid JSON."});}const action=text(body.action),org=text(body.organisationId);let userId:string;
  try{userId=await actor(req,db,org);}catch(error){return json(403,{error:error instanceof Error?error.message:"Forbidden."});}
  try{
    if(action==="start_authorization"){
      const raw=base64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g,""),returnUrl=text(body.returnUrl);if(!/^https:\/\/app\.arch9\.co\.za(?:\/|$)/.test(returnUrl)&&!/^http:\/\/localhost:\d+(?:\/|$)/.test(returnUrl))return json(400,{error:"Invalid return URL."});
      if(!LOGIN_CONFIG_ID)return json(500,{error:"Meta Lead Ads login configuration is not configured."});
      await db.from("meta_lead_ads_oauth_states").insert({state_hash:await sha256(raw),organisation_id:org,requested_by:userId,return_url:returnUrl,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
      const q=new URLSearchParams({client_id:APP_ID,redirect_uri:callbackUrl(),state:raw,response_type:"code",config_id:LOGIN_CONFIG_ID});return json(200,{authorizationUrl:`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${q}`});
    }
    if(action==="list"){
      const rows=await db.from("meta_lead_ads_connections").select("id,page_id,page_name,business_id,connection_status,last_error_message,last_checked_at,connected_at").eq("organisation_id",org);return json(200,{connections:rows.data||[]});
    }
    if(action==="complete_authorization"||action==="connect_page"){
      const rawState=text(body.state),stateRow=(await db.from("meta_lead_ads_oauth_states").select("*").eq("state_hash",await sha256(rawState)).eq("organisation_id",org).eq("requested_by",userId).not("consumed_at","is",null).gt("expires_at",new Date().toISOString()).maybeSingle()).data;
      if(!stateRow?.token_ciphertext)return json(400,{error:"Authorisation session is invalid or expired."});
      const userToken=await decrypt(stateRow.token_ciphertext),pagesBody=await graph("me/accounts?fields=id,name,access_token,tasks&limit=200",userToken),pages=Array.isArray(pagesBody.data)?pagesBody.data as RecordValue[]:[];
      if(action==="complete_authorization")return json(200,{pages:pages.map(p=>({id:p.id,name:p.name,tasks:p.tasks}))});
      const page=pages.find(p=>text(p.id)===text(body.pageId));if(!page||!text(page.access_token))return json(400,{error:"Selected Page is not available to this Meta account."});
      const saved=await db.from("meta_lead_ads_connections").upsert({organisation_id:org,page_id:text(page.id),page_name:text(page.name),token_ciphertext:await encrypt(text(page.access_token)),connection_status:"connected",connected_by:userId,connected_at:new Date().toISOString(),disconnected_at:null,last_error_message:null},{onConflict:"organisation_id,page_id"}).select("id,page_id,page_name,connection_status").single();
      if(saved.error)throw new Error(saved.error.message);await db.from("meta_lead_ads_oauth_states").update({token_ciphertext:null}).eq("state_hash",stateRow.state_hash);return json(200,{connection:saved.data});
    }
    const connectionId=text(body.connectionId),row=(await db.from("meta_lead_ads_connections").select("*").eq("id",connectionId).eq("organisation_id",org).maybeSingle()).data;if(!row)return json(404,{error:"Connection not found."});
    if(action==="list_forms"){const token=await decrypt(row.token_ciphertext);return json(200,{forms:(await graph(`${row.page_id}/leadgen_forms?fields=id,name,status&limit=200`,token)).data||[]});}
    if(action==="select_forms"){
      const forms=Array.isArray(body.forms)?body.forms as RecordValue[]:[],token=await decrypt(row.token_ciphertext);
      for(const form of forms){
        const branchId=text(form.branchId),agentId=text(form.assignedAgentId);
        if(branchId){const branch=(await db.from("organisation_branches").select("id").eq("id",branchId).eq("organisation_id",org).maybeSingle()).data;if(!branch)throw new Error("Selected branch does not belong to this organisation.");}
        if(agentId){const member=(await db.from("organisation_users").select("user_id").eq("user_id",agentId).eq("organisation_id",org).eq("status","active").maybeSingle()).data;if(!member)throw new Error("Selected agent does not belong to this organisation.");}
        const saved=await db.from("meta_lead_ads_forms").upsert({connection_id:row.id,organisation_id:org,page_id:row.page_id,form_id:text(form.id),form_name:text(form.name),branch_id:branchId||null,assigned_agent_id:agentId||null,is_active:true},{onConflict:"organisation_id,form_id"});if(saved.error)throw new Error(saved.error.message);
      }
      await graph(`${row.page_id}/subscribed_apps`,token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({subscribed_fields:"leadgen"})});return json(200,{connected:true,formsSelected:forms.length});
    }
    if(action==="disconnect"){const token=await decrypt(row.token_ciphertext);await graph(`${row.page_id}/subscribed_apps`,token,{method:"DELETE"}).catch(()=>null);await db.from("meta_lead_ads_connections").update({connection_status:"disconnected",disconnected_at:new Date().toISOString(),token_ciphertext:await encrypt(crypto.randomUUID())}).eq("id",row.id);return json(200,{disconnected:true});}
    return json(400,{error:"Unsupported action."});
  }catch(error){return json(502,{error:error instanceof Error?error.message:"Meta operation failed."});}
});
