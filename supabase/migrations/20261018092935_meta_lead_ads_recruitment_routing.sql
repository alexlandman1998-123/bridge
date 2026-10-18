-- Meta recruitment enquiries use the existing management-only recruitment pipeline.
-- Preserve property-lead ingestion and the full recruitment journey guards.
begin;

-- Bound duplicate lookups to Meta references, including checks across tenants.
create index leads_meta_leadgen_lookup_idx on public.leads(source_reference_id,organisation_id)
  where source_reference_id like 'meta-leadgen:%';

alter table public.meta_lead_ads_forms drop constraint meta_lead_ads_forms_lead_type_check;
alter table public.meta_lead_ads_forms add constraint meta_lead_ads_forms_lead_type_check
  check (lead_type in ('buyer','seller','recruitment'));
alter table public.meta_lead_ads_forms add constraint meta_recruitment_form_routing_check
  check (lead_type <> 'recruitment' or (branch_id is null and assigned_agent_id is null));

create function public.meta_lead_form_routing_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (new.lead_type,new.branch_id,new.assigned_agent_id) is distinct from (old.lead_type,old.branch_id,old.assigned_agent_id)
    and exists(select 1 from public.meta_lead_ads_imports i where i.form_mapping_id=old.id and i.status in ('ready','importing','paused')) then
    raise exception 'Complete the historical import before changing this form routing';
  end if;
  return new;
end; $$;
revoke all on function public.meta_lead_form_routing_guard() from public,anon,authenticated;
create trigger meta_lead_form_routing_guard before update on public.meta_lead_ads_forms
  for each row execute function public.meta_lead_form_routing_guard();

alter table public.recruitment_leads
  add column meta_leadgen_id text unique,
  add column meta_source_json jsonb not null default '{}' check (jsonb_typeof(meta_source_json)='object');
alter table public.recruitment_leads drop constraint recruitment_leads_intake_channel_check;
alter table public.recruitment_leads add constraint recruitment_leads_intake_channel_check
  check (intake_channel in ('manual','public_link','website','private_link','meta_lead_ad'));
alter table public.recruitment_leads add constraint recruitment_meta_source_check
  check ((meta_leadgen_id is not null) = (intake_channel='meta_lead_ad'));

create function public.recruitment_meta_source_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.meta_leadgen_id is distinct from old.meta_leadgen_id or new.meta_source_json is distinct from old.meta_source_json then
      raise exception 'Meta recruitment receipt cannot be changed';
    end if;
  elsif new.meta_leadgen_id is not null or new.meta_source_json <> '{}'::jsonb or new.intake_channel='meta_lead_ad' then
    if current_user <> 'service_role' or new.intake_channel <> 'meta_lead_ad' or nullif(trim(new.meta_leadgen_id),'') is null
      or new.status <> 'lead_received' or new.source <> 'Facebook Lead Ads'
      or new.meta_source_json->>'leadgen_id' is distinct from new.meta_leadgen_id then
      raise exception 'Meta recruitment enquiries require server ingestion' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.recruitment_meta_source_guard() from public,anon,authenticated;
create trigger a0_recruitment_meta_source_guard before insert or update on public.recruitment_leads
  for each row execute function public.recruitment_meta_source_guard();

create or replace function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
declare event_type text; submitting boolean;
begin
  submitting := coalesce(current_user = 'service_role' and new.status = 'application_submitted'
    and new.application_json->>'version' = 'recruitment-application-v1'
    and new.application_json->'answers'->>'privacyAccepted' = 'true'
    and new.application_json->'answers'->>'declarationAccepted' = 'true',false);
  if tg_op = 'INSERT' then
    if new.status <> 'lead_received' and not submitting then raise exception 'New recruitment enquiries must start at Lead Received'; end if;
    if new.intake_channel <> 'manual' and not submitting and not (current_user = 'service_role' and (new.contact_capture_json->>'version' = 'recruitment-contact-v1' or (new.intake_channel = 'meta_lead_ad' and new.meta_leadgen_id is not null))) then raise exception 'Public intake requires a submitted application'; end if;
    if not submitting and (new.application_json <> '{}' or new.application_submitted_at is not null) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    new.received_at := now(); new.created_at := now(); new.updated_at := now(); new.captured_by := auth.uid(); new.version := 1;
    new.activity_json := jsonb_build_array(jsonb_build_object('type','lead_received','at',now(),'actorId',auth.uid(),'source',new.source));
    if submitting then
      new.application_submitted_at := now();
      new.activity_json := new.activity_json || jsonb_build_array(jsonb_build_object('type','application_submitted','at',now(),'channel',new.application_json->>'channel','reviewStatus',new.review_status));
    end if;
  else
    if new.organisation_id <> old.organisation_id then raise exception 'Recruitment leads cannot move organisations'; end if;
    if new.received_at is distinct from old.received_at or new.captured_by is distinct from old.captured_by or new.intake_channel is distinct from old.intake_channel or new.intake_key is distinct from old.intake_key or new.created_at is distinct from old.created_at then raise exception 'Recruitment receipt details cannot be changed'; end if;
    submitting := coalesce(submitting,false) and old.status = 'lead_received' and old.application_submitted_at is null;
    if not submitting and (new.application_json is distinct from old.application_json or new.application_submitted_at is distinct from old.application_submitted_at) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    if new.status is distinct from old.status and not (submitting or
      (old.status = 'application_approved' and new.status = 'contract_sent' and new.contract_delivery_json <> '{}'::jsonb) or
      (old.status = 'onboarding_complete' and new.status = 'agent_activated' and new.activated_at is not null) or
      (old.status = 'contract_signed' and new.status = 'onboarding_complete' and new.onboarding_completed_at is not null) or
      (old.status = 'contract_sent' and new.status = 'contract_signed' and new.contract_signature_json <> '{}'::jsonb) or
      (old.status = 'under_review' and new.status = 'application_approved' and new.approved_at is not null) or
      (old.status = 'application_submitted' and new.status = 'documents_uploaded' and new.documents_uploaded_at is not null) or
      (old.status in ('application_submitted','documents_uploaded') and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.onboarding_completed_at is not null then 'onboarding_complete' when old.contract_signature_json <> '{}'::jsonb then 'contract_signed' when old.contract_delivery_json <> '{}'::jsonb then 'contract_sent' when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.documents_uploaded_at is not null then 'documents_uploaded' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when new.rejection_json is distinct from old.rejection_json then 'application_rejected' when old.contacted_at is null and new.contacted_at is not null then 'lead_contacted' when new.documents_json is distinct from old.documents_json then 'document_uploaded' when new.document_waivers_json is distinct from old.document_waivers_json then 'document_exception_recorded' when old.activated_at is null and new.activated_at is not null then 'agent_activated' when new.activation_json is distinct from old.activation_json then 'agent_access_prepared' when old.onboarding_completed_at is null and new.onboarding_completed_at is not null then 'onboarding_completed' when new.onboarding_documents_json is distinct from old.onboarding_documents_json then 'onboarding_document_uploaded' when new.onboarding_json is distinct from old.onboarding_json then 'onboarding_updated' when new.contract_signature_json is distinct from old.contract_signature_json then 'contract_signed' when new.contract_delivery_json is distinct from old.contract_delivery_json then 'contract_delivery_recorded' when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;

create or replace function public.recruitment_joining_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb:=new.joining_json; origin jsonb; matches jsonb; choice text; invitation public.invites%rowtype;
begin
  -- Branch capture is available only through the bounded private definer below.
  -- Table RLS still rejects every direct branch-manager INSERT/UPDATE/SELECT.
  if tg_op='INSERT' and current_user not in ('authenticated','service_role','anon') then
  if current_user=(select pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='recruitment_private' and p.proname='capture_branch') and exists(select 1 from public.organisation_users m where m.user_id=auth.uid() and m.organisation_id=new.organisation_id and m.status='active' and m.role='branch_manager' and coalesce(m.primary_branch_id,m.branch_id)::text=new.joining_json->>'branchId') then
    if new.status<>'lead_received' or new.intake_channel<>'manual' or new.joining_invite_id is not null or new.joining_json->>'role' not in ('agent','commercial_broker') or new.joining_json->'businessWorkspaces' is distinct from (case when new.joining_json->>'role'='commercial_broker' then '["commercial"]'::jsonb else '[]'::jsonb end) or coalesce(new.joining_json->>'commissionStructureId','')<>'' or coalesce(new.joining_json->>'startDate','')<>'' or new.details_json<>'{}'::jsonb or new.documents_json<>'[]'::jsonb then raise exception 'Branch joining capture must remain an unapproved enquiry'; end if;
    new.joining_json:=jsonb_build_object('version','recruitment-joining-v1','origin',jsonb_build_object('entryPoint',case when new.joining_json->'origin'->>'entryPoint'='commercial_brokers' then 'commercial_brokers' else 'branch' end,'source',new.source,'recordedAt',now(),'recordedBy',auth.uid()),'branchId',new.joining_json->>'branchId','role',new.joining_json->>'role','businessWorkspaces',new.joining_json->'businessWorkspaces','commissionStructureId','','startDate','');
    return new;
  end if;
  end if;
  if tg_op='UPDATE' and new.activation_json->>'inviteId' is not null
    and new.activation_json->>'inviteId' is distinct from old.activation_json->>'inviteId' then
    -- Serialize linking with the existing activation RPC's invitation row lock.
    perform 1 from public.invites i where i.id=(new.activation_json->>'inviteId')::uuid for update;
    if exists(select 1 from public.recruitment_leads l where l.id<>new.id and l.joining_invite_id=(new.activation_json->>'inviteId')::uuid) then
      raise exception 'Existing invitation is already linked to another recruitment record';
    end if;
  end if;
  if tg_op='UPDATE' and old.joining_invite_id is not null and lower(trim(new.email)) is distinct from lower(trim(old.email)) then
    raise exception 'The email linked to an existing invitation cannot be changed';
  end if;
  if tg_op='UPDATE' and new.joining_json is not distinct from old.joining_json
    and new.joining_invite_id is not distinct from old.joining_invite_id then
    -- A linked legacy invitation must be resolved or reused, never replaced by
    -- another live invitation as a side effect of the existing activation RPC.
    if new.activation_json is distinct from old.activation_json and new.activation_json->>'state'='awaiting_acceptance'
      and old.joining_invite_id is not null and new.activation_json->>'inviteId' is distinct from old.joining_invite_id::text
      and exists(select 1 from public.invites i where i.id=old.joining_invite_id and i.status='pending' and (i.expires_at is null or i.expires_at>now())) then
      raise exception 'Resolve the linked existing invitation before preparing agent access';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    if old.activated_at is not null or old.activation_json->>'inviteId' is not null then raise exception 'Joining choices are locked after agent access is prepared'; end if;
    if old.joining_invite_id is not null and new.joining_invite_id is distinct from old.joining_invite_id then raise exception 'Existing invitation history cannot be replaced'; end if;
    if old.joining_json<>'{}'::jsonb and item->'origin' is distinct from old.joining_json->'origin' then raise exception 'Joining origin cannot be changed'; end if;
  end if;
  -- Anonymous/server intake cannot supply staff choices. Empty server intake is
  -- assigned only its true intake channel and receipt; no staff access is added.
  if current_user='service_role' then
    if item<>'{}'::jsonb or new.joining_invite_id is not null then raise exception 'Joining choices require organisation management' using errcode='42501'; end if;
  else
    perform public.recruitment_assert_joining_manager(new.organisation_id);
  end if;
  if jsonb_typeof(item) is distinct from 'object' or length(item::text)>12000 then raise exception 'Invalid joining choices'; end if;
  if item<>'{}'::jsonb and item->>'version' is distinct from 'recruitment-joining-v1' then raise exception 'Invalid joining record version'; end if;
  origin:=case when tg_op='UPDATE' and old.joining_json<>'{}'::jsonb then old.joining_json->'origin'
    else jsonb_build_object('entryPoint',case when tg_op='UPDATE' then 'legacy'
      when new.intake_channel<>'manual' then new.intake_channel else coalesce(item->'origin'->>'entryPoint','recruitment') end,
      'source',case when tg_op='UPDATE' then old.source else new.source end,'recordedAt',now(),'recordedBy',auth.uid()) end;
  if origin->>'entryPoint' not in ('recruitment','agents','branch','settings_users','agency_setup','commercial_brokers','website','public_link','private_link','meta_lead_ad','legacy') then raise exception 'Invalid joining entry point'; end if;
  if origin->>'entryPoint'='meta_lead_ad' and new.intake_channel<>'meta_lead_ad' then raise exception 'Meta joining origin requires a Meta recruitment receipt'; end if;
  item:=jsonb_build_object('version','recruitment-joining-v1','origin',origin,
    'branchId',coalesce(item->>'branchId',''),'role',coalesce(item->>'role','agent'),
    'businessWorkspaces',coalesce(item->'businessWorkspaces','[]'::jsonb),
    'commissionStructureId',coalesce(item->>'commissionStructureId',''),'startDate',coalesce(item->>'startDate',''));
  if item->>'role' not in ('agent','senior_agent','commercial_broker') then raise exception 'Choose an agent joining role'; end if;
  if jsonb_typeof(item->'businessWorkspaces') is distinct from 'array' or jsonb_array_length(item->'businessWorkspaces')>4
    or exists(select 1 from jsonb_array_elements(item->'businessWorkspaces') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' not in ('sales','rentals','short_term_rentals','commercial'))
    or (select count(*) from jsonb_array_elements(item->'businessWorkspaces'))<>(select count(distinct v) from jsonb_array_elements(item->'businessWorkspaces') v) then raise exception 'Choose valid business areas'; end if;
  if item->>'branchId'<>'' then
    if not exists(select 1 from public.organisation_branches b where b.id=(item->>'branchId')::uuid and b.organisation_id=new.organisation_id and b.is_active) then raise exception 'Choose an active branch in this organisation'; end if;
  end if;
  if item->>'commissionStructureId'<>'' then
    if not exists(select 1 from public.organisation_commission_structures c where c.id=(item->>'commissionStructureId')::uuid and c.organisation_id=new.organisation_id and c.is_active) then raise exception 'Choose an active commission structure in this organisation'; end if;
  end if;
  choice:=item->>'startDate';
  if choice<>'' and (choice!~'^\d{4}-\d{2}-\d{2}$' or choice::date::text<>choice) then raise exception 'Choose a valid joining date'; end if;
  if new.joining_invite_id is not null then
    select * into invitation from public.invites i where i.id=new.joining_invite_id and i.target_workspace_id=new.organisation_id
      and lower(trim(i.email))=lower(trim(new.email)) and i.invite_type in ('workspace_invite','branch_invite') and i.target_workspace_role in ('agent','senior_agent','sales_agent','commercial_broker') for update;
    if invitation.id is null then raise exception 'Existing invitation must match this organisation, agent email and role'; end if;
    if invitation.target_branch_id is not null and item->>'branchId'<>'' and invitation.target_branch_id::text<>item->>'branchId' then raise exception 'Existing invitation belongs to another branch'; end if;
    if (tg_op='INSERT' or old.joining_invite_id is null) and (invitation.status<>'pending' or invitation.expires_at<=now()) then raise exception 'Link only a pending unexpired invitation'; end if;
    if exists(select 1 from public.recruitment_leads l where l.id<>new.id and (l.joining_invite_id=invitation.id or l.activation_json->>'inviteId'=invitation.id::text)) then raise exception 'Existing invitation is already linked to another recruitment record'; end if;
    if tg_op='INSERT' or old.joining_invite_id is null then item:=item||jsonb_build_object('inviteLinkedAt',now(),'inviteLinkedBy',auth.uid());
    else item:=item||(old.joining_json-'version'-'origin'-'branchId'-'role'-'businessWorkspaces'-'commissionStructureId'-'startDate'); end if;
  end if;
  if tg_op='INSERT' and current_user<>'service_role' then
    perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text||':'||lower(trim(coalesce(nullif(new.email,''),new.intake_key::text))),0));
    matches:=public.recruitment_find_joining_matches(new.organisation_id,new.email);
    if jsonb_array_length(matches->'members')>0 then raise exception 'This person is already an active agency member. Manage their existing profile'; end if;
    if jsonb_array_length(matches->'leads')+jsonb_array_length(matches->'invites')>0 then
      if new.joining_json->'reviewedMatches' is distinct from 'true'::jsonb then raise exception 'Review existing recruitment records and invitations before creating a separate enquiry'; end if;
      item:=item||jsonb_build_object('matchReview',jsonb_build_object('at',now(),'by',auth.uid(),'matches',matches));
    end if;
  elsif tg_op='UPDATE' and old.joining_json?'matchReview' then item:=item||jsonb_build_object('matchReview',old.joining_json->'matchReview');
  end if;
  new.joining_json:=item;
  return new;
end;
$$;

create or replace function public.meta_ingest_lead_ad(
  p_leadgen_id text, p_organisation_id uuid, p_page_id text, p_form_id text,
  p_full_name text, p_email text, p_phone text, p_payload jsonb,
  p_ingestion_source text default 'live', p_meta_created_at timestamptz default null,
  p_import_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_mapping public.meta_lead_ads_forms%rowtype;
  v_connection public.meta_lead_ads_connections%rowtype;
  v_contact_id uuid; v_lead_id uuid; v_first text; v_last text;
  v_now timestamptz := clock_timestamp(); v_occurred_at timestamptz;
  v_lead_type text; v_source text;
begin
  v_source := case when p_ingestion_source = 'historical' then 'historical' else 'live' end;
  v_occurred_at := coalesce(p_meta_created_at, v_now);
  if v_source = 'historical' and p_import_id is null then
    raise exception 'Historical Meta ingestion requires an import job';
  end if;
  select * into v_connection from public.meta_lead_ads_connections
   where organisation_id=p_organisation_id and page_id=p_page_id and connection_status='connected';
  if v_connection.id is null then raise exception 'Meta Page is not connected to this organisation'; end if;
  select * into v_mapping from public.meta_lead_ads_forms
   where organisation_id=p_organisation_id and page_id=p_page_id and form_id=p_form_id and is_active;
  if v_mapping.id is null then raise exception 'Meta form is not enabled for this organisation'; end if;
  if p_import_id is not null and not exists (
    select 1 from public.meta_lead_ads_imports i
    where i.id=p_import_id and i.organisation_id=p_organisation_id and i.connection_id=v_connection.id
      and i.form_mapping_id=v_mapping.id and i.status in ('ready', 'importing', 'paused')
  ) then raise exception 'Meta import job does not belong to this organisation and form'; end if;
  if v_mapping.lead_type not in ('buyer','seller') then raise exception 'Use routed Meta ingestion for Recruitment'; end if;
  v_lead_type := case when v_mapping.lead_type = 'seller' then 'seller' else 'buyer' end;
  if v_mapping.branch_id is not null and not exists (
    select 1 from public.organisation_branches b where b.id=v_mapping.branch_id and b.organisation_id=p_organisation_id
  ) then raise exception 'Meta form branch routing crosses organisation boundary'; end if;
  if v_mapping.assigned_agent_id is not null and not exists (
    select 1 from public.organisation_users u where u.organisation_id=p_organisation_id and u.user_id=v_mapping.assigned_agent_id and u.status='active'
  ) then raise exception 'Meta form agent routing crosses organisation boundary'; end if;

  perform pg_advisory_xact_lock(hashtextextended('meta-lead:' || p_leadgen_id, 0));
  if exists(select 1 from public.recruitment_leads l where l.meta_leadgen_id=p_leadgen_id) then
    raise exception 'Meta lead already routed to Recruitment; use routed Meta ingestion';
  end if;
  select lead_id into v_lead_id from public.leads
   where organisation_id=p_organisation_id and source_reference_id like 'meta-leadgen:%'
     and source_reference_id='meta-leadgen:' || p_leadgen_id limit 1;
  if v_lead_id is not null then return v_lead_id; end if;

  v_first := split_part(trim(coalesce(p_full_name,'Meta Lead')), ' ', 1);
  v_last := nullif(trim(substr(trim(coalesce(p_full_name,'Meta Lead')), char_length(v_first)+1)), '');
  select c.contact_id into v_contact_id from public.contacts c where c.organisation_id=p_organisation_id
    and ((nullif(lower(trim(p_email)),'') is not null and lower(trim(c.email))=lower(trim(p_email)))
      or (nullif(regexp_replace(p_phone,'[^0-9]+','','g'),'') is not null and regexp_replace(coalesce(c.phone,''),'[^0-9]+','','g')=regexp_replace(p_phone,'[^0-9]+','','g')))
    order by c.updated_at desc limit 1;
  if v_contact_id is null then
    insert into public.contacts(organisation_id,assigned_agent_id,first_name,last_name,email,phone,contact_type,notes)
    values(p_organisation_id,v_mapping.assigned_agent_id,v_first,v_last,nullif(lower(trim(p_email)),''),nullif(trim(p_phone),''),v_lead_type,'Facebook Lead Ad') returning contact_id into v_contact_id;
  end if;
  insert into public.leads(organisation_id,branch_id,assigned_agent_id,assigned_user_id,contact_id,lead_domain,
    lead_category,lead_type,lead_direction,lead_source,source_channel,stage,status,priority,ownership_status,assigned_at,sla_due_at,
    source_reference_id,source_received_at,raw_enquiry_payload,notes,acknowledgement_status,created_at)
  values(p_organisation_id,v_mapping.branch_id,v_mapping.assigned_agent_id,v_mapping.assigned_agent_id,v_contact_id,'agency',
    v_lead_type,v_lead_type,'Inbound','Facebook','facebook','New Lead','New Lead','High',
    case when v_mapping.assigned_agent_id is null then 'awaiting_assignment' else 'assigned' end,
    case when v_mapping.assigned_agent_id is null then null else v_now end,
    case when v_source='historical' then null else v_now+interval '15 minutes' end,
    'meta-leadgen:'||p_leadgen_id,v_occurred_at,
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('arch9_meta',jsonb_build_object('ingestion_source',v_source,'import_id',p_import_id,'submitted_at',v_occurred_at)),
    'Facebook '||initcap(v_lead_type)||case when v_source='historical' then ' Lead Ad imported: ' else ' Lead Ad: ' end||v_mapping.form_name,
    case when v_source='historical' then 'skipped' else null end,v_occurred_at)
  returning lead_id into v_lead_id;
  insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
  values(p_organisation_id,v_lead_id,v_mapping.assigned_agent_id,'Lead Created',
    case when v_source='historical' then 'Facebook '||initcap(v_lead_type)||' Lead Ad imported' else 'Facebook '||initcap(v_lead_type)||' Lead Ad received' end,
    v_occurred_at,'New');
  return v_lead_id;
end $$;


alter table public.meta_lead_ads_events
  add column recruitment_lead_id uuid,
  add column lead_type text not null default 'buyer' check (lead_type in ('buyer','seller','recruitment')),
  add constraint meta_event_recruitment_tenant_fk foreign key (organisation_id,recruitment_lead_id)
    references public.recruitment_leads(organisation_id,id) on delete set null (recruitment_lead_id),
  add constraint meta_event_destination_check check (crm_lead_id is null or recruitment_lead_id is null),
  add constraint meta_event_recruitment_type_check check (recruitment_lead_id is null or lead_type='recruitment');
create index meta_events_recruitment_lookup_idx on public.meta_lead_ads_events(organisation_id,recruitment_lead_id)
  where recruitment_lead_id is not null;
update public.meta_lead_ads_events e set lead_type=coalesce(
  (select l.lead_type from public.leads l where l.lead_id=e.crm_lead_id),
  (select f.lead_type from public.meta_lead_ads_forms f where f.id=e.form_mapping_id),'buyer');
drop policy if exists meta_lead_ads_events_member_read on public.meta_lead_ads_events;
create policy meta_lead_ads_events_member_read on public.meta_lead_ads_events for select to authenticated using (
  public.bridge_is_active_member(organisation_id) and (lead_type <> 'recruitment' or exists (
    select 1 from public.organisation_users m where m.organisation_id=meta_lead_ads_events.organisation_id
      and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('principal','admin','super_admin')
  ))
);

-- Typed destination keeps event links correct even if the form is reclassified during a retry.
create function public.meta_ingest_lead_ad_routed(
  p_leadgen_id text, p_organisation_id uuid, p_page_id text, p_form_id text,
  p_full_name text, p_email text, p_phone text, p_payload jsonb,
  p_ingestion_source text default 'live', p_meta_created_at timestamptz default null,
  p_import_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  mapping public.meta_lead_ads_forms%rowtype;
  connection public.meta_lead_ads_connections%rowtype;
  lead_id uuid; kind text; source_json jsonb;
begin
  if current_user <> 'service_role' then raise exception 'Server ingestion required' using errcode='42501'; end if;
  if nullif(trim(p_leadgen_id),'') is null then raise exception 'A Meta lead ID is required'; end if;
  if p_ingestion_source not in ('live','historical') or p_ingestion_source is null then raise exception 'Invalid Meta ingestion source'; end if;
  select * into connection from public.meta_lead_ads_connections
    where organisation_id=p_organisation_id and page_id=p_page_id and connection_status='connected' for share;
  if connection.id is null then raise exception 'Meta Page is not connected to this organisation'; end if;
  select * into mapping from public.meta_lead_ads_forms
    where organisation_id=p_organisation_id and connection_id=connection.id and page_id=p_page_id and form_id=p_form_id and is_active for share;
  if mapping.id is null then raise exception 'Meta form is not enabled for this organisation'; end if;
  if p_ingestion_source='historical' and p_import_id is null then raise exception 'Historical Meta ingestion requires an import job'; end if;
  if p_import_id is not null and not exists (
    select 1 from public.meta_lead_ads_imports i where i.id=p_import_id and i.organisation_id=p_organisation_id
      and i.connection_id=connection.id and i.form_mapping_id=mapping.id and i.status in ('ready','importing','paused')
  ) then raise exception 'Meta import job does not belong to this organisation and form'; end if;
  perform pg_advisory_xact_lock(hashtextextended('meta-lead:' || p_leadgen_id,0));
  select l.lead_id,l.lead_type into lead_id,kind from public.leads l
    where l.organisation_id=p_organisation_id and l.source_reference_id like 'meta-leadgen:%'
      and l.source_reference_id='meta-leadgen:' || p_leadgen_id limit 1;
  if lead_id is not null then return jsonb_build_object('lead_type',kind,'crm_lead_id',lead_id,'recruitment_lead_id',null); end if;
  if exists(select 1 from public.leads l where l.source_reference_id like 'meta-leadgen:%' and l.source_reference_id='meta-leadgen:' || p_leadgen_id) then
    raise exception 'Meta lead already belongs to another organisation';
  end if;
  select l.id into lead_id from public.recruitment_leads l where l.meta_leadgen_id=p_leadgen_id and l.organisation_id=p_organisation_id;
  if lead_id is not null then return jsonb_build_object('lead_type','recruitment','crm_lead_id',null,'recruitment_lead_id',lead_id); end if;
  if exists(select 1 from public.recruitment_leads l where l.meta_leadgen_id=p_leadgen_id) then
    raise exception 'Meta lead already belongs to another organisation';
  end if;
  if mapping.lead_type in ('buyer','seller') then
    lead_id:=public.meta_ingest_lead_ad(p_leadgen_id,p_organisation_id,p_page_id,p_form_id,p_full_name,p_email,p_phone,p_payload,p_ingestion_source,p_meta_created_at,p_import_id);
    return jsonb_build_object('lead_type',mapping.lead_type,'crm_lead_id',lead_id,'recruitment_lead_id',null);
  end if;
  if mapping.lead_type <> 'recruitment' then raise exception 'Invalid Meta lead type'; end if;
  if mapping.branch_id is not null or mapping.assigned_agent_id is not null then raise exception 'Recruitment routes to the agency recruitment pipeline'; end if;
  if nullif(trim(p_email),'') is null and nullif(trim(p_phone),'') is null then raise exception 'Recruitment enquiry needs an email address or phone number'; end if;
  source_json:=jsonb_build_object(
    'leadgen_id',p_leadgen_id,'page_id',p_page_id,'form_id',p_form_id,'form_name',mapping.form_name,
    'campaign_id',p_payload->>'campaign_id','campaign_name',p_payload->>'campaign_name',
    'adset_id',p_payload->>'adset_id','adset_name',p_payload->>'adset_name',
    'ad_id',p_payload->>'ad_id','ad_name',p_payload->>'ad_name',
    'normalized_fields',coalesce(p_payload->'normalized_fields','{}'::jsonb),
    'ingestion_source',p_ingestion_source,'submitted_at',coalesce(p_meta_created_at,clock_timestamp()),'import_id',p_import_id);
  insert into public.recruitment_leads(organisation_id,name,email,phone,source,status,intake_channel,meta_leadgen_id,meta_source_json,details_json)
  values(p_organisation_id,coalesce(nullif(trim(p_full_name),''),'Meta Lead'),lower(trim(coalesce(p_email,''))),trim(coalesce(p_phone,'')),
    'Facebook Lead Ads','lead_received','meta_lead_ad',p_leadgen_id,source_json,
    jsonb_build_object('notes','Facebook Recruitment Lead Ad: ' || mapping.form_name || coalesce(' · Campaign: ' || nullif(p_payload->>'campaign_name',''),'') || case when p_ingestion_source='historical' then ' (historical import)' else '' end))
  returning id into lead_id;
  return jsonb_build_object('lead_type','recruitment','crm_lead_id',null,'recruitment_lead_id',lead_id);
end; $$;
revoke all on function public.meta_ingest_lead_ad_routed(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.meta_ingest_lead_ad_routed(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid) to service_role;
-- Explicit server grants also support projects with opt-in Data API privileges.
grant select on public.meta_lead_ads_connections,public.meta_lead_ads_forms,public.meta_lead_ads_imports,public.leads to service_role;

commit;
