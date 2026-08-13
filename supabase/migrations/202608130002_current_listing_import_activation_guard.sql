begin;

-- Current-listing imports are already live or already under offer outside
-- Arch9. They can be activated/back-captured while the hard-copy mandate is
-- uploaded later, but ordinary draft listings must still satisfy the canonical
-- mandate/manual upload guard before activation or publication.
create or replace function public.bridge_private_listing_is_current_import_activation_phase0(
  p_listing public.private_listings
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mandate_status text := lower(trim(coalesce(p_listing.mandate_status, '')));
  v_notes text := lower(coalesce(p_listing.internal_listing_notes, '') || ' ' || coalesce(p_listing.description, ''));
  v_notes_compact text := regexp_replace(v_notes, '\s+', '', 'g');
begin
  if v_mandate_status <> 'signed_external_pending_upload' then
    return false;
  end if;

  return
    v_notes_compact like '%"quickaddintent":"active_listing"%'
    or v_notes_compact like '%"quickaddintent":"under_offer"%'
    or v_notes_compact like '%"quickaddintent":"current_listing"%'
    or v_notes_compact like '%"quickaddintent":"bulk_current_listing"%'
    or v_notes_compact like '%"quickaddintent":"imported_current_listing"%'
    or v_notes_compact like '%"quickaddintent":"imported_existing_listing"%'
    or v_notes like '%capture type:%active listing already live%'
    or v_notes like '%capture type:%under offer%'
    or v_notes like '%current listing import%'
    or v_notes like '%bulk current listing%';
end;
$$;

create or replace function public.bridge_enforce_private_listing_mandate_completion_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires_completion boolean := false;
  v_new_operationally_active boolean := false;
  v_public_distribution_requested boolean := false;
begin
  v_public_distribution_requested :=
    lower(coalesce(new.bridge_listing_status, '')) = 'published'
    or lower(coalesce(new.property24_status, '')) = 'published'
    or lower(coalesce(new.private_property_status, '')) = 'published'
    or exists (
      select 1
      from public.listing_publication_data publication
      where publication.listing_id = new.id
        and lower(trim(coalesce(publication.status, ''))) = 'published'
    )
    or exists (
      select 1
      from public.listing_external_links external_link
      where external_link.listing_id = new.id
        and lower(trim(coalesce(external_link.status, ''))) in ('live', 'published')
    );

  v_new_operationally_active :=
    lower(coalesce(new.listing_status, '')) in ('mandate_signed', 'active', 'listing_active', 'in_progress', 'live', 'published', 'finalised', 'finalized', 'fully_signed', 'signed', 'signed_uploaded', 'uploaded_signed', 'under_offer', 'transaction_created', 'sold')
    or coalesce(new.is_active, false)
    or lower(coalesce(new.listing_visibility, '')) in ('active_market', 'public', 'published', 'live')
    or lower(coalesce(new.mandate_status, '')) in ('signed', 'signed_uploaded', 'uploaded_signed', 'signed_external_pending_upload')
    or v_public_distribution_requested;

  if tg_op = 'INSERT' then
    v_requires_completion := v_new_operationally_active;
  else
    v_requires_completion :=
      (lower(coalesce(new.listing_status, '')) in ('mandate_signed', 'active', 'listing_active', 'in_progress', 'live', 'published', 'finalised', 'finalized', 'fully_signed', 'signed', 'signed_uploaded', 'uploaded_signed', 'under_offer', 'transaction_created', 'sold')
        and lower(coalesce(new.listing_status, '')) is distinct from lower(coalesce(old.listing_status, '')))
      or (coalesce(new.is_active, false) and not coalesce(old.is_active, false))
      or (lower(coalesce(new.listing_visibility, '')) in ('active_market', 'public', 'published', 'live')
        and lower(coalesce(new.listing_visibility, '')) is distinct from lower(coalesce(old.listing_visibility, '')))
      or (lower(coalesce(new.mandate_status, '')) in ('signed', 'signed_uploaded', 'uploaded_signed', 'signed_external_pending_upload')
        and lower(coalesce(new.mandate_status, '')) is distinct from lower(coalesce(old.mandate_status, '')))
      or (lower(coalesce(new.bridge_listing_status, '')) = 'published'
        and lower(coalesce(new.bridge_listing_status, '')) is distinct from lower(coalesce(old.bridge_listing_status, '')))
      or (lower(coalesce(new.property24_status, '')) = 'published'
        and lower(coalesce(new.property24_status, '')) is distinct from lower(coalesce(old.property24_status, '')))
      or (lower(coalesce(new.private_property_status, '')) = 'published'
        and lower(coalesce(new.private_property_status, '')) is distinct from lower(coalesce(old.private_property_status, '')))
      or (v_new_operationally_active and (
        new.mandate_packet_id is distinct from old.mandate_packet_id
        or new.organisation_id is distinct from old.organisation_id
      ));
  end if;

  if not v_requires_completion then
    return new;
  end if;

  if public.bridge_private_listing_is_current_import_activation_phase0(new) then
    return new;
  end if;

  perform public.bridge_require_completed_or_manual_mandate_phase0(
    new.organisation_id,
    new.mandate_packet_id,
    case when tg_op = 'INSERT' then null else new.id end,
    new.mandate_status,
    not v_public_distribution_requested
  );

  return new;
end;
$$;

create or replace function public.bridge_require_listing_canonical_mandate_phase0(
  p_listing_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.private_listings%rowtype;
begin
  select * into v_listing
  from public.private_listings
  where id = p_listing_id;

  if not found then
    raise exception 'The listing for this public distribution record was not found.'
      using errcode = 'P0001', detail = 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED';
  end if;

  if public.bridge_private_listing_is_current_import_activation_phase0(v_listing) then
    return;
  end if;

  perform public.bridge_require_completed_or_manual_mandate_phase0(
    v_listing.organisation_id,
    v_listing.mandate_packet_id,
    v_listing.id,
    v_listing.mandate_status,
    false
  );
end;
$$;

revoke all on function public.bridge_private_listing_is_current_import_activation_phase0(public.private_listings) from public, anon, authenticated;
revoke all on function public.bridge_enforce_private_listing_mandate_completion_phase0() from public, anon, authenticated;
revoke all on function public.bridge_require_listing_canonical_mandate_phase0(uuid) from public, anon, authenticated;

commit;
