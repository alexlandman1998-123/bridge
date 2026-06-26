function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export const DEVELOPER_TRANSACTION_ROLE_TYPES = Object.freeze([
  'developer_contact',
  'agent',
  'transfer_attorney',
  'bond_originator',
  'bond_attorney',
  'cancellation_attorney',
])

export const DEVELOPER_TRANSACTION_ROLE_LABELS = Object.freeze({
  developer_contact: 'Developer',
  agent: 'Selling Agent',
  transfer_attorney: 'Transfer Attorney',
  bond_originator: 'Bond Originator',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
})

export function normalizeDeveloperTransactionRoleType(value) {
  const normalized = normalizeKey(value)

  if (['developer', 'developer_rep', 'developer_representative', 'developer_contact'].includes(normalized)) {
    return 'developer_contact'
  }

  if (['agent', 'sales_agent', 'selling_agent', 'listing_agent'].includes(normalized)) {
    return 'agent'
  }

  if (['attorney', 'conveyancer', 'transfer_attorney'].includes(normalized)) {
    return 'transfer_attorney'
  }

  if (['bond_originator', 'originator', 'bond_consultant'].includes(normalized)) {
    return 'bond_originator'
  }

  if (['bond_attorney', 'bond_conveyancer'].includes(normalized)) {
    return 'bond_attorney'
  }

  if (['cancellation_attorney', 'cancellation_conveyancer'].includes(normalized)) {
    return 'cancellation_attorney'
  }

  return normalized
}

export function isDeveloperTransactionRoleType(value) {
  return DEVELOPER_TRANSACTION_ROLE_TYPES.includes(normalizeDeveloperTransactionRoleType(value))
}

export function resolveDeveloperTransactionRelationshipProfile({
  transactionType = '',
  roleTypes = [],
  hasExternalAgent = false,
} = {}) {
  const normalizedTransactionType = normalizeKey(transactionType)
  const isDeveloperSale = ['developer_sale', 'development', 'developer'].includes(normalizedTransactionType)
  const normalizedRoleTypes = Array.from(
    new Set((Array.isArray(roleTypes) ? roleTypes : []).map(normalizeDeveloperTransactionRoleType).filter(isDeveloperTransactionRoleType)),
  )

  const requiredRoleTypes = isDeveloperSale ? ['developer_contact'] : []
  const optionalRoleTypes = isDeveloperSale
    ? ['agent', 'transfer_attorney', 'bond_originator', 'bond_attorney', 'cancellation_attorney']
    : []
  const absentRequiredRoleTypes = requiredRoleTypes.filter((roleType) => !normalizedRoleTypes.includes(roleType))
  const activeRoleTypes = Array.from(new Set([...requiredRoleTypes, ...normalizedRoleTypes]))

  return {
    key: isDeveloperSale ? 'developer_sale_relationships' : 'standard_transaction_relationships',
    isDeveloperSale,
    sellerPartyRole: isDeveloperSale ? 'developer_contact' : 'seller',
    buyerPartyRole: 'buyer',
    privateSellerMandateRequired: !isDeveloperSale,
    developerAgentMandateRequired: isDeveloperSale && (hasExternalAgent || normalizedRoleTypes.includes('agent')),
    requiredRoleTypes,
    optionalRoleTypes,
    activeRoleTypes,
    absentRequiredRoleTypes,
    labels: DEVELOPER_TRANSACTION_ROLE_LABELS,
  }
}

export function buildDeveloperTransactionRoleplayerSnapshot(roleplayer = {}, relationshipProfile = {}) {
  const roleType = normalizeDeveloperTransactionRoleType(roleplayer.roleType || roleplayer.role_type)
  return {
    relationshipProfile: relationshipProfile.key || 'developer_sale_relationships',
    relationshipMode: relationshipProfile.isDeveloperSale ? 'developer_buyer' : 'seller_buyer',
    roleType,
    roleLabel: DEVELOPER_TRANSACTION_ROLE_LABELS[roleType] || roleType,
    sellerPartyRole: relationshipProfile.sellerPartyRole || 'developer_contact',
    privateSellerMandateRequired: Boolean(relationshipProfile.privateSellerMandateRequired),
    developerAgentMandateRequired: Boolean(relationshipProfile.developerAgentMandateRequired),
  }
}

function firstPresent(...values) {
  return values.find((value) => normalizeText(value)) || ''
}

function normalizeRoleplayerDisplay(row = {}) {
  const snapshot = row?.snapshot && typeof row.snapshot === 'object'
    ? row.snapshot
    : row?.snapshot_json && typeof row.snapshot_json === 'object'
      ? row.snapshot_json
      : {}
  return {
    roleType: normalizeDeveloperTransactionRoleType(row.roleType || row.role_type || snapshot.roleType),
    name: firstPresent(
      row.partnerName,
      row.partner_name,
      row.contactPerson,
      row.contact_person,
      row.participantName,
      row.participant_name,
      snapshot.companyName,
      snapshot.contactPerson,
      snapshot.assigned_user_name,
      snapshot.partner?.companyName,
      snapshot.partner?.contactPerson,
    ),
    email: firstPresent(row.emailAddress, row.email_address, row.email, row.participantEmail, row.participant_email, snapshot.email, snapshot.assigned_user_email),
    status: normalizeText(row.assignmentStatus || row.assignment_status || row.status || row.stakeholderStatus || row.stakeholder_status || 'active'),
  }
}

export function buildDeveloperTransactionRelationshipSummary({
  transaction = {},
  unit = {},
  buyer = {},
  rolePlayers = [],
  transactionParticipants = [],
} = {}) {
  const allRoleRows = [...(Array.isArray(rolePlayers) ? rolePlayers : []), ...(Array.isArray(transactionParticipants) ? transactionParticipants : [])]
    .map(normalizeRoleplayerDisplay)
    .filter((row) => row.roleType)
  const roleRowsByType = allRoleRows.reduce((accumulator, row) => {
    if (!accumulator.has(row.roleType)) accumulator.set(row.roleType, row)
    return accumulator
  }, new Map())
  const assignedAgentName = firstPresent(transaction.assigned_agent, roleRowsByType.get('agent')?.name)
  const assignedAgentEmail = firstPresent(transaction.assigned_agent_email, roleRowsByType.get('agent')?.email)
  const transferAttorneyName = firstPresent(transaction.attorney, roleRowsByType.get('transfer_attorney')?.name)
  const transferAttorneyEmail = firstPresent(transaction.assigned_attorney_email, roleRowsByType.get('transfer_attorney')?.email)
  const bondOriginatorName = firstPresent(transaction.bond_originator, roleRowsByType.get('bond_originator')?.name)
  const bondOriginatorEmail = firstPresent(transaction.assigned_bond_originator_email, roleRowsByType.get('bond_originator')?.email)
  const developerName = firstPresent(unit?.development?.name, transaction.developer_name, transaction.developer, roleRowsByType.get('developer_contact')?.name)
  const buyerName = firstPresent(buyer?.name, transaction.buyer_name)

  const relationshipProfile = resolveDeveloperTransactionRelationshipProfile({
    transactionType: transaction.transaction_type || 'developer_sale',
    roleTypes: allRoleRows.map((row) => row.roleType),
    hasExternalAgent: Boolean(assignedAgentName || assignedAgentEmail),
  })
  const rows = [
    {
      id: 'developer_contact',
      label: DEVELOPER_TRANSACTION_ROLE_LABELS.developer_contact,
      name: developerName || 'Developer pending',
      email: roleRowsByType.get('developer_contact')?.email || '',
      status: developerName ? 'Active' : 'Missing',
      required: true,
    },
    {
      id: 'buyer',
      label: 'Buyer / Purchaser',
      name: buyerName || 'Buyer pending',
      email: buyer?.email || '',
      status: buyerName ? 'Active' : 'Pending assignment',
      required: true,
    },
    {
      id: 'agent',
      label: DEVELOPER_TRANSACTION_ROLE_LABELS.agent,
      name: assignedAgentName || 'Not assigned',
      email: assignedAgentEmail || '',
      status: assignedAgentName || assignedAgentEmail ? 'Active' : 'Optional',
      required: false,
    },
    {
      id: 'transfer_attorney',
      label: DEVELOPER_TRANSACTION_ROLE_LABELS.transfer_attorney,
      name: transferAttorneyName || 'Not assigned',
      email: transferAttorneyEmail || '',
      status: transferAttorneyName || transferAttorneyEmail ? 'Active' : 'Pending',
      required: false,
    },
    {
      id: 'bond_originator',
      label: DEVELOPER_TRANSACTION_ROLE_LABELS.bond_originator,
      name: bondOriginatorName || 'Not assigned',
      email: bondOriginatorEmail || '',
      status: bondOriginatorName || bondOriginatorEmail ? 'Active' : 'Conditional',
      required: false,
    },
  ]

  const missingRequiredRows = rows.filter((row) => row.required && ['Missing', 'Pending assignment'].includes(row.status))

  return {
    relationshipProfile,
    rows,
    missingRequiredRows,
    privateSellerMandateRequired: relationshipProfile.privateSellerMandateRequired,
    developerAgentMandateRequired: relationshipProfile.developerAgentMandateRequired,
    summaryLabel: relationshipProfile.developerAgentMandateRequired
      ? 'Developer sale with selling agent'
      : 'Developer direct sale',
    mandateLabel: relationshipProfile.developerAgentMandateRequired
      ? 'Developer-agent mandate required'
      : 'No private seller mandate',
  }
}
