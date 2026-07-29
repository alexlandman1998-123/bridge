create or replace function public.bridge_attorney_bond_originator_handoff_view(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_offers jsonb := '[]'::jsonb;
  v_grants jsonb := '[]'::jsonb;
begin
  if p_transaction_id is null then
    return null;
  end if;

  if auth.role() <> 'service_role' and not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this transaction.';
  end if;

  select *
  into v_package
  from public.transaction_bond_application_export_packages package
  where package.transaction_id = p_transaction_id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  order by package.package_ready_at desc nulls last, package.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', offer.id,
        'export_package_id', offer.export_package_id,
        'transaction_id', offer.transaction_id,
        'bond_application_id', offer.bond_application_id,
        'submission_id', offer.submission_id,
        'bank_name', offer.bank_name,
        'offered_amount', offer.offered_amount,
        'status', offer.status,
        'buyer_decision', offer.buyer_decision,
        'buyer_decision_at', offer.buyer_decision_at,
        'linked_bond_quote_id', offer.linked_bond_quote_id,
        'captured_at', offer.captured_at,
        'published_at', offer.published_at
      )
      order by offer.buyer_decision_at desc nulls last, offer.published_at desc nulls last, offer.captured_at desc
    ),
    '[]'::jsonb
  )
  into v_offers
  from public.transaction_bond_originator_bank_offer_captures offer
  where offer.export_package_id = v_package.id
    and offer.transaction_id = p_transaction_id
    and (
      offer.status = 'accepted_by_buyer'
      or offer.buyer_decision = 'accepted'
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', grant_capture.id,
        'export_package_id', grant_capture.export_package_id,
        'transaction_id', grant_capture.transaction_id,
        'bond_application_id', grant_capture.bond_application_id,
        'submission_id', grant_capture.submission_id,
        'offer_capture_id', grant_capture.offer_capture_id,
        'linked_bond_quote_id', grant_capture.linked_bond_quote_id,
        'bank_name', grant_capture.bank_name,
        'approved_amount', grant_capture.approved_amount,
        'grant_document_id', grant_capture.grant_document_id,
        'signed_grant_document_id', grant_capture.signed_grant_document_id,
        'grant_reference', grant_capture.grant_reference,
        'conditions_summary', grant_capture.conditions_summary,
        'status', grant_capture.status,
        'captured_at', grant_capture.captured_at,
        'published_at', grant_capture.published_at,
        'grant_document', case
          when grant_doc.id is null then null
          else jsonb_build_object(
            'id', grant_doc.id,
            'name', grant_doc.name,
            'category', grant_doc.category,
            'document_type', grant_doc.document_type,
            'status', grant_doc.status,
            'created_at', grant_doc.created_at,
            'updated_at', grant_doc.updated_at
          )
        end,
        'signed_grant_document', case
          when signed_doc.id is null then null
          else jsonb_build_object(
            'id', signed_doc.id,
            'name', signed_doc.name,
            'category', signed_doc.category,
            'document_type', signed_doc.document_type,
            'status', signed_doc.status,
            'created_at', signed_doc.created_at,
            'updated_at', signed_doc.updated_at
          )
        end
      )
      order by grant_capture.published_at desc nulls last, grant_capture.captured_at desc
    ),
    '[]'::jsonb
  )
  into v_grants
  from public.transaction_bond_originator_grant_captures grant_capture
  left join public.documents grant_doc
    on grant_doc.id = grant_capture.grant_document_id
   and grant_doc.transaction_id = p_transaction_id
  left join public.documents signed_doc
    on signed_doc.id = grant_capture.signed_grant_document_id
   and signed_doc.transaction_id = p_transaction_id
  where grant_capture.export_package_id = v_package.id
    and grant_capture.transaction_id = p_transaction_id
    and grant_capture.status in ('published_to_buyer', 'buyer_signed', 'submitted_for_instruction');

  return jsonb_build_object(
    'id', v_package.id,
    'transaction_id', v_package.transaction_id,
    'bond_application_id', v_package.bond_application_id,
    'submission_id', v_package.submission_id,
    'destination_key', v_package.destination_key,
    'destination_type', v_package.destination_type,
    'status', v_package.status,
    'originator_recipient_name', v_package.originator_recipient_name,
    'package_ready_at', v_package.package_ready_at,
    'accepted_at', v_package.accepted_at,
    'last_downloaded_at', v_package.last_downloaded_at,
    'offerCaptures', v_offers,
    'grantCaptures', v_grants,
    'attorneyHandoffOnly', true,
    'bankWorkflowUnchanged', true,
    'offerWorkflowMutationDeferred', true,
    'grantWorkflowMutationDeferred', true
  );
end;
$$;

revoke all on function public.bridge_attorney_bond_originator_handoff_view(uuid) from public;
grant execute on function public.bridge_attorney_bond_originator_handoff_view(uuid) to authenticated;

comment on function public.bridge_attorney_bond_originator_handoff_view(uuid) is
  'Phase 8G read-only attorney handoff for originator-captured bond grant evidence. Returns grant and accepted-offer metadata without exposing export payload JSON, internal notes, tokens, storage paths, public URLs or bank workflow mutation controls.';
