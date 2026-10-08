import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { STORES, buildAuditSql, reconcileSnapshot, resolveReference, buildRepairSql, main } from './document-persistence-reconciliation.mjs'

const project = 'isdowlnollckzvltkasn'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const hash = 'a'.repeat(32)
function fixture() {
  const path = `developments/${id(2)}/marketing/file.pdf`
  return { version:1, projectRef:project, capturedAt:'2026-10-08T00:00:00Z',
    sourceCounts:STORES.map(([source])=>({source,rows:0})),
    references:[{source:'development_documents',id:id(1),field:'storage_path',path:null}, {source:'development_documents',id:id(1),development_id:id(2),field:'file_url',bucket:'documents',path:`https://${project}.supabase.co/storage/v1/object/sign/documents/${path}`,before:{storage_bucket:null,storage_path:null},row_fingerprint:hash,immutable_fingerprint:hash}],
    objects:[{id:id(3),bucket:'documents',path,fingerprint:hash}], contexts:[{type:'development',id:id(2),organisation_id:id(4)}], documents:[],requirements:[],legacyLinks:[] }
}

test('signed URLs resolve to exact durable paths without carrying access tokens',()=>{
  const ref=fixture().references[1]
  assert.deepEqual(resolveReference({...ref,path:ref.path+'?token=secret'},project),{state:'resolved',bucket:'documents',path:fixture().objects[0].path})
  assert.equal(JSON.stringify(reconcileSnapshot(fixture())).includes('token='),false)
})
test('foreign projects, traversal, malformed escapes and credentials cannot propose repairs',()=>{
  for(const url of ['https://other.supabase.co/storage/v1/object/sign/documents/a.pdf',`https://${project}.supabase.co.evil.test/storage/v1/object/sign/documents/a.pdf`,`https://user@${project}.supabase.co/storage/v1/object/sign/documents/a.pdf`,`https://${project}.supabase.co/storage/v1/object/sign/documents/%2e%2e%2Fa.pdf`,`https://${project}.supabase.co/storage/v1/object/sign/documents/%ZZ.pdf`]) {
    const s=fixture();s.references[1].path=url;assert.equal(reconcileSnapshot(s).repairs.length,0)
  }
})
test('one exact same-development object produces metadata-only repair',()=>{
  const r=reconcileSnapshot(fixture());assert.equal(r.repairs.length,1);assert.equal(r.mutatedData,false);assert.equal(r.summary.findings.unreferenced_object_review,undefined)
})
test('missing object is never fabricated or recovered by matching a filename in another bucket',()=>{
  const s=fixture();s.objects[0].bucket='legal-templates';const r=reconcileSnapshot(s);assert.equal(r.repairs.length,0);assert.equal(r.summary.findings.missing_object,1);assert.equal(r.summary.findings.unreferenced_object_review,1)
})
test('wrong development prefix, missing ownership, ambiguous rows and conflicting bucket remain review-only',()=>{
  for(const change of [s=>s.references[1].development_id=id(9),s=>s.contexts=[],s=>s.references.push({...s.references[0]}),s=>s.references[1].before.storage_bucket='legal-templates']) { const s=fixture();change(s);assert.equal(reconcileSnapshot(s).repairs.length,0) }
})
test('placeholder rows and empty upload spaces are visible without being counted as lost files',()=>{
  const s=fixture();s.references=[{source:'transaction_attorney_closeout_documents',id:id(8),status:'missing',path:null}];s.objects=[]
  const r=reconcileSnapshot(s);assert.equal(r.findings.length,0);assert.equal(r.summary.referenceStates.no_path,1);assert.equal(r.summary.stores,STORES.length)
})
test('uploaded rows with missing required storage references require review',()=>{
  const s=fixture();s.references=[{source:'rental_application_documents',id:id(8),status:'uploaded',path:null}];s.objects=[]
  assert.equal(reconcileSnapshot(s).summary.findings.missing_storage_reference,1)
})
test('branding assets outside audited buckets are not reported as missing documents',()=>{
  const s=fixture();s.references=[{source:'document_packets',id:id(8),field:'logoUrl',bucket:'documents',path:`https://${project}.supabase.co/storage/v1/object/public/organisation-branding/logo.png`}];s.objects=[]
  const r=reconcileSnapshot(s);assert.equal(r.findings.length,0);assert.equal(r.summary.referenceStates.out_of_scope,1)
})
test('missing coverage prevents an apparently clean report',()=>{
  const s=fixture();s.sourceCounts.pop();assert.throws(()=>reconcileSnapshot(s),/Incomplete snapshot/)
})
test('historical references keep retained objects out of the unmatched review queue',()=>{
  const s=fixture();s.references=[{source:'document_packet_versions',id:id(8),field:'final_signed_file_path',bucket:'documents',path:s.objects[0].path}]
  assert.equal(reconcileSnapshot(s).summary.findings.unreferenced_object_review,undefined)
})
test('cross-transaction, missing records and conflicting canonical backlinks are explicit blockers',()=>{
  const s=fixture();s.documents=[{id:id(10),source:'documents',transaction_id:id(12),canonical_requirement_instance_id:id(14)}];s.requirements=[{id:id(13),context_type:'transaction',transaction_id:id(11),satisfied_by_document_id:id(10)}];s.legacyLinks=[{source:'document_requests',id:id(16),context_type:'transaction',context_id:id(11),document_id:id(99),canonical_id:id(13)}]
  const r=reconcileSnapshot(s);assert.equal(r.summary.findings.wrong_context_link,1);assert.equal(r.summary.findings.canonical_backlink_conflict,1);assert.equal(r.summary.findings.missing_document_record,1)
  assert.ok(r.repairs.every(item=>item.type==='restore_development_storage_reference'))
})
test('CLI rejects apply and accidental target mismatch before producing a packet',async()=>{
  await assert.rejects(main(['--apply']),/never applies repairs/)
  assert.throws(()=>buildAuditSql("bad'; delete from documents;"),/project reference/)
})

async function database() {
  const db=new PGlite()
  const fieldTypes={id:'uuid',lead_id:'uuid',development_id:'uuid',organisation_id:'uuid',transaction_id:'uuid',private_listing_id:'uuid',canonical_requirement_instance_id:'uuid',requirement_id:'uuid',promoted_document_id:'uuid',promoted_transaction_id:'uuid',context_id:'uuid',listing_id:'uuid',satisfied_by_document_id:'uuid',uploaded_document_id:'uuid',requested_document_id:'uuid',status:'text',context_type:'text',updated_at:'timestamptz',source_context_json:'jsonb',metadata:'jsonb',raw_enquiry_payload:'jsonb',documents_json:'jsonb',contracts_json:'jsonb',contract_signature_json:'jsonb',onboarding_documents_json:'jsonb',signature_asset_fingerprints_json:'jsonb'}
  for(const [,fields] of STORES) for(const [p,b] of fields) {fieldTypes[p]='text';if(b)fieldTypes[b]='text'}
  const tables=[...new Set([...STORES.map(([s])=>s),'transactions','private_listings','developments','document_requirement_instances','transaction_required_documents','transaction_document_requirements','document_requests','private_listing_document_requirements'])]
  await db.exec('create schema storage; create table storage.objects(id uuid primary key,bucket_id text,name text,created_at timestamptz,updated_at timestamptz,version text);')
  for(const table of tables) await db.exec(`create table public.${table}(${Object.entries(fieldTypes).map(([f,t])=>`${f} ${t}`).join(',')});`)
  await db.query('insert into developments(id,organisation_id) values ($1,$2)',[id(2),id(4)])
  const s=fixture();await db.query('insert into development_documents(id,development_id,file_url,status) values ($1,$2,$3,$4)',[id(1),id(2),s.references[1].path+'?token=secret','approved'])
  await db.query('insert into storage.objects(id,bucket_id,name,version) values ($1,$2,$3,$4)',[id(3),'documents',s.objects[0].path,'v1'])
  return db
}
test('real Postgres snapshot preserves zero-row coverage and strips signed tokens',async()=>{
  const db=await database()
  try { const s=(await db.query(buildAuditSql(project))).rows[0].snapshot;assert.equal(s.sourceCounts.length,STORES.length);assert.equal(JSON.stringify(s).includes('token='),false);assert.equal(reconcileSnapshot(s).repairs.length,1) } finally {await db.close()}
})
test('real Postgres traverses nested recruitment buckets and packet history',async()=>{
  const db=await database()
  try {
    await db.query('insert into recruitment_leads(id,documents_json) values ($1,$2)',[id(20),JSON.stringify([{path:'org/lead/file.pdf'}])])
    await db.query('insert into document_packets(id,source_context_json) values ($1,$2)',[id(21),JSON.stringify({nested:{manual_signed_file_path:'packets/signed.pdf',manual_signed_file_bucket:'signed-documents'}})])
    const s=(await db.query(buildAuditSql(project))).rows[0].snapshot
    assert.equal(s.references.find(r=>r.source==='recruitment_leads').bucket,'recruitment-documents')
    assert.equal(s.references.find(r=>r.source==='document_packets').bucket,'signed-documents')
  }finally{await db.close()}
})
test('real Postgres excludes browser routes, inline signature data and duplicate nested references',async()=>{
  const db=await database()
  try {
    await db.query('insert into document_packets(id,source_context_json) values ($1,$2)',[id(21),JSON.stringify({a:{path:'documents/history.pdf'},b:{path:'documents/history.pdf'},pagePath:'/listing/example',signatureAssetUrl:'data:image/png;base64,SECRET'})])
    const s=(await db.query(buildAuditSql(project))).rows[0].snapshot
    assert.equal(s.references.filter(r=>r.source==='document_packets').length,1)
    assert.equal(JSON.stringify(s).includes('SECRET'),false)
  }finally{await db.close()}
})
test('real Postgres repair and retry preserve evidence and approval status; rollback restores exact prior references',async()=>{
  const db=await database()
  try {
    const s=(await db.query(buildAuditSql(project))).rows[0].snapshot;const report=reconcileSnapshot(s);const sql=buildRepairSql(report)
    await db.exec(sql);await db.exec(sql)
    assert.equal((await db.query('select status from development_documents')).rows[0].status,'approved')
    assert.equal(reconcileSnapshot((await db.query(buildAuditSql(project))).rows[0].snapshot).repairs.length,0)
    await db.exec(buildRepairSql(report,{rollback:true}));await db.exec(buildRepairSql(report,{rollback:true}))
    assert.equal((await db.query('select storage_path from development_documents')).rows[0].storage_path,null)
  }finally{await db.close()}
})
test('real Postgres rejects changed document, object and tenant before repair',async()=>{
  for(const change of ["update development_documents set status='rejected'","update storage.objects set version='v2'",`update developments set organisation_id='${id(90)}'`]) {
    const db=await database()
    try{const report=reconcileSnapshot((await db.query(buildAuditSql(project))).rows[0].snapshot);await db.exec(change);await assert.rejects(db.exec(buildRepairSql(report)));await db.exec('rollback');assert.equal((await db.query('select storage_path from development_documents')).rows[0].storage_path,null)}finally{await db.close()}
  }
})
test('real Postgres refuses rollback after subsequent evidence/status change',async()=>{
  const db=await database()
  try{const report=reconcileSnapshot((await db.query(buildAuditSql(project))).rows[0].snapshot);await db.exec(buildRepairSql(report));await db.exec("update development_documents set status='rejected'");await assert.rejects(db.exec(buildRepairSql(report,{rollback:true})),/changed after repair/);await db.exec('rollback');assert.notEqual((await db.query('select storage_path from development_documents')).rows[0].storage_path,null)}finally{await db.close()}
})
test('real Postgres rolls back the entire batch if a later document changed since review',async()=>{
  const db=await database()
  try{
    const p=`developments/${id(2)}/marketing/second.pdf`
    await db.query('insert into development_documents(id,development_id,file_url,status) values ($1,$2,$3,$4)',[id(30),id(2),`https://${project}.supabase.co/storage/v1/object/sign/documents/${p}`,'approved'])
    await db.query('insert into storage.objects(id,bucket_id,name,version) values ($1,$2,$3,$4)',[id(31),'documents',p,'v1'])
    const r=reconcileSnapshot((await db.query(buildAuditSql(project))).rows[0].snapshot);r.repairs.sort((a,b)=>a.id.localeCompare(b.id));assert.equal(r.repairs.length,2)
    await db.query('update development_documents set status=$1 where id=$2',['rejected',id(30)])
    await assert.rejects(db.exec(buildRepairSql(r)),/changed since review/);await db.exec('rollback')
    assert.ok((await db.query('select storage_path from development_documents')).rows.every(r=>r.storage_path===null))
  }finally{await db.close()}
})
