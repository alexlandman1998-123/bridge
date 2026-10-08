begin;

-- The lead and its alert commit together. No historical backfill is performed.
create table public.lead_agent_email_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  kind text not null default 'agent' check (kind in ('agent', 'manager')),
  status text not null default 'pending' check (status in
    ('pending','processing','waiting_recipient','sent','skipped','delegated','needs_attention')),
  payload_json jsonb,
  envelope_json jsonb,
  attempts integer not null default 0,
  claim_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default (clock_timestamp() + interval '15 seconds'),
  first_attempt_at timestamptz,
  provider_message_id text,
  last_error text,
  attention_task_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organisation_id, lead_id, kind)
);
alter table public.lead_agent_email_jobs enable row level security;
revoke all on public.lead_agent_email_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.lead_agent_email_jobs to service_role;
create index lead_agent_email_jobs_due on public.lead_agent_email_jobs(next_attempt_at)
  where status in ('pending','waiting_recipient','processing');

create function public.lead_agent_email_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_raw jsonb := coalesce(new.raw_enquiry_payload, '{}'::jsonb);
begin
  if coalesce(new.lead_domain, 'agency') <> 'agency' then return new; end if;
  insert into public.lead_agent_email_jobs(organisation_id,lead_id,status,last_error)
  values(new.organisation_id,new.lead_id,
    case when v_raw #>> '{arch9_meta,ingestion_source}' = 'historical'
      or v_raw ->> 'arch9NotificationHistorical' = 'true' then 'skipped' else 'pending' end,
    case when v_raw #>> '{arch9_meta,ingestion_source}' = 'historical'
      or v_raw ->> 'arch9NotificationHistorical' = 'true' then 'historical_import' else null end)
  on conflict (organisation_id,lead_id,kind) do nothing;
  return new;
end $$;
create trigger trg_lead_agent_email_capture after insert on public.leads
for each row execute function public.lead_agent_email_capture();

create function public.lead_agent_email_assignment_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.lead_agent_email_jobs set next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  where organisation_id=new.organisation_id and lead_id=new.lead_id and kind='agent'
    and status='waiting_recipient';
  return new;
end $$;
create trigger trg_lead_agent_email_assignment_changed
after update of assigned_user_id,assigned_agent_id,assigned_agent_email on public.leads
for each row execute function public.lead_agent_email_assignment_changed();

create function public.lead_agent_email_escalate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_task uuid;
begin
  if new.kind = 'agent' and new.status in ('waiting_recipient','needs_attention') then
    insert into public.lead_agent_email_jobs(organisation_id,lead_id,kind,next_attempt_at,last_error)
    values(new.organisation_id,new.lead_id,'manager',clock_timestamp(),new.last_error)
    on conflict (organisation_id,lead_id,kind) do nothing;
  end if;
  if new.status = 'needs_attention' and new.attention_task_id is null then
    insert into public.tasks(organisation_id,lead_id,title,description,due_date,status,priority)
    values(new.organisation_id,new.lead_id,'Review lead email delivery',
      'The new lead email needs attention. Check assignment, the recipient email and the delivery queue.',
      (clock_timestamp() at time zone 'Africa/Johannesburg')::date,'Pending','High')
    returning task_id into v_task;
    update public.lead_agent_email_jobs set attention_task_id=v_task where id=new.id;
  end if;
  return new;
end $$;
create trigger trg_lead_agent_email_escalate after update of status on public.lead_agent_email_jobs
for each row when (old.status is distinct from new.status)
execute function public.lead_agent_email_escalate();

create function public.lead_agent_email_claim(p_limit integer default 25)
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
    if lower(coalesce(v_lead.status,'')) in ('lost','closed','archived','cancelled') then
      update public.lead_agent_email_jobs set status='skipped',last_error='lead_closed',updated_at=v_now where id=v_job.id;
      continue;
    end if;
    if v_job.first_attempt_at < v_now-interval '23 hours' or v_job.attempts >= 8 then
      update public.lead_agent_email_jobs set status='needs_attention',last_error='Email retry window exhausted.',updated_at=v_now where id=v_job.id;
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

create function public.lead_agent_email_freeze(p_id uuid,p_claim_token uuid,p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.lead_agent_email_jobs%rowtype;
begin
  select * into v_job from public.lead_agent_email_jobs where id=p_id for update;
  if v_job.status is distinct from 'processing' or v_job.claim_token is distinct from p_claim_token
    or v_job.lease_until < clock_timestamp() then raise exception 'Invalid email claim' using errcode='42501'; end if;
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
  if v_job.envelope_json is not null then return v_job.envelope_json; end if;
  if p_envelope->>'to' is distinct from v_job.payload_json->>'to'
    or nullif(p_envelope->>'subject','') is null or nullif(p_envelope->>'html','') is null then
    raise exception 'Invalid email envelope' using errcode='22023';
  end if;
  update public.lead_agent_email_jobs set envelope_json=p_envelope,updated_at=clock_timestamp() where id=p_id;
  return p_envelope;
end $$;

create function public.lead_agent_email_complete(p_id uuid,p_claim_token uuid,p_status text,
  p_provider_message_id text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_job public.lead_agent_email_jobs%rowtype;
begin
  select * into v_job from public.lead_agent_email_jobs where id=p_id for update;
  if v_job.status is distinct from 'processing' or v_job.claim_token is distinct from p_claim_token
    or v_job.lease_until < clock_timestamp() then raise exception 'Invalid email claim' using errcode='42501'; end if;
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid completion status'; end if;
  if p_status='sent' and nullif(trim(p_provider_message_id),'') is null then raise exception 'Provider acceptance is required'; end if;
  update public.lead_agent_email_jobs set
    status=case when p_status='failed' then case when attempts>=8 or first_attempt_at<clock_timestamp()-interval '23 hours'
      then 'needs_attention' else 'pending' end else p_status end,
    provider_message_id=case when p_status='sent' then p_provider_message_id else provider_message_id end,
    last_error=case when p_status='sent' then null else left(p_error,1000) end,
    claim_token=null,lease_until=null,updated_at=clock_timestamp(),
    next_attempt_at=clock_timestamp()+case attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
      when 3 then interval '15 minutes' when 4 then interval '30 minutes' else interval '1 hour' end
  where id=p_id;
  return true;
end $$;

create function public.lead_agent_email_status(p_organisation_id uuid,p_lead_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('status',status,'providerMessageId',provider_message_id,'reason',last_error)
  from public.lead_agent_email_jobs where organisation_id=p_organisation_id and lead_id=p_lead_id and kind='agent';
$$;

create function public.lead_agent_email_website_agent_eligible(p_organisation_id uuid,p_lead_id uuid,p_email text)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from public.leads l join public.organisation_users u on u.organisation_id=l.organisation_id
    where l.organisation_id=p_organisation_id and l.lead_id=p_lead_id and u.status in ('active','accepted')
      and (u.user_id=coalesce(l.assigned_user_id,l.assigned_agent_id)
        or to_jsonb(u)->>'id'=coalesce(l.assigned_user_id,l.assigned_agent_id)::text)
      and lower(trim(u.email))=lower(trim(p_email)));
$$;

-- Recover terminal website attempts too. Limit this to leads captured after
-- this release so old enquiry backlogs cannot generate surprise emails.
create function public.lead_agent_email_reconcile_websites() returns integer
language plpgsql security definer set search_path='' as $$
declare v_event record; v_task uuid; v_count integer:=0;
begin
  for v_event in
    select e.*,s.id as receipt_id,j.id as job_id,j.status as job_status
    from public.website_lead_submissions s
    join public.notification_events e on (e.id=s.notification_event_id or e.id=s.fallback_notification_event_id)
      and e.organisation_id=s.organisation_id and e.lead_id=s.lead_id
    join public.lead_agent_email_jobs j on j.organisation_id=s.organisation_id and j.lead_id=s.lead_id and j.kind='agent'
    where e.source='agency_website' and e.automation_key='website_lead_received' and e.channel='email'
      and e.dispatch_attempt_count>=e.max_dispatch_attempts
      and (e.status='failed' or (e.status='processing' and e.last_dispatch_attempt_at<clock_timestamp()-interval '5 minutes'))
      and coalesce(e.metadata_json->>'leadEmailAttentionRecorded','false')<>'true'
    order by e.created_at limit 25 for update of s,e skip locked
  loop
    if v_event.status='processing' then
      perform public.website_complete_lead_notification(v_event.receipt_id,v_event.id,'failed',null,'Final website email attempt was interrupted.');
    end if;
    if v_event.event_key='new_enquiry_assigned_agent' and v_event.job_status in ('delegated','pending','waiting_recipient') then
      update public.lead_agent_email_jobs set status='needs_attention',last_error='Website agent email exhausted its retry attempts.',updated_at=clock_timestamp()
      where id=v_event.job_id;
    else
      insert into public.tasks(organisation_id,lead_id,title,description,due_date,status,priority)
      values(v_event.organisation_id,v_event.lead_id,'Review lead email delivery',
        'A website lead email exhausted its retries. Check the lead, recipient and notification receipt.',
        (clock_timestamp() at time zone 'Africa/Johannesburg')::date,'Pending','High') returning task_id into v_task;
    end if;
    update public.notification_events set metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object('leadEmailAttentionRecorded',true)
    where id=v_event.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create function public.lead_agent_email_run_dispatcher() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_url text; v_key text; v_id bigint; v_job record; v_task uuid;
begin
  perform public.lead_agent_email_reconcile_websites();
  -- A broken worker or missing Vault configuration must be visible in the app.
  -- Leave overdue jobs retryable; creating the task does not cancel delivery.
  for v_job in select id,organisation_id,lead_id from public.lead_agent_email_jobs
    where status='pending' and next_attempt_at<clock_timestamp()-interval '15 minutes'
      and attention_task_id is null
    order by next_attempt_at limit 25 for update skip locked
  loop
    insert into public.tasks(organisation_id,lead_id,title,description,due_date,status,priority)
    values(v_job.organisation_id,v_job.lead_id,'Review lead email delivery',
      'A queued lead email is overdue. Check the dispatcher schedule, credentials and delivery configuration.',
      (clock_timestamp() at time zone 'Africa/Johannesburg')::date,'Pending','High') returning task_id into v_task;
    update public.lead_agent_email_jobs set attention_task_id=v_task where id=v_job.id;
  end loop;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(v_url),'') is null or nullif(trim(v_key),'') is null then
    return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing');
  end if;
  select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/lead-agent-email-dispatcher',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key,'apikey',v_key),
    body:=jsonb_build_object('limit',10),timeout_milliseconds:=120000) into v_id;
  return jsonb_build_object('scheduled',true,'requestId',v_id);
end $$;

revoke all on function public.lead_agent_email_capture(),public.lead_agent_email_escalate(),public.lead_agent_email_assignment_changed(),
  public.lead_agent_email_claim(integer),public.lead_agent_email_freeze(uuid,uuid,jsonb),
  public.lead_agent_email_complete(uuid,uuid,text,text,text),public.lead_agent_email_status(uuid,uuid),
  public.lead_agent_email_website_agent_eligible(uuid,uuid,text),
  public.lead_agent_email_reconcile_websites(),public.lead_agent_email_run_dispatcher() from public,anon,authenticated;
grant execute on function public.lead_agent_email_claim(integer),public.lead_agent_email_freeze(uuid,uuid,jsonb),
  public.lead_agent_email_complete(uuid,uuid,text,text,text),public.lead_agent_email_status(uuid,uuid),
  public.lead_agent_email_website_agent_eligible(uuid,uuid,text),
  public.lead_agent_email_reconcile_websites(),public.lead_agent_email_run_dispatcher() to service_role;

select cron.schedule('arch9-lead-agent-email-dispatcher-1m','* * * * *',
  'select public.lead_agent_email_run_dispatcher();');
comment on table public.lead_agent_email_jobs is
  'Service-only durable new agency lead alerts, frozen provider requests, retries and manager escalation. Sent means provider acceptance, not inbox delivery.';
notify pgrst,'reload schema';
commit;
