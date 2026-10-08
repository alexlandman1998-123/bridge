begin;

-- Extend the existing private queue and worker. Client intros and agent alerts
-- retain independent jobs, acceptance receipts, retries and provider keys.
alter table public.lead_agent_email_jobs drop constraint lead_agent_email_jobs_kind_check;
alter table public.lead_agent_email_jobs add constraint lead_agent_email_jobs_kind_check
  check(kind in ('agent','manager','client_intro'));

create function public.lead_client_intro_capture() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_raw jsonb:=coalesce(new.raw_enquiry_payload,'{}'::jsonb);
begin
  if coalesce(new.lead_domain,'agency')<>'agency' or lower(coalesce(new.lead_category,'')) not in ('buyer','seller','tenant','landlord') then return new; end if;
  insert into public.lead_agent_email_jobs(organisation_id,lead_id,kind,status,last_error)
  values(new.organisation_id,new.lead_id,'client_intro',
    case when v_raw#>>'{arch9_meta,ingestion_source}'='historical' or v_raw->>'arch9NotificationHistorical'='true' then 'skipped' else 'pending' end,
    case when v_raw#>>'{arch9_meta,ingestion_source}'='historical' or v_raw->>'arch9NotificationHistorical'='true' then 'historical_import' else null end)
  on conflict(organisation_id,lead_id,kind) do nothing;
  return new;
end $$;
create trigger trg_lead_client_intro_capture after insert on public.leads
for each row execute function public.lead_client_intro_capture();

create function public.lead_client_intro_contact_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.lead_agent_email_jobs j set next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  from public.leads l where l.organisation_id=new.organisation_id and l.contact_id=new.contact_id
    and j.organisation_id=l.organisation_id and j.lead_id=l.lead_id and j.kind='client_intro' and j.status='waiting_recipient';
  return new;
end $$;
create trigger trg_lead_client_intro_contact_changed after update of email on public.contacts
for each row when(old.email is distinct from new.email) execute function public.lead_client_intro_contact_changed();

create function public.lead_client_intro_linked_contact_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.lead_agent_email_jobs set next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  where organisation_id=new.organisation_id and lead_id=new.lead_id and kind='client_intro' and status='waiting_recipient';
  return new;
end $$;
create trigger trg_lead_client_intro_linked_contact_changed after update of contact_id on public.leads
for each row when(old.contact_id is distinct from new.contact_id) execute function public.lead_client_intro_linked_contact_changed();

create or replace function public.lead_agent_email_escalate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_task uuid;
begin
  if new.kind = 'agent' and new.status in ('waiting_recipient','needs_attention') then
    insert into public.lead_agent_email_jobs(organisation_id,lead_id,kind,next_attempt_at,last_error)
    values(new.organisation_id,new.lead_id,'manager',clock_timestamp(),new.last_error)
    on conflict (organisation_id,lead_id,kind) do nothing;
  end if;
  if (new.status = 'needs_attention' or (new.kind='client_intro' and new.status='waiting_recipient')) and new.attention_task_id is null then
    insert into public.tasks(organisation_id,lead_id,title,description,due_date,status,priority)
    values(new.organisation_id,new.lead_id,'Review lead email delivery',
      case when new.kind='client_intro' then 'The buyer or seller intro email needs attention. Check the saved contact email and the delivery queue.' else 'The new lead email needs attention. Check assignment, the recipient email and the delivery queue.' end,
      (clock_timestamp() at time zone 'Africa/Johannesburg')::date,'Pending','High')
    returning task_id into v_task;
    update public.lead_agent_email_jobs set attention_task_id=v_task where id=new.id;
  end if;
  return new;
end $$;

create or replace function public.lead_agent_email_claim(p_limit integer default 25)
returns setof public.lead_agent_email_jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.lead_agent_email_jobs%rowtype;
  v_lead public.leads%rowtype;
  v_member public.organisation_users%rowtype;
  v_contact public.contacts%rowtype;
  v_owner text;
  v_name text;
  v_rental boolean;
  v_now timestamptz := clock_timestamp();
begin
  -- Recover even the final interrupted attempt, without a fresh provider key.
  update public.lead_agent_email_jobs
  set status=case when attempts >= 8 or first_attempt_at < v_now-interval '23 hours'
      then 'needs_attention' else 'pending' end,
    claim_token=null,lease_until=null,next_attempt_at=v_now,
    last_error='Interrupted email attempt requires recovery.',updated_at=v_now
  where status='processing' and lease_until < v_now;

  for v_job in select * from public.lead_agent_email_jobs
    where status in ('pending','waiting_recipient') and next_attempt_at <= v_now
    order by next_attempt_at,id limit greatest(1,least(coalesce(p_limit,25),100))
    for update skip locked
  loop
    select * into v_lead from public.leads
      where lead_id=v_job.lead_id and organisation_id=v_job.organisation_id;
    -- Website receipt ownership is checked after its transaction has committed.
    if exists(select 1 from public.website_lead_submissions s join public.notification_events e
      on (e.id=s.notification_event_id or e.id=s.fallback_notification_event_id)
        and e.organisation_id=s.organisation_id and e.lead_id=s.lead_id
      where s.lead_id=v_job.lead_id and s.organisation_id=v_job.organisation_id
        and nullif(trim(e.recipient_email),'') is not null
        and ((v_job.kind='manager' and e.event_key in ('new_website_enquiry_principal','new_enquiry_unassigned_manager')
          and (e.status in ('queued','processing','sent') or (e.status='failed' and e.dispatch_attempt_count<e.max_dispatch_attempts)))
          or (v_job.kind='agent' and e.id=s.notification_event_id and e.event_key='new_enquiry_assigned_agent'
          and e.assigned_user_id=coalesce(v_lead.assigned_user_id,v_lead.assigned_agent_id)))) then
      update public.lead_agent_email_jobs set status='delegated',updated_at=v_now where id=v_job.id;
      continue;
    end if;
    if lower(coalesce(v_lead.status,'')) in ('lost','closed','archived','cancelled','deleted','converted') then
      update public.lead_agent_email_jobs set status='skipped',last_error='lead_closed',updated_at=v_now where id=v_job.id;
      continue;
    end if;
    if v_job.first_attempt_at < v_now-interval '23 hours' or v_job.attempts >= 8 then
      update public.lead_agent_email_jobs set status='needs_attention',last_error='Email retry window exhausted.',updated_at=v_now where id=v_job.id;
      continue;
    end if;

    if v_job.kind='client_intro' then
      select * into v_contact from public.contacts where contact_id=v_lead.contact_id and organisation_id=v_job.organisation_id;
      if v_job.payload_json is not null and (v_contact.contact_id is null
        or v_contact.contact_id::text is distinct from v_job.payload_json->>'contactId'
        or lower(trim(v_contact.email)) is distinct from v_job.payload_json->>'to') then
        update public.lead_agent_email_jobs set status='needs_attention',last_error='Frozen intro recipient no longer matches the saved contact.',updated_at=v_now where id=v_job.id;
        continue;
      end if;
      if v_contact.contact_id is null or coalesce(v_contact.email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        update public.lead_agent_email_jobs set status='waiting_recipient',next_attempt_at=v_now+interval '5 minutes',
          last_error='Add a valid buyer or seller email address to send the intro.',updated_at=v_now where id=v_job.id;
        continue;
      end if;
      if v_job.payload_json is null then
        select * into v_member from public.organisation_users u
        where u.organisation_id=v_job.organisation_id and u.status in ('active','accepted')
          and (u.user_id=coalesce(v_lead.assigned_user_id,v_lead.assigned_agent_id)
            or to_jsonb(u)->>'id'=coalesce(v_lead.assigned_user_id,v_lead.assigned_agent_id)::text)
        order by u.updated_at desc nulls last limit 1;
        v_job.payload_json := jsonb_build_object(
          'to',lower(trim(v_contact.email)),'contactId',v_contact.contact_id,
          'leadName',coalesce(nullif(trim(concat_ws(' ',v_contact.first_name,v_contact.last_name)),''),'there'),
          'leadSource',coalesce(nullif(v_lead.lead_source,''),'Direct enquiry'),
          'leadCategory',v_lead.lead_category,'enquiryReceivedAt',coalesce(v_lead.source_received_at,v_lead.created_at),
          'enquiryKind',case
            when coalesce(v_lead.raw_enquiry_payload->>'role',v_lead.raw_enquiry_payload#>>'{rentalCrm,role}',v_lead.raw_enquiry_payload#>>'{rental_crm,role}')='landlord' then 'landlord'
            when coalesce(v_lead.raw_enquiry_payload->>'arch9RentalLead',v_lead.raw_enquiry_payload#>>'{rentalCrm,arch9RentalLead}',v_lead.raw_enquiry_payload#>>'{rental_crm,arch9RentalLead}')='true'
              or coalesce(v_lead.raw_enquiry_payload->>'classification',v_lead.raw_enquiry_payload#>>'{rentalCrm,classification}',v_lead.raw_enquiry_payload#>>'{rental_crm,classification}')='rental'
              or lower(v_lead.lead_category)='tenant' then 'rental'
            when lower(v_lead.lead_category) in ('seller','landlord') then case when lower(v_lead.lead_category)='landlord' then 'landlord' else 'seller' end
            else 'sale' end,
          'originalMessage',v_lead.notes,
          'propertyAddress',coalesce(v_lead.enquired_property_address,to_jsonb(v_lead)->>'seller_property_address'),
          'agentName',nullif(trim(concat_ws(' ',v_member.first_name,v_member.last_name)),''),
          'agentEmail',v_member.email,'agentPhone',to_jsonb(v_member)->>'phone',
          'agentJobTitle',to_jsonb(v_member)->>'job_title','agentAvatarUrl',to_jsonb(v_member)->>'avatar_url',
          'metadata',jsonb_build_object(
            'controlledTestRoleSet',coalesce(v_lead.raw_enquiry_payload->>'controlledTestRoleSet',v_lead.raw_enquiry_payload#>>'{metadata,controlledTestRoleSet}'),
            'testDataProtection',coalesce(v_lead.raw_enquiry_payload->'testDataProtection',v_lead.raw_enquiry_payload#>'{metadata,testDataProtection}')));
      end if;
      update public.lead_agent_email_jobs set status='processing',payload_json=v_job.payload_json,
        attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=v_now+interval '5 minutes',
        first_attempt_at=coalesce(first_attempt_at,v_now),updated_at=v_now
      where id=v_job.id returning * into v_job;
      return next v_job;
      continue;
    end if;

    v_owner := coalesce(v_lead.assigned_user_id,v_lead.assigned_agent_id)::text;
    if v_job.payload_json is not null and not exists (
      select 1 from public.organisation_users u
      where u.organisation_id=v_job.organisation_id and u.status in ('active','accepted')
        and u.user_id::text=v_job.payload_json->>'recipientUserId'
        and lower(trim(u.email))=v_job.payload_json->>'to'
        and ((v_job.kind='agent' and (u.user_id::text=v_owner or to_jsonb(u)->>'id'=v_owner))
          or (v_job.kind='manager' and (lower(u.role) in ('owner','principal','agency_principal','admin','super_admin')
            or (lower(u.role) in ('branch_manager','agency_manager','manager') and u.branch_id=v_lead.branch_id))))
    ) then
      update public.lead_agent_email_jobs set status='needs_attention',last_error='Frozen email recipient is no longer eligible.',updated_at=v_now where id=v_job.id;
      continue;
    end if;
    if v_job.payload_json is null then
      v_member := null;
      if v_job.kind='agent' then
        select * into v_member from public.organisation_users u
        where u.organisation_id=v_job.organisation_id and u.status in ('active','accepted')
          and (u.user_id::text=v_owner or to_jsonb(u)->>'id'=v_owner)
          and u.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        order by u.updated_at desc nulls last limit 1;
      else
        select * into v_member from public.organisation_users u
        where u.organisation_id=v_job.organisation_id and u.status in ('active','accepted')
          and u.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
          and (lower(u.role) in ('owner','principal','agency_principal','admin','super_admin')
            or (lower(u.role) in ('branch_manager','agency_manager','manager') and u.branch_id=v_lead.branch_id))
        order by case when u.branch_id=v_lead.branch_id then 0 else 1 end,
          case when lower(u.role) in ('owner','principal','agency_principal') then 0 else 1 end,u.user_id
        limit 1;
      end if;
      if v_member.user_id is null then
        update public.lead_agent_email_jobs set
          status=case when v_job.kind='manager' then 'needs_attention' else 'waiting_recipient' end,
          next_attempt_at=v_now+interval '5 minutes',
          last_error=case when v_job.kind='manager' then 'No eligible manager email is available.' else 'No active assigned agent with a valid email is available.' end,
          updated_at=v_now where id=v_job.id;
        continue;
      end if;
      select * into v_contact from public.contacts
        where contact_id=v_lead.contact_id and organisation_id=v_job.organisation_id;
      v_name := coalesce(nullif(trim(concat_ws(' ',v_contact.first_name,v_contact.last_name)),''),'New lead');
      v_rental := coalesce(v_lead.raw_enquiry_payload->>'arch9RentalLead','false')='true'
        or lower(coalesce(v_lead.raw_enquiry_payload->>'classification',''))='rental'
        or lower(coalesce(v_lead.raw_enquiry_payload->>'role','')) in ('tenant','landlord');
      v_job.payload_json := jsonb_build_object(
        'eventKind',case when v_job.kind='agent' then 'new_enquiry_assigned_agent' else 'new_enquiry_unassigned_manager' end,
        'organisationId',v_job.organisation_id,'leadId',v_job.lead_id,
        'to',lower(trim(v_member.email)),'recipientUserId',v_member.user_id,
        'recipientName',coalesce(nullif(trim(concat_ws(' ',v_member.first_name,v_member.last_name)),''),'there'),
        'leadName',v_name,'leadEmail',v_contact.email,'leadPhone',v_contact.phone,
        'leadSource',coalesce(nullif(v_lead.lead_source,''),'Manual Entry'),
        'leadCategory',v_lead.lead_category,'leadStatus',v_lead.status,
        'propertyLabel',coalesce(v_lead.enquired_property_title,to_jsonb(v_lead)->>'property_interest'),
        'propertyAddress',coalesce(v_lead.enquired_property_address,to_jsonb(v_lead)->>'seller_property_address'),
        'enquiryMessage',v_lead.notes,'rental',v_rental,
        'metadata',jsonb_build_object(
          'controlledTestRoleSet',coalesce(v_lead.raw_enquiry_payload->>'controlledTestRoleSet',v_lead.raw_enquiry_payload#>>'{metadata,controlledTestRoleSet}'),
          'testDataProtection',coalesce(v_lead.raw_enquiry_payload->'testDataProtection',v_lead.raw_enquiry_payload#>'{metadata,testDataProtection}')),
        'reason',case when v_job.kind='manager' then coalesce(v_job.last_error,'The lead needs an agent who can receive its email.') else null end
      );
    end if;
    update public.lead_agent_email_jobs set status='processing',payload_json=v_job.payload_json,
      attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=v_now+interval '5 minutes',
      first_attempt_at=coalesce(first_attempt_at,v_now),updated_at=v_now
    where id=v_job.id returning * into v_job;
    return next v_job;
  end loop;
end $$;

create or replace function public.lead_agent_email_freeze(p_id uuid,p_claim_token uuid,p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.lead_agent_email_jobs%rowtype;
begin
  select * into v_job from public.lead_agent_email_jobs where id=p_id for update;
  if v_job.status is distinct from 'processing' or v_job.claim_token is distinct from p_claim_token
    or v_job.lease_until < clock_timestamp() then raise exception 'Invalid email claim' using errcode='42501'; end if;
  if v_job.kind='client_intro' then
    if not exists(select 1 from public.leads l join public.contacts c
      on c.contact_id=l.contact_id and c.organisation_id=l.organisation_id
      where l.lead_id=v_job.lead_id and l.organisation_id=v_job.organisation_id
        and c.contact_id::text=v_job.payload_json->>'contactId'
        and lower(trim(c.email))=v_job.payload_json->>'to'
        and lower(coalesce(l.status,'')) not in ('lost','closed','archived','cancelled','deleted','converted')) then
      raise exception 'Intro recipient is no longer eligible' using errcode='42501';
    end if;
  else
  if not exists(select 1 from public.leads l join public.organisation_users u on u.organisation_id=l.organisation_id
    where l.lead_id=v_job.lead_id and l.organisation_id=v_job.organisation_id
      and u.user_id::text=v_job.payload_json->>'recipientUserId' and u.status in ('active','accepted')
      and lower(trim(u.email))=v_job.payload_json->>'to'
      and ((v_job.kind='agent' and (u.user_id=coalesce(l.assigned_user_id,l.assigned_agent_id)
        or to_jsonb(u)->>'id'=coalesce(l.assigned_user_id,l.assigned_agent_id)::text))
        or (v_job.kind='manager' and (lower(u.role) in ('owner','principal','agency_principal','admin','super_admin')
          or (lower(u.role) in ('branch_manager','agency_manager','manager') and u.branch_id=l.branch_id))))) then
    raise exception 'Email recipient is no longer eligible' using errcode='42501';
  end if;
  end if;
  if v_job.envelope_json is not null then return v_job.envelope_json; end if;
  if p_envelope->>'to' is distinct from v_job.payload_json->>'to'
    or nullif(p_envelope->>'subject','') is null or nullif(p_envelope->>'html','') is null then
    raise exception 'Invalid email envelope' using errcode='22023';
  end if;
  update public.lead_agent_email_jobs set envelope_json=p_envelope,updated_at=clock_timestamp() where id=p_id;
  return p_envelope;
end $$;

create function public.lead_client_intro_status(p_organisation_id uuid,p_lead_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('status',status,'providerMessageId',provider_message_id,'reason',last_error)
  from public.lead_agent_email_jobs where organisation_id=p_organisation_id and lead_id=p_lead_id and kind='client_intro';
$$;
revoke all on function public.lead_client_intro_capture(),public.lead_client_intro_contact_changed(),
  public.lead_client_intro_linked_contact_changed(),public.lead_client_intro_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lead_client_intro_status(uuid,uuid) to service_role;
comment on table public.lead_agent_email_jobs is
  'Service-only durable agency lead emails: client intros, agent alerts and manager fallbacks. Sent means provider acceptance, not inbox delivery.';
notify pgrst,'reload schema';
commit;
