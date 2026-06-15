-- Phase 1 offer workflow state model.
-- Expands canonical offers from a buyer-only link into a buyer -> agent -> seller
-- review lifecycle without adding UI behavior yet.

alter table if exists public.offers
  drop constraint if exists offers_status_check;
update public.offers
  set status = 'agent_review'
where lower(replace(trim(status), ' ', '_')) in ('under_review', 'review', 'agent_review');
update public.offers
  set status = 'sent_to_seller'
where lower(replace(trim(status), ' ', '_')) in ('seller_review', 'awaiting_seller_review');
update public.offers
  set status = 'submitted'
where lower(replace(trim(status), ' ', '_')) in ('pending', 'new');
update public.offers
  set status = lower(replace(trim(status), ' ', '_'));
update public.offers
  set status = 'draft'
where status not in (
  'draft',
  'sent_to_buyer',
  'buyer_viewed',
  'submitted',
  'agent_review',
  'changes_requested',
  'sent_to_seller',
  'seller_viewed',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
  'converted_to_transaction'
);
alter table if exists public.offers
  add column if not exists seller_contact_id uuid references public.contacts(contact_id) on delete set null,
  add column if not exists sent_to_buyer_at timestamptz,
  add column if not exists buyer_viewed_at timestamptz,
  add column if not exists buyer_submitted_at timestamptz,
  add column if not exists agent_reviewed_at timestamptz,
  add column if not exists changes_requested_at timestamptz,
  add column if not exists sent_to_seller_at timestamptz,
  add column if not exists seller_viewed_at timestamptz,
  add column if not exists countered_at timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists converted_to_transaction_at timestamptz,
  add column if not exists seller_review_session_id uuid,
  add column if not exists offer_version integer not null default 1,
  add column if not exists parent_offer_id uuid references public.offers(id) on delete set null,
  add column if not exists agent_review_notes text,
  add column if not exists seller_decision_notes text;
alter table if exists public.offers
  add constraint offers_status_check check (
    status in (
      'draft',
      'sent_to_buyer',
      'buyer_viewed',
      'submitted',
      'agent_review',
      'changes_requested',
      'sent_to_seller',
      'seller_viewed',
      'countered',
      'accepted',
      'rejected',
      'withdrawn',
      'expired',
      'converted_to_transaction'
    )
  );
create index if not exists offers_seller_contact_idx
  on public.offers (seller_contact_id, updated_at desc);
create index if not exists offers_seller_lead_status_idx
  on public.offers (seller_lead_id, status, updated_at desc);
create index if not exists offers_agent_status_idx
  on public.offers (agent_id, status, updated_at desc);
create index if not exists offers_parent_offer_idx
  on public.offers (parent_offer_id);
create or replace function public.bridge_set_offer_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'sent_to_buyer' then
    new.sent_to_buyer_at = coalesce(new.sent_to_buyer_at, now());
  elsif new.status = 'buyer_viewed' then
    new.buyer_viewed_at = coalesce(new.buyer_viewed_at, now());
  elsif new.status = 'submitted' then
    new.submitted_at = coalesce(new.submitted_at, now());
    new.buyer_submitted_at = coalesce(new.buyer_submitted_at, new.submitted_at, now());
  elsif new.status = 'agent_review' then
    new.agent_reviewed_at = coalesce(new.agent_reviewed_at, now());
  elsif new.status = 'changes_requested' then
    new.changes_requested_at = coalesce(new.changes_requested_at, now());
  elsif new.status = 'sent_to_seller' then
    new.sent_to_seller_at = coalesce(new.sent_to_seller_at, now());
  elsif new.status = 'seller_viewed' then
    new.seller_viewed_at = coalesce(new.seller_viewed_at, now());
  elsif new.status = 'countered' then
    new.countered_at = coalesce(new.countered_at, now());
  elsif new.status = 'accepted' then
    new.accepted_at = coalesce(new.accepted_at, now());
  elsif new.status = 'rejected' then
    new.rejected_at = coalesce(new.rejected_at, now());
  elsif new.status = 'withdrawn' then
    new.withdrawn_at = coalesce(new.withdrawn_at, now());
  elsif new.status = 'expired' then
    new.expired_at = coalesce(new.expired_at, now());
  elsif new.status = 'converted_to_transaction' then
    new.converted_to_transaction_at = coalesce(new.converted_to_transaction_at, now());
  end if;

  return new;
end;
$$;
drop trigger if exists offers_set_status_timestamps on public.offers;
create trigger offers_set_status_timestamps
before insert or update of status on public.offers
for each row
execute function public.bridge_set_offer_status_timestamps();
update public.offers
  set buyer_submitted_at = coalesce(buyer_submitted_at, submitted_at)
where status = 'submitted'
  and submitted_at is not null;
create table if not exists public.offer_seller_review_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  seller_lead_id uuid references public.leads(lead_id) on delete set null,
  seller_contact_id uuid references public.contacts(contact_id) on delete set null,
  listing_id uuid,
  agent_id uuid references public.profiles(id) on delete set null,
  token text not null unique,
  status text not null default 'sent',
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  countered_at timestamptz,
  expires_at timestamptz,
  decision_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_seller_review_sessions_status_check check (
    status in ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'countered', 'expired', 'revoked')
  )
);
create index if not exists offer_seller_review_sessions_offer_idx
  on public.offer_seller_review_sessions (offer_id, updated_at desc);
create index if not exists offer_seller_review_sessions_token_idx
  on public.offer_seller_review_sessions (token);
create index if not exists offer_seller_review_sessions_organisation_status_idx
  on public.offer_seller_review_sessions (organisation_id, status, updated_at desc);
drop trigger if exists offer_seller_review_sessions_set_updated_at on public.offer_seller_review_sessions;
create trigger offer_seller_review_sessions_set_updated_at
before update on public.offer_seller_review_sessions
for each row
execute function public.bridge_set_updated_at();
alter table if exists public.offers
  drop constraint if exists offers_seller_review_session_id_fkey;
alter table if exists public.offers
  add constraint offers_seller_review_session_id_fkey
  foreign key (seller_review_session_id)
  references public.offer_seller_review_sessions(id)
  on delete set null;
alter table if exists public.offer_seller_review_sessions enable row level security;
drop policy if exists offer_seller_review_sessions_org_members_select on public.offer_seller_review_sessions;
create policy offer_seller_review_sessions_org_members_select
  on public.offer_seller_review_sessions
  for select
  using (public.bridge_is_active_member(organisation_id));
drop policy if exists offer_seller_review_sessions_org_members_insert on public.offer_seller_review_sessions;
create policy offer_seller_review_sessions_org_members_insert
  on public.offer_seller_review_sessions
  for insert
  with check (public.bridge_is_active_member(organisation_id));
drop policy if exists offer_seller_review_sessions_org_members_update on public.offer_seller_review_sessions;
create policy offer_seller_review_sessions_org_members_update
  on public.offer_seller_review_sessions
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));
grant select, insert, update on public.offer_seller_review_sessions to authenticated;
drop policy if exists offers_public_token_select on public.offers;
create policy offers_public_token_select
  on public.offers
  for select
  using (
    offer_token is not null
    and status in ('draft', 'sent_to_buyer', 'buyer_viewed', 'submitted', 'agent_review', 'changes_requested', 'countered')
    and (expiry_date is null or expiry_date >= current_date)
  );
drop policy if exists offers_public_token_update on public.offers;
create policy offers_public_token_update
  on public.offers
  for update
  using (
    offer_token is not null
    and status in ('draft', 'sent_to_buyer', 'buyer_viewed', 'changes_requested', 'countered')
    and (expiry_date is null or expiry_date >= current_date)
  )
  with check (
    offer_token is not null
    and status in ('buyer_viewed', 'submitted', 'agent_review')
  );
notify pgrst, 'reload schema';
