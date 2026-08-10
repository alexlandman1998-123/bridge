begin;

create extension if not exists pgcrypto;

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
  v_transaction_id uuid;
  v_completion_dedupe_key text;
  v_requirement_key text := nullif(trim(coalesce(p_requirement_key, '')), '');
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
begin
  -- Seller portal uploads are anonymous-token driven; enforce service-role context
  -- for this mutation flow so row-level membership checks do not block validated flows.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('row_security', 'off', true);

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

  if to_regclass('public.transaction_notifications') is not null
    and to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null then
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing.id);
    v_completion_dedupe_key := 'seller-documents-complete:' || v_listing.id::text;

    if v_transaction_id is not null
      and v_listing.assigned_agent_id is not null
      and not exists (
        select 1
        from public.transaction_notifications notification
        where notification.transaction_id = v_transaction_id
          and notification.user_id = v_listing.assigned_agent_id
          and notification.dedupe_key = v_completion_dedupe_key
          and notification.is_read = false
      )
      and not exists (
        select 1
        from public.private_listing_document_requirements requirement
        where requirement.private_listing_id = v_listing.id
          and requirement.is_required is true
          and requirement.document_visibility = 'seller_visible'
          and requirement.status <> 'not_applicable'
          and not exists (
            select 1
            from public.private_listing_documents document
            where document.private_listing_id = v_listing.id
              and (
                document.requirement_id = requirement.id
                or lower(regexp_replace(coalesce(document.document_type, ''), '[^a-zA-Z0-9]+', '_', 'g')) =
                   lower(regexp_replace(requirement.requirement_key, '[^a-zA-Z0-9]+', '_', 'g'))
              )
              and document.status in ('uploaded', 'under_review', 'approved', 'completed')
          )
      ) then
      insert into public.transaction_notifications (
        transaction_id,
        user_id,
        role_type,
        notification_type,
        title,
        message,
        is_read,
        read_at,
        dedupe_key,
        event_type,
        event_data
      ) values (
        v_transaction_id,
        v_listing.assigned_agent_id,
        'agent',
        'readiness_updated',
        'Seller documents are in',
        'All required seller documents have been uploaded. Review the file and move to the next step.',
        false,
        null,
        v_completion_dedupe_key,
        'TransactionUpdated',
        jsonb_build_object(
          'trigger', 'seller_documents_complete',
          'listingId', v_listing.id,
          'transactionId', v_transaction_id,
          'documentId', v_document.id,
          'requirementId', v_requirement.id,
          'requirementKey', v_requirement_key,
          'source', 'client_portal_selling'
        )
      );
    end if;
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

grant execute on function public.bridge_upload_private_listing_seller_document(
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text
) to anon, authenticated;

commit;
