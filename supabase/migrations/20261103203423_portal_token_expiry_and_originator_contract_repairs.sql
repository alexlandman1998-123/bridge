begin;

-- Provide REST-callable partner names within PostgreSQL's identifier limit,
-- correct joined document counts, and enforce configured buyer-link expiry.
-- No historical rows, tokens, files or assignments are changed.

create or replace function public.bridge_client_portal_request_token()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_token text := public.bridge_request_header('x-bridge-client-portal-token');
begin
  -- Unrecognised tokens must remain available to the separate secure seller
  -- context resolver. Only a matching, revoked/expired buyer link is fenced.
  if exists (select 1 from public.client_portal_links l where l.token=v_token
    and (l.is_active is not true or l.expires_at<=now())) then return ''; end if;
  return v_token;
end $$;


CREATE OR REPLACE FUNCTION public.bridge_attorney_client_financial_documents_by_token(p_token text, p_recipient_role text, p_seller_access_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_recipient_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_transaction_id uuid;
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_result jsonb;
begin
  if v_token is null or v_recipient_role not in ('buyer', 'seller') then
    return '[]'::jsonb;
  end if;

  if v_recipient_role = 'buyer' then
    select link.transaction_id into v_transaction_id
    from public.client_portal_links link
    where link.token = v_token
      and link.is_active is true
      and (link.expires_at is null or link.expires_at>now())
    order by link.created_at desc
    limit 1;
  else
    v_seller_payload := public.bridge_private_listing_seller_portal_payload(v_token, p_seller_access_token, true);
    if v_seller_payload is null or coalesce((v_seller_payload ->> 'authRequired')::boolean, false) then
      return '[]'::jsonb;
    end if;
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  if v_transaction_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', document_row.id,
    'transaction_id', document_row.transaction_id,
    'name', document_row.name,
    'file_path', document_row.file_path,
    'category', document_row.category,
    'document_type', document_row.document_type,
    'visibility_scope', 'client',
    'is_client_visible', true,
    'client_recipient_role', metadata.recipient_role,
    'publication_status', metadata.publication_status,
    'published_at', metadata.published_at,
    'invoice_reference', metadata.invoice_reference,
    'amount', metadata.amount,
    'document_date', metadata.document_date,
    'payment_due_date', metadata.payment_due_date,
    'notes', metadata.notes,
    'created_at', document_row.created_at
  ) order by metadata.published_at desc), '[]'::jsonb)
  into v_result
  from public.transaction_attorney_client_financial_document_metadata metadata
  join public.documents document_row on document_row.id = metadata.document_id
  where metadata.transaction_id = v_transaction_id
    and metadata.recipient_role = v_recipient_role
    and metadata.publication_status = 'published';

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_attorney_client_financial_notifications_by_token(p_token text, p_recipient_role text, p_seller_access_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_recipient_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_transaction_id uuid;
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_result jsonb;
begin
  if v_token is null or v_recipient_role not in ('buyer', 'seller') then
    return '[]'::jsonb;
  end if;

  if v_recipient_role = 'buyer' then
    select link.transaction_id into v_transaction_id
    from public.client_portal_links link
    where link.token = v_token
      and link.is_active is true
      and (link.expires_at is null or link.expires_at>now())
    order by link.created_at desc
    limit 1;
  else
    v_seller_payload := public.bridge_private_listing_seller_portal_payload(v_token, p_seller_access_token, true);
    if v_seller_payload is null or coalesce((v_seller_payload ->> 'authRequired')::boolean, false) then
      return '[]'::jsonb;
    end if;
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  if v_transaction_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(notification) order by notification.created_at desc), '[]'::jsonb)
  into v_result
  from public.client_portal_notifications notification
  where notification.transaction_id = v_transaction_id
    and notification.client_role = v_recipient_role
    and notification.visibility = 'client_visible'
    and notification.status <> 'dismissed'
    and notification.related_entity_type = 'attorney_client_financial_document';

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_record_attorney_client_financial_document_access(p_token text, p_recipient_role text, p_document_id uuid, p_event_type text DEFAULT 'viewed'::text, p_seller_access_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_recipient_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_event_type text := lower(trim(coalesce(p_event_type, 'viewed')));
  v_transaction_id uuid;
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_metadata public.transaction_attorney_client_financial_document_metadata%rowtype;
  v_publication_event public.attorney_client_financial_document_publication_events%rowtype;
  v_access_event public.attorney_client_financial_document_access_events%rowtype;
begin
  if v_token is null or p_document_id is null then
    raise exception 'Portal token and document are required.' using errcode = '22023';
  end if;
  if v_recipient_role not in ('buyer', 'seller') then
    raise exception 'Recipient role must be buyer or seller.' using errcode = '22023';
  end if;
  if v_event_type not in ('viewed', 'downloaded') then
    raise exception 'Access event must be viewed or downloaded.' using errcode = '22023';
  end if;

  if v_recipient_role = 'buyer' then
    select link.transaction_id into v_transaction_id
    from public.client_portal_links link
    where link.token = v_token
      and link.is_active is true
      and (link.expires_at is null or link.expires_at>now())
    order by link.created_at desc
    limit 1;
  else
    v_seller_payload := public.bridge_private_listing_seller_portal_payload(v_token, p_seller_access_token, true);
    if v_seller_payload is null or coalesce((v_seller_payload ->> 'authRequired')::boolean, false) then
      raise exception 'Seller portal access is required.' using errcode = '42501';
    end if;
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  if v_transaction_id is null then
    raise exception 'Portal transaction could not be resolved.' using errcode = '42501';
  end if;

  select metadata.* into v_metadata
  from public.transaction_attorney_client_financial_document_metadata metadata
  join public.documents document_row
    on document_row.id = metadata.document_id
   and document_row.transaction_id = metadata.transaction_id
  where metadata.transaction_id = v_transaction_id
    and metadata.document_id = p_document_id
    and metadata.recipient_role = v_recipient_role
    and metadata.publication_status = 'published'
    and coalesce(document_row.is_client_visible, false) = true
    and document_row.client_recipient_role = v_recipient_role
  limit 1;

  if not found then
    raise exception 'This published document is not available to the portal recipient.' using errcode = '42501';
  end if;

  select publication_event.* into v_publication_event
  from public.attorney_client_financial_document_publication_events publication_event
  where publication_event.transaction_id = v_transaction_id
    and publication_event.document_id = p_document_id
    and publication_event.document_definition_key = v_metadata.document_definition_key
    and publication_event.recipient_role = v_recipient_role
    and publication_event.action = 'published'
    and publication_event.created_at >= coalesce(v_metadata.published_at, '-infinity'::timestamptz)
  order by publication_event.created_at desc
  limit 1;

  if not found then
    raise exception 'The active publication event could not be verified.' using errcode = '42501';
  end if;

  insert into public.attorney_client_financial_document_access_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    publication_event_id,
    document_definition_key,
    document_id,
    recipient_role,
    event_type,
    portal_token_fingerprint
  ) values (
    v_metadata.organisation_id,
    v_metadata.attorney_firm_id,
    v_transaction_id,
    v_publication_event.id,
    v_metadata.document_definition_key,
    p_document_id,
    v_recipient_role,
    v_event_type,
    encode(digest(v_token, 'sha256'), 'hex')
  )
  on conflict (publication_event_id, recipient_role, event_type) do update
  set portal_token_fingerprint = excluded.portal_token_fingerprint
  returning * into v_access_event;

  return jsonb_build_object(
    'id', v_access_event.id,
    'publication_event_id', v_access_event.publication_event_id,
    'document_definition_key', v_access_event.document_definition_key,
    'document_id', v_access_event.document_id,
    'recipient_role', v_access_event.recipient_role,
    'event_type', v_access_event.event_type,
    'created_at', v_access_event.created_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_storage_buyer_portal_can_write(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
  with seller_scope as (
    select public.bridge_portal_matter_financial_transaction_id('seller') as transaction_id
  )
  select exists (
    select 1
    from public.client_portal_links link
    where link.is_active = true
      and (link.expires_at is null or link.expires_at>now())
      and link.token = public.bridge_storage_request_header('x-bridge-client-portal-token')
      and (
        (
          coalesce((storage.foldername(p_name))[1], '') = 'client-portal'
          and coalesce((storage.foldername(p_name))[2], '') = link.transaction_id::text
          and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.matter_financial_accounts account
          where account.id::text = coalesce((storage.foldername(p_name))[3], '')
            and account.transaction_id = link.transaction_id
            and account.party_role = case
              when lower(coalesce((storage.foldername(p_name))[2], 'buyer')) in ('seller', 'selling') then 'seller'
              else 'buyer'
            end
            and account.portal_enabled = true
            and account.status = 'active'
            and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-proof'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.matter_financial_document_requests request
          join public.matter_financial_accounts account
            on account.id = request.financial_account_id
          where account.id::text = coalesce((storage.foldername(p_name))[3], '')
            and request.id::text = coalesce((storage.foldername(p_name))[4], '')
            and account.transaction_id = link.transaction_id
            and request.transaction_id = link.transaction_id
            and account.party_role = case
              when lower(coalesce((storage.foldername(p_name))[2], 'buyer')) in ('seller', 'selling') then 'seller'
              else 'buyer'
            end
            and account.portal_enabled = true
            and account.status = 'active'
            and request.portal_visible = true
            and request.request_status not in ('complete', 'cancelled')
            and request.audience_role <> 'internal'
            and (request.audience_role = account.party_role or request.audience_role in ('client', 'shared'))
            and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-request-documents'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.client_issues issue
          where issue.id::text = coalesce((storage.foldername(p_name))[2], '')
            and issue.transaction_id = link.transaction_id
            and coalesce((storage.foldername(p_name))[1], '') = 'client-issues'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.alteration_requests alteration
          where alteration.id::text = coalesce((storage.foldername(p_name))[2], '')
            and alteration.transaction_id = link.transaction_id
            and coalesce((storage.foldername(p_name))[1], '') = 'alteration-requests'
            and coalesce(storage.filename(p_name), '') <> ''
        )
      )
  )
  or exists (
    select 1
    from seller_scope
    join public.matter_financial_accounts account
      on account.transaction_id = seller_scope.transaction_id
    where seller_scope.transaction_id is not null
      and account.id::text = coalesce((storage.foldername(p_name))[3], '')
      and account.party_role = 'seller'
      and account.portal_enabled = true
      and account.status = 'active'
      and coalesce((storage.foldername(p_name))[2], '') in ('seller', 'selling')
      and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-proof'
      and coalesce(storage.filename(p_name), '') <> ''
  )
  or exists (
    select 1
    from seller_scope
    join public.matter_financial_accounts account
      on account.transaction_id = seller_scope.transaction_id
    join public.matter_financial_document_requests request
      on request.financial_account_id = account.id
    where seller_scope.transaction_id is not null
      and account.id::text = coalesce((storage.foldername(p_name))[3], '')
      and request.id::text = coalesce((storage.foldername(p_name))[4], '')
      and request.transaction_id = seller_scope.transaction_id
      and account.party_role = 'seller'
      and account.portal_enabled = true
      and account.status = 'active'
      and request.portal_visible = true
      and request.request_status not in ('complete', 'cancelled')
      and request.audience_role <> 'internal'
      and (request.audience_role = account.party_role or request.audience_role in ('client', 'shared'))
      and coalesce((storage.foldername(p_name))[2], '') in ('seller', 'selling')
      and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-request-documents'
      and coalesce(storage.filename(p_name), '') <> ''
  )
  or exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.is_active = true
      and onboarding.token = public.bridge_storage_request_header('x-bridge-onboarding-token')
      and coalesce((storage.foldername(p_name))[1], '') = 'onboarding'
      and coalesce((storage.foldername(p_name))[2], '') = onboarding.transaction_id::text
      and coalesce((storage.foldername(p_name))[3], '') <> ''
      and coalesce(storage.filename(p_name), '') <> ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_storage_buyer_portal_can_read(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
  select exists (
    select 1
    from public.client_portal_links link
    where link.is_active = true
      and (link.expires_at is null or link.expires_at>now())
      and link.token = public.bridge_storage_request_header('x-bridge-client-portal-token')
      and (
        public.bridge_storage_buyer_portal_can_write(p_name)
        or exists (
          select 1
          from public.documents document
          where document.transaction_id = link.transaction_id
            and document.file_path = p_name
            and coalesce(document.file_bucket, 'documents') = 'documents'
            and (
              coalesce(document.is_client_visible, false)
              or lower(coalesce(document.visibility_scope, '')) in ('shared', 'client')
            )
        )
      )
  )
  or exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.is_active = true
      and onboarding.token = public.bridge_storage_request_header('x-bridge-onboarding-token')
      and (
        (
          coalesce((storage.foldername(p_name))[1], '') = 'onboarding'
          and coalesce((storage.foldername(p_name))[2], '') = onboarding.transaction_id::text
          and coalesce((storage.foldername(p_name))[3], '') <> ''
          and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.documents document
          where document.transaction_id = onboarding.transaction_id
            and document.file_path = p_name
            and coalesce(document.file_bucket, 'documents') = 'documents'
            and (
              coalesce(document.is_client_visible, false)
              or lower(coalesce(document.visibility_scope, '')) in ('shared', 'client')
            )
        )
      )
  );
$function$
;

create or replace function public.bridge_revoke_bond_originator_portal_link(
  p_access_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'An authenticated bond originator is required.' using errcode = '42501';
  end if;

  select link.* into v_link
  from public.bond_application_portal_access_links link
  where link.id = p_access_link_id
    and exists (
      select 1
      from public.transaction_bond_application_export_packages package
      join public.transaction_bond_originator_workspace_assignments assignment
        on assignment.export_package_id = package.id
      where package.bond_application_id = link.bond_application_id
        and package.destination_key = 'bond_originator_intake'
        and package.status not in ('cancelled', 'superseded')
        and assignment.assigned_to_profile_id = auth.uid()
        and assignment.status in ('assigned', 'accepted')
    )
  for update;
  if not found then
    raise exception 'You cannot revoke this application access link.' using errcode = '42501';
  end if;

  update public.bond_application_portal_access_links
  set revoked_at = coalesce(revoked_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'revokedBy', 'bond_originator_action_centre',
        'revokedByOriginatorProfileId', auth.uid()
      )
  where id = v_link.id
  returning * into v_link;

  return jsonb_build_object('accessLinkId', v_link.id, 'revokedAt', v_link.revoked_at);
end;
$$;


create or replace function public.bridge_bond_originator_document_continuity()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('version', 'bond_application_portal_phase6', 'items', coalesce(jsonb_agg(
    jsonb_build_object(
      'exportPackageId', package.id,
      'bondApplicationId', package.bond_application_id,
      'summary', coalesce(summary.value, jsonb_build_object('total', 0, 'linked', 0, 'outstanding', 0, 'awaitingReview', 0))
    ) order by package.created_at desc
  ), '[]'::jsonb))
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package on package.id = assignment.export_package_id
  left join lateral (
    select jsonb_build_object(
      'total', count(distinct requirement.id)::integer,
      'linked', count(distinct requirement.id) filter (where requirement.linked_document_id is not null)::integer,
      'outstanding', count(distinct requirement.id) filter (where requirement.status = 'active')::integer,
      'awaitingReview', count(distinct request.id) filter (where request.status = 'awaiting_review')::integer
    ) as value
    from public.bond_application_document_requirements requirement
    left join public.transaction_bond_originator_document_requests request
      on request.bond_application_id = requirement.bond_application_id
      and (request.requirement_key = requirement.requirement_key or request.canonical_document_type = requirement.canonical_document_type)
    where requirement.bond_application_id = package.bond_application_id
      and requirement.status not in ('inactive', 'superseded')
  ) summary on true
  where assignment.assigned_to_profile_id = auth.uid()
    and assignment.status in ('assigned', 'accepted')
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded');
$$;


revoke all on function public.bridge_revoke_bond_originator_portal_link(uuid) from public, anon;

grant execute on function public.bridge_revoke_bond_originator_portal_link(uuid) to authenticated;

revoke all on function public.bridge_bond_originator_document_continuity() from public, anon;

grant execute on function public.bridge_bond_originator_document_continuity() to authenticated;

commit;
