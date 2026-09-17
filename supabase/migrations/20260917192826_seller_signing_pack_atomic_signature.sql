-- One affirmative signature completes every document in the frozen signing pack
-- in one transaction. A partial document set must never be recorded.
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
  v_signed_at timestamptz := now();
  v_progress jsonb := '{}'::jsonb;
begin
  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception 'This signing link has expired or has already been used.';
  end if;
  if coalesce(jsonb_array_length(v_session.selected_documents), 0) = 0 then
    raise exception 'This signing pack contains no documents.';
  end if;
  if coalesce(p_signed_name, '') = '' or coalesce(p_signature, '') = '' then
    raise exception 'A full name and signature are required.';
  end if;

  for v_document_key in select jsonb_array_elements_text(v_session.selected_documents)
  loop
    if v_document_key not in ('disclosure', 'fica', 'mandate') then
      raise exception 'That document is not included in this signing pack.';
    end if;
    v_generated_html := nullif(p_generated_documents ->> v_document_key, '');
    if v_generated_html is null then
      raise exception 'The frozen % document could not be prepared.', v_document_key;
    end if;
    v_document_type := case v_document_key when 'disclosure' then 'signed_disclosure_form' when 'fica' then 'signed_fica_declaration' else 'signed_mandate' end;
    v_title := case v_document_key when 'disclosure' then 'Property condition disclosure' when 'fica' then 'Seller FICA declaration' else 'Exclusive mandate' end;

    select * into v_requirement from public.private_listing_document_requirements
    where private_listing_id = v_session.private_listing_id
      and lower(requirement_key) like case when v_document_key = 'disclosure' then '%disclosure%' else '%' || v_document_key || '%' end
    order by created_at asc limit 1;

    insert into public.private_listing_documents (
      private_listing_id, requirement_id, document_type, category, document_name,
      generated_html, generated_file_name, signing_session_id, status, visibility, uploaded_at
    ) values (
      v_session.private_listing_id, v_requirement.id, v_document_type, v_title,
      'Signed ' || v_title || '.html', v_generated_html, 'signed-' || v_document_key || '.html',
      v_session.id, 'completed', 'internal', v_signed_at
    ) returning * into v_document;

    if v_requirement.id is not null then
      update public.private_listing_document_requirements set status = 'completed', updated_at = v_signed_at where id = v_requirement.id;
    end if;
    v_progress := v_progress || jsonb_build_object(v_document_key, jsonb_build_object('signedAt', v_signed_at, 'signedName', nullif(trim(p_signed_name), ''), 'signature', nullif(trim(p_signature), '')));
    insert into public.private_listing_activity (private_listing_id, activity_type, activity_title, activity_description, visibility, metadata)
    values (v_session.private_listing_id, 'seller_document_signed', v_title || ' signed', coalesce(nullif(trim(p_signed_name), ''), v_session.signer_name) || ' signed the ' || lower(v_title) || ' as part of one secure signing pack.', 'internal', jsonb_build_object('signingSessionId', v_session.id, 'documentId', v_document.id, 'documentKey', v_document_key, 'signedAt', v_signed_at));
  end loop;

  update public.private_listing_mandate_signing_sessions
  set document_progress = v_progress, status = 'signed', signed_at = v_signed_at, used_at = v_signed_at,
      signed_name = nullif(trim(p_signed_name), ''), signature = nullif(trim(p_signature), ''),
      acceptance_ip = nullif(trim(p_acceptance_ip), ''), acceptance_user_agent = nullif(trim(p_acceptance_user_agent), ''), updated_at = v_signed_at
  where id = v_session.id;
  if v_session.selected_documents ? 'mandate' then
    update public.private_listings set mandate_status = 'signed', listing_status = 'mandate_signed' where id = v_session.private_listing_id;
  end if;
  return jsonb_build_object('signedAt', v_signed_at, 'complete', true, 'progress', v_progress);
end;
$$;

revoke all on function public.complete_private_listing_seller_signing_pack(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_private_listing_seller_signing_pack(uuid, text, text, text, text, jsonb) to service_role;
