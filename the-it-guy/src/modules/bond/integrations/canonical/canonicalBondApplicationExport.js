import {
  canonicalizeBondApplicationSnapshot,
  hashCanonicalBondApplicationPayload,
} from '../../application/submission/bondApplicationSnapshotHash.js'

export const BOND_APPLICATION_CANONICAL_EXPORT_SCHEMA_VERSION = 'phase-8-canonical-v1'
export const BOND_APPLICATION_CANONICAL_EXPORT_CONTENT_TYPE = 'application/vnd.arch9.bond-application.canonical+json;version=1'
export const BOND_APPLICATION_CANONICAL_CURRENCY = 'ZAR'

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /signed_?url/i,
  /public_?url/i,
  /storage_?path/i,
  /internal_?note/i,
  /analytics/i,
  /invite/i,
  /portal/i,
  /signing_?token/i,
]

const SECTION_ALIASES = {
  personal: ['personal', 'personal_contact', 'identity', 'identity_information'],
  contact: ['contact', 'personal_contact'],
  address: ['address', 'address_residency', 'residency'],
  marital: ['marital', 'marital_details'],
  employment: ['employment', 'employment_income'],
  incomeSources: ['incomeSources', 'income_sources'],
  expenses: ['expenses', 'employment_income'],
  monthlyCommitments: ['monthlyCommitments', 'monthly_commitments'],
  bankAccounts: ['bankAccounts', 'bank_accounts', 'accounts_assets'],
  debts: ['debts', 'monthly_commitments', 'accounts_assets'],
  assets: ['assets', 'accounts_assets', 'financial_position'],
  liabilities: ['liabilities', 'financial_position'],
  existingProperties: ['existingProperties', 'existing_properties', 'accounts_assets'],
  credit: ['credit', 'credit_history', 'credit_declarations'],
  suretyTerms: ['suretyTerms', 'surety_terms_confirmation'],
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function compactObject(value = {}) {
  return Object.entries(value).reduce((accumulator, [key, entry]) => {
    if (entry === undefined) return accumulator
    if (entry === null) {
      accumulator[key] = null
      return accumulator
    }
    if (typeof entry === 'string') {
      const normalized = normalizeText(entry)
      if (normalized) accumulator[key] = normalized
      return accumulator
    }
    if (Array.isArray(entry)) {
      const list = entry.filter((item) => item !== undefined)
      if (list.length) accumulator[key] = list
      return accumulator
    }
    if (isPlainObject(entry)) {
      const compacted = compactObject(entry)
      if (Object.keys(compacted).length) accumulator[key] = compacted
      return accumulator
    }
    accumulator[key] = entry
    return accumulator
  }, {})
}

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive).filter((item) => item !== undefined)
  if (!isPlainObject(value)) return value
  return Object.keys(value).sort().reduce((accumulator, key) => {
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) return accumulator
    const sanitized = stripSensitive(value[key])
    if (sanitized !== undefined) accumulator[key] = sanitized
    return accumulator
  }, {})
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

export function normalizeCanonicalMoney(value, { currency = BOND_APPLICATION_CANONICAL_CURRENCY } = {}) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { amount: value.toFixed(2), currency }
  }
  const text = normalizeText(value).replace(/\s/g, '').replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { amount: normalizeText(value), currency, unparsed: true }
  const [major, fraction = ''] = text.split('.')
  const normalizedFraction = `${fraction}00`.slice(0, 2)
  return { amount: `${major}.${normalizedFraction}`, currency }
}

function normalizeMoneyFields(record = {}) {
  if (Array.isArray(record)) return record.map((item) => normalizeMoneyFields(item))
  if (!isPlainObject(record)) return record
  return Object.keys(record).sort().reduce((accumulator, key) => {
    const value = record[key]
    if (/(amount|salary|income|expense|debt|deposit|price|bond|balance|asset|liability|rental|turnover|profit)$/i.test(key)) {
      accumulator[key] = normalizeCanonicalMoney(value)
    } else {
      accumulator[key] = normalizeMoneyFields(value)
    }
    return accumulator
  }, {})
}

function answersFromParticipant(participant = {}) {
  const answers = participant.answers || participant.sections || {}
  const resolve = (canonicalKey) => {
    for (const alias of SECTION_ALIASES[canonicalKey] || [canonicalKey]) {
      const value = answers[alias]
      if (value !== undefined) return clone(value)
    }
    return undefined
  }
  return compactObject({
    personal: resolve('personal'),
    contact: resolve('contact'),
    address: resolve('address'),
    marital: resolve('marital'),
    employment: resolve('employment'),
    incomeSources: resolve('incomeSources'),
    expenses: resolve('expenses'),
    monthlyCommitments: resolve('monthlyCommitments'),
    bankAccounts: resolve('bankAccounts'),
    debts: resolve('debts'),
    assets: resolve('assets'),
    liabilities: resolve('liabilities'),
    existingProperties: resolve('existingProperties'),
    creditDeclarations: resolve('credit'),
    suretyTerms: resolve('suretyTerms'),
  })
}

function buildParticipantExport(participant = {}, index = 0) {
  const role = participant.role || participant.participantRole || 'primary_applicant'
  const participantKey = participant.participantKey || participant.participant_key || `${role}:${index + 1}`
  return compactObject({
    participantId: participant.participantId || participant.id || null,
    participantKey,
    role,
    ordinal: participant.ordinal || index + 1,
    status: participant.status || null,
    displayName: pickFirst(participant.displayName, participant.fullName, participant.answers?.personal?.full_name),
    answers: normalizeMoneyFields(stripSensitive(answersFromParticipant(participant))),
    declarations: stripSensitive(participant.declarations || participant.declarationEvidence || []),
    documents: [],
  })
}

function normalizeDocumentManifest(documentManifest = []) {
  const items = Array.isArray(documentManifest) ? documentManifest : []
  return items.map((item = {}) => compactObject({
    requirementKey: item.requirementKey || item.requirement_key || item.key,
    participantId: item.participantId || item.participant_id || null,
    participantKey: item.participantKey || item.participant_key || null,
    participantRole: item.participantRole || item.participant_role || null,
    canonicalDocumentType: item.canonicalDocumentType || item.canonical_document_type || null,
    documentRole: item.documentRole || item.document_role || null,
    status: item.status || item.documentStatus || item.document_status || null,
    matchedDocumentId: item.matchedDocumentId || item.matched_document_id || item.documentId || item.document_id || null,
    acceptedAt: item.acceptedAt || item.accepted_at || null,
    requiredBefore: item.requiredBefore || item.required_before || null,
    source: item.source || null,
  }))
}

function attachParticipantDocuments(participants = [], documentManifest = []) {
  return participants.map((participant) => ({
    ...participant,
    documents: documentManifest.filter((item) =>
      (item.participantKey && item.participantKey === participant.participantKey) ||
      (item.participantId && item.participantId === participant.participantId) ||
      (item.participantRole && item.participantRole === participant.role),
    ),
  }))
}

function normalizeSelectedBanks(snapshot = {}) {
  const selectedBanks = snapshot.selectedBanks || snapshot.selected_banks || snapshot.application?.selectedBankIds || []
  return Array.isArray(selectedBanks)
    ? selectedBanks.map((bank) => (isPlainObject(bank) ? stripSensitive(bank) : { bankId: normalizeText(bank) })).filter((bank) => Object.keys(bank).length)
    : []
}

function normalizeSubmissionRecord(submission = {}) {
  return {
    id: submission.id || submission.submissionId || null,
    status: submission.status || null,
    submissionVersion: Number(submission.submission_version || submission.submissionVersion || submission.snapshot_json?.submissionVersion || 1),
    snapshotHash: submission.snapshot_hash || submission.snapshotHash || null,
    submittedAt: submission.submitted_at || submission.submittedAt || null,
    supersededAt: submission.superseded_at || submission.supersededAt || null,
    supersededBySubmissionId: submission.superseded_by_submission_id || submission.supersededBySubmissionId || null,
    sourceApplicationRevision: submission.source_application_revision || submission.sourceApplicationRevision || null,
    reviewContextHash: submission.review_context_hash || submission.reviewContextHash || null,
    bondApplicationId: submission.bond_application_id || submission.bondApplicationId || null,
    transactionId: submission.transaction_id || submission.transactionId || null,
    onboardingFormDataId: submission.onboarding_form_data_id || submission.onboardingFormDataId || null,
  }
}

export function getSnapshotFromSubmission(submission = {}) {
  return submission.snapshot_json || submission.snapshotJson || submission.snapshot || null
}

export function buildCanonicalBondApplicationExport({
  submission = {},
  normalizedApplication = null,
  supplementalDocuments = [],
  packageDocuments = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const snapshot = stripSensitive(getSnapshotFromSubmission(submission) || {})
  const submissionRecord = normalizeSubmissionRecord(submission)
  const participants = Array.isArray(snapshot.participants)
    ? snapshot.participants.map(buildParticipantExport)
    : [buildParticipantExport({ participantRole: 'primary_applicant', answers: {
      personal: snapshot.applicant?.personal,
      contact: snapshot.applicant?.contact,
      address: snapshot.applicant?.address,
      marital: snapshot.applicant?.marital,
      employment: snapshot.employmentAndIncome?.employment,
      incomeSources: snapshot.employmentAndIncome?.incomeSources,
      expenses: snapshot.employmentAndIncome?.expenses,
      monthlyCommitments: snapshot.monthlyCommitments,
      bankAccounts: snapshot.accountsAndAssets?.bankAccounts,
      debts: snapshot.accountsAndAssets?.debts,
      assets: snapshot.accountsAndAssets?.assets,
      liabilities: snapshot.accountsAndAssets?.liabilities,
      existingProperties: snapshot.accountsAndAssets?.existingProperties,
      credit: snapshot.creditDeclarations,
    } })]
  const documentManifest = normalizeDocumentManifest([
    ...(snapshot.documentManifest || snapshot.document_manifest || []),
    ...supplementalDocuments,
  ])
  const canonical = {
    canonicalSchemaVersion: BOND_APPLICATION_CANONICAL_EXPORT_SCHEMA_VERSION,
    contentType: BOND_APPLICATION_CANONICAL_EXPORT_CONTENT_TYPE,
    generatedAt,
    source: {
      transactionId: submissionRecord.transactionId || snapshot.transaction?.id || normalizedApplication?.transactionId || normalizedApplication?.transaction_id || null,
      bondApplicationId: submissionRecord.bondApplicationId || normalizedApplication?.id || null,
      onboardingFormDataId: submissionRecord.onboardingFormDataId || snapshot.source?.onboardingFormDataId || null,
      submissionId: submissionRecord.id,
      submissionVersion: submissionRecord.submissionVersion,
      sourceApplicationRevision: submissionRecord.sourceApplicationRevision || snapshot.source?.sourceRevision || null,
      reviewContextHash: submissionRecord.reviewContextHash || snapshot.source?.reviewContextHash || null,
      snapshotHash: submissionRecord.snapshotHash,
      submittedAt: submissionRecord.submittedAt,
      supersededAt: submissionRecord.supersededAt,
      supersededBySubmissionId: submissionRecord.supersededBySubmissionId,
    },
    application: compactObject({
      property: stripSensitive(snapshot.property || snapshot.shared?.property || snapshot.application?.property || {}),
      finance: normalizeMoneyFields(stripSensitive(snapshot.finance || snapshot.shared?.finance || snapshot.application?.finance || {})),
      applicantStructure: snapshot.application?.applicantStructure || snapshot.shared?.applicantStructure || null,
      selectedBanks: normalizeSelectedBanks(snapshot),
    }),
    participants: attachParticipantDocuments(participants, documentManifest),
    documents: {
      manifest: documentManifest.filter((item) => !item.participantKey && !item.participantId && !item.participantRole),
      packageDocuments: normalizeDocumentManifest(packageDocuments.length ? packageDocuments : snapshot.signingPackageManifest || []),
    },
    declarations: stripSensitive(snapshot.declarations || []),
    signerManifest: stripSensitive(snapshot.signerManifest || snapshot.signer_manifest || []),
    versions: stripSensitive(snapshot.versions || {}),
  }
  return stripSensitive(canonical)
}

export async function hashCanonicalBondApplicationExport(canonicalExport) {
  return hashCanonicalBondApplicationPayload(canonicalExport)
}

export function canonicalizeBondApplicationExport(canonicalExport) {
  return canonicalizeBondApplicationSnapshot(canonicalExport)
}

