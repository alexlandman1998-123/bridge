create or replace function public.bridge_agent_bond_originator_progress_view(
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
  v_progress_events jsonb := '[]'::jsonb;
  v_document_summary jsonb := '{}'::jsonb;
  v_offer_summary jsonb := '{}'::jsonb;
  v_grant_summary jsonb := '{}'::jsonb;
  v_document_requests jsonb := '[]'::jsonb;
  v_offer_captures jsonb := '[]'::jsonb;
  v_grant_captures jsonb := '[]'::jsonb;
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
        'id', event.id,
        'export_package_id', event.export_package_id,
        'transaction_id', event.transaction_id,
        'submission_id', event.submission_id,
        'destination_key', event.destination_key,
        'event_type', event.event_type,
        'status', event.status,
        'title', event.title,
        'summary', event.summary,
        'occurred_at', event.occurred_at,
        'source', event.source,
        'visible_to_agent', event.visible_to_agent,
        'bank_workflow_unchanged', event.bank_workflow_unchanged,
        'offer_workflow_unchanged', event.offer_workflow_unchanged,
        'grant_workflow_unchanged', event.grant_workflow_unchanged
      )
      order by event.occurred_at asc, event.created_at asc
    ),
    '[]'::jsonb
  )
  into v_progress_events
  from public.transaction_bond_originator_progress_events event
  where event.export_package_id = v_package.id
    and event.transaction_id = p_transaction_id
    and event.visible_to_agent = true;

  select jsonb_build_object(
    'total', count(*)::integer,
    'open', count(*) filter (where request.status not in ('accepted', 'withdrawn', 'cancelled'))::integer,
    'awaitingReview', count(*) filter (where request.status = 'awaiting_review')::integer,
    'accepted', count(*) filter (where request.status = 'accepted')::integer,
    'latestAt', max(coalesce(request.reviewed_at, request.submitted_for_review_at, request.uploaded_at, request.sent_at, request.created_at)),
    'bankWorkflowUnchanged', bool_and(request.bank_workflow_unchanged)
  )
  into v_document_summary
  from public.transaction_bond_originator_document_requests request
  where request.export_package_id = v_package.id
    and request.transaction_id = p_transaction_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', request.id,
        'export_package_id', request.export_package_id,
        'transaction_id', request.transaction_id,
        'bond_application_id', request.bond_application_id,
        'submission_id', request.submission_id,
        'participant_role', request.participant_role,
        'target_scope', request.target_scope,
        'request_type', request.request_type,
        'status', request.status,
        'requirement_key', request.requirement_key,
        'canonical_document_type', request.canonical_document_type,
        'linked_document_id', request.linked_document_id,
        'buyer_instruction', request.buyer_instruction,
        'buyer_safe_feedback', request.buyer_safe_feedback,
        'due_at', request.due_at,
        'sent_at', request.sent_at,
        'uploaded_at', request.uploaded_at,
        'submitted_for_review_at', request.submitted_for_review_at,
        'reviewed_at', request.reviewed_at,
        'bank_workflow_unchanged', request.bank_workflow_unchanged,
        'created_at', request.created_at,
        'updated_at', request.updated_at
      )
      order by coalesce(request.reviewed_at, request.submitted_for_review_at, request.uploaded_at, request.sent_at, request.created_at) desc
    ),
    '[]'::jsonb
  )
  into v_document_requests
  from public.transaction_bond_originator_document_requests request
  where request.export_package_id = v_package.id
    and request.transaction_id = p_transaction_id;

  select jsonb_build_object(
    'total', count(*)::integer,
    'published', count(*) filter (where offer.status in ('published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer'))::integer,
    'accepted', count(*) filter (where offer.status = 'accepted_by_buyer' or offer.buyer_decision = 'accepted')::integer,
    'declined', count(*) filter (where offer.status = 'declined_by_buyer' or offer.buyer_decision = 'declined')::integer,
    'latestAt', max(coalesce(offer.buyer_decision_at, offer.published_at, offer.captured_at)),
    'bankWorkflowUnchanged', bool_and(offer.bank_workflow_unchanged),
    'offerWorkflowUnchanged', bool_and(offer.offer_workflow_unchanged),
    'grantWorkflowUnchanged', bool_and(offer.grant_workflow_unchanged)
  )
  into v_offer_summary
  from public.transaction_bond_originator_bank_offer_captures offer
  where offer.export_package_id = v_package.id
    and offer.transaction_id = p_transaction_id
    and offer.status in ('published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer');

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
        'interest_rate', offer.interest_rate,
        'interest_rate_type', offer.interest_rate_type,
        'interest_rate_display', offer.interest_rate_display,
        'monthly_repayment', offer.monthly_repayment,
        'term_months', offer.term_months,
        'valid_until', offer.valid_until,
        'quote_document_id', offer.quote_document_id,
        'conditions_summary', offer.conditions_summary,
        'status', offer.status,
        'captured_at', offer.captured_at,
        'published_at', offer.published_at,
        'buyer_decision', offer.buyer_decision,
        'buyer_decision_at', offer.buyer_decision_at,
        'linked_bond_quote_id', offer.linked_bond_quote_id,
        'bank_workflow_unchanged', offer.bank_workflow_unchanged,
        'offer_workflow_unchanged', offer.offer_workflow_unchanged,
        'grant_workflow_unchanged', offer.grant_workflow_unchanged
      )
      order by coalesce(offer.buyer_decision_at, offer.published_at, offer.captured_at) desc
    ),
    '[]'::jsonb
  )
  into v_offer_captures
  from public.transaction_bond_originator_bank_offer_captures offer
  where offer.export_package_id = v_package.id
    and offer.transaction_id = p_transaction_id
    and offer.status in ('published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer');

  select jsonb_build_object(
    'total', count(*)::integer,
    'published', count(*) filter (where grant_capture.status in ('published_to_buyer', 'buyer_signed', 'submitted_for_instruction'))::integer,
    'signed', count(*) filter (where grant_capture.status in ('buyer_signed', 'submitted_for_instruction') or grant_capture.signed_grant_document_id is not null)::integer,
    'latestAt', max(coalesce(grant_capture.published_at, grant_capture.captured_at)),
    'bankWorkflowUnchanged', bool_and(grant_capture.bank_workflow_unchanged),
    'offerWorkflowUnchanged', bool_and(grant_capture.offer_workflow_unchanged),
    'grantWorkflowUnchanged', bool_and(grant_capture.grant_workflow_unchanged)
  )
  into v_grant_summary
  from public.transaction_bond_originator_grant_captures grant_capture
  where grant_capture.export_package_id = v_package.id
    and grant_capture.transaction_id = p_transaction_id
    and grant_capture.status in ('published_to_buyer', 'buyer_signed', 'submitted_for_instruction');

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
        'grant_reference', grant_capture.grant_reference,
        'conditions_summary', grant_capture.conditions_summary,
        'status', grant_capture.status,
        'captured_at', grant_capture.captured_at,
        'published_at', grant_capture.published_at,
        'signed_grant_document_available', grant_capture.signed_grant_document_id is not null,
        'bank_workflow_unchanged', grant_capture.bank_workflow_unchanged,
        'offer_workflow_unchanged', grant_capture.offer_workflow_unchanged,
        'grant_workflow_unchanged', grant_capture.grant_workflow_unchanged
      )
      order by coalesce(grant_capture.published_at, grant_capture.captured_at) desc
    ),
    '[]'::jsonb
  )
  into v_grant_captures
  from public.transaction_bond_originator_grant_captures grant_capture
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
    'download_count', v_package.download_count,
    'progressEvents', v_progress_events,
    'documentRequestSummary', coalesce(v_document_summary, '{}'::jsonb),
    'documentRequests', v_document_requests,
    'offerGrantSummary', jsonb_build_object(
      'offers', coalesce(v_offer_summary, '{}'::jsonb),
      'grants', coalesce(v_grant_summary, '{}'::jsonb)
    ),
    'offerCaptures', v_offer_captures,
    'grantCaptures', v_grant_captures,
    'bankWorkflowUnchanged', true,
    'offerWorkflowMutationDeferred', true,
    'grantWorkflowMutationDeferred', true
  );
end;
$$;

revoke all on function public.bridge_agent_bond_originator_progress_view(uuid) from public;
grant execute on function public.bridge_agent_bond_originator_progress_view(uuid) to authenticated;

comment on function public.bridge_agent_bond_originator_progress_view(uuid) is
  'Read-only agent progress view for bond originator intake. Returns agent-safe package, progress, document request, offer and grant details without exposing export payload JSON, internal notes, tokens or bank workflow mutation controls.';
