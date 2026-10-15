begin;

-- Read through existing RLS. Historical/paused rows provide context for saved
-- applications; only explicitly eligible rows can be selected for new intake.
create function public.rental_tenant_application_choices(p_organisation_id uuid, p_branch_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(entry order by title,unit_label),'[]'::jsonb) from (
    select p.name title,u.unit_label,jsonb_build_object(
      'id',v.id,'organisationId',v.organisation_id,'branchId',v.branch_id,'propertyId',p.id,'unitId',u.id,'listingId',l.id,
      'title',coalesce(nullif(l.title,''),p.name),'address',concat_ws(', ',p.address_line_1,p.suburb,p.city),'unitLabel',u.unit_label,
      'askingRent',v.asking_rent,'depositAmount',v.deposit_amount,'availableFrom',v.available_from,'leaseTermMonths',v.lease_term_months,'status',v.status,
      'eligible',v.status in ('marketing','applications_open') and u.active_tenancy_id is null and u.status in ('vacant','marketing','application_pending','lease_pending')
        and coalesce(l.listing_status,'') not in ('withdrawn','deleted','sold','let','rented') and coalesce(l.listing_visibility,'') not in ('archived','deleted')
        and coalesce(l.seller_canonical_facts_json#>>'{rentalInfo,rentalPriceFrequency}','monthly')='monthly') entry
    from public.rental_vacancies v join public.rental_properties p on p.id=v.property_id
      join public.rental_units u on u.id=v.unit_id join public.private_listings l on l.rental_vacancy_id=v.id
    where auth.uid() is not null and v.organisation_id=p_organisation_id and p.organisation_id=v.organisation_id and u.organisation_id=v.organisation_id
      and l.organisation_id=v.organisation_id and l.listing_category='rental' and l.rental_property_id=p.id and l.rental_unit_id=u.id
      and (p_branch_id is null or v.branch_id=p_branch_id)
  ) available;
$$;
revoke all on function public.rental_tenant_application_choices(uuid,uuid) from public,anon;
grant execute on function public.rental_tenant_application_choices(uuid,uuid) to authenticated;

-- Lock the lead before checking duplicates, including direct table inserts.
-- Existing identities are retained on ordinary edits; submitted snapshots remain
-- protected by the existing evidence/review guards.
create function public.rental_application_lead_binding_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare l public.leads; m jsonb; listing public.private_listings;
begin
  if tg_op='UPDATE' and (new.lead_id is distinct from old.lead_id or new.vacancy_id is distinct from old.vacancy_id or new.unit_id is distinct from old.unit_id or new.organisation_id is distinct from old.organisation_id or new.applicant_party_id is distinct from old.applicant_party_id) then raise exception 'A saved application must retain its tenant lead and vacancy.'; end if;
  if tg_op='INSERT' and auth.uid() is not null and new.lead_id is null then raise exception 'Start this application from a separate tenant lead.' using errcode='42501'; end if;
  if tg_op='INSERT' and auth.uid() is not null and new.status<>'draft' then raise exception 'New applications must start as a draft.'; end if;
  if new.lead_id is not null and (tg_op='INSERT' or new.lead_id is distinct from old.lead_id or new.vacancy_id is distinct from old.vacancy_id or new.organisation_id is distinct from old.organisation_id) then
    select * into l from public.leads where lead_id=new.lead_id for update;
    m:=public.rental_lead_payload_metadata(l.raw_enquiry_payload);
    if not found or l.organisation_id is distinct from new.organisation_id or l.lead_domain is distinct from 'agency'
      or not public.rental_lead_payload_is_rental(l.raw_enquiry_payload) or lower(btrim(coalesce(m->>'role',case when l.lead_category='seller' then 'landlord' else 'tenant' end))) is distinct from 'tenant' then raise exception 'Use a separate tenant lead in this organisation.' using errcode='42501'; end if;
    if l.contact_id is null or not exists(select 1 from public.contacts where contact_id=l.contact_id and organisation_id=new.organisation_id) then raise exception 'Link a saved tenant contact before preparing the application.'; end if;
    if new.applicant_party_id is not null and new.applicant_party_id is distinct from l.contact_id then raise exception 'The application contact must match its tenant lead.'; end if;
    new.applicant_party_id:=l.contact_id;
    if public.rental_lead_normalize_stage(coalesce(m->>'stage',l.stage),'tenant')<>'application_pending' then raise exception 'Complete the tenant journey to Application pending before creating an application.'; end if;
    if exists(select 1 from public.rental_applications where lead_id=new.lead_id and vacancy_id=new.vacancy_id and status<>'withdrawn' and id<>new.id) then raise exception 'This tenant already has a saved application for this vacancy. Open that application.' using errcode='23505'; end if;
  end if;
  select * into listing from public.private_listings where rental_vacancy_id=new.vacancy_id and organisation_id=new.organisation_id;
  if tg_op='INSERT' and new.lead_id is not null then
    if listing.id is null or listing.listing_category<>'rental' then raise exception 'Connect the vacancy to its rental listing before taking applications.'; end if;
    if listing.listing_status in ('withdrawn','deleted','sold','let','rented') or listing.listing_visibility in ('archived','deleted') or coalesce(listing.seller_canonical_facts_json#>>'{rentalInfo,rentalPriceFrequency}','monthly')<>'monthly' then raise exception 'This listing is not available for a new monthly rental application.'; end if;
    if not exists(select 1 from public.rental_vacancies v join public.rental_units u on u.id=v.unit_id where v.id=new.vacancy_id and v.status in ('marketing','applications_open') and u.active_tenancy_id is null and u.status in ('vacant','marketing','application_pending','lease_pending')) then raise exception 'This vacancy is not available for a new application.'; end if;
  end if;
  if found then
    if new.application_data#>>'{property,listingId}' is not null and new.application_data#>>'{property,listingId}'<>listing.id::text then raise exception 'The application must retain its selected rental listing.'; end if;
    if tg_op='INSERT' and new.lead_id is not null then
      new.application_data:=jsonb_set(new.application_data,'{property}',coalesce(new.application_data->'property','{}')||jsonb_build_object('listingId',listing.id,'vacancyId',new.vacancy_id,'unitId',new.unit_id,'propertyId',listing.rental_property_id));
    end if;
  end if;
  if new.application_data#>>'{property,vacancyId}' is not null and new.application_data#>>'{property,vacancyId}'<>new.vacancy_id::text then raise exception 'The application must retain its selected vacancy.'; end if;
  if new.application_data#>>'{property,unitId}' is not null and new.application_data#>>'{property,unitId}'<>new.unit_id::text then raise exception 'The application must retain its selected unit.'; end if;
  if tg_op='UPDATE' and old.application_data#>>'{property,listingId}' is not null and new.application_data#>>'{property,listingId}' is distinct from old.application_data#>>'{property,listingId}' then raise exception 'The saved application listing reference cannot be replaced.'; end if;
  return new;
end;
$$;
revoke all on function public.rental_application_lead_binding_guard() from public,anon,authenticated;
create trigger rental_application_lead_binding_guard before insert or update on public.rental_applications for each row execute function public.rental_application_lead_binding_guard();

create function public.rental_prepare_tenant_application(p_organisation_id uuid,p_lead_id uuid,p_vacancy_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.leads; v public.rental_vacancies; u public.rental_units; p public.rental_properties; listing public.private_listings; a public.rental_applications; c public.contacts;
  m jsonb; rel jsonb; property_data jsonb; count_apps integer;
begin
  if auth.uid() is null then raise exception 'Sign in to prepare a tenant application.' using errcode='42501'; end if;
  select * into l from public.leads where lead_id=p_lead_id and organisation_id=p_organisation_id for update;
  m:=public.rental_lead_payload_metadata(l.raw_enquiry_payload);
  if not found or l.lead_domain is distinct from 'agency' or not public.rental_lead_payload_is_rental(l.raw_enquiry_payload) or lower(btrim(coalesce(m->>'role',case when l.lead_category='seller' then 'landlord' else 'tenant' end))) is distinct from 'tenant' then raise exception 'Use a separate tenant lead in this organisation.' using errcode='42501'; end if;
  select * into v from public.rental_vacancies where id=p_vacancy_id and organisation_id=p_organisation_id for share;
  if not found then raise exception 'Choose a saved vacancy in this workspace.' using errcode='42501'; end if;
  select * into listing from public.private_listings where rental_vacancy_id=v.id and organisation_id=p_organisation_id and listing_category='rental' for share;
  if not found then raise exception 'Connect this vacancy to its rental listing before taking applications.'; end if;
  select * into u from public.rental_units where id=v.unit_id and property_id=v.property_id and organisation_id=p_organisation_id for share;
  select * into p from public.rental_properties where id=v.property_id and organisation_id=p_organisation_id;
  if u.id is null or p.id is null or listing.rental_unit_id is distinct from u.id or listing.rental_property_id is distinct from p.id or (l.branch_id is not null and v.branch_id is distinct from l.branch_id) then raise exception 'Choose the listing, unit and vacancy in this tenant workspace.' using errcode='42501'; end if;
  select count(*) into count_apps from public.rental_applications where lead_id=l.lead_id and vacancy_id=v.id and status<>'withdrawn';
  if count_apps>1 then raise exception 'Multiple applications exist for this tenant and vacancy. Review them before continuing.'; end if;
  select * into a from public.rental_applications where lead_id=l.lead_id and vacancy_id=v.id and status<>'withdrawn' for update;
  rel:=coalesce(m->'relationships','{}');
  if jsonb_typeof(rel)<>'object' then raise exception 'Review this tenant lead’s saved connections before continuing.'; end if;
  if nullif(rel->>'applicationId','') is not null and rel->>'applicationId' is distinct from a.id::text and public.rental_lead_normalize_stage(coalesce(m->>'stage',l.stage),'tenant')<>'application_pending' then raise exception 'Continue with the application already linked to this tenant journey.'; end if;
  if a.id is null then
    if public.rental_lead_normalize_stage(coalesce(m->>'stage',l.stage),'tenant')<>'application_pending' then raise exception 'Complete the tenant journey to Application pending before creating an application.'; end if;
    if v.status not in ('marketing','applications_open') or u.active_tenancy_id is not null or u.status not in ('vacant','marketing','application_pending','lease_pending')
      or listing.listing_status in ('withdrawn','deleted','sold','let','rented') or listing.listing_visibility in ('archived','deleted') or coalesce(listing.seller_canonical_facts_json#>>'{rentalInfo,rentalPriceFrequency}','monthly')<>'monthly' then raise exception 'This vacancy is not available for a new monthly rental application.'; end if;
    select * into c from public.contacts where contact_id=l.contact_id and organisation_id=p_organisation_id;
    if not found then raise exception 'Link a saved tenant contact before preparing the application.'; end if;
    property_data:=jsonb_build_object('listingId',listing.id,'vacancyId',v.id,'unitId',u.id,'propertyId',p.id,'title',coalesce(nullif(listing.title,''),p.name),'unitLabel',u.unit_label,
      'address',concat_ws(', ',p.address_line_1,p.suburb,p.city),'monthlyRent',v.asking_rent,'depositAmount',v.deposit_amount);
    insert into public.rental_applications(organisation_id,lead_id,vacancy_id,unit_id,applicant_party_id,application_data,created_by)
    values(p_organisation_id,l.lead_id,v.id,u.id,c.contact_id,jsonb_build_object('schemaVersion','arch9_rental_application_fields_v2','entity',jsonb_build_object('type','individual'),
      'identity',jsonb_build_object('firstName',coalesce(c.first_name,''),'lastName',coalesce(c.last_name,''),'email',coalesce(c.email,''),'phone',coalesce(c.phone,'')),
      'property',property_data,'household',jsonb_build_object('leasePeriodMonths',coalesce(v.lease_term_months::text,''),'intendedOccupationDate',coalesce(nullif(m#>>'{qualification,occupationDate}',''),v.available_from::text,''))),auth.uid()) returning * into a;
  elsif a.unit_id is distinct from u.id or a.organisation_id is distinct from p_organisation_id then raise exception 'The saved application does not match this tenant vacancy.';
  end if;
  -- A legacy submitted application is linked by its vacancy; its signed answers
  -- and uploads are never rewritten to retrofit a missing listing field.
  rel:=rel||jsonb_build_object('applicationId',a.id,'vacancyId',v.id,'unitId',u.id,'propertyId',p.id,'listingId',listing.id,
    'enquiryListingId',coalesce(nullif(rel->>'enquiryListingId',''),l.enquired_listing_id::text,nullif(l.listing_id,''),nullif(rel->>'listingId','')));
  m:=jsonb_set(m,'{relationships}',rel);
  update public.leads set raw_enquiry_payload=(m-'rentalCrm'-'rental_crm') where lead_id=l.lead_id;
  if not found then raise exception 'The application was not linked to its tenant lead.' using errcode='42501'; end if;
  return to_jsonb(a);
end;
$$;
revoke all on function public.rental_prepare_tenant_application(uuid,uuid,uuid) from public,anon;
grant execute on function public.rental_prepare_tenant_application(uuid,uuid,uuid) to authenticated;

create function public.rental_issue_tenant_application_access(p_application_id uuid,p_expected_version integer,p_token_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.rental_applications; access_id uuid:=gen_random_uuid(); issued timestamptz:=statement_timestamp();
begin
  if auth.uid() is null then raise exception 'Sign in to prepare an application link.' using errcode='42501'; end if;
  select * into a from public.rental_applications where id=p_application_id for update;
  if not found or a.status<>'draft' then raise exception 'Open the submitted application to collect its outstanding documents.'; end if;
  if a.version is distinct from p_expected_version then raise exception 'This application changed. Refresh before preparing its link.' using errcode='40001'; end if;
  if p_token_hash is null or p_expires_at is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at<=issued or p_expires_at>issued+interval '30 days' then raise exception 'Choose a valid application link expiry.'; end if;
  insert into public.rental_application_access_tokens(id,application_id,token_hash,expires_at,created_by) values(access_id,a.id,p_token_hash,p_expires_at,auth.uid());
  update public.rental_application_access_tokens set revoked_at=issued where application_id=a.id and id<>access_id and revoked_at is null and nullif(subject_id,'') is null;
  update public.rental_applications set application_data=jsonb_set(application_data,'{onboarding}',coalesce(application_data->'onboarding','{}')||jsonb_build_object('accessId',access_id,'issuedAt',issued,'expiresAt',p_expires_at,'sentAt','','revokedAt','')),version=version+1 where id=a.id returning * into a;
  if not found then raise exception 'The application link could not be saved.'; end if;
  return jsonb_build_object('id',access_id,'expiresAt',p_expires_at,'application',to_jsonb(a));
end;
$$;
revoke all on function public.rental_issue_tenant_application_access(uuid,integer,text,timestamptz) from public,anon;
grant execute on function public.rental_issue_tenant_application_access(uuid,integer,text,timestamptz) to authenticated;

create function public.rental_revoke_tenant_application_access(p_application_id uuid,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.rental_applications; revoked timestamptz:=statement_timestamp(); access_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to manage an application link.' using errcode='42501'; end if;
  select * into a from public.rental_applications where id=p_application_id for update;
  if not found or a.status<>'draft' then raise exception 'Only a draft application invitation can be revoked.'; end if;
  if a.version is distinct from p_expected_version then raise exception 'This application changed. Refresh before revoking its link.' using errcode='40001'; end if;
  access_id:=nullif(a.application_data#>>'{onboarding,accessId}','')::uuid;
  if access_id is null then raise exception 'This draft has no saved invitation.'; end if;
  if nullif(a.application_data#>>'{onboarding,revokedAt}','') is not null then return to_jsonb(a); end if;
  update public.rental_application_access_tokens set revoked_at=coalesce(revoked_at,revoked) where id=access_id and application_id=a.id and nullif(subject_id,'') is null;
  if not found then raise exception 'This invitation could not be revoked. Refresh its saved details.'; end if;
  update public.rental_applications set application_data=jsonb_set(application_data,'{onboarding,revokedAt}',to_jsonb(revoked)),version=version+1 where id=a.id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.rental_revoke_tenant_application_access(uuid,integer) from public,anon;
grant execute on function public.rental_revoke_tenant_application_access(uuid,integer) to authenticated;

-- Consent and submission either commit together or leave the draft untouched.
-- Only the token-authorised server endpoint may call this command.
create function public.rental_submit_tenant_application(p_application_id uuid,p_expected_version integer,p_declaration_accepted boolean,p_consents jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.rental_applications; submitted timestamptz:=statement_timestamp(); kind text;
begin
  select * into a from public.rental_applications where id=p_application_id for update;
  if not found then raise exception 'This application is unavailable.'; end if;
  if a.status<>'draft' then
    if a.submitted_at is not null and a.status in ('submitted','under_review','approved','declined') and p_expected_version>0 and p_expected_version<a.version then return to_jsonb(a); end if;
    raise exception 'This application can no longer be submitted.';
  end if;
  if a.version is distinct from p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode='40001'; end if;
  if a.application_data->>'schemaVersion'='arch9_rental_application_fields_v2' and p_declaration_accepted is distinct from true then raise exception 'Confirm your declaration and authority to submit.'; end if;
  if jsonb_typeof(p_consents) is distinct from 'array' then raise exception 'Accept every required consent before submitting.'; end if;
  foreach kind in array array['privacy','credit_check','identity_verification'] loop
    if not coalesce(p_consents ? kind,false) then raise exception 'Accept every required consent before submitting.'; end if;
    insert into public.rental_application_consents(application_id,organisation_id,consent_type,wording_version,accepted_at,source,evidence_json)
    values(a.id,a.organisation_id,kind,'rental-application-consent-v1:submission-'||a.version||':'||submitted::text,submitted,'applicant',jsonb_build_object('accepted',true,'submitted_at',submitted,'subject','primary','source','applicant','declarationAccepted',p_declaration_accepted,'entityType',coalesce(a.application_data#>>'{entity,type}','individual'),'primaryContactRole',coalesce(a.application_data#>>'{entity,primaryContactRole}','applicant')));
  end loop;
  update public.rental_applications set status='submitted',submitted_at=submitted,submitted_snapshot_json=application_data,version=version+1 where id=a.id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.rental_submit_tenant_application(uuid,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.rental_submit_tenant_application(uuid,integer,boolean,jsonb) to service_role;

commit;
