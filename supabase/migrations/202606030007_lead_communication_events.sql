create table if not exists public.lead_communication_events (
  communication_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  agent_id uuid,
  communication_type text not null,
  direction text not null,
  subject text,
  message text,
  summary text,
  external_reference text,
  source text,
  duration_seconds integer,
  status text not null default 'logged',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint lead_communication_events_type_check
    check (communication_type in ('call', 'email', 'whatsapp', 'sms', 'meeting', 'note', 'system')),
  constraint lead_communication_events_direction_check
    check (direction in ('outbound', 'inbound', 'internal', 'system')),
  constraint lead_communication_events_duration_check
    check (duration_seconds is null or duration_seconds >= 0)
);

create index if not exists lead_communication_events_org_lead_idx
  on public.lead_communication_events (organisation_id, lead_id, occurred_at desc);

create index if not exists lead_communication_events_contact_idx
  on public.lead_communication_events (organisation_id, contact_id, occurred_at desc);

create index if not exists lead_communication_events_agent_idx
  on public.lead_communication_events (organisation_id, agent_id, occurred_at desc);

create index if not exists lead_communication_events_type_idx
  on public.lead_communication_events (organisation_id, communication_type, occurred_at desc);

create index if not exists lead_communication_events_direction_idx
  on public.lead_communication_events (organisation_id, direction, occurred_at desc);

create index if not exists lead_communication_events_occurred_idx
  on public.lead_communication_events (organisation_id, occurred_at desc);

create index if not exists lead_communication_events_external_reference_idx
  on public.lead_communication_events (organisation_id, external_reference);

alter table public.lead_communication_events enable row level security;

drop policy if exists lead_communication_events_select_member on public.lead_communication_events;
create policy lead_communication_events_select_member
  on public.lead_communication_events
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_communication_events_insert_member on public.lead_communication_events;
create policy lead_communication_events_insert_member
  on public.lead_communication_events
  for insert
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_communication_events.lead_id
        and l.organisation_id = lead_communication_events.organisation_id
    )
    and (
      lead_communication_events.contact_id is null
      or exists (
        select 1
        from public.contacts c
        where c.contact_id = lead_communication_events.contact_id
          and c.organisation_id = lead_communication_events.organisation_id
      )
    )
  );

drop policy if exists lead_communication_events_update_member on public.lead_communication_events;
create policy lead_communication_events_update_member
  on public.lead_communication_events
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_communication_events.lead_id
        and l.organisation_id = lead_communication_events.organisation_id
    )
    and (
      lead_communication_events.contact_id is null
      or exists (
        select 1
        from public.contacts c
        where c.contact_id = lead_communication_events.contact_id
          and c.organisation_id = lead_communication_events.organisation_id
      )
    )
  );
