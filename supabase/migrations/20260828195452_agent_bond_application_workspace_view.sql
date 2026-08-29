create or replace function public.bridge_agent_bond_application_workspace_view(
  p_transaction_id uuid,
  p_bond_application_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_application public.bond_applications%rowtype;
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_finance_workflow public.transaction_finance_workflows%rowtype;
  v_identity jsonb;
  v_application_json jsonb := '{}'::jsonb;
  v_originator_json jsonb := '{}'::jsonb;
  v_finance_json jsonb := '{}'::jsonb;
  v_guarantee_json jsonb := '{}'::jsonb;
  v_last_updated_at timestamptz;
begin
  if p_transaction_id is null then
    raise exception 'Transaction is required.' using errcode = '22023';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and (auth.uid() is null or not public.bridge_can_access_transaction_spine(p_transaction_id)) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;

  if p_bond_application_id is not null then
    select application.*
    into v_application
    from public.bond_applications application
    where application.id = p_bond_application_id
      and application.transaction_id = p_transaction_id
      and application.status <> 'cancelled';

    if not found then
      raise exception 'The bond application does not belong to this transaction or is not active.' using errcode = '22023';
    end if;
  else
    select application.*
    into v_application
    from public.bond_applications application
    where application.transaction_id = p_transaction_id
      and application.status <> 'cancelled'
    order by application.revision desc, application.created_at desc
    limit 1;
  end if;

  if v_application.id is null then
    v_identity := public.bridge_agent_bond_application_identity(p_transaction_id, null);
    return jsonb_build_object(
      'version', 'agent-bond-application-workspace-v1',
      'available', false,
      'identity', v_identity,
      'application', null,
      'originator', jsonb_build_object(
        'package', null,
        'progressEvents', '[]'::jsonb,
        'documentRequests', '[]'::jsonb,
        'offerCaptures', '[]'::jsonb,
        'grantCaptures', '[]'::jsonb
      ),
      'finance', jsonb_build_object(
        'workflow', null,
        'applications', '[]'::jsonb,
        'quotes', '[]'::jsonb,
        'decisions', '[]'::jsonb,
        'instruction', null,
        'bankOutcomes', '[]'::jsonb
      ),
      'guarantees', jsonb_build_object('steps', '[]'::jsonb),
      'lastUpdatedAt', null
    );
  end if;

  v_identity := public.bridge_agent_bond_application_identity(
    p_transaction_id,
    v_application.id
  );

  select package.*
  into v_package
  from public.transaction_bond_application_export_packages package
  where package.transaction_id = p_transaction_id
    and package.bond_application_id = v_application.id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  order by package.package_ready_at desc nulls last, package.created_at desc
  limit 1;

  select workflow.*
  into v_finance_workflow
  from public.transaction_finance_workflows workflow
  where workflow.transaction_id = p_transaction_id
    and workflow.workflow_type = 'bond_hybrid'
  order by workflow.created_at desc
  limit 1;

  select jsonb_build_object(
    'id', v_application.id,
    'transactionId', v_application.transaction_id,
    'status', v_application.status,
    'revision', v_application.revision,
    'schemaVersion', v_application.schema_version,
    'flowVersion', v_application.flow_version,
    'storageMode', v_application.storage_mode,
    'activeSubmissionId', v_application.active_submission_id,
    'lockedAt', v_application.locked_at,
    'submittedAt', v_application.submitted_at,
    'createdAt', v_application.created_at,
    'updatedAt', v_application.updated_at,
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', participant.id,
          'participantKey', participant.participant_key,
          'role', participant.role,
          'ordinal', participant.ordinal,
          'status', participant.status,
          'invitationStatus', participant.invitation_status,
          'readyAt', participant.ready_at,
          'awaitingSignatureAt', participant.awaiting_signature_at,
          'signedAt', participant.signed_at,
          'completedAt', participant.completed_at,
          'updatedAt', participant.updated_at
        )
        order by participant.ordinal asc, participant.created_at asc
      )
      from public.bond_application_participants participant
      where participant.bond_application_id = v_application.id
        and participant.status not in ('removed', 'declined')
    ), '[]'::jsonb),
    'documentRequirements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', requirement.id,
          'participantId', requirement.participant_id,
          'requirementKey', requirement.requirement_key,
          'canonicalDocumentType', requirement.canonical_document_type,
          'requiredBefore', requirement.required_before,
          'satisfactionMode', requirement.satisfaction_mode,
          'status', requirement.status,
          'source', requirement.source,
          'transactionRequiredDocumentId', requirement.transaction_required_document_id
        )
        order by requirement.created_at asc
      )
      from public.bond_application_document_requirements requirement
      where requirement.bond_application_id = v_application.id
        and requirement.status <> 'superseded'
    ), '[]'::jsonb),
    'participantSummary', (
      select jsonb_build_object(
        'total', count(*)::integer,
        'ready', count(*) filter (where participant.status in ('ready_for_submission', 'awaiting_signature', 'signed', 'completed'))::integer,
        'outstanding', count(*) filter (where participant.status not in ('ready_for_submission', 'awaiting_signature', 'signed', 'completed', 'removed', 'declined'))::integer
      )
      from public.bond_application_participants participant
      where participant.bond_application_id = v_application.id
        and participant.status not in ('removed', 'declined')
    ),
    'documentRequirementSummary', (
      select jsonb_build_object(
        'total', count(*) filter (where requirement.status <> 'inactive')::integer,
        'satisfied', count(*) filter (where requirement.status in ('satisfied', 'waived'))::integer,
        'outstanding', count(*) filter (where requirement.status = 'active')::integer
      )
      from public.bond_application_document_requirements requirement
      where requirement.bond_application_id = v_application.id
        and requirement.status <> 'superseded'
    )
  ) into v_application_json;

  if v_package.id is not null then
    select jsonb_build_object(
      'package', jsonb_build_object(
        'id', v_package.id,
        'transactionId', v_package.transaction_id,
        'canonicalBondApplicationId', v_package.bond_application_id,
        'activeSubmissionId', v_package.submission_id,
        'transactionBondApplicationId', v_package.transaction_bond_application_id,
        'destinationKey', v_package.destination_key,
        'destinationType', v_package.destination_type,
        'status', v_package.status,
        'originatorRecipientName', v_package.originator_recipient_name,
        'packageReadyAt', v_package.package_ready_at,
        'acceptedAt', v_package.accepted_at,
        'lastDownloadedAt', v_package.last_downloaded_at,
        'downloadCount', v_package.download_count,
        'createdAt', v_package.created_at,
        'updatedAt', v_package.updated_at
      ),
      'progressEvents', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', event.id,
            'eventType', event.event_type,
            'status', event.status,
            'title', event.title,
            'summary', event.summary,
            'occurredAt', event.occurred_at,
            'source', event.source
          )
          order by event.occurred_at asc, event.created_at asc
        )
        from public.transaction_bond_originator_progress_events event
        where event.export_package_id = v_package.id
          and event.transaction_id = p_transaction_id
          and event.visible_to_agent = true
      ), '[]'::jsonb),
      'documentRequests', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', request.id,
            'canonicalBondApplicationId', request.bond_application_id,
            'activeSubmissionId', request.submission_id,
            'participantRole', request.participant_role,
            'targetScope', request.target_scope,
            'requestType', request.request_type,
            'status', request.status,
            'requirementKey', request.requirement_key,
            'canonicalDocumentType', request.canonical_document_type,
            'linkedDocumentId', request.linked_document_id,
            'buyerInstruction', request.buyer_instruction,
            'buyerSafeFeedback', request.buyer_safe_feedback,
            'dueAt', request.due_at,
            'sentAt', request.sent_at,
            'uploadedAt', request.uploaded_at,
            'submittedForReviewAt', request.submitted_for_review_at,
            'reviewedAt', request.reviewed_at,
            'createdAt', request.created_at,
            'updatedAt', request.updated_at
          )
          order by coalesce(request.reviewed_at, request.submitted_for_review_at, request.uploaded_at, request.sent_at, request.created_at) desc
        )
        from public.transaction_bond_originator_document_requests request
        where request.export_package_id = v_package.id
          and request.transaction_id = p_transaction_id
          and request.bond_application_id = v_application.id
      ), '[]'::jsonb),
      'offerCaptures', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', offer.id,
            'canonicalBondApplicationId', offer.bond_application_id,
            'activeSubmissionId', offer.submission_id,
            'bankName', offer.bank_name,
            'offeredAmount', offer.offered_amount,
            'interestRate', offer.interest_rate,
            'interestRateType', offer.interest_rate_type,
            'interestRateDisplay', offer.interest_rate_display,
            'monthlyRepayment', offer.monthly_repayment,
            'termMonths', offer.term_months,
            'validUntil', offer.valid_until,
            'quoteDocumentId', offer.quote_document_id,
            'conditionsSummary', offer.conditions_summary,
            'status', offer.status,
            'capturedAt', offer.captured_at,
            'publishedAt', offer.published_at,
            'buyerDecision', offer.buyer_decision,
            'buyerDecisionAt', offer.buyer_decision_at,
            'linkedBondQuoteId', offer.linked_bond_quote_id
          )
          order by coalesce(offer.buyer_decision_at, offer.published_at, offer.captured_at) desc
        )
        from public.transaction_bond_originator_bank_offer_captures offer
        where offer.export_package_id = v_package.id
          and offer.transaction_id = p_transaction_id
          and offer.bond_application_id = v_application.id
          and offer.status in ('published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer')
      ), '[]'::jsonb),
      'grantCaptures', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', grant_capture.id,
            'canonicalBondApplicationId', grant_capture.bond_application_id,
            'activeSubmissionId', grant_capture.submission_id,
            'offerCaptureId', grant_capture.offer_capture_id,
            'linkedBondQuoteId', grant_capture.linked_bond_quote_id,
            'bankName', grant_capture.bank_name,
            'approvedAmount', grant_capture.approved_amount,
            'grantReference', grant_capture.grant_reference,
            'conditionsSummary', grant_capture.conditions_summary,
            'status', grant_capture.status,
            'capturedAt', grant_capture.captured_at,
            'publishedAt', grant_capture.published_at,
            'signedGrantDocumentAvailable', grant_capture.signed_grant_document_id is not null
          )
          order by coalesce(grant_capture.published_at, grant_capture.captured_at) desc
        )
        from public.transaction_bond_originator_grant_captures grant_capture
        where grant_capture.export_package_id = v_package.id
          and grant_capture.transaction_id = p_transaction_id
          and grant_capture.bond_application_id = v_application.id
          and grant_capture.status in ('published_to_buyer', 'buyer_signed', 'submitted_for_instruction')
      ), '[]'::jsonb),
      'documentRequestSummary', (
        select jsonb_build_object(
          'total', count(*)::integer,
          'open', count(*) filter (where request.status not in ('accepted', 'withdrawn', 'cancelled'))::integer,
          'awaitingReview', count(*) filter (where request.status = 'awaiting_review')::integer,
          'accepted', count(*) filter (where request.status = 'accepted')::integer,
          'latestAt', max(coalesce(request.reviewed_at, request.submitted_for_review_at, request.uploaded_at, request.sent_at, request.created_at))
        )
        from public.transaction_bond_originator_document_requests request
        where request.export_package_id = v_package.id
          and request.transaction_id = p_transaction_id
          and request.bond_application_id = v_application.id
      ),
      'offerGrantSummary', jsonb_build_object(
        'offers', (
          select jsonb_build_object(
            'total', count(*)::integer,
            'published', count(*) filter (where offer.status in ('published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer'))::integer,
            'accepted', count(*) filter (where offer.status = 'accepted_by_buyer' or offer.buyer_decision = 'accepted')::integer,
            'declined', count(*) filter (where offer.status = 'declined_by_buyer' or offer.buyer_decision = 'declined')::integer,
            'latestAt', max(coalesce(offer.buyer_decision_at, offer.published_at, offer.captured_at))
          )
          from public.transaction_bond_originator_bank_offer_captures offer
          where offer.export_package_id = v_package.id
            and offer.transaction_id = p_transaction_id
            and offer.bond_application_id = v_application.id
        ),
        'grants', (
          select jsonb_build_object(
            'total', count(*)::integer,
            'published', count(*) filter (where grant_capture.status in ('published_to_buyer', 'buyer_signed', 'submitted_for_instruction'))::integer,
            'signed', count(*) filter (where grant_capture.status in ('buyer_signed', 'submitted_for_instruction') or grant_capture.signed_grant_document_id is not null)::integer,
            'latestAt', max(coalesce(grant_capture.published_at, grant_capture.captured_at))
          )
          from public.transaction_bond_originator_grant_captures grant_capture
          where grant_capture.export_package_id = v_package.id
            and grant_capture.transaction_id = p_transaction_id
            and grant_capture.bond_application_id = v_application.id
        )
      )
    ) into v_originator_json;
  else
    v_originator_json := jsonb_build_object(
      'package', null,
      'progressEvents', '[]'::jsonb,
      'documentRequests', '[]'::jsonb,
      'offerCaptures', '[]'::jsonb,
      'grantCaptures', '[]'::jsonb,
      'documentRequestSummary', jsonb_build_object('total', 0, 'open', 0, 'awaitingReview', 0, 'accepted', 0, 'latestAt', null),
      'offerGrantSummary', jsonb_build_object(
        'offers', jsonb_build_object('total', 0, 'published', 0, 'accepted', 0, 'declined', 0, 'latestAt', null),
        'grants', jsonb_build_object('total', 0, 'published', 0, 'signed', 0, 'latestAt', null)
      )
    );
  end if;

  if v_finance_workflow.id is not null then
    select jsonb_build_object(
      'workflow', jsonb_build_object(
        'id', v_finance_workflow.id,
        'transactionId', v_finance_workflow.transaction_id,
        'workflowType', v_finance_workflow.workflow_type,
        'currentStage', v_finance_workflow.current_stage,
        'status', v_finance_workflow.status,
        'lastUpdatedAt', v_finance_workflow.last_updated_at,
        'completedAt', v_finance_workflow.completed_at,
        'createdAt', v_finance_workflow.created_at,
        'updatedAt', v_finance_workflow.updated_at
      ),
      'applications', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', lender_application.id,
            'transactionId', lender_application.transaction_id,
            'workflowId', lender_application.workflow_id,
            'applicationType', lender_application.application_type,
            'bankName', lender_application.bank_name,
            'status', lender_application.status,
            'submittedAt', lender_application.submitted_at,
            'feedbackReceivedAt', lender_application.feedback_received_at,
            'referenceNumber', lender_application.reference_number,
            'applicationReference', lender_application.application_reference,
            'createdAt', lender_application.created_at,
            'updatedAt', lender_application.updated_at
          )
          order by lender_application.created_at asc
        )
        from public.transaction_bond_applications lender_application
        where lender_application.transaction_id = p_transaction_id
          and lender_application.workflow_id = v_finance_workflow.id
      ), '[]'::jsonb),
      'quotes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', quote.id,
            'transactionId', quote.transaction_id,
            'workflowId', quote.workflow_id,
            'bondApplicationId', quote.bond_application_id,
            'bankName', quote.bank_name,
            'quotedAmount', quote.quoted_amount,
            'interestRate', quote.interest_rate,
            'interestRateType', quote.interest_rate_type,
            'interestRateMargin', quote.interest_rate_margin,
            'interestRateDisplay', quote.interest_rate_display,
            'monthlyRepayment', quote.monthly_repayment,
            'termMonths', quote.term_months,
            'quoteStatus', quote.quote_status,
            'quoteReceivedAt', quote.quote_received_at,
            'quoteExpiryAt', quote.quote_expiry_at,
            'validUntil', quote.valid_until,
            'approvedAt', quote.approved_at,
            'quoteDocumentId', quote.quote_document_id,
            'createdAt', quote.created_at,
            'updatedAt', quote.updated_at
          )
          order by quote.created_at asc
        )
        from public.transaction_bond_quotes quote
        where quote.transaction_id = p_transaction_id
          and quote.workflow_id = v_finance_workflow.id
      ), '[]'::jsonb),
      'decisions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', decision.id,
            'bondOfferId', decision.bond_offer_id,
            'decision', decision.decision,
            'decidedByRole', decision.decided_by_role,
            'decisionAt', decision.decision_at,
            'createdAt', decision.created_at,
            'updatedAt', decision.updated_at
          )
          order by decision.decision_at desc
        )
        from public.transaction_bond_offer_decisions decision
        where decision.transaction_id = p_transaction_id
          and exists (
            select 1
            from public.transaction_bond_quotes quote
            where quote.id = decision.bond_offer_id
              and quote.workflow_id = v_finance_workflow.id
          )
      ), '[]'::jsonb),
      'instruction', (
        select jsonb_build_object(
          'id', instruction.id,
          'transactionId', instruction.transaction_id,
          'acceptedBondOfferId', instruction.accepted_bond_offer_id,
          'grantReceived', instruction.grant_received,
          'grantReceivedAt', instruction.grant_received_at,
          'grantDocumentId', instruction.grant_document_id,
          'grantSigned', instruction.grant_signed,
          'grantSignedAt', instruction.grant_signed_at,
          'signedGrantDocumentId', instruction.signed_grant_document_id,
          'grantSubmitted', instruction.grant_submitted,
          'grantSubmittedAt', instruction.grant_submitted_at,
          'instructionSent', instruction.instruction_sent,
          'instructionSentAt', instruction.instruction_sent_at,
          'instructionDocumentId', instruction.instruction_document_id,
          'createdAt', instruction.created_at,
          'updatedAt', instruction.updated_at
        )
        from public.transaction_bond_instructions instruction
        where instruction.transaction_id = p_transaction_id
        order by instruction.created_at desc
        limit 1
      ),
      'bankOutcomes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', outcome.id,
            'transactionId', outcome.transaction_id,
            'workflowId', outcome.workflow_id,
            'bondApplicationId', outcome.bond_application_id,
            'bankName', outcome.bank_name,
            'outcome', outcome.outcome,
            'outcomeAt', outcome.outcome_at,
            'approvedAmount', outcome.approved_amount,
            'conditions', outcome.conditions,
            'declineReason', outcome.decline_reason,
            'createdAt', outcome.created_at
          )
          order by outcome.outcome_at desc
        )
        from public.transaction_bond_bank_outcomes outcome
        where outcome.transaction_id = p_transaction_id
          and outcome.workflow_id = v_finance_workflow.id
      ), '[]'::jsonb)
    ) into v_finance_json;
  else
    v_finance_json := jsonb_build_object(
      'workflow', null,
      'applications', '[]'::jsonb,
      'quotes', '[]'::jsonb,
      'decisions', '[]'::jsonb,
      'instruction', null,
      'bankOutcomes', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'steps', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'workflowInstanceId', step.workflow_instance_id,
        'workflowKey', step.workflow_key,
        'stepKey', step.step_key,
        'label', step.step_label,
        'status', step.status,
        'completedAt', step.completed_at,
        'updatedAt', step.updated_at
      )
      order by case step.workflow_key when 'attorney_bond' then 1 else 2 end, step.sort_order asc
    ), '[]'::jsonb)
  ) into v_guarantee_json
  from public.transaction_workflow_steps step
  where step.transaction_id = p_transaction_id
    and (
      (step.workflow_key = 'attorney_bond' and step.step_key in ('guarantees_issued', 'guarantee_wording_accepted'))
      or (step.workflow_key = 'attorney_transfer' and step.step_key in ('guarantees_received', 'guarantees_confirmed'))
    );

  select greatest(
    v_application.updated_at,
    v_package.updated_at,
    v_package.package_ready_at,
    v_package.accepted_at,
    v_package.last_downloaded_at,
    v_finance_workflow.updated_at,
    v_finance_workflow.last_updated_at,
    (select max(request.updated_at) from public.transaction_bond_originator_document_requests request where request.bond_application_id = v_application.id and request.transaction_id = p_transaction_id),
    (select max(offer.captured_at) from public.transaction_bond_originator_bank_offer_captures offer where offer.bond_application_id = v_application.id and offer.transaction_id = p_transaction_id),
    (select max(grant_capture.captured_at) from public.transaction_bond_originator_grant_captures grant_capture where grant_capture.bond_application_id = v_application.id and grant_capture.transaction_id = p_transaction_id),
    (select max(step.updated_at) from public.transaction_workflow_steps step where step.transaction_id = p_transaction_id and step.step_key in ('guarantees_issued', 'guarantee_wording_accepted', 'guarantees_received', 'guarantees_confirmed'))
  ) into v_last_updated_at;

  return jsonb_build_object(
    'version', 'agent-bond-application-workspace-v1',
    'available', true,
    'identity', v_identity,
    'application', v_application_json,
    'originator', v_originator_json,
    'finance', v_finance_json,
    'guarantees', v_guarantee_json,
    'lastUpdatedAt', v_last_updated_at
  );
end;
$$;

revoke all on function public.bridge_agent_bond_application_workspace_view(uuid, uuid) from public;
revoke all on function public.bridge_agent_bond_application_workspace_view(uuid, uuid) from anon;
grant execute on function public.bridge_agent_bond_application_workspace_view(uuid, uuid) to authenticated;
grant execute on function public.bridge_agent_bond_application_workspace_view(uuid, uuid) to service_role;

comment on function public.bridge_agent_bond_application_workspace_view(uuid, uuid) is
  'Application-scoped, read-only agent workspace for the active canonical bond application. It returns agent-safe application readiness, originator progress, finance workflow and guarantee milestones while excluding payload snapshots, tokens, personal application answers and internal notes.';
