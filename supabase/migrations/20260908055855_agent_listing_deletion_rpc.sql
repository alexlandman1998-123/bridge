begin;

-- A listing deletion touches many tables protected by independent RLS policies.
-- Keep the operation in the database so it either completes as one transaction or
-- leaves every relationship untouched.
alter table public.website_production_dark_launches
  alter column listing_id drop not null;

alter table public.website_production_dark_launches
  drop constraint if exists website_production_dark_launches_listing_id_fkey;

alter table public.website_production_dark_launches
  add constraint website_production_dark_launches_listing_id_fkey
  foreign key (listing_id)
  references public.private_listings(id)
  on delete set null;

create or replace function public.delete_private_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_listing public.private_listings%rowtype;
  v_launch record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to delete a listing.' using errcode = '42501';
  end if;

  select *
  into v_listing
  from public.private_listings
  where id = p_listing_id
  for update;

  if not found then
    return jsonb_build_object(
      'deleted', true,
      'mode', 'already_removed',
      'listing', jsonb_build_object('id', p_listing_id)
    );
  end if;

  if not public.bridge_is_active_member(v_listing.organisation_id)
     or (
       not public.bridge_is_org_admin(v_listing.organisation_id)
       and v_listing.assigned_agent_id is distinct from auth.uid()
       and v_listing.created_by is distinct from auth.uid()
     ) then
    raise exception 'You do not have permission to permanently delete this listing. Ask its assigned agent or an organisation administrator.'
      using errcode = '42501';
  end if;

  select id, status
  into v_launch
  from public.website_production_dark_launches
  where listing_id = p_listing_id
  for update;

  if found and v_launch.status is distinct from 'rolled_back' then
    return jsonb_build_object(
      'deleted', false,
      'code', 'website_launch_must_be_rolled_back',
      'message', 'This listing is used by a website launch. Roll back that launch before permanently deleting the listing.',
      'websiteLaunchId', v_launch.id,
      'websiteLaunchStatus', v_launch.status
    );
  end if;

  -- Preserve the audit record for a rolled-back launch while releasing the listing.
  if found then
    update public.website_production_dark_launches
    set listing_id = null
    where id = v_launch.id;
  end if;

  begin
    delete from public.private_listings where id = p_listing_id;
  exception
    when foreign_key_violation then
      raise exception 'This listing still has linked records and cannot be permanently deleted. Resolve its linked workflow first.'
        using errcode = '23503';
  end;

  return jsonb_build_object(
    'deleted', true,
    'mode', 'hard',
    'listing', jsonb_build_object(
      'id', v_listing.id,
      'organisation_id', v_listing.organisation_id,
      'seller_lead_id', v_listing.seller_lead_id,
      'originating_crm_lead_id', v_listing.originating_crm_lead_id,
      'listing_reference', v_listing.listing_reference,
      'title', v_listing.title
    )
  );
end;
$$;

revoke all on function public.delete_private_listing(uuid) from public;
grant execute on function public.delete_private_listing(uuid) to authenticated;

commit;
