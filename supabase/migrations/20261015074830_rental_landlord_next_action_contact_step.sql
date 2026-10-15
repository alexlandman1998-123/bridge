begin;

-- Preserve the existing role, scope, history, mandate and listing guards.
create or replace function public.rental_guard_lead_journey()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  metadata jsonb; previous jsonb; evidence jsonb; qualification jsonb;
  role_name text; old_role text; next_stage text; previous_stage text;
  stages text[]; linked_id uuid; listing_ref text; links_changed boolean; app public.rental_applications; check_kind text; subject record; result jsonb;
  was_rental boolean := false; is_rental boolean; expected_category text;
begin
  is_rental := public.rental_lead_payload_is_rental(new.raw_enquiry_payload);
  if tg_op='UPDATE' then
    was_rental := coalesce(old.lead_domain='agency',false) and public.rental_lead_payload_is_rental(old.raw_enquiry_payload);
    if was_rental and old.lead_domain='agency' and new.lead_domain is distinct from old.lead_domain then
      raise exception 'A rental lead must retain its saved CRM domain.' using errcode='22023';
    end if;
    if was_rental and not is_rental then
      raise exception 'Rental classification cannot be removed from a saved lead.' using errcode='22023';
    end if;
  end if;
  if new.lead_domain is distinct from 'agency' then return new; end if;
  if not is_rental then
    if tg_op='INSERT' or new.listing_id is distinct from old.listing_id or new.enquired_listing_id is distinct from old.enquired_listing_id
       or new.raw_enquiry_payload#>>'{relationships,listingId}' is distinct from old.raw_enquiry_payload#>>'{relationships,listingId}' then
      for listing_ref in select distinct ref from unnest(array[new.listing_id,new.enquired_listing_id::text,new.raw_enquiry_payload#>>'{relationships,listingId}']) links(ref) where nullif(btrim(ref),'') is not null loop
        if listing_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          if exists(select 1 from public.private_listings where id=listing_ref::uuid and organisation_id=new.organisation_id and lower(listing_category)='rental') then
            raise exception 'Rental property enquiries must use a separate tenant or landlord lead.' using errcode='22023';
          end if;
        end if;
      end loop;
    end if;
    return new;
  end if;
  metadata := public.rental_lead_payload_metadata(new.raw_enquiry_payload);
  role_name := lower(btrim(coalesce(nullif(metadata->>'role',''),case when new.lead_category='seller' then 'landlord' else 'tenant' end)));
  if role_name in ('owner','lessor') then role_name := 'landlord'; end if;
  if role_name not in ('tenant','landlord') then raise exception 'Choose Tenant or Landlord for the rental journey.' using errcode='22023'; end if;
  expected_category := case when role_name='landlord' then 'seller' else 'buyer' end;
  if new.lead_category is distinct from expected_category then
    raise exception 'Rental lead category must match its saved tenant or landlord role.' using errcode='22023';
  end if;
  if was_rental then
    previous := public.rental_lead_payload_metadata(old.raw_enquiry_payload);
    old_role := lower(btrim(coalesce(nullif(previous->>'role',''),case when old.lead_category='seller' then 'landlord' else 'tenant' end)));
    if old_role in ('owner','lessor') then old_role := 'landlord'; end if;
    if role_name is distinct from old_role then raise exception 'A rental lead cannot switch tenant and landlord journeys.' using errcode='22023'; end if;
    if new.organisation_id is distinct from old.organisation_id or new.lead_id is distinct from old.lead_id then
      raise exception 'A rental lead must retain its organisation and identity.' using errcode='22023';
    end if;
  end if;

  -- Flatten supported legacy envelopes so all existing lists and link guards
  -- read the same canonical marker. No historical backfill is performed.
  new.raw_enquiry_payload := (metadata - 'rentalCrm' - 'rental_crm') || jsonb_build_object(
    'arch9RentalLead',true,'classification','rental','leadType','rental','role',role_name,'leadId',new.lead_id,'organisationId',new.organisation_id);
  metadata := new.raw_enquiry_payload;
  links_changed := tg_op='INSERT' or not was_rental or new.listing_id is distinct from old.listing_id or new.enquired_listing_id is distinct from old.enquired_listing_id
    or metadata#>>'{relationships,listingId}' is distinct from previous#>>'{relationships,listingId}';
  if links_changed then
    for listing_ref in select distinct ref from unnest(array[new.listing_id,new.enquired_listing_id::text,metadata#>>'{relationships,listingId}']) links(ref) where nullif(btrim(ref),'') is not null loop
      if listing_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose a saved rental listing.' using errcode='22023'; end if;
      linked_id := listing_ref::uuid;
      if not exists(select 1 from public.private_listings where id=linked_id and organisation_id=new.organisation_id and lower(listing_category)='rental') then
        raise exception 'Rental leads cannot be linked to a sales or unavailable listing.' using errcode='22023';
      end if;
    end loop;
  end if;

  next_stage := public.rental_lead_normalize_stage(coalesce(metadata->>'stage',new.stage),role_name);
  if not was_rental then
    if next_stage <> 'new' then raise exception 'New rental leads must start at New.' using errcode='22023'; end if;
    if coalesce(metadata#>'{workflow,events}','[]'::jsonb)<>'[]'::jsonb or nullif(metadata#>'{workflow,lastEvent}','null'::jsonb) is not null then
      raise exception 'New rental leads cannot import completed milestones.' using errcode='22023';
    end if;
    return new;
  end if;
  previous_stage := public.rental_lead_normalize_stage(coalesce(previous->>'stage',old.stage),role_name);
  if public.rental_lead_normalize_stage(new.stage,role_name) is distinct from public.rental_lead_normalize_stage(old.stage,role_name)
     and public.rental_lead_normalize_stage(new.stage,role_name) is distinct from next_stage then
    raise exception 'Update the saved rental journey when changing its stage.' using errcode='22023';
  end if;
  if next_stage=previous_stage then
    if metadata->'workflow' is distinct from previous->'workflow' then raise exception 'The rental journey changed; refresh before saving its evidence.' using errcode='22023'; end if;
    return new;
  end if;
  if public.rental_lead_normalize_stage(new.stage,role_name) is distinct from next_stage then
    raise exception 'Keep the lead stage and saved rental journey together.' using errcode='22023';
  end if;
  stages := case when role_name='landlord' then array['new','contacted','appraisal_scheduled','appraisal_completed','mandate_pending','mandate_signed','listing_ready','listing_created']
    else array['new','contacted','qualified','viewing_scheduled','viewing_completed','application_pending','application_submitted','screening_pending','fica_pending','fica_complete','placement_ready'] end;
  if array_position(stages,previous_stage) is null or array_position(stages,next_stage) is distinct from array_position(stages,previous_stage)+1 then
    raise exception 'Advance one step in the saved rental journey; refresh before trying again.' using errcode='22023';
  end if;
  evidence := metadata#>'{workflow,lastEvent}';
  if evidence->>'stage' is distinct from next_stage or nullif(evidence->>'recordedAt','') is null
     or auth.uid() is null
     or (metadata#>'{workflow,events}')->-1 is distinct from evidence
     or metadata#>'{workflow,events}' is distinct from coalesce(previous#>'{workflow,events}','[]'::jsonb)||jsonb_build_array(evidence) then
    raise exception 'The rental milestone needs its saved workflow evidence.' using errcode='22023';
  end if;
  if next_stage='appraisal_scheduled' then
    -- Contact completion opens the appraisal step before an appointment is booked.
    -- Existing scheduling commands still need the actual appointment time.
    if evidence->>'actionKey' = 'mark_contacted' and previous_stage='contacted' then
      if nullif(evidence->>'scheduledFor','') is not null then perform (evidence->>'scheduledFor')::timestamptz; end if;
    else
      if nullif(evidence->>'scheduledFor','') is null then raise exception 'Save the appraisal time before advancing.' using errcode='22023'; end if;
      perform (evidence->>'scheduledFor')::timestamptz;
    end if;
  elsif next_stage='appraisal_completed' then
    if nullif(btrim(evidence->>'note'),'') is null then raise exception 'Record the appraisal milestone note before advancing.' using errcode='22023'; end if;
  elsif next_stage='qualified' then
    qualification := metadata->'qualification';
    if exists(select 1 from unnest(array['monthlyBudget','desiredArea','occupationDate','employmentStatus','depositAvailable','screeningConsent','propertyNeed','occupants','pets']) required(field)
      where nullif(btrim(qualification->>field),'') is null or qualification->>field='Not captured')
      or (nullif(btrim(qualification->>'additionalNotes'),'') is null and not(coalesce(qualification->>'source','')='tenant_qualification_link' and nullif(qualification->>'submittedAt','') is not null))
      or evidence->>'qualificationOutcome' is distinct from 'qualified' then
      raise exception 'Save the complete tenant qualification before advancing.' using errcode='22023';
    end if;
  elsif next_stage in ('viewing_scheduled','viewing_completed') then
    if not exists(select 1 from public.private_listing_activity viewing join public.private_listings listing on listing.id=viewing.private_listing_id
      where viewing.id::text=evidence->>'viewingId' and viewing.activity_type='rental_viewing_scheduled' and viewing.metadata->>'tenantLeadId'=new.lead_id::text
        and listing.organisation_id=new.organisation_id and listing.listing_category='rental'
        and nullif(viewing.metadata->>'startsAt','') is not null and (viewing.metadata->>'startsAt')::timestamptz=(evidence->>'scheduledFor')::timestamptz
        and not exists(select 1 from public.private_listing_activity outcome where outcome.private_listing_id=viewing.private_listing_id
          and outcome.activity_type='rental_viewing_outcome' and outcome.metadata->>'viewingId'=viewing.id::text and outcome.metadata->>'outcome' in ('cancelled','no_show','reschedule_requested'))
        and (next_stage='viewing_scheduled' or exists(select 1 from public.private_listing_activity outcome where outcome.private_listing_id=viewing.private_listing_id
          and outcome.activity_type='rental_viewing_outcome' and outcome.metadata->>'viewingId'=viewing.id::text and outcome.metadata->>'tenantLeadId'=new.lead_id::text and outcome.metadata->>'outcome'='attended'))) then
      raise exception 'Save the linked viewing and its attended outcome before advancing.' using errcode='22023';
    end if;
  elsif next_stage in ('mandate_signed','listing_ready') then
    if not exists(select 1 from public.rental_property_mandates mandate where mandate.id::text=metadata#>>'{relationships,mandateId}'
      and mandate.property_id::text=metadata#>>'{relationships,propertyId}' and mandate.organisation_id=new.organisation_id
      and mandate.metadata_json->>'leadId'=new.lead_id::text and mandate.mandate_status='active' and mandate.authority_status='confirmed'
      and nullif(mandate.metadata_json->>'signedEvidenceReference','') is not null and nullif(mandate.metadata_json->>'signedAt','') is not null) then
      raise exception 'Record the signed mandate for this landlord and property before advancing.' using errcode='22023';
    end if;
  elsif next_stage='listing_created' then
    if not exists(select 1 from public.private_listings listing where listing.id::text=metadata#>>'{relationships,listingId}' and listing.organisation_id=new.organisation_id and listing.listing_category='rental') then
      raise exception 'Create and link the saved rental listing before advancing.' using errcode='22023';
    end if;
  elsif next_stage in ('application_submitted','screening_pending','fica_pending','fica_complete','placement_ready') then
    select * into app from public.rental_applications where id::text=metadata#>>'{relationships,applicationId}' and lead_id=new.lead_id and organisation_id=new.organisation_id
      and vacancy_id::text=metadata#>>'{relationships,vacancyId}' and unit_id::text=metadata#>>'{relationships,unitId}' and status in ('submitted','under_review','approved') for share;
    if not found then raise exception 'The linked applicant must submit the application before advancing.' using errcode='22023'; end if;
    if next_stage='placement_ready' and app.status<>'approved' then raise exception 'Approve the linked application before confirming placement readiness.' using errcode='22023'; end if;
    if next_stage in ('fica_pending','fica_complete') then
      foreach check_kind in array case when next_stage='fica_pending' then array['identity','affordability','employment','reference'] else array['fica'] end loop
        for subject in select * from public.rental_review_subjects(app.application_data,check_kind) loop
          select result_json#>array['subjects',subject.subject_id] into result from public.rental_application_screening_checks where application_id=app.id and check_type=check_kind;
          if coalesce(result->>'status','')<>'passed' or nullif(result->>'reviewedBy','') is null or nullif(btrim(result->>'evidenceNote'),'') is null
             or (result->>'submissionAt')::timestamptz is distinct from app.submitted_at or ((result->>'expiresAt')::date < current_date) then
            raise exception 'Complete the current % review in the linked application before advancing.',check_kind using errcode='22023';
          end if;
        end loop;
      end loop;
    end if;
  end if;
  evidence := evidence || jsonb_build_object('recordedAt',statement_timestamp(),'recordedBy',auth.uid());
  new.raw_enquiry_payload := jsonb_set(new.raw_enquiry_payload,'{workflow,lastEvent}',evidence);
  new.raw_enquiry_payload := jsonb_set(new.raw_enquiry_payload,'{workflow,events}',coalesce(previous#>'{workflow,events}','[]'::jsonb)||jsonb_build_array(evidence));
  return new;
end;
$$;

commit;
