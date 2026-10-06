import { validReviewDate } from '../../services/attorneyWorkflow/conveyancingReviewPolicy.js'

const field = (key, label, type = 'text', options) => ({ key, label, type, ...(options ? { options } : {}) })
const record = (label, fields, help, multiple = false) => ({ label, fields, help, multiple, itemLabel: label, addLabel: `Add ${label.toLowerCase()}` })
const datedReference = (label, dateLabel, referenceLabel, extra = []) => record(label, [field('date', dateLabel, 'date'), field('reference', referenceLabel), ...extra], 'Record the actual event and its evidence reference. Saving this record does not send a message or complete the task.')
const pack = label => datedReference(label, 'Prepared on', 'Pack / version reference', [field('preparedBy', 'Prepared by'), field('scope', 'Documents included / outstanding work')])
const coordination = label => datedReference(label, 'Confirmed on', 'Coordination reference', [field('participants', 'Attorneys / lanes included'), field('lodgementDate', 'Agreed lodgement date', 'date'), field('conditions', 'Open conditions / agreed action')])
const closure = label => datedReference(label, 'Reviewed on', 'Close-out / reconciliation reference', [field('reviewedBy', 'Reviewed by'), field('outstanding', 'Outstanding balances, documents or follow-up'), field('archiveReference', 'File / archive reference')])
const request = label => datedReference(label, 'Sent on', 'Request reference', [field('recipient', 'Recipient'), field('scope', 'Requested information / documents'), field('followUpOn', 'Follow-up on', 'date')])
const conditions = record('Bank condition', [field('description', 'Condition / bank query'), field('owner', 'Responsible person'), field('dueOn', 'Due on', 'date'), field('status', 'Position', 'select', ['outstanding', 'submitted', 'correction_requested', 'resolved', 'not_applicable']), field('responseReference', 'Response / resolution reference')], 'Record each applicable condition and its owner. Keep bank confirmation separate from an internal review; saving a response does not establish bank authority to lodge.', true)
const submissions = record('Bank submission', [field('sentOn', 'Submitted on', 'date'), field('kind', 'Submission type', 'select', ['initial_submission', 'resubmission']), field('channel', 'Submission channel', 'select', ['bank_portal', 'email', 'other']), field('recipient', 'Bank / recipient'), field('packReference', 'Submitted pack / version reference'), field('reference', 'Submission / portal reference'), field('response', 'Bank response', 'select', ['awaiting_response', 'query_received', 'correction_requested', 'acknowledged']), field('query', 'Query / correction and response reference')], 'Record an actual submission or resubmission and any bank response. This saves the record; it does not submit documents or grant authority to lodge.', true)

// Existing confirmation identifiers are deliberately retained: these controls
// enrich the current task record, without adding tasks, legal gates or outcomes.
const evidence = (key, index) => `evidence:${key}:${index}`
const at = (rowId, spec, inputs = {}) => ({ rowId, spec, inputs })
const onEvidence = (key, index, spec, inputs) => at(evidence(key, index), spec, inputs)
const CONTENT = {
  transfer: {
    transfer_document_pack_review: at('transfer_document_pack_review_reviewed', pack('Transfer document pack')),
    buyer_signing_review: at('buyer_signing_review_reviewed', datedReference('Buyer transfer signing review', 'Signed on', 'Signed transfer pack reference', [field('signatories', 'Signatories / witnessing review')])),
    seller_signing_review: at('seller_signing_review_reviewed', datedReference('Seller transfer signing review', 'Signed on', 'Signed transfer pack reference', [field('signatories', 'Signatories / witnessing review')])),
    lodgement_ready: at('lodgement_ready_confirmed', coordination('Transfer lodgement readiness')),
    lodged_at_deeds_office: at('lodged_at_deeds_office_confirmed', datedReference('Transfer lodgement', 'Lodged on', 'Deeds Office lodgement reference', [field('office', 'Deeds Office'), field('linkedReferences', 'Linked bond / cancellation references')])),
    in_prep: at('in_prep_confirmed', datedReference('Deeds Office prep', 'Prep confirmed on', 'Prep / examination reference', [field('queries', 'Examiner queries / follow-up')])),
    registered: at('registered_confirmed', datedReference('Transfer registration', 'Registered on', 'Registration / deed reference', [field('office', 'Deeds Office')])),
    post_registration_closeout_review: at('final_account_position_reviewed', closure('Transfer financial close-out')),
    matter_closed: at('matter_closure_confirmed', closure('Matter closure')),
  },
  bond: {
    bond_instruction_received: onEvidence('bond_instruction_received', 1, datedReference('Bond instruction', 'Received on', 'Instruction reference', [field('source', 'Instructing bank / originator')])),
    bank_reference_captured: onEvidence('bank_reference_captured', 1, record('Bank details', [field('bank', 'Bond bank'), field('reference', 'Bank reference / loan account')], 'Record the bank and reference checked against the instruction.'), { bond_bank: 'bank', bond_reference: 'reference' }),
    bond_approval_letter_received: onEvidence('bond_approval_letter_received', 1, datedReference('Bond approval review', 'Approval dated', 'Approval letter reference', [field('amount', 'Approved bond amount (R)', 'number'), field('conditions', 'Material conditions / follow-up')]), { bond_approval_amount: 'amount' }),
    bank_requirements_confirmed: onEvidence('bank_requirements_confirmed', 1, conditions),
    bank_conditions_outstanding: { ...onEvidence('bank_conditions_outstanding', 0, conditions), carryFrom: ['bank_requirements_confirmed'] },
    bank_conditions_resolved: { ...onEvidence('bank_conditions_resolved', 1, conditions), carryFrom: ['bank_conditions_outstanding', 'bank_requirements_confirmed'] },
    bond_documents_prepared: onEvidence('bond_documents_prepared', 0, pack('Bond document pack')),
    buyer_signed_bond_documents: onEvidence('buyer_signed_bond_documents', 1, datedReference('Bond signing review', 'Signed on', 'Signed pack reference', [field('signatories', 'Signatories / witnessing review')])),
    bond_documents_sent_to_bank: onEvidence('bond_documents_sent_to_bank', 1, submissions),
    bank_approval_to_lodge_received: onEvidence('bank_approval_to_lodge_received', 1, datedReference('Bank authority to lodge', 'Authority received on', 'Bank authority reference', [field('issuedBy', 'Bank / issuing official'), field('packReference', 'Approved pack / version reference'), field('conditions', 'Authority conditions / limits'), field('validUntil', 'Valid until (if stated)', 'date')])),
    guarantees_issued: onEvidence('guarantees_issued', 1, datedReference('Guarantees issued', 'Issued on', 'Guarantee / version reference', [field('recipient', 'Receiving transfer attorney'), field('amount', 'Total issued (R)', 'number'), field('validUntil', 'Expiry (if stated)', 'date')])),
    guarantee_wording_accepted: onEvidence('guarantee_wording_accepted', 0, datedReference('Guarantee wording acceptance', 'Accepted on', 'Accepted guarantee / version reference', [field('acceptedBy', 'Accepting transfer attorney'), field('amendments', 'Amendments / resolution reference')])),
    bond_lodgement_instructions_confirmed: onEvidence('bond_lodgement_instructions_confirmed', 0, datedReference('Current bank lodgement instruction', 'Instruction checked on', 'Current instruction reference', [field('conditions', 'Conditions / changes since approval'), field('authorityReference', 'Linked bank authority reference')])),
    bond_lodgement_ready: onEvidence('bond_lodgement_ready', 1, coordination('Bond lodgement readiness')),
    bond_lodged: onEvidence('bond_lodged', 1, datedReference('Bond lodgement', 'Lodged on', 'Simultaneous lodgement reference', [field('office', 'Deeds Office')])),
    bond_registered: onEvidence('bond_registered', 1, datedReference('Bond registration', 'Registered on', 'Registered bond reference', [field('office', 'Deeds Office')])),
    bond_close_out_complete: onEvidence('bond_close_out_complete', 0, closure('Bank and bond close-out')),
  },
  cancellation: {
    cancellation_bank_captured: onEvidence('cancellation_bank_captured', 0, record('Cancellation bank', [field('bank', 'Cancellation bank')], 'Record the bank checked against the seller instruction.'), { cancellation_bank: 'bank' }),
    cancellation_bond_account_captured: onEvidence('cancellation_bond_account_captured', 0, record('Cancellation account', [field('account', 'Bond account / reference')], 'Record the account checked before requesting figures.'), { cancellation_bond_account_number: 'account' }),
    cancellation_instruction_received: onEvidence('cancellation_instruction_received', 1, datedReference('Cancellation instruction', 'Received on', 'Cancellation instruction reference', [field('source', 'Instruction source / bank')])),
    notice_period_captured: onEvidence('notice_period_captured', 1, record('Cancellation notice', [field('status', 'Notice position', 'select', ['given', 'not_given', 'to_confirm']), field('givenOn', 'Notice given on', 'date'), field('reference', 'Notice / no-notice evidence'), field('risk', 'Notice risk / agreed follow-up')], 'Record the actual notice position and its evidence. This does not send notice to the bank.'), { notice_period_status: 'status' }),
    cancellation_figures_requested: onEvidence('cancellation_figures_requested', 1, request('Cancellation figures request')),
    cancellation_figures_received: onEvidence('cancellation_figures_received', 1, datedReference('Cancellation figures review', 'Received on', 'Figures / version reference', [field('amount', 'Settlement amount (R)', 'number'), field('account', 'Checked account'), field('validUntil', 'Valid until', 'date')])),
    figures_expiry_captured: onEvidence('figures_expiry_captured', 0, record('Figures validity', [field('validUntil', 'Figures expiry date', 'date'), field('reference', 'Current figures reference'), field('expectedLodgement', 'Expected lodgement date', 'date'), field('followUp', 'Renewal / expiry follow-up')], 'Check the current figures against the expected lodgement. Recording an expiry does not extend the figures.'), { cancellation_figures_expiry_date: 'validUntil' }),
    notice_penalty_risk_captured: onEvidence('notice_penalty_risk_captured', 0, record('Penalty and notice review', [field('risk', 'Penalty / notice risk and basis'), field('amount', 'Penalty amount (if stated) (R)', 'number'), field('owner', 'Responsible person'), field('reference', 'Escalation / resolution reference')], 'Record the reviewed risk and any escalation; an amount alone does not resolve it.'), { penalty_notice_risk: 'risk' }),
    cancellation_guarantees_requested: onEvidence('cancellation_guarantees_requested', 0, request('Cancellation guarantee request')),
    cancellation_guarantees_received: onEvidence('cancellation_guarantees_received', 1, datedReference('Cancellation guarantee receipt', 'Received on', 'Guarantee / version reference', [field('amount', 'Guarantee amount (R)', 'number'), field('account', 'Beneficiary / account checked')])),
    cancellation_guarantees_accepted: onEvidence('cancellation_guarantees_accepted', 1, datedReference('Cancellation guarantee acceptance', 'Accepted on', 'Accepted guarantee / version reference', [field('amendments', 'Wording changes / resolution reference')])),
    cancellation_documents_prepared: onEvidence('cancellation_documents_prepared', 0, pack('Cancellation document pack')),
    cancellation_consent_confirmed: onEvidence('cancellation_consent_confirmed', 1, datedReference('Bondholder consent review', 'Consent checked on', 'Consent / authorised instruction reference', [field('conditions', 'Consent conditions / resolution')])),
    cancellation_simultaneous_lodgement_confirmed: onEvidence('cancellation_simultaneous_lodgement_confirmed', 0, coordination('Simultaneous lodgement plan')),
    cancellation_lodgement_ready: onEvidence('cancellation_lodgement_ready', 1, coordination('Cancellation lodgement readiness')),
    cancellation_lodged: onEvidence('cancellation_lodged', 1, datedReference('Cancellation lodgement', 'Lodged on', 'Simultaneous lodgement reference', [field('office', 'Deeds Office')])),
    cancellation_registered: onEvidence('cancellation_registered', 1, datedReference('Cancellation registration', 'Registered on', 'Cancellation / release reference', [field('office', 'Deeds Office')])),
    settlement_proof_captured: onEvidence('settlement_proof_captured', 0, datedReference('Settlement payment', 'Paid / reconciled on', 'Settlement payment reference', [field('amount', 'Paid amount (R)', 'number'), field('account', 'Settled account')]), { settlement_payment_reference: 'reference' }),
    cancellation_close_out_complete: onEvidence('cancellation_close_out_complete', 1, closure('Cancellation close-out')),
  },
}

CONTENT.bond.bank_approval_to_lodge_received.spec.help = 'Record the bank’s express authority to lodge this pack and any limits. Review the linked authority evidence. A submission receipt or a response to a query does not establish authority to lodge. Saving this record does not send a proceed instruction.'

export function getLegalTaskContent(laneKey, taskKey) {
  return Object.hasOwn(CONTENT, laneKey) && Object.hasOwn(CONTENT[laneKey], taskKey) ? CONTENT[laneKey][taskKey] : null
}

export function legalTaskRecordIssues(spec, items = []) {
  if (spec.multiple === undefined) return [] // Existing specialist registers keep their existing legal validation.
  return items.flatMap((row, index) => spec.fields.flatMap(field => {
    const value = String(row[field.key] || '').trim()
    if (!value) return [] // Partial records can be saved; existing legal gates govern completion.
    const valid = field.type === 'date' ? validReviewDate(value)
      : field.type === 'number' ? Number.isFinite(Number(value)) && Number(value) >= 0
        : field.type === 'select' ? field.options.includes(value) : true
    return valid ? [] : [`${spec.multiple ? `${spec.itemLabel} ${index + 1}: ` : ''}Enter a valid ${field.label.toLowerCase()}.`]
  }))
}

export function readLegalTaskInput(laneKey, taskKey, confirmations, requirementId) {
  const content = getLegalTaskContent(laneKey, taskKey)
  const fieldKey = content?.inputs[requirementId]
  const response = content && confirmations?.[content.rowId]
  if (!fieldKey || response?.answer !== 'yes') return null
  const row = response.items?.[0]
  const value = String(row?.[fieldKey] || '').trim()
  if (!value || legalTaskRecordIssues(content.spec, [row]).length || value === 'to_confirm') return null
  return { value, sourceField: `taskConfirmations:${content.rowId}:${fieldKey}` }
}
