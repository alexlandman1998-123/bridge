/**
 * @typedef {Object} BondApplicationState
 * @property {2} schemaVersion
 * @property {{ sourceSchema: string, sourceSchemaVersion: number, status: string | null, submittedAt: string | null }} meta
 * @property {{ transactionId: string | null, intent: string, preApproval: Object, applicantStructure: string | null, requiresSurety: string | null, buyerEntity: Object, property: Object, finance: Object, selectedBankIds: Array }} application
 * @property {{ primaryApplicant: Object, coApplicant: Object | null, sureties: Array }} participants
 * @property {{ status: string | null, submittedAt: string | null, typedSignatureName: string | null, typedSignatureDate: string | null, consents: Object }} legacySubmission
 * @property {{ legacyBase: Object, unmappedPaths: Array, warnings: Array, diagnostics: Array }} compatibility
 */

export const BOND_APPLICATION_SCHEMA_VERSION = 2
export const LEGACY_BOND_APPLICATION_SCHEMA = 'legacy_bond_application'
export const LEGACY_BOND_APPLICATION_SCHEMA_VERSION = 1
export const BOND_APPLICATION_INTENTS = Object.freeze({
  bondApplication: 'bond_application',
  preApproval: 'pre_approval',
  bondApplicationWithPreApproval: 'bond_application_with_pre_approval',
})
export const BOND_APPLICATION_PRE_APPROVAL_STATUSES = Object.freeze({
  none: 'none',
  requested: 'requested',
  submitted: 'submitted',
  approved: 'approved',
  declined: 'declined',
  expired: 'expired',
  existing: 'existing',
})

export function cloneBondApplicationValue(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    if (Array.isArray(value)) return value.slice()
    if (value && typeof value === 'object') return { ...value }
    return value
  }
}

export function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function createEmptyBondApplicationPreApproval() {
  return {
    status: BOND_APPLICATION_PRE_APPROVAL_STATUSES.none,
    provider: null,
    approvedAmount: null,
    issuedAt: null,
    expiresAt: null,
    referenceNumber: null,
    conditions: [],
    certificateDocumentId: null,
  }
}

export function createEmptyBondApplicationState() {
  return {
    schemaVersion: BOND_APPLICATION_SCHEMA_VERSION,
    meta: {
      sourceSchema: LEGACY_BOND_APPLICATION_SCHEMA,
      sourceSchemaVersion: LEGACY_BOND_APPLICATION_SCHEMA_VERSION,
      status: null,
      submittedAt: null,
    },
    application: {
      transactionId: null,
      intent: BOND_APPLICATION_INTENTS.bondApplication,
      preApproval: createEmptyBondApplicationPreApproval(),
      applicantStructure: null,
      requiresSurety: null,
      buyerEntity: {
        entityType: 'individual',
        name: null,
        registrationNumber: null,
      },
      property: {
        developmentId: null,
        developmentName: null,
        unitId: null,
        unitReference: null,
        propertyReference: null,
      },
      finance: {
        purchasePrice: null,
        depositAmount: null,
        requestedBondAmount: null,
        financeType: null,
      },
      selectedBankIds: [],
    },
    participants: {
      primaryApplicant: {
        role: 'primary_applicant',
        legacyApplicantKey: 'primary',
        personal: {},
        contact: {},
        address: {},
        marital: {},
        employment: {},
        incomeSources: [],
        expenses: {},
        monthlyCommitments: [],
        bankAccounts: [],
        debts: [],
        assets: [],
        liabilities: [],
        existingProperties: [],
        credit: {},
        declarations: {},
        legacySignature: {},
      },
      coApplicant: null,
      sureties: [],
    },
    legacySubmission: {
      status: null,
      submittedAt: null,
      typedSignatureName: null,
      typedSignatureDate: null,
      consents: {},
    },
    compatibility: {
      legacyBase: {},
      unmappedPaths: [],
      warnings: [],
      diagnostics: [],
    },
  }
}

export function canConvertPreApprovalToBondApplication(applicationState = {}) {
  const intent = String(applicationState?.application?.intent || '').trim().toLowerCase()
  const status = String(applicationState?.application?.preApproval?.status || '').trim().toLowerCase()
  return intent === BOND_APPLICATION_INTENTS.preApproval &&
    [
      BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved,
      BOND_APPLICATION_PRE_APPROVAL_STATUSES.existing,
    ].includes(status)
}

export function convertPreApprovalToBondApplication(applicationState = {}, {
  now = new Date().toISOString(),
  preserveSelectedBankIds = false,
  preApproval = {},
} = {}) {
  if (!canConvertPreApprovalToBondApplication({
    ...applicationState,
    application: {
      ...(applicationState?.application || {}),
      preApproval: {
        ...(applicationState?.application?.preApproval || {}),
        ...preApproval,
      },
    },
  })) {
    throw new Error('Only approved pre-approvals can be converted to a full bond application.')
  }

  const next = cloneBondApplicationValue(applicationState) || createEmptyBondApplicationState()
  next.application = {
    ...(next.application || {}),
    intent: BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval,
    selectedBankIds: preserveSelectedBankIds ? cloneBondApplicationValue(next.application?.selectedBankIds || []) : [],
    preApproval: {
      ...createEmptyBondApplicationPreApproval(),
      ...(next.application?.preApproval || {}),
      ...preApproval,
    },
  }
  next.compatibility = {
    ...(next.compatibility || {}),
    preApprovalConversion: {
      convertedAt: now,
      previousIntent: BOND_APPLICATION_INTENTS.preApproval,
      nextIntent: BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval,
      selectedBankIdsPreserved: Boolean(preserveSelectedBankIds),
    },
  }
  return next
}
