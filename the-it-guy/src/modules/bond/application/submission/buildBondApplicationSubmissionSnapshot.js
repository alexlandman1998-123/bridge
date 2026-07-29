import { BOND_APPLICATION_SCHEMA_VERSION, cloneBondApplicationValue } from '../bondApplicationState.js'
import { BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION } from '../documents/bondApplicationDocumentRules.js'
import { BOND_APPLICATION_DECLARATION_CONTRACT_VERSION } from './bondApplicationDeclarations.js'
import { BOND_APPLICATION_SUBMISSION_FLOW_VERSION } from './bondApplicationSubmissionLifecycle.js'

function activeDocumentManifestItem(item = {}) {
  const requirement = item.requirement || item
  const document = Array.isArray(item.documents) ? item.documents[0] || null : null
  return {
    requirementKey: requirement.key || null,
    canonicalDocumentType: requirement.canonicalDocumentType || null,
    participantRole: requirement.participantRole || 'primary_applicant',
    requiredBefore: requirement.requiredBefore || null,
    satisfactionMode: requirement.satisfactionMode || null,
    required: Boolean(requirement.required),
    status: item.status || null,
    matchedDocumentId: document?.id || item.matchedDocumentId || null,
    documentStatus: document?.status || null,
    uploadedAt: document?.uploaded_at || document?.created_at || null,
    acceptedAt: document?.accepted_at || null,
    ruleSetVersion: requirement.ruleSetVersion || BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
  }
}

export function buildBondApplicationSignerManifest(signerIdentity = {}) {
  if (Array.isArray(signerIdentity)) {
    return signerIdentity.map((identity, index) => ({
      participantId: identity.participantId || null,
      participantKey: identity.participantKey || null,
      participantRole: identity.participantRole || identity.role || 'primary_applicant',
      fullName: identity.fullName || '',
      identityReference: identity.identityReference || '',
      email: identity.email || '',
      phone: identity.phone || '',
      signingOrder: identity.signingOrder || 1,
      required: identity.required !== false,
      status: identity.status || 'pending',
      ordinal: identity.ordinal || index + 1,
    }))
  }
  return [{
    participantId: signerIdentity.participantId || null,
    participantKey: signerIdentity.participantKey || null,
    participantRole: signerIdentity.participantRole || 'primary_applicant',
    fullName: signerIdentity.fullName || '',
    identityReference: signerIdentity.identityReference || '',
    email: signerIdentity.email || '',
    phone: signerIdentity.phone || '',
    signingOrder: 1,
    required: true,
  }]
}

export function buildBondApplicationSubmissionSnapshot({
  applicationState = {},
  transaction = {},
  submissionVersion = 1,
  declarations = [],
  documentChecklist = {},
  signerIdentity = {},
  signerManifest = null,
  participants = null,
  reviewContextHash = null,
  source = {},
  createdAt = new Date().toISOString(),
} = {}) {
  const primary = applicationState?.participants?.primaryApplicant || {}
  const coApplicant = applicationState?.participants?.coApplicant || null
  const activeDocumentItems = Array.isArray(documentChecklist.items) ? documentChecklist.items : []
  const resolvedSignerManifest = signerManifest || buildBondApplicationSignerManifest(signerIdentity)
  const participantSnapshots = participants || [
    {
      participantRole: 'primary_applicant',
      participantKey: 'primary_applicant:1',
      answers: {
        personal: cloneBondApplicationValue(primary.personal || {}),
        contact: cloneBondApplicationValue(primary.contact || {}),
        address: cloneBondApplicationValue(primary.address || {}),
        marital: cloneBondApplicationValue(primary.marital || {}),
        employment: cloneBondApplicationValue(primary.employment || {}),
        incomeSources: cloneBondApplicationValue(primary.incomeSources || []),
        expenses: cloneBondApplicationValue(primary.expenses || {}),
        monthlyCommitments: cloneBondApplicationValue(primary.monthlyCommitments || []),
        bankAccounts: cloneBondApplicationValue(primary.bankAccounts || []),
        debts: cloneBondApplicationValue(primary.debts || []),
        existingProperties: cloneBondApplicationValue(primary.existingProperties || []),
        assets: cloneBondApplicationValue(primary.assets || []),
        liabilities: cloneBondApplicationValue(primary.liabilities || []),
        credit: cloneBondApplicationValue(primary.credit || {}),
      },
    },
    ...(coApplicant ? [{
      participantRole: 'co_applicant',
      participantKey: 'co_applicant:1',
      answers: {
        personal: cloneBondApplicationValue(coApplicant.personal || {}),
        contact: cloneBondApplicationValue(coApplicant.contact || {}),
        address: cloneBondApplicationValue(coApplicant.address || {}),
        marital: cloneBondApplicationValue(coApplicant.marital || {}),
        employment: cloneBondApplicationValue(coApplicant.employment || {}),
        incomeSources: cloneBondApplicationValue(coApplicant.incomeSources || []),
        expenses: cloneBondApplicationValue(coApplicant.expenses || {}),
        monthlyCommitments: cloneBondApplicationValue(coApplicant.monthlyCommitments || []),
        bankAccounts: cloneBondApplicationValue(coApplicant.bankAccounts || []),
        debts: cloneBondApplicationValue(coApplicant.debts || []),
        existingProperties: cloneBondApplicationValue(coApplicant.existingProperties || []),
        assets: cloneBondApplicationValue(coApplicant.assets || []),
        liabilities: cloneBondApplicationValue(coApplicant.liabilities || []),
        credit: cloneBondApplicationValue(coApplicant.credit || {}),
      },
    }] : []),
  ]
  return {
    snapshotSchemaVersion: coApplicant || participantSnapshots.length > 1 ? '2' : '1',
    submissionVersion,
    transaction: {
      id: applicationState?.application?.transactionId || transaction?.id || null,
      reference: transaction?.reference || transaction?.transaction_reference || null,
    },
    property: cloneBondApplicationValue(applicationState?.application?.property || {}),
    finance: cloneBondApplicationValue(applicationState?.application?.finance || {}),
    applicant: {
      role: 'primary_applicant',
      personal: cloneBondApplicationValue(primary.personal || {}),
      contact: cloneBondApplicationValue(primary.contact || {}),
      address: cloneBondApplicationValue(primary.address || {}),
      marital: cloneBondApplicationValue(primary.marital || {}),
    },
    employmentAndIncome: {
      employment: cloneBondApplicationValue(primary.employment || {}),
      incomeSources: cloneBondApplicationValue(primary.incomeSources || []),
      expenses: cloneBondApplicationValue(primary.expenses || {}),
    },
    monthlyCommitments: cloneBondApplicationValue(primary.monthlyCommitments || []),
    accountsAndAssets: {
      bankAccounts: cloneBondApplicationValue(primary.bankAccounts || []),
      debts: cloneBondApplicationValue(primary.debts || []),
      existingProperties: cloneBondApplicationValue(primary.existingProperties || []),
      assets: cloneBondApplicationValue(primary.assets || []),
      liabilities: cloneBondApplicationValue(primary.liabilities || []),
    },
    creditDeclarations: cloneBondApplicationValue(primary.credit || {}),
    selectedBanks: cloneBondApplicationValue(applicationState?.application?.selectedBankIds || []),
    documentManifest: activeDocumentItems.map(activeDocumentManifestItem),
    declarations: cloneBondApplicationValue(declarations || []),
    participants: participantSnapshots,
    signerManifest: resolvedSignerManifest,
    source: {
      onboardingFormDataId: source.onboardingFormDataId || null,
      sourceUpdatedAt: source.sourceUpdatedAt || null,
      sourceHash: source.sourceHash || null,
      sourceRevision: source.sourceRevision || null,
      reviewContextHash,
    },
    versions: {
      applicationSchemaVersion: BOND_APPLICATION_SCHEMA_VERSION,
      flowVersion: BOND_APPLICATION_SUBMISSION_FLOW_VERSION,
      documentRuleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
      declarationContractVersion: BOND_APPLICATION_DECLARATION_CONTRACT_VERSION,
    },
    createdAt,
  }
}
