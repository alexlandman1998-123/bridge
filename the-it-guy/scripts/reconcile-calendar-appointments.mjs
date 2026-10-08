#!/usr/bin/env node
import { readFile, writeFile, lstat, access } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { parseAppointmentInstant } from '../src/core/appointments/appointmentTime.js'
import { ATTORNEY_PRODUCTION_PROJECT_REF } from './lib/attorney-staging-safety.mjs'
import { reconcileAppointmentInventory, draftCalendarRepairPlan, formatCalendarRepairReport } from '../src/core/appointments/appointmentReconciliation.js'

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const planDigest=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex')
function required(value,label) { if (typeof value!=='string' || !value.trim()) throw new Error(`${label} is required.`);return value.trim() }
function identity(value,label) { if (!uuid.test(value || '')) throw new Error(`${label} must be a UUID.`);return value }
function fresh(value,now=Date.now()) {
 if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return false
 try {const t=Date.parse(parseAppointmentInstant(value));return Number.isFinite(t) && t<=now && now-t<=86400000} catch {return false}
}
export function validateRepairTarget({environment,projectRef,organisationId,url}) {
 if (!['production','staging','local'].includes(environment)) throw new Error('Explicitly select production, staging or local.')
 if ((environment==='production' && projectRef!==ATTORNEY_PRODUCTION_PROJECT_REF) || (environment!=='production' && projectRef===ATTORNEY_PRODUCTION_PROJECT_REF)) throw new Error('The production project must be explicitly identified as production; staging must use a different project.')
 identity(organisationId,'Organisation')
 const parsed=new URL(required(url,'Supabase URL'))
 if (parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) throw new Error('Use a plain Supabase origin URL.')
 if (environment==='local') {
  if (projectRef!=='local' || !['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || !['http:','https:'].includes(parsed.protocol)) throw new Error('Local repair requires a local origin and project reference local.')
 } else if (!/^[a-z]{20}$/.test(projectRef || '') || parsed.protocol!=='https:' || parsed.hostname!==`${projectRef}.supabase.co` || parsed.port) throw new Error('The URL must match the explicitly selected Supabase project reference.')
 return {environment,projectRef,organisationId,url:parsed.origin}
}
export function validateRepairPlan(plan,target,{now=Date.now()}={}) {
 if (plan.version!==1 || plan.environment!==target.environment || plan.projectRef!==target.projectRef || plan.organisationId!==target.organisationId) throw new Error('The plan does not match the selected target.')
 if (!fresh(plan.capturedAt,now)) throw new Error('Export and review a fresh snapshot within 24 hours.')
 identity(plan.batchId,'Batch');identity(plan.reviewedBy,'Reviewer');required(plan.reason,'Batch reason')
 if (!Array.isArray(plan.entries) || plan.entries.some(e=>!e || typeof e!=='object' || Array.isArray(e))) throw new Error('The plan needs reviewed entries.')
 const entries=plan.entries.filter(e=>e.selected===true)
 if (!entries.length || entries.length>100) throw new Error('Select 1 to 100 reviewed appointments.')
 const seen=new Set()
 for (const e of entries) {
  identity(e.appointmentId,'Appointment');if (seen.has(e.appointmentId)) throw new Error('Select each appointment once.');seen.add(e.appointmentId)
  if (!/^[a-f0-9]{32}$/.test(e.expectedFingerprint || '')) throw new Error('Each repair needs an authoritative snapshot fingerprint.')
  required(e.reason,'Record reason');required(e.evidence,'Record evidence')
  if (!['normalise_metadata','correct_past_schedule','link_internal_participant','suppress_historical_delivery'].includes(e.action)) throw new Error('Unsupported repair action.')
  if (Object.keys(e).some(k=>!['selected','appointmentId','expectedFingerprint','action','reason','evidence','schedule','participantId','userId'].includes(k))) throw new Error('Unsupported repair fields.')
 }
 return entries.map(e=>{const entry={...e};delete entry.selected;return entry})
}
export function validateRepairApproval(approval,plan,target,{now=Date.now()}={}) {
 if (approval.approved!==true || approval.planSha256!==planDigest(plan) || approval.environment!==target.environment || approval.projectRef!==target.projectRef || approval.organisationId!==target.organisationId
   || approval.reviewedBy!==plan.reviewedBy || !fresh(approval.approvedAt,now)) throw new Error('A recent explicit approval for this exact plan and target is required.')
 required(approval.recoveryReference,'Recovery reference');required(approval.reason,'Approval reason')
}
async function rpc(target,name,args,fetcher=fetch) {
 const key=required(process.env.SUPABASE_SERVICE_ROLE_KEY,'Server-side SUPABASE_SERVICE_ROLE_KEY')
 const response=await fetcher(`${target.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(60000)})
 if (!response.ok) {
  // Do not print response bodies, SQL detail, request bodies or credentials.
  let code='';try {code=(await response.json()).code || ''} catch { /* unavailable error metadata */ }
  throw new Error(`Calendar operation failed (${response.status}${/^[A-Z0-9]{5}$/.test(code)?`, ${code}`:''}). No success was verified; use the same batch identifier to recover an uncertain response.`)
 }
 return response.json()
}
async function ensureNewOutput(path) {
 const absolute=resolve(required(path,'Output file'))
 await access(dirname(absolute),2)
 try {await lstat(absolute)} catch(error) {if(error.code==='ENOENT') return;throw error}
 throw new Error('Choose a new output filename; existing evidence is never overwritten.')
}
async function readJson(path) { return JSON.parse(await readFile(resolve(required(path,'Input file')),'utf8')) }
async function output(path,data,text=false) { await writeFile(resolve(required(path,'Output file')),text?data:JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'}) }

export async function runCalendarReconciliation(argv,{fetcher=fetch}={}) {
 const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{input:{type:'string'},output:{type:'string'},plan:{type:'string'},approval:{type:'string'},environment:{type:'string'},'project-ref':{type:'string'},organisation:{type:'string'},url:{type:'string'},'as-of':{type:'string'},batch:{type:'string'},apply:{type:'boolean',default:false},help:{type:'boolean',default:false}}})
 const mode=positionals[0] || 'report'
 if (values.help) return 'Modes: report, snapshot, preview, apply, rollback, receipt. Every mode requires --output. report requires --input [--as-of]. snapshot requires an explicit target. preview/apply require --plan; apply additionally requires --apply --approval. rollback requires a recovery plan; defaults to preview.'
 if (positionals.length>1 || !['report','snapshot','preview','apply','rollback','receipt'].includes(mode)) throw new Error('Select report, snapshot, preview, apply, rollback or receipt.')
 await ensureNewOutput(values.output)
 // Reserve no network or write capability for report mode.
 if (mode==='report') {
  if (values.apply || values.approval) throw new Error('Report mode cannot apply changes.')
  const source=await readJson(values.input);const report=reconcileAppointmentInventory(source,{asOf:values['as-of']})
  await output(values.output,formatCalendarRepairReport(report),true)
  if (values.plan) {
   const target=validateRepairTarget({environment:values.environment,projectRef:values['project-ref'],organisationId:values.organisation,url:values.url || process.env.SUPABASE_URL})
   if (target.organisationId!==source.organisationId || source.environment!==target.environment || source.projectRef!==target.projectRef) throw new Error('Snapshot target does not match the requested draft plan.')
   await output(values.plan,draftCalendarRepairPlan(source,report,{...target,batchId:randomUUID()}))
  }
  return `Read-only report saved for ${report.summary.total} appointments (${report.summary.demo} demo).`
 }
 const target=validateRepairTarget({environment:values.environment,projectRef:values['project-ref'],organisationId:values.organisation,url:values.url || process.env.SUPABASE_URL})
 if (mode==='receipt') {
  if (values.apply || values.approval) throw new Error('Receipt retrieval cannot apply changes.')
  identity(values.batch,'Batch')
  const receipt=await rpc(target,'get_calendar_repair_receipt',{p_organisation_id:target.organisationId,p_batch_id:values.batch},fetcher)
  if (receipt.verified!==true || receipt.batchId!==values.batch || receipt.organisationId!==target.organisationId) throw new Error('A verified repair receipt was not found.')
  await output(values.output,receipt)
  return `Verified existing repair receipt saved. Current state: ${receipt.current===true?'unchanged':'changed since repair'}.`
 }
 if (mode==='snapshot') {
  if (values.apply || values.approval) throw new Error('Snapshot export cannot apply changes.')
  const snapshot=await rpc(target,'export_calendar_repair_snapshot',{p_organisation_id:target.organisationId},fetcher)
  if (snapshot.organisationId!==target.organisationId || snapshot.complete!==true || snapshot.version!==1) throw new Error('A complete scoped snapshot was not verified.')
  await output(values.output,{...snapshot,environment:target.environment,projectRef:target.projectRef})
  return `Read-only snapshot saved for the selected ${target.environment} organisation.`
 }
 const plan=await readJson(values.plan)
 const write=mode==='apply' || (mode==='rollback' && values.apply)
 if ((mode==='apply' && !values.apply) || (mode==='preview' && values.apply)) throw new Error('Applying requires both apply mode and --apply; preview cannot write.')
 let args,name
 if (mode==='rollback') {
  if (plan.version!==1 || plan.environment!==target.environment || plan.projectRef!==target.projectRef || plan.organisationId!==target.organisationId) throw new Error('Recovery plan target does not match.')
  identity(plan.batchId,'Recovery batch');identity(plan.originalBatchId,'Original batch');identity(plan.reviewedBy,'Reviewer');required(plan.reason,'Recovery reason')
  name='rollback_calendar_repair';args={p_organisation_id:target.organisationId,p_original_batch_id:plan.originalBatchId,p_batch_id:plan.batchId,p_reviewed_by:plan.reviewedBy,p_reason:plan.reason,p_preview:!write}
 } else {
  const entries=validateRepairPlan(plan,target)
  name='repair_calendar_appointments';args={p_organisation_id:target.organisationId,p_batch_id:plan.batchId,p_reviewed_by:plan.reviewedBy,p_reason:plan.reason,p_entries:entries,p_preview:!write}
 }
 if (write) validateRepairApproval(await readJson(values.approval),plan,target)
 const receipt=await rpc(target,name,args,fetcher)
 if (receipt.verified!==true || receipt.preview!==!write || receipt.batchId!==plan.batchId || receipt.organisationId!==target.organisationId) throw new Error('The operation receipt was not verified. Preserve the plan and retry with its original batch identifier.')
 await output(values.output,receipt)
 return `${write?'Applied':'Previewed'} ${mode==='rollback'?'recovery':'reviewed repairs'}; verified receipt saved.${receipt.replayed?' Existing batch was replayed.':''}${receipt.current===false?' Records have changed since that batch; review a fresh snapshot.':''}`
}
if (import.meta.url===pathToFileURL(process.argv[1] || '').href) {
 try { console.log(await runCalendarReconciliation(process.argv.slice(2))) } catch(error) { console.error(error.message);process.exitCode=1 }
}
