-- Complete one selected seller document and persist its signed HTML record in
-- one transaction. This prevents a completed signing state without its listing
-- document (or the reverse) if a request is interrupted.
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

  if not found or v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception 'This signing link has expired or has already been used.';
  end if;
  if not (v_session.selected_documents ? v_document_key) then
    raise exception 'That document is not included in this link.';
  end if;

  v_progress := coalesce(v_session.document_progress, '{}'::jsonb);
  if v_progress ? v_document_key then
    raise exception 'This document has already been signed.';
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
    and lower(requirement_key) like case when v_document_key = 'disclosure' then '%disclosure%' else '%' || v_document_key || '%' end
  order by created_at asc
  limit 1;

  insert into public.private_listing_documents (
    private_listing_id, requirement_id, document_type, category, document_name,
    generated_html, generated_file_name, signing_session_id, status, visibility, uploaded_at
  ) values (
    v_session.private_listing_id, v_requirement.id, v_document_type, v_title,
    'Signed ' || v_title || '.html', p_generated_html, p_generated_file_name,
    v_session.id, 'completed', 'internal', v_signed_at
  ) returning * into v_document;

  if v_requirement.id is not null then
    update public.private_listing_document_requirements
    set status = 'completed', updated_at = v_signed_at
    where id = v_requirement.id;
  end if;

  v_next_progress := v_progress || jsonb_build_object(v_document_key, jsonb_build_object(
    'signedAt', v_signed_at,
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
  where id = v_session.id;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
  ) values (
    v_session.private_listing_id, 'seller_document_signed', v_title || ' signed',
    coalesce(nullif(trim(p_signed_name), ''), v_session.signer_name) || ' signed the ' || lower(v_title) || ' using a secure seller document link.',
    'internal', jsonb_build_object('signingSessionId', v_session.id, 'documentId', v_document.id, 'documentKey', v_document_key, 'signedAt', v_signed_at)
  );

  if v_document_key = 'mandate' then
    update public.private_listings
    set mandate_status = 'signed', listing_status = 'mandate_signed'
    where id = v_session.private_listing_id;
  end if;

  return jsonb_build_object('signedAt', v_signed_at, 'complete', v_complete, 'progress', v_next_progress);
end;
$$;

revoke all on function public.complete_private_listing_seller_document_signing(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_private_listing_seller_document_signing(uuid, text, text, text, text, text, text, text) to service_role;
