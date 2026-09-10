-- Auction MVP, phase 1: organisation-scoped operational records and guarded
-- write paths for staff-recorded, live property auctions.

begin;

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 180),
  address_snapshot text,
  image_url text,
  starts_at timestamptz not null,
  registration_closes_at timestamptz not null,
  timezone text not null default 'Africa/Johannesburg',
  venue text,
  auctioneer_user_id uuid references auth.users(id) on delete set null,
  clerk_user_id uuid references auth.users(id) on delete set null,
  currency_code text not null default 'ZAR' check (currency_code = 'ZAR'),
  guide_price numeric(14,2) check (guide_price is null or guide_price >= 0),
  reserve_price numeric(14,2) check (reserve_price is null or reserve_price >= 0),
  opening_price numeric(14,2) not null check (opening_price > 0),
  bid_increment numeric(14,2) not null check (bid_increment > 0),
  deposit_terms text,
  terms_document_url text,
  status text not null default 'draft' check (status in ('draft', 'registration_open', 'bidding_open', 'paused', 'closed', 'sold', 'reserve_not_met', 'passed', 'withdrawn')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_closes_at <= starts_at)
);

create table public.auction_bidders (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bidder_number integer not null check (bidder_number > 0),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 180),
  email text,
  phone text,
  registration_evidence_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  status_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auction_id, bidder_number),
  check ((status = 'approved') = (approved_at is not null))
);

create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete restrict,
  bidder_id uuid not null references public.auction_bidders(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  source text not null default 'auctioneer_console' check (source = 'auctioneer_console'),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table public.auction_outcomes (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null unique references public.auctions(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  outcome text not null check (outcome in ('sold', 'reserve_not_met', 'passed')),
  winning_bidder_id uuid references public.auction_bidders(id) on delete restrict,
  final_price numeric(14,2) check (final_price is null or final_price > 0),
  reserve_met boolean not null default false,
  closeout_note text,
  transaction_id uuid,
  closed_by uuid not null references auth.users(id) on delete restrict,
  closed_at timestamptz not null default now(),
  check ((outcome = 'sold') = (winning_bidder_id is not null and final_price is not null))
);

create table public.auction_audit_events (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index auctions_organisation_status_starts_idx on public.auctions (organisation_id, status, starts_at desc);
create index auctions_listing_idx on public.auctions (listing_id);
create index auction_bidders_auction_status_idx on public.auction_bidders (auction_id, status, bidder_number);
create index auction_bids_auction_recorded_idx on public.auction_bids (auction_id, recorded_at desc, id desc);
create index auction_audit_events_auction_occurred_idx on public.auction_audit_events (auction_id, occurred_at desc, id desc);

create or replace function public.auction_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger auctions_set_updated_at before update on public.auctions
for each row execute function public.auction_set_updated_at();
create trigger auction_bidders_set_updated_at before update on public.auction_bidders
for each row execute function public.auction_set_updated_at();

create or replace function public.auction_reject_bid_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Auction bids are immutable; record a compensating audit event instead.' using errcode = '55000';
end;
$$;

create trigger auction_bids_immutable
before update or delete on public.auction_bids
for each row execute function public.auction_reject_bid_mutation();

create or replace function public.auction_can_manage(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.bridge_has_organisation_membership(p_organisation_id)
    and public.bridge_organisation_role_authority_level(public.bridge_membership_role(p_organisation_id)) >= 400
$$;

alter table public.auctions enable row level security;
alter table public.auction_bidders enable row level security;
alter table public.auction_bids enable row level security;
alter table public.auction_outcomes enable row level security;
alter table public.auction_audit_events enable row level security;

revoke all on public.auctions, public.auction_bidders, public.auction_bids, public.auction_outcomes, public.auction_audit_events from anon, authenticated;
grant select on public.auctions, public.auction_bidders, public.auction_bids, public.auction_outcomes, public.auction_audit_events to authenticated;

create policy auctions_read_managers on public.auctions for select to authenticated
using (public.auction_can_manage(organisation_id));
create policy auction_bidders_read_managers on public.auction_bidders for select to authenticated
using (public.auction_can_manage(organisation_id));
create policy auction_bids_read_managers on public.auction_bids for select to authenticated
using (public.auction_can_manage(organisation_id));
create policy auction_outcomes_read_managers on public.auction_outcomes for select to authenticated
using (public.auction_can_manage(organisation_id));
create policy auction_audit_events_read_managers on public.auction_audit_events for select to authenticated
using (public.auction_can_manage(organisation_id));

create or replace function public.auction_write_audit(
  p_auction_id uuid,
  p_organisation_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auction_audit_events (auction_id, organisation_id, event_type, actor_id, payload)
  values (p_auction_id, p_organisation_id, p_event_type, auth.uid(), coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.auction_create(
  p_organisation_id uuid,
  p_listing_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_registration_closes_at timestamptz,
  p_opening_price numeric,
  p_bid_increment numeric,
  p_reserve_price numeric default null,
  p_guide_price numeric default null,
  p_venue text default null,
  p_auctioneer_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_auction public.auctions%rowtype;
  v_listing_organisation_id uuid;
begin
  if auth.uid() is null or not public.auction_can_manage(p_organisation_id) then
    raise exception 'Auction manager authorization is required.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 or p_starts_at is null or p_registration_closes_at is null
    or p_registration_closes_at > p_starts_at or p_opening_price is null or p_opening_price <= 0
    or p_bid_increment is null or p_bid_increment <= 0 then
    raise exception 'Title, valid schedule, opening price and positive increment are required.' using errcode = '22023';
  end if;
  if p_reserve_price is not null and p_reserve_price < 0 then
    raise exception 'Reserve price cannot be negative.' using errcode = '22023';
  end if;
  select organisation_id into v_listing_organisation_id from public.private_listings where id = p_listing_id;
  if v_listing_organisation_id is distinct from p_organisation_id then
    raise exception 'The linked listing is not in this organisation.' using errcode = '42501';
  end if;
  insert into public.auctions (
    organisation_id, listing_id, title, starts_at, registration_closes_at, opening_price, bid_increment,
    reserve_price, guide_price, venue, auctioneer_user_id, created_by
  ) values (
    p_organisation_id, p_listing_id, btrim(p_title), p_starts_at, p_registration_closes_at, round(p_opening_price, 2), round(p_bid_increment, 2),
    case when p_reserve_price is null then null else round(p_reserve_price, 2) end,
    case when p_guide_price is null then null else round(p_guide_price, 2) end,
    nullif(btrim(coalesce(p_venue, '')), ''), p_auctioneer_user_id, auth.uid()
  ) returning * into v_auction;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'auction_created', jsonb_build_object('status', v_auction.status));
  return jsonb_build_object('auction_id', v_auction.id, 'status', v_auction.status);
end;
$$;

create or replace function public.auction_transition(p_auction_id uuid, p_next_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auction public.auctions%rowtype;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or not public.auction_can_manage(v_auction.organisation_id) then
    raise exception 'Auction manager authorization is required.' using errcode = '42501';
  end if;
  if (v_auction.status = 'draft' and p_next_status in ('registration_open', 'withdrawn'))
    or (v_auction.status = 'registration_open' and p_next_status in ('bidding_open', 'withdrawn'))
    or (v_auction.status = 'bidding_open' and p_next_status in ('paused', 'closed'))
    or (v_auction.status = 'paused' and p_next_status in ('bidding_open', 'closed', 'withdrawn')) then
    null;
  else
    raise exception 'Invalid auction lifecycle transition from % to %.', v_auction.status, p_next_status using errcode = '22023';
  end if;
  if p_next_status = 'bidding_open' and (v_auction.auctioneer_user_id is null or v_auction.opening_price <= 0 or v_auction.bid_increment <= 0) then
    raise exception 'An auctioneer, opening price and positive bid increment are required before opening bidding.' using errcode = '22023';
  end if;
  update public.auctions set status = p_next_status where id = v_auction.id;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'status_changed', jsonb_build_object('from', v_auction.status, 'to', p_next_status, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('auction_id', v_auction.id, 'status', p_next_status);
end;
$$;

create or replace function public.auction_register_bidder(
  p_auction_id uuid, p_legal_name text, p_email text default null, p_phone text default null,
  p_registration_evidence_url text default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auction public.auctions%rowtype; v_bidder public.auction_bidders%rowtype; v_bidder_number integer;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or not public.auction_can_manage(v_auction.organisation_id) then raise exception 'Auction manager authorization is required.' using errcode = '42501'; end if;
  if v_auction.status <> 'registration_open' or now() > v_auction.registration_closes_at then
    raise exception 'Bidder registration is closed.' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_legal_name, ''))) = 0 then raise exception 'Bidder legal name is required.' using errcode = '22023'; end if;
  select coalesce(max(bidder_number), 0) + 1 into v_bidder_number from public.auction_bidders where auction_id = v_auction.id;
  insert into public.auction_bidders (auction_id, organisation_id, bidder_number, legal_name, email, phone, registration_evidence_url, status_note, created_by)
  values (v_auction.id, v_auction.organisation_id, v_bidder_number, btrim(p_legal_name), nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_registration_evidence_url, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v_bidder;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'bidder_registered', jsonb_build_object('bidder_id', v_bidder.id, 'bidder_number', v_bidder.bidder_number));
  return jsonb_build_object('bidder_id', v_bidder.id, 'bidder_number', v_bidder.bidder_number, 'status', v_bidder.status);
end;
$$;

create or replace function public.auction_set_bidder_status(p_bidder_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bidder public.auction_bidders%rowtype;
begin
  select * into v_bidder from public.auction_bidders where id = p_bidder_id for update;
  if not found or not public.auction_can_manage(v_bidder.organisation_id) then raise exception 'Auction manager authorization is required.' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected', 'withdrawn') then raise exception 'Invalid bidder status.' using errcode = '22023'; end if;
  if v_bidder.status = 'withdrawn' then raise exception 'Withdrawn bidders cannot be changed.' using errcode = '55000'; end if;
  update public.auction_bidders set status = p_status, status_note = nullif(btrim(coalesce(p_note, '')), ''), approved_by = case when p_status = 'approved' then auth.uid() else null end, approved_at = case when p_status = 'approved' then now() else null end where id = v_bidder.id;
  perform public.auction_write_audit(v_bidder.auction_id, v_bidder.organisation_id, 'bidder_status_changed', jsonb_build_object('bidder_id', v_bidder.id, 'from', v_bidder.status, 'to', p_status));
  return jsonb_build_object('bidder_id', v_bidder.id, 'status', p_status);
end;
$$;

create or replace function public.auction_record_bid(p_auction_id uuid, p_bidder_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auction public.auctions%rowtype; v_bidder public.auction_bidders%rowtype; v_minimum numeric(14,2); v_bid public.auction_bids%rowtype;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or not public.auction_can_manage(v_auction.organisation_id) then raise exception 'Auction manager authorization is required.' using errcode = '42501'; end if;
  if v_auction.status <> 'bidding_open' then raise exception 'Bidding is not open.' using errcode = '55000'; end if;
  select * into v_bidder from public.auction_bidders where id = p_bidder_id and auction_id = v_auction.id for update;
  if not found or v_bidder.status <> 'approved' then raise exception 'An approved bidder is required.' using errcode = '22023'; end if;
  select coalesce(max(amount) + v_auction.bid_increment, v_auction.opening_price) into v_minimum from public.auction_bids where auction_id = v_auction.id;
  if p_amount is null or p_amount <> round(p_amount, 2) or p_amount < v_minimum then raise exception 'Bid must be at least %.', v_minimum using errcode = '22023'; end if;
  insert into public.auction_bids (auction_id, bidder_id, organisation_id, amount, recorded_by) values (v_auction.id, v_bidder.id, v_auction.organisation_id, p_amount, auth.uid()) returning * into v_bid;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'bid_recorded', jsonb_build_object('bid_id', v_bid.id, 'bidder_id', v_bidder.id, 'amount', v_bid.amount));
  return jsonb_build_object('bid_id', v_bid.id, 'amount', v_bid.amount, 'bidder_number', v_bidder.bidder_number);
end;
$$;

create or replace function public.auction_close(p_auction_id uuid, p_outcome text, p_winning_bidder_id uuid default null, p_final_price numeric default null, p_closeout_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auction public.auctions%rowtype; v_bidder public.auction_bidders%rowtype; v_high_bid numeric(14,2); v_high_bidder_id uuid; v_outcome public.auction_outcomes%rowtype;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or not public.auction_can_manage(v_auction.organisation_id) then raise exception 'Auction manager authorization is required.' using errcode = '42501'; end if;
  if v_auction.status <> 'closed' then raise exception 'Auction must be closed before recording an outcome.' using errcode = '55000'; end if;
  if p_outcome not in ('sold', 'reserve_not_met', 'passed') then raise exception 'Invalid auction outcome.' using errcode = '22023'; end if;
  select amount, bidder_id into v_high_bid, v_high_bidder_id from public.auction_bids where auction_id = v_auction.id order by amount desc, recorded_at desc, id desc limit 1;
  if p_outcome = 'sold' then
    select * into v_bidder from public.auction_bidders where id = p_winning_bidder_id and auction_id = v_auction.id for update;
    if not found or v_bidder.status <> 'approved' or v_high_bidder_id is null or p_winning_bidder_id <> v_high_bidder_id or p_final_price is null or p_final_price <> v_high_bid or (v_auction.reserve_price is not null and p_final_price < v_auction.reserve_price) then
      raise exception 'A winning approved bidder and the reserve-meeting high bid are required for a sale.' using errcode = '22023';
    end if;
  elsif p_winning_bidder_id is not null or p_final_price is not null then
    raise exception 'Only a sold outcome may include a winning bidder or final price.' using errcode = '22023';
  end if;
  insert into public.auction_outcomes (auction_id, organisation_id, outcome, winning_bidder_id, final_price, reserve_met, closeout_note, closed_by)
  values (v_auction.id, v_auction.organisation_id, p_outcome, p_winning_bidder_id, p_final_price, coalesce(v_high_bid >= v_auction.reserve_price, false), nullif(btrim(coalesce(p_closeout_note, '')), ''), auth.uid()) returning * into v_outcome;
  update public.auctions set status = p_outcome where id = v_auction.id;
  perform public.auction_write_audit(v_auction.id, v_auction.organisation_id, 'auction_outcome_recorded', jsonb_build_object('outcome_id', v_outcome.id, 'outcome', p_outcome, 'final_price', p_final_price));
  return jsonb_build_object('auction_id', v_auction.id, 'outcome_id', v_outcome.id, 'status', p_outcome);
end;
$$;

revoke all on function public.auction_write_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.auction_create(uuid, uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, text, uuid) from public, anon;
revoke all on function public.auction_transition(uuid, text, text) from public, anon;
revoke all on function public.auction_register_bidder(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.auction_set_bidder_status(uuid, text, text) from public, anon;
revoke all on function public.auction_record_bid(uuid, uuid, numeric) from public, anon;
revoke all on function public.auction_close(uuid, text, uuid, numeric, text) from public, anon;
grant execute on function public.auction_create(uuid, uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, text, uuid) to authenticated;
grant execute on function public.auction_transition(uuid, text, text) to authenticated;
grant execute on function public.auction_register_bidder(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.auction_set_bidder_status(uuid, text, text) to authenticated;
grant execute on function public.auction_record_bid(uuid, uuid, numeric) to authenticated;
grant execute on function public.auction_close(uuid, text, uuid, numeric, text) to authenticated;

commit;
