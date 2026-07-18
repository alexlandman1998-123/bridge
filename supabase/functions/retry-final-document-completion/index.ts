import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord=Record<string,unknown>;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const reply=(status:number,body:JsonRecord)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:cors});
  if(req.method!=="POST") return reply(405,{success:false,error:"Method not allowed."});
  let attemptId="";
  let recoveryUrl="";
  let recoveryServiceKey="";
  try{
    const url=Deno.env.get("SUPABASE_URL")||"";
    const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    recoveryUrl=url;
    recoveryServiceKey=serviceKey;
    const authorization=text(req.headers.get("authorization"));
    if(!url||!anon||!serviceKey||!authorization) return reply(401,{success:false,error:"Authentication is required.",errorCode:"F5_AUTH_REQUIRED"});
    const payload=await req.json() as JsonRecord;
    const packetId=text(payload.packetId||payload.packet_id);
    const versionId=text(payload.packetVersionId||payload.packet_version_id);
    const rehearsal=payload.rehearsal===true||payload.dryRun===true||payload.dry_run===true;
    if(!packetId||!versionId) return reply(400,{success:false,error:"packetId and packetVersionId are required.",errorCode:"F5_TARGET_REQUIRED"});
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
    const bearer=text(authorization).replace(/^Bearer\s+/i,"");
    const serviceRehearsal=rehearsal&&bearer===serviceKey;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const userResult=serviceRehearsal?{data:{user:null},error:null}:await userClient.auth.getUser();
    if(!serviceRehearsal&&(userResult.error||!userResult.data.user)) return reply(401,{success:false,error:"Your session is no longer active.",errorCode:"F5_AUTH_INVALID"});
    const requestedBy=text(userResult.data.user?.id);
    if(!serviceRehearsal){
      const packetAccess=await userClient.from("document_packets").select("id").eq("id",packetId).maybeSingle();
      if(packetAccess.error||!packetAccess.data) return reply(403,{success:false,error:"You cannot retry this document.",errorCode:"F5_ACCESS_DENIED"});
    }
    if(rehearsal){
      const rehearsalClient=serviceRehearsal?admin:userClient;
      const rehearsalResult=await rehearsalClient.rpc("bridge_rehearse_final_completion_recovery_g4",{p_packet_id:packetId,p_packet_version_id:versionId});
      if(rehearsalResult.error||rehearsalResult.data?.contract!=="g4-v1") return reply(409,{success:false,error:"The recovery rehearsal could not establish safe immutable-artifact reuse.",errorCode:"G4_RECOVERY_REHEARSAL_FAILED",mutatedData:false});
      return reply(200,{success:true,rehearsal:true,evidence:rehearsalResult.data,mutatedData:false});
    }
    const claim=await admin.rpc("bridge_claim_final_completion_retry_f5",{p_packet_id:packetId,p_packet_version_id:versionId,p_requested_by:requestedBy});
    if(claim.error) throw claim.error;
    attemptId=text(claim.data);
    if(!attemptId) return reply(409,{success:false,error:"A completion retry is already running.",errorCode:"F5_RETRY_IN_PROGRESS"});
    const dispatch=await fetch(`${url.replace(/\/$/,"")}/functions/v1/dispatch-final-signed-document`,{method:"POST",headers:{"Content-Type":"application/json",apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},body:JSON.stringify({packetId,packetVersionId:versionId})});
    const body=await dispatch.json().catch(()=>({})) as JsonRecord;
    const success=dispatch.ok&&body.success===true;
    await admin.rpc("bridge_complete_final_completion_retry_f5",{p_attempt_id:attemptId,p_success:success,p_outcome:{httpStatus:dispatch.status,errorCode:body.errorCode||null,allDelivered:body.allDelivered===true}});
    if(!success) return reply(409,{success:false,error:text(body.error)||"Completion retry did not finish.",errorCode:text(body.errorCode)||"F5_RETRY_INCOMPLETE",retryable:true});
    const status=await admin.rpc("bridge_get_final_completion_status_f5",{p_packet_id:packetId,p_packet_version_id:versionId});
    return reply(200,{success:true,attemptId,status:status.data||null,delivery:body});
  }catch(error){
    console.error("retry-final-document-completion failed",error);
    if(attemptId&&recoveryUrl&&recoveryServiceKey){
      const recovery=createClient(recoveryUrl,recoveryServiceKey,{auth:{persistSession:false}});
      try{await recovery.rpc("bridge_complete_final_completion_retry_f5",{p_attempt_id:attemptId,p_success:false,p_outcome:{errorCode:"F5_RETRY_FAILED"}});}catch{/* best-effort retry audit */}
    }
    return reply(500,{success:false,error:"The completion retry failed safely. The signed PDF was not changed.",errorCode:"F5_RETRY_FAILED",attemptId:attemptId||null});
  }
});
