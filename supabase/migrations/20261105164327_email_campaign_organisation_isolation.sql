begin;

-- Organisation controls are separate from operator safety stops.
alter table public.email_sending_policies
  add column organisation_daily_limit integer not null default 500 check (organisation_daily_limit between 1 and 500),
  add column manual_paused_at timestamptz,
  add column last_dispatch_at timestamptz;

create table public.email_campaign_account_limits (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  daily_limit integer not null default 0 check(daily_limit>=0),
  monthly_limit integer not null default 0 check(monthly_limit>=0),
  minimum_interval_ms integer not null default 1000 check(minimum_interval_ms between 1000 and 60000),
  next_request_at timestamptz,
  blocked_until timestamptz
);
insert into public.email_campaign_account_limits(singleton) values(true);
alter table public.email_campaign_account_limits enable row level security;
revoke all on public.email_campaign_account_limits from public,anon,authenticated;
grant select,update on public.email_campaign_account_limits to service_role;
alter table public.email_send_reservations add column budget_reserved_at timestamptz not null default now();
update public.email_send_reservations set budget_reserved_at=created_at;
grant update(budget_reserved_at) on public.email_send_reservations to service_role;
create index email_send_reservations_account_period on public.email_send_reservations(budget_reserved_at);
create index email_send_reservations_org_period on public.email_send_reservations(organisation_id,budget_reserved_at);

-- This table is populated only from server-verified provider receipts, never
-- from tenant-writable suppression metadata. It exposes no origin organisation.
create table public.email_campaign_provider_blocks (
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.email_campaign_provider_blocks enable row level security;
revoke all on public.email_campaign_provider_blocks from public,anon,authenticated;
grant select,insert,update on public.email_campaign_provider_blocks to service_role;
create function public.email_campaign_capture_provider_block()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.processed_at is not null and new.event_type in ('email.bounced','email.complained','email.suppressed') then
    insert into public.email_campaign_provider_blocks(email,reason)
      select r.email,new.event_type from public.email_campaign_recipients r where r.provider_message_id=new.provider_message_id
      on conflict(email) do nothing;
  end if;
  return new;
end $$;
create trigger email_campaign_capture_provider_block after insert or update on public.email_campaign_provider_receipts
  for each row execute function public.email_campaign_capture_provider_block();
insert into public.email_campaign_provider_blocks(email,reason)
  select distinct on(r.email) r.email,p.event_type from public.email_campaign_provider_receipts p
  join public.email_campaign_recipients r on r.provider_message_id=p.provider_message_id
  where p.processed_at is not null and p.event_type in ('email.bounced','email.complained','email.suppressed')
  order by r.email,p.received_at desc on conflict(email) do nothing;

-- Existing foreign keys ensure existence; this guard ensures the parent is in
-- the SAME organisation without adding ambiguous PostgREST relationships.
create function public.email_campaign_guard_organisation()
returns trigger language plpgsql security invoker set search_path='' as $$
declare row_data jsonb:=to_jsonb(new); parent_org uuid; parent_campaign uuid; parent_id uuid; field_name text; parent_table text;
begin
  if tg_op='UPDATE' and new.organisation_id is distinct from old.organisation_id then
    raise exception 'Email records cannot move between organisations.' using errcode='23514';
  end if;
  foreach field_name in array array['sender_identity_id','subscription_type_id','campaign_id','contact_id','marketing_contact_id','recipient_id','branch_id'] loop
    parent_id:=nullif(row_data->>field_name,'')::uuid;
    if parent_id is null then continue; end if;
    parent_table:=case field_name when 'sender_identity_id' then 'email_sender_identities'
      when 'subscription_type_id' then 'email_subscription_types' when 'campaign_id' then 'email_campaigns'
      when 'contact_id' then 'email_marketing_contacts' when 'marketing_contact_id' then 'email_marketing_contacts'
      when 'recipient_id' then 'email_campaign_recipients' when 'branch_id' then 'organisation_branches' end;
    execute format('select organisation_id from public.%I where id=$1',parent_table) into parent_org using parent_id;
    if parent_org is distinct from new.organisation_id then
      raise exception 'Email parent must belong to the same organisation.' using errcode='23514';
    end if;
    if field_name='recipient_id' and row_data->>'campaign_id' is not null then
      select campaign_id into parent_campaign from public.email_campaign_recipients where id=parent_id;
      if parent_campaign is distinct from (row_data->>'campaign_id')::uuid then raise exception 'Recipient must belong to this campaign.' using errcode='23514'; end if;
    end if;
  end loop;
  return new;
end $$;
-- Restrictive membership also applies to the older creator-based policies.
do $$ declare t text; begin
  foreach t in array array['email_sender_identities','email_sending_domains','email_marketing_contacts','email_marketing_contact_sources',
    'contact_marketing_preferences','email_suppressions','email_subscription_types','contact_email_subscriptions',
    'email_sending_policies','email_billing_profiles','email_saved_audiences','email_templates','email_campaigns',
    'email_campaign_recipients','email_campaign_dispatch_jobs','email_campaign_audit_events','email_events','email_campaign_links',
    'email_usage_records','email_send_reservations','email_campaign_assets','email_campaign_revisions'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('create trigger email_organisation_guard before insert or update on public.%I for each row execute function public.email_campaign_guard_organisation()',t);
    execute format('create policy email_active_membership on public.%I as restrictive for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id))',t);
  end loop;
end $$;

create function public.email_campaign_set_controls(p_organisation_id uuid,p_paused boolean,p_daily_limit integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.email_campaign_can_send(p_organisation_id) or not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  if p_daily_limit is null or p_daily_limit not between 1 and 500 or p_paused is null then raise exception 'Choose a daily limit between 1 and 500.' using errcode='22023'; end if;
  update public.email_sending_policies set organisation_daily_limit=p_daily_limit,
    manual_paused_at=case when p_paused then coalesce(manual_paused_at,now()) else null end where organisation_id=p_organisation_id;
  if not found then raise exception 'Save a sender before changing sending controls.' using errcode='22023'; end if;
end $$;

create or replace function public.email_reserve_send(p_organisation_id uuid,p_identity_id uuid,p_key text,p_actor_id uuid default null,p_test boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.email_sending_policies%rowtype; account public.email_campaign_account_limits%rowtype;
  existing public.email_send_reservations%rowtype; used bigint; legacy_used bigint;
  day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
  select * into account from public.email_campaign_account_limits where singleton for update;
  select * into policy from public.email_sending_policies where organisation_id=p_organisation_id for update;
  if not coalesce(account.enabled,false) or account.blocked_until>now() or policy.organisation_id is null or policy.approved_at is null
    or policy.paused_at is not null or policy.manual_paused_at is not null or policy.self_service_blocked then return false; end if;
  if not public.email_campaign_sender_ready(p_organisation_id,p_identity_id) or nullif(btrim(p_key),'') is null then return false; end if;
  select * into existing from public.email_send_reservations where organisation_id=p_organisation_id and reservation_key=p_key;
  if found then
    if existing.sender_identity_id is distinct from p_identity_id or existing.is_test is distinct from p_test or existing.actor_id is distinct from p_actor_id then return false; end if;
    if existing.budget_reserved_at>=day_start then return true; end if;
  end if;
  if p_test and (p_actor_id is null or (select count(*) from public.email_send_reservations where organisation_id=p_organisation_id and actor_id=p_actor_id and is_test and created_at>now()-interval '1 hour')>=5) then return false; end if;
  select count(*) into used from public.email_send_reservations where organisation_id=p_organisation_id and budget_reserved_at>=day_start;
  select count(*) into legacy_used from public.email_campaign_recipients r where r.organisation_id=p_organisation_id and r.sent_at>=day_start
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=r.organisation_id and s.reservation_key='recipient:'||r.id::text);
  if used+legacy_used>=least(policy.daily_recipient_limit,policy.organisation_daily_limit,500) then return false; end if;
  select count(*) into used from public.email_send_reservations where budget_reserved_at>=month_start;
  select count(*) into legacy_used from public.email_campaign_recipients r where r.sent_at>=month_start
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=r.organisation_id and s.reservation_key='recipient:'||r.id::text);
  if used+legacy_used>=account.monthly_limit and not coalesce(existing.budget_reserved_at>=month_start,false) then return false; end if;
  select count(*) into used from public.email_send_reservations where budget_reserved_at>=day_start;
  select count(*) into legacy_used from public.email_campaign_recipients r where r.sent_at>=day_start
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=r.organisation_id and s.reservation_key='recipient:'||r.id::text);
  if used+legacy_used>=account.daily_limit then return false; end if;
  if existing.reservation_key is not null then
    update public.email_send_reservations set budget_reserved_at=now() where organisation_id=p_organisation_id and reservation_key=p_key;
  else
    insert into public.email_send_reservations(organisation_id,reservation_key,sender_identity_id,actor_id,is_test) values(p_organisation_id,p_key,p_identity_id,p_actor_id,p_test);
  end if;
  return true;
end $$;

-- Reserving quota is not a provider attempt. Long pauses before the first HTTP
-- request must not create false uncertain-send reviews after 23 hours.
alter table public.email_campaign_send_attempts add column provider_attempted_at timestamptz;
update public.email_campaign_send_attempts set provider_attempted_at=first_attempt_at;
grant update(provider_attempted_at) on public.email_campaign_send_attempts to service_role;

create function public.email_campaign_acquire_send_slot(p_organisation_id uuid,p_identity_id uuid,p_key text,p_email text,
  p_actor_id uuid default null,p_recipient_id uuid default null,p_job_id uuid default null,p_lease_token uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account public.email_campaign_account_limits%rowtype; policy public.email_sending_policies%rowtype;
  r public.email_campaign_recipients%rowtype; j public.email_campaign_dispatch_jobs%rowtype; category_id uuid;
begin
  select * into account from public.email_campaign_account_limits where singleton for update;
  select * into policy from public.email_sending_policies where organisation_id=p_organisation_id for update;
  if not coalesce(account.enabled,false) or policy.approved_at is null or policy.paused_at is not null or policy.manual_paused_at is not null or policy.self_service_blocked
    or not public.email_campaign_sender_ready(p_organisation_id,p_identity_id) then return jsonb_build_object('action','paused'); end if;
  if not exists(select 1 from public.email_send_reservations s where s.organisation_id=p_organisation_id and s.reservation_key=p_key and s.sender_identity_id=p_identity_id
    and s.budget_reserved_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and s.is_test=(p_recipient_id is null) and s.actor_id is not distinct from p_actor_id) then raise exception 'No matching send reservation.' using errcode='42501'; end if;
  if p_recipient_id is not null then
    select * into j from public.email_campaign_dispatch_jobs where id=p_job_id for update;
    if j.organisation_id is distinct from p_organisation_id or j.status is distinct from 'running' or p_lease_token is null or j.lease_token is distinct from p_lease_token then return jsonb_build_object('action','lease_lost'); end if;
    select * into r from public.email_campaign_recipients where id=p_recipient_id for update;
    if r.organisation_id is distinct from p_organisation_id or r.campaign_id is distinct from j.campaign_id or r.email is distinct from p_email or p_key is distinct from 'recipient:'||r.id::text then raise exception 'Recipient does not belong to this dispatch.' using errcode='42501'; end if;
    if r.status not in ('queued','sending') then return jsonb_build_object('action','skip'); end if;
    select subscription_type_id into category_id from public.email_campaigns where id=r.campaign_id and sender_identity_id=p_identity_id and status in ('sending','scheduled');
    if category_id is null then return jsonb_build_object('action','paused'); end if;
    if exists(select 1 from public.email_suppressions where organisation_id=p_organisation_id and email=p_email)
      or not exists(select 1 from public.contact_marketing_preferences where organisation_id=p_organisation_id and email=p_email and marketing_consent_status='opted_in')
      or not exists(select 1 from public.contact_email_subscriptions where organisation_id=p_organisation_id and email=p_email and subscription_type_id=category_id and status='subscribed')
      or not exists(select 1 from public.email_marketing_contacts where organisation_id=p_organisation_id and email=p_email and is_valid_email) then
      update public.email_campaign_recipients set status='suppressed',error_reason='Recipient eligibility withdrawn before dispatch.' where id=r.id;
      return jsonb_build_object('action','skip');
    end if;
  end if;
  if exists(select 1 from public.email_campaign_provider_blocks where email=lower(btrim(p_email))) then
    if p_recipient_id is not null then update public.email_campaign_recipients set status='suppressed',error_reason='The email provider has blocked this destination.' where id=r.id; end if;
    return jsonb_build_object('action','blocked');
  end if;
  if greatest(account.next_request_at,account.blocked_until)>clock_timestamp() then
    return jsonb_build_object('action','wait','retry_after_ms',ceil(extract(epoch from (greatest(account.next_request_at,account.blocked_until)-clock_timestamp()))*1000));
  end if;
  if p_recipient_id is not null then
    if not exists(select 1 from public.email_campaign_send_attempts where recipient_id=r.id and (provider_attempted_at is null or provider_attempted_at>now()-interval '23 hours')) then return jsonb_build_object('action','review'); end if;
    update public.email_campaign_send_attempts set provider_attempted_at=coalesce(provider_attempted_at,clock_timestamp()) where recipient_id=r.id;
    update public.email_campaign_dispatch_jobs set locked_at=now() where id=j.id;
  end if;
  update public.email_campaign_account_limits set next_request_at=clock_timestamp()+make_interval(secs=>account.minimum_interval_ms/1000.0) where singleton;
  return jsonb_build_object('action','send');
end $$;
create function public.email_campaign_provider_backoff(p_seconds integer)
returns void language sql security invoker set search_path='' as $$
  update public.email_campaign_account_limits set blocked_until=greatest(blocked_until,clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_seconds,60),3600)))) where singleton
$$;

create or replace function public.email_campaign_claim_dispatch_jobs(p_limit integer default 1)
returns setof public.email_campaign_dispatch_jobs language plpgsql security invoker set search_path='' as $$
declare chosen public.email_campaign_dispatch_jobs%rowtype;
begin
  -- One organisation per invocation; the least recently served goes first.
  select j.* into chosen from public.email_campaign_dispatch_jobs j
    join public.email_campaigns c on c.id=j.campaign_id and c.organisation_id=j.organisation_id
    join public.email_sending_policies p on p.organisation_id=j.organisation_id
    where c.status in ('scheduled','sending') and j.run_at<=now() and p.manual_paused_at is null
      and (j.status='queued' or (j.status='running' and coalesce(j.locked_at,j.updated_at)<now()-interval '5 minutes'))
      and not exists(select 1 from public.email_campaign_dispatch_jobs running where running.organisation_id=j.organisation_id and running.id<>j.id and running.status='running' and running.locked_at>=now()-interval '5 minutes')
    order by p.last_dispatch_at nulls first,j.run_at,j.id limit 1 for update of p skip locked;
  if chosen.id is null then return; end if;
  -- Match the gate's policy-before-job lock order; never wait for a busy job.
  select * into chosen from public.email_campaign_dispatch_jobs where id=chosen.id
    and (status='queued' or (status='running' and coalesce(locked_at,updated_at)<now()-interval '5 minutes')) for update skip locked;
  if chosen.id is null then return; end if;
  update public.email_sending_policies set last_dispatch_at=clock_timestamp() where organisation_id=chosen.organisation_id;
  return query update public.email_campaign_dispatch_jobs set status='running',locked_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1,last_error=null,updated_at=now() where id=chosen.id returning *;
end $$;

-- Hosted links are bearer capabilities for exactly one organisation/address.
-- All category validation and preference writes commit together.
create function public.email_campaign_apply_preferences(p_token text,p_selected uuid[])
returns boolean language plpgsql security invoker set search_path='' as $$
declare pref public.contact_marketing_preferences%rowtype; subscribed boolean:=cardinality(p_selected)>0;
begin
  select * into pref from public.contact_marketing_preferences where unsubscribe_token=p_token for update;
  if not found then return false; end if;
  if p_selected is null or exists(select 1 from unnest(p_selected) chosen where chosen is null or not exists(select 1 from public.email_subscription_types t where t.id=chosen and t.organisation_id=pref.organisation_id and t.is_active)) then
    raise exception 'Choose categories from this organisation only.' using errcode='22023';
  end if;
  update public.contact_marketing_preferences set marketing_consent_status=case when subscribed then 'opted_in' else 'opted_out' end,
    consent_source='preference_centre',consent_captured_at=case when subscribed then now() else consent_captured_at end,
    unsubscribed_at=case when subscribed then null else now() end where id=pref.id;
  insert into public.contact_email_subscriptions(organisation_id,subscription_type_id,email,status,source,consent_captured_at,unsubscribed_at)
    select pref.organisation_id,t.id,pref.email,case when t.id=any(p_selected) then 'subscribed' else 'unsubscribed' end,'preference_centre',
      case when t.id=any(p_selected) then now() end,case when not t.id=any(p_selected) then now() end
    from public.email_subscription_types t where t.organisation_id=pref.organisation_id and t.is_active
    on conflict(organisation_id,subscription_type_id,email) do update set status=excluded.status,source=excluded.source,consent_captured_at=excluded.consent_captured_at,unsubscribed_at=excluded.unsubscribed_at;
  if subscribed then
    delete from public.email_suppressions where organisation_id=pref.organisation_id and email=pref.email and reason='unsubscribe';
  else
    update public.contact_email_subscriptions set status='unsubscribed',unsubscribed_at=now() where organisation_id=pref.organisation_id and email=pref.email;
    update public.email_campaign_recipients set status='unsubscribed' where organisation_id=pref.organisation_id and email=pref.email;
    insert into public.email_suppressions(organisation_id,email,reason,source) values(pref.organisation_id,pref.email,'unsubscribe','preference_centre') on conflict(organisation_id,email) do nothing;
  end if;
  return true;
end $$;

create or replace function public.email_campaign_prepare_send(p_job_id uuid,p_lease_token uuid,p_recipient_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.email_campaign_dispatch_jobs%rowtype; r public.email_campaign_recipients%rowtype;
  attempt public.email_campaign_send_attempts%rowtype; campaign_status text;
begin
  select * into j from public.email_campaign_dispatch_jobs where id=p_job_id for update;
  if j.status is distinct from 'running' or j.lease_token is distinct from p_lease_token
    or p_lease_token is null then return jsonb_build_object('action','lease_lost'); end if;
  select status into campaign_status from public.email_campaigns where id=j.campaign_id for update;
  if campaign_status not in ('sending','scheduled') then
    update public.email_campaign_dispatch_jobs set status='cancelled',locked_at=null,lease_token=null where id=j.id;
    return jsonb_build_object('action','lease_lost');
  end if;
  select * into r from public.email_campaign_recipients where id=p_recipient_id for update;
  if r.id is null or r.campaign_id<>j.campaign_id or r.organisation_id<>j.organisation_id then
    raise exception 'Recipient does not belong to this dispatch.' using errcode='42501';
  end if;
  if r.status not in ('queued','sending') then return jsonb_build_object('action','skip'); end if;
  select * into attempt from public.email_campaign_send_attempts where recipient_id=r.id;
  if (r.status='sending' and (attempt.recipient_id is null or attempt.provider_attempted_at<now()-interval '23 hours'))
    or (attempt.recipient_id is null and r.send_attempts>0) then
    update public.email_campaign_recipients set status='sending',error_reason='Provider outcome is uncertain; manual reconciliation is required before any resend.' where id=r.id;
    return jsonb_build_object('action','review');
  end if;
  if attempt.recipient_id is null then
    if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->'to' is distinct from jsonb_build_array(r.email) then
      raise exception 'Invalid dispatch payload.';
    end if;
    insert into public.email_campaign_send_attempts(recipient_id,payload) values(r.id,p_payload) returning * into attempt;
  end if;
  update public.email_campaign_recipients set status='sending',send_attempts=send_attempts+1,updated_at=now() where id=r.id;
  update public.email_campaign_dispatch_jobs set locked_at=now(),updated_at=now() where id=j.id;
  return jsonb_build_object('action','send','payload',attempt.payload,
    'idempotency_key','campaign:'||r.campaign_id::text||':recipient:'||r.id::text);
end $$;

create or replace function public.email_campaign_finish_dispatch(p_job_id uuid,p_lease_token uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare j public.email_campaign_dispatch_jobs%rowtype; pending integer; failures integer;
begin
  select * into j from public.email_campaign_dispatch_jobs where id=p_job_id for update;
  if j.status is distinct from 'running' or j.lease_token is distinct from p_lease_token or p_lease_token is null then return 'lease_lost'; end if;
  if exists(select 1 from public.email_campaign_recipients r left join public.email_campaign_send_attempts a on a.recipient_id=r.id
    where r.campaign_id=j.campaign_id and r.status='sending' and (a.recipient_id is null or a.provider_attempted_at<now()-interval '23 hours')) then
    update public.email_campaign_recipients set error_reason='Provider outcome is uncertain; manual reconciliation is required before any resend.'
      where campaign_id=j.campaign_id and status='sending';
    update public.email_campaigns set status='partially_failed' where id=j.campaign_id and status in ('sending','scheduled');
    update public.email_campaign_dispatch_jobs set status='failed',last_error='Uncertain provider outcome requires manual reconciliation.',locked_at=null,lease_token=null where id=j.id;
    return 'review';
  end if;
  select count(*) filter(where status in ('queued','sending')),count(*) filter(where status='failed')
    into pending,failures from public.email_campaign_recipients where campaign_id=j.campaign_id;
  if pending>0 then
    update public.email_campaign_dispatch_jobs set status='queued',locked_at=null,lease_token=null,run_at=now()+interval '1 minute' where id=j.id;
    return 'queued';
  end if;
  update public.email_campaigns set status=case when failures>0 then 'partially_failed' else 'sent' end,sent_at=now()
    where id=j.campaign_id and status in ('sending','scheduled');
  update public.email_campaign_dispatch_jobs set status='completed',completed_at=now(),locked_at=null,lease_token=null where id=j.id;
  return 'completed';
end $$;

create or replace function public.email_campaign_preflight(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_campaigns%rowtype; v_eligible integer := 0; v_checks jsonb := '[]'::jsonb; v_ready boolean;
begin
  select * into v_campaign from public.email_campaigns where id=p_campaign_id;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','sender','ok',public.email_campaign_sender_ready(v_campaign.organisation_id,v_campaign.sender_identity_id)));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','subscription','ok',exists(select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active)));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','policy','ok',exists(select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.approved_at is not null and sp.paused_at is null and sp.manual_paused_at is null and not sp.self_service_blocked)));
  if v_campaign.subscription_type_id is not null then v_eligible := public.email_campaign_preview_audience(v_campaign.organisation_id,v_campaign.subscription_type_id,v_campaign.audience_filter); end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','audience','ok',v_eligible > 0,'eligible_recipients',v_eligible));
  select bool_and((item->>'ok')::boolean) into v_ready from jsonb_array_elements(v_checks) item;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'preflighted',jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible));
  return jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible,'checks',v_checks);
end $$;

create or replace function public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.email_campaigns%rowtype; v_count integer; v_rules jsonb;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised to schedule this campaign.' using errcode = '42501'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'Only an unsent campaign can be scheduled.' using errcode = '22023'; end if;
  if v_campaign.subscription_type_id is null or not exists (select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active) then raise exception 'Choose an active email subscription type before scheduling.' using errcode = '22023'; end if;
  if exists (select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.paused_at is not null) then raise exception 'Sending is paused for this organisation.' using errcode = '22023'; end if;
  if not public.email_campaign_sender_ready(v_campaign.organisation_id,v_campaign.sender_identity_id) then raise exception 'Choose a ready sender before scheduling.' using errcode='22023'; end if;
  if not exists(select 1 from public.email_sending_policies p where p.organisation_id=v_campaign.organisation_id and p.approved_at is not null and p.paused_at is null and p.manual_paused_at is null and not p.self_service_blocked) then raise exception 'Organisation sending is not approved and active.' using errcode='42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(v_campaign.organisation_id, v_campaign.audience_filter);
  insert into public.email_campaign_recipients (organisation_id, campaign_id, contact_id, email, recipient_snapshot)
  select c.organisation_id, v_campaign.id, c.id, c.email, jsonb_build_object('first_name',c.first_name,'last_name',c.last_name,'full_name',c.full_name,'agent_name','', 'agency_name','', 'branch_name','')
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=v_campaign.subscription_type_id and cs.status='subscribed'
  where c.organisation_id=v_campaign.organisation_id and c.is_valid_email and s.id is null and coalesce(p.marketing_consent_status,'unknown') = 'opted_in'
    and (coalesce(jsonb_typeof(v_rules->'rules'), '') <> 'array' or public.email_audience_rule_matches(c, v_rules))
    and (v_rules->>'role_type' is null or c.role_type = v_rules->>'role_type')
    and (v_rules->>'branch_id' is null or c.branch_id::text = v_rules->>'branch_id')
    and (v_rules->>'assigned_user_id' is null or c.assigned_user_id::text = v_rules->>'assigned_user_id')
    and (v_rules->>'lead_stage' is null or c.lead_stage = v_rules->>'lead_stage')
    and (v_rules->>'area' is null or c.area = v_rules->>'area')
    and (v_rules->>'tag' is null or v_rules->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_rules->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_rules->'contact_ids')))
  on conflict (campaign_id,email) do nothing;
  get diagnostics v_count = row_count;
  update public.email_campaigns set status = case when p_send_at <= now() then 'sending' else 'scheduled' end, scheduled_for=p_send_at, audience_snapshot_at=coalesce(audience_snapshot_at,now()), updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'scheduled',jsonb_build_object('scheduled_for',p_send_at,'eligible_recipients',v_count));
  insert into public.email_campaign_dispatch_jobs (campaign_id, organisation_id, run_at) values (v_campaign.id, v_campaign.organisation_id, p_send_at) on conflict (campaign_id) do update set run_at=excluded.run_at, status='queued', last_error=null, locked_at=null;
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*) from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

create function public.email_campaign_controls_status(p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare used bigint;
begin
  if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  select count(*) into used from public.email_send_reservations where organisation_id=p_organisation_id
    and budget_reserved_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  return jsonb_build_object('reserved_today',used,'account_ready',exists(select 1 from public.email_campaign_account_limits where singleton and enabled and daily_limit>0 and monthly_limit>0 and (blocked_until is null or blocked_until<=now())));
end $$;
revoke all on function public.email_campaign_controls_status(uuid) from public,anon;
grant execute on function public.email_campaign_controls_status(uuid) to authenticated;

revoke all on function public.email_campaign_set_controls(uuid,boolean,integer) from public,anon;
grant execute on function public.email_campaign_set_controls(uuid,boolean,integer) to authenticated;
revoke all on function public.email_campaign_capture_provider_block() from public,anon,authenticated;
grant execute on function public.email_campaign_capture_provider_block() to service_role;
revoke all on function public.email_campaign_guard_organisation() from public,anon,authenticated;
grant execute on function public.email_campaign_guard_organisation() to service_role;
revoke all on function public.email_campaign_acquire_send_slot(uuid,uuid,text,text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_campaign_acquire_send_slot(uuid,uuid,text,text,uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.email_campaign_provider_backoff(integer) from public,anon,authenticated;
grant execute on function public.email_campaign_provider_backoff(integer) to service_role;
revoke all on function public.email_campaign_apply_preferences(text,uuid[]) from public,anon,authenticated;
grant execute on function public.email_campaign_apply_preferences(text,uuid[]) to service_role;

commit;
