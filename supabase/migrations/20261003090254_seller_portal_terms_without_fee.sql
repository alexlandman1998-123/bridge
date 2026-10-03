-- Password setup captures portal terms and privacy consent only.
-- Historical fee acceptances are preserved; new acceptances contain no fee authorisation.
alter table public.seller_portal_terms_acceptances alter column currency drop not null;

create or replace function public.bridge_record_seller_portal_activation_terms(
  p_token text,
  p_acceptance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_current_version constant text := 'seller-portal-terms-popi-v2';
  v_privacy_version constant text := 'arch9-seller-terms-popi-v1';
  v_body constant text := E'I accept the Arch9 terms and conditions applicable to this seller onboarding and transaction workflow.\n\nI consent to Arch9, the appointed agency, and authorised transaction partners processing my personal information for onboarding, mandate, property disclosure, compliance, and transaction-administration purposes in line with POPI requirements.';
  v_checkbox constant text := 'I accept the Arch9 terms and conditions and consent to the processing of my personal information as described below.';
  v_headers jsonb := public.bridge_request_headers();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_token_hash text := case when v_token is null then null else encode(digest(v_token, 'sha256'), 'hex') end;
  v_accepted boolean := lower(trim(coalesce(p_acceptance ->> 'accepted', 'false'))) in ('true', 't', 'yes', '1');
  v_terms_version text := nullif(trim(coalesce(p_acceptance ->> 'wordingVersion', p_acceptance ->> 'wording_version', '')), '');
  v_accepted_at timestamptz;
  v_ip inet;
  v_acceptance public.seller_portal_terms_acceptances%rowtype;
begin
  if not v_accepted then
    raise exception 'Seller portal terms and privacy consent must be accepted before activation.' using errcode = '22023';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_token);

  if not found or not v_resolution.token_valid then
    raise exception 'Seller portal invitation is invalid, expired, or already used.' using errcode = '42501';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.' using errcode = '42501';
  end if;

  if v_terms_version is distinct from v_current_version
    or coalesce(p_acceptance ->> 'consentType', p_acceptance ->> 'consent_type', '') <> 'seller_portal_terms_and_privacy'
    or coalesce(p_acceptance ->> 'privacyPolicyVersion', p_acceptance ->> 'privacy_policy_version', '') <> v_privacy_version
    or coalesce(p_acceptance ->> 'wordingSnapshot', p_acceptance ->> 'wording_snapshot', '') <> v_body
    or coalesce(p_acceptance ->> 'checkboxLabel', p_acceptance ->> 'checkbox_label', '') <> v_checkbox
    or lower(coalesce(p_acceptance ->> 'popiConsentIncluded', p_acceptance ->> 'popi_consent_included', 'false')) <> 'true'
    or p_acceptance ?| array['feeAmount', 'fee_amount', 'platformFeeAccepted', 'platform_fee_accepted'] then
    raise exception 'Seller portal terms have changed. Please reload and accept the current terms and privacy consent.' using errcode = '22023';
  end if;

  begin
    v_accepted_at := coalesce(nullif(trim(coalesce(p_acceptance ->> 'acceptedAt', p_acceptance ->> 'accepted_at', '')), '')::timestamptz, now());
  exception when others then
    raise exception 'Terms accepted time must be valid.' using errcode = '22023';
  end;

  begin
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.seller_portal_terms_acceptances (
    organisation_id,
    private_listing_id,
    seller_onboarding_id,
    user_id,
    activation_source,
    terms_version,
    privacy_policy_version,
    fee_disclosure_version,
    fee_amount,
    currency,
    wording_snapshot,
    checkbox_label,
    accepted_at,
    accepted_by_email,
    token_hash,
    ip_address,
    user_agent,
    metadata_json
  )
  values (
    v_listing.organisation_id,
    v_listing.id,
    v_onboarding.id,
    auth.uid(),
    coalesce(v_onboarding.seller_portal_activation_source, 'existing_listing'),
    v_current_version,
    v_privacy_version,
    null,
    null,
    null,
    v_body,
    v_checkbox,
    v_accepted_at,
    nullif(left(lower(trim(coalesce(p_acceptance ->> 'acceptedByEmail', p_acceptance ->> 'accepted_by_email', ''))), 320), ''),
    v_token_hash,
    v_ip,
    nullif(left(trim(coalesce(v_headers ->> 'user-agent', '')), 1000), ''),
    jsonb_build_object(
      'sourcePayload', p_acceptance,
      'tokenKind', v_resolution.token_kind,
      'stablePortalTokenPresent', v_resolution.stable_portal_token is not null
    )
  )
  on conflict (seller_onboarding_id, terms_type, terms_version) do nothing
  returning * into v_acceptance;

  if not found then
    select * into v_acceptance
    from public.seller_portal_terms_acceptances
    where seller_onboarding_id = v_onboarding.id
      and terms_type = 'seller_portal_activation'
      and terms_version = v_current_version;
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_status = case
        when status in ('completed', 'submitted', 'approved') then 'profile_complete'
        else 'activated'
      end,
      seller_portal_activated_at = coalesce(seller_portal_activated_at, now()),
      seller_portal_terms_accepted_at = coalesce(seller_portal_terms_accepted_at, v_acceptance.accepted_at),
      seller_portal_terms_version = v_acceptance.terms_version,
      seller_portal_terms_acceptance_id = v_acceptance.id,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(v_token, 'terms_accepted', 'success', v_listing.id, 'seller_portal_activation');

  return jsonb_build_object(
    'ok', true,
    'acceptanceId', v_acceptance.id,
    'listingId', v_listing.id,
    'sellerOnboardingId', v_onboarding.id,
    'termsVersion', v_acceptance.terms_version,
    'acceptedAt', v_acceptance.accepted_at
  );
end;
$$;

revoke all on function public.bridge_record_seller_portal_activation_terms(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_record_seller_portal_activation_terms(text, jsonb)
  to anon, authenticated;

