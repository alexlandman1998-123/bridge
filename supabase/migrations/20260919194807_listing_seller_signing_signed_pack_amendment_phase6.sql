-- Phase 6: a signed seller pack is immutable. A correction creates a new
-- signing group and an explicit amendment lineage; it never rewrites the
-- original signatures or their frozen document snapshot.
create or replace function public.bridge_amend_listing_seller_signing_pack(
  p_listing_id uuid,
  p_signed_signing_group_id uuid,
  p_amendment_signing_group_id uuid,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_signed_count integer := 0;
  v_amendment_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Provide a short reason for the signed-pack amendment.';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where private_listing_id = p_listing_id
    and signing_group_id = p_signed_signing_group_id
  order by created_at
  limit 1
  for update;

  if not found then
    raise exception 'The signed seller pack to amend was not found.';
  end if;

  perform 1
  from public.private_listing_mandate_signing_sessions
  where signing_group_id = p_signed_signing_group_id
  for update;

  select count(*) filter (where status = 'signed')
    into v_signed_count
  from public.private_listing_mandate_signing_sessions
  where signing_group_id = p_signed_signing_group_id;

  if v_signed_count = 0 then
    raise exception 'Only a pack with an existing signature can be amended. Replace an open pack instead.';
  end if;

  insert into public.private_listing_signing_pack_replacements (
    organisation_id,
    private_listing_id,
    superseded_signing_group_id,
    replacement_signing_group_id,
    reason,
    initiated_by
  ) values (
    v_session.organisation_id,
    p_listing_id,
    p_signed_signing_group_id,
    p_amendment_signing_group_id,
    trim(p_reason),
    p_initiated_by
  ) returning id into v_amendment_id;

  insert into public.private_listing_activity (
    private_listing_id,
    activity_type,
    activity_title,
    activity_description,
    visibility,
    metadata
  ) values (
    p_listing_id,
    'seller_signing_pack_amendment_prepared',
    'Seller signing pack amendment prepared',
    'A corrected seller signing pack was prepared. The earlier signed pack remains preserved as audit evidence. Reason: ' || trim(p_reason),
    'internal',
    jsonb_build_object(
      'amendmentId', v_amendment_id,
      'signedSigningGroupId', p_signed_signing_group_id,
      'amendmentSigningGroupId', p_amendment_signing_group_id,
      'signedSessionsRetained', v_signed_count,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'amendmentId', v_amendment_id,
    'signedSessionsRetained', v_signed_count,
    'sourceSigningGroupId', p_signed_signing_group_id,
    'amendmentSigningGroupId', p_amendment_signing_group_id
  );
end;
$$;

revoke all on function public.bridge_amend_listing_seller_signing_pack(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_amend_listing_seller_signing_pack(uuid, uuid, uuid, text, uuid) to service_role;
