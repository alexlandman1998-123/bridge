begin;

create or replace function public.bridge_private_listing_media_payload(
  p_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_images jsonb := '[]'::jsonb;
  v_cover jsonb := 'null'::jsonb;
begin
  if p_listing_id is null or to_regclass('public.listing_media') is null then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(item.payload), '[]'::jsonb)
    into v_images
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', media.id,
      'name', coalesce(nullif(trim(media.caption), ''), 'Property image'),
      'label', nullif(trim(media.caption), ''),
      'url', media.file_url,
      'fileUrl', media.file_url,
      'file_url', media.file_url,
      'isCover', media.is_cover,
      'is_cover', media.is_cover,
      'sortOrder', media.sort_order,
      'sort_order', media.sort_order
    )) as payload
    from public.listing_media media
    where media.listing_id = p_listing_id
      and media.media_type = 'image'
      and nullif(trim(media.file_url), '') is not null
    order by
      case when media.is_cover then 0 else 1 end,
      media.sort_order asc,
      media.created_at asc
  ) item;

  if jsonb_array_length(v_images) = 0 then
    return '{}'::jsonb;
  end if;

  v_cover := v_images -> 0;

  return jsonb_strip_nulls(jsonb_build_object(
    'heroImageUrl', v_cover ->> 'url',
    'hero_image_url', v_cover ->> 'url',
    'imageUrl', v_cover ->> 'url',
    'image_url', v_cover ->> 'url',
    'coverImageUrl', v_cover ->> 'url',
    'cover_image_url', v_cover ->> 'url',
    'coverImageId', v_cover ->> 'id',
    'cover_image_id', v_cover ->> 'id',
    'images', v_images,
    'galleryImages', v_images,
    'gallery_images', v_images,
    'marketing', jsonb_build_object(
      'mediaUrl', v_cover ->> 'url',
      'media_url', v_cover ->> 'url',
      'coverImageId', v_cover ->> 'id',
      'cover_image_id', v_cover ->> 'id',
      'imageGallery', v_images,
      'image_gallery', v_images,
      'galleryImages', v_images,
      'gallery_images', v_images
    )
  ));
exception
  when undefined_column or undefined_table then
    return '{}'::jsonb;
end;
$$;

revoke all on function public.bridge_private_listing_media_payload(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_private_listing_seller_portal_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
  v_listing_id uuid;
  v_listing_payload jsonb := '{}'::jsonb;
  v_media jsonb := '{}'::jsonb;
  v_transaction_id uuid;
  v_transaction jsonb := null;
begin
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then
    return null;
  end if;

  v_result := public.bridge_private_listing_seller_portal_payload_phase1(
    v_resolution.legacy_token,
    p_access_token,
    p_require_access
  );
  if v_result is null then
    return null;
  end if;
  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;

  if coalesce(v_result ->> 'authRequired', 'false') <> 'true' then
    begin
      v_listing_id := nullif(trim(coalesce(v_result -> 'listing' ->> 'id', '')), '')::uuid;
    exception
      when invalid_text_representation then
        v_listing_id := null;
    end;

    if v_listing_id is not null then
      v_media := public.bridge_private_listing_media_payload(v_listing_id);
      if v_media <> '{}'::jsonb then
        v_listing_payload :=
          coalesce(v_result -> 'listing', '{}'::jsonb) ||
          (v_media - 'marketing') ||
          jsonb_build_object(
            'marketing',
            coalesce(v_result -> 'listing' -> 'marketing', '{}'::jsonb) || coalesce(v_media -> 'marketing', '{}'::jsonb)
          );
        v_result := jsonb_set(v_result, '{listing}', v_listing_payload, true);
      end if;
    end if;

    if v_listing_id is not null
      and to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null then
      v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
    end if;

    if v_transaction_id is not null then
      select jsonb_strip_nulls(jsonb_build_object(
        'id', tx.id,
        'listing_id', tx.listing_id,
        'stage', tx.stage,
        'current_main_stage', tx.current_main_stage,
        'lifecycle_state', tx.lifecycle_state,
        'attorney', tx.attorney,
        'assigned_attorney_email', tx.assigned_attorney_email,
        'bond_originator', tx.bond_originator,
        'assigned_bond_originator_email', tx.assigned_bond_originator_email,
        'assigned_agent', tx.assigned_agent,
        'assigned_agent_email', tx.assigned_agent_email,
        'created_at', tx.created_at,
        'updated_at', tx.updated_at,
        'completed_at', tx.completed_at,
        'registered_at', tx.registered_at,
        'registration_date', tx.registration_date
      ))
      into v_transaction
      from public.transactions tx
      where tx.id = v_transaction_id;
    end if;
  end if;

  v_result := v_result || jsonb_build_object(
    'transaction', v_transaction,
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalAccess', coalesce(v_result -> 'portalAccess', '{}'::jsonb) || jsonb_build_object(
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token,
      'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
    )
  );

  return public.bridge_sanitize_seller_portal_final_artifact_payload_phase4(v_result);
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  to anon, authenticated;

create or replace function public.bridge_private_listing_seller_portal_core_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
  v_listing_id uuid;
  v_listing_payload jsonb := '{}'::jsonb;
  v_media jsonb := '{}'::jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then return null; end if;

  v_result := public.bridge_private_listing_seller_portal_core_payload_phase1(
    v_resolution.legacy_token,
    p_access_token,
    p_require_access
  );
  if v_result is null then return null; end if;

  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;

  if coalesce(v_result ->> 'authRequired', 'false') <> 'true' then
    begin
      v_listing_id := nullif(trim(coalesce(v_result -> 'listing' ->> 'id', '')), '')::uuid;
    exception
      when invalid_text_representation then
        v_listing_id := null;
    end;

    if v_listing_id is not null then
      v_media := public.bridge_private_listing_media_payload(v_listing_id);
      if v_media <> '{}'::jsonb then
        v_listing_payload :=
          coalesce(v_result -> 'listing', '{}'::jsonb) ||
          (v_media - 'marketing') ||
          jsonb_build_object(
            'marketing',
            coalesce(v_result -> 'listing' -> 'marketing', '{}'::jsonb) || coalesce(v_media -> 'marketing', '{}'::jsonb)
          );
        v_result := jsonb_set(v_result, '{listing}', v_listing_payload, true);
      end if;
    end if;
  end if;

  return v_result || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalAccess', coalesce(v_result -> 'portalAccess', '{}'::jsonb) || jsonb_build_object(
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token,
      'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
    )
  );
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_core_payload(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_core_payload(text, text, boolean)
  to anon, authenticated;

comment on function public.bridge_private_listing_media_payload(uuid) is
  'Internal seller-portal helper that returns only image media for the token-scoped listing payload.';
comment on function public.bridge_private_listing_seller_portal_core_payload(text, text, boolean) is
  'Fast seller portal first-entry payload with token-scoped listing image media for the mobile hero.';

notify pgrst, 'reload schema';

commit;
