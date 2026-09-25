-- An authorised internal reviewer, rather than a browser-side table update,
-- resolves historical execution records. The decision history is append-only.
create table public.private_listing_mandate_execution_review_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  review_id uuid not null references public.private_listing_mandate_execution_reviews(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('resolved')),
  previous_state jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_state) = 'object'),
  resolved_state jsonb not null default '{}'::jsonb check (jsonb_typeof(resolved_state) = 'object'),
  recorded_at timestamptz not null default now()
);

create index private_listing_mandate_execution_review_events_review_idx
  on public.private_listing_mandate_execution_review_events (review_id, recorded_at desc);

alter table public.private_listing_mandate_execution_review_events enable row level security;
revoke all on table public.private_listing_mandate_execution_review_events from public, anon, authenticated;
grant all on table public.private_listing_mandate_execution_review_events to service_role;

create or replace function public.bridge_can_review_historical_mandate_execution(
  p_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.bridge_membership_role(p_organisation_id) in (
      'principal', 'director', 'partner', 'admin', 'super_admin',
      'manager', 'hq_manager', 'branch_manager'
    );
$$;

create or replace function public.bridge_list_historical_mandate_execution_reviews(
  p_organisation_id uuid,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviews jsonb;
begin
  if not public.bridge_can_review_historical_mandate_execution(p_organisation_id) then
    raise exception 'Historical mandate execution review requires an authorised organisation reviewer.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', review.id,
        'organisationId', review.organisation_id,
        'listingId', review.source_listing_id,
        'signingSessionId', review.source_signing_session_id,
        'classification', review.classification,
        'reviewStatus', review.review_status,
        'downstreamRelease', review.downstream_release,
        'reviewReason', review.review_reason,
        'sourceSnapshot', review.source_snapshot,
        'reviewedBy', review.reviewed_by,
        'reviewedAt', review.reviewed_at,
        'createdAt', review.created_at,
        'updatedAt', review.updated_at
      ) order by review.created_at asc
    ),
    '[]'::jsonb
  )
  into v_reviews
  from public.private_listing_mandate_execution_reviews review
  where review.organisation_id = p_organisation_id
    and (p_listing_id is null or review.source_listing_id = p_listing_id);

  return jsonb_build_object('reviews', v_reviews);
end;
$$;

create or replace function public.bridge_resolve_historical_mandate_execution_review(
  p_review_id uuid,
  p_classification text,
  p_review_reason text,
  p_downstream_release boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_classification text := lower(trim(coalesce(p_classification, '')));
  v_reason text := nullif(btrim(coalesce(p_review_reason, '')), '');
  v_review public.private_listing_mandate_execution_reviews%rowtype;
  v_previous_state jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select *
  into v_review
  from public.private_listing_mandate_execution_reviews
  where id = p_review_id
  for update;

  if v_review.id is null then
    raise exception 'Historical mandate execution review not found.' using errcode = 'P0002';
  end if;

  if not public.bridge_can_review_historical_mandate_execution(v_review.organisation_id) then
    raise exception 'Historical mandate execution review requires an authorised organisation reviewer.' using errcode = '42501';
  end if;

  if v_classification not in (
    'grandfathered_valid',
    'wet_ink_reexecution_required',
    'legal_review_required',
    'not_applicable'
  ) then
    raise exception 'A valid historical mandate execution classification is required.' using errcode = '22023';
  end if;

  if v_reason is null or char_length(v_reason) < 20 then
    raise exception 'Record a review reason of at least 20 characters.' using errcode = '22023';
  end if;

  if p_downstream_release and v_classification <> 'grandfathered_valid' then
    raise exception 'Only a grandfathered-valid record can be released for downstream use.' using errcode = '22023';
  end if;

  v_previous_state := jsonb_build_object(
    'classification', v_review.classification,
    'reviewStatus', v_review.review_status,
    'downstreamRelease', v_review.downstream_release,
    'reviewReason', v_review.review_reason,
    'reviewedBy', v_review.reviewed_by,
    'reviewedAt', v_review.reviewed_at
  );

  update public.private_listing_mandate_execution_reviews
  set classification = v_classification,
      review_status = 'resolved',
      downstream_release = coalesce(p_downstream_release, false),
      review_reason = v_reason,
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = v_review.id
  returning * into v_review;

  insert into public.private_listing_mandate_execution_review_events (
    organisation_id,
    review_id,
    actor_id,
    event_type,
    previous_state,
    resolved_state
  ) values (
    v_review.organisation_id,
    v_review.id,
    v_actor,
    'resolved',
    v_previous_state,
    jsonb_build_object(
      'classification', v_review.classification,
      'reviewStatus', v_review.review_status,
      'downstreamRelease', v_review.downstream_release,
      'reviewReason', v_review.review_reason,
      'reviewedBy', v_review.reviewed_by,
      'reviewedAt', v_review.reviewed_at
    )
  );

  return jsonb_build_object(
    'review', jsonb_build_object(
      'id', v_review.id,
      'classification', v_review.classification,
      'reviewStatus', v_review.review_status,
      'downstreamRelease', v_review.downstream_release,
      'reviewReason', v_review.review_reason,
      'reviewedBy', v_review.reviewed_by,
      'reviewedAt', v_review.reviewed_at,
      'updatedAt', v_review.updated_at
    )
  );
end;
$$;

revoke all on function public.bridge_can_review_historical_mandate_execution(uuid) from public, anon, authenticated;
revoke all on function public.bridge_list_historical_mandate_execution_reviews(uuid, uuid) from public, anon;
revoke all on function public.bridge_resolve_historical_mandate_execution_review(uuid, text, text, boolean) from public, anon;
grant execute on function public.bridge_list_historical_mandate_execution_reviews(uuid, uuid) to authenticated;
grant execute on function public.bridge_resolve_historical_mandate_execution_review(uuid, text, text, boolean) to authenticated;

comment on function public.bridge_resolve_historical_mandate_execution_review(uuid, text, text, boolean) is
  'Authorised internal resolution of a historical seller-mandate execution record. It records an append-only decision event and never invokes an attorney handoff.';
