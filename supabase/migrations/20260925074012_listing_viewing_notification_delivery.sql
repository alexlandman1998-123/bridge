-- Durable email delivery for the three-party listing-viewing rounds.
-- No RSVP tokens are stored in this queue; the worker reads the current token
-- immediately before sending and skips stale rounds.
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.listing_viewing_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  round_number integer not null,
  participant_id uuid not null,
  event_kind text not null check (event_kind in ('request', 'changed_time', 'confirmed', 'declined', 'cancelled')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed', 'superseded')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, round_number, participant_id, event_kind),
  foreign key (appointment_id, round_number)
    references public.listing_viewing_rounds(appointment_id, round_number) on delete cascade
);

create index listing_viewing_notification_due_idx
  on public.listing_viewing_notification_jobs (next_attempt_at, created_at)
  where status in ('queued', 'failed');

alter table public.listing_viewing_notification_jobs enable row level security;
create policy listing_viewing_notification_member_select
  on public.listing_viewing_notification_jobs for select to authenticated
  using (public.bridge_is_active_member(organisation_id)
    and public.bridge_can_access_appointment(appointment_id));
revoke all on public.listing_viewing_notification_jobs from public, anon, authenticated;
grant select on public.listing_viewing_notification_jobs to authenticated;

create function private.guard_listing_viewing_distinct_recipients()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_distinct_emails integer;
begin
  select count(distinct lower(btrim(ap.email))) into v_distinct_emails
  from public.appointment_participants ap
  where ap.appointment_id = new.appointment_id
    and lower(ap.participant_role) in ('buyer', 'seller', 'agent')
    and ap.is_required and nullif(btrim(coalesce(ap.email, '')), '') is not null;
  if v_distinct_emails <> 3 then
    raise exception 'Buyer, seller and agent require three separate email addresses';
  end if;
  return new;
end;
$$;

create trigger guard_listing_viewing_distinct_recipients
  before insert on public.listing_viewing_rounds
  for each row execute function private.guard_listing_viewing_distinct_recipients();

create function private.queue_listing_viewing_notification_jobs()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_kind text;
begin
  if tg_op = 'INSERT' then
    v_kind := case when new.round_number = 1 then 'request' else 'changed_time' end;
  elsif old.status = 'requested' and new.status <> 'requested' then
    update public.listing_viewing_notification_jobs
    set status = 'superseded', updated_at = now()
    where appointment_id = new.appointment_id and round_number = new.round_number
      and event_kind in ('request', 'changed_time') and status in ('queued', 'failed');
    v_kind := case new.status
      when 'confirmed' then 'confirmed'
      when 'declined' then 'declined'
      when 'cancelled' then 'cancelled'
      when 'expired' then 'cancelled'
      else null end;
  else
    return new;
  end if;

  if v_kind is not null then
    insert into public.listing_viewing_notification_jobs
      (appointment_id, organisation_id, round_number, participant_id, event_kind)
    select new.appointment_id, new.organisation_id, new.round_number, ap.participant_id, v_kind
    from public.appointment_participants ap
    where ap.appointment_id = new.appointment_id
      and lower(ap.participant_role) in ('buyer', 'seller', 'agent')
      and ap.is_required and nullif(btrim(coalesce(ap.email, '')), '') is not null
    on conflict (appointment_id, round_number, participant_id, event_kind) do nothing;
  end if;
  return new;
end;
$$;

create trigger queue_listing_viewing_notification_jobs
  after insert or update of status on public.listing_viewing_rounds
  for each row execute function private.queue_listing_viewing_notification_jobs();

-- A previously confirmed viewing can still be cancelled by an agent. Its
-- round is already closed, so enqueue that cancellation from the appointment.
create function private.queue_confirmed_listing_viewing_cancellation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.listing_viewing_round_number is null or old.status <> 'confirmed'
    or new.status <> 'cancelled' then return new; end if;
  update public.listing_viewing_notification_jobs
  set status = 'superseded', updated_at = now()
  where appointment_id = new.appointment_id and round_number = new.listing_viewing_round_number
    and event_kind = 'confirmed' and status in ('queued', 'failed');
  insert into public.listing_viewing_notification_jobs
    (appointment_id, organisation_id, round_number, participant_id, event_kind)
  select new.appointment_id, new.organisation_id, new.listing_viewing_round_number,
    ap.participant_id, 'cancelled'
  from public.appointment_participants ap
  where ap.appointment_id = new.appointment_id
    and lower(ap.participant_role) in ('buyer', 'seller', 'agent')
    and ap.is_required and nullif(btrim(coalesce(ap.email, '')), '') is not null
  on conflict (appointment_id, round_number, participant_id, event_kind) do nothing;
  return new;
end;
$$;

create trigger queue_confirmed_listing_viewing_cancellation
  after update of status on public.appointments
  for each row execute function private.queue_confirmed_listing_viewing_cancellation();

create function private.guard_listing_viewing_time_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.listing_viewing_round_number is not null
    and new.listing_viewing_round_number = old.listing_viewing_round_number
    and (new.appointment_date is distinct from old.appointment_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.date_time is distinct from old.date_time) then
    raise exception 'Propose a new viewing round before changing its time';
  end if;
  return new;
end;
$$;

create trigger guard_listing_viewing_time_change
  before update of appointment_date, start_time, end_time, date_time on public.appointments
  for each row execute function private.guard_listing_viewing_time_change();

create function public.claim_listing_viewing_notification_jobs(p_limit integer default 25)
returns setof public.listing_viewing_notification_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  -- Reclaim interrupted workers; the attempt number protects late receipts.
  update public.listing_viewing_notification_jobs
  set status = 'failed', next_attempt_at = now(), claimed_at = null,
      last_error = case when attempt_count >= max_attempts
        then 'Notification worker interrupted; manual retry required.'
        else 'Notification worker interrupted; retrying.' end,
      updated_at = now()
  where status = 'processing' and claimed_at < now() - interval '5 minutes';

  return query
  with due as (
    select job.id from public.listing_viewing_notification_jobs job
    where job.status in ('queued', 'failed')
      and job.attempt_count < job.max_attempts
      and job.next_attempt_at <= now()
    order by job.next_attempt_at, job.created_at
    limit greatest(0, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.listing_viewing_notification_jobs job
  set status = 'processing', attempt_count = job.attempt_count + 1,
      claimed_at = now(), updated_at = now()
  from due where job.id = due.id returning job.*;
end;
$$;

create function public.complete_listing_viewing_notification_job(
  p_job_id uuid, p_attempt_count integer, p_status text,
  p_error text default null, p_provider_message_id text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if p_status not in ('sent', 'failed', 'superseded') then
    raise exception 'Invalid notification completion status';
  end if;
  update public.listing_viewing_notification_jobs job
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else job.sent_at end,
      last_error = case when p_status = 'failed' then left(coalesce(p_error, 'Delivery failed'), 500) else null end,
      provider_message_id = case when p_status = 'sent' then nullif(p_provider_message_id, '') else job.provider_message_id end,
      next_attempt_at = case when p_status = 'failed'
        then now() + make_interval(mins => least(60, (2 ^ greatest(job.attempt_count - 1, 0))::integer))
        else job.next_attempt_at end,
      claimed_at = null, updated_at = now()
  where job.id = p_job_id and job.status = 'processing'
    and job.attempt_count = p_attempt_count;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create function public.retry_listing_viewing_notification_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_job public.listing_viewing_notification_jobs%rowtype;
begin
  select * into v_job from public.listing_viewing_notification_jobs where id = p_job_id for update;
  if not found or auth.uid() is null
    or not public.bridge_is_active_member(v_job.organisation_id)
    or not public.bridge_can_access_appointment(v_job.appointment_id) then
    raise exception 'Notification job not found';
  end if;
  if v_job.status <> 'failed' then return false; end if;
  update public.listing_viewing_notification_jobs
  set status = 'queued', attempt_count = 0, next_attempt_at = now(),
      last_error = null, updated_at = now()
  where id = p_job_id;
  return true;
end;
$$;

create function public.run_listing_viewing_notification_dispatcher()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_project_url text;
  v_service_role_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url from vault.decrypted_secrets
  where name = 'arch9_project_url' limit 1;
  select decrypted_secret into v_service_role_key from vault.decrypted_secrets
  where name = 'arch9_service_role_key' limit 1;
  if nullif(btrim(v_project_url), '') is null or nullif(btrim(v_service_role_key), '') is null then
    raise warning 'Listing viewing email worker is missing Vault configuration.';
    return jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;
  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/listing-viewing-notification-worker',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key, 'apikey', v_service_role_key),
    body := jsonb_build_object('limit', 25), timeout_milliseconds := 15000
  ) into v_request_id;
  return jsonb_build_object('scheduled', true, 'requestId', v_request_id);
end;
$$;

revoke all on function private.queue_listing_viewing_notification_jobs() from public, anon, authenticated;
revoke all on function private.guard_listing_viewing_distinct_recipients() from public, anon, authenticated;
revoke all on function private.queue_confirmed_listing_viewing_cancellation() from public, anon, authenticated;
revoke all on function private.guard_listing_viewing_time_change() from public, anon, authenticated;
revoke all on function public.claim_listing_viewing_notification_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_listing_viewing_notification_job(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.retry_listing_viewing_notification_job(uuid) from public, anon, authenticated;
revoke all on function public.run_listing_viewing_notification_dispatcher() from public, anon, authenticated;
grant execute on function public.claim_listing_viewing_notification_jobs(integer) to service_role;
grant execute on function public.complete_listing_viewing_notification_job(uuid, integer, text, text, text) to service_role;
grant execute on function public.retry_listing_viewing_notification_job(uuid) to authenticated;
grant execute on function public.run_listing_viewing_notification_dispatcher() to service_role;

create function public.is_managed_listing_viewing_rsvp(p_token text)
returns boolean language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.appointment_participants ap
    join public.appointments a on a.appointment_id = ap.appointment_id
    where ap.rsvp_token = nullif(btrim(p_token), '')
      and a.listing_viewing_round_number is not null
  ) or exists (
    select 1 from public.listing_viewing_round_responses r
    where r.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function public.is_managed_listing_viewing_rsvp(text) from public, anon, authenticated;
grant execute on function public.is_managed_listing_viewing_rsvp(text) to anon, authenticated;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'arch9-listing-viewing-emails-1m' loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule('arch9-listing-viewing-emails-1m', '* * * * *',
  $schedule$select public.run_listing_viewing_notification_dispatcher();$schedule$);

notify pgrst, 'reload schema';
commit;
