-- A current portal may display these universally optional supporting files
-- before a legacy listing has persisted their checklist rows. Prepare only
-- those exact targets under the existing portal link/password boundary.
begin;
create or replace function public.bridge_prepare_seller_optional_document_upload(
  p_token text, p_access_token text, p_requirement_key text
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $function$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_key text := nullif(trim(p_requirement_key), '');
  v_access_hash text := encode(digest(coalesce(p_access_token, ''), 'sha256'), 'hex');
begin
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not coalesce(v_resolution.token_valid, false)
     or v_resolution.token_kind not in ('stable', 'legacy') then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;
  select * into v_onboarding from public.private_listing_seller_onboarding
    where id = v_resolution.onboarding_id;
  select * into v_listing from public.private_listings
    where id = v_onboarding.private_listing_id for update;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;
  if v_onboarding.seller_portal_password_hash is not null and (
    v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  ) then
    raise exception 'Seller portal session has expired. Please sign in again.';
  end if;
  if v_key is null or v_key not in ('title_deed_copy', 'seller_bank_account_confirmation') then
    raise exception 'This document request cannot be prepared from the seller portal.';
  end if;
  insert into public.private_listing_document_requirements (
    private_listing_id, requirement_key, requirement_name, requirement_group,
    document_visibility, status, is_required, generated_from
  ) values (
    v_listing.id, v_key,
    case v_key when 'title_deed_copy' then 'Title Deed Copy' else 'Seller Bank Account Confirmation' end,
    'property', 'seller_visible', 'required', false,
    jsonb_build_object('source', 'seller_optional_upload_preparation')
  ) on conflict (private_listing_id, requirement_key) do nothing;
  select * into v_requirement from public.private_listing_document_requirements
    where private_listing_id = v_listing.id and requirement_key = v_key;
  -- Existing retirement, visibility and approval always win. Never reopen one.
  if v_requirement.status in ('not_applicable', 'cancelled', 'approved', 'completed')
     or coalesce(v_requirement.generated_from->>'archived', 'false') = 'true'
     or v_requirement.document_visibility is distinct from 'seller_visible' then
    raise exception 'This document request is no longer available.';
  end if;
  return to_jsonb(v_requirement);
end;
$function$;
revoke all on function public.bridge_prepare_seller_optional_document_upload(text,text,text) from public;
grant execute on function public.bridge_prepare_seller_optional_document_upload(text,text,text) to anon, authenticated;
comment on function public.bridge_prepare_seller_optional_document_upload(text,text,text) is
  'Token/session-scoped preparation for universally optional seller files; preserves existing request identity and retirement.';
commit;
