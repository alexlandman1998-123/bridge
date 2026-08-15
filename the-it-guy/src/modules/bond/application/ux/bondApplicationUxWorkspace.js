export const BOND_APPLICATION_UX_WORKSPACE_VERSION = 'phase-10-v1'

const SECTION_GUIDANCE = Object.freeze({
  summary: {
    group: 'Confirm',
    title: 'Application summary',
    description: 'Confirm buyer, property, purchase price, and finance structure.',
  },
  personal_details: {
    group: 'Confirm',
    title: 'Personal details',
    description: 'Confirm identity and applicant structure.',
  },
  contact_address: {
    group: 'Confirm',
    title: 'Contact and address',
    description: 'Confirm contact, residential, postal, and legal notice details.',
  },
  employment: {
    group: 'Complete',
    title: 'Employment',
    description: 'Complete occupation, employer, and employment history.',
  },
  credit_history: {
    group: 'Complete',
    title: 'Credit history',
    description: 'Complete credit, debt review, surety, and insolvency declarations.',
  },
  loan_details: {
    group: 'Confirm',
    title: 'Loan details',
    description: 'Confirm property finance, requested bond amount, debit order, and lender preferences.',
  },
  income_deductions_expenses: {
    group: 'Complete',
    title: 'Income and expenses',
    description: 'Complete income, deductions, expenses, and affordability totals.',
  },
  banking_liabilities: {
    group: 'Complete',
    title: 'Banking and debt',
    description: 'Complete bank account, existing home loan, and finance account details.',
  },
  assets_liabilities: {
    group: 'Complete',
    title: 'Assets and liabilities',
    description: 'Complete asset, liability, and net asset value details.',
  },
  declarations_consents: {
    group: 'Sign',
    title: 'Declarations',
    description: 'Accept declarations, consent to checks, and submit the application.',
  },
  documents: {
    group: 'Upload',
    title: 'Documents',
    description: 'Upload supporting documents linked to the application.',
  },
})

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(status = {}) {
  const total = number(status.total)
  const complete = number(status.complete)
  const missing = Math.max(0, total - complete)
  return {
    total,
    complete,
    missing,
    isComplete: Boolean(status.isComplete) || (total > 0 && complete >= total),
    hasMissing: Boolean(status.hasMissing) || missing > 0,
  }
}

function buildSectionCard(section = {}, {
  sectionStatusByKey = {},
  confirmedSectionKeys = [],
  activeSectionKey = '',
} = {}) {
  const guidance = SECTION_GUIDANCE[section.key] || {
    group: 'Complete',
    title: section.label,
    description: 'Complete this application section.',
  }
  const status = normalizeStatus(sectionStatusByKey[section.key] || {})
  const confirmed = confirmedSectionKeys.includes(section.key)
  const state = confirmed
    ? 'buyer_confirmed'
    : status.isComplete
      ? 'ready_to_confirm'
      : status.hasMissing
        ? 'needs_input'
        : 'not_started'

  return {
    key: section.key,
    label: section.label || guidance.title,
    title: guidance.title,
    group: guidance.group,
    description: guidance.description,
    active: section.key === activeSectionKey,
    confirmed,
    state,
    stateLabel: state === 'buyer_confirmed'
      ? 'Confirmed'
      : state === 'ready_to_confirm'
        ? 'Ready'
        : state === 'needs_input'
          ? `${status.complete}/${status.total || status.complete + status.missing} complete`
          : 'Pending',
    completeCount: status.complete,
    totalCount: status.total,
    missingCount: status.missing,
  }
}

function getFirstIncompleteSection(sectionCards = []) {
  return sectionCards.find((section) => !['buyer_confirmed', 'ready_to_confirm'].includes(section.state)) ||
    sectionCards.find((section) => !section.confirmed) ||
    null
}

function buildNextAction({
  activeSectionKey = '',
  activeSectionLabel = '',
  activeCardsComplete = false,
  activeSectionConfirmed = false,
  firstMissingCard = null,
  sectionCards = [],
  requiredDocuments = [],
  dirty = false,
  saving = false,
  submitted = false,
} = {}) {
  if (submitted) {
    return {
      key: 'submitted',
      label: 'Application Submitted',
      detail: 'Your application has already been submitted.',
      targetSection: '',
      fieldPath: '',
      disabled: true,
    }
  }

  if (activeCardsComplete && !activeSectionConfirmed) {
    return {
      key: 'confirm_section',
      label: 'Confirm Section',
      detail: `${activeSectionLabel || 'This section'} has values ready for buyer confirmation.`,
      targetSection: activeSectionKey,
      fieldPath: '',
      disabled: saving,
    }
  }

  if (firstMissingCard?.firstMissingFieldPath) {
    return {
      key: 'complete_missing_field',
      label: 'Complete Missing Field',
      detail: `${firstMissingCard.firstMissingFieldLabel || 'A required field'} is still needed.`,
      targetSection: activeSectionKey,
      fieldPath: firstMissingCard.firstMissingFieldPath,
      disabled: saving,
    }
  }

  const missingDocument = (Array.isArray(requiredDocuments) ? requiredDocuments : []).find((document) => !document?.complete)
  if (missingDocument) {
    return {
      key: 'upload_document',
      label: 'Upload Document',
      detail: `${missingDocument.label || 'A supporting document'} is still needed.`,
      targetSection: 'documents',
      fieldPath: '',
      disabled: saving,
    }
  }

  const firstIncompleteSection = getFirstIncompleteSection(sectionCards)
  if (firstIncompleteSection) {
    return {
      key: 'continue_section',
      label: 'Continue Application',
      detail: `${firstIncompleteSection.label} needs attention.`,
      targetSection: firstIncompleteSection.key,
      fieldPath: '',
      disabled: saving,
    }
  }

  if (dirty) {
    return {
      key: 'save_progress',
      label: 'Save Progress',
      detail: 'Save your latest application changes.',
      targetSection: activeSectionKey,
      fieldPath: '',
      disabled: saving,
    }
  }

  return {
    key: 'submit_application',
    label: 'Submit Application',
    detail: 'All tracked sections are complete. Review declarations and submit.',
    targetSection: 'declarations_consents',
    fieldPath: '',
    disabled: saving,
  }
}

export function buildBondApplicationUxWorkspaceModel({
  sections = [],
  sectionStatusByKey = {},
  activeSectionKey = '',
  confirmedSectionKeys = [],
  activeConfirmationCards = [],
  firstMissingCard = null,
  requiredDocuments = [],
  progressPercent = 0,
  dirty = false,
  saving = false,
  status = '',
} = {}) {
  const sectionCards = (Array.isArray(sections) ? sections : []).map((section) =>
    buildSectionCard(section, {
      sectionStatusByKey,
      confirmedSectionKeys,
      activeSectionKey,
    }),
  )
  const activeSection = sectionCards.find((section) => section.key === activeSectionKey) || sectionCards[0] || null
  const activeCards = Array.isArray(activeConfirmationCards) ? activeConfirmationCards : []
  const activeCardsComplete = activeCards.length > 0 && activeCards.every((card) => card.complete)
  const activeSectionConfirmed = confirmedSectionKeys.includes(activeSectionKey)
  const blockerSections = sectionCards.filter((section) => section.state === 'needs_input')
  const confirmedCount = sectionCards.filter((section) => section.confirmed).length
  const readyToConfirmCount = sectionCards.filter((section) => section.state === 'ready_to_confirm').length
  const submitted = ['submitted', 'approved'].includes(String(status || '').trim().toLowerCase())
  const documentBlockers = (Array.isArray(requiredDocuments) ? requiredDocuments : []).filter((document) => !document?.complete)
  const nextAction = buildNextAction({
    activeSectionKey,
    activeSectionLabel: activeSection?.label || '',
    activeCardsComplete,
    activeSectionConfirmed,
    firstMissingCard,
    sectionCards,
    requiredDocuments,
    dirty,
    saving,
    submitted,
  })

  return {
    version: BOND_APPLICATION_UX_WORKSPACE_VERSION,
    layout: 'task_workspace',
    activeSectionKey,
    activeSection,
    sectionCards,
    nextAction,
    progressPercent: Math.max(0, Math.min(100, number(progressPercent))),
    confirmedCount,
    readyToConfirmCount,
    blockerCount: blockerSections.length + documentBlockers.length,
    blockerSections,
    documentBlockers,
    summaryCards: [
      {
        key: 'confirmed_sections',
        label: 'Confirmed sections',
        value: `${confirmedCount}/${sectionCards.length}`,
        tone: confirmedCount === sectionCards.length ? 'success' : 'neutral',
      },
      {
        key: 'ready_to_confirm',
        label: 'Ready to confirm',
        value: String(readyToConfirmCount),
        tone: readyToConfirmCount ? 'warning' : 'neutral',
      },
      {
        key: 'blockers',
        label: 'Open blockers',
        value: String(blockerSections.length + documentBlockers.length),
        tone: blockerSections.length + documentBlockers.length ? 'danger' : 'success',
      },
    ],
  }
}
