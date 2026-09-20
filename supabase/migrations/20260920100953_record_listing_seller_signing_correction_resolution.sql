-- Phase 4: correction requests are immutable seller-facing evidence. A separate
-- internal event links an agent's replacement pack to its source request without
-- changing either the signed record or the original request.
create or replace function public.bridge_record_listing_seller_signing_correction_resolution(
  p_listing_id uuid,
  p_request_activity_id uuid,
  p_replacement_signing_group_id uuid,
  p_initiated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_request public.private_listing_activity%rowtype;
  v_created boolean := false;
begin
  if p_listing_id is null or p_request_activity_id is null or p_replacement_signing_group_id is null then
    raise exception 'Listing, correction request and replacement pack are required.';
  end if;

  select * into v_request
  from public.private_listing_activity
  where id = p_request_activity_id
    and private_listing_id = p_listing_id
    and activity_type = 'seller_signing_pack_post_signature_correction_requested'
  for key share;
  if not found then
    raise exception 'The seller correction request was not found for this listing.';
  end if;

  if not exists (
    select 1 from public.private_listing_activity
    where private_listing_id = p_listing_id
      and activity_type = 'seller_signing_pack_correction_actioned'
      and metadata->>'sourceRequestActivityId' = p_request_activity_id::text
  ) then
    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description,
      visibility, metadata
    ) values (
      p_listing_id,
      'seller_signing_pack_correction_actioned',
      'Seller correction request actioned',
      'An agent prepared a replacement seller signing pack in response to a signed-pack correction request.',
      'internal',
      jsonb_build_object(
        'sourceRequestActivityId', p_request_activity_id,
        'sourceSigningGroupId', v_request.metadata->>'signingGroupId',
        'replacementSigningGroupId', p_replacement_signing_group_id,
        'initiatedBy', p_initiated_by
      )
    );
    v_created := true;
  end if;

  return jsonb_build_object('created', v_created, 'sourceRequestActivityId', p_request_activity_id, 'replacementSigningGroupId', p_replacement_signing_group_id);
end;
$$;

revoke all on function public.bridge_record_listing_seller_signing_correction_resolution(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bridge_record_listing_seller_signing_correction_resolution(uuid, uuid, uuid, uuid) to service_role;
