import { createHash } from 'node:crypto'

// Explicit stores, including history. A missing table fails the whole audit.
export const STORES = [
  ['documents', [['file_path', 'file_bucket', 'documents']]],
  ['private_listing_documents', [['storage_path', null, 'documents'], ['file_url', null, 'documents']]],
  ['development_documents', [['storage_path', 'storage_bucket', 'documents'], ['file_url', 'storage_bucket', 'documents']]],
  ['commercial_documents', [['file_path', 'file_bucket', 'documents']]],
  ['rental_application_documents', [['storage_path', 'storage_bucket', 'rental-application-documents']]],
  ['rental_landlord_onboarding_documents', [['storage_path', null, 'rental-landlord-onboarding']]],
  ['transaction_attorney_closeout_documents', [['file_path', null, 'documents']]],
  ['transaction_bond_closeout_documents', [['file_path', null, 'documents']]],
  ['bond_wet_ink_uploads', [['file_path', null, 'bond-signed-applications']]],
  ['partner_portal_uploads', [['storage_path', null, 'documents']]],
  ['bond_partner_portal_documents', [['storage_path', null, 'documents']]],
  ['organisation_fic_policies', [['storage_path', null, 'fic-compliance']]],
  ['buyer_profile_documents', [['storage_path', 'storage_bucket', 'documents'], ['file_url', 'storage_bucket', 'documents']]],
  ['matter_financial_documents', [['storage_path', 'storage_bucket', 'documents']]],
  ['document_packet_templates', [['template_storage_path', 'template_storage_bucket', 'legal-templates']]],
  ['document_packet_template_versions', [['storage_path', 'storage_bucket', 'legal-templates']]],
  ['document_packet_versions', [['rendered_file_path', 'rendered_file_bucket', 'documents'], ['final_signed_file_path', 'final_signed_file_bucket', 'documents']]],
  ['document_signing_fields', [['signature_asset_path', null, 'documents']]],
  ['document_generation_runs', [['output_storage_path', 'output_storage_bucket', 'documents']]],
  ['legal_final_artifact_evidence', [['path', 'bucket', 'documents']]],
  ['document_packets', []], ['leads', []], ['recruitment_leads', []],
  // Other owners may use a document bucket: keep them out of orphan queues.
  ['listing_media', [['storage_path', 'storage_bucket', 'documents']]],
  ['listing_media_variants', [['storage_path', 'storage_bucket', 'documents']]],
  ['transaction_financial_records', [['invoice_file_path', null, 'documents']]],
  ['rental_lease_version_documents', [['document_link', null, 'documents']]],
]
const JSON_FIELDS = [
  ['document_packets', 'source_context_json', 'documents'],
  ['documents', 'metadata', 'documents'],
  ['leads', 'raw_enquiry_payload', 'documents'],
  ['recruitment_leads', 'documents_json', 'recruitment-documents'],
  ['recruitment_leads', 'contracts_json', 'recruitment-contracts'],
  ['recruitment_leads', 'contract_signature_json', 'recruitment-signed-contracts'],
  ['recruitment_leads', 'onboarding_documents_json', 'recruitment-onboarding-documents'],
  ['legal_final_artifact_evidence', 'signature_asset_fingerprints_json', 'documents'],
]
const BUCKETS = ['documents', 'legal-templates', 'rental-application-documents', 'rental-landlord-onboarding', 'bond-signed-applications', 'fic-compliance', 'recruitment-documents', 'recruitment-contracts', 'recruitment-signed-contracts', 'recruitment-onboarding-documents', 'signed-documents']
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const aggregate = name => `(select coalesce(jsonb_agg(${name}), '[]'::jsonb) from ${name})`
const pick = (alias, fields) => `jsonb_build_object(${fields.flatMap(field => [quote(field), `${alias}->${quote(field)}`]).join(', ')})`

export function buildAuditSql(projectRef) {
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('An explicit Supabase project reference is required.')
  const ownership = {
    documents:['transaction_id','canonical_requirement_instance_id','status'],
    private_listing_documents:['private_listing_id','canonical_requirement_instance_id','requirement_id','promoted_document_id','promoted_transaction_id','status'],
    development_documents:['development_id'],
    commercial_documents:['status'], rental_application_documents:['status'], rental_landlord_onboarding_documents:['status'],
    transaction_attorney_closeout_documents:['status'], transaction_bond_closeout_documents:['status'], bond_wet_ink_uploads:['status'],
  }
  const roots = STORES.map(([table,items]) => {
    const fields = [...new Set([table === 'leads' ? 'lead_id' : 'id', ...(ownership[table] || []), ...items.flatMap(([p,b])=>[p,b].filter(Boolean))])]
    const hashes = table === 'development_documents' ? `, '_audit_row_fingerprint', md5(to_jsonb(t)::text), '_audit_immutable_fingerprint', md5((to_jsonb(t) - array['storage_bucket','storage_path','updated_at'])::text)` : ''
    return `select ${quote(table)} as source, jsonb_build_object(${fields.flatMap(f=>[quote(f),`t.${f}`]).join(',')}${hashes}) as row from public.${table} t`
  }).join('\nunion all\n')
  const refs = STORES.flatMap(([table, fields]) => fields.map(([field, bucketField, bucket]) =>
    `select source, row, ${quote(field)} as field, coalesce(nullif(row->>${quote(bucketField || '_no_bucket')}, ''), ${quote(bucket)}) as bucket, regexp_replace(row->>${quote(field)}, '[?].*$', '') as path from roots where source=${quote(table)}${table.startsWith('listing_media') ? ` and row->>${quote(bucketField)} in (${BUCKETS.map(quote).join(',')})` : ''}`)).join('\nunion all\n')
  const jsonRoots = JSON_FIELDS.map(([table, field, bucket]) => `select ${quote(table)} as source, jsonb_build_object(${quote(table==='leads'?'lead_id':'id')}, t.${table==='leads'?'lead_id':'id'}) as row, ${quote(field)} as field, ${quote(bucket)} as bucket, t.${field} as value from public.${table} t`).join('\nunion all\n')
  return `-- Read-only, uncapped, single-statement snapshot. No file contents or access tokens.
with roots as materialized (${roots}), direct_refs as (${refs}),
json_roots as (${jsonRoots}), refs as (
  select * from direct_refs
  union all
  select distinct j.source, j.row, j.field || '.' || child.key,
    coalesce(nullif(parent.value->>(case when child.key ~ '(Path|Url)$' then regexp_replace(child.key, '(Path|Url)$', 'Bucket') end), ''),
      nullif(parent.value->>(case when child.key ~ '_(path|url)$' then regexp_replace(child.key, '_(path|url)$', '_bucket') end), ''),
      nullif(parent.value->>'storageBucket',''), nullif(parent.value->>'fileBucket',''), nullif(parent.value->>'storage_bucket',''), nullif(parent.value->>'file_bucket',''), nullif(parent.value->>'bucket',''), case when lower(child.key) ~ '^template.*path$' then 'legal-templates' else j.bucket end),
    regexp_replace(child.value#>>'{}','[?].*$','') as path
  from json_roots j cross join lateral jsonb_path_query(j.value, 'strict $.** ? (@.type() == "object")') parent(value)
  cross join lateral jsonb_each(parent.value) child
  where jsonb_typeof(child.value)='string' and lower(child.key) ~ '(path|url|link)$'
    and child.value#>>'{}' <> ''
    and child.value#>>'{}' !~* '^data:'
    and (child.value#>>'{}' !~* '^https?://' or child.value#>>'{}' ~ '/storage/v1/object/')
    and (child.value#>>'{}' ~ '/' or lower(child.key) ~ '(storage|file|signature).*path$')
    and lower(child.key) not in ('pagepath','page_path','routepath','route_path')
), reference_rows as (
  select source, coalesce(row->>'id', row->>'lead_id') as id, field, bucket, path,
    row->>'status' as status, row->>'development_id' as development_id,
    row->>'_audit_row_fingerprint' as row_fingerprint, row->>'_audit_immutable_fingerprint' as immutable_fingerprint,
    ${pick('row', ['storage_bucket', 'storage_path'])} as before
  from refs
), source_counts as (select inventory.source, count(roots.source) as rows from (values ${STORES.map(([table])=>`(${quote(table)})`).join(',')}) inventory(source) left join roots using (source) group by inventory.source),
objects as (select id, bucket_id as bucket, name as path, created_at, updated_at, version,
  md5(to_jsonb(o)::text) as fingerprint from storage.objects o where bucket_id in (${BUCKETS.map(quote).join(',')})),
contexts as (
  select 'transaction' as type, id, organisation_id from public.transactions
  union all select 'private_listing', id, organisation_id from public.private_listings
  union all select 'development', id, organisation_id from public.developments
), documents as (
  select ${pick('row', ['id', 'transaction_id', 'private_listing_id', 'canonical_requirement_instance_id', 'requirement_id', 'promoted_document_id', 'promoted_transaction_id', 'status'])} || jsonb_build_object('source', source) as value
  from roots where source in ('documents','private_listing_documents')
), requirements as (
  select to_jsonb(r) - array['rejection_reason','waiver_reason'] as value from public.document_requirement_instances r
), legacy_links as (
  select 'transaction_required_documents' as source, id, transaction_id as context_id, 'transaction' as context_type, uploaded_document_id as document_id, canonical_requirement_instance_id as canonical_id, status from public.transaction_required_documents
  union all select 'transaction_document_requirements', id, transaction_id, 'transaction', uploaded_document_id, canonical_requirement_instance_id, status from public.transaction_document_requirements
  union all select 'document_requests', id, transaction_id, 'transaction', requested_document_id, canonical_requirement_instance_id, status from public.document_requests
  union all select 'private_listing_document_requirements', id, private_listing_id, 'private_listing', satisfied_by_document_id, canonical_requirement_instance_id, status from public.private_listing_document_requirements
)
select jsonb_build_object('version',1,'projectRef',${quote(projectRef)},'capturedAt',now(),
  'sourceCounts',${aggregate('source_counts')},'references',${aggregate('reference_rows')},
  'objects',${aggregate('objects')},'contexts',${aggregate('contexts')},
  'documents',(select coalesce(jsonb_agg(value),'[]'::jsonb) from documents),
  'requirements',(select coalesce(jsonb_agg(value),'[]'::jsonb) from requirements),
  'legacyLinks',${aggregate('legacy_links')}) as snapshot;
`
}

export function resolveReference(ref, projectRef) {
  if (!ref.path) return { state: 'no_path' }
  let bucket = ref.bucket, objectPath = ref.path
  if (/^https?:/i.test(objectPath)) {
    let url
    try { url = new URL(objectPath) } catch { return { state: 'invalid_reference' } }
    if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co` || url.port || url.username || url.password) return { state: 'external_reference' }
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/)
    if (!match) return { state: 'invalid_reference' }
    try { bucket = decodeURIComponent(match[1]); objectPath = decodeURIComponent(match[2]) } catch { return { state: 'invalid_reference' } }
  } else if (objectPath.includes('?') || objectPath.includes('#')) return { state: 'invalid_reference' }
  if (!bucket || !objectPath || objectPath.startsWith('/') || objectPath.split('/').some(part => !part || part === '.' || part === '..') || Array.from(objectPath).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 92)) return { state: 'invalid_reference' }
  return { state: 'resolved', bucket, path: objectPath }
}

export function reconcileSnapshot(snapshot) {
  if (snapshot.version !== 1 || !/^[a-z]{20}$/.test(snapshot.projectRef || '')) throw new Error('Invalid audit snapshot.')
  for (const field of ['references','objects','sourceCounts','contexts','documents','requirements','legacyLinks']) if (!Array.isArray(snapshot[field])) throw new Error(`Incomplete snapshot: ${field}.`)
  for (const [source] of STORES) if (!snapshot.sourceCounts.some(row => row.source === source)) throw new Error(`Incomplete snapshot: ${source}.`)
  const objects = new Map(snapshot.objects.map(o => [`${o.bucket}:${o.path}`, o]))
  const referenced = new Set(), findings = [], repairs = [], counts = {}
  const issue = (type, ref, detail = {}) => findings.push({ type, source: ref.source, id: ref.id, field: ref.field, ...detail })
  for (const ref of snapshot.references) {
    const resolved = resolveReference(ref, snapshot.projectRef)
    if (resolved.state === 'resolved' && !BUCKETS.includes(resolved.bucket)) { counts.out_of_scope = (counts.out_of_scope || 0) + 1; continue }
    counts[resolved.state] = (counts[resolved.state] || 0) + 1
    if (resolved.state === 'no_path') continue // Checklist placeholders and in-progress renders are not lost files.
    if (resolved.state !== 'resolved') { issue(resolved.state, ref); continue }
    const key = `${resolved.bucket}:${resolved.path}`
    referenced.add(key)
    const object = objects.get(key)
    if (!object) { issue('missing_object', ref, resolved); continue }
    if (ref.source === 'development_documents' && ref.field === 'file_url' && !ref.before?.storage_path) {
      const sameRecord = snapshot.references.filter(r => r.source === ref.source && r.id === ref.id && r.field === 'storage_path')
      const context = snapshot.contexts.find(c => c.type === 'development' && c.id === ref.development_id)
      if (sameRecord.length !== 1 || !context?.organisation_id || !resolved.path.startsWith(`developments/${ref.development_id}/`) || (ref.before?.storage_bucket && ref.before.storage_bucket !== resolved.bucket)) {
        issue('legacy_reference_needs_review', ref); continue
      }
      repairs.push({ type: 'restore_development_storage_reference', id: ref.id, developmentId: ref.development_id, organisationId: context.organisation_id, rowFingerprint: ref.row_fingerprint,
        immutableFingerprint: ref.immutable_fingerprint, objectId: object.id, objectFingerprint: object.fingerprint, before: ref.before, after: { storage_bucket: resolved.bucket, storage_path: resolved.path } })
    }
  }
  const mandatoryPathStores = new Set(['documents','commercial_documents','rental_application_documents','rental_landlord_onboarding_documents','bond_wet_ink_uploads','partner_portal_uploads','bond_partner_portal_documents','matter_financial_documents'])
  for (const ref of snapshot.references) if (!ref.path && mandatoryPathStores.has(ref.source) && ['uploaded','under_review','approved','completed','signed'].includes(ref.status)) issue('missing_storage_reference', ref)
  for (const object of snapshot.objects) if (!referenced.has(`${object.bucket}:${object.path}`)) findings.push({ type: 'unreferenced_object_review', objectId: object.id, bucket: object.bucket, path: object.path, automaticDeletionAllowed: false })
  const requirements = new Map(snapshot.requirements.map(r => [r.id, r]))
  const shared = new Map(snapshot.documents.filter(d => d.source === 'documents').map(d => [d.id, d]))
  const listing = new Map(snapshot.documents.filter(d => d.source === 'private_listing_documents').map(d => [d.id, d]))
  const contextId = r => r.context_type === 'private_listing' ? (r.listing_id || r.context_id) : (r.transaction_id || r.context_id)
  const check = (ref, documentId, canonicalId, type, id) => {
    const doc = type === 'private_listing' ? (listing.get(documentId) || shared.get(documentId)) : shared.get(documentId)
    if (documentId && !doc) { issue('missing_document_record', ref, { documentId }); return }
    if (doc && ((type === 'transaction' && doc.transaction_id !== id) || (type === 'private_listing' && doc.private_listing_id !== id))) issue('wrong_context_link', ref, { documentId })
    const canonical = canonicalId ? requirements.get(canonicalId) : null
    if (canonicalId && !canonical) issue('missing_requirement_record', ref, { canonicalId })
    if (canonical && (canonical.context_type !== type || contextId(canonical) !== id)) issue('wrong_requirement_context', ref, { canonicalId })
    if (doc && canonicalId && doc.canonical_requirement_instance_id !== canonicalId) issue('canonical_backlink_conflict', ref, { documentId, canonicalId, backlinkId: doc.canonical_requirement_instance_id || null })
  }
  for (const r of snapshot.requirements) if (r.satisfied_by_document_id) check({ source: 'document_requirement_instances', id: r.id }, r.satisfied_by_document_id, r.id, r.context_type, contextId(r))
  for (const link of snapshot.legacyLinks) if (link.document_id || link.canonical_id) check({ source: link.source, id: link.id }, link.document_id, link.canonical_id, link.context_type, link.context_id)
  for (const doc of snapshot.documents) if (doc.canonical_requirement_instance_id) {
    const r = requirements.get(doc.canonical_requirement_instance_id)
    if (!r) issue('missing_requirement_record', doc)
    else if ((doc.source === 'documents' && (r.context_type !== 'transaction' || contextId(r) !== doc.transaction_id)) || (doc.source === 'private_listing_documents' && (r.context_type !== 'private_listing' || contextId(r) !== doc.private_listing_id))) issue('wrong_document_requirement_context', doc)
  }
  const summary = { stores: snapshot.sourceCounts.length, sourceRows: snapshot.sourceCounts.reduce((n,r) => n + Number(r.rows),0), storageObjects: objects.size, references: snapshot.references.length, referenceStates: counts, repairCandidates: repairs.length,
    distinctMissingObjects: new Set(findings.filter(f=>f.type==='missing_object').map(f=>`${f.bucket}:${f.path}`)).size, findings: {} }
  for (const f of findings) summary.findings[f.type] = (summary.findings[f.type] || 0) + 1
  const report = { version: 1, projectRef: snapshot.projectRef, capturedAt: snapshot.capturedAt, readOnly: true, mutatedData: false, summary, sourceCounts: snapshot.sourceCounts, findings, repairs,
    limitations: ['Storage catalog presence does not verify file bytes or download permission.', 'Unreferenced objects require history/ownership review; no deletion or metadata creation is inferred.', 'Requirement conflicts require exact signed evidence and participant review; no filenames are matched.', 'Participant identity and signed content are not inferred from uploader roles. Branding, page routes, inline signatures and external links are outside the document bucket audit.'] }
  report.digest = createHash('sha256').update(JSON.stringify(report)).digest('hex')
  return report
}

export function buildRepairSql(report, { rollback = false } = {}) {
  const repairs = [...report.repairs].sort((a,b)=>a.id.localeCompare(b.id))
  const statements = repairs.map(r => {
    if (r.type !== 'restore_development_storage_reference' || !/^[a-f0-9]{32}$/.test(r.rowFingerprint || '') || !/^[a-f0-9]{32}$/.test(r.objectFingerprint || '') || !/^[a-f0-9]{32}$/.test(r.immutableFingerprint || '')) throw new Error('Unsupported or incomplete repair.')
    const target = rollback ? r.before : r.after
    return `do $repair$
declare d public.development_documents%rowtype;
begin
  select * into strict d from public.development_documents where id=${quote(r.id)}::uuid for update;
  perform 1 from public.developments where id=${quote(r.developmentId)}::uuid and organisation_id=${quote(r.organisationId)}::uuid for share;
  if not found or d.development_id is distinct from ${quote(r.developmentId)}::uuid then raise exception 'Development ownership changed; abort entire batch'; end if;
  ${rollback ? '' : `perform 1 from storage.objects o where id=${quote(r.objectId)}::uuid and bucket_id=${quote(r.after.storage_bucket)} and name=${quote(r.after.storage_path)} and md5(to_jsonb(o)::text)=${quote(r.objectFingerprint)} for share;
  if not found then raise exception 'Storage object changed or vanished; abort entire batch'; end if;`}
  if d.storage_bucket is not distinct from ${target.storage_bucket == null ? 'null' : quote(target.storage_bucket)} and d.storage_path is not distinct from ${target.storage_path == null ? 'null' : quote(target.storage_path)} then return; end if;
  ${rollback ? `if d.storage_bucket is distinct from ${quote(r.after.storage_bucket)} or d.storage_path is distinct from ${quote(r.after.storage_path)} or md5((to_jsonb(d) - array['storage_bucket','storage_path','updated_at'])::text) <> ${quote(r.immutableFingerprint)} then raise exception 'Document changed after repair; rollback refused'; end if;` : `if md5(to_jsonb(d)::text) <> ${quote(r.rowFingerprint)} then raise exception 'Document changed since review; abort entire batch'; end if;`}
  update public.development_documents set storage_bucket=${target.storage_bucket == null ? 'null' : quote(target.storage_bucket)}, storage_path=${target.storage_path == null ? 'null' : quote(target.storage_path)} where id=d.id;
end $repair$;`
  })
  return `-- ${rollback ? 'Rollback' : 'Apply'} ONLY after explicit approval and production guard.
-- Target Supabase project: ${report.projectRef}; reviewed packet: ${report.digest}
-- Changes only durable development bucket/path metadata; no Storage writes, evidence or statuses.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
select id from public.developments where id in (${repairs.length ? [...new Set(repairs.map(r=>r.developmentId))].sort().map(id=>`${quote(id)}::uuid`).join(',') : 'null'}) order by id for share;
select id from public.development_documents where id in (${repairs.length ? repairs.map(r=>`${quote(r.id)}::uuid`).join(',') : 'null'}) order by id for update;
${statements.join('\n')}
select id, storage_bucket, storage_path from public.development_documents where id in (${report.repairs.length ? report.repairs.map(r=>`${quote(r.id)}::uuid`).join(',') : 'null'});
commit;
`
}

