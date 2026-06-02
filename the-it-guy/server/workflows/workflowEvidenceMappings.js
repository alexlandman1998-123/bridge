import { normaliseFinanceType } from '../services/financeWorkflowResolver.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeList(values = []) {
  return [...new Set((values || []).map(normalizeKey).filter(Boolean))]
}

function buildRule({
  workflowKey,
  stepKey,
  completeOn = [],
  pendingOn = [],
  blockedOn = [],
  reopenOn = [],
  reopenTo = 'pending',
}) {
  return {
    workflowKey: normalizeText(workflowKey),
    stepKey: normalizeText(stepKey),
    completeOn: normalizeList(completeOn),
    pendingOn: normalizeList(pendingOn),
    blockedOn: normalizeList(blockedOn),
    reopenOn: normalizeList(reopenOn),
    reopenTo: normalizeKey(reopenTo) || 'pending',
  }
}

function financeTypeForTransaction(transaction = {}) {
  return normaliseFinanceType(transaction.finance_type)
}

const workflowEvidenceMappingDefinitions = [
  {
    id: 'SIGNED_OTP',
    aliases: [
      'signed_otp',
      'signed_otp_document',
      'otp_signed',
      'signed_offer_to_purchase',
      'offer_to_purchase_signed',
    ],
    resolve: () =>
      buildRule({
        workflowKey: 'sales_otp',
        stepKey: 'signed_otp_received',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'BUYER_ONBOARDING_COMPLETE',
    aliases: [
      'buyer_onboarding_complete',
      'buyer_onboarding_completed',
      'buyer_onboarding_submitted',
      'buyer_onboarding',
      'buyer_onboarding_completed_event',
      'buyer_onboarding_completed_checklist',
    ],
    resolve: () =>
      buildRule({
        workflowKey: 'sales_otp',
        stepKey: 'buyer_onboarding_complete',
        pendingOn: ['started', 'in_progress'],
        completeOn: ['submitted', 'completed', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'SELLER_ONBOARDING_COMPLETE',
    aliases: [
      'seller_onboarding_complete',
      'seller_onboarding_completed',
      'seller_onboarding_submitted',
      'seller_onboarding',
    ],
    resolve: () =>
      buildRule({
        workflowKey: 'sales_otp',
        stepKey: 'seller_onboarding_complete',
        pendingOn: ['started', 'in_progress'],
        completeOn: ['submitted', 'completed', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'SUPPORTING_DOCS_COMPLETE',
    aliases: [
      'supporting_docs_complete',
      'supporting_documents_complete',
      'required_documents_complete',
      'document_request_supporting_docs_complete',
      'supporting_document_request_complete',
    ],
    resolve: () =>
      buildRule({
        workflowKey: 'sales_otp',
        stepKey: 'supporting_docs_complete',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['completed', 'approved', 'verified', 'waived'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'READY_FOR_FINANCE_HANDOFF',
    aliases: ['ready_for_finance', 'ready_for_finance_handoff', 'move_to_finance'],
    resolve: () =>
      buildRule({
        workflowKey: 'sales_otp',
        stepKey: 'ready_for_finance_handoff',
        completeOn: ['completed', 'approved', 'verified', 'triggered'],
        reopenOn: ['reopened', 'removed'],
      }),
  },
  {
    id: 'BOND_DOCUMENTS_RECEIVED',
    aliases: [
      'bond_documents_received',
      'documents_received',
      'bond_docs_received',
      'bond_application_form',
      'bond_application_documents',
    ],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (!['bond', 'hybrid'].includes(financeType)) return null
      return buildRule({
        workflowKey: financeType === 'hybrid' ? 'finance_hybrid' : 'finance_bond',
        stepKey: financeType === 'hybrid' ? 'bond_documents_received' : 'documents_received',
        completeOn: ['uploaded', 'received', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      })
    },
  },
  {
    id: 'BOND_DOCUMENTS_REVIEWED',
    aliases: ['bond_documents_reviewed', 'documents_reviewed', 'bond_docs_reviewed'],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (!['bond', 'hybrid'].includes(financeType)) return null
      return buildRule({
        workflowKey: financeType === 'hybrid' ? 'finance_hybrid' : 'finance_bond',
        stepKey: financeType === 'hybrid' ? 'bond_documents_reviewed' : 'documents_reviewed',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['reviewed', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      })
    },
  },
  {
    id: 'BANK_APPLICATIONS_SUBMITTED',
    aliases: [
      'bank_applications_submitted',
      'applications_submitted',
      'bond_application_submitted',
      'bond_application_started',
      'bond_application_submitted_event',
    ],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (!['bond', 'hybrid'].includes(financeType)) return null
      return buildRule({
        workflowKey: financeType === 'hybrid' ? 'finance_hybrid' : 'finance_bond',
        stepKey: 'applications_submitted',
        pendingOn: ['started', 'in_progress', 'uploaded'],
        completeOn: ['submitted', 'approved', 'verified'],
        blockedOn: ['rejected', 'declined'],
        reopenOn: ['removed', 'expired'],
      })
    },
  },
  {
    id: 'BANK_FEEDBACK_RECEIVED',
    aliases: [
      'bank_feedback_received',
      'feedback_received',
      'bond_approval',
      'bond_approval_letter',
      'bank_approval',
      'grant_letter',
    ],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (!['bond', 'hybrid'].includes(financeType)) return null
      return buildRule({
        workflowKey: financeType === 'hybrid' ? 'finance_hybrid' : 'finance_bond',
        stepKey: 'feedback_received',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['feedback_received', 'approved', 'verified', 'received'],
        blockedOn: ['rejected', 'declined'],
        reopenOn: ['removed', 'expired'],
      })
    },
  },
  {
    id: 'QUOTE_APPROVED',
    aliases: ['quote_approved', 'approved_quote', 'buyer_approved_quote', 'bond_portion_approved'],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (financeType === 'hybrid') {
        return buildRule({
          workflowKey: 'finance_hybrid',
          stepKey: 'quote_approved',
          pendingOn: ['uploaded', 'received', 'under_review'],
          completeOn: ['approved', 'verified', 'buyer_approved'],
          blockedOn: ['rejected', 'declined'],
          reopenOn: ['removed', 'expired'],
        })
      }

      if (financeType !== 'bond') return null

      return buildRule({
        workflowKey: 'finance_bond',
        stepKey: 'quote_approved',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'buyer_approved'],
        blockedOn: ['rejected', 'declined'],
        reopenOn: ['removed', 'expired'],
      })
    },
  },
  {
    id: 'INSTRUCTION_SENT',
    aliases: ['instruction_sent', 'finance_instruction_sent', 'bond_instruction_sent'],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (financeType === 'hybrid') {
        return buildRule({
          workflowKey: 'finance_hybrid',
          stepKey: 'instruction_sent',
          completeOn: ['sent', 'instruction_sent', 'approved', 'verified'],
          reopenOn: ['removed'],
        })
      }

      if (financeType !== 'bond') return null

      return buildRule({
        workflowKey: 'finance_bond',
        stepKey: 'instruction_sent',
        completeOn: ['sent', 'instruction_sent', 'approved', 'verified'],
        reopenOn: ['removed'],
      })
    },
  },
  {
    id: 'READY_FOR_TRANSFER',
    aliases: ['ready_for_transfer', 'move_to_transfer'],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      const workflowKey =
        financeType === 'cash'
          ? 'finance_cash'
          : financeType === 'hybrid'
            ? 'finance_hybrid'
            : financeType === 'bond'
              ? 'finance_bond'
              : null

      if (!workflowKey) return null

      return buildRule({
        workflowKey,
        stepKey: 'ready_for_transfer',
        completeOn: ['completed', 'approved', 'verified', 'triggered'],
        reopenOn: ['reopened', 'removed'],
      })
    },
  },
  {
    id: 'PROOF_OF_FUNDS',
    aliases: ['proof_of_funds', 'cash_proof', 'pof', 'proof_of_funds_cash_component'],
    resolve: ({ transaction = {} }) => {
      const financeType = financeTypeForTransaction(transaction)
      if (financeType === 'cash') {
        return [
          buildRule({
            workflowKey: 'finance_cash',
            stepKey: 'proof_of_funds_received',
            completeOn: ['uploaded', 'received', 'approved', 'verified'],
            blockedOn: ['rejected'],
            reopenOn: ['removed', 'expired'],
          }),
          buildRule({
            workflowKey: 'finance_cash',
            stepKey: 'proof_of_funds_reviewed',
            pendingOn: ['uploaded', 'received', 'under_review'],
            completeOn: ['approved', 'verified'],
            blockedOn: ['rejected'],
            reopenOn: ['removed', 'expired'],
          }),
          buildRule({
            workflowKey: 'finance_cash',
            stepKey: 'cash_confirmation_approved',
            pendingOn: ['uploaded', 'received', 'under_review'],
            completeOn: ['approved', 'verified'],
            blockedOn: ['rejected'],
            reopenOn: ['removed', 'expired'],
          }),
        ]
      }

      if (financeType !== 'hybrid') return null

      return buildRule({
        workflowKey: 'finance_hybrid',
        stepKey: 'cash_portion_confirmed',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      })
    },
  },
  {
    id: 'TRANSFER_INSTRUCTION_RECEIVED',
    aliases: ['instruction_received', 'transfer_instruction_received'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'instruction_received',
        completeOn: ['uploaded', 'received', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_DOCUMENTS_REQUESTED',
    aliases: ['transfer_documents_requested', 'fica_requested'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_documents_requested',
        completeOn: ['requested', 'completed', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_DOCUMENTS_RECEIVED',
    aliases: ['transfer_documents_received', 'fica_received'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_documents_received',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'completed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_DOCUMENTS_PREPARED',
    aliases: ['documents_prepared', 'transfer_documents_prepared', 'transfer_documents'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_documents_prepared',
        completeOn: ['uploaded', 'received', 'prepared', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_SIGNATURES_COMPLETE',
    aliases: ['signatures_complete', 'transfer_signatures_complete', 'signed_transfer_documents'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_documents_signed',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['completed', 'approved', 'verified', 'signed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_CLEARANCE_COMPLETE',
    aliases: ['clearance_complete', 'transfer_clearance_complete', 'rates_clearance_uploaded', 'clearance_figures_received'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'clearance_figures_received',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['completed', 'approved', 'verified', 'received'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_DUTY_RECEIPT',
    aliases: ['transfer_duty_receipt', 'transfer_duty_complete', 'transfer_duty_receipt_received', 'transfer_duty_received'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_duty_received',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'received'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'TRANSFER_GUARANTEES_CONFIRMED',
    aliases: ['guarantees_confirmed', 'guarantees_received'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'guarantees_confirmed',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'received', 'confirmed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'LODGEMENT_CONFIRMED',
    aliases: ['lodgement_confirmed', 'lodged', 'lodgement_submitted'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_transfer',
        stepKey: 'lodged',
        completeOn: ['submitted', 'lodged', 'approved', 'verified', 'confirmed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'READY_FOR_REGISTRATION',
    aliases: ['ready_for_registration', 'ready_for_registration_handoff', 'mark_ready_for_registration'],
    resolve: () =>
      buildRule({
        workflowKey: 'registration',
        stepKey: 'all_required_matters_lodged',
        completeOn: ['completed', 'approved', 'verified', 'triggered'],
        reopenOn: ['reopened', 'removed'],
      }),
  },
  {
    id: 'BOND_ATTORNEY_INSTRUCTION_RECEIVED',
    aliases: ['bond_instruction_received', 'bond_instruction'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_bond',
        stepKey: 'bond_instruction_received',
        completeOn: ['uploaded', 'received', 'approved', 'verified', 'confirmed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'BOND_ATTORNEY_DOCUMENTS_SIGNED',
    aliases: ['bond_documents_signed', 'buyer_signed_bond_documents'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_bond',
        stepKey: 'bond_documents_signed',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'signed', 'completed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'BANK_CONDITIONS_SATISFIED',
    aliases: ['bank_conditions_satisfied', 'grant_signed'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_bond',
        stepKey: 'bank_conditions_satisfied',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'satisfied', 'completed', 'signed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'BOND_LODGEMENT_CONFIRMED',
    aliases: ['bond_lodged', 'bond_lodgement_submitted'],
    resolve: () =>
      buildRule({
        workflowKey: 'attorney_bond',
        stepKey: 'lodged',
        completeOn: ['submitted', 'lodged', 'approved', 'verified', 'confirmed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'CANCELLATION_FIGURES_RECEIVED',
    aliases: ['cancellation_figures_received'],
    resolve: () =>
      buildRule({
        workflowKey: 'seller_bond_cancellation',
        stepKey: 'cancellation_figures_received',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['approved', 'verified', 'completed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'CANCELLATION_LODGEMENT_CONFIRMED',
    aliases: ['cancellation_lodged', 'cancellation_lodgement_confirmed'],
    resolve: () =>
      buildRule({
        workflowKey: 'seller_bond_cancellation',
        stepKey: 'lodged',
        completeOn: ['submitted', 'lodged', 'approved', 'verified', 'confirmed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'REGISTRATION_CONFIRMATION',
    aliases: [
      'registration_confirmation',
      'registration_confirmed',
      'registration_letter',
      'registration_certificate',
      'mark_registered',
    ],
    resolve: () =>
      buildRule({
        workflowKey: 'registration',
        stepKey: 'registration_confirmed',
        completeOn: ['uploaded', 'received', 'approved', 'verified', 'confirmed', 'completed'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
  {
    id: 'REGISTRATION_CLOSEOUT_COMPLETE',
    aliases: ['closeout_complete', 'registration_closeout_complete', 'final_statement_complete', 'final_accounts_complete'],
    resolve: () =>
      buildRule({
        workflowKey: 'registration',
        stepKey: 'final_accounts_complete',
        pendingOn: ['uploaded', 'received', 'under_review'],
        completeOn: ['completed', 'approved', 'verified'],
        blockedOn: ['rejected'],
        reopenOn: ['removed', 'expired'],
      }),
  },
]

const workflowEvidenceAliasIndex = new Map()
for (const definition of workflowEvidenceMappingDefinitions) {
  for (const alias of [definition.id, ...(definition.aliases || [])]) {
    workflowEvidenceAliasIndex.set(normalizeKey(alias), definition)
  }
}

export const workflowEvidenceMappings = Object.freeze(
  workflowEvidenceMappingDefinitions.reduce((accumulator, definition) => {
    accumulator[definition.id] = definition
    return accumulator
  }, {}),
)

export function resolveWorkflowEvidenceMappings(context = {}) {
  const definition = workflowEvidenceAliasIndex.get(normalizeKey(context.evidenceKey))
  if (!definition) return []

  const resolved = typeof definition.resolve === 'function' ? definition.resolve(context) : definition.resolve
  if (!resolved) return []
  return Array.isArray(resolved) ? resolved.filter(Boolean) : [resolved]
}

export function normalizeWorkflowEvidenceKey(value) {
  return normalizeKey(value)
}
