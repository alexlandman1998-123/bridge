-- Resolve the current PDF for a published quote, never a caller-supplied path.
create or replace function public.bridge_read_buyer_quote_document(p_transaction_id uuid, p_offer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_document public.documents%rowtype;
begin
  if p_transaction_id is null or not coalesce(public.bridge_has_client_portal_token_transaction_access(p_transaction_id),false) then
    raise exception 'Buyer quote access denied' using errcode = '42501';
  end if;
  select d.* into v_document
  from public.transaction_bond_originator_bank_offer_captures o
  join public.transaction_bond_application_export_packages e on e.id=o.export_package_id
  join public.documents d on d.id=o.quote_document_id and d.transaction_id=p_transaction_id
  where o.id=p_offer_id and o.transaction_id=p_transaction_id and e.transaction_id=p_transaction_id
    and e.destination_key='bond_originator_intake' and e.status not in ('cancelled','superseded')
    and o.status in ('published_to_buyer','accepted_by_buyer','declined_by_buyer') and o.published_at is not null
    and document_security.can_read(d);
  if not found or nullif(trim(v_document.file_path),'') is null then
    raise exception 'This quote PDF is not available. Ask your consultant to share it with you.' using errcode='42501';
  end if;
  return jsonb_build_object('id',v_document.id,'name',v_document.name,
    'filePath',v_document.file_path,'fileBucket',coalesce(v_document.file_bucket,'documents'));
end;
$$;
revoke all on function public.bridge_read_buyer_quote_document(uuid,uuid) from public;
grant execute on function public.bridge_read_buyer_quote_document(uuid,uuid) to anon, authenticated;
