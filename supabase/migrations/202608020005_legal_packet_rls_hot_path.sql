begin;

-- The mandate quick-start flow fetches a known packet by id, then its versions
-- by packet_id. Keep the RLS checks on those hot paths index-backed and avoid
-- the document_packets policy calling a helper that re-selects document_packets.

create index if not exists organisation_users_active_member_lookup_idx
  on public.organisation_users (organisation_id, user_id, created_at)
  where lower(trim(coalesce(membership_status, status, ''))) = 'active';

create index if not exists document_packets_h2_access_lookup_idx
  on public.document_packets (id, organisation_id, assigned_agent_id, created_by);

create index if not exists document_packet_versions_packet_lookup_idx
  on public.document_packet_versions (packet_id, version_number desc, id);

create index if not exists document_packet_versions_signable_lookup_idx
  on public.document_packet_versions (packet_id, version_number desc, id)
  where render_status = 'generated'
    and rendered_document_id is not null
    and lower(coalesce(rendered_media_type, '')) = 'application/pdf'
    and coalesce(transaction_pdf_persisted, false);

create or replace function public.bridge_can_access_legal_packet_h2(p_packet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_packets packet
    where packet.id = p_packet_id
      and public.bridge_is_active_member(packet.organisation_id)
      and (
        public.bridge_is_org_admin(packet.organisation_id)
        or packet.assigned_agent_id = auth.uid()
        or packet.created_by = auth.uid()
      )
  );
$$;

revoke all on function public.bridge_can_access_legal_packet_h2(uuid) from public, anon;
grant execute on function public.bridge_can_access_legal_packet_h2(uuid) to authenticated, service_role;

drop policy if exists document_packets_h2_select on public.document_packets;
drop policy if exists document_packets_h2_update on public.document_packets;
drop policy if exists document_packets_h2_delete on public.document_packets;

create policy document_packets_h2_select on public.document_packets
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

create policy document_packets_h2_update on public.document_packets
for update to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
)
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

create policy document_packets_h2_delete on public.document_packets
for delete to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

commit;
