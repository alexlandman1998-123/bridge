begin;

-- Stabilization patch:
-- Allow any active organisation member to create/update packet rows for their own organisation.
-- This prevents mandate generation dead-ends during onboarding/workflow demos.

drop policy if exists document_packets_write on public.document_packets;
create policy document_packets_write on public.document_packets
for all to authenticated
using (
  public.bridge_is_active_member(organisation_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
);

commit;
