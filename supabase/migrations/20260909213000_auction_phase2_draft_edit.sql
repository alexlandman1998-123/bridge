-- Auction MVP, phase 2: the internal setup screen may edit draft and
-- registration-stage auctions through this constrained server-side path.

begin;

create or replace function public.auction_update_setup(
  p_auction_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_registration_closes_at timestamptz,
  p_opening_price numeric,
  p_bid_increment numeric,
  p_reserve_price numeric default null,
  p_guide_price numeric default null,
  p_venue text default null,
  p_auctioneer_user_id uuid default null,
  p_deposit_terms text default null,
  p_terms_document_url text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auction public.auctions%rowtype;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or not public.auction_can_manage(v_auction.organisation_id) then
    raise exception 'Auction manager authorization is required.' using errcode = '42501';
  end if;
  if v_auction.status not in ('draft', 'registration_open') then
    raise exception 'Only draft or registration-stage auctions can be edited.' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 or p_starts_at is null or p_registration_closes_at is null
    or p_registration_closes_at > p_starts_at or p_opening_price is null or p_opening_price <= 0
    or p_bid_increment is null or p_bid_increment <= 0 or (p_reserve_price is not null and p_reserve_price < 0) then
    raise exception 'Title, valid schedule, opening price and positive increment are required.' using errcode = '22023';
  end if;
  update public.auctions set
    title = btrim(p_title), starts_at = p_starts_at, registration_closes_at = p_registration_closes_at,
    opening_price = round(p_opening_price, 2), bid_increment = round(p_bid_increment, 2),
    reserve_price = case when p_reserve_price is null then null else round(p_reserve_price, 2) end,
    guide_price = case when p_guide_price is null then null else round(p_guide_price, 2) end,
    venue = nullif(btrim(coalesce(p_venue, '')), ''), auctioneer_user_id = p_auctioneer_user_id,
    deposit_terms = nullif(btrim(coalesce(p_deposit_terms, '')), ''),
    terms_document_url = nullif(btrim(coalesce(p_terms_document_url, '')), '')
  where id = v_auction.id;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'auction_setup_updated', jsonb_build_object('status', v_auction.status));
  return jsonb_build_object('auction_id', v_auction.id, 'status', v_auction.status);
end;
$$;

revoke all on function public.auction_update_setup(uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, text, uuid, text, text) from public, anon;
grant execute on function public.auction_update_setup(uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, text, uuid, text, text) to authenticated;

commit;
