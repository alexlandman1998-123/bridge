begin;

-- Server-only outbox. Persist the exact request before contacting Resend so
-- retrying an uncertain outcome uses the same key AND the same request body.
create table public.email_campaign_send_attempts (
  recipient_id uuid primary key references public.email_campaign_recipients(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  first_attempt_at timestamptz not null default now()
);
alter table public.email_campaign_send_attempts enable row level security;
revoke all on public.email_campaign_send_attempts from public, anon, authenticated;
grant select, insert on public.email_campaign_send_attempts to service_role;

-- Receipts can precede the HTTP send response. Retain them even when the
-- recipient's provider_message_id is not known yet; acceptance replays them.
create table public.email_campaign_provider_receipts (
  event_id text primary key,
  provider_message_id text not null,
  event_type text not null check (event_type in ('email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.suppressed')),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index email_campaign_pending_receipts on public.email_campaign_provider_receipts(provider_message_id) where processed_at is null;
alter table public.email_campaign_provider_receipts enable row level security;
revoke all on public.email_campaign_provider_receipts from public, anon, authenticated;
grant select, insert, update on public.email_campaign_provider_receipts to service_role;

alter table public.email_campaign_dispatch_jobs add column lease_token uuid;
alter table public.email_events drop constraint email_events_event_type_check;
alter table public.email_events add constraint email_events_event_type_check
  check (event_type in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed','suppressed'));

-- Enforce ordering under the recipient row lock, including a worker response
-- racing a callback. Unsubscribe and provider safety states never regress.
create function public.email_campaign_preserve_delivery_state()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare states text[] := array['queued','sending','failed','sent','delivered','opened','clicked','suppressed','bounced','complained','unsubscribed'];
begin
  if array_position(states, old.status) > array_position(states, new.status) then
    new.status := old.status;
  end if;
  return new;
end $$;
revoke all on function public.email_campaign_preserve_delivery_state() from public, anon, authenticated;
create trigger email_campaign_recipient_monotonic_state before update on public.email_campaign_recipients
  for each row execute function public.email_campaign_preserve_delivery_state();

create function public.email_campaign_claim_dispatch_jobs(p_limit integer default 1)
returns setof public.email_campaign_dispatch_jobs
language sql security invoker set search_path = '' as $$
  with candidates as (
    select j.id from public.email_campaign_dispatch_jobs j
    join public.email_campaigns c on c.id=j.campaign_id and c.organisation_id=j.organisation_id
    where c.status in ('scheduled','sending') and j.run_at<=now()
      and (j.status='queued' or (j.status='running' and coalesce(j.locked_at,j.updated_at)<now()-interval '5 minutes'))
    order by j.run_at,j.id limit greatest(1,least(coalesce(p_limit,1),10))
    for update of j skip locked
  )
  update public.email_campaign_dispatch_jobs j set status='running',locked_at=now(),
    lease_token=gen_random_uuid(),attempts=j.attempts+1,last_error=null,updated_at=now()
  from candidates c where j.id=c.id returning j.*
$$;

create function public.email_campaign_prepare_send(p_job_id uuid,p_lease_token uuid,p_recipient_id uuid,p_payload jsonb)
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
  if (r.status='sending' and (attempt.recipient_id is null or attempt.first_attempt_at<now()-interval '23 hours'))
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

create function public.email_campaign_record_provider_event(p_event_id text,p_provider_id text,p_event_type text,p_payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.email_campaign_recipients%rowtype; receipt public.email_campaign_provider_receipts%rowtype;
  mapped text; occurred timestamptz;
begin
  if coalesce(p_event_id,'')='' or coalesce(p_provider_id,'')='' then raise exception 'Provider event identity is required.'; end if;
  if p_event_type not in ('email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.suppressed') then return false; end if;
  insert into public.email_campaign_provider_receipts(event_id,provider_message_id,event_type,payload)
    values(p_event_id,p_provider_id,p_event_type,p_payload) on conflict(event_id) do nothing;
  -- Lock recipients before receipts, also used by the acceptance function.
  select * into r from public.email_campaign_recipients where provider_message_id=p_provider_id for update;
  if r.id is null then return false; end if;
  select * into strict receipt from public.email_campaign_provider_receipts where event_id=p_event_id for update;
  if receipt.provider_message_id<>p_provider_id or receipt.event_type<>p_event_type then raise exception 'Provider event identity conflict.'; end if;
  if receipt.processed_at is not null then return true; end if;
  mapped:=substring(receipt.event_type from 7);
  begin occurred:=(receipt.payload->>'created_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then occurred:=null; end;
  occurred:=coalesce(occurred,receipt.received_at);
  insert into public.email_events(organisation_id,campaign_id,recipient_id,provider,provider_event_id,event_type,url,payload,occurred_at)
    values(r.organisation_id,r.campaign_id,r.id,'resend',receipt.event_id,mapped,
      coalesce(receipt.payload#>>'{data,click,link}',receipt.payload#>>'{data,url}'),receipt.payload,occurred)
    on conflict(provider,provider_event_id) do nothing;
  update public.email_campaign_recipients set status=mapped,updated_at=now(),
    delivered_at=case when mapped='delivered' then coalesce(delivered_at,occurred) else delivered_at end,
    opened_at=case when mapped='opened' then coalesce(opened_at,occurred) else opened_at end,
    clicked_at=case when mapped='clicked' then coalesce(clicked_at,occurred) else clicked_at end,
    bounced_at=case when mapped='bounced' then coalesce(bounced_at,occurred) else bounced_at end,
    error_reason=case when mapped='suppressed' then 'Suppressed by the email provider.' else error_reason end
    where id=r.id;
  if mapped in ('bounced','complained','suppressed') then
    insert into public.email_suppressions(organisation_id,email,reason,source)
      values(r.organisation_id,r.email,case mapped when 'bounced' then 'hard_bounce' when 'complained' then 'complaint' else 'provider_suppression' end,'resend')
      on conflict(organisation_id,email) do update set
        reason=case when public.email_suppressions.reason in ('unsubscribe','complaint') then public.email_suppressions.reason else excluded.reason end;
  end if;
  update public.email_campaign_provider_receipts set processed_at=now() where event_id=receipt.event_id;
  return true;
end $$;

create function public.email_campaign_accept_send(p_recipient_id uuid,p_provider_id text,p_response jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare r public.email_campaign_recipients%rowtype; receipt public.email_campaign_provider_receipts%rowtype;
begin
  if coalesce(btrim(p_provider_id),'')='' then raise exception 'Provider message identity is required.'; end if;
  select * into strict r from public.email_campaign_recipients where id=p_recipient_id for update;
  if r.provider_message_id is not null and r.provider_message_id<>p_provider_id then raise exception 'Provider message identity conflict.'; end if;
  update public.email_campaign_recipients set provider_message_id=p_provider_id,status='sent',sent_at=coalesce(sent_at,now()),
    error_reason=case when status in ('queued','sending','sent') then null else error_reason end,updated_at=now() where id=r.id;
  insert into public.email_events(organisation_id,campaign_id,recipient_id,provider,provider_event_id,event_type,payload)
    values(r.organisation_id,r.campaign_id,r.id,'resend','send:'||p_provider_id,'sent',p_response)
    on conflict(provider,provider_event_id) do nothing;
  for receipt in select * from public.email_campaign_provider_receipts where provider_message_id=p_provider_id and processed_at is null order by received_at,event_id loop
    perform public.email_campaign_record_provider_event(receipt.event_id,receipt.provider_message_id,receipt.event_type,receipt.payload);
  end loop;
end $$;

-- Covers the race where an early callback and acceptance commit concurrently,
-- neither transaction observing the other's uncommitted row. The scheduled
-- worker drains these receipts even when no campaign jobs remain queued.
create function public.email_campaign_reconcile_provider_receipts(p_limit integer default 100)
returns integer language plpgsql security invoker set search_path = '' as $$
declare receipt public.email_campaign_provider_receipts%rowtype; applied integer:=0;
begin
  for receipt in select e.* from public.email_campaign_provider_receipts e
    join public.email_campaign_recipients r on r.provider_message_id=e.provider_message_id
    where e.processed_at is null order by e.received_at,e.event_id
    limit greatest(1,least(coalesce(p_limit,100),100)) loop
    if public.email_campaign_record_provider_event(receipt.event_id,receipt.provider_message_id,receipt.event_type,receipt.payload) then applied:=applied+1; end if;
  end loop;
  return applied;
end $$;

-- Counts and completion are one transaction: failed reads/writes cannot turn
-- an unprocessed campaign into a successful one or strand a finished job.
create function public.email_campaign_stop_dispatch(p_job_id uuid,p_lease_token uuid,p_reason text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.email_campaign_dispatch_jobs%rowtype; accepted boolean;
begin
  select * into j from public.email_campaign_dispatch_jobs where id=p_job_id for update;
  if j.status is distinct from 'running' or j.lease_token is distinct from p_lease_token or p_lease_token is null then return false; end if;
  update public.email_campaign_recipients set status='failed',error_reason=p_reason where campaign_id=j.campaign_id and status='queued';
  select exists(select 1 from public.email_campaign_recipients where campaign_id=j.campaign_id
    and status in ('sending','sent','delivered','opened','clicked','bounced','complained','unsubscribed')) into accepted;
  update public.email_campaign_recipients set error_reason=coalesce(error_reason,'Provider outcome is uncertain; reconcile before any resend.')
    where campaign_id=j.campaign_id and status='sending';
  update public.email_campaigns set status=case when accepted then 'partially_failed' else 'failed' end
    where id=j.campaign_id and status in ('sending','scheduled');
  update public.email_campaign_dispatch_jobs set status='failed',last_error=p_reason,locked_at=null,lease_token=null where id=j.id;
  return true;
end $$;

create function public.email_campaign_finish_dispatch(p_job_id uuid,p_lease_token uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare j public.email_campaign_dispatch_jobs%rowtype; pending integer; failures integer;
begin
  select * into j from public.email_campaign_dispatch_jobs where id=p_job_id for update;
  if j.status is distinct from 'running' or j.lease_token is distinct from p_lease_token or p_lease_token is null then return 'lease_lost'; end if;
  if exists(select 1 from public.email_campaign_recipients r left join public.email_campaign_send_attempts a on a.recipient_id=r.id
    where r.campaign_id=j.campaign_id and r.status='sending' and (a.recipient_id is null or a.first_attempt_at<now()-interval '23 hours')) then
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

revoke all on function public.email_campaign_stop_dispatch(uuid,uuid,text),public.email_campaign_reconcile_provider_receipts(integer),public.email_campaign_finish_dispatch(uuid,uuid),public.email_campaign_claim_dispatch_jobs(integer),public.email_campaign_prepare_send(uuid,uuid,uuid,jsonb),
  public.email_campaign_record_provider_event(text,text,text,jsonb),public.email_campaign_accept_send(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.email_campaign_stop_dispatch(uuid,uuid,text),public.email_campaign_reconcile_provider_receipts(integer),public.email_campaign_finish_dispatch(uuid,uuid),public.email_campaign_claim_dispatch_jobs(integer),public.email_campaign_prepare_send(uuid,uuid,uuid,jsonb),
  public.email_campaign_record_provider_event(text,text,text,jsonb),public.email_campaign_accept_send(uuid,text,jsonb) to service_role;

commit;
