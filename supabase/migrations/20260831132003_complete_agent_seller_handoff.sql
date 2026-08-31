begin;

-- Private-sale creation used to rely on several best-effort triggers.  This
-- command turns the seller side into a single, verifiable creation step.  It
-- is deliberately unavailable to anonymous portal sessions: only an internal
-- actor who can access the transaction (or the service role) may run it.
create or replace function public.bridge_verify_private_transaction_seller_handoff(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_listing public.private_listings%rowtype;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_context public.client_portal_contexts%rowtype;
  v_promotion jsonb := '{}'::jsonb;
  v_eligible_documents integer := 0;
  v_promoted_documents integer := 0;
  v_required_documents integer := 0;
  v_satisfied_requirements integer := 0;
  v_now timestamptz := now();
  v_token text;
begin
  if p_transaction_id is null then
    raise exception using errcode = '22023', message = 'Transaction id is required.';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Transaction was not found.';
  end if;

  if coalesce(v_transaction.transaction_type, '') <> 'private_property' then
    raise exception using errcode = '22023', message = 'Seller handoff applies only to private-property transactions.';
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.bridge_can_access_transaction_spine(v_transaction.id) then
    raise exception using errcode = '42501', message = 'Transaction access denied.';
  end if;

  if v_transaction.organisation_id is null then
    raise exception using errcode = '23502', message = 'A private transaction must belong to an organisation before seller setup.';
  end if;

  if v_transaction.listing_id is null then
    insert into public.private_listings (
      organisation_id,
      assigned_agent_id,
      listing_reference,
      listing_status,
      listing_visibility,
      title,
      property_type,
      property_category,
      asking_price,
      address_line_1,
      address_line_2,
      suburb,
      city,
      province,
      postal_code,
      seller_type,
      seller_onboarding_status,
      is_active,
      created_by,
      seller_canonical_facts_json,
      updated_at
    ) values (
      v_transaction.organisation_id,
      coalesce(v_transaction.assigned_agent_id, v_transaction.assigned_user_id),
      'TX-' || left(v_transaction.id::text, 8),
      'onboarding_sent',
      'internal',
      coalesce(nullif(trim(v_transaction.property_description), ''), nullif(trim(v_transaction.property_address_line_1), ''), 'Private property sale'),
      v_transaction.property_type,
      v_transaction.property_type,
      coalesce(v_transaction.purchase_price, v_transaction.sales_price),
      v_transaction.property_address_line_1,
      v_transaction.property_address_line_2,
      v_transaction.suburb,
      v_transaction.city,
      v_transaction.province,
      v_transaction.postal_code,
      'individual',
      'sent',
      false,
      coalesce(v_transaction.created_by, auth.uid()),
      jsonb_strip_nulls(jsonb_build_object(
        'sellerName', v_transaction.seller_name,
        'sellerEmail', v_transaction.seller_email,
        'sellerPhone', v_transaction.seller_phone
      )),
      v_now
    ) returning * into v_listing;

    update public.transactions
       set listing_id = v_listing.id,
           updated_at = v_now
     where id = v_transaction.id;
    v_transaction.listing_id := v_listing.id;
  else
    select * into v_listing
    from public.private_listings
    where id = v_transaction.listing_id;

    if not found or v_listing.organisation_id is distinct from v_transaction.organisation_id then
      raise exception using errcode = '23503', message = 'The private listing does not belong to this transaction organisation.';
    end if;
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where private_listing_id = v_listing.id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1
  for update;

  if not found then
    v_token := 'seller-' || encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.private_listing_seller_onboarding (
      private_listing_id,
      token,
      token_expires_at,
      form_data,
      status,
      seller_type,
      canonical_facts_json,
      seller_portal_link_active,
      seller_portal_link_expires_at,
      updated_at
    ) values (
      v_listing.id,
      v_token,
      v_now + interval '14 days',
      jsonb_strip_nulls(jsonb_build_object(
        'sellerName', v_transaction.seller_name,
        'sellerEmail', lower(nullif(trim(v_transaction.seller_email), '')),
        'sellerPhone', v_transaction.seller_phone
      )),
      'sent',
      coalesce(nullif(v_listing.seller_type, ''), 'individual'),
      jsonb_strip_nulls(jsonb_build_object(
        'sellerName', v_transaction.seller_name,
        'sellerEmail', lower(nullif(trim(v_transaction.seller_email), '')),
        'sellerPhone', v_transaction.seller_phone
      )),
      true,
      v_now + interval '14 days',
      v_now
    ) returning * into v_onboarding;
  else
    update public.private_listing_seller_onboarding
       set form_data = coalesce(form_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
             'sellerName', coalesce(nullif(form_data ->> 'sellerName', ''), v_transaction.seller_name),
             'sellerEmail', coalesce(nullif(form_data ->> 'sellerEmail', ''), lower(nullif(trim(v_transaction.seller_email), ''))),
             'sellerPhone', coalesce(nullif(form_data ->> 'sellerPhone', ''), v_transaction.seller_phone)
           )),
           token_expires_at = case when token_expires_at is null or token_expires_at <= v_now then v_now + interval '14 days' else token_expires_at end,
           seller_portal_link_active = true,
           seller_portal_link_expires_at = case
             when seller_portal_link_expires_at is null or seller_portal_link_expires_at <= v_now then v_now + interval '14 days'
             else seller_portal_link_expires_at
           end,
           updated_at = v_now
     where id = v_onboarding.id
     returning * into v_onboarding;
  end if;

  update public.private_listings
     set seller_onboarding_status = case
           when v_onboarding.status = 'completed' then 'completed'
           when v_onboarding.status = 'in_progress' then 'in_progress'
           else 'sent'
         end,
         listing_status = case when listing_status = 'seller_lead' then 'onboarding_sent' else listing_status end,
         updated_at = v_now
   where id = v_listing.id;

  if not public.bridge_sync_seller_portal_transaction_context(v_transaction.id) then
    raise exception using errcode = 'P0001', message = 'Seller portal context could not be linked to the transaction.';
  end if;

  select * into v_context
  from public.client_portal_contexts
  where context_type = 'selling'
    and listing_id = v_listing.id::text
    and seller_workspace_token = v_onboarding.token
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if not found or v_context.transaction_id is distinct from v_transaction.id then
    raise exception using errcode = 'P0001', message = 'Seller portal context is not linked to the new transaction.';
  end if;

  -- The seller portal is listing-scoped, while the source of truth is now the
  -- transaction requirement instance.  Materialise only a portal projection;
  -- the promoter below resolves the matching transaction instance by key.
  insert into public.private_listing_document_requirements (
    private_listing_id,
    requirement_key,
    requirement_name,
    requirement_description,
    requirement_group,
    document_visibility,
    status,
    is_required,
    generated_from,
    updated_at
  )
  select
    v_listing.id,
    canonical.document_definition_key,
    coalesce(nullif(definition.display_label, ''), initcap(replace(canonical.document_definition_key, '_', ' '))),
    definition.description,
    case
      when canonical.document_definition_key ~* '(identity|id_|passport)' then 'seller_identity'
      when canonical.document_definition_key ~* '(fica|address)' then 'fica'
      when canonical.document_definition_key ~* '(marriage|spouse|antenuptial)' then 'marital'
      when canonical.document_definition_key ~* '(company|director|cipc)' then 'company'
      when canonical.document_definition_key ~* '(trust|trustee)' then 'trust'
      when canonical.document_definition_key ~* '(bank|bond|financial|tax)' then 'financial'
      when canonical.document_definition_key ~* '(mandate)' then 'mandate'
      when canonical.document_definition_key ~* '(compliance|consent)' then 'compliance'
      when canonical.document_definition_key ~* '(photo|marketing)' then 'marketing'
      else 'property'
    end,
    'seller_visible',
    'required',
    true,
    jsonb_build_object(
      'source', 'transaction_requirement_projection',
      'transactionId', v_transaction.id,
      'transactionRequirementInstanceId', canonical.id
    ),
    v_now
  from public.document_requirement_instances canonical
  left join public.document_definitions definition
    on definition.key = canonical.document_definition_key
  where canonical.transaction_id = v_transaction.id
    and canonical.context_type = 'transaction'
    and canonical.context_id = v_transaction.id
    and canonical.status <> 'not_applicable'
    and (
      lower(coalesce(canonical.requested_from_role, '')) = 'seller'
      or 'seller' = any(coalesce(canonical.uploadable_by_roles, '{}'::text[]))
    )
    and not exists (
      select 1
      from public.private_listing_document_requirements existing
      where existing.private_listing_id = v_listing.id
        and existing.requirement_key = canonical.document_definition_key
    )
  on conflict do nothing;

  v_promotion := public.bridge_promote_pending_private_listing_documents(v_listing.id);

  select count(*)::integer into v_eligible_documents
  from public.private_listing_documents source_document
  where source_document.private_listing_id = v_listing.id
    and nullif(trim(coalesce(source_document.storage_path, source_document.file_url, '')), '') is not null
    and source_document.status in ('uploaded', 'under_review', 'approved', 'completed');

  select count(*)::integer into v_promoted_documents
  from public.private_listing_documents source_document
  join public.documents promoted_document
    on promoted_document.id = source_document.promoted_document_id
   and promoted_document.transaction_id = v_transaction.id
   and promoted_document.source = 'seller_portal'
   and promoted_document.source_document_id = source_document.id
  where source_document.private_listing_id = v_listing.id
    and nullif(trim(coalesce(source_document.storage_path, source_document.file_url, '')), '') is not null
    and source_document.status in ('uploaded', 'under_review', 'approved', 'completed');

  if v_promoted_documents <> v_eligible_documents then
    raise exception using errcode = 'P0001', message = 'One or more seller uploads did not promote into transaction documents.';
  end if;

  select count(*)::integer into v_required_documents
  from public.private_listing_documents source_document
  left join public.private_listing_document_requirements source_requirement
    on source_requirement.id = source_document.requirement_id
  where source_document.private_listing_id = v_listing.id
    and nullif(trim(coalesce(source_document.storage_path, source_document.file_url, '')), '') is not null
    and source_document.status in ('uploaded', 'under_review', 'approved', 'completed')
    and (coalesce(source_requirement.is_required, false) or source_document.canonical_requirement_instance_id is not null);

  select count(*)::integer into v_satisfied_requirements
  from public.private_listing_documents source_document
  left join public.private_listing_document_requirements source_requirement
    on source_requirement.id = source_document.requirement_id
  join public.documents promoted_document
    on promoted_document.id = source_document.promoted_document_id
   and promoted_document.transaction_id = v_transaction.id
  join public.document_requirement_instances canonical
    on canonical.id = promoted_document.canonical_requirement_instance_id
   and canonical.transaction_id = v_transaction.id
   and canonical.context_type = 'transaction'
   and canonical.context_id = v_transaction.id
   and canonical.satisfied_by_document_id = promoted_document.id
   and canonical.status in ('uploaded', 'under_review', 'approved', 'completed')
  where source_document.private_listing_id = v_listing.id
    and nullif(trim(coalesce(source_document.storage_path, source_document.file_url, '')), '') is not null
    and source_document.status in ('uploaded', 'under_review', 'approved', 'completed')
    and (coalesce(source_requirement.is_required, false) or source_document.canonical_requirement_instance_id is not null);

  if v_satisfied_requirements <> v_required_documents then
    raise exception using errcode = 'P0001', message = 'One or more promoted seller uploads did not satisfy a canonical seller requirement.';
  end if;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, created_at, updated_at
  ) values (
    v_transaction.id,
    'SellerHandoffVerified',
    jsonb_build_object(
      'source', 'private_transaction_creation',
      'listingId', v_listing.id,
      'sellerOnboardingId', v_onboarding.id,
      'portalContextId', v_context.id,
      'eligibleUploadCount', v_eligible_documents,
      'promotedUploadCount', v_promoted_documents,
      'satisfiedRequirementCount', v_satisfied_requirements
    ),
    auth.uid(),
    'agent',
    'internal',
    v_now,
    v_now
  );

  return jsonb_build_object(
    'verified', true,
    'transactionId', v_transaction.id,
    'privateListingId', v_listing.id,
    'sellerOnboardingId', v_onboarding.id,
    'sellerOnboardingToken', v_onboarding.token,
    'sellerPortalToken', v_onboarding.seller_portal_token,
    'sellerPortalContextId', v_context.id,
    'eligibleUploadCount', v_eligible_documents,
    'promotedUploadCount', v_promoted_documents,
    'requiredSellerUploadCount', v_required_documents,
    'satisfiedSellerRequirementCount', v_satisfied_requirements,
    'promotion', coalesce(v_promotion, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.bridge_verify_private_transaction_seller_handoff(uuid) from public, anon;
grant execute on function public.bridge_verify_private_transaction_seller_handoff(uuid) to authenticated, service_role;

commit;
