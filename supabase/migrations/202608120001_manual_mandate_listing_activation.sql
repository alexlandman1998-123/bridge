begin;

-- Manual or physical signed mandates are valid operational evidence once they
-- have been uploaded against the listing. A hard-copy mandate can also be
-- captured as pending upload so agents can create and work the listing before
-- the file reaches the system.
create or replace function public.bridge_listing_has_manual_mandate_evidence_phase0(
  p_listing_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.private_listing_documents document
    where document.private_listing_id = p_listing_id
      and lower(regexp_replace(coalesce(document.document_type, document.category, document.document_name, ''), '[^a-zA-Z0-9]+', '_', 'g'))
        in ('signed_mandate', 'mandate_signature', 'manual_mandate_evidence', 'seller_mandate')
      and lower(coalesce(document.status, '')) in ('uploaded', 'under_review', 'approved', 'completed', 'signed')
      and (
        nullif(trim(coalesce(document.storage_path, '')), '') is not null
        or nullif(trim(coalesce(document.file_url, '')), '') is not null
      )
  );
$$;

create or replace function public.bridge_require_completed_or_manual_mandate_phase0(
  p_organisation_id uuid,
  p_mandate_packet_id uuid,
  p_listing_id uuid default null,
  p_mandate_status text default null,
  p_allow_pending_manual boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.bridge_require_canonical_completed_mandate_phase0(
      p_organisation_id,
      p_mandate_packet_id
    );
    return;
  exception
    when others then
      -- Fall through to manual/physical evidence checks below. If those do not
      -- pass we raise the same public error contract used by the canonical guard.
      null;
  end;

  if p_listing_id is not null
     and public.bridge_listing_has_manual_mandate_evidence_phase0(p_listing_id) then
    return;
  end if;

  if p_allow_pending_manual
     and lower(coalesce(p_mandate_status, '')) in ('signed_external_pending_upload', 'signed_uploaded', 'uploaded_signed') then
    return;
  end if;

  raise exception 'A completed canonical mandate packet or manual signed mandate upload is required before activating this listing.'
    using errcode = 'P0001', detail = 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED';
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

  perform public.bridge_require_completed_or_manual_mandate_phase0(
    v_listing.organisation_id,
    v_listing.mandate_packet_id,
    v_listing.id,
    v_listing.mandate_status,
    false
  );
end;
$$;

revoke all on function public.bridge_listing_has_manual_mandate_evidence_phase0(uuid) from public, anon, authenticated;
revoke all on function public.bridge_require_completed_or_manual_mandate_phase0(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.bridge_enforce_private_listing_mandate_completion_phase0() from public, anon, authenticated;
revoke all on function public.bridge_require_listing_canonical_mandate_phase0(uuid) from public, anon, authenticated;

commit;
