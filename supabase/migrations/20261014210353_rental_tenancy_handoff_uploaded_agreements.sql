begin;

-- Storage and document receipts are private, immutable and scoped to a lease
-- version. File upload never generates an agreement or signs it automatically.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rental-lease-files','rental-lease-files',false,20971520,array['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create table public.rental_lease_document_uploads(
 id uuid primary key, organisation_id uuid not null references public.organisations(id),
 lease_version_id uuid not null references public.rental_lease_versions(id),
 signer_id uuid references public.rental_lease_signers(id),
 kind text not null check(kind in ('agreement','signed_agreement','move_in_evidence')),
 storage_bucket text not null default 'rental-lease-files' check(storage_bucket='rental-lease-files'),
 storage_path text not null unique, file_name text not null, mime_type text not null,
 file_size_bytes bigint not null check(file_size_bytes between 1 and 20971520),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check((kind in ('agreement','move_in_evidence') and signer_id is null) or (kind='signed_agreement' and signer_id is not null))
);
create index rental_lease_document_uploads_version_idx on public.rental_lease_document_uploads(lease_version_id,created_at);
alter table public.rental_lease_document_uploads enable row level security;
revoke all on public.rental_lease_document_uploads from public,anon,authenticated;
grant select on public.rental_lease_document_uploads to authenticated;
create policy rental_lease_uploads_read on public.rental_lease_document_uploads for select to authenticated using(exists(
 select 1 from public.rental_lease_versions v join public.rental_leases l on l.id=v.lease_id join public.rental_tenancies t on t.id=l.tenancy_id join public.rental_properties p on p.id=t.property_id
 where v.id=lease_version_id and v.organisation_id=rental_lease_document_uploads.organisation_id and public.rental_branch_access(p.organisation_id,p.branch_id)));

create function rental_private.lease_document_path_access(object_path text,writing boolean)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or object_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|doc|docx)$' then return false; end if;
 return exists(select 1 from public.rental_lease_versions v join public.rental_leases l on l.id=v.lease_id join public.rental_tenancies t on t.id=l.tenancy_id join public.rental_properties p on p.id=t.property_id
 where v.organisation_id::text=split_part(object_path,'/',1) and l.id::text=split_part(object_path,'/',2) and v.id::text=split_part(object_path,'/',3)
 and public.rental_branch_access(p.organisation_id,p.branch_id) and (not writing or (v.is_current and v.status='draft' and l.status in ('draft','awaiting_tenant','awaiting_landlord','signed'))));
end; $$;
revoke all on function rental_private.lease_document_path_access(text,boolean) from public,anon;
grant usage on schema rental_private to authenticated;
grant execute on function rental_private.lease_document_path_access(text,boolean) to authenticated;
create policy rental_lease_files_read on storage.objects for select to authenticated using(bucket_id='rental-lease-files' and rental_private.lease_document_path_access(name,false));
create policy rental_lease_files_insert on storage.objects for insert to authenticated with check(bucket_id='rental-lease-files' and rental_private.lease_document_path_access(name,true));
-- No browser overwrite/delete policy: stored evidence cannot be replaced in place.

create function public.rental_tenancy_handoff_context(p_application_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('applicationId',a.id,'leadId',a.lead_id,'leadStage',public.rental_lead_normalize_stage(coalesce(public.rental_lead_payload_metadata(l.raw_enquiry_payload)->>'stage',l.stage),'tenant'),
 'listingId',listing.id,'propertyId',v.property_id,'unitId',v.unit_id,'vacancyId',v.id,'tenancyId',t.id,
 'canCreate',a.status='approved' and l.lead_domain='agency' and public.rental_lead_payload_is_rental(l.raw_enquiry_payload) and lower(btrim(coalesce(public.rental_lead_payload_metadata(l.raw_enquiry_payload)->>'role',case when l.lead_category='seller' then 'landlord' else 'tenant' end)))='tenant'
 and public.rental_lead_normalize_stage(coalesce(public.rental_lead_payload_metadata(l.raw_enquiry_payload)->>'stage',l.stage),'tenant')='placement_ready')
 from public.rental_applications a join public.rental_vacancies v on v.id=a.vacancy_id left join public.leads l on l.lead_id=a.lead_id and l.organisation_id=a.organisation_id
 left join public.private_listings listing on listing.rental_vacancy_id=v.id and listing.organisation_id=a.organisation_id left join public.rental_tenancies t on t.source_application_id=a.id
 where a.id=p_application_id and auth.uid() is not null;
$$;
revoke all on function public.rental_tenancy_handoff_context(uuid) from public,anon;
grant execute on function public.rental_tenancy_handoff_context(uuid) to authenticated;

-- Required move-in amounts follow the saved lease terms. An amount change
-- requires fresh verification; document bookkeeping alone leaves proof intact.
create or replace function public.rental_seed_lease_move_in_readiness()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.rental_move_in_readiness_items as saved(tenancy_id,lease_id,organisation_id,obligation_type,required_amount)
 values(new.tenancy_id,new.id,new.organisation_id,'deposit',coalesce(nullif(new.terms_json->>'deposit_amount','')::numeric,0)),
       (new.tenancy_id,new.id,new.organisation_id,'first_rent',coalesce(nullif(new.terms_json->>'monthly_rent','')::numeric,0))
 on conflict(lease_id,obligation_type) do update set required_amount=excluded.required_amount,
 status=case when saved.received_amount>=excluded.required_amount and saved.received_amount>0 then 'received' when saved.received_amount>0 then 'partial' else 'required' end,
 reviewed_at=null,reviewed_by=null,exception_reason=null
 where saved.required_amount is distinct from excluded.required_amount;
 return new;
end; $$;

-- A reserved unit remains visible on existing applications, but cannot accept
-- a new tenant application while its saved tenancy is being prepared.
create function public.rental_application_reserved_unit_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.rental_units u where u.id=new.unit_id and (u.status='lease_pending' or u.active_tenancy_id is not null)) then raise exception 'This unit is reserved for a saved tenancy. Choose another available property.'; end if;
 return new;
end; $$;
revoke all on function public.rental_application_reserved_unit_guard() from public,anon,authenticated;
create trigger rental_application_reserved_unit_guard before insert on public.rental_applications for each row execute function public.rental_application_reserved_unit_guard();

create or replace function public.rental_tenant_application_choices(p_organisation_id uuid, p_branch_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(entry order by title,unit_label),'[]'::jsonb) from (
    select p.name title,u.unit_label,jsonb_build_object(
      'id',v.id,'organisationId',v.organisation_id,'branchId',v.branch_id,'propertyId',p.id,'unitId',u.id,'listingId',l.id,
      'title',coalesce(nullif(l.title,''),p.name),'address',concat_ws(', ',p.address_line_1,p.suburb,p.city),'unitLabel',u.unit_label,
      'askingRent',v.asking_rent,'depositAmount',v.deposit_amount,'availableFrom',v.available_from,'leaseTermMonths',v.lease_term_months,'status',v.status,
      'eligible',v.status in ('marketing','applications_open') and u.active_tenancy_id is null and u.status in ('vacant','marketing','application_pending')
        and coalesce(l.listing_status,'') not in ('withdrawn','deleted','sold','let','rented') and coalesce(l.listing_visibility,'') not in ('archived','deleted')
        and coalesce(l.seller_canonical_facts_json#>>'{rentalInfo,rentalPriceFrequency}','monthly')='monthly') entry
    from public.rental_vacancies v join public.rental_properties p on p.id=v.property_id
      join public.rental_units u on u.id=v.unit_id join public.private_listings l on l.rental_vacancy_id=v.id
    where auth.uid() is not null and v.organisation_id=p_organisation_id and p.organisation_id=v.organisation_id and u.organisation_id=v.organisation_id
      and l.organisation_id=v.organisation_id and l.listing_category='rental' and l.rental_property_id=p.id and l.rental_unit_id=u.id
      and (p_branch_id is null or v.branch_id=p_branch_id)
  ) available;
$$;

create or replace function public.rental_vacancy_validate_scope_and_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare unit_org uuid; unit_property uuid; unit_branch uuid; ready boolean;
begin
  select organisation_id, property_id, branch_id into unit_org, unit_property, unit_branch from public.rental_units where id = new.unit_id;
  if unit_org is null or unit_org <> new.organisation_id or unit_property <> new.property_id then raise exception 'Rental vacancy must match its unit property and organisation'; end if;
  if new.branch_id is null then new.branch_id := unit_branch; end if;
  if unit_branch is not null and new.branch_id is distinct from unit_branch then raise exception 'Rental vacancy branch must match its unit'; end if;
  if tg_op = 'INSERT' and auth.uid() is not null and new.status <> 'draft' then raise exception 'Browser clients may only create a draft rental vacancy'; end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not ((current_setting('app.rental_tenancy_command',true)='on' and old.status in ('marketing','applications_open','paused') and new.status='let') or (old.status = 'draft' and new.status in ('preparing', 'withdrawn')) or (old.status = 'preparing' and new.status in ('draft', 'marketing', 'withdrawn')) or (old.status = 'marketing' and new.status in ('applications_open', 'paused', 'withdrawn')) or (old.status = 'applications_open' and new.status in ('paused', 'let', 'withdrawn')) or (old.status = 'paused' and new.status in ('preparing', 'marketing', 'applications_open', 'withdrawn'))) then raise exception 'Invalid rental vacancy transition'; end if;
  end if;
  if new.status = 'marketing' then
    select marketing_ready into ready from public.rental_property_marketing_readiness where property_id = new.property_id;
    if coalesce(ready, false) is not true then raise exception 'Rental vacancy cannot enter marketing until landlord and mandate readiness is confirmed'; end if;
  end if;
  return new;
end; $$;

-- Keep established conversion and signing rules behind authenticated, scoped
-- commands. Public RPC entry points use invoker permissions; privileged writes
-- live in the non-exposed rental_private schema.
alter function public.rental_convert_application_to_tenancy(uuid,integer) set schema rental_private;
alter function rental_private.rental_convert_application_to_tenancy(uuid,integer) rename to convert_before_fixed_journey;
revoke all on function rental_private.convert_before_fixed_journey(uuid,integer) from public,anon,authenticated;
create function rental_private.convert_fixed_journey(p_application_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rental_applications; lead public.leads; v public.rental_vacancies; listing public.private_listings; m jsonb; rel jsonb; result jsonb; owner public.contacts; terms jsonb; existing uuid;
begin
 if auth.uid() is null or p_expected_version is null then raise exception 'Sign in and refresh the application before preparing a tenancy.' using errcode='42501'; end if;
 select * into a from public.rental_applications where id=p_application_id;
 if not found or not exists(select 1 from public.rental_vacancies vacancy_scope join public.rental_properties p on p.id=vacancy_scope.property_id where vacancy_scope.id=a.vacancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'This application is unavailable in your rental workspace.' using errcode='42501'; end if;
 -- Match the lead -> application lock order used by tenant application setup.
 if a.lead_id is not null then
  if not public.bridge_agency_lead_scope(a.lead_id) then raise exception 'This tenant lead is unavailable in your workspace.' using errcode='42501'; end if;
  select * into lead from public.leads where lead_id=a.lead_id and organisation_id=a.organisation_id for update;
  m:=public.rental_lead_payload_metadata(lead.raw_enquiry_payload);
  if not found or lead.lead_domain is distinct from 'agency' or not public.rental_lead_payload_is_rental(lead.raw_enquiry_payload) or lower(btrim(coalesce(m->>'role',case when lead.lead_category='seller' then 'landlord' else 'tenant' end)))<>'tenant' then raise exception 'Use a separate tenant lead for tenancy preparation.'; end if;
 end if;
 select * into a from public.rental_applications where id=p_application_id for update;
 select id into existing from public.rental_tenancies where source_application_id=a.id;
 if existing is null then
  if lead.lead_id is null then raise exception 'Link the approved application to its tenant lead before preparing a tenancy.'; end if;
  if public.rental_lead_normalize_stage(coalesce(m->>'stage',lead.stage),'tenant')<>'placement_ready' then raise exception 'Complete the tenant journey to Placement ready before preparing a tenancy.'; end if;
  perform 1 from public.rental_units where id=a.unit_id for update;
  select * into v from public.rental_vacancies where id=a.vacancy_id for share;
  select * into listing from public.private_listings where rental_vacancy_id=v.id and organisation_id=a.organisation_id;
  if listing.id is null or listing.listing_category<>'rental' or v.status not in ('marketing','applications_open') or listing.listing_status in ('withdrawn','deleted','let','rented','sold') or listing.listing_visibility in ('archived','deleted') then raise exception 'The selected rental listing and vacancy are no longer available.'; end if;
 end if;
 rel:=coalesce(m->'relationships','{}');
 if lead.lead_id is not null and nullif(rel->>'applicationId','') is not null and rel->>'applicationId'<>a.id::text then raise exception 'Continue with the approved application already linked to this tenant journey.'; end if;
 result:=rental_private.convert_before_fixed_journey(a.id,p_expected_version);
 if nullif(result->>'lease_id','') is null then raise exception 'This tenancy has no saved lease. Review its records before continuing.'; end if;
 if not coalesce((result->>'idempotent')::boolean,false) then
  select c.* into owner from public.rental_property_landlords pl join public.contacts c on c.contact_id=pl.party_id and c.organisation_id=pl.organisation_id where pl.property_id=v.property_id and pl.organisation_id=a.organisation_id and pl.is_primary_contact;
  select terms_json into terms from public.rental_leases where id=(result->>'lease_id')::uuid;
  terms:=terms||jsonb_build_object('document_mode','uploads_only','landlord_name',btrim(concat_ws(' ',owner.first_name,owner.last_name)),'landlord_email',coalesce(owner.email,''));
  update public.rental_leases set terms_json=terms where id=(result->>'lease_id')::uuid;
  update public.rental_lease_versions set terms_json=terms where lease_id=(result->>'lease_id')::uuid and is_current;
 end if;
 if lead.lead_id is not null then
  select * into v from public.rental_vacancies where id=a.vacancy_id;
  select * into listing from public.private_listings where rental_vacancy_id=v.id and organisation_id=a.organisation_id;
  rel:=rel||jsonb_build_object('applicationId',a.id,'tenancyId',result->>'tenancy_id','leaseId',result->>'lease_id','vacancyId',v.id,'propertyId',v.property_id,'unitId',v.unit_id);
  if listing.id is not null then rel:=rel||jsonb_build_object('listingId',listing.id); end if;
  if m->'relationships' is distinct from rel then update public.leads set raw_enquiry_payload=jsonb_set(m-'rentalCrm'-'rental_crm','{relationships}',rel),updated_at=now() where lead_id=lead.lead_id; end if;
 end if;
 return result;
end; $$;
create function public.rental_convert_application_to_tenancy(p_application_id uuid,p_expected_version integer) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.convert_fixed_journey(p_application_id,p_expected_version); $$;
revoke all on function rental_private.convert_fixed_journey(uuid,integer),public.rental_convert_application_to_tenancy(uuid,integer) from public,anon;
grant execute on function rental_private.convert_fixed_journey(uuid,integer),public.rental_convert_application_to_tenancy(uuid,integer) to authenticated;

alter function public.rental_save_lease_draft(uuid,integer,jsonb) set schema rental_private;
alter function rental_private.rental_save_lease_draft(uuid,integer,jsonb) rename to save_before_uploaded_agreements;
revoke all on function rental_private.save_before_uploaded_agreements(uuid,integer,jsonb) from public,anon,authenticated;
create function rental_private.save_uploaded_agreement_draft(p_lease_id uuid,p_expected_version integer,p_terms_json jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; terms jsonb;
begin
 -- The existing version command checks membership, current version and dates.
 result:=rental_private.save_before_uploaded_agreements(p_lease_id,p_expected_version,p_terms_json-'agreement_document_link');
 select terms_json into terms from public.rental_lease_versions where id=(result->>'id')::uuid;
 terms:=terms||jsonb_build_object('document_mode','uploads_only');
 update public.rental_lease_versions set terms_json=terms where id=(result->>'id')::uuid;
 update public.rental_leases set terms_json=terms where id=p_lease_id;
 return result;
end; $$;
create function public.rental_save_lease_draft(p_lease_id uuid,p_expected_version integer,p_terms_json jsonb) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.save_uploaded_agreement_draft(p_lease_id,p_expected_version,p_terms_json); $$;
revoke all on function rental_private.save_uploaded_agreement_draft(uuid,integer,jsonb),public.rental_save_lease_draft(uuid,integer,jsonb) from public,anon;
grant execute on function rental_private.save_uploaded_agreement_draft(uuid,integer,jsonb),public.rental_save_lease_draft(uuid,integer,jsonb) to authenticated;

alter function public.rental_prepare_lease_signing(uuid,integer,jsonb) set schema rental_private;
alter function rental_private.rental_prepare_lease_signing(uuid,integer,jsonb) rename to prepare_before_uploaded_agreements;
revoke all on function rental_private.prepare_before_uploaded_agreements(uuid,integer,jsonb) from public,anon,authenticated;
create function rental_private.prepare_uploaded_lease_signing(p_lease_id uuid,p_expected_version integer,p_signers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare lease_row public.rental_leases%rowtype; version_row public.rental_lease_versions%rowtype; snapshot jsonb; schedule jsonb; signer jsonb; expected jsonb;
begin
 if auth.uid() is null or p_expected_version is null then raise exception 'Authentication and current lease version are required'; end if;
 select * into lease_row from public.rental_leases where id=p_lease_id for update;
 if not found then raise exception 'Rental lease not found'; end if;
 select t.tenant_snapshot_json into snapshot from public.rental_tenancies t join public.rental_properties p on p.id=t.property_id where t.id=lease_row.tenancy_id and public.rental_branch_access(p.organisation_id,p.branch_id);
 if snapshot is null then raise exception 'You are not authorized for this rental lease'; end if;
 select * into version_row from public.rental_lease_versions where lease_id=p_lease_id and is_current for update;
 if not found or version_row.version_number<>p_expected_version then raise exception 'This lease changed. Refresh and try again.' using errcode='PT409'; end if;
 if lease_row.status<>'draft' then raise exception 'This lease is already in a signing recovery state'; end if;
 schedule:=public.rental_lease_application_projection(snapshot,version_row.terms_json);
 if version_row.terms_json->'application_schedule' is distinct from schedule or version_row.effective_start_date is null or version_row.effective_end_date is null then raise exception 'Save and review the current lease schedule first'; end if;
 if length(btrim(schedule->>'tenantNoticeAddress'))=0 or length(btrim(schedule #>> '{landlord,noticeAddress}'))=0 or length(btrim(schedule #>> '{landlord,name}'))=0 or length(btrim(schedule #>> '{property,address}'))=0 then raise exception 'Tenant and landlord notice addresses, landlord name and property address are required'; end if;
 if not exists(select 1 from public.rental_lease_document_uploads d where d.id=nullif(version_row.terms_json->>'agreement_upload_id','')::uuid and d.lease_version_id=version_row.id and d.kind='agreement' and 'rental-lease-files/'||d.storage_path=schedule #>> '{agreement,documentLink}') then raise exception 'Upload and review the agreement for this saved lease version before preparing signatures.'; end if;
 if jsonb_typeof(p_signers) is distinct from 'array' or jsonb_array_length(p_signers)<>jsonb_array_length(schedule->'parties')+1 or jsonb_array_length(schedule->'parties')=0 then raise exception 'All application signers and the landlord are required'; end if;
 if not exists(select 1 from jsonb_array_elements(schedule->'parties') x where x->>'role' in ('tenant','tenant_representative')) then raise exception 'A tenant or authorised representative is required'; end if;
 for expected in select value from jsonb_array_elements(schedule->'parties') loop
   if length(btrim(coalesce(expected->>'name','')))=0 or length(btrim(coalesce(expected->>'identityNumber','')))=0 or length(btrim(coalesce(expected->>'identityType','')))=0 or length(btrim(coalesce(expected->>'noticeAddress','')))=0 or (expected->>'role'='tenant_representative' and length(btrim(coalesce(expected->>'authorityBasis','')))=0) then raise exception 'Signer identity, notice address and representative authority must be complete'; end if;
   if (select count(*) from jsonb_array_elements(p_signers) x where x->>'subjectId'=expected->>'subjectId' and x->>'role'=expected->>'role' and x->>'name'=expected->>'name' and coalesce(x->>'email','')=coalesce(expected->>'email','') and x->>'reviewedVersion'=p_expected_version::text)<>1 then raise exception 'Application signer details or reviewed version do not match'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_signers) x where x->>'role'='landlord' and x->>'subjectId'='landlord' and x->>'name'=schedule #>> '{landlord,name}' and coalesce(x->>'email','')=schedule #>> '{landlord,email}' and x->>'reviewedVersion'=p_expected_version::text)<>1 then raise exception 'Landlord details or reviewed version do not match'; end if;
 for signer in select value from jsonb_array_elements(p_signers) loop
   insert into public.rental_lease_signers(lease_version_id,organisation_id,signer_role,source_subject_id,signer_name,signer_email,authority_basis)
   values(version_row.id,lease_row.organisation_id,signer->>'role',signer->>'subjectId',signer->>'name',nullif(signer->>'email',''),(select x->>'authorityBasis' from jsonb_array_elements(schedule->'parties') x where x->>'subjectId'=signer->>'subjectId'));
 end loop;
 update public.rental_leases set status='awaiting_tenant' where id=p_lease_id;
 insert into public.rental_lease_signing_events(lease_version_id,organisation_id,event_type,occurred_by,evidence_json) values(version_row.id,lease_row.organisation_id,'signing_prepared',auth.uid(),jsonb_build_object('schedule',schedule,'reviewed_version',p_expected_version,'mode','manual_evidence'));
 return jsonb_build_object('lease_id',p_lease_id,'lease_version_id',version_row.id,'status','awaiting_tenant');
end; $$;
create function public.rental_prepare_lease_signing(p_lease_id uuid,p_expected_version integer,p_signers jsonb) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.prepare_uploaded_lease_signing(p_lease_id,p_expected_version,p_signers); $$;
revoke all on function rental_private.prepare_uploaded_lease_signing(uuid,integer,jsonb),public.rental_prepare_lease_signing(uuid,integer,jsonb) from public,anon;
grant execute on function rental_private.prepare_uploaded_lease_signing(uuid,integer,jsonb),public.rental_prepare_lease_signing(uuid,integer,jsonb) to authenticated;

alter function public.rental_record_lease_signature(uuid,text,text,text) set schema rental_private;
alter function rental_private.rental_record_lease_signature(uuid,text,text,text) rename to record_before_uploaded_agreements;
revoke all on function rental_private.record_before_uploaded_agreements(uuid,text,text,text) from public,anon,authenticated;
create function rental_private.record_uploaded_lease_signature(p_signer_id uuid,p_outcome text,p_document_link text,p_evidence_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare signer public.rental_lease_signers; lease public.rental_leases; version public.rental_lease_versions;
begin
 if auth.uid() is null then raise exception 'Sign in to record lease evidence.'; end if;
 select * into signer from public.rental_lease_signers where id=p_signer_id;
 select l.* into lease from public.rental_leases l join public.rental_lease_versions v on v.lease_id=l.id where v.id=signer.lease_version_id for update of l;
 if lease.id is null or not exists(select 1 from public.rental_tenancies t join public.rental_properties p on p.id=t.property_id where t.id=lease.tenancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'This lease signer is unavailable in your workspace.' using errcode='42501'; end if;
 select * into version from public.rental_lease_versions where id=signer.lease_version_id and is_current for update;
 if not found then raise exception 'This signature belongs to an earlier lease version.'; end if;
 select * into signer from public.rental_lease_signers where id=p_signer_id for update;
 if p_outcome='signed' and (version.terms_json->>'document_mode'='uploads_only' or p_document_link like 'rental-lease-files/%') then
  if not exists(select 1 from public.rental_lease_document_uploads d where d.lease_version_id=version.id and d.signer_id=signer.id and d.kind='signed_agreement' and 'rental-lease-files/'||d.storage_path=p_document_link) then raise exception 'Upload the signed agreement for this person and lease version.'; end if;
 end if;
 if p_outcome='signed' and signer.status='signed' and signer.signed_document_link=p_document_link then return jsonb_build_object('lease_id',lease.id,'status',lease.status,'idempotent',true); end if;
 return rental_private.record_before_uploaded_agreements(p_signer_id,p_outcome,p_document_link,p_evidence_note);
end; $$;
create function public.rental_record_lease_signature(p_signer_id uuid,p_outcome text,p_document_link text default null,p_evidence_note text default null) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.record_uploaded_lease_signature(p_signer_id,p_outcome,p_document_link,p_evidence_note); $$;
revoke all on function rental_private.record_uploaded_lease_signature(uuid,text,text,text),public.rental_record_lease_signature(uuid,text,text,text) from public,anon;
grant execute on function rental_private.record_uploaded_lease_signature(uuid,text,text,text),public.rental_record_lease_signature(uuid,text,text,text) to authenticated;

create function rental_private.register_lease_document(p_lease_id uuid,p_expected_version integer,p_upload_id uuid,p_kind text,p_signer_id uuid,p_storage_path text,p_file_name text,p_confirm_signed boolean,p_evidence_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.rental_leases; v public.rental_lease_versions; d public.rental_lease_document_uploads; object_metadata jsonb; bytes bigint; mime text; terms jsonb; snapshot jsonb; signer public.rental_lease_signers;
begin
 if auth.uid() is null then raise exception 'Sign in to upload lease documents.'; end if;
 select * into l from public.rental_leases where id=p_lease_id for update;
 if not found or not exists(select 1 from public.rental_tenancies t join public.rental_properties p on p.id=t.property_id where t.id=l.tenancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'This lease is unavailable in your workspace.' using errcode='42501'; end if;
 select * into v from public.rental_lease_versions where lease_id=l.id and is_current for update;
 if not found or v.version_number is distinct from p_expected_version then raise exception 'This lease version changed. Refresh before uploading its agreement.' using errcode='40001'; end if;
 if p_upload_id is null or p_kind not in ('agreement','signed_agreement','move_in_evidence') or nullif(btrim(p_file_name),'') is null or length(p_file_name)>255 then raise exception 'Choose a supported agreement file.'; end if;
 if p_storage_path !~ ('^'||l.organisation_id::text||'/'||l.id::text||'/'||v.id::text||'/'||p_upload_id::text||'\.(pdf|jpg|jpeg|png|doc|docx)$') then raise exception 'The uploaded file must belong to this lease version.'; end if;
 if p_kind='signed_agreement' and p_confirm_signed is distinct from true then raise exception 'Confirm that this uploaded copy contains this person’s signature.'; end if;
 select * into d from public.rental_lease_document_uploads where id=p_upload_id;
 if found then
  if d.lease_version_id<>v.id or d.kind<>p_kind or d.signer_id is distinct from p_signer_id or d.storage_path<>p_storage_path then raise exception 'This saved file belongs to another lease or person.'; end if;
  return to_jsonb(d)||jsonb_build_object('leaseStatus',l.status,'idempotent',true);
 end if;
 if v.status<>'draft' or (p_kind='agreement' and l.status<>'draft') or (p_kind='signed_agreement' and l.status not in ('awaiting_tenant','awaiting_landlord')) or (p_kind='move_in_evidence' and l.status not in ('draft','awaiting_tenant','awaiting_landlord','signed')) then raise exception 'This lease is not accepting this document.'; end if;
 if p_kind in ('agreement','move_in_evidence') and p_signer_id is not null then raise exception 'The reviewed agreement is attached to its lease version.'; end if;
 if p_kind='signed_agreement' then
  select * into signer from public.rental_lease_signers where id=p_signer_id and lease_version_id=v.id for update;
  if not found or signer.status='signed' then raise exception 'Choose an unsigned person from this current lease version.'; end if;
 end if;
 select metadata into object_metadata from storage.objects where bucket_id='rental-lease-files' and name=p_storage_path;
 if not found or coalesce(object_metadata->>'size',object_metadata->>'contentLength','') !~ '^[0-9]+$' then raise exception 'The uploaded file could not be confirmed. Retry linking it.'; end if;
 bytes:=coalesce(object_metadata->>'size',object_metadata->>'contentLength')::bigint; mime:=coalesce(object_metadata->>'mimetype',object_metadata->>'contentType');
 if bytes not between 1 and 20971520 or mime not in ('application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'Upload a PDF, Word document, JPG or PNG of 20 MB or less.'; end if;
 insert into public.rental_lease_document_uploads(id,organisation_id,lease_version_id,signer_id,kind,storage_path,file_name,mime_type,file_size_bytes,created_by)
 values(p_upload_id,l.organisation_id,v.id,p_signer_id,p_kind,p_storage_path,btrim(p_file_name),mime,bytes,auth.uid()) returning * into d;
 perform public.rental_link_lease_version_document(v.id,case when p_kind='agreement' then 'Reviewed agreement: ' when p_kind='move_in_evidence' then 'Move-in evidence: ' else 'Signed agreement: ' end||d.file_name,'rental-lease-files/'||d.storage_path);
 if p_kind='agreement' then
  select tenant_snapshot_json into snapshot from public.rental_tenancies where id=l.tenancy_id;
  terms:=v.terms_json||jsonb_build_object('document_mode','uploads_only','agreement_upload_id',d.id,'agreement_document_link','rental-lease-files/'||d.storage_path,'agreement_template_reference',coalesce(nullif(v.terms_json->>'agreement_template_reference',''),d.file_name));
  terms:=terms||jsonb_build_object('application_schedule',public.rental_lease_application_projection(snapshot,terms));
  update public.rental_lease_versions set terms_json=terms where id=v.id;
  update public.rental_leases set terms_json=terms where id=l.id;
 elsif p_kind='signed_agreement' then
  perform rental_private.record_uploaded_lease_signature(p_signer_id,'signed','rental-lease-files/'||d.storage_path,p_evidence_note);
 end if;
 select status into l.status from public.rental_leases where id=l.id;
 return to_jsonb(d)||jsonb_build_object('leaseStatus',l.status,'idempotent',false);
end; $$;
create function public.rental_register_lease_document(p_lease_id uuid,p_expected_version integer,p_upload_id uuid,p_kind text,p_signer_id uuid,p_storage_path text,p_file_name text,p_confirm_signed boolean default false,p_evidence_note text default null)
returns jsonb language sql security invoker set search_path='' as $$ select rental_private.register_lease_document(p_lease_id,p_expected_version,p_upload_id,p_kind,p_signer_id,p_storage_path,p_file_name,p_confirm_signed,p_evidence_note); $$;
revoke all on function rental_private.register_lease_document(uuid,integer,uuid,text,uuid,text,text,boolean,text),public.rental_register_lease_document(uuid,integer,uuid,text,uuid,text,text,boolean,text) from public,anon;
grant execute on function rental_private.register_lease_document(uuid,integer,uuid,text,uuid,text,text,boolean,text),public.rental_register_lease_document(uuid,integer,uuid,text,uuid,text,text,boolean,text) to authenticated;

-- Uploaded handover proof stays bound to this tenancy's current lease. Legacy
-- receipt references remain readable; retrying a saved item/photo is idempotent.
create function rental_private.assert_move_in_file(p_inspection_id uuid,p_evidence_link text,p_photo boolean)
returns void language plpgsql stable security definer set search_path='' as $$
declare selected_lease_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to review move-in evidence.'; end if;
 select i.lease_id into selected_lease_id from public.rental_incoming_inspections i join public.rental_tenancies t on t.id=i.tenancy_id join public.rental_properties p on p.id=t.property_id where i.id=p_inspection_id and public.rental_branch_access(p.organisation_id,p.branch_id);
 if not found then raise exception 'This incoming inspection is unavailable in your workspace.' using errcode='42501'; end if;
 if p_evidence_link like 'rental-lease-files/%' and not exists(select 1 from public.rental_lease_document_uploads d join public.rental_lease_versions v on v.id=d.lease_version_id where v.lease_id=selected_lease_id and v.is_current and d.kind='move_in_evidence' and 'rental-lease-files/'||d.storage_path=p_evidence_link and (not p_photo or d.mime_type in ('image/jpeg','image/png'))) then raise exception 'Choose uploaded evidence from this tenancy and current lease version.'; end if;
end; $$;
revoke all on function rental_private.assert_move_in_file(uuid,text,boolean) from public,anon,authenticated;

alter function public.rental_record_incoming_inspection_item(uuid,text,text,text) set schema rental_private;
alter function rental_private.rental_record_incoming_inspection_item(uuid,text,text,text) rename to record_incoming_item_before_uploads;
revoke all on function rental_private.record_incoming_item_before_uploads(uuid,text,text,text) from public,anon,authenticated;
create function rental_private.record_uploaded_incoming_item(p_item_id uuid,p_status text,p_note text,p_evidence_link text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.rental_incoming_inspection_items;
begin
 select * into item from public.rental_incoming_inspection_items where id=p_item_id for update;
 perform rental_private.assert_move_in_file(item.inspection_id,p_evidence_link,false);
 if item.status=p_status and item.evidence_link is not distinct from p_evidence_link and item.note is not distinct from nullif(btrim(coalesce(p_note,'')),'') then return jsonb_build_object('id',item.id,'status',item.status,'idempotent',true); end if;
 return rental_private.record_incoming_item_before_uploads(p_item_id,p_status,p_note,p_evidence_link);
end; $$;
create function public.rental_record_incoming_inspection_item(p_item_id uuid,p_status text,p_note text default null,p_evidence_link text default null) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.record_uploaded_incoming_item(p_item_id,p_status,p_note,p_evidence_link); $$;
revoke all on function rental_private.record_uploaded_incoming_item(uuid,text,text,text),public.rental_record_incoming_inspection_item(uuid,text,text,text) from public,anon;
grant execute on function rental_private.record_uploaded_incoming_item(uuid,text,text,text),public.rental_record_incoming_inspection_item(uuid,text,text,text) to authenticated;

alter function public.rental_link_incoming_inspection_media(uuid,text,text) set schema rental_private;
alter function rental_private.rental_link_incoming_inspection_media(uuid,text,text) rename to link_incoming_photo_before_uploads;
revoke all on function rental_private.link_incoming_photo_before_uploads(uuid,text,text) from public,anon,authenticated;
create function rental_private.link_uploaded_incoming_photo(p_inspection_id uuid,p_media_link text,p_caption text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 perform rental_private.assert_move_in_file(p_inspection_id,p_media_link,true);
 perform 1 from public.rental_incoming_inspections where id=p_inspection_id for update;
 select id into saved from public.rental_incoming_inspection_media where inspection_id=p_inspection_id and media_link=p_media_link;
 if saved is not null then return jsonb_build_object('id',saved,'idempotent',true); end if;
 return rental_private.link_incoming_photo_before_uploads(p_inspection_id,p_media_link,p_caption);
end; $$;
create function public.rental_link_incoming_inspection_media(p_inspection_id uuid,p_media_link text,p_caption text default null) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.link_uploaded_incoming_photo(p_inspection_id,p_media_link,p_caption); $$;
revoke all on function rental_private.link_uploaded_incoming_photo(uuid,text,text),public.rental_link_incoming_inspection_media(uuid,text,text) from public,anon;
grant execute on function rental_private.link_uploaded_incoming_photo(uuid,text,text),public.rental_link_incoming_inspection_media(uuid,text,text) to authenticated;

alter function public.rental_record_move_in_readiness(uuid,text,numeric,text,text) set schema rental_private;
alter function rental_private.rental_record_move_in_readiness(uuid,text,numeric,text,text) rename to record_readiness_before_uploads;
revoke all on function rental_private.record_readiness_before_uploads(uuid,text,numeric,text,text) from public,anon,authenticated;
create function rental_private.record_uploaded_readiness(p_readiness_item_id uuid,p_status text,p_received_amount numeric,p_evidence_link text,p_exception_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.rental_move_in_readiness_items; version public.rental_lease_versions;
begin
 if auth.uid() is null then raise exception 'Sign in to review move-in payment evidence.'; end if;
 select * into item from public.rental_move_in_readiness_items where id=p_readiness_item_id for update;
 if not found or not exists(select 1 from public.rental_tenancies t join public.rental_properties p on p.id=t.property_id where t.id=item.tenancy_id and public.rental_branch_access(p.organisation_id,p.branch_id)) then raise exception 'This payment readiness item is unavailable in your workspace.' using errcode='42501'; end if;
 select * into version from public.rental_lease_versions where lease_id=item.lease_id and is_current;
 if p_status in ('received','verified') and (version.terms_json->>'document_mode'='uploads_only' or p_evidence_link like 'rental-lease-files/%') and not exists(select 1 from public.rental_lease_document_uploads d where d.lease_version_id=version.id and d.kind='move_in_evidence' and 'rental-lease-files/'||d.storage_path=p_evidence_link) then raise exception 'Upload payment evidence for this current lease version.'; end if;
 if item.status=p_status and item.received_amount=p_received_amount and item.evidence_link is not distinct from p_evidence_link then return jsonb_build_object('id',item.id,'status',item.status,'received_amount',item.received_amount,'idempotent',true); end if;
 return rental_private.record_readiness_before_uploads(p_readiness_item_id,p_status,p_received_amount,p_evidence_link,p_exception_reason);
end; $$;
create function public.rental_record_move_in_readiness(p_readiness_item_id uuid,p_status text,p_received_amount numeric default null,p_evidence_link text default null,p_exception_reason text default null) returns jsonb language sql security invoker set search_path='' as $$ select rental_private.record_uploaded_readiness(p_readiness_item_id,p_status,p_received_amount,p_evidence_link,p_exception_reason); $$;
revoke all on function rental_private.record_uploaded_readiness(uuid,text,numeric,text,text),public.rental_record_move_in_readiness(uuid,text,numeric,text,text) from public,anon;
grant execute on function rental_private.record_uploaded_readiness(uuid,text,numeric,text,text),public.rental_record_move_in_readiness(uuid,text,numeric,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
