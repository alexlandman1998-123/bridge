begin;
grant usage on schema handoff_private to service_role;

-- The browser saves the source facts. These triggers persist dispatch intent in
-- that same commit. Only the service worker prepares matters and records sends.
alter table public.transaction_handoffs
  add column dispatch_generation bigint not null default 1,
  add column dispatch_status text not null default 'waiting',
  add column dispatch_reason text,
  add column workspace_prepared_at timestamptz,
  add column next_delivery_attempt_at timestamptz,
  add column delivery_attempts integer not null default 0;

create table public.transaction_handoff_dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.transaction_handoffs(id) on delete cascade,
  generation bigint not null,
  channel text not null check (channel in ('workspace','email')),
  recipient_key text not null default '',
  destination_organisation_id uuid,
  status text not null check (status in ('queued','leased','retry','blocked','sent','exhausted','superseded')),
  reason text,
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  first_provider_attempt_at timestamptz,
  provider_id text,
  sent_at timestamptz,
  context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(handoff_id,generation,channel,recipient_key)
);
create index transaction_handoff_dispatch_due_idx on public.transaction_handoff_dispatch_jobs(next_attempt_at,created_at)
  where status in ('queued','retry','leased');
alter table public.transaction_handoff_dispatch_jobs enable row level security;
revoke all on public.transaction_handoff_dispatch_jobs from public,anon,authenticated;
grant all on public.transaction_handoff_dispatch_jobs to service_role;
create table public.transaction_handoff_dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.transaction_handoff_dispatch_jobs(id) on delete cascade,
  attempt integer not null,
  lease_token uuid not null,
  status text not null check(status in ('claimed','sent','failed','lease_expired','superseded')),
  reason text,
  provider_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(job_id,attempt)
);
alter table public.transaction_handoff_dispatch_attempts enable row level security;
revoke all on public.transaction_handoff_dispatch_attempts from public,anon,authenticated;
grant all on public.transaction_handoff_dispatch_attempts to service_role;

create table handoff_private.email_payloads (
  job_id uuid primary key references public.transaction_handoff_dispatch_jobs(id) on delete cascade,
  payload jsonb not null
);
alter table handoff_private.email_payloads enable row level security;
revoke all on handoff_private.email_payloads from public,anon,authenticated;

create function handoff_private.refresh_dispatch(p_handoff_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h public.transaction_handoffs; jobs integer; done integer; failures integer; blocked integer;
  why text; next_at timestamptz; attempts integer; state text;
begin
  select * into h from public.transaction_handoffs where id=p_handoff_id;
  if not found then return; end if;
  select count(*),count(*) filter(where status='sent'),count(*) filter(where status in ('retry','exhausted')),
    count(*) filter(where status='blocked'),min(next_attempt_at) filter(where status in ('retry','queued')),
    coalesce(max(attempt_count),0),max(reason) filter(where status in ('blocked','retry','exhausted'))
  into jobs,done,failures,blocked,next_at,attempts,why
  from public.transaction_handoff_dispatch_jobs where handoff_id=h.id and generation=h.dispatch_generation and status<>'superseded';
  state:=case when blocked>0 then 'blocked' when failures>0 then 'failed' when jobs>0 and jobs=done then 'sent'
    when jobs>0 then 'pending' else 'waiting' end;
  update public.transaction_handoffs set dispatch_status=state,dispatch_reason=why,
    next_delivery_attempt_at=next_at,delivery_attempts=attempts,
    delivery_status=case when state='sent' then 'sent' when state='failed' then 'failed'
      when state='pending' then 'pending' else 'not_recorded' end where id=h.id;
  if state='sent' and h.dispatch_status<>'sent' then
    insert into public.transaction_events(transaction_id,event_type,event_data)
      values(h.transaction_id,'organisation_handoff_delivered',jsonb_build_object('handoffId',h.id,'generation',h.dispatch_generation,
        'roleType',h.role_type,'organisationId',h.destination_organisation_id,'visibility','client_visible','audience','buyer',
        'title','Partner instruction delivered','description','The instruction email has been accepted by the email provider. Organisation acceptance is tracked separately.'));
  end if;
end $$;

create function handoff_private.handoff_dispatch_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.owner_organisation_id,new.required,new.destination_organisation_id,
    new.nomination_status,new.instruction_status,new.exception_keys)
    is distinct from row(old.owner_organisation_id,old.required,old.destination_organisation_id,
    old.nomination_status,old.instruction_status,old.exception_keys) then
    new.dispatch_generation:=old.dispatch_generation+1;
    new.workspace_prepared_at:=null;
  elsif tg_op='UPDATE' and (new.invitation_id is distinct from old.invitation_id or new.roleplayer_id is distinct from old.roleplayer_id) then
    -- Consultant/contact or invitation refreshes do not repeat an organisation instruction.
    new.delivery_status:=old.delivery_status;
  end if;
  return new;
end $$;
create trigger handoff_dispatch_version before update on public.transaction_handoffs
  for each row execute function handoff_private.handoff_dispatch_version();

create function handoff_private.queue_dispatch() returns trigger
language plpgsql security definer set search_path='' as $$
declare state text; why text; finance_owner text;
begin
  if tg_op='UPDATE' and new.dispatch_generation=old.dispatch_generation then return null; end if;
  update public.transaction_handoff_dispatch_attempts a set status='superseded',reason='source_changed',completed_at=now()
    from public.transaction_handoff_dispatch_jobs j where j.id=a.job_id and j.handoff_id=new.id
      and j.generation<>new.dispatch_generation and a.status='claimed';
  update public.transaction_handoff_dispatch_jobs set status='superseded',lease_token=null,lease_expires_at=null,updated_at=now()
    where handoff_id=new.id and generation<>new.dispatch_generation and status not in ('sent','superseded');
  if not new.required then perform handoff_private.refresh_dispatch(new.id); return null; end if;
  select finance_managed_by into finance_owner from public.transactions where id=new.transaction_id;
  why:=case when new.instruction_status<>'ready' then new.instruction_status
    when new.role_type='bond_attorney' and coalesce(finance_owner,'')<>'bond_originator' then 'awaiting_bond_attorney_instruction'
    when cardinality(new.exception_keys)>0 then new.exception_keys[1]
    when new.nomination_status='invited' then 'awaiting_partner_signup'
    when new.destination_organisation_id is null then 'destination_missing' end;
  state:=case when why is null then 'queued' else 'blocked' end;
  insert into public.transaction_handoff_dispatch_jobs(handoff_id,generation,channel,destination_organisation_id,status,reason)
    values(new.id,new.dispatch_generation,'workspace',new.destination_organisation_id,state,why) on conflict do nothing;
  perform handoff_private.refresh_dispatch(new.id);
  return null;
end $$;
create trigger handoff_dispatch_queue after insert or update on public.transaction_handoffs
  for each row execute function handoff_private.queue_dispatch();

create function handoff_private.job_current(p_job public.transaction_handoff_dispatch_jobs) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.transaction_handoffs h join public.transactions t on t.id=h.transaction_id
    where h.id=p_job.handoff_id and h.dispatch_generation=p_job.generation and h.required
      and h.instruction_status='ready' and h.nomination_status='nominated' and cardinality(h.exception_keys)=0
      and h.destination_organisation_id=p_job.destination_organisation_id
      and (h.invitation_status<>'pending' or h.invitation_expires_at>now())
      and lower(coalesce(to_jsonb(t)->>'status','')) not in ('cancelled','canceled','terminated','archived','completed')
      and nullif(to_jsonb(t)->>'archived_at','') is null
      and coalesce(to_jsonb(t)->>'is_archived','false')<>'true'
      and (h.role_type<>'bond_attorney' or t.finance_managed_by='bond_originator'));
$$;

create function public.claim_transaction_handoff_dispatch(p_limit integer default 10) returns setof public.transaction_handoff_dispatch_jobs
language plpgsql security definer set search_path='' as $$
declare j public.transaction_handoff_dispatch_jobs;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required' using errcode='42501'; end if;
  for j in select d.* from public.transaction_handoff_dispatch_jobs d join public.transaction_handoffs h on h.id=d.handoff_id
    where (d.status in ('queued','retry') and d.next_attempt_at<=now()) or (d.status='leased' and d.lease_expires_at<=now())
    order by d.next_attempt_at,d.created_at,d.id limit greatest(1,least(coalesce(p_limit,10),25)) for update of h skip locked loop
    if j.status='leased' then
      update public.transaction_handoff_dispatch_attempts set status='lease_expired',reason='worker_interrupted',completed_at=now()
        where job_id=j.id and attempt=j.attempt_count and status='claimed';
    end if;
    if not handoff_private.job_current(j) then
      update public.transaction_handoff_dispatch_jobs set status='superseded',reason='source_changed',lease_token=null,lease_expires_at=null where id=j.id;
    elsif j.attempt_count>=8 or (j.first_provider_attempt_at is not null and j.first_provider_attempt_at<=now()-interval '23 hours') then
      update public.transaction_handoff_dispatch_jobs set status='exhausted',reason=case when j.attempt_count>=8 then 'retries_exhausted' else 'delivery_confirmation_uncertain' end,
        lease_token=null,lease_expires_at=null where id=j.id;
    else
      update public.transaction_handoff_dispatch_jobs set status='leased',attempt_count=attempt_count+1,
        lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',updated_at=now() where id=j.id returning * into j;
      insert into public.transaction_handoff_dispatch_attempts(job_id,attempt,lease_token,status) values(j.id,j.attempt_count,j.lease_token,'claimed');
      return next j;
    end if;
    perform handoff_private.refresh_dispatch(j.handoff_id);
  end loop;
end $$;

create function public.complete_transaction_handoff_dispatch(p_id uuid,p_attempt integer,p_lease uuid,p_status text,p_provider_id text default null,p_reason text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.transaction_handoff_dispatch_jobs;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required' using errcode='42501'; end if;
  if p_status not in ('sent','failed','superseded') then raise exception 'Invalid receipt'; end if;
  perform 1 from public.transaction_handoffs where id=(select handoff_id from public.transaction_handoff_dispatch_jobs where id=p_id) for update;
  select * into j from public.transaction_handoff_dispatch_jobs where id=p_id for update;
  if p_attempt is null or p_lease is null or not found or j.status<>'leased' or j.attempt_count<>p_attempt or j.lease_token is distinct from p_lease or j.lease_expires_at<=now() then return false; end if;
  if not handoff_private.job_current(j) then p_status:='superseded'; end if;
  if p_status='sent' and j.channel='workspace' and not exists(select 1 from public.transaction_handoff_dispatch_jobs where handoff_id=j.handoff_id and generation=j.generation and channel='email') then raise exception 'Recipient work must be persisted before completion'; end if;
  if p_status='sent' and j.channel='email' and nullif(p_provider_id,'') is null then raise exception 'Provider receipt is required'; end if;
  update public.transaction_handoff_dispatch_jobs set status=case when p_status='failed' then case when attempt_count>=8 then 'exhausted' else 'retry' end else p_status end,
    reason=case when p_status='failed' then case when attempt_count>=8 then 'retries_exhausted' else coalesce(p_reason,'delivery_failed') end else null end,
    provider_id=case when p_status='sent' then p_provider_id else provider_id end,
    sent_at=case when p_status='sent' then now() else sent_at end,lease_token=null,lease_expires_at=null,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(j.attempt_count,7))::integer)),updated_at=now() where id=j.id;
  update public.transaction_handoff_dispatch_attempts set status=p_status,reason=p_reason,provider_id=case when p_status='sent' then p_provider_id end,completed_at=now()
    where job_id=j.id and attempt=j.attempt_count and lease_token=j.lease_token and status='claimed';
  perform handoff_private.refresh_dispatch(j.handoff_id); return true;
end $$;

create function public.prepare_transaction_handoff_workspace(p_id uuid,p_attempt integer,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.transaction_handoff_dispatch_jobs; h public.transaction_handoffs; tx public.transactions;
  assignment uuid; domain_id uuid; firm uuid; workflow uuid; candidate uuid; recipient record; contact text; email_count integer; kind text;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required' using errcode='42501'; end if;
  -- Match the source-trigger lock order: matter, handoff, then dispatch job.
  select * into j from public.transaction_handoff_dispatch_jobs where id=p_id;
  select * into tx from public.transactions where id=(select transaction_id from public.transaction_handoffs where id=j.handoff_id) for no key update;
  select * into h from public.transaction_handoffs where id=j.handoff_id for update;
  perform 1 from public.transaction_handoffs where id=(select handoff_id from public.transaction_handoff_dispatch_jobs where id=p_id) for update;
  select * into j from public.transaction_handoff_dispatch_jobs where id=p_id for update;
  if p_attempt is null or p_lease is null or j.id is null or j.channel<>'workspace' or j.status<>'leased' or j.attempt_count<>p_attempt or j.lease_token is distinct from p_lease
    or j.lease_expires_at<=now() or not handoff_private.job_current(j) then return jsonb_build_object('prepared',false,'reason','stale_job'); end if;
  if h.role_type='bond_originator' then
    insert into public.transaction_finance_workflows(transaction_id,workflow_type) values(h.transaction_id,'bond_hybrid')
      on conflict(transaction_id,workflow_type) do nothing;
    select id into workflow from public.transaction_finance_workflows where transaction_id=h.transaction_id and workflow_type='bond_hybrid';
    select id,assigned_organisation_id into domain_id,candidate from public.transaction_bond_applications
      where transaction_id=h.transaction_id and application_type='originator_intake' for update;
    if domain_id is not null and candidate is not null and candidate<>h.destination_organisation_id then
      perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'domain_destination_conflict');
      return jsonb_build_object('prepared',false,'reason','domain_destination_conflict');
    end if;
    if domain_id is null then
      insert into public.transaction_bond_applications(transaction_id,workflow_id,application_type,bank_name,status,assigned_organisation_id,
        assignment_status,assignment_source,scope_level,scope_metadata,metadata)
      values(h.transaction_id,workflow,'originator_intake','Bond Originator Intake','pending',h.destination_organisation_id,
        'organisation_queue','transaction_roleplayer_propagation','workspace_hq',jsonb_build_object('source','durable_handoff','handoffId',h.id),
        jsonb_build_object('source','durable_handoff','handoffId',h.id,'canonicalStatus','new_application')) returning id into domain_id;
    elsif candidate is null then
      update public.transaction_bond_applications set assigned_organisation_id=h.destination_organisation_id where id=domain_id;
    end if;
    update public.transactions set bond_workspace_id=h.destination_organisation_id,
      bond_assignment_status=coalesce(bond_assignment_status,'workspace_assigned'),bond_assignment_source=coalesce(bond_assignment_source,'workflow_assignment'),updated_at=now()
      where id=h.transaction_id;
  else
    select id into firm from public.attorney_firms where organisation_id=h.destination_organisation_id order by id limit 1;
    if firm is null then
      perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'attorney_firm_not_linked');
      return jsonb_build_object('prepared',false,'reason','attorney_firm_not_linked');
    end if;
    kind:=case h.role_type when 'transfer_attorney' then 'transfer' when 'bond_attorney' then 'bond' else 'cancellation' end;
    select id,coalesce(attorney_firm_id,firm_id) into domain_id,candidate from public.transaction_attorney_assignments
      where transaction_id=h.transaction_id and attorney_role=h.role_type and coalesce(assignment_status,status,'') not in ('removed','completed')
      order by updated_at desc,id limit 1 for update;
    if domain_id is not null and candidate is distinct from firm then
      perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'domain_destination_conflict');
      return jsonb_build_object('prepared',false,'reason','domain_destination_conflict');
    end if;
    if domain_id is null then
      insert into public.transaction_attorney_assignments(transaction_id,firm_id,attorney_firm_id,attorney_role,assignment_type,
        status,assignment_status,is_primary,instruction_status,firm_acceptance_status,staff_assignment_status,allocation_state)
      values(h.transaction_id,firm,firm,h.role_type,kind,'pending','pending',true,'ready_for_acceptance',
        'awaiting_firm_acceptance','awaiting_staff_assignment','awaiting_firm_acceptance') returning id into domain_id;
    else
      update public.transaction_attorney_assignments set instruction_status='ready_for_acceptance',updated_at=now()
      where id=domain_id and instruction_status not in ('accepted','declined','removed','completed');
    end if;
  end if;
  select id into assignment from public.transaction_partner_assignments where transaction_id=h.transaction_id
    and partner_organisation_id=h.destination_organisation_id and partner_role=h.role_type and assignment_status='active'
    order by created_at,id limit 1;
  if assignment is null then
    insert into public.transaction_partner_assignments(transaction_id,agency_organisation_id,partner_organisation_id,partner_service_type,
      partner_role,delivery_type,assignment_status,source,activated_at,pending_work_delivery)
    values(h.transaction_id,h.owner_organisation_id,h.destination_organisation_id,
      case when h.role_type='bond_originator' then 'bond_origination' else 'property_transfers' end,h.role_type,h.handoff_type,'active','routing',now(),
      jsonb_build_object('handoffId',h.id,'generation',h.dispatch_generation,'organisationLevelAssignment',true)) returning id into assignment;
  end if;
  -- Stable notification identity: email retries never duplicate or reset it.
  insert into public.partner_portal_notifications(id,transaction_partner_assignment_id,organisation_id,partner_id,bond_application_id,notification_type,title)
    values(j.id,assignment,h.owner_organisation_id,h.destination_organisation_id,case when h.role_type='bond_originator' then domain_id end,
      'organisation_handoff_ready','A new partner instruction is ready') on conflict(id) do nothing;
  if h.workspace_prepared_at is null then
    insert into public.transaction_events(transaction_id,event_type,event_data) values(h.transaction_id,'organisation_handoff_prepared',
      jsonb_build_object('handoffId',h.id,'generation',h.dispatch_generation,'organisationId',h.destination_organisation_id,'roleType',h.role_type,
        'domainRecordId',domain_id,'partnerAssignmentId',assignment,'visibility','client_visible','audience','buyer',
        'title','Partner matter prepared','description','The partner organisation can receive this matter. Delivery and acceptance are tracked separately.'));
  end if;
  update public.transaction_handoffs set workspace_prepared_at=coalesce(workspace_prepared_at,now()) where id=h.id;
  select email into contact from public.organisations o
    cross join lateral (values (1,lower(trim(to_jsonb(o)->>'company_email'))),
      (2,lower(trim(to_jsonb(o)->>'primary_contact_email')))) contacts(priority,email)
    where o.id=h.destination_organisation_id and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    order by priority limit 1;
  for recipient in
    select distinct email from (
      select contact as email where contact is not null
      union all
      select lower(trim(u.email)) from public.organisation_users u where u.organisation_id=h.destination_organisation_id and u.status='active'
        and contact is null and lower(u.role) in ('owner','admin','organisation_admin','workspace_admin','principal','firm_admin','director_partner','director','hq_manager','bond_manager','manager')
        and coalesce(to_jsonb(u)->>'scope_level','workspace_hq') in ('workspace_hq','organisation','organization')
        and (to_jsonb(u)->>'scope_level' is not null or nullif(to_jsonb(u)->>'branch_id','') is null)
      union all
      select lower(trim(p.email)) from public.attorney_firm_members m join public.profiles p on p.id=m.user_id
        where contact is null and m.firm_id=firm and m.status='active' and m.role in ('firm_admin','director_partner')
    ) recipients where email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' loop
    insert into public.transaction_handoff_dispatch_jobs(handoff_id,generation,channel,recipient_key,destination_organisation_id,status,context)
      values(h.id,h.dispatch_generation,'email',recipient.email,h.destination_organisation_id,'queued',jsonb_build_object(
        'transactionId',h.transaction_id,'transactionReference',coalesce(to_jsonb(tx)->>'transaction_reference',h.transaction_id::text),
        'roleType',h.role_type,'organisationName',h.destination_company_name,'partnerAssignmentId',assignment,
        'controlledTestRoleSet',to_jsonb(tx)#>>'{metadata,controlledTestRoleSet}',
        'testDataProtection',coalesce(to_jsonb(tx)#>'{metadata,testDataProtection}',jsonb_build_object('isTestData',coalesce(to_jsonb(tx)->>'is_demo_data','false')='true')))) on conflict do nothing;
  end loop;
  select count(*) into email_count from public.transaction_handoff_dispatch_jobs where handoff_id=h.id and generation=h.dispatch_generation and channel='email';
  if email_count=0 then
    perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'organisation_contact_missing');
    return jsonb_build_object('prepared',true,'reason','organisation_contact_missing');
  end if;
  perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'sent');
  return jsonb_build_object('prepared',true,'recipientCount',email_count);
end $$;

create function public.freeze_transaction_handoff_email(p_id uuid,p_attempt integer,p_lease uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.transaction_handoff_dispatch_jobs; frozen jsonb;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required' using errcode='42501'; end if;
  perform 1 from public.transaction_handoffs where id=(select handoff_id from public.transaction_handoff_dispatch_jobs where id=p_id) for update;
  select * into j from public.transaction_handoff_dispatch_jobs where id=p_id for update;
  if p_attempt is null or p_lease is null or j.id is null or j.channel<>'email' or j.status<>'leased' or j.attempt_count<>p_attempt or j.lease_token is distinct from p_lease
    or j.lease_expires_at<=now() or not handoff_private.job_current(j) then return null; end if;
  if p_payload->>'to' is distinct from j.recipient_key or p_payload->>'idempotencyKey' is distinct from 'transaction-handoff:'||j.id::text then
    raise exception 'Email must match the persisted recipient and dispatch identity'; end if;
  insert into handoff_private.email_payloads(job_id,payload) values(j.id,p_payload) on conflict do nothing;
  select payload into frozen from handoff_private.email_payloads where job_id=j.id;
  update public.transaction_handoff_dispatch_jobs set first_provider_attempt_at=coalesce(first_provider_attempt_at,now()) where id=j.id;
  return frozen;
end $$;

create function public.bridge_transaction_handoff_dispatch_mode(p_transaction_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('enabled',count(*)>0,'version','transaction_handoff_dispatch_v1',
    'managedRoles',coalesce(jsonb_agg(role_type) filter(where required and instruction_status='ready' and dispatch_reason is distinct from 'awaiting_bond_attorney_instruction'),'[]'::jsonb))
  from public.transaction_handoffs where transaction_id=p_transaction_id;
$$;
revoke all on function public.bridge_transaction_handoff_dispatch_mode(uuid) from public,anon;
grant execute on function public.bridge_transaction_handoff_dispatch_mode(uuid) to authenticated,service_role;

-- Existing ready matters need an explicit recovery decision; installing this
-- migration must not replay historical instruction emails automatically.
insert into public.transaction_handoff_dispatch_jobs(handoff_id,generation,channel,destination_organisation_id,status,reason)
  select id,dispatch_generation,'workspace',destination_organisation_id,'blocked',
    case when instruction_status='ready' then 'historical_delivery_review_required' else instruction_status end
  from public.transaction_handoffs where required;
do $$ declare h record; begin
  for h in select id from public.transaction_handoffs loop perform handoff_private.refresh_dispatch(h.id); end loop;
end $$;

revoke all on all functions in schema handoff_private from public,anon,authenticated;
revoke all on function public.claim_transaction_handoff_dispatch(integer) from public,anon,authenticated;
revoke all on function public.complete_transaction_handoff_dispatch(uuid,integer,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.prepare_transaction_handoff_workspace(uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.freeze_transaction_handoff_email(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_transaction_handoff_dispatch(integer) to service_role;
grant execute on function public.complete_transaction_handoff_dispatch(uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.prepare_transaction_handoff_workspace(uuid,integer,uuid) to service_role;
grant execute on function public.freeze_transaction_handoff_email(uuid,integer,uuid,jsonb) to service_role;
create or replace function public.bridge_handle_attorney_assignment_notifications_phase6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instruction text := lower(coalesce(to_jsonb(new)->>'instruction_status', ''));
  v_old_instruction text := lower(coalesce(to_jsonb(old)->>'instruction_status', ''));
  v_assignment text := lower(coalesce(to_jsonb(new)->>'assignment_status', to_jsonb(new)->>'status', ''));
  v_old_assignment text := lower(coalesce(to_jsonb(old)->>'assignment_status', to_jsonb(old)->>'status', ''));
  v_key text := 'attorney_assignment_changed';
  v_role text := coalesce(to_jsonb(new)->>'attorney_role', to_jsonb(new)->>'assignment_type', 'attorney');
begin
  if tg_op = 'UPDATE'
    and v_instruction is not distinct from v_old_instruction
    and v_assignment is not distinct from v_old_assignment
    and (to_jsonb(new)->>'attorney_user_id') is not distinct from (to_jsonb(old)->>'attorney_user_id') then
    return new;
  end if;

  if v_instruction in ('ready_for_acceptance', 'ready', 'sent') then
    v_key := 'attorney_instruction_ready';
  elsif v_instruction = 'accepted' then
    v_key := 'attorney_instruction_accepted';
  elsif v_instruction = 'declined' then
    v_key := 'attorney_instruction_declined';
  end if;

  -- Formal instruction delivery belongs to the organisation outbox. Keep
  -- acceptance, decline and later assignment notifications on their existing path.
  if v_key='attorney_instruction_ready' and exists(select 1 from public.transaction_handoffs h
    where h.transaction_id=new.transaction_id and h.role_type=v_role and h.required
      and h.instruction_status='ready' and h.dispatch_reason is distinct from 'awaiting_bond_attorney_instruction') then
    return new;
  end if;

  perform public.bridge_queue_bond_attorney_legal_event_phase6(
    v_key,
    new.transaction_id,
    public.bridge_phase6_title_case(v_key),
    public.bridge_phase6_title_case(v_role) || ' instruction status is ' || public.bridge_phase6_title_case(coalesce(nullif(v_instruction, ''), v_assignment)) || '.',
    v_key || ':transaction-attorney-assignment:' || new.id::text || ':' || coalesce(nullif(v_instruction, ''), v_assignment, 'event'),
    jsonb_strip_nulls(jsonb_build_object(
      'workflowLabel', public.bridge_phase6_title_case(v_role),
      'status', public.bridge_phase6_title_case(coalesce(nullif(v_instruction, ''), v_assignment)),
      'previousStatus', public.bridge_phase6_title_case(coalesce(nullif(v_old_instruction, ''), v_old_assignment)),
      'reason', to_jsonb(new)->>'instruction_decision_note',
      'nextAction', case when v_key = 'attorney_instruction_declined' then 'Review attorney reassignment.' else null end
    )),
    'transaction_attorney_assignments'
  );

  return new;
end;
$$;

revoke all on function public.bridge_handle_attorney_assignment_notifications_phase6() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
