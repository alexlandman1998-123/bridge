begin;

-- Some Kingstons current-listing imports reached production before quick-add
-- metadata was preserved on private_listings.internal_listing_notes. Treat an
-- already operational listing with an upload-later hard-copy mandate as the
-- same current/manual import shape, while draft captures still need completion
-- evidence before activation/publication.
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
  v_listing_status text := lower(trim(coalesce(p_listing.listing_status, '')));
  v_listing_visibility text := lower(trim(coalesce(p_listing.listing_visibility, '')));
  v_bridge_listing_status text := lower(trim(coalesce(p_listing.bridge_listing_status, '')));
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
    or v_notes like '%bulk current listing%'
    or v_listing_status in ('active', 'listing_active', 'live', 'published', 'under_offer', 'transaction_created', 'sold')
    or v_listing_visibility in ('active_market', 'public', 'published', 'live')
    or v_bridge_listing_status in ('published', 'live')
    or coalesce(p_listing.is_active, false);
end;
$$;

revoke all on function public.bridge_private_listing_is_current_import_activation_phase0(public.private_listings) from public, anon, authenticated;

commit;
