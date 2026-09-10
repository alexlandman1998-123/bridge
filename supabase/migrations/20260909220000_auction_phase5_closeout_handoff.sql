-- Auction MVP, phase 5: terminal outcome records are already written by
-- auction_close. This migration adds the idempotent handoff packet that the
-- existing transaction setup workflow consumes next.

begin;

create table public.auction_transaction_handoffs (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null unique references public.auctions(id) on delete restrict,
  outcome_id uuid not null unique references public.auction_outcomes(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete restrict,
  winning_bidder_id uuid not null references public.auction_bidders(id) on delete restrict,
  final_price numeric(14,2) not null check (final_price > 0),
  status text not null default 'ready' check (status in ('ready', 'claimed', 'completed', 'cancelled')),
  target_transaction_id uuid,
  prepared_by uuid not null references auth.users(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  note text
);

create index auction_transaction_handoffs_organisation_status_idx on public.auction_transaction_handoffs (organisation_id, status, prepared_at desc);

alter table public.auction_transaction_handoffs enable row level security;
revoke all on public.auction_transaction_handoffs from anon, authenticated;
grant select on public.auction_transaction_handoffs to authenticated;
create policy auction_transaction_handoffs_read_managers on public.auction_transaction_handoffs for select to authenticated using (public.auction_can_manage(organisation_id));

create or replace function public.auction_prepare_transaction_handoff(p_auction_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auction public.auctions%rowtype; v_outcome public.auction_outcomes%rowtype; v_handoff public.auction_transaction_handoffs%rowtype;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or not public.auction_can_manage(v_auction.organisation_id) then
    raise exception 'Auction manager authorization is required.' using errcode = '42501';
  end if;
  if v_auction.status <> 'sold' then
    raise exception 'Only a sold auction can be handed to transaction setup.' using errcode = '55000';
  end if;
  select * into v_outcome from public.auction_outcomes where auction_id = v_auction.id for update;
  if not found or v_outcome.outcome <> 'sold' or v_outcome.winning_bidder_id is null or v_outcome.final_price is null then
    raise exception 'A complete sold outcome is required before handoff.' using errcode = '22023';
  end if;
  insert into public.auction_transaction_handoffs (auction_id, outcome_id, organisation_id, listing_id, winning_bidder_id, final_price, prepared_by, note)
  values (v_auction.id, v_outcome.id, v_auction.organisation_id, v_auction.listing_id, v_outcome.winning_bidder_id, v_outcome.final_price, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (auction_id) do update set note = coalesce(excluded.note, public.auction_transaction_handoffs.note)
  returning * into v_handoff;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'transaction_handoff_prepared', jsonb_build_object('handoff_id', v_handoff.id, 'status', v_handoff.status));
  return jsonb_build_object('handoff_id', v_handoff.id, 'status', v_handoff.status, 'auction_id', v_auction.id);
end;
$$;

revoke all on function public.auction_prepare_transaction_handoff(uuid, text) from public, anon;
grant execute on function public.auction_prepare_transaction_handoff(uuid, text) to authenticated;

commit;
