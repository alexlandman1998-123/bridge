/**
 * @typedef {Object} BondApplicationState
 * @property {2} schemaVersion
 * @property {{ sourceSchema: string, sourceSchemaVersion: number, status: string | null, submittedAt: string | null }} meta
 * @property {{ transactionId: string | null, applicantStructure: string | null, requiresSurety: string | null, buyerEntity: Object, property: Object, finance: Object, selectedBankIds: Array }} application
 * @property {{ primaryApplicant: Object, coApplicant: Object | null, sureties: Array }} participants
 * @property {{ status: string | null, submittedAt: string | null, typedSignatureName: string | null, typedSignatureDate: string | null, consents: Object }} legacySubmission
 * @property {{ legacyBase: Object, unmappedPaths: Array, warnings: Array, diagnostics: Array }} compatibility
 */

export const BOND_APPLICATION_SCHEMA_VERSION = 2
export const LEGACY_BOND_APPLICATION_SCHEMA = 'legacy_bond_application'
export const LEGACY_BOND_APPLICATION_SCHEMA_VERSION = 1

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
