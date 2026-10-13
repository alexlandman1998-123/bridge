-- Reject an unaccepted signed copy without changing any signed bytes or evidence.
-- Staff authentication and listing access are checked by the server-only endpoint.
begin;
create function public.bridge_reject_seller_portal_signed_document(
  p_signing_document_id uuid, p_expected_version_digest text,
  p_reason text, p_reviewer_id uuid
)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_document public.private_listing_seller_portal_signing_documents%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
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
  return jsonb_build_object('success', true, 'signingDocumentId', v_document.id, 'status', 'rejected');
end;
$$;
revoke execute on function public.bridge_reject_seller_portal_signed_document(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_reject_seller_portal_signed_document(uuid, text, text, uuid)
  to service_role;
commit;
