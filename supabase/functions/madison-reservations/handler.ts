import { sendViaResendApi } from '../send-email/services/resend.ts';
import { assessControlledTestRecipient } from '../send-email/utils/controlledTestRecipient.ts';

type Row = Record<string, any>;
type Dependencies = { client: any; enabled: boolean; apiKey: string; from: string; serviceKeys: string[]; hashSalt: string; send?: typeof sendViaResendApi };
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const email = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
export async function digest(value: string) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function buildMadisonEmail(p: Row) {
 const deadline = new Intl.DateTimeFormat('en-ZA',{dateStyle:'long',timeStyle:'short',timeZone:'Africa/Johannesburg'}).format(new Date(p.expiresAt))+' SAST';
 const base = [`Hi ${p.buyerName},`,'',`Madison Place · Unit ${p.unitNumber}`,`Reference: ${p.reference}`];
 let subject: string; let lines: string[];
 if (p.kind==='buyer_request') {
  subject=`Your 48-hour Madison Place hold · Unit ${p.unitNumber}`;
  lines=[...base,'',`Your unit is held until ${deadline}, awaiting the fully refundable R10,000 reservation deposit.`,`Pay by EFT into the ${p.trustName} trust account:`,`Account holder: ${p.accountHolder}`,`Bank: ${p.bankName}`,`Account number: ${p.accountNumber}`,`Branch code: ${p.branchCode}`,`Payment reference: ${p.reference}`,'',`Reply with proof of payment, or email it to ${p.replyTo}. Samlin will confirm your reservation once cleared funds have been manually verified. Proof of payment alone does not confirm the reservation.`,`If Samlin has not confirmed receipt by ${deadline}, the hold expires automatically. Allow time for EFT clearance. If payment may arrive late, contact Samlin before paying; availability must be checked again.`,'','Refund terms:',p.refundTerms];
 } else if (p.kind==='staff_request') {
  subject=`Awaiting deposit · Madison Place Unit ${p.unitNumber}`;
  lines=[`New 48-hour hold for Madison Place Unit ${p.unitNumber}.`,`Buyer: ${p.buyerName}`,`Email: ${p.buyerEmail}`,`Phone: ${p.buyerPhone}`,`Reference: ${p.reference}`,`Expires: ${deadline}`,'','Verify the R10,000 has cleared into the Tuckers Attorneys trust account, then confirm it in Development → Availability → Madison Place reservations.'];
 } else if (p.kind==='confirmed') {
  subject=`Reservation confirmed · Madison Place Unit ${p.unitNumber}`;
  lines=[...base,'','Samlin has manually confirmed receipt of your fully refundable R10,000 reservation deposit in trust. Your unit is now reserved.','', 'Refund terms:',p.refundTerms,'','Reply to this email for assistance with the next steps.'];
 } else {
  subject=`Hold ${p.kind==='expired'?'expired':'released'} · Madison Place Unit ${p.unitNumber}`;
  lines=[...base,'',`Your unpaid hold has ${p.kind==='expired'?'expired':'been released'}. It no longer reserves this unit.`,'If you have already paid, reply with your proof of payment so Samlin can review your payment and availability. Do not pay again.'];
 }
 const body=lines.join('\n');
 const escape=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 return {to:p.to,replyTo:p.replyTo,subject,text:body,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escape(body)}</div>`};
}
export async function handleMadisonReservations(request: Request, deps: Dependencies): Promise<Response> {
 const origin=request.headers.get('origin')||'';
 const allowed=!origin || ['https://madisonplace.co.za','https://www.madisonplace.co.za','https://app.arch9.co.za'].includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
 const headers={'Content-Type':'application/json','Cache-Control':'no-store',...(allowed&&origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const response=(status:number,data:Row)=>new Response(JSON.stringify(data),{status,headers});
 if(!allowed)return response(403,{error:'This origin cannot submit a reservation.'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return response(405,{error:'Use POST.'});
 if(!deps.enabled || !deps.client || !deps.apiKey || !deps.from || !deps.hashSalt)return response(503,{error:'Reservations are not open yet. Please contact Samlin.'});
 let input: Row;
 try { const raw=await request.text(); if(raw.length>8192)return response(413,{error:'Request too large.'}); input=JSON.parse(raw); if(!input || Array.isArray(input))throw new Error(); }catch{return response(400,{error:'Invalid request.'});}
 if(input.action==='dispatch') {
  const supplied=text(request.headers.get('apikey'));
  const incoming=await digest(supplied);
  if(!supplied || !(await Promise.all(deps.serviceKeys.filter(Boolean).map(digest))).includes(incoming))return response(401,{error:'Worker authentication required.'});
  const {data:jobs,error}=await deps.client.rpc('madison_claim_reservation_emails');
  if(error)return response(503,{error:'Email queue unavailable.'});
  let sent=0;
  for(const job of jobs||[]) {
   try {
    const envelope=buildMadisonEmail(job.payload);
    if(assessControlledTestRecipient({email:envelope.to}).suppressed) {
     await deps.client.from('madison_reservation_emails').update({state:'review'}).eq('id',job.id).eq('state','sending'); continue;
    }
    const result=await(deps.send||sendViaResendApi)({...envelope,apiKey:deps.apiKey,from:deps.from,idempotencyKey:`madison-reservation/${job.id}`,timeoutMs:15000});
    const ok=result.ok && Boolean(result.data?.id);
    const {error:saveError}=await deps.client.from('madison_reservation_emails').update({state:ok?'sent':'failed',provider_id:ok?result.data.id:null,next_attempt_at:new Date(Date.now()+5*60000).toISOString()}).eq('id',job.id).eq('state','sending');
    if(ok&&!saveError)sent++;
   } catch { /* A persisted sending lease can retry with the same provider key. */ }
  }
  return response(200,{processed:(jobs||[]).length,sent});
 }
 const id=text(input.requestId),unitId=text(input.unitId),name=text(input.name),buyerEmail=text(input.email).toLowerCase(),phone=text(input.phone);
 if(input.action!=='request' || !uuid(id) || !uuid(unitId) || name.length<2 || name.length>160 || !email(buyerEmail) || phone.length<6 || phone.length>40 || input.consent!==true || text(input.website))return response(400,{error:'Enter your name, email and phone number, and agree to the reservation terms.'});
 // The platform supplies the forwarding chain; never accept a client body IP.
 const ip=text(request.headers.get('x-forwarded-for')).split(',')[0]||'unknown';
 const terms=text(input.refundTerms);
 if(!terms || terms.length>4000)return response(400,{error:'Review the reservation terms before submitting.'});
 const fingerprint=await digest(JSON.stringify([id,unitId,name,buyerEmail,phone,terms]));
 const {data,error}=await deps.client.rpc('madison_request_reservation',{p_id:id,p_unit_id:unitId,p_name:name,p_email:buyerEmail,p_phone:phone,p_fingerprint:fingerprint,p_ip_hash:await digest(`${deps.hashSalt}:${ip}`),p_refund_terms:terms});
 if(error) {
  const messages:Record<string,string>={'23514':'This unit is no longer available. Please choose another residence.','54000':'Please contact Samlin to review your reservation request.','55000':'Reservations are not open yet. Please contact Samlin.','22023':'This request could not be accepted. Check your details or start a new request.'};
  return response(error.code==='54000'?429:error.code==='23514'?409:error.code==='55000'?503:400,{error:messages[error.code]||'Your request could not be saved. Please try again with the same details.'});
 }
 return response(200,{...data,emailStatus:'queued'});
}
