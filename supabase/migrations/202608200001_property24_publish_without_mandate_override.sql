begin;

alter table public.private_listings
  add column if not exists property24_publish_without_mandate boolean not null default false,
  add column if not exists property24_publish_without_mandate_reason text,
  add column if not exists property24_publish_without_mandate_at timestamptz;

comment on column public.private_listings.property24_publish_without_mandate is
  'Allows Property24 syndication status to mirror the external portal before mandate evidence is uploaded. Does not activate the Arch9 listing workflow.';

comment on column public.private_listings.property24_publish_without_mandate_reason is
  'Required audit reason when Property24 syndication is allowed before mandate evidence is uploaded.';

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
  v_property24_published_requested boolean := false;
  v_property24_override_allowed boolean := false;
begin
  v_property24_published_requested := lower(coalesce(new.property24_status, '')) = 'published';
  v_property24_override_allowed :=
    v_property24_published_requested
    and coalesce(new.property24_publish_without_mandate, false)
    and nullif(trim(coalesce(new.property24_publish_without_mandate_reason, '')), '') is not null;

  if tg_op = 'UPDATE' then
    v_property24_override_allowed :=
      v_property24_override_allowed
      and lower(coalesce(new.property24_status, '')) is distinct from lower(coalesce(old.property24_status, ''));
  end if;

  if v_property24_override_allowed and new.property24_publish_without_mandate_at is null then
    new.property24_publish_without_mandate_at := now();
  end if;

  v_public_distribution_requested :=
    lower(coalesce(new.bridge_listing_status, '')) = 'published'
    or (v_property24_published_requested and not v_property24_override_allowed)
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
      or (v_property24_published_requested
        and lower(coalesce(new.property24_status, '')) is distinct from lower(coalesce(old.property24_status, ''))
        and not v_property24_override_allowed)
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

revoke all on function public.bridge_enforce_private_listing_mandate_completion_phase0() from public, anon, authenticated;

commit;
