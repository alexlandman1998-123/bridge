alter table if exists public.communication_deliveries
  alter column lead_id drop not null;

alter table if exists public.communication_deliveries
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists offer_id uuid references public.offers(id) on delete set null,
  add column if not exists appointment_id uuid references public.appointments(appointment_id) on delete set null,
  add column if not exists portal_session_id uuid references public.offer_portal_sessions(id) on delete set null,
  add column if not exists seller_review_session_id uuid references public.offer_seller_review_sessions(id) on delete set null,
  add column if not exists retry_of_id uuid references public.communication_deliveries(id) on delete set null,
  add column if not exists recipient_role text,
  add column if not exists opened_at timestamptz,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

update public.communication_deliveries
   set metadata_json = '{}'::jsonb
 where metadata_json is null;

alter table if exists public.communication_deliveries
  drop constraint if exists communication_deliveries_channel_check;

alter table if exists public.communication_deliveries
  add constraint communication_deliveries_channel_check
    check (channel in ('email', 'whatsapp', 'sms'));

alter table if exists public.communication_deliveries
  drop constraint if exists communication_deliveries_provider_check;

alter table if exists public.communication_deliveries
  add constraint communication_deliveries_provider_check
    check (provider in ('sendgrid', 'mailgun', 'twilio', 'meta', 'internal', 'resend'));

create index if not exists communication_deliveries_transaction_idx
  on public.communication_deliveries (organisation_id, transaction_id, created_at desc);

create index if not exists communication_deliveries_offer_idx
  on public.communication_deliveries (organisation_id, offer_id, created_at desc);

create index if not exists communication_deliveries_appointment_idx
  on public.communication_deliveries (organisation_id, appointment_id, created_at desc);

create index if not exists communication_deliveries_portal_session_idx
  on public.communication_deliveries (organisation_id, portal_session_id, created_at desc);

create index if not exists communication_deliveries_seller_review_session_idx
  on public.communication_deliveries (organisation_id, seller_review_session_id, created_at desc);

create index if not exists communication_deliveries_retry_idx
  on public.communication_deliveries (organisation_id, retry_of_id, created_at desc);

create index if not exists communication_deliveries_opened_idx
  on public.communication_deliveries (organisation_id, opened_at desc);

create or replace function public.bridge_sync_offer_portal_delivery_opened_phase7()
returns trigger
language plpgsql
as $$
declare
  v_opened_at timestamptz := coalesce(new.viewed_at, new.submitted_at, now());
begin
  if new.id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.viewed_at is not null and old.viewed_at is not null and new.submitted_at is not distinct from old.submitted_at and new.status is not distinct from old.status then
    return new;
  end if;

  update public.communication_deliveries
     set status = case when status = 'failed' then status else 'delivered' end,
         delivered_at = coalesce(delivered_at, v_opened_at),
         opened_at = coalesce(opened_at, v_opened_at),
         metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
           jsonb_strip_nulls(jsonb_build_object(
             'offerPortalStatus', new.status,
             'offerPortalViewedAt', new.viewed_at,
             'offerPortalSubmittedAt', new.submitted_at
           ))
   where portal_session_id = new.id
     and communication_type in ('buyer_offer_link', 'offer_link', 'post_viewing_offer_link');

  return new;
end;
$$;

drop trigger if exists trg_offer_portal_delivery_opened_phase7 on public.offer_portal_sessions;
create trigger trg_offer_portal_delivery_opened_phase7
after update on public.offer_portal_sessions
for each row
when (new.viewed_at is distinct from old.viewed_at or new.submitted_at is distinct from old.submitted_at or new.status is distinct from old.status)
execute function public.bridge_sync_offer_portal_delivery_opened_phase7();

create or replace function public.bridge_sync_seller_review_delivery_opened_phase7()
returns trigger
language plpgsql
as $$
declare
  v_opened_at timestamptz := coalesce(new.viewed_at, new.accepted_at, new.rejected_at, new.countered_at, now());
begin
  if new.id is null then
    return new;
  end if;

  update public.communication_deliveries
     set status = case when status = 'failed' then status else 'delivered' end,
         delivered_at = coalesce(delivered_at, v_opened_at),
         opened_at = coalesce(opened_at, v_opened_at),
         metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
           jsonb_strip_nulls(jsonb_build_object(
             'sellerReviewStatus', new.status,
             'sellerReviewViewedAt', new.viewed_at,
             'sellerReviewAcceptedAt', new.accepted_at,
             'sellerReviewRejectedAt', new.rejected_at,
             'sellerReviewCounteredAt', new.countered_at
           ))
   where seller_review_session_id = new.id
     and communication_type in ('seller_offer_review', 'offer_seller_review');

  return new;
end;
$$;

drop trigger if exists trg_seller_review_delivery_opened_phase7 on public.offer_seller_review_sessions;
create trigger trg_seller_review_delivery_opened_phase7
after update on public.offer_seller_review_sessions
for each row
when (
  new.viewed_at is distinct from old.viewed_at or
  new.accepted_at is distinct from old.accepted_at or
  new.rejected_at is distinct from old.rejected_at or
  new.countered_at is distinct from old.countered_at or
  new.status is distinct from old.status
)
execute function public.bridge_sync_seller_review_delivery_opened_phase7();
