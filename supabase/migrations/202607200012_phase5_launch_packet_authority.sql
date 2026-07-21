begin;

-- Phase 5 launch repair: keep legal packet writes scoped to the packet owner/admin,
-- while restoring the browser/runtime path needed to prepare mandate packets.
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

drop policy if exists document_packets_phase5_launch_select on public.document_packets;
drop policy if exists document_packets_phase5_launch_insert on public.document_packets;
drop policy if exists document_packets_phase5_launch_update on public.document_packets;
drop policy if exists document_packets_phase5_launch_delete on public.document_packets;

create policy document_packets_phase5_launch_select on public.document_packets
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

create policy document_packets_phase5_launch_insert on public.document_packets
for insert to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

create policy document_packets_phase5_launch_update on public.document_packets
for update to authenticated
using (public.bridge_can_access_legal_packet_h2(id))
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

create policy document_packets_phase5_launch_delete on public.document_packets
for delete to authenticated
using (public.bridge_can_access_legal_packet_h2(id));

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'document_packet_versions',
    'document_packet_events',
    'document_packet_signers',
    'document_signing_fields'
  ] loop
    execute format('drop policy if exists %I_phase5_launch_select on public.%I', v_table, v_table);
    execute format('drop policy if exists %I_phase5_launch_insert on public.%I', v_table, v_table);
    execute format('drop policy if exists %I_phase5_launch_update on public.%I', v_table, v_table);
    execute format('drop policy if exists %I_phase5_launch_delete on public.%I', v_table, v_table);
    execute format(
      'create policy %I_phase5_launch_select on public.%I for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id))',
      v_table, v_table
    );
    execute format(
      'create policy %I_phase5_launch_insert on public.%I for insert to authenticated with check (public.bridge_can_access_legal_packet_h2(packet_id))',
      v_table, v_table
    );
    execute format(
      'create policy %I_phase5_launch_update on public.%I for update to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id)) with check (public.bridge_can_access_legal_packet_h2(packet_id))',
      v_table, v_table
    );
    execute format(
      'create policy %I_phase5_launch_delete on public.%I for delete to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id))',
      v_table, v_table
    );
  end loop;
end $$;

commit;
