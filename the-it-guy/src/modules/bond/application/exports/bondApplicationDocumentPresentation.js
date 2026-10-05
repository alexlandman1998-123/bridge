import { BOND_APPLICATION_QUESTIONS, BOND_APPLICATION_REPEATABLE_GROUPS } from '../flow/bondApplicationFlowContract.js'

const fields = [...BOND_APPLICATION_QUESTIONS, ...Object.values(BOND_APPLICATION_REPEATABLE_GROUPS).flatMap((group) => group.itemFields)]
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 })
const moneyAliases = new Set(['balance', 'outstandingBalance', 'monthlyRepayment', 'monthlyPayment', 'amount', 'rent', 'groceries', 'currentValue'])
const recordNames = { assets: 'Asset', liabilities: 'Liability', debts: 'Debt', incomeSources: 'Income source', monthlyCommitments: 'Commitment', bankAccounts: 'Account', existingProperties: 'Property' }
export const bondDocumentLabel = (value) => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())
const groupNames = { personal: 'Personal details', contact: 'Contact details', address: 'Residential address', marital: 'Marriage and dependants', employment: 'Employment and business', incomeSources: 'Additional income', expenses: 'Monthly income and expenses', monthlyCommitments: 'Monthly commitments', bankAccounts: 'Bank accounts', debts: 'Existing debts', existingProperties: 'Properties you own', assets: 'Assets', liabilities: 'Other liabilities', credit: 'Credit history', personal_contact: 'Personal and contact details', address_residency: 'Address and residency', marital_details: 'Marriage and dependants', employment_income: 'Employment, income and expenses', monthly_commitments: 'Monthly commitments', accounts_assets: 'Accounts, debts and assets', credit_history: 'Credit history' }

function fieldFor(key, group, selfEmployed) {
  if (selfEmployed && key === 'employer_name') return fields.find((item) => item.key === 'business_name')
  if (selfEmployed && key === 'gross_salary') return fields.find((item) => item.key === 'business_income')
  const repeatable = BOND_APPLICATION_REPEATABLE_GROUPS[group]
    || Object.values(BOND_APPLICATION_REPEATABLE_GROUPS).find((item) => item.path.split('.').at(-1) === group)
  return repeatable?.itemFields.find((item) => item.path === key)
    || (key === 'type' ? null : fields.find((item) => item.path.split('.').at(-1) === key))
}

export function buildBondDocumentRows(value, { prefix = '', group = '', selfEmployed = false } = {}) {
  if (Array.isArray(value)) {
    if (!value.length) return [{ label: prefix || 'Records', value: 'None recorded' }]
    return value.flatMap((record, index) => buildBondDocumentRows(record, { prefix: `${prefix || recordNames[group] || 'Record'} ${index + 1}`, group, selfEmployed }))
  }
  if (value && typeof value === 'object') {
    const rows = Object.entries(value).flatMap(([key, item]) => {
      if (item === undefined || item === null || item === '') return []
      const field = fieldFor(key, group, selfEmployed)
      const label = key === 'occupation_status' ? 'Income type' : groupNames[key] || field?.label || bondDocumentLabel(key)
      if (typeof item === 'object') return buildBondDocumentRows(item, { prefix: [prefix, label].filter(Boolean).join(' / '), group: key, selfEmployed })
      const option = field?.options?.find((entry) => entry.value === item)
      const rendered = typeof item === 'boolean' ? (item ? 'Yes' : 'No')
        : (field?.type === 'currency' || moneyAliases.has(key)) && Number.isFinite(Number(item)) ? currency.format(Number(item))
          : option?.label || (key === 'type' ? bondDocumentLabel(item) : String(item))
      return [{ label: [prefix, label].filter(Boolean).join(' / '), value: rendered }]
    })
    return rows.length ? rows : [{ label: prefix || 'Details', value: 'Not provided' }]
  }
  return [{ label: prefix || 'Details', value: value === false ? 'No' : value === true ? 'Yes' : String(value ?? 'Not provided') }]
}

export function buildBondApplicationDocumentPresentation(snapshot = {}) {
  const shared = snapshot.shared || { property: snapshot.property || {}, purchaserEntity: snapshot.purchaserEntity || {}, finance: snapshot.finance || {} }
  const sections = [{ key: 'property_finance', title: 'Property and requested loan', rows: buildBondDocumentRows(shared), screenKey: 'application_confirmation' }]
  sections[0].rows.push({ label: 'Application type', value: bondDocumentLabel(snapshot.applicationIntent || 'bond_application') }, { label: 'Selected banks', value: (snapshot.selectedBanks || []).join(', ') || 'Not selected' })
  const participants = snapshot.participants || []
  for (const [index, participant] of participants.entries()) {
    const role = participant.participantRole || participant.role || 'primary_applicant'
    const answers = participant.answers || {}
    const personal = answers.personal || answers.personal_contact?.personal || {}
    const name = [personal.first_name, personal.surname].filter(Boolean).join(' ')
    const heading = `${bondDocumentLabel(role)}${name ? ` - ${name}` : ` ${index + 1}`}`
    const selfEmployed = (answers.employment || answers.employment_income?.employment)?.occupation_status === 'self_employed'
    for (const [group, details] of Object.entries(answers)) {
      sections.push({ key: `${participant.participantKey || index}:${group}`, title: groupNames[group] || bondDocumentLabel(group), participant: heading, rows: buildBondDocumentRows(details, { group, selfEmployed }) })
    }
  }
  const declarationEvidence = snapshot.declarations?.length ? snapshot.declarations : participants.flatMap((participant) => (participant.declarations || []).map((declaration) => ({ ...declaration, participantKey: declaration.participantKey || participant.participantKey })))
  const declarations = declarationEvidence.map((item) => ({ ...item, title: item.title || bondDocumentLabel(item.key) }))
  const documentChecklist = (snapshot.documentManifest || []).map((item) => ({ title: item.title || bondDocumentLabel(item.requirementKey), participant: item.participantRole ? bondDocumentLabel(item.participantRole) : '', status: bondDocumentLabel(item.status || 'not_received'), requiredBefore: bondDocumentLabel(item.requiredBefore || 'originator review'), fileCount: item.documents?.length || (item.matchedDocumentId ? 1 : 0), minimumFileCount: item.minimumFileCount || 1 }))
  return { reference: snapshot.reviewedVersion?.reference || snapshot.transaction?.reference || snapshot.transaction?.id || snapshot.application?.transactionId || 'Draft application', version: snapshot.submissionVersion || 1, sections, declarations, documentChecklist, signers: snapshot.signerManifest || [] }
}
