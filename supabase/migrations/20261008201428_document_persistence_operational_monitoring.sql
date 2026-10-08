-- Service-only operational signals. No file bytes, paths, tokens or customer names.
create table public.document_upload_outcomes (
  event_id uuid primary key,
  received_sequence bigint generated always as identity,
  attempt_id uuid not null,
  surface text not null check (surface in ('buyer','buyerOnboarding','seller','listing','transaction','lead','developerLead','attorneyVersions','attorney','bond','bondApplication','bondWetInk','external','developer','developmentAssets','rental','rentalAgent','rentalLandlord','commercialWorkspace','commercial','commercialTenant','commercialLandlord','legalTemplates','signedPackets','recruitment','fic','partner','unknown')),
  stage text not null check (stage in ('validation','preparing','uploading','saving','persistence','followUp','access')),
  outcome text not null check (outcome in ('started','succeeded','recovered','failed','unconfirmed','attention')),
  error_category text not null check (error_category in ('none','validation','permission','network','missing_object','schema','unknown')),
  rate_key text not null check (rate_key ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now()
);
create index document_upload_outcomes_received on public.document_upload_outcomes(received_at);
create index document_upload_outcomes_rate on public.document_upload_outcomes(rate_key,received_at);
create index document_upload_outcomes_attempt on public.document_upload_outcomes(attempt_id,received_at desc);
create table public.document_persistence_monitor_runs (
  run_key text primary key,
  project_ref text not null check (project_ref ~ '^[a-z]{20}$'),
  checked_at timestamptz not null default now(),
  status text not null check(status in ('critical','attention','incomplete','healthy','unavailable')),
  report jsonb not null check (jsonb_typeof(report)='object' and octet_length(report::text) <= 1048576)
);
create index document_persistence_monitor_runs_latest on public.document_persistence_monitor_runs(project_ref,checked_at desc);
alter table public.document_upload_outcomes enable row level security;
alter table public.document_persistence_monitor_runs enable row level security;
revoke all on public.document_upload_outcomes, public.document_persistence_monitor_runs from public, anon, authenticated;
grant select, insert, update, delete on public.document_upload_outcomes, public.document_persistence_monitor_runs to service_role;
grant usage on sequence public.document_upload_outcomes_received_sequence_seq to service_role;

-- The API supplies a server-HMAC rate key, never one supplied by the browser.
-- Lock before counting so concurrent requests share the same durable budget.
create function public.record_document_upload_outcome(p_event_id uuid, p_attempt_id uuid,
  p_surface text, p_stage text, p_outcome text, p_error_category text, p_rate_key text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_rate_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid telemetry rate key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_rate_key, 0));
  if exists (select 1 from public.document_upload_outcomes where event_id=p_event_id) then return 'duplicate'; end if;
  if (select count(*) from public.document_upload_outcomes where rate_key=p_rate_key and received_at > now()-interval '1 minute') >= 120 then return 'rate_limited'; end if;
  insert into public.document_upload_outcomes(event_id,attempt_id,surface,stage,outcome,error_category,rate_key)
  values(p_event_id,p_attempt_id,p_surface,p_stage,p_outcome,p_error_category,p_rate_key);
  return 'recorded';
end $$;
revoke all on function public.record_document_upload_outcome(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_document_upload_outcome(uuid,uuid,text,text,text,text,text) to service_role;

-- A single uncapped statement reuses the reviewed all-store reconciliation.
-- Missing tables/columns fail this read rather than silently removing coverage.
create function public.document_persistence_monitor_snapshot(p_project_ref text)
returns jsonb language sql stable security invoker set search_path='' as $$
-- Read-only, uncapped, single-statement snapshot. No file contents or access tokens.
with roots as materialized (select 'documents' as source, jsonb_build_object('id',t.id,'transaction_id',t.transaction_id,'canonical_requirement_instance_id',t.canonical_requirement_instance_id,'status',t.status,'file_path',t.file_path,'file_bucket',t.file_bucket) as row from public.documents t
union all
select 'private_listing_documents' as source, jsonb_build_object('id',t.id,'private_listing_id',t.private_listing_id,'canonical_requirement_instance_id',t.canonical_requirement_instance_id,'requirement_id',t.requirement_id,'promoted_document_id',t.promoted_document_id,'promoted_transaction_id',t.promoted_transaction_id,'status',t.status,'storage_path',t.storage_path,'file_url',t.file_url) as row from public.private_listing_documents t
union all
select 'development_documents' as source, jsonb_build_object('id',t.id,'development_id',t.development_id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket,'file_url',t.file_url, '_audit_row_fingerprint', md5(to_jsonb(t)::text), '_audit_immutable_fingerprint', md5((to_jsonb(t) - array['storage_bucket','storage_path','updated_at'])::text)) as row from public.development_documents t
union all
select 'commercial_documents' as source, jsonb_build_object('id',t.id,'status',t.status,'file_path',t.file_path,'file_bucket',t.file_bucket) as row from public.commercial_documents t
union all
select 'rental_application_documents' as source, jsonb_build_object('id',t.id,'status',t.status,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row from public.rental_application_documents t
union all
select 'rental_landlord_onboarding_documents' as source, jsonb_build_object('id',t.id,'status',t.status,'storage_path',t.storage_path) as row from public.rental_landlord_onboarding_documents t
union all
select 'transaction_attorney_closeout_documents' as source, jsonb_build_object('id',t.id,'status',t.status,'file_path',t.file_path) as row from public.transaction_attorney_closeout_documents t
union all
select 'transaction_bond_closeout_documents' as source, jsonb_build_object('id',t.id,'status',t.status,'file_path',t.file_path) as row from public.transaction_bond_closeout_documents t
union all
select 'bond_wet_ink_uploads' as source, jsonb_build_object('id',t.id,'status',t.status,'file_path',t.file_path) as row from public.bond_wet_ink_uploads t
union all
select 'partner_portal_uploads' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path) as row from public.partner_portal_uploads t
union all
select 'bond_partner_portal_documents' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path) as row from public.bond_partner_portal_documents t
union all
select 'organisation_fic_policies' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path) as row from public.organisation_fic_policies t
union all
select 'buyer_profile_documents' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket,'file_url',t.file_url) as row from public.buyer_profile_documents t
union all
select 'matter_financial_documents' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row from public.matter_financial_documents t
union all
select 'document_packet_templates' as source, jsonb_build_object('id',t.id,'template_storage_path',t.template_storage_path,'template_storage_bucket',t.template_storage_bucket) as row from public.document_packet_templates t
union all
select 'document_packet_template_versions' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row from public.document_packet_template_versions t
union all
select 'document_packet_versions' as source, jsonb_build_object('id',t.id,'rendered_file_path',t.rendered_file_path,'rendered_file_bucket',t.rendered_file_bucket,'final_signed_file_path',t.final_signed_file_path,'final_signed_file_bucket',t.final_signed_file_bucket) as row from public.document_packet_versions t
union all
select 'document_signing_fields' as source, jsonb_build_object('id',t.id,'signature_asset_path',t.signature_asset_path) as row from public.document_signing_fields t
union all
select 'document_generation_runs' as source, jsonb_build_object('id',t.id,'output_storage_path',t.output_storage_path,'output_storage_bucket',t.output_storage_bucket) as row from public.document_generation_runs t
union all
select 'legal_final_artifact_evidence' as source, jsonb_build_object('id',t.id,'path',t.path,'bucket',t.bucket) as row from public.legal_final_artifact_evidence t
union all
select 'document_packets' as source, jsonb_build_object('id',t.id) as row from public.document_packets t
union all
select 'leads' as source, jsonb_build_object('lead_id',t.lead_id) as row from public.leads t
union all
select 'recruitment_leads' as source, jsonb_build_object('id',t.id) as row from public.recruitment_leads t
union all
select 'listing_media' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row from public.listing_media t
union all
select 'listing_media_variants' as source, jsonb_build_object('id',t.id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row from public.listing_media_variants t
union all
select 'transaction_financial_records' as source, jsonb_build_object('id',t.id,'invoice_file_path',t.invoice_file_path) as row from public.transaction_financial_records t
union all
select 'rental_lease_version_documents' as source, jsonb_build_object('id',t.id,'document_link',t.document_link) as row from public.rental_lease_version_documents t), direct_refs as (select source, row, 'file_path' as field, coalesce(nullif(row->>'file_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_path', '[?].*$', '') as path from roots where source='documents'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='private_listing_documents'
union all
select source, row, 'file_url' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_url', '[?].*$', '') as path from roots where source='private_listing_documents'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='development_documents'
union all
select source, row, 'file_url' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_url', '[?].*$', '') as path from roots where source='development_documents'
union all
select source, row, 'file_path' as field, coalesce(nullif(row->>'file_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_path', '[?].*$', '') as path from roots where source='commercial_documents'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'rental-application-documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='rental_application_documents'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'rental-landlord-onboarding') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='rental_landlord_onboarding_documents'
union all
select source, row, 'file_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_path', '[?].*$', '') as path from roots where source='transaction_attorney_closeout_documents'
union all
select source, row, 'file_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_path', '[?].*$', '') as path from roots where source='transaction_bond_closeout_documents'
union all
select source, row, 'file_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'bond-signed-applications') as bucket, regexp_replace(row->>'file_path', '[?].*$', '') as path from roots where source='bond_wet_ink_uploads'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='partner_portal_uploads'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='bond_partner_portal_documents'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'fic-compliance') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='organisation_fic_policies'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='buyer_profile_documents'
union all
select source, row, 'file_url' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'file_url', '[?].*$', '') as path from roots where source='buyer_profile_documents'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='matter_financial_documents'
union all
select source, row, 'template_storage_path' as field, coalesce(nullif(row->>'template_storage_bucket', ''), 'legal-templates') as bucket, regexp_replace(row->>'template_storage_path', '[?].*$', '') as path from roots where source='document_packet_templates'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'legal-templates') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='document_packet_template_versions'
union all
select source, row, 'rendered_file_path' as field, coalesce(nullif(row->>'rendered_file_bucket', ''), 'documents') as bucket, regexp_replace(row->>'rendered_file_path', '[?].*$', '') as path from roots where source='document_packet_versions'
union all
select source, row, 'final_signed_file_path' as field, coalesce(nullif(row->>'final_signed_file_bucket', ''), 'documents') as bucket, regexp_replace(row->>'final_signed_file_path', '[?].*$', '') as path from roots where source='document_packet_versions'
union all
select source, row, 'signature_asset_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'signature_asset_path', '[?].*$', '') as path from roots where source='document_signing_fields'
union all
select source, row, 'output_storage_path' as field, coalesce(nullif(row->>'output_storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'output_storage_path', '[?].*$', '') as path from roots where source='document_generation_runs'
union all
select source, row, 'path' as field, coalesce(nullif(row->>'bucket', ''), 'documents') as bucket, regexp_replace(row->>'path', '[?].*$', '') as path from roots where source='legal_final_artifact_evidence'
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='listing_media' and row->>'storage_bucket' in ('documents','legal-templates','rental-application-documents','rental-landlord-onboarding','bond-signed-applications','fic-compliance','recruitment-documents','recruitment-contracts','recruitment-signed-contracts','recruitment-onboarding-documents','signed-documents')
union all
select source, row, 'storage_path' as field, coalesce(nullif(row->>'storage_bucket', ''), 'documents') as bucket, regexp_replace(row->>'storage_path', '[?].*$', '') as path from roots where source='listing_media_variants' and row->>'storage_bucket' in ('documents','legal-templates','rental-application-documents','rental-landlord-onboarding','bond-signed-applications','fic-compliance','recruitment-documents','recruitment-contracts','recruitment-signed-contracts','recruitment-onboarding-documents','signed-documents')
union all
select source, row, 'invoice_file_path' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'invoice_file_path', '[?].*$', '') as path from roots where source='transaction_financial_records'
union all
select source, row, 'document_link' as field, coalesce(nullif(row->>'_no_bucket', ''), 'documents') as bucket, regexp_replace(row->>'document_link', '[?].*$', '') as path from roots where source='rental_lease_version_documents'),
json_roots as (select 'document_packets' as source, jsonb_build_object('id', t.id) as row, 'source_context_json' as field, 'documents' as bucket, t.source_context_json as value from public.document_packets t
union all
select 'documents' as source, jsonb_build_object('id', t.id) as row, 'metadata' as field, 'documents' as bucket, t.metadata as value from public.documents t
union all
select 'leads' as source, jsonb_build_object('lead_id', t.lead_id) as row, 'raw_enquiry_payload' as field, 'documents' as bucket, t.raw_enquiry_payload as value from public.leads t
union all
select 'recruitment_leads' as source, jsonb_build_object('id', t.id) as row, 'documents_json' as field, 'recruitment-documents' as bucket, t.documents_json as value from public.recruitment_leads t
union all
select 'recruitment_leads' as source, jsonb_build_object('id', t.id) as row, 'contracts_json' as field, 'recruitment-contracts' as bucket, t.contracts_json as value from public.recruitment_leads t
union all
select 'recruitment_leads' as source, jsonb_build_object('id', t.id) as row, 'contract_signature_json' as field, 'recruitment-signed-contracts' as bucket, t.contract_signature_json as value from public.recruitment_leads t
union all
select 'recruitment_leads' as source, jsonb_build_object('id', t.id) as row, 'onboarding_documents_json' as field, 'recruitment-onboarding-documents' as bucket, t.onboarding_documents_json as value from public.recruitment_leads t
union all
select 'legal_final_artifact_evidence' as source, jsonb_build_object('id', t.id) as row, 'signature_asset_fingerprints_json' as field, 'documents' as bucket, t.signature_asset_fingerprints_json as value from public.legal_final_artifact_evidence t), refs as (
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
    jsonb_build_object('storage_bucket', row->'storage_bucket', 'storage_path', row->'storage_path') as before
  from refs
), source_counts as (select inventory.source, count(roots.source) as rows from (values ('documents'),('private_listing_documents'),('development_documents'),('commercial_documents'),('rental_application_documents'),('rental_landlord_onboarding_documents'),('transaction_attorney_closeout_documents'),('transaction_bond_closeout_documents'),('bond_wet_ink_uploads'),('partner_portal_uploads'),('bond_partner_portal_documents'),('organisation_fic_policies'),('buyer_profile_documents'),('matter_financial_documents'),('document_packet_templates'),('document_packet_template_versions'),('document_packet_versions'),('document_signing_fields'),('document_generation_runs'),('legal_final_artifact_evidence'),('document_packets'),('leads'),('recruitment_leads'),('listing_media'),('listing_media_variants'),('transaction_financial_records'),('rental_lease_version_documents')) inventory(source) left join roots using (source) group by inventory.source),
objects as (select id, bucket_id as bucket, name as path, created_at, updated_at, version,
  md5(to_jsonb(o)::text) as fingerprint from storage.objects o where bucket_id in ('documents','legal-templates','rental-application-documents','rental-landlord-onboarding','bond-signed-applications','fic-compliance','recruitment-documents','recruitment-contracts','recruitment-signed-contracts','recruitment-onboarding-documents','signed-documents')),
contexts as (
  select 'transaction' as type, id, organisation_id from public.transactions
  union all select 'private_listing', id, organisation_id from public.private_listings
  union all select 'development', id, organisation_id from public.developments
), documents as (
  select jsonb_build_object('id', row->'id', 'transaction_id', row->'transaction_id', 'private_listing_id', row->'private_listing_id', 'canonical_requirement_instance_id', row->'canonical_requirement_instance_id', 'requirement_id', row->'requirement_id', 'promoted_document_id', row->'promoted_document_id', 'promoted_transaction_id', row->'promoted_transaction_id', 'status', row->'status') || jsonb_build_object('source', source) as value
  from roots where source in ('documents','private_listing_documents')
), requirements as (
  select to_jsonb(r) - array['rejection_reason','waiver_reason'] as value from public.document_requirement_instances r
), legacy_links as (
  select 'transaction_required_documents' as source, id, transaction_id as context_id, 'transaction' as context_type, uploaded_document_id as document_id, canonical_requirement_instance_id as canonical_id, status from public.transaction_required_documents
  union all select 'transaction_document_requirements', id, transaction_id, 'transaction', uploaded_document_id, canonical_requirement_instance_id, status from public.transaction_document_requirements
  union all select 'document_requests', id, transaction_id, 'transaction', requested_document_id, canonical_requirement_instance_id, status from public.document_requests
  union all select 'private_listing_document_requirements', id, private_listing_id, 'private_listing', satisfied_by_document_id, canonical_requirement_instance_id, status from public.private_listing_document_requirements
)
select jsonb_build_object('version',1,'projectRef',p_project_ref,'capturedAt',now(),
  'sourceCounts',(select coalesce(jsonb_agg(source_counts), '[]'::jsonb) from source_counts),'references',(select coalesce(jsonb_agg(reference_rows), '[]'::jsonb) from reference_rows),
  'objects',(select coalesce(jsonb_agg(objects), '[]'::jsonb) from objects),'contexts',(select coalesce(jsonb_agg(contexts), '[]'::jsonb) from contexts),
  'documents',(select coalesce(jsonb_agg(value),'[]'::jsonb) from documents),
  'requirements',(select coalesce(jsonb_agg(value),'[]'::jsonb) from requirements),
  'legacyLinks',(select coalesce(jsonb_agg(legacy_links), '[]'::jsonb) from legacy_links)) as snapshot;

$$;
revoke all on function public.document_persistence_monitor_snapshot(text) from public,anon,authenticated;
grant execute on function public.document_persistence_monitor_snapshot(text) to service_role;

create function public.document_upload_outcome_summary()
returns jsonb language sql stable security invoker set search_path='' as $$
with recent as materialized (
  select distinct on (rate_key,attempt_id) rate_key,attempt_id,surface,stage,outcome,error_category,received_at
  from public.document_upload_outcomes where received_at >= now()-interval '1 hour'
  order by rate_key,attempt_id,(outcome <> 'started') desc,received_at desc,received_sequence desc
), grouped as (
  select surface, count(*) as attempts,
    count(*) filter(where stage <> 'access' and outcome in ('succeeded','recovered')) as succeeded,
    count(*) filter(where stage <> 'access' and outcome='recovered') as recovered,
    count(*) filter(where stage <> 'access' and outcome in ('failed','unconfirmed')) as failed,
    count(*) filter(where stage <> 'access' and outcome='unconfirmed') as unconfirmed,
    count(*) filter(where stage <> 'access' and outcome='attention') as attention,
    count(*) filter(where stage <> 'access' and outcome='started' and received_at < now()-interval '15 minutes') as stalled,
    count(*) filter(where stage <> 'access' and error_category='permission') as permission_errors,
    count(*) filter(where error_category='network') as network_errors,
    count(*) filter(where stage='access' and outcome='failed') as access_errors
  from recent group by surface
)
select jsonb_build_object('capturedAt',now(),'windowMinutes',60,'rows',coalesce(jsonb_agg(grouped),'[]'::jsonb)) from grouped;
$$;
revoke all on function public.document_upload_outcome_summary() from public,anon,authenticated;
grant execute on function public.document_upload_outcome_summary() to service_role;

-- Retention concerns diagnostic receipts only; customer documents are untouched.
create function public.prune_document_persistence_monitor_history()
returns void language sql security invoker set search_path='' as $$
  delete from public.document_upload_outcomes where event_id in
    (select event_id from public.document_upload_outcomes where received_at < now()-interval '7 days' order by received_at limit 10000);
  delete from public.document_persistence_monitor_runs where checked_at < now()-interval '90 days';
$$;
revoke all on function public.prune_document_persistence_monitor_history() from public,anon,authenticated;
grant execute on function public.prune_document_persistence_monitor_history() to service_role;
