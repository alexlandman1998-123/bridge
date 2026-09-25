-- Preserve historical conversion gaps as reviewable migration dependencies.
-- This queue never creates or infers wet-ink evidence, and it never makes an
-- existing transaction eligible for a new conversion.
create table public.wet_ink_conversion_migration_dependencies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  dependency_key text not null unique,
  dependency_type text not null check (dependency_type in (
    'historical_transaction_without_wet_ink',
    'offer_transaction_link_mismatch',
    'accepted_offer_missing_conversion_facts'
  )),
  offer_id uuid references public.offers(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  listing_id uuid references public.private_listings(id) on delete set null,
  lead_id uuid references public.leads(lead_id) on delete set null,
  review_status text not null default 'pending' check (review_status in (
    'pending', 'reviewed_historical', 'requires_remediation', 'not_applicable'
  )),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot) = 'object'),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status = 'pending'
    or (review_note is not null and char_length(btrim(review_note)) >= 20 and reviewed_by is not null and reviewed_at is not null)
  )
);

create index wet_ink_conversion_migration_dependencies_queue_idx
  on public.wet_ink_conversion_migration_dependencies (organisation_id, review_status, last_detected_at desc);
create index wet_ink_conversion_migration_dependencies_listing_idx
  on public.wet_ink_conversion_migration_dependencies (listing_id, review_status, last_detected_at desc)
  where listing_id is not null;

alter table public.wet_ink_conversion_migration_dependencies enable row level security;
revoke all on table public.wet_ink_conversion_migration_dependencies from public, anon, authenticated;
grant all on table public.wet_ink_conversion_migration_dependencies to service_role;

create or replace function public.bridge_collect_wet_ink_conversion_migration_dependencies(p_organisation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.wet_ink_conversion_migration_dependencies (
    organisation_id, dependency_key, dependency_type, offer_id, transaction_id,
    listing_id, lead_id, source_snapshot, last_detected_at, updated_at
  )
  select
    candidate.organisation_id,
    candidate.dependency_key,
    candidate.dependency_type,
    candidate.offer_id,
    candidate.transaction_id,
    candidate.listing_id,
    candidate.lead_id,
    candidate.source_snapshot,
    now(),
    now()
  from (
    select
      transaction_row.organisation_id,
      concat('transaction:', transaction_row.id::text) as dependency_key,
      'historical_transaction_without_wet_ink'::text as dependency_type,
      offer.id as offer_id,
      transaction_row.id as transaction_id,
      transaction_row.listing_id,
      transaction_row.originating_buyer_lead_id as lead_id,
      jsonb_build_object(
        'transactionReference', transaction_row.transaction_reference,
        'transactionCreatedAt', transaction_row.created_at,
        'offerStatus', offer.status,
        'offerTransactionId', offer.transaction_id,
        'reason', 'Existing transaction has an accepted offer but no reviewed fully executed wet-ink record.'
      ) as source_snapshot
    from public.transactions transaction_row
    join public.offers offer on offer.id = transaction_row.accepted_offer_id
    where transaction_row.organisation_id = p_organisation_id
      and transaction_row.accepted_offer_id is not null
      and not public.bridge_offer_wet_ink_execution_ready(offer.id, offer.organisation_id, transaction_row.listing_id)

    union all

    select
      offer.organisation_id,
      concat('offer-link:', offer.id::text) as dependency_key,
      'offer_transaction_link_mismatch'::text as dependency_type,
      offer.id as offer_id,
      offer.transaction_id,
      offer.listing_id,
      offer.buyer_lead_id,
      jsonb_build_object(
        'offerStatus', offer.status,
        'offerTransactionId', offer.transaction_id,
        'reason', 'Offer reports conversion but does not link to a matching transaction created from that offer.'
      ) as source_snapshot
    from public.offers offer
    where offer.organisation_id = p_organisation_id
      and (offer.status = 'converted_to_transaction' or offer.transaction_id is not null)
      and not exists (
        select 1
        from public.transactions transaction_row
        where transaction_row.id = offer.transaction_id
          and transaction_row.organisation_id = offer.organisation_id
          and transaction_row.accepted_offer_id = offer.id
      )

    union all

    select
      offer.organisation_id,
      concat('offer-facts:', offer.id::text) as dependency_key,
      'accepted_offer_missing_conversion_facts'::text as dependency_type,
      offer.id as offer_id,
      null::uuid as transaction_id,
      offer.listing_id,
      offer.buyer_lead_id,
      jsonb_build_object(
        'offerStatus', offer.status,
        'offerAmount', offer.offer_amount,
        'listingId', offer.listing_id,
        'buyerLeadId', offer.buyer_lead_id,
        'buyerContactId', offer.buyer_contact_id,
        'reason', 'Accepted offer is missing facts required for controlled transaction conversion.'
      ) as source_snapshot
    from public.offers offer
    where offer.organisation_id = p_organisation_id
      and offer.status = 'accepted'
      and offer.transaction_id is null
      and (
        offer.listing_id is null
        or (offer.buyer_lead_id is null and offer.buyer_contact_id is null)
        or coalesce(offer.offer_amount, 0) <= 0
      )
  ) candidate
  on conflict (dependency_key) do update
  set source_snapshot = excluded.source_snapshot,
      last_detected_at = excluded.last_detected_at,
      updated_at = excluded.updated_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.bridge_refresh_wet_ink_conversion_migration_dependencies(p_organisation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.bridge_offer_wet_ink_reviewer_authorized(p_organisation_id) then
    raise exception 'An authorised organisation reviewer is required to refresh conversion migration dependencies.' using errcode = '42501';
  end if;

  v_count := public.bridge_collect_wet_ink_conversion_migration_dependencies(p_organisation_id);
  return jsonb_build_object('dependenciesDetected', v_count);
end;
$$;

create or replace function public.bridge_list_wet_ink_conversion_migration_dependencies(
  p_organisation_id uuid,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.bridge_offer_wet_ink_reviewer_authorized(p_organisation_id) then
    raise exception 'An authorised organisation reviewer is required to view conversion migration dependencies.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'dependencies',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dependency.id,
        'organisationId', dependency.organisation_id,
        'dependencyType', dependency.dependency_type,
        'offerId', dependency.offer_id,
        'transactionId', dependency.transaction_id,
        'listingId', dependency.listing_id,
        'leadId', dependency.lead_id,
        'reviewStatus', dependency.review_status,
        'reviewNote', dependency.review_note,
        'sourceSnapshot', dependency.source_snapshot,
        'reviewedAt', dependency.reviewed_at,
        'createdAt', dependency.created_at,
        'lastDetectedAt', dependency.last_detected_at
      ) order by (dependency.review_status = 'pending') desc, dependency.last_detected_at desc)
      from public.wet_ink_conversion_migration_dependencies dependency
      where dependency.organisation_id = p_organisation_id
        and (p_listing_id is null or dependency.listing_id = p_listing_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.bridge_resolve_wet_ink_conversion_migration_dependency(
  p_dependency_id uuid,
  p_review_status text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dependency public.wet_ink_conversion_migration_dependencies%rowtype;
  v_status text := lower(trim(coalesce(p_review_status, '')));
  v_note text := nullif(btrim(coalesce(p_review_note, '')), '');
begin
  select * into v_dependency
  from public.wet_ink_conversion_migration_dependencies
  where id = p_dependency_id
  for update;

  if v_dependency.id is null or auth.uid() is null or not public.bridge_offer_wet_ink_reviewer_authorized(v_dependency.organisation_id) then
    raise exception 'An authorised organisation reviewer is required to resolve this conversion migration dependency.' using errcode = '42501';
  end if;
  if v_status not in ('reviewed_historical', 'requires_remediation', 'not_applicable') or v_note is null or char_length(v_note) < 20 then
    raise exception 'Choose a review outcome and record a note of at least 20 characters.' using errcode = '22023';
  end if;

  update public.wet_ink_conversion_migration_dependencies
  set review_status = v_status,
      review_note = v_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = v_dependency.id
  returning * into v_dependency;

  return jsonb_build_object('dependency', jsonb_build_object(
    'id', v_dependency.id,
    'reviewStatus', v_dependency.review_status,
    'reviewNote', v_dependency.review_note,
    'reviewedAt', v_dependency.reviewed_at
  ));
end;
$$;

do $$
declare
  v_organisation_id uuid;
begin
  for v_organisation_id in select id from public.organisations loop
    perform public.bridge_collect_wet_ink_conversion_migration_dependencies(v_organisation_id);
  end loop;
end;
$$;

revoke all on function public.bridge_collect_wet_ink_conversion_migration_dependencies(uuid) from public, anon, authenticated;
revoke all on function public.bridge_refresh_wet_ink_conversion_migration_dependencies(uuid) from public, anon;
revoke all on function public.bridge_list_wet_ink_conversion_migration_dependencies(uuid, uuid) from public, anon;
revoke all on function public.bridge_resolve_wet_ink_conversion_migration_dependency(uuid, text, text) from public, anon;
grant execute on function public.bridge_refresh_wet_ink_conversion_migration_dependencies(uuid) to authenticated;
grant execute on function public.bridge_list_wet_ink_conversion_migration_dependencies(uuid, uuid) to authenticated;
grant execute on function public.bridge_resolve_wet_ink_conversion_migration_dependency(uuid, text, text) to authenticated;
