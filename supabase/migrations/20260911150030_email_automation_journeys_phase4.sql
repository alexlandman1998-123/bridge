begin;

-- A journey is intentionally separate from a campaign. Campaigns remain the
-- approved send artifact; journeys only decide when a contact should enter a
-- sequence and which approved campaign is the next action.
create table if not exists public.email_automation_journeys (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  trigger_key text not null check (trigger_key in ('manual', 'contact_created', 'listing_enquiry', 'tag_added', 'price_reduction')),
  entry_filter jsonb not null default '{}'::jsonb,
  reentry_policy text not null default 'once' check (reentry_policy in ('once', 'reenter')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_automation_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.email_automation_journeys(id) on delete cascade,
  position smallint not null check (position >= 1),
  step_type text not null check (step_type in ('delay', 'campaign')),
  delay_minutes integer check (delay_minutes >= 1 and delay_minutes <= 525600),
  campaign_id uuid references public.email_campaigns(id) on delete restrict,
  condition_filter jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (journey_id, position),
  check (
    (step_type = 'delay' and delay_minutes is not null and campaign_id is null)
    or (step_type = 'campaign' and campaign_id is not null and delay_minutes is null)
  )
);

-- Enrolments and their log are deliberately durable. The phase that activates
-- the worker can safely retry an action without treating an email send as a
-- transient browser-side operation.
create table if not exists public.email_automation_enrolments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  journey_id uuid not null references public.email_automation_journeys(id) on delete cascade,
  contact_id uuid not null references public.email_marketing_contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'waiting', 'processing', 'completed', 'exited', 'failed')),
  current_step smallint not null default 1 check (current_step >= 1),
  next_run_at timestamptz not null default now(),
  source_event jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_automation_run_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  enrolment_id uuid not null references public.email_automation_enrolments(id) on delete cascade,
  step_id uuid references public.email_automation_steps(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.email_automation_validate_step()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_journey_organisation_id uuid;
  v_campaign_organisation_id uuid;
begin
  select organisation_id into v_journey_organisation_id
  from public.email_automation_journeys
  where id = new.journey_id;
  if v_journey_organisation_id is null then
    raise exception 'Journey not found.' using errcode = '23503';
  end if;
  if new.step_type = 'campaign' then
    select organisation_id into v_campaign_organisation_id
    from public.email_campaigns
    where id = new.campaign_id;
    if v_campaign_organisation_id is distinct from v_journey_organisation_id then
      raise exception 'Campaign must belong to the same organisation as the journey.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists email_automation_validate_step_trigger on public.email_automation_steps;
create trigger email_automation_validate_step_trigger
before insert or update on public.email_automation_steps
for each row execute function public.email_automation_validate_step();

create index if not exists email_automation_journeys_org_status_idx
  on public.email_automation_journeys (organisation_id, status, updated_at desc);
create index if not exists email_automation_steps_journey_position_idx
  on public.email_automation_steps (journey_id, position);
create index if not exists email_automation_enrolments_due_idx
  on public.email_automation_enrolments (status, next_run_at)
  where status in ('queued', 'waiting');
create index if not exists email_automation_enrolments_contact_idx
  on public.email_automation_enrolments (organisation_id, journey_id, contact_id, created_at desc);
create index if not exists email_automation_run_log_enrolment_idx
  on public.email_automation_run_log (enrolment_id, created_at desc);

alter table public.email_automation_journeys enable row level security;
alter table public.email_automation_steps enable row level security;
alter table public.email_automation_enrolments enable row level security;
alter table public.email_automation_run_log enable row level security;

grant select, insert, update, delete on public.email_automation_journeys, public.email_automation_steps, public.email_automation_enrolments, public.email_automation_run_log to authenticated;

create policy email_automation_journeys_member on public.email_automation_journeys for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_automation_steps_member on public.email_automation_steps for all to authenticated
  using (exists (
    select 1 from public.email_automation_journeys j
    where j.id = journey_id and public.bridge_has_organisation_membership(j.organisation_id)
  ))
  with check (exists (
    select 1 from public.email_automation_journeys j
    where j.id = journey_id and public.bridge_has_organisation_membership(j.organisation_id)
  ));
create policy email_automation_enrolments_member on public.email_automation_enrolments for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_automation_run_log_member on public.email_automation_run_log for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));

commit;
