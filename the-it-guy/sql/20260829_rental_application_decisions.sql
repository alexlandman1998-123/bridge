begin;

create table if not exists public.rental_application_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.rental_applications(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  decision text not null check (decision in ('approved', 'declined', 'withdrawn')),
  reason text not null check (length(btrim(reason)) > 0),
  evidence_json jsonb not null default '{}'::jsonb,
  target_version integer not null check (target_version > 0),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique(application_id, target_version)
);
create index if not exists rental_application_decisions_application_idx on public.rental_application_decisions(application_id, decided_at desc);

create table if not exists public.rental_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.rental_applications(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null check (event_type in ('rental_application_approved', 'rental_application_declined', 'rental_application_withdrawn')),
  aggregate_version integer not null check (aggregate_version > 0),
  payload_json jsonb not null default '{}'::jsonb,
  occurred_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  unique(application_id, aggregate_version, event_type)
);

create table if not exists public.rental_application_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  application_event_id uuid not null unique references public.rental_application_events(id) on delete cascade,
  application_id uuid not null references public.rental_applications(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  notification_type text not null check (notification_type in ('application_outcome')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rental_application_notification_outbox_dispatch_idx on public.rental_application_notification_outbox(delivery_status, next_attempt_at);

create or replace function public.rental_application_final_status_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('approved', 'declined', 'withdrawn') then
    if old.status in ('approved', 'declined', 'withdrawn') then raise exception 'A final rental application decision cannot be changed'; end if;
    if not exists (
      select 1 from public.rental_application_decisions decision
      where decision.application_id = new.id and decision.target_version = new.version
        and decision.decision = new.status and decision.decided_by = auth.uid()
    ) then raise exception 'Final rental application decisions require the decision command'; end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_rental_application_final_status_guard on public.rental_applications;
create trigger trg_rental_application_final_status_guard before update on public.rental_applications
  for each row execute function public.rental_application_final_status_guard();

alter table public.rental_application_decisions enable row level security;
alter table public.rental_application_events enable row level security;
alter table public.rental_application_notification_outbox enable row level security;
revoke all on public.rental_application_decisions, public.rental_application_events, public.rental_application_notification_outbox from anon, authenticated;
grant select on public.rental_application_decisions, public.rental_application_events, public.rental_application_notification_outbox to authenticated;

create policy rental_application_decisions_staff_read on public.rental_application_decisions for select to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_application_events_staff_read on public.rental_application_events for select to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_application_notification_outbox_staff_read on public.rental_application_notification_outbox for select to authenticated using (exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = application_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_decide_application(p_application_id uuid, p_expected_version integer, p_decision text, p_reason text, p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare application_row public.rental_applications%rowtype; decision_id uuid; event_id uuid; next_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_decision not in ('approved', 'declined', 'withdrawn') then raise exception 'Invalid rental application decision'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A decision reason is required'; end if;
  select application.* into application_row from public.rental_applications application where application.id = p_application_id for update;
  if not found then raise exception 'Rental application not found'; end if;
  if not exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = application_row.vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental application'; end if;
  if application_row.version <> p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode = '40001'; end if;
  if application_row.status in ('approved', 'declined', 'withdrawn') then raise exception 'This rental application already has a final decision'; end if;
  next_version := application_row.version + 1;
  insert into public.rental_application_decisions(application_id, organisation_id, decision, reason, evidence_json, target_version, decided_by)
  values (application_row.id, application_row.organisation_id, p_decision, btrim(p_reason), coalesce(p_evidence_json, '{}'::jsonb), next_version, auth.uid()) returning id into decision_id;
  update public.rental_applications set status = p_decision, version = next_version where id = application_row.id and version = application_row.version;
  insert into public.rental_application_events(application_id, organisation_id, event_type, aggregate_version, payload_json, occurred_by)
  values (application_row.id, application_row.organisation_id, 'rental_application_' || p_decision, next_version, jsonb_build_object('decision_id', decision_id, 'reason', btrim(p_reason)), auth.uid()) returning id into event_id;
  insert into public.rental_application_notification_outbox(application_event_id, application_id, organisation_id, notification_type)
  values (event_id, application_row.id, application_row.organisation_id, 'application_outcome');
  return jsonb_build_object('id', application_row.id, 'status', p_decision, 'version', next_version, 'decision_id', decision_id, 'event_id', event_id);
end; $$;

create or replace function public.rental_retry_application_notification(p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare outbox_row public.rental_application_notification_outbox%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select outbox.* into outbox_row from public.rental_application_notification_outbox outbox where outbox.id = p_outbox_id for update;
  if not found then raise exception 'Rental application notification not found'; end if;
  if not exists (select 1 from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join public.rental_properties property on property.id = vacancy.property_id where application.id = outbox_row.application_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental application'; end if;
  if outbox_row.delivery_status = 'sent' then raise exception 'A sent notification cannot be retried'; end if;
  update public.rental_application_notification_outbox set delivery_status = 'pending', retry_count = retry_count + 1, next_attempt_at = now(), last_error = null where id = outbox_row.id;
  return jsonb_build_object('id', outbox_row.id, 'delivery_status', 'pending', 'retry_count', outbox_row.retry_count + 1);
end; $$;

revoke execute on function public.rental_decide_application(uuid, integer, text, text, jsonb) from public, anon;
revoke execute on function public.rental_retry_application_notification(uuid) from public, anon;
grant execute on function public.rental_decide_application(uuid, integer, text, text, jsonb) to authenticated;
grant execute on function public.rental_retry_application_notification(uuid) to authenticated;

drop trigger if exists trg_rental_application_notification_outbox_updated_at on public.rental_application_notification_outbox;
create trigger trg_rental_application_notification_outbox_updated_at before update on public.rental_application_notification_outbox for each row execute function public.rental_set_updated_at();

commit;
