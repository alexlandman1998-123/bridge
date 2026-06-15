begin;
-- Stabilization patch:
-- Keep packet flow demo-safe by letting any active organisation member
-- read/write packet + signing rows inside their organisation.

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.document_packets to authenticated;
grant select, insert, update, delete on table public.document_packet_versions to authenticated;
grant select, insert, update, delete on table public.document_packet_events to authenticated;
grant select, insert, update, delete on table public.document_packet_signers to authenticated;
grant select, insert, update, delete on table public.document_signing_fields to authenticated;
alter table if exists public.document_packets enable row level security;
alter table if exists public.document_packet_versions enable row level security;
alter table if exists public.document_packet_events enable row level security;
alter table if exists public.document_packet_signers enable row level security;
alter table if exists public.document_signing_fields enable row level security;
drop policy if exists document_packets_select on public.document_packets;
drop policy if exists document_packets_write on public.document_packets;
create policy document_packets_select on public.document_packets
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
create policy document_packets_write on public.document_packets
for all to authenticated
using (
  public.bridge_is_active_member(organisation_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
);
drop policy if exists document_packet_versions_select on public.document_packet_versions;
drop policy if exists document_packet_versions_write on public.document_packet_versions;
create policy document_packet_versions_select on public.document_packet_versions
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
create policy document_packet_versions_write on public.document_packet_versions
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists document_packet_events_select on public.document_packet_events;
drop policy if exists document_packet_events_write on public.document_packet_events;
create policy document_packet_events_select on public.document_packet_events
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
create policy document_packet_events_write on public.document_packet_events
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists document_packet_signers_select on public.document_packet_signers;
drop policy if exists document_packet_signers_write on public.document_packet_signers;
create policy document_packet_signers_select on public.document_packet_signers
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
create policy document_packet_signers_write on public.document_packet_signers
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists document_signing_fields_select on public.document_signing_fields;
drop policy if exists document_signing_fields_write on public.document_signing_fields;
create policy document_signing_fields_select on public.document_signing_fields
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
create policy document_signing_fields_write on public.document_signing_fields
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
commit;
