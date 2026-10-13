-- Queue the rejection outcome through the existing client/seller email dispatcher.
-- Only future review decisions are affected; no old outcomes are replayed.
begin;
create schema if not exists private;

create or replace function private.bridge_queue_seller_document_rejection_email(
  p_listing_id uuid, p_source_document_id uuid, p_document_title text,
  p_reason text, p_signed_copy boolean, p_review_revision integer
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_listing public.private_listings%rowtype;
  v_onboarding jsonb;
  v_portal jsonb;
  v_agent record;
  v_email text;
  v_name text;
  v_token text;
  v_next_action text;
  v_title text := coalesce(nullif(btrim(p_document_title), ''), 'Seller document');
  v_reason text := nullif(btrim(p_reason), '');
begin
  select * into v_listing from public.private_listings where id = p_listing_id;
  if not found then return null; end if;
  select to_jsonb(onboarding) into v_onboarding
    from public.private_listing_seller_onboarding onboarding
    where onboarding.private_listing_id = p_listing_id
    order by onboarding.updated_at desc nulls last limit 1;
  select to_jsonb(portal) into v_portal
    from public.client_portal_contexts portal
    where portal.listing_id = p_listing_id::text
      and portal.context_type = 'selling' and portal.status = 'active'
    order by portal.updated_at desc nulls last limit 1;
  v_email := lower(coalesce(
    nullif(btrim(v_onboarding #>> '{form_data,sellerEmail}'), ''),
    nullif(btrim(v_onboarding #>> '{form_data,email}'), ''),
    nullif(btrim(v_portal ->> 'client_email'), '')
  ));
  if v_email is null then return null; end if;
  v_name := coalesce(
    nullif(btrim(v_onboarding #>> '{form_data,fullName}'), ''),
    nullif(btrim(v_onboarding #>> '{form_data,sellerName}'), ''),
    nullif(btrim(v_portal ->> 'client_name'), '')
  );
  -- Include only a current seller entry link, never a staff listing URL or a
  -- revoked signing link. Session/access tokens are not placed in email payloads.
  if public.bridge_private_listing_seller_portal_link_is_active(
    coalesce(v_onboarding, '{}'::jsonb), to_jsonb(v_listing)
  ) then
    v_token := coalesce(
      nullif(btrim(v_onboarding ->> 'seller_portal_token'), ''),
      nullif(btrim(v_portal ->> 'seller_workspace_token'), ''),
      nullif(btrim(v_onboarding ->> 'token'), '')
    );
  end if;
  v_next_action := case
    when p_signed_copy and v_token is not null then 'Your agent will prepare a corrected copy for signature. Open your seller portal to review the next steps.'
    when p_signed_copy then 'Contact your agent for a corrected copy to sign.'
    when v_token is not null then 'Upload a corrected copy in your seller portal.'
    else 'Contact your agent to provide a corrected copy.'
  end;
  select * into v_agent from public.bridge_client_seller_phase5_profile_contact(v_listing.assigned_agent_id) limit 1;
  return public.bridge_queue_client_seller_portal_event_phase5(
    'client_portal_document_rejected', v_listing.organisation_id, v_email,
    'Document rejected: ' || v_title,
    v_title || ' was rejected.' || case when v_reason is not null then ' Reason: ' || v_reason else '' end,
    'seller-document-rejected:' || case when p_signed_copy then 'signing:' else 'upload:' end
      || p_source_document_id::text || ':v' || coalesce(p_review_revision, 0)::text,
    jsonb_strip_nulls(jsonb_build_object(
      'title', 'Document rejected', 'recipientName', v_name,
      'propertyLabel', public.bridge_client_seller_phase5_listing_label(p_listing_id),
      'sellerName', v_name, 'sellerEmail', v_email,
      'agentName', v_agent.name, 'agentEmail', v_agent.email,
      'portalLabel', 'Seller Portal', 'documentTitle', v_title,
      'documentStatus', 'Rejected', 'documentId', p_source_document_id,
      'documentSource', case when p_signed_copy then 'online_signed' else 'uploaded' end,
      'reviewRevision', coalesce(p_review_revision, 0),
      'reason', v_reason, 'nextAction', v_next_action,
      'sellerPortalToken', v_token, 'ctaLabel', 'Open Seller Portal'
    )),
    'seller', null, null, p_listing_id, null, 'seller_document_rejection'
  );
end;
$$;
revoke all on function private.bridge_queue_seller_document_rejection_email(uuid, uuid, text, text, boolean, integer)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.bridge_queue_seller_document_rejection_email(uuid, uuid, text, text, boolean, integer)
  to service_role;

create or replace function public.bridge_handle_private_listing_document_notifications_phase5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_agent record;
  v_seller_email text;
  v_seller_name text;
  v_property_label text;
  v_document_title text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.file_url is not distinct from new.file_url and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;

  select * into v_listing
  from public.private_listings
  where id = new.private_listing_id
  limit 1;
  if v_listing.id is null then
    return new;
  end if;

  select * into v_requirement
  from public.private_listing_document_requirements
  where id = new.requirement_id
  limit 1;
  select * into v_agent
  from public.bridge_client_seller_phase5_profile_contact(v_listing.assigned_agent_id)
  limit 1;
  select
    lower(nullif(trim(coalesce(onboarding.form_data->>'email', onboarding.form_data->>'sellerEmail')), '')),
    nullif(trim(coalesce(onboarding.form_data->>'fullName', onboarding.form_data->>'sellerName', onboarding.form_data->>'name')), '')
    into v_seller_email, v_seller_name
  from public.private_listing_seller_onboarding onboarding
  where onboarding.private_listing_id = new.private_listing_id
  order by onboarding.updated_at desc nulls last, onboarding.created_at desc
  limit 1;

  v_property_label := public.bridge_client_seller_phase5_listing_label(new.private_listing_id);
  v_document_title := coalesce(nullif(new.document_name, ''), nullif(v_requirement.requirement_name, ''), nullif(new.document_type, ''), 'Client document');

  if new.status in ('uploaded', 'under_review') and (tg_op = 'INSERT' or old.status is distinct from new.status or old.file_url is distinct from new.file_url or old.storage_path is distinct from new.storage_path) then
    perform public.bridge_queue_client_seller_portal_event_phase5(
      'client_portal_document_uploaded',
      v_listing.organisation_id,
      v_agent.email,
      'Client uploaded a document',
      v_document_title || coalesce(' was uploaded for ' || nullif(v_property_label, ''), ' was uploaded.'),
      'client-portal-document-uploaded:' || new.id::text || ':' || coalesce(new.updated_at, new.uploaded_at, now())::text,
      jsonb_strip_nulls(jsonb_build_object(
        'propertyLabel', v_property_label,
        'sellerName', v_seller_name,
        'sellerEmail', v_seller_email,
        'agentName', v_agent.name,
        'agentEmail', v_agent.email,
        'portalLabel', 'Seller Portal',
        'documentTitle', v_document_title,
        'documentStatus', new.status
      )),
      'assigned_user',
      v_agent.user_id,
      null,
      new.private_listing_id,
      null,
      'private_listing_documents'
    );
  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.bridge_queue_seller_document_rejection_email(
      new.private_listing_id, new.id, v_document_title, new.rejection_reason,
      false, coalesce(new.review_revision, 0)
    );
  end if;

  return new;
end;
$$;

create or replace function public.bridge_reject_seller_portal_signed_document(
  p_signing_document_id uuid, p_expected_version_digest text,
  p_reason text, p_reviewer_id uuid
)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_document public.private_listing_seller_portal_signing_documents%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_notification_id uuid;
begin
  if length(v_reason) < 5 or length(v_reason) > 1000 then
    raise exception 'Enter a rejection reason between 5 and 1000 characters.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_reviewer_id) then
    raise exception 'An identified agent must review this document.' using errcode = '22023';
  end if;
  select * into v_document from public.private_listing_seller_portal_signing_documents
    where id = p_signing_document_id for update;
  if not found or v_document.status <> 'signed' or v_document.signed_document_id is not null
    or v_document.version_digest is distinct from p_expected_version_digest then
    raise exception 'This signing request changed. Refresh before rejecting it.' using errcode = '40001';
  end if;
  update public.private_listing_seller_portal_signing_documents
    set status = 'revoked', revoked_at = now(), revoke_reason = 'agent_review_rejected: ' || v_reason
    where id = v_document.id;
  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    performed_by, visibility, metadata
  ) values (
    v_document.private_listing_id, 'seller_document_reject', 'Signed seller document needs correction',
    'A corrected document is required: ' || v_reason, p_reviewer_id, 'client_visible',
    jsonb_build_object('signingDocumentId', v_document.id, 'documentKey', v_document.document_key,
      'versionId', v_document.version_id, 'versionDigest', v_document.version_digest,
      'action', 'reject', 'reason', v_reason, 'signedHistoryPreserved', true)
  );
  v_notification_id := private.bridge_queue_seller_document_rejection_email(
    v_document.private_listing_id, v_document.id,
    case v_document.document_key
      when 'signed_disclosure_form' then 'Mandatory Disclosure / Defects Form'
      when 'signed_fica_declaration' then 'Seller FICA Declaration'
      when 'signed_mandate' then 'Seller Mandate'
      else 'Signed seller document'
    end,
    v_reason, true, 0
  );
  return jsonb_build_object('success', true, 'signingDocumentId', v_document.id,
    'status', 'rejected', 'notificationEventId', v_notification_id,
    'notificationQueued', v_notification_id is not null);
end;
$$;
-- Preserve the existing endpoint permission boundary and review guards.
revoke execute on function public.bridge_reject_seller_portal_signed_document(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_reject_seller_portal_signed_document(uuid, text, text, uuid)
  to service_role;
commit;
