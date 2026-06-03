begin;

create table if not exists public.lead_ingestion_logs (
  log_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source text not null,
  external_reference text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  lead_id uuid references public.leads(lead_id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  constraint lead_ingestion_logs_status_check check (
    status in ('new', 'assigned', 'processed', 'duplicate', 'failed')
  )
);

create index if not exists lead_ingestion_logs_org_idx
  on public.lead_ingestion_logs (organisation_id);
create index if not exists lead_ingestion_logs_source_idx
  on public.lead_ingestion_logs (source);
create index if not exists lead_ingestion_logs_external_reference_idx
  on public.lead_ingestion_logs (external_reference);
create index if not exists lead_ingestion_logs_status_idx
  on public.lead_ingestion_logs (status);
create index if not exists lead_ingestion_logs_lead_idx
  on public.lead_ingestion_logs (lead_id);
create index if not exists lead_ingestion_logs_contact_idx
  on public.lead_ingestion_logs (contact_id);
create index if not exists lead_ingestion_logs_created_idx
  on public.lead_ingestion_logs (created_at desc);

create unique index if not exists lead_ingestion_logs_source_external_reference_unique_idx
  on public.lead_ingestion_logs (organisation_id, lower(source), external_reference)
  where external_reference is not null and external_reference <> '';

alter table public.lead_ingestion_logs enable row level security;

drop policy if exists lead_ingestion_logs_select_member on public.lead_ingestion_logs;
create policy lead_ingestion_logs_select_member
on public.lead_ingestion_logs
for select
to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_ingestion_logs_insert_member on public.lead_ingestion_logs;
create policy lead_ingestion_logs_insert_member
on public.lead_ingestion_logs
for insert
to authenticated
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_ingestion_logs_update_member on public.lead_ingestion_logs;
create policy lead_ingestion_logs_update_member
on public.lead_ingestion_logs
for update
to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_ingestion_logs_delete_member on public.lead_ingestion_logs;
create policy lead_ingestion_logs_delete_member
on public.lead_ingestion_logs
for delete
to authenticated
using (public.bridge_is_active_member(organisation_id));

grant select, insert, update, delete on public.lead_ingestion_logs to authenticated;

commit;
