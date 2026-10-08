import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { STORES } from '../../scripts/document-persistence-reconciliation.mjs'
import { buildDocumentPersistenceMonitoringReport, createDocumentPersistenceMonitorResponse } from './documentPersistenceMonitoringService.js'
import { createDocumentTelemetryResponse, validateDocumentTelemetry, readDocumentTelemetryBody } from './documentUploadTelemetryApi.js'
import { DOCUMENT_MONITOR_SURFACES, normalizeDocumentUploadTelemetry } from '../../src/lib/documentUploadObservability.js'

const project='isdowlnollckzvltkasn', now=Date.now(), timestamp=new Date(now).toISOString()
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function snapshot() {return {version:1,projectRef:project,capturedAt:timestamp,sourceCounts:STORES.map(([source])=>({source,rows:0})),references:[],objects:[],contexts:[],documents:[],requirements:[],legacyLinks:[]}}
const row=(surface,overrides={})=>({surface,attempts:1,succeeded:1,recovered:0,failed:0,unconfirmed:0,attention:0,stalled:0,permission_errors:0,network_errors:0,access_errors:0,...overrides})
const outcomes=(rows=[])=>({capturedAt:timestamp,windowMinutes:60,rows})
const evaluate=(s=snapshot(),t=outcomes(),previous=null)=>buildDocumentPersistenceMonitoringReport({snapshot:s,telemetry:t,previous,now})

test('all audited stores and upload areas are covered, but no traffic never means healthy',()=>{
 const report=evaluate();assert.equal(report.summary.stores,STORES.length);assert.equal(report.summary.requiredSurfaces,27);assert.equal(report.coverageGaps.length,27);assert.equal(report.status,'incomplete');assert.equal(report.snapshotComplete,true)
 const observed=evaluate(snapshot(),outcomes(DOCUMENT_MONITOR_SURFACES.filter(s=>s!=='unknown').map(s=>row(s))))
 assert.equal(observed.status,'healthy');assert.equal(observed.coverageGaps.length,0)
})
test('freshness, malformed summaries and missing store coverage fail closed',()=>{
 for(const field of ['sourceCounts','references','objects']) {const s=snapshot();delete s[field];assert.throws(()=>evaluate(s))}
 const s=snapshot();s.sourceCounts.pop();assert.throws(()=>evaluate(s),/Incomplete snapshot/)
 assert.throws(()=>evaluate({...snapshot(),capturedAt:'2020-01-01T00:00:00Z'}),/fresh/)
 assert.throws(()=>evaluate({...snapshot(),capturedAt:new Date(now+1).toISOString()}),/fresh/)
 assert.throws(()=>evaluate(snapshot(),outcomes([row('buyer'),row('buyer')])) ,/Invalid/)
 assert.throws(()=>evaluate(snapshot(),outcomes([row('buyer',{attempts:-1})])),/Invalid/)
 assert.throws(()=>evaluate(snapshot(),outcomes([row('buyer',{failed:2})])),/Invalid/)
 assert.throws(()=>evaluate(snapshot(),{...outcomes(),capturedAt:'2020-01-01'}),/Fresh/)
})
test('new, recurring and resolved findings use a same-project recent complete baseline',()=>{
 const s=snapshot();s.references.push({source:'documents',id:id(1),field:'file_path',bucket:'documents',path:'customer-private/file.pdf?token=secret'})
 const first=evaluate(s);assert.equal(first.status,'attention') // token-bearing durable path is invalid, still review-only
 s.references[0].path='customer-private/file.pdf'
 const missing=evaluate(s);assert.equal(missing.status,'critical');assert.equal(missing.changes.newlyDetected.length,1);assert.doesNotMatch(JSON.stringify(missing),/customer-private|token=secret/)
 const recurring=evaluate(s,outcomes(),missing);assert.equal(recurring.changes.recurring.length,1);assert.equal(recurring.changes.newlyDetected.length,0)
 const resolved=evaluate(snapshot(),outcomes(),missing);assert.equal(resolved.changes.resolved.length,1)
 for(const previous of [{...missing,projectRef:'a'.repeat(20)},{...missing,checkedAt:'2020-01-01'},{...missing,status:'unavailable',snapshotComplete:false}])assert.equal(evaluate(snapshot(),outcomes(),previous).changes.resolved.length,0)
})
test('unconfirmed saves, stalled attempts, repeated failures and permission denial produce actionable alerts',()=>{
 const r=evaluate(snapshot(),outcomes([row('buyer',{attempts:10,succeeded:4,failed:3,unconfirmed:1,attention:1,stalled:2,permission_errors:1})]))
 assert.equal(r.status,'critical')
 const access=evaluate(snapshot(),outcomes([row('unknown',{attempts:1,succeeded:0,access_errors:1})]));assert.ok(access.alerts.some(a=>a.code==='document_access_failed'));assert.equal(access.summary.observedSurfaces,0)
 for(const code of ['save_unconfirmed','upload_stalled','upload_failure_rate','upload_permission_denied','upload_follow_up_pending'])assert.ok(r.alerts.some(a=>a.code===code))
})
test('anonymous same-origin collector validates strict safe fields, durable dedup and rate limits',async()=>{
 const env={DOCUMENT_PERSISTENCE_MONITOR_ENABLED:'true',ARCH9_APP_URL:'https://app.arch9.co.za',SUPABASE_SERVICE_ROLE_KEY:'server-secret'}
 const body=normalizeDocumentUploadTelemetry({surface:'seller',outcome:'failed',stage:'saving'})
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:'recorded'}}}
 const options={method:'POST',headers:{origin:'https://app.arch9.co.za','x-vercel-forwarded-for':'192.0.2.1'},body,env,client}
 assert.equal((await createDocumentTelemetryResponse(options)).status,202)
 assert.equal(calls[0].args.p_rate_key.length,64);assert.doesNotMatch(JSON.stringify(calls),/192\.0\.2\.1|server-secret/)
 for(const origin of ['https://evil.test','null',undefined])assert.equal((await createDocumentTelemetryResponse({...options,headers:{origin}})).status,403)
 assert.equal((await createDocumentTelemetryResponse({...options,body:{...body,portalToken:'secret'}})).status,400)
 assert.equal((await createDocumentTelemetryResponse({...options,method:'GET'})).status,405)
 assert.equal((await createDocumentTelemetryResponse({...options,env:{...env,DOCUMENT_PERSISTENCE_MONITOR_ENABLED:'false'}})).status,503)
 assert.equal((await createDocumentTelemetryResponse({...options,client:{rpc:async()=>({data:'duplicate'})}})).status,202)
 assert.equal((await createDocumentTelemetryResponse({...options,client:{rpc:async()=>({data:'rate_limited'})}})).status,429)
 assert.equal((await createDocumentTelemetryResponse({...options,client:{rpc:async()=>({error:new Error('secret db details')})}})).status,503)
 assert.throws(()=>validateDocumentTelemetry({...body,eventId:'bad'}))
 await assert.rejects(readDocumentTelemetryBody({body:'x'.repeat(2049)}))
})
function cronClient({ failRead = false, failWrite = false } = {}) {
  const writes = [], calls = []
  const read = { maybeSingle: async () => ({ data: null }) }
  const table = {
    select: () => ({ eq: () => ({ order: () => ({ limit: () => read }) }) }),
    upsert: async value => { writes.push(value); return { error: failWrite ? {} : null } },
  }
  return {
    writes, calls, from: () => table,
    rpc: async name => {
      calls.push(name)
      return failRead ? { error: { message: 'private details' } } : { data: name === 'document_persistence_monitor_snapshot' ? snapshot() : outcomes() }
    },
  }
}
test('hourly API is off by default, authenticates, pins its target and never resolves issues on failed reads',async()=>{
 const env={CRON_SECRET:'cron-secret',SUPABASE_URL:`https://${project}.supabase.co`,DOCUMENT_PERSISTENCE_MONITOR_PROJECT_REF:project,DOCUMENT_PERSISTENCE_MONITOR_ENABLED:'true'}
 const db=cronClient();const options={method:'GET',headers:{authorization:'Bearer cron-secret'},env,client:db,now}
 assert.equal((await createDocumentPersistenceMonitorResponse({...options,headers:{}})).status,401);assert.equal(db.calls.length,0)
 assert.equal((await createDocumentPersistenceMonitorResponse({...options,env:{...env,DOCUMENT_PERSISTENCE_MONITOR_ENABLED:undefined}})).body.status,'disabled');assert.equal(db.calls.length,0)
 assert.equal((await createDocumentPersistenceMonitorResponse({...options,env:{...env,DOCUMENT_PERSISTENCE_MONITOR_PROJECT_REF:'a'.repeat(20)}})).status,503);assert.equal(db.calls.length,0)
 assert.equal((await createDocumentPersistenceMonitorResponse(options)).body.status,'incomplete');assert.equal(db.writes.length,1);assert.equal(db.writes[0].report.snapshotComplete,true)
 const broken=cronClient({failRead:true});assert.equal((await createDocumentPersistenceMonitorResponse({...options,client:broken})).status,503);assert.equal(broken.writes[0].status,'unavailable');assert.deepEqual(broken.writes[0].report.changes.resolved,[])
 assert.equal((await createDocumentPersistenceMonitorResponse({...options,client:cronClient({failWrite:true})})).status,503)
})

async function database(){
 const db=new PGlite()
 const types={id:'uuid',lead_id:'uuid',development_id:'uuid',organisation_id:'uuid',transaction_id:'uuid',private_listing_id:'uuid',canonical_requirement_instance_id:'uuid',requirement_id:'uuid',promoted_document_id:'uuid',promoted_transaction_id:'uuid',context_id:'uuid',listing_id:'uuid',satisfied_by_document_id:'uuid',uploaded_document_id:'uuid',requested_document_id:'uuid',status:'text',context_type:'text',updated_at:'timestamptz',source_context_json:'jsonb',metadata:'jsonb',raw_enquiry_payload:'jsonb',documents_json:'jsonb',contracts_json:'jsonb',contract_signature_json:'jsonb',onboarding_documents_json:'jsonb',signature_asset_fingerprints_json:'jsonb'}
 for(const [,fields] of STORES)for(const [p,b]of fields){types[p]='text';if(b)types[b]='text'}
 const tables=[...new Set([...STORES.map(([s])=>s),'transactions','private_listings','developments','document_requirement_instances','transaction_required_documents','transaction_document_requirements','document_requests','private_listing_document_requirements'])]
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.objects(id uuid primary key,bucket_id text,name text,created_at timestamptz,updated_at timestamptz,version text);')
 for(const table of tables)await db.exec(`create table public.${table}(${Object.entries(types).map(([f,t])=>`${f} ${t}`).join(',')});`)
 await db.exec('grant usage on schema public,storage to service_role;grant select on all tables in schema public,storage to service_role;')
 await db.exec(await readFile(new URL('../../../supabase/migrations/20261008201428_document_persistence_operational_monitoring.sql',import.meta.url),'utf8'))
 return db
}
const args=(eventId,attemptId,outcome='succeeded',rateKey='a'.repeat(64))=>[eventId,attemptId,'buyer','persistence',outcome,'none',rateKey]
const insert=(db,params)=>db.query('select public.record_document_upload_outcome($1::uuid,$2::uuid,$3,$4,$5,$6,$7) as outcome',params)
test('actual PostgreSQL migration restricts every table/function, records deduped outcomes and reads all stores',async()=>{
 const db=await database()
 try{
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`)
   await assert.rejects(db.query('select * from document_upload_outcomes'),/permission denied/)
   await assert.rejects(db.query('insert into document_persistence_monitor_runs(run_key,project_ref,status,report)values($1,$2,$3,$4)',['x',project,'healthy',{}]),/permission denied/)
   for(const call of ['document_upload_outcome_summary()',`document_persistence_monitor_snapshot('${project}')`,'prune_document_persistence_monitor_history()'])await assert.rejects(db.query(`select public.${call}`),/permission denied/)
   await assert.rejects(insert(db,args(id(1),id(2))),/permission denied/)
   await db.exec('reset role')
  }
  await db.exec('set role service_role')
  assert.equal((await insert(db,args(id(1),id(2)))).rows[0].outcome,'recorded')
  assert.equal((await insert(db,args(id(1),id(2)))).rows[0].outcome,'duplicate')
  await insert(db,args(id(3),id(2),'started')) // late arrival must not overwrite success
  const summary=(await db.query('select public.document_upload_outcome_summary() as value')).rows[0].value
  assert.equal(summary.rows[0].attempts,1);assert.equal(summary.rows[0].succeeded,1)
  const s=(await db.query('select public.document_persistence_monitor_snapshot($1) as value',[project])).rows[0].value
  assert.equal(s.sourceCounts.length,STORES.length);assert.equal(s.projectRef,project)
  const catalog=(await db.query("select prosecdef from pg_proc where proname like '%document%monitor%' or proname='record_document_upload_outcome'")).rows
  assert.ok(catalog.every(r=>r.prosecdef===false))
  await assert.rejects(insert(db,[id(4),id(5),'private-portal-token','saving','failed','none','a'.repeat(64)]),/check constraint/)
 } finally{await db.close()}
})
test('actual durable rate budget, final-attempt summary, retention and stalled detection',async()=>{
 const db=await database()
 try{
  for(let n=1;n<=120;n++)assert.equal((await insert(db,args(id(n),id(200+n),'failed'))).rows[0].outcome,'recorded')
  assert.equal((await insert(db,args(id(121),id(400)))).rows[0].outcome,'rate_limited')
  await insert(db,args(id(500),id(600),'started','b'.repeat(64)))
  await db.query("update document_upload_outcomes set received_at=now()-interval '20 minutes' where event_id=$1",[id(500)])
  assert.equal((await db.query('select public.document_upload_outcome_summary() as value')).rows[0].value.rows[0].stalled,1)
  await insert(db,args(id(501),id(600),'recovered','b'.repeat(64)))
  const summary=(await db.query('select public.document_upload_outcome_summary() as value')).rows[0].value
  assert.equal(summary.rows[0].stalled,0);assert.equal(summary.rows[0].recovered,1)
  await db.query("update document_upload_outcomes set received_at=now()-interval '8 days' where event_id=$1",[id(500)])
  await db.query("insert into document_persistence_monitor_runs(run_key,project_ref,checked_at,status,report)values('old',$1,now()-interval '91 days','unavailable','{}')",[project])
  await db.query('select public.prune_document_persistence_monitor_history()')
  assert.equal((await db.query('select count(*)::int as n from document_persistence_monitor_runs')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int as n from document_upload_outcomes where event_id=$1',[id(500)])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int as n from document_upload_outcomes')).rows[0].n,121)
 }finally{await db.close()}
})

test('monitor CLI exports only read-only queries, refuses stale/overwritten inputs and does not create repair SQL', async()=>{
 const { mkdtemp, writeFile, readdir, rm }=await import('node:fs/promises')
 const { tmpdir }=await import('node:os')
 const path=await import('node:path')
 const { main }=await import('../../scripts/document-persistence-reconciliation.mjs')
 const directory=await mkdtemp(path.join(tmpdir(),'arch9-document-monitor-'))
 const previousExit=process.exitCode
 try{
  const queryFile=path.join(directory,'read.sql')
  await main(['--monitor',`--project=${project}`,`--export-sql=${queryFile}`])
  const query=await readFile(queryFile,'utf8')
  assert.match(query,/begin read only;/);assert.match(query,/select public.document_upload_outcome_summary\(\)/)
  assert.doesNotMatch(query,/insert into|update public|delete from/i)
  const sFile=path.join(directory,'snapshot.json'),tFile=path.join(directory,'outcomes.json'),output=path.join(directory,'report')
  await writeFile(sFile,JSON.stringify({...snapshot(),capturedAt:new Date().toISOString()}))
  await writeFile(tFile,JSON.stringify({...outcomes(),capturedAt:new Date().toISOString()}))
  await main(['--monitor',`--project=${project}`,`--snapshot=${sFile}`,`--outcomes=${tFile}`,`--output=${output}`])
  const r=JSON.parse(await readFile(path.join(output,'monitoring.json'),'utf8'))
  assert.equal(r.status,'incomplete');assert.deepEqual(await readdir(output),['monitoring.json'])
  assert.equal(process.exitCode,2)
  await assert.rejects(main(['--monitor',`--project=${project}`,`--snapshot=${sFile}`,`--outcomes=${tFile}`,`--previous=${path.join(output,'monitoring.json')}`,`--output=${output}`]),/overwrite/)
  await writeFile(sFile,JSON.stringify({...snapshot(),capturedAt:'2020-01-01'}))
  await assert.rejects(main(['--monitor',`--project=${project}`,`--snapshot=${sFile}`,`--outcomes=${tFile}`,`--output=${output}`]),/fresh/)
 }finally{process.exitCode=previousExit;await rm(directory,{recursive:true,force:true})}
})
