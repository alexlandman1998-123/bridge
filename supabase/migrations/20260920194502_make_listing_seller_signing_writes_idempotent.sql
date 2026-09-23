-- Signing submissions are retried by browsers, proxies, and users after a
-- response timeout. Treat the signing session + canonical document type as
-- the idempotency key and return the committed result on replay.
create unique index if not exists private_listing_documents_signing_session_document_unique
  on public.private_listing_documents (signing_session_id, document_type)
  where signing_session_id is not null;

create or replace function public.complete_private_listing_seller_signing_pack(
  p_session_id uuid,
  p_signed_name text,
  p_signature text,
  p_acceptance_ip text,
  p_acceptance_user_agent text,
  p_generated_documents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_document_key text;
  v_document_type text;
  v_title text;
  v_generated_html text;
  v_mandate_type text;
  v_signed_at timestamptz := now();
  v_progress jsonb := '{}'::jsonb;
  v_group_complete boolean := true;
  v_portal_workspace jsonb := '{}'::jsonb;
  v_acknowledgements jsonb := coalesce(p_generated_documents -> '__acknowledgements', '{}'::jsonb);
begin
  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'This signing link is invalid.';
  end if;

  -- A committed signature is a successful replay, not an expired-link error.
  -- Return the immutable result without rewriting documents, audit events, or
  -- the seller portal workspace.
  if v_session.status = 'signed' then
    if v_session.signing_group_id is not null then
      select not exists (
        select 1
        from public.private_listing_mandate_signing_sessions
        where signing_group_id = v_session.signing_group_id
          and status <> 'signed'
      ) into v_group_complete;
    end if;
    return jsonb_build_object(
      'signedAt', v_session.signed_at,
      'complete', true,
      'groupComplete', v_group_complete,
      'sellerPortalWorkspace', jsonb_build_object('prepared', v_group_complete, 'idempotentReplay', true),
      'progress', coalesce(v_session.document_progress, '{}'::jsonb),
      'acknowledgements', coalesce(v_session.signing_acknowledgements, '{}'::jsonb),
      'idempotentReplay', true
    );
  end if;

  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception 'This signing link has expired or is no longer active.';
  end if;
  if coalesce(jsonb_array_length(v_session.selected_documents), 0) = 0 then
    raise exception 'This signing pack contains no documents.';
  end if;
  if coalesce(p_signed_name, '') = '' or coalesce(p_signature, '') = '' then
    raise exception 'A full name and signature are required.';
  end if;
  if jsonb_typeof(v_acknowledgements) <> 'object'
    or coalesce(v_acknowledgements ->> 'electronicSignature', '') <> 'true' then
    raise exception 'Confirm electronic signing before submitting.';
  end if;

  v_mandate_type := lower(coalesce(
    nullif(trim(v_session.signing_pack_snapshot -> 'mandate' ->> 'mandateType'), ''),
    nullif(trim(v_session.mandate_snapshot ->> 'mandateType'), ''),
    'sole'
  ));
  v_progress := coalesce(v_session.document_progress, '{}'::jsonb);

  for v_document_key in select jsonb_array_elements_text(v_session.selected_documents)
  loop
    if v_document_key not in ('disclosure', 'fica', 'mandate') then
      raise exception 'That document is not included in this signing pack.';
    end if;
    if coalesce(v_acknowledgements -> 'acceptedDocuments' ->> v_document_key, '') <> 'true' then
      raise exception 'Review and accept the % document before submitting.', v_document_key;
    end if;
    v_generated_html := nullif(p_generated_documents ->> v_document_key, '');
    if v_generated_html is null then
      raise exception 'The frozen % document could not be prepared.', v_document_key;
    end if;
    v_document_type := case v_document_key
      when 'disclosure' then 'signed_disclosure_form'
      when 'fica' then 'signed_fica_declaration'
      else 'signed_mandate'
    end;
    v_title := case
      when v_document_key = 'disclosure' then 'Property condition disclosure'
      when v_document_key = 'fica' then 'Seller FICA declaration'
      when v_mandate_type = 'dual' then 'Dual mandate'
      when v_mandate_type = 'tri' then 'Tri mandate'
      when v_mandate_type = 'open' then 'Open mandate'
      else 'Sole mandate'
    end;

    select * into v_requirement
    from public.private_listing_document_requirements
    where private_listing_id = v_session.private_listing_id
      and coalesce(status, 'required') not in ('not_applicable', 'cancelled')
      and lower(requirement_key) like case
        when v_document_key = 'disclosure' then '%disclosure%'
        else '%' || v_document_key || '%'
      end
    order by created_at asc
    limit 1;

    insert into public.private_listing_documents (
      private_listing_id, requirement_id, document_type, category, document_name,
      generated_html, generated_file_name, signing_session_id, status, visibility, uploaded_at
    ) values (
      v_session.private_listing_id, v_requirement.id, v_document_type, v_title,
      'Signed ' || v_title || '.html', v_generated_html, 'signed-' || v_document_key || '.html',
      v_session.id, 'completed', 'seller_visible', v_signed_at
    )
    on conflict (signing_session_id, document_type)
      where signing_session_id is not null
    do update set signing_session_id = excluded.signing_session_id
    returning * into v_document;

    -- If an active legacy session already has this idempotency key, it must be
    -- the same frozen artefact. Never overwrite signed legal content.
    if v_document.generated_html is distinct from v_generated_html then
      raise exception 'The existing signed % document does not match this signing submission.', v_document_key;
    end if;

    if v_requirement.id is not null then
      update public.private_listing_document_requirements
      set status = 'completed', updated_at = v_signed_at
      where id = v_requirement.id and status is distinct from 'completed';
    end if;

    v_progress := v_progress || jsonb_build_object(v_document_key, jsonb_build_object(
      'signedAt', coalesce(v_document.uploaded_at, v_signed_at),
      'signedName', nullif(trim(p_signed_name), ''),
      'signature', nullif(trim(p_signature), '')
    ));

    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
    )
    select
      v_session.private_listing_id,
      'seller_document_signed',
      v_title || ' signed',
      coalesce(nullif(trim(p_signed_name), ''), v_session.signer_name) || ' signed the ' || lower(v_title) || ' as part of one secure signing pack.',
      'internal',
      jsonb_build_object(
        'signingSessionId', v_session.id,
        'signingGroupId', v_session.signing_group_id,
        'documentId', v_document.id,
        'documentKey', v_document_key,
        'signedAt', coalesce(v_document.uploaded_at, v_signed_at)
      )
    where not exists (
      select 1
      from public.private_listing_activity activity
      where activity.private_listing_id = v_session.private_listing_id
        and activity.activity_type = 'seller_document_signed'
        and activity.metadata ->> 'signingSessionId' = v_session.id::text
        and activity.metadata ->> 'documentKey' = v_document_key
    );
  end loop;

  v_acknowledgements := v_acknowledgements || jsonb_build_object(
    'contract', 'seller_signing_acknowledgements_v1',
    'recordedAt', v_signed_at
  );
  update public.private_listing_mandate_signing_sessions
  set document_progress = v_progress,
      signing_acknowledgements = v_acknowledgements,
      status = 'signed',
      signed_at = v_signed_at,
      used_at = v_signed_at,
      signed_name = nullif(trim(p_signed_name), ''),
      signature = nullif(trim(p_signature), ''),
      acceptance_ip = nullif(trim(p_acceptance_ip), ''),
      acceptance_user_agent = nullif(trim(p_acceptance_user_agent), ''),
      updated_at = v_signed_at
  where id = v_session.id and status = 'active';

  if v_session.signing_group_id is not null then
    select not exists (
      select 1
      from public.private_listing_mandate_signing_sessions
      where signing_group_id = v_session.signing_group_id
        and status <> 'signed'
    ) into v_group_complete;
  end if;
  if v_session.selected_documents ? 'mandate' and v_group_complete then
    update public.private_listings
    set mandate_status = 'signed', listing_status = 'mandate_signed'
    where id = v_session.private_listing_id
      and (mandate_status is distinct from 'signed' or listing_status is distinct from 'mandate_signed');
  end if;
  if v_group_complete then
    v_portal_workspace := public.bridge_prepare_listing_seller_portal_workspace(v_session.id);
  end if;

  return jsonb_build_object(
    'signedAt', v_signed_at,
    'complete', true,
    'groupComplete', v_group_complete,
    'sellerPortalWorkspace', v_portal_workspace,
    'progress', v_progress,
    'acknowledgements', v_acknowledgements,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.complete_private_listing_seller_signing_pack(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_private_listing_seller_signing_pack(uuid, text, text, text, text, jsonb)
  to service_role;

create or replace function public.complete_private_listing_seller_document_signing(
  p_session_id uuid,
  p_document_key text,
  p_signed_name text,
  p_signature text,
  p_acceptance_ip text,
  p_acceptance_user_agent text,
  p_generated_html text,
  p_generated_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_document_key text := lower(nullif(trim(coalesce(p_document_key, '')), ''));
  v_document_type text;
  v_title text;
  v_progress jsonb;
  v_next_progress jsonb;
  v_signed_at timestamptz := now();
  v_complete boolean;
begin
  if v_document_key not in ('disclosure', 'fica', 'mandate') then
    raise exception 'That document is not included in this link.';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'This signing link is invalid.';
  end if;
  if not (v_session.selected_documents ? v_document_key) then
    raise exception 'That document is not included in this link.';
  end if;

  v_progress := coalesce(v_session.document_progress, '{}'::jsonb);
  if v_progress ? v_document_key then
    return jsonb_build_object(
      'signedAt', v_progress -> v_document_key ->> 'signedAt',
      'complete', v_session.status = 'signed',
      'progress', v_progress,
      'idempotentReplay', true
    );
  end if;
  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception 'This signing link has expired or is no longer active.';
  end if;

  v_document_type := case v_document_key
    when 'disclosure' then 'signed_disclosure_form'
    when 'fica' then 'signed_fica_declaration'
    else 'signed_mandate'
  end;
  v_title := case v_document_key
    when 'disclosure' then 'Property condition disclosure'
    when 'fica' then 'FICA declaration'
    else 'Exclusive mandate'
  end;

  select * into v_requirement
  from public.private_listing_document_requirements
  where private_listing_id = v_session.private_listing_id
    and lower(requirement_key) like case
      when v_document_key = 'disclosure' then '%disclosure%'
      else '%' || v_document_key || '%'
    end
  order by created_at asc
  limit 1;

  insert into public.private_listing_documents (
    private_listing_id, requirement_id, document_type, category, document_name,
    generated_html, generated_file_name, signing_session_id, status, visibility, uploaded_at
  ) values (
    v_session.private_listing_id, v_requirement.id, v_document_type, v_title,
    'Signed ' || v_title || '.html', p_generated_html, p_generated_file_name,
    v_session.id, 'completed', 'seller_visible', v_signed_at
  )
  on conflict (signing_session_id, document_type)
    where signing_session_id is not null
  do update set signing_session_id = excluded.signing_session_id
  returning * into v_document;

  if v_document.generated_html is distinct from p_generated_html then
    raise exception 'The existing signed % document does not match this signing submission.', v_document_key;
  end if;

  if v_requirement.id is not null then
    update public.private_listing_document_requirements
    set status = 'completed', updated_at = v_signed_at
    where id = v_requirement.id and status is distinct from 'completed';
  end if;

  v_next_progress := v_progress || jsonb_build_object(v_document_key, jsonb_build_object(
    'signedAt', coalesce(v_document.uploaded_at, v_signed_at),
    'signedName', nullif(trim(p_signed_name), ''),
    'signature', nullif(trim(p_signature), '')
  ));
  v_complete := not exists (
    select 1
    from jsonb_array_elements_text(v_session.selected_documents) as selected(document_key)
    where not (v_next_progress ? selected.document_key)
  );

  update public.private_listing_mandate_signing_sessions
  set document_progress = v_next_progress,
      status = case when v_complete then 'signed' else 'active' end,
      signed_at = case when v_complete then v_signed_at else null end,
      used_at = case when v_complete then v_signed_at else null end,
      signed_name = case when v_complete then nullif(trim(p_signed_name), '') else null end,
      signature = case when v_complete then nullif(trim(p_signature), '') else null end,
      acceptance_ip = nullif(trim(p_acceptance_ip), ''),
      acceptance_user_agent = nullif(trim(p_acceptance_user_agent), ''),
      updated_at = v_signed_at
  where id = v_session.id and status = 'active';

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
  )
  select
    v_session.private_listing_id,
    'seller_document_signed',
    v_title || ' signed',
    coalesce(nullif(trim(p_signed_name), ''), v_session.signer_name) || ' signed the ' || lower(v_title) || ' using a secure seller document link.',
    'internal',
    jsonb_build_object(
      'signingSessionId', v_session.id,
      'documentId', v_document.id,
      'documentKey', v_document_key,
      'signedAt', coalesce(v_document.uploaded_at, v_signed_at)
    )
  where not exists (
    select 1
    from public.private_listing_activity activity
    where activity.private_listing_id = v_session.private_listing_id
      and activity.activity_type = 'seller_document_signed'
      and activity.metadata ->> 'signingSessionId' = v_session.id::text
      and activity.metadata ->> 'documentKey' = v_document_key
  );

  if v_document_key = 'mandate' then
    update public.private_listings
    set mandate_status = 'signed', listing_status = 'mandate_signed'
    where id = v_session.private_listing_id
      and (mandate_status is distinct from 'signed' or listing_status is distinct from 'mandate_signed');
  end if;

  return jsonb_build_object(
    'signedAt', v_signed_at,
    'complete', v_complete,
    'progress', v_next_progress,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.complete_private_listing_seller_document_signing(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_private_listing_seller_document_signing(uuid, text, text, text, text, text, text, text)
  to service_role;

comment on function public.complete_private_listing_seller_signing_pack(uuid, text, text, text, text, jsonb) is
  'Idempotently completes a frozen seller signing pack using signing_session_id + document_type as the immutable write key.';

comment on function public.complete_private_listing_seller_document_signing(uuid, text, text, text, text, text, text, text) is
  'Idempotently completes one legacy seller document signing step and returns the committed result on replay.';
