begin;

create extension if not exists pgcrypto with schema extensions;

alter table if exists public.private_listing_seller_onboarding
  add column if not exists seller_portal_link_active boolean not null default true,
  add column if not exists seller_portal_link_expires_at timestamptz;

comment on column public.private_listing_seller_onboarding.seller_portal_link_active is
  'Independent revocation control for the authenticated seller portal. This is intentionally separate from the onboarding invitation expiry.';

comment on column public.private_listing_seller_onboarding.seller_portal_link_expires_at is
  'Optional seller portal lifecycle expiry. Null keeps the portal available while the listing remains active.';

create table if not exists public.client_portal_access_events (
  id uuid primary key default gen_random_uuid(),
  portal_type text not null check (portal_type in ('seller', 'buyer')),
  event_name text not null,
  outcome text not null check (outcome in ('success', 'challenge', 'failure')),
  token_fingerprint text,
  private_listing_id uuid references public.private_listings(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists client_portal_access_events_created_idx
  on public.client_portal_access_events (created_at desc);

create index if not exists client_portal_access_events_outcome_idx
  on public.client_portal_access_events (portal_type, outcome, event_name, created_at desc);

alter table public.client_portal_access_events enable row level security;
revoke all on table public.client_portal_access_events from anon, authenticated;

create or replace function public.bridge_private_listing_seller_portal_link_is_active(
  p_onboarding jsonb,
  p_listing jsonb
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_link_active boolean := coalesce((p_onboarding ->> 'seller_portal_link_active')::boolean, true);
  v_link_expires_at timestamptz := nullif(p_onboarding ->> 'seller_portal_link_expires_at', '')::timestamptz;
  v_listing_status text := lower(trim(coalesce(
    p_listing ->> 'listing_status',
    p_listing ->> 'status',
    ''
  )));
  v_listing_visibility text := lower(trim(coalesce(p_listing ->> 'listing_visibility', '')));
begin
  if not v_link_active then return false; end if;
  if v_link_expires_at is not null and v_link_expires_at <= now() then return false; end if;
  if nullif(p_listing ->> 'deleted_at', '') is not null then return false; end if;
  if v_listing_status in ('withdrawn', 'cancelled', 'canceled', 'deleted', 'archived', 'closed') then return false; end if;
  if v_listing_visibility in ('withdrawn', 'deleted', 'archived') then return false; end if;
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_log_client_portal_access_event(
  p_token text,
  p_event_name text,
  p_outcome text,
  p_private_listing_id uuid default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_event_name text := left(nullif(trim(coalesce(p_event_name, '')), ''), 80);
  v_outcome text := lower(trim(coalesce(p_outcome, 'failure')));
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 120);
  v_fingerprint text := case when v_token is null then null else encode(digest(v_token, 'sha256'), 'hex') end;
begin
  if v_event_name is null or v_outcome not in ('success', 'challenge', 'failure') then return; end if;

  if not exists (
    select 1
    from public.client_portal_access_events event
    where event.token_fingerprint is not distinct from v_fingerprint
      and event.event_name = v_event_name
      and event.outcome = v_outcome
      and event.created_at > now() - interval '2 minutes'
  ) then
    insert into public.client_portal_access_events (
      portal_type,
      event_name,
      outcome,
      token_fingerprint,
      private_listing_id,
      reason
    ) values (
      case when lower(coalesce(v_token, '')) like 'seller-%' then 'seller' else 'buyer' end,
      v_event_name,
      v_outcome,
      v_fingerprint,
      p_private_listing_id,
      v_reason
    );
  end if;
exception
  when others then
    null;
end;
$$;

revoke all on function public.bridge_log_client_portal_access_event(text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.bridge_private_listing_seller_portal_link_is_active(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.bridge_private_listing_seller_portal_access_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  if v_token is null then
    perform public.bridge_log_client_portal_access_event(p_token, 'access_state', 'failure', null, 'token_missing');
    return jsonb_build_object('valid', false, 'reason', 'token_missing');
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
  limit 1;

  if not found then
    perform public.bridge_log_client_portal_access_event(v_token, 'access_state', 'failure', null, 'token_invalid');
    return jsonb_build_object('valid', false, 'reason', 'token_invalid');
  end if;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(v_token, 'access_state', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    return jsonb_build_object('valid', false, 'reason', 'portal_inactive');
  end if;

  perform public.bridge_log_client_portal_access_event(v_token, 'access_state', 'success', v_listing.id, 'portal_active');
  return jsonb_build_object(
    'valid', true,
    'passwordSet', v_onboarding.seller_portal_password_hash is not null,
    'passwordRequired', v_onboarding.seller_portal_password_hash is null,
    'sellerEmail', lower(nullif(trim(coalesce(
      v_onboarding.form_data ->> 'sellerEmail',
      v_onboarding.form_data ->> 'email',
      v_onboarding.form_data ->> 'contactEmail',
      ''
    )), '')),
    'propertyTitle', nullif(trim(coalesce(v_listing.title, v_listing.formatted_address, v_listing.address_line_1, 'your property')), ''),
    'accessTokenExpiresAt', v_onboarding.seller_portal_access_token_expires_at,
    'passwordSetAt', v_onboarding.seller_portal_password_set_at,
    'lastLoginAt', v_onboarding.seller_portal_last_login_at,
    'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
  );
end;
$$;

create or replace function public.bridge_set_private_listing_seller_portal_password(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_password text := coalesce(p_password, '');
  v_access_token text := encode(gen_random_bytes(32), 'hex');
  v_access_hash text := encode(digest(v_access_token, 'sha256'), 'hex');
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_token is null then raise exception 'Seller portal token is required.'; end if;
  if length(v_password) < 8 then raise exception 'Password must be at least 8 characters.'; end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
  limit 1
  for update;

  if not found then
    perform public.bridge_log_client_portal_access_event(v_token, 'password_set', 'failure', null, 'token_invalid');
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id limit 1;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(v_token, 'password_set', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    raise exception 'Seller portal link is invalid or inactive.';
  end if;
  if v_onboarding.seller_portal_password_hash is not null then raise exception 'Seller portal password has already been set.'; end if;

  update public.private_listing_seller_onboarding
  set seller_portal_password_hash = crypt(v_password, gen_salt('bf')),
      seller_portal_password_set_at = now(),
      seller_portal_last_login_at = now(),
      seller_portal_access_token_hash = v_access_hash,
      seller_portal_access_token_expires_at = v_expires_at,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(v_token, 'password_set', 'success', v_listing.id, 'session_created');
  return jsonb_build_object('ok', true, 'accessToken', v_access_token, 'expiresAt', v_expires_at, 'passwordSet', true);
end;
$$;

create or replace function public.bridge_verify_private_listing_seller_portal_password(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_password text := coalesce(p_password, '');
  v_access_token text := encode(gen_random_bytes(32), 'hex');
  v_access_hash text := encode(digest(v_access_token, 'sha256'), 'hex');
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_token is null then raise exception 'Seller portal token is required.'; end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = v_token
  limit 1
  for update;

  if not found then
    perform public.bridge_log_client_portal_access_event(v_token, 'password_verify', 'failure', null, 'token_invalid');
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id limit 1;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(v_token, 'password_verify', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    raise exception 'Seller portal link is invalid or inactive.';
  end if;
  if v_onboarding.seller_portal_password_hash is null then raise exception 'Seller portal password has not been set.'; end if;

  if crypt(v_password, v_onboarding.seller_portal_password_hash) <> v_onboarding.seller_portal_password_hash then
    perform public.bridge_log_client_portal_access_event(v_token, 'password_verify', 'failure', v_listing.id, 'password_incorrect');
    raise exception 'Incorrect seller portal password.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_last_login_at = now(),
      seller_portal_access_token_hash = v_access_hash,
      seller_portal_access_token_expires_at = v_expires_at,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(v_token, 'password_verify', 'success', v_listing.id, 'session_created');
  return jsonb_build_object('ok', true, 'accessToken', v_access_token, 'expiresAt', v_expires_at, 'passwordSet', true);
end;
$$;

create or replace function public.bridge_reset_private_listing_seller_portal_password(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  if v_token is null then raise exception 'Seller portal token is required.'; end if;
  select * into v_onboarding from public.private_listing_seller_onboarding where token = v_token limit 1 for update;
  if not found then raise exception 'Seller portal link is invalid or inactive.'; end if;
  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id limit 1;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_password_hash = null,
      seller_portal_password_set_at = null,
      seller_portal_access_token_hash = null,
      seller_portal_access_token_expires_at = null,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(v_token, 'password_reset', 'success', v_listing.id, 'sessions_revoked');
  return jsonb_build_object('ok', true, 'passwordSet', false, 'passwordRequired', true);
end;
$$;

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
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_appointments jsonb := '[]'::jsonb;
  v_mandate_packet jsonb := 'null'::jsonb;
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
  v_access_granted boolean := false;
  v_session_expired boolean := false;
begin
  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
  limit 1;

  if not found then
    perform public.bridge_log_client_portal_access_event(p_token, 'payload', 'failure', null, 'token_invalid');
    return null;
  end if;

  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id limit 1;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(p_token, 'payload', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    return null;
  end if;

  v_session_expired := v_access_token is not null and (
    v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  );
  v_access_granted :=
    (not p_require_access and v_onboarding.seller_portal_password_hash is null)
    or (
      v_access_hash is not null
      and v_onboarding.seller_portal_access_token_hash = v_access_hash
      and v_onboarding.seller_portal_access_token_expires_at > now()
    );

  if p_require_access and not v_access_granted then
    perform public.bridge_log_client_portal_access_event(
      p_token,
      'payload',
      'challenge',
      v_listing.id,
      case when v_session_expired then 'session_expired' else 'authentication_required' end
    );
    return jsonb_build_object(
      'authRequired', true,
      'sessionExpired', v_session_expired,
      'reason', case when v_session_expired then 'session_expired' else 'authentication_required' end,
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'passwordRequired', v_onboarding.seller_portal_password_hash is null,
      'sellerEmail', lower(nullif(trim(coalesce(
        v_onboarding.form_data ->> 'sellerEmail',
        v_onboarding.form_data ->> 'email',
        v_onboarding.form_data ->> 'contactEmail',
        ''
      )), '')),
      'propertyTitle', nullif(trim(coalesce(v_listing.title, v_listing.formatted_address, v_listing.address_line_1, 'your property')), ''),
      'token', v_onboarding.token
    );
  end if;

  perform public.bridge_log_client_portal_access_event(p_token, 'payload', 'success', v_listing.id, 'access_granted');

  if to_regprocedure('public.bridge_promote_pending_private_listing_documents(uuid)') is not null then
    perform public.bridge_promote_pending_private_listing_documents(v_listing.id);
  end if;

  if to_regclass('public.private_listing_document_requirements') is not null then
    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at asc), '[]'::jsonb)
    into v_requirements
    from public.private_listing_document_requirements req
    where req.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    select coalesce(jsonb_agg(to_jsonb(doc) order by doc.uploaded_at desc), '[]'::jsonb)
    into v_documents
    from public.private_listing_documents doc
    where doc.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.appointments') is not null then
    select coalesce(jsonb_agg(to_jsonb(appt) order by appt.date_time asc nulls last, appt.created_at desc), '[]'::jsonb)
    into v_appointments
    from public.appointments appt
    where appt.organisation_id::text = v_listing.organisation_id::text
      and coalesce(appt.status, '') not in ('cancelled', 'deleted')
      and coalesce(appt.visibility_scope, 'shared_role_players') not in ('internal', 'internal_only', 'admin_only')
      and (
        appt.listing_id::text = v_listing.id::text
        or appt.lead_id::text = v_listing.seller_lead_id::text
        or appt.lead_id::text = v_listing.originating_crm_lead_id::text
        or appt.related_entity_id::text = v_listing.id::text
        or appt.related_entity_id::text = v_listing.seller_lead_id::text
        or appt.related_entity_id::text = v_listing.originating_crm_lead_id::text
      );
  end if;

  if to_regclass('public.document_packets') is not null and to_regclass('public.document_packet_versions') is not null then
    select jsonb_build_object(
      'id', pkt.id,
      'state', case
        when pkt.status = 'completed' then 'fully_signed'
        when pkt.status = 'partially_signed' then 'awaiting_other_signatures'
        when pkt.status = 'sent' then 'ready_for_client_signature'
        when pkt.status = 'generated' then 'generated_not_ready'
        when pkt.status in ('ready_for_generation', 'draft') then 'not_generated'
        else coalesce(pkt.status, 'not_generated')
      end,
      'packet', to_jsonb(pkt),
      'version', to_jsonb(ver),
      'packetVersionId', ver.id,
      'finalSignedFilePath', ver.final_signed_file_path,
      'finalSignedFileName', ver.final_signed_file_name,
      'finalSignedFileBucket', ver.final_signed_file_bucket,
      'finalSignedDownloadUrl', ver.final_signed_file_url,
      'generatedPreviewFilePath', ver.rendered_file_path,
      'generatedPreviewFileName', ver.rendered_file_name,
      'signedAt', coalesce(ver.finalised_at, pkt.completed_at),
      'updatedAt', pkt.updated_at
    ) into v_mandate_packet
    from public.document_packets pkt
    left join lateral (
      select *
      from public.document_packet_versions packet_version
      where packet_version.packet_id = pkt.id
      order by
        case when packet_version.final_signed_file_path is not null or packet_version.final_signed_file_url is not null then 0 else 1 end,
        packet_version.finalised_at desc nulls last,
        packet_version.version_number desc nulls last,
        packet_version.created_at desc nulls last
      limit 1
    ) ver on true
    where pkt.organisation_id::text = v_listing.organisation_id::text
      and pkt.packet_type = 'mandate'
      and (
        pkt.id::text = nullif(v_listing.mandate_packet_id::text, '')
        or pkt.id::text = nullif(v_onboarding.form_data->>'mandatePacketId', '')
        or pkt.lead_id::text = v_listing.seller_lead_id::text
        or pkt.lead_id::text = v_listing.originating_crm_lead_id::text
        or pkt.source_context_json->>'uiLeadId' = v_listing.seller_lead_id::text
        or pkt.source_context_json->>'uiLeadId' = v_listing.originating_crm_lead_id::text
        or pkt.source_context_json->>'leadId' = v_listing.seller_lead_id::text
        or pkt.source_context_json->>'leadId' = v_listing.originating_crm_lead_id::text
      )
    order by
      case
        when pkt.status = 'completed' then 0
        when pkt.id::text = nullif(v_listing.mandate_packet_id::text, '') then 1
        when pkt.id::text = nullif(v_onboarding.form_data->>'mandatePacketId', '') then 2
        else 3
      end,
      pkt.updated_at desc nulls last,
      pkt.created_at desc nulls last
    limit 1;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash',
    'requirements', v_requirements,
    'documents', v_documents,
    'appointments', v_appointments,
    'mandatePacket', v_mandate_packet,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
    )
  );
end;
$$;

create or replace function public.bridge_upload_private_listing_seller_document(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null,
  p_canonical_requirement_instance_id uuid default null,
  p_category text default null,
  p_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_requirement_key text := nullif(trim(coalesce(p_requirement_key, '')), '');
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
begin
  if nullif(trim(coalesce(p_storage_path, '')), '') is null then raise exception 'Document storage path is required.'; end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
  limit 1;

  if not found then raise exception 'Seller portal link is invalid or inactive.'; end if;
  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id limit 1;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  if v_onboarding.seller_portal_password_hash is not null and (
    v_access_hash is null
    or v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  ) then
    perform public.bridge_log_client_portal_access_event(p_token, 'document_upload', 'challenge', v_listing.id, 'session_expired');
    raise exception 'Seller portal session has expired. Please sign in again.';
  end if;

  if v_requirement_key is not null then
    select * into v_requirement
    from public.private_listing_document_requirements
    where private_listing_id = v_listing.id and requirement_key = v_requirement_key
    limit 1;
  end if;

  insert into public.private_listing_documents (
    private_listing_id, requirement_id, document_type, document_name, storage_path,
    file_url, uploaded_by, status, visibility, uploaded_at
  ) values (
    v_listing.id,
    case when v_requirement.id is not null then v_requirement.id else null end,
    nullif(trim(coalesce(p_document_type, v_requirement_key, p_category, 'seller_document')), ''),
    coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'Seller document'),
    trim(p_storage_path),
    nullif(trim(coalesce(p_file_url, '')), ''),
    null,
    'uploaded',
    'seller_visible',
    now()
  ) returning * into v_document;

  if v_requirement.id is not null then
    update public.private_listing_document_requirements
    set status = 'uploaded', updated_at = now()
    where id = v_requirement.id
    returning * into v_requirement;
  end if;

  if to_regclass('public.private_listing_activity') is not null then
    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description,
      performed_by, visibility, metadata
    ) values (
      v_listing.id,
      'seller_document_uploaded',
      'Seller document uploaded',
      coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'A seller document was uploaded from the client portal.'),
      null,
      'internal',
      jsonb_build_object(
        'documentId', v_document.id,
        'requirementId', v_requirement.id,
        'requirementKey', v_requirement_key,
        'canonicalRequirementInstanceId', p_canonical_requirement_instance_id,
        'category', p_category,
        'source', 'client_portal_selling'
      )
    );
  end if;

  perform public.bridge_log_client_portal_access_event(p_token, 'document_upload', 'success', v_listing.id, 'uploaded');
  return jsonb_build_object(
    'document', to_jsonb(v_document),
    'requirement', case when v_requirement.id is not null then to_jsonb(v_requirement) else null end,
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash'
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_access_state(text) to anon, authenticated;
grant execute on function public.bridge_set_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_verify_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_reset_private_listing_seller_portal_password(text) to authenticated;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) to anon, authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
