-- Phase 7: preserve the signing history while making changed commercial or
-- seller facts require a fresh packet. This function is service-role only.
create table if not exists public.private_listing_seller_signing_packet_events (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.private_listing_seller_signing_packets(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  event_type text not null check (event_type in ('issued', 'viewed', 'recipient_revoked', 'superseded', 'completed')),
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists private_listing_seller_signing_packet_events_packet_idx
  on public.private_listing_seller_signing_packet_events (packet_id, created_at desc);

alter table public.private_listing_seller_signing_packet_events enable row level security;
revoke all on table public.private_listing_seller_signing_packet_events from anon, authenticated;
grant all on table public.private_listing_seller_signing_packet_events to service_role;

create or replace function public.supersede_private_listing_seller_signing_packets(
  p_listing_id uuid,
  p_reason text,
  p_actor_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet record;
  v_count integer := 0;
begin
  for v_packet in
    select id from public.private_listing_seller_signing_packets
    where private_listing_id = p_listing_id and status in ('draft', 'active')
    for update
  loop
    update public.private_listing_seller_signing_packets
    set status = 'superseded', superseded_at = now(), updated_at = now()
    where id = v_packet.id;

    update public.private_listing_seller_signing_recipients
    set status = 'revoked', updated_at = now()
    where packet_id = v_packet.id and status in ('pending', 'viewed');

    insert into public.private_listing_seller_signing_packet_events (
      packet_id, private_listing_id, event_type, reason, actor_id, metadata
    ) values (
      v_packet.id, p_listing_id, 'superseded', nullif(trim(p_reason), ''), p_actor_id, coalesce(p_metadata, '{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.supersede_private_listing_seller_signing_packets(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.supersede_private_listing_seller_signing_packets(uuid, text, uuid, jsonb) to service_role;
