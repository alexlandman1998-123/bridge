begin;

-- Application subject references are not canonical contact UUIDs. Preserve that
-- distinction until an agent links a contact; never invent a directory party.
alter table public.rental_tenancy_parties alter column party_id drop not null;
alter table public.rental_tenancy_parties add column source_subject_id text, add column details_json jsonb not null default '{}';
alter table public.rental_tenancy_parties drop constraint rental_tenancy_parties_role_check;
alter table public.rental_tenancy_parties add constraint rental_tenancy_parties_role_check check(role in ('tenant','occupant','guarantor','tenant_representative'));
create unique index rental_tenancy_parties_subject_unique on public.rental_tenancy_parties(tenancy_id,source_subject_id) where source_subject_id is not null;
alter table public.rental_lease_signers drop constraint rental_lease_signers_signer_role_check;
alter table public.rental_lease_signers drop constraint rental_lease_signers_lease_version_id_signer_role_key;
alter table public.rental_lease_signers add constraint rental_lease_signers_signer_role_check check(signer_role in ('tenant','landlord','tenant_representative','guarantor'));
alter table public.rental_lease_signers add column source_subject_id text, add column authority_basis text;
create unique index rental_lease_signers_subject_unique on public.rental_lease_signers(lease_version_id,source_subject_id) where source_subject_id is not null;

-- Explicit allowlist: screening, income, banking, documents and consents never
-- enter a lease schedule. Authoritative facts come from the approved snapshot.
create function public.rental_lease_application_projection(p_data jsonb, p_terms jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare entity_type text:=coalesce(p_data #>> '{entity,type}','individual'); entity_tenant boolean; people jsonb:='[]'; person jsonb; role_name text; primary_role text;
begin
  entity_tenant:=entity_type in ('company','close_corporation','trust');
  primary_role:=case when entity_tenant then 'tenant_representative' else 'tenant' end;
  if not entity_tenant or p_data #>> '{entity,primaryContactRole}' in ('authorised_signatory','trustee') then
    people:=people || jsonb_build_array(jsonb_build_object('subjectId','primary','role',primary_role,
      'name',btrim(concat_ws(' ',p_data #>> '{identity,firstName}',p_data #>> '{identity,lastName}')),
      'email',coalesce(p_data #>> '{identity,email}',''),'phone',coalesce(p_data #>> '{identity,phone}',''),
      'identityType',coalesce(p_data #>> '{identity,identityType}',''),'identityNumber',coalesce(p_data #>> '{identity,identityNumber}',''),
      'noticeAddress',coalesce(p_terms->>'tenant_notice_address',p_data #>> '{contacts,postalAddress}',p_data #>> '{rentalHistory,currentAddress}',''),
      'authorityBasis',case when entity_tenant then coalesce(p_terms->>'primary_authority_basis','') else '' end));
  end if;
  for person in select value from jsonb_array_elements(coalesce(p_data->'people','[]')) loop
    role_name:=case when person->>'role'='guarantor' then 'guarantor'
      when not entity_tenant and person->>'role'='co_tenant' then 'tenant'
      when entity_tenant and person->>'role' in ('authorised_signatory','trustee') then 'tenant_representative' else null end;
    if role_name is not null then
      people:=people || jsonb_build_array(jsonb_build_object('subjectId',person->>'id','role',role_name,
        'name',btrim(concat_ws(' ',person->>'firstName',person->>'lastName')),'email',coalesce(person->>'email',''),'phone',coalesce(person->>'phone',''),
        'identityType',coalesce(person->>'identityType',''),'identityNumber',coalesce(person->>'identityNumber',''),
        'noticeAddress',coalesce(nullif(p_terms #>> array['party_notice_addresses',person->>'id'],''),nullif(person->>'currentAddress',''),p_terms->>'tenant_notice_address',''),
        'authorityBasis',case when role_name='tenant_representative' then coalesce(person->>'authorityBasis','') else '' end));
    end if;
  end loop;
  return jsonb_build_object('schemaVersion','rental_lease_schedule_v1',
    'tenant',case when entity_tenant then jsonb_build_object('type',entity_type,'name',p_data #>> '{entity,legalName}','registrationNumber',p_data #>> '{entity,registrationNumber}','registeredAddress',p_data #>> '{entity,registeredAddress}') else jsonb_build_object('type',entity_type,'name',btrim(concat_ws(' ',p_data #>> '{identity,firstName}',p_data #>> '{identity,lastName}'))) end,
    'parties',people,'property',jsonb_build_object('title',p_data #>> '{property,title}','address',p_data #>> '{property,address}','unitId',p_data #>> '{property,unitId}'),
    'terms',jsonb_build_object('leaseStartDate',p_terms->>'lease_start_date','leaseEndDate',p_terms->>'lease_end_date','occupationDate',coalesce(p_terms->>'occupation_date',p_terms->>'intended_occupation_date'),'monthlyRent',p_terms->'monthly_rent','depositAmount',p_terms->'deposit_amount'),
    'tenantNoticeAddress',coalesce(p_terms->>'tenant_notice_address',p_data #>> '{contacts,postalAddress}',p_data #>> '{rentalHistory,currentAddress}',''),
    'landlord',jsonb_build_object('name',coalesce(p_terms->>'landlord_name',''),'email',coalesce(p_terms->>'landlord_email',''),'noticeAddress',coalesce(p_terms->>'landlord_notice_address','')),
    'agreement',jsonb_build_object('templateReference',coalesce(p_terms->>'agreement_template_reference',''),'documentLink',coalesce(p_terms->>'agreement_document_link','')));
end; $$;
revoke all on function public.rental_lease_application_projection(jsonb,jsonb) from public,anon,authenticated;

create function public.rental_populate_tenancy_application_parties() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; snapshot jsonb;
begin
 select tenant_snapshot_json into snapshot from public.rental_tenancies where id=new.tenancy_id;
 if snapshot #>> '{entity,type}' in ('company','close_corporation','trust') then
   update public.rental_tenancy_parties set source_subject_id='entity',details_json=public.rental_lease_application_projection(snapshot,new.terms_json)->'tenant' where tenancy_id=new.tenancy_id and is_primary and role='tenant';
   if not found then
     insert into public.rental_tenancy_parties(tenancy_id,organisation_id,source_subject_id,role,is_primary,details_json) values(new.tenancy_id,new.organisation_id,'entity','tenant',true,public.rental_lease_application_projection(snapshot,new.terms_json)->'tenant');
   end if;
 end if;
 for item in select value from jsonb_array_elements(public.rental_lease_application_projection(snapshot,new.terms_json)->'parties') loop
   if item->>'subjectId'='primary' and item->>'role'='tenant' and exists(select 1 from public.rental_tenancy_parties where tenancy_id=new.tenancy_id and is_primary and role='tenant') then
     update public.rental_tenancy_parties set source_subject_id='primary',details_json=item where tenancy_id=new.tenancy_id and is_primary and role='tenant';
   else
     insert into public.rental_tenancy_parties(tenancy_id,organisation_id,source_subject_id,role,is_primary,details_json)
     values(new.tenancy_id,new.organisation_id,item->>'subjectId',item->>'role',item->>'subjectId'='primary' and item->>'role'='tenant',item) on conflict do nothing;
   end if;
 end loop;
 return new;
end; $$;
revoke all on function public.rental_populate_tenancy_application_parties() from public,anon,authenticated;
create trigger trg_rental_leases_populate_application_parties after insert on public.rental_leases for each row execute function public.rental_populate_tenancy_application_parties();

update public.rental_tenancy_parties tp set source_subject_id='entity',details_json=public.rental_lease_application_projection(t.tenant_snapshot_json,l.terms_json)->'tenant'
from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id
where tp.tenancy_id=t.id and tp.role='tenant' and tp.is_primary and tp.source_subject_id is null and t.tenant_snapshot_json #>> '{entity,type}' in ('company','close_corporation','trust');
insert into public.rental_tenancy_parties(tenancy_id,organisation_id,source_subject_id,role,is_primary,details_json)
select t.id,t.organisation_id,'entity','tenant',true,public.rental_lease_application_projection(t.tenant_snapshot_json,l.terms_json)->'tenant'
from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id
where t.tenant_snapshot_json #>> '{entity,type}' in ('company','close_corporation','trust') and not exists(select 1 from public.rental_tenancy_parties tp where tp.tenancy_id=t.id and tp.role='tenant' and tp.is_primary)
on conflict do nothing;

-- Existing conversions receive the same source references without duplicating
-- canonical primary contacts or replacing their IDs.
update public.rental_tenancy_parties tp set source_subject_id='primary', details_json=x.value
from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id
cross join lateral jsonb_array_elements(public.rental_lease_application_projection(t.tenant_snapshot_json,l.terms_json)->'parties') x
where tp.tenancy_id=t.id and tp.role='tenant' and tp.is_primary and tp.source_subject_id is null and x.value->>'subjectId'='primary' and x.value->>'role'='tenant';
insert into public.rental_tenancy_parties(tenancy_id,organisation_id,source_subject_id,role,is_primary,details_json)
select t.id,t.organisation_id,x.value->>'subjectId',x.value->>'role',x.value->>'subjectId'='primary' and x.value->>'role'='tenant',x.value
from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id
cross join lateral jsonb_array_elements(public.rental_lease_application_projection(t.tenant_snapshot_json,l.terms_json)->'parties') x
where length(btrim(coalesce(x.value->>'name','')))>0 and not(x.value->>'subjectId'='primary' and x.value->>'role'='tenant' and exists(select 1 from public.rental_tenancy_parties tp where tp.tenancy_id=t.id and tp.is_primary and tp.role='tenant'))
on conflict do nothing;

create function public.rental_get_lease_application_projection(p_lease_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication is required'; end if;
 select public.rental_lease_application_projection(t.tenant_snapshot_json,v.terms_json) into result from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id join public.rental_properties p on p.id=t.property_id join public.rental_lease_versions v on v.lease_id=l.id and v.is_current where l.id=p_lease_id and public.rental_branch_access(p.organisation_id,p.branch_id);
 if result is null then raise exception 'Lease not found or not authorized'; end if;
 return result;
end; $$;
revoke all on function public.rental_get_lease_application_projection(uuid) from public,anon;
grant execute on function public.rental_get_lease_application_projection(uuid) to authenticated;

-- Preserve the established draft-version command and its date/rent guards.
alter function public.rental_save_lease_draft(uuid,integer,jsonb) rename to rental_save_lease_draft_before_application_handoff;
revoke all on function public.rental_save_lease_draft_before_application_handoff(uuid,integer,jsonb) from public,anon,authenticated;
create function public.rental_save_lease_draft(p_lease_id uuid,p_expected_version integer,p_terms_json jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; terms jsonb; result jsonb;
begin
 if auth.uid() is null or p_expected_version is null then raise exception 'Authentication and current lease version are required'; end if;
 select t.tenant_snapshot_json into snapshot from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id join public.rental_properties p on p.id=t.property_id where l.id=p_lease_id and public.rental_branch_access(p.organisation_id,p.branch_id);
 if snapshot is null then raise exception 'Lease not found or not authorized'; end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into terms from jsonb_each(p_terms_json) where key in ('lease_start_date','lease_end_date','occupation_date','monthly_rent','deposit_amount','escalation','tenant_notice_address','landlord_name','landlord_email','landlord_notice_address','primary_authority_basis','party_notice_addresses','agreement_template_reference','agreement_document_link');
 if terms ? 'party_notice_addresses' and (jsonb_typeof(terms->'party_notice_addresses')<>'object' or exists(select 1 from jsonb_each(terms->'party_notice_addresses') x where jsonb_typeof(x.value)<>'string')) then raise exception 'Party notice addresses must be text values'; end if;
 terms:=terms || jsonb_build_object('application_schedule',public.rental_lease_application_projection(snapshot,terms));
 result:=public.rental_save_lease_draft_before_application_handoff(p_lease_id,p_expected_version,terms);
 return result;
end; $$;
revoke all on function public.rental_save_lease_draft(uuid,integer,jsonb) from public,anon;
grant execute on function public.rental_save_lease_draft(uuid,integer,jsonb) to authenticated;

create or replace function public.rental_prepare_lease_signing(p_lease_id uuid,p_expected_version integer,p_signers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if length(btrim(schedule #>> '{agreement,templateReference}'))=0 or coalesce(schedule #>> '{agreement,documentLink}','') !~ '^https?://[^[:space:]]+$' then raise exception 'A reviewed agreement document and template reference are required'; end if;
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
create or replace function public.rental_record_lease_signature(p_signer_id uuid, p_outcome text, p_document_link text default null, p_evidence_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare signer_row public.rental_lease_signers%rowtype; lease_row public.rental_leases%rowtype; all_signed boolean; tenant_pending boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_outcome not in ('signed', 'declined') then raise exception 'Invalid signer outcome'; end if;
  if p_outcome = 'signed' and length(btrim(coalesce(p_document_link, ''))) = 0 then raise exception 'A signed document link is required'; end if;
  select signer.* into signer_row from public.rental_lease_signers signer where signer.id = p_signer_id ;
  if not found then raise exception 'Lease signer not found'; end if;
  select lease.* into lease_row from public.rental_leases lease join public.rental_lease_versions version on version.lease_id = lease.id where version.id = signer_row.lease_version_id for update of lease;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = lease_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this lease'; end if;
  if not exists(select 1 from public.rental_lease_versions where id=signer_row.lease_version_id and is_current) then raise exception 'This signature belongs to an old lease version'; end if;
  select * into signer_row from public.rental_lease_signers where id=p_signer_id for update;
  if lease_row.status = 'signed' then raise exception 'This lease is already signed'; end if;
  update public.rental_lease_signers set status = p_outcome, signed_at = case when p_outcome = 'signed' then now() else null end, signed_document_link = case when p_outcome = 'signed' then btrim(p_document_link) else null end, evidence_note = nullif(btrim(coalesce(p_evidence_note, '')), ''), evidence_recorded_by = auth.uid() where id = signer_row.id;
  insert into public.rental_lease_signing_events(lease_version_id, signer_id, organisation_id, event_type, evidence_json, occurred_by) values (signer_row.lease_version_id, signer_row.id, signer_row.organisation_id, case when p_outcome = 'signed' then 'signer_signed' else 'signer_declined' end, jsonb_build_object('document_link', nullif(btrim(coalesce(p_document_link, '')), ''), 'note', nullif(btrim(coalesce(p_evidence_note, '')), '')), auth.uid());
  select bool_and(status = 'signed'), bool_or(signer_role <> 'landlord' and status <> 'signed') into all_signed, tenant_pending from public.rental_lease_signers where lease_version_id = signer_row.lease_version_id;
  if all_signed then
    update public.rental_leases set status = 'signed' where id = lease_row.id;
    insert into public.rental_lease_signing_events(lease_version_id, organisation_id, event_type, occurred_by) values (signer_row.lease_version_id, signer_row.organisation_id, 'lease_signed', auth.uid());
  elsif tenant_pending then update public.rental_leases set status = 'awaiting_tenant' where id = lease_row.id;
  else update public.rental_leases set status = 'awaiting_landlord' where id = lease_row.id; end if;
  return jsonb_build_object('lease_id', lease_row.id, 'status', case when all_signed then 'signed' when tenant_pending then 'awaiting_tenant' else 'awaiting_landlord' end);
end; $$;

create or replace function public.rental_reopen_lease_signer(p_signer_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare signer_row public.rental_lease_signers%rowtype; lease_row public.rental_leases%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A recovery reason is required'; end if;
  select signer.* into signer_row from public.rental_lease_signers signer where signer.id = p_signer_id ;
  if not found then raise exception 'Lease signer not found'; end if;
  select lease.* into lease_row from public.rental_leases lease join public.rental_lease_versions version on version.lease_id = lease.id where version.id = signer_row.lease_version_id for update of lease;
  if not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = lease_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this lease'; end if;
  if not exists(select 1 from public.rental_lease_versions where id=signer_row.lease_version_id and is_current) then raise exception 'This signature belongs to an old lease version'; end if;
  select * into signer_row from public.rental_lease_signers where id=p_signer_id for update;
  if lease_row.status = 'signed' then raise exception 'Create a new lease version to recover a signed lease'; end if;
  update public.rental_lease_signers set status = 'pending', signed_at = null, signed_document_link = null, evidence_note = btrim(p_reason), evidence_recorded_by = auth.uid() where id = signer_row.id;
  update public.rental_leases set status = case when signer_row.signer_role <> 'landlord' then 'awaiting_tenant' else 'awaiting_landlord' end where id = lease_row.id;
  insert into public.rental_lease_signing_events(lease_version_id, signer_id, organisation_id, event_type, evidence_json, occurred_by) values (signer_row.lease_version_id, signer_row.id, signer_row.organisation_id, 'signer_reopened', jsonb_build_object('reason', btrim(p_reason)), auth.uid());
  return jsonb_build_object('lease_id', lease_row.id, 'status', case when signer_row.signer_role <> 'landlord' then 'awaiting_tenant' else 'awaiting_landlord' end);
end; $$;


commit;
