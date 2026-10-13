-- Seller-entered disclosure answers update only the unsigned disclosure copy.
-- Other pack documents and their signatures remain frozen.
create function public.bridge_update_seller_portal_disclosure_answers(
  p_token_hash text,
  p_expected_version_digest text,
  p_disclosure jsonb,
  p_reviewed_html text
)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_recipient public.private_listing_seller_portal_signing_recipients%rowtype;
  v_document public.private_listing_seller_portal_signing_documents%rowtype;
  v_content_digest text;
  v_version_digest text;
begin
  select * into v_recipient from public.private_listing_seller_portal_signing_recipients
    where token_hash = p_token_hash for update;
  if not found or v_recipient.status not in ('pending', 'viewed') or v_recipient.expires_at <= now() then
    raise exception 'This signer link is unavailable or expired.' using errcode = 'P0001';
  end if;
  select * into v_document from public.private_listing_seller_portal_signing_documents
    where id = v_recipient.signing_document_id for update;
  if not found or v_document.document_key <> 'signed_disclosure_form'
    or v_document.status <> 'sent' or v_document.version_digest is distinct from p_expected_version_digest
    or exists (select 1 from public.private_listing_seller_portal_signature_evidence
      where signing_document_id = v_document.id) then
    raise exception 'Reload the latest unsigned disclosure before changing it.' using errcode = 'P0001';
  end if;
  if coalesce(jsonb_typeof(p_disclosure), '') <> 'object'
    or coalesce(jsonb_typeof(p_disclosure->'responses'), '') <> 'object'
    or length(coalesce(p_reviewed_html, '')) < 100 then
    raise exception 'Invalid disclosure answers or signing copy.' using errcode = '22023';
  end if;
  v_content_digest := 'sha256:' || encode(extensions.digest(convert_to(p_reviewed_html, 'UTF8'), 'sha256'), 'hex');
  v_version_digest := 'sha256:' || encode(extensions.digest(
    convert_to(v_document.source_version_digest || ':' || v_content_digest, 'UTF8'), 'sha256'), 'hex');
  perform set_config('app.seller_portal_correction', 'true', true);
  update public.private_listing_seller_portal_signing_documents
    set seller_corrections = jsonb_set(seller_corrections, '{disclosure}', p_disclosure),
        reviewed_html = p_reviewed_html, content_digest = v_content_digest, version_digest = v_version_digest
    where id = v_document.id;
  return jsonb_build_object('versionDigest', v_version_digest);
end;
$$;

revoke execute on function public.bridge_update_seller_portal_disclosure_answers(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.bridge_update_seller_portal_disclosure_answers(text, text, jsonb, text)
  to service_role;
