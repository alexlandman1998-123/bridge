const ROLE_KEY_BY_CATEGORY = {
  client: 'buyer',
  counterparty: 'seller',
  representative: 'investor',
  organisation: 'tenant',
  compliance: 'prospect',
}

const ROLE_FILTER_ALIASES = {
  all: 'all',
  buyer: 'buyer',
  buyers: 'buyer',
  client: 'buyer',
  clients: 'buyer',
  purchaser: 'buyer',
  purchasers: 'buyer',
  seller: 'seller',
  sellers: 'seller',
  counterparty: 'seller',
  counterparties: 'seller',
  representative: 'investor',
  representatives: 'investor',
  agent: 'investor',
  estate_agent: 'investor',
  transfer_attorney: 'investor',
  bond_attorney: 'investor',
  cancellation_attorney: 'investor',
  bond_originator: 'investor',
  developer_contact: 'investor',
  other: 'investor',
  organisation: 'tenant',
  organisations: 'tenant',
  organization: 'tenant',
  organizations: 'tenant',
  company: 'tenant',
  companies: 'tenant',
  trust: 'tenant',
  trusts: 'tenant',
  compliance: 'prospect',
  prospect: 'prospect',
  prospects: 'prospect',
  active: 'active',
  inactive: 'inactive',
}

const MANUAL_ROLE_LABELS = {
  buyer: 'Client',
  seller: 'Counterparty',
  investor: 'Representative',
  tenant: 'Organisation',
  prospect: 'Compliance',
  agent: 'Estate Agent',
  estate_agent: 'Estate Agent',
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
  bond_originator: 'Bond Originator',
  developer_contact: 'Developer Contact',
  other: 'Other Professional',
}

const COMPLETED_STAGE_KEYS = new Set(['registered', 'completed', 'closed', 'transferred'])
const CLEAR_COMPLIANCE_KEYS = new Set(['', 'clear', 'complete', 'completed', 'approved', 'verified', 'none'])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || []
}

function digitsOnly(value = '') {
  return normalizeText(value).replace(/\D/g, '')
}

function stableSlug(value = '', fallback = 'party') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback
}

function isSafeRouteId(value = '') {
  const text = normalizeText(value)
  return Boolean(text && !text.includes('/') && /^[A-Za-z0-9_.:@-]+$/.test(text))
}

function formatReference(transactionId) {
  return transactionId ? `TRX-${String(transactionId).replaceAll('-', '').slice(0, 8).toUpperCase()}` : 'Pending'
}

function getMatterReference(row = {}) {
  const transaction = row?.transaction || row
  return firstText(
    transaction?.matter_number,
    transaction?.matterNumber,
    transaction?.transaction_reference,
    transaction?.transactionReference,
    transaction?.reference,
    formatReference(transaction?.id),
  )
}

function getMatterType(row) {
  const explicit = normalizeKey(row?.transaction?.transaction_type || row?.transaction?.transactionType)
  if (explicit === 'private' || explicit === 'private_property') return 'private'
  if (explicit === 'development' || explicit === 'developer_sale') return 'development'
  return row?.development?.id || row?.unit?.id ? 'development' : 'private'
}

function getMatterTypeKeys(row = {}) {
  const transaction = row?.transaction || {}
  const signal = [
    transaction.matter_type,
    transaction.matterType,
    transaction.assignment_type,
    transaction.assignmentType,
    transaction.transaction_type,
    transaction.transactionType,
    transaction.finance_type,
    transaction.financeType,
    transaction.attorney_stage,
    transaction.attorneyStage,
    transaction.current_main_stage,
    transaction.currentMainStage,
    transaction.current_sub_stage_summary,
    transaction.currentSubStageSummary,
    transaction.next_action,
    transaction.nextAction,
    transaction.bank,
    transaction.current_bond_bank,
    transaction.currentBondBank,
  ].map(normalizeKey).join(' ')
  const keys = new Set()

  if (signal.includes('bond') || signal.includes('finance') || signal.includes('bank') || signal.includes('guarantee')) {
    keys.add('bond')
  }
  if (signal.includes('cancellation') || signal.includes('cancel') || signal.includes('existing_bond') || transaction.seller_has_existing_bond || transaction.sellerHasExistingBond) {
    keys.add('cancellation')
  }
  if (signal.includes('development') || signal.includes('developer') || row?.development?.id || row?.unit?.id) {
    keys.add('development')
  }
  if (signal.includes('private')) {
    keys.add('private')
  }

  keys.add('transfer')
  return [...keys]
}

function getMatterTypeLabel(typeKey = '') {
  const labels = {
    transfer: 'Transfer',
    bond: 'Bond',
    cancellation: 'Cancellation',
    development: 'Development',
    private: 'Private',
  }
  return labels[typeKey] || humanizeRole(typeKey)
}

function getPrimaryMatterTypeLabel(typeKeys = []) {
  const priority = ['bond', 'cancellation', 'transfer', 'development', 'private']
  const ordered = priority.filter((key) => typeKeys.includes(key))
  if (ordered.includes('bond') && ordered.includes('cancellation')) return 'Bond + Cancellation'
  if (ordered.includes('bond') && ordered.includes('transfer')) return 'Transfer + Bond'
  if (ordered.includes('cancellation') && ordered.includes('transfer')) return 'Transfer + Cancellation'
  return getMatterTypeLabel(ordered[0] || typeKeys[0] || 'transfer')
}

function getPrimaryMatterStatusLabel(statusLabels = []) {
  const labels = statusLabels.map(normalizeText).filter(Boolean)
  const priority = ['Attention', 'Active', 'Registered', 'Cancelled', 'Archived', 'Intake', 'Unlinked']
  return priority.find((label) => labels.includes(label)) || labels[0] || 'Active'
}

function getLastActivityAt(row) {
  const transaction = row?.transaction || {}
  return (
    transaction.last_meaningful_activity_at ||
    transaction.lastMeaningfulActivityAt ||
    transaction.updated_at ||
    transaction.updatedAt ||
    transaction.created_at ||
    transaction.createdAt ||
    row?.unit?.updated_at ||
    row?.unit?.updatedAt ||
    row?.unit?.created_at ||
    row?.unit?.createdAt ||
    null
  )
}

function getPropertyLabel(row) {
  const transaction = row?.transaction || {}
  if (getMatterType(row) === 'private') {
    return (
      [
        transaction.property_address_line_1 || transaction.propertyAddressLine1,
        transaction.suburb || transaction.city,
      ]
        .filter(Boolean)
        .join(', ') ||
      transaction.property_description ||
      transaction.propertyDescription ||
      'Private property matter'
    )
  }

  return `${row?.development?.name || transaction.development_name || transaction.developmentName || 'Unknown Development'} - Unit ${row?.unit?.unit_number || row?.unit?.unitNumber || '-'}`
}

function getStageLabel(row = {}) {
  return firstText(
    row?.stage,
    row?.transaction?.stage,
    row?.transaction?.current_sub_stage_summary,
    row?.transaction?.currentSubStageSummary,
    row?.transaction?.attorney_stage,
    row?.transaction?.attorneyStage,
    'Unknown',
  )
}

function isCompletedMatter(row = {}) {
  const stageKey = normalizeKey(getStageLabel(row))
  return COMPLETED_STAGE_KEYS.has(stageKey) || Boolean(row?.transaction?.registered_at || row?.transaction?.completed_at)
}

function getMatterStatus(row = {}) {
  const transaction = row?.transaction || {}
  const lifecycleKey = normalizeKey(transaction.lifecycle_state || transaction.lifecycleState)
  const stageKey = normalizeKey(getStageLabel(row))
  const operationalKey = normalizeKey(transaction.operational_state || transaction.operationalState || transaction.risk_status || transaction.riskStatus)

  if (['archived', 'archive'].includes(lifecycleKey)) return { key: 'archived', label: 'Archived' }
  if (['cancelled', 'canceled', 'cancelled_matter', 'canceled_matter'].includes(lifecycleKey)) return { key: 'cancelled', label: 'Cancelled' }
  if (isCompletedMatter(row)) return { key: 'registered', label: 'Registered' }
  if (operationalKey.includes('delay') || operationalKey.includes('risk') || stageKey.includes('delay')) return { key: 'attention', label: 'Attention' }
  return { key: 'active', label: 'Active' }
}

function getClientType(row) {
  const type = normalizeKey(row?.transaction?.purchaser_type || row?.transaction?.purchaserType)
  if (type === 'trust') return 'trust'
  if (type === 'company' || type === 'close_corporation' || type === 'cc') return 'company'
  return 'individual'
}

function getTypeBadgeLabel(type) {
  if (type === 'trust') return 'Trust'
  if (type === 'company') return 'Company'
  if (type === 'organisation') return 'Organisation'
  return 'Individual'
}

function inferPartyType({ type = '', roleLabel = '', organisationName = '' } = {}) {
  const normalizedType = normalizeKey(type)
  if (['trust', 'company', 'organisation', 'organization'].includes(normalizedType)) {
    return normalizedType === 'organization' ? 'organisation' : normalizedType
  }

  const roleKey = normalizeKey(roleLabel)
  if (
    organisationName ||
    roleKey.includes('bank') ||
    roleKey.includes('lender') ||
    roleKey.includes('developer') ||
    roleKey.includes('firm') ||
    roleKey.includes('originator')
  ) {
    return 'organisation'
  }

  return 'individual'
}

function humanizeRole(value = '') {
  const key = normalizeKey(value)
  const labels = {
    buyer: 'Purchaser',
    purchaser: 'Purchaser',
    client: 'Client',
    seller: 'Seller',
    vendor: 'Seller',
    estate_agent: 'Estate Agent',
    agent: 'Estate Agent',
    sales_agent: 'Estate Agent',
    transfer_attorney: 'Transfer Attorney',
    bond_attorney: 'Bond Attorney',
    cancellation_attorney: 'Cancellation Attorney',
    attorney: 'Attorney',
    conveyancer: 'Conveyancer',
    bond_originator: 'Bond Originator',
    originator: 'Bond Originator',
    bank: 'Bank',
    lender: 'Lender',
    developer: 'Developer',
  }
  if (labels[key]) return labels[key]
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Matter Party'
}

function getRolePlayerCategory(roleType = '') {
  const key = normalizeKey(roleType)
  if (key.includes('seller') || key.includes('vendor') || key.includes('counterparty')) return 'counterparty'
  if (key.includes('buyer') || key.includes('purchaser') || key === 'client') return 'client'
  if (key.includes('bank') || key.includes('lender') || key.includes('developer')) return 'organisation'
  if (
    key.includes('attorney') ||
    key.includes('conveyancer') ||
    key.includes('agent') ||
    key.includes('originator') ||
    key.includes('broker')
  ) {
    return 'representative'
  }
  return 'representative'
}

function getResponsibleAttorneyLabel(row = {}) {
  const transaction = row?.transaction || {}
  return firstText(
    transaction.assigned_attorney,
    transaction.assignedAttorney,
    transaction.attorney,
    transaction.assigned_attorney_email,
    transaction.assignedAttorneyEmail,
    'Unassigned',
  )
}

function getResponsibleAttorneyEmail(row = {}) {
  const transaction = row?.transaction || {}
  return normalizeEmail(transaction.assigned_attorney_email || transaction.assignedAttorneyEmail)
}

function getComplianceStatus(row = {}) {
  const transaction = row?.transaction || {}
  const explicit = firstText(
    transaction.compliance_status,
    transaction.complianceStatus,
    transaction.fica_status,
    transaction.ficaStatus,
    row?.documentRequestSummary?.status,
  )
  const missingCount = Number(
    row?.documentSummary?.missingCount ??
      row?.documentSummary?.missing_count ??
      transaction.missing_documents_count ??
      transaction.required_documents_missing ??
      transaction.finance_documents_missing ??
      0,
  )

  if (explicit) return humanizeRole(explicit)
  if (missingCount > 0) return `${missingCount} document${missingCount === 1 ? '' : 's'} outstanding`
  return ''
}

function getComplianceState(row = {}) {
  const label = getComplianceStatus(row)
  const key = normalizeKey(label)
  if (hasComplianceFollowUp(row)) {
    return { key: 'attention', label: label || 'Attention needed' }
  }
  if (!label || CLEAR_COMPLIANCE_KEYS.has(key)) {
    return { key: 'clear', label: 'Clear' }
  }
  return { key, label }
}

function hasComplianceFollowUp(row = {}) {
  const transaction = row?.transaction || {}
  const statusKey = normalizeKey(getComplianceStatus(row))
  const missingCount = Number(
    row?.documentSummary?.missingCount ??
      row?.documentSummary?.missing_count ??
      transaction.missing_documents_count ??
      transaction.required_documents_missing ??
      transaction.finance_documents_missing ??
      0,
  )
  if (missingCount > 0) return true
  if (transaction.compliance_review_required || transaction.complianceReviewRequired) return true
  return Boolean(statusKey && !['complete', 'completed', 'approved', 'verified', 'clear'].includes(statusKey))
}

function getSnapshot(row = {}) {
  return firstObject(row.snapshot_json, row.snapshotJson, row.snapshot)
}

function rolePlayerIsActive(row = {}) {
  if (row.removed_at || row.removedAt) return false
  const status = normalizeKey(row.assignment_status || row.assignmentStatus || row.status || 'active')
  return !['removed', 'declined', 'rejected', 'inactive', 'suspended'].includes(status)
}

function buildIdentityKey(candidate = {}) {
  const email = normalizeEmail(candidate.email)
  if (email) return `email:${email}`

  const phoneDigits = digitsOnly(candidate.phone)
  if (phoneDigits.length >= 6) return `phone:${phoneDigits}`

  const sourceId = normalizeText(candidate.sourceRecordId)
  if (sourceId) return `id:${sourceId}`

  const name = normalizeKey(candidate.name)
  return `name:${name || normalizeKey(candidate.roleLabel) || 'party'}`
}

function buildPartyId(candidate = {}, identityKey = '') {
  if (isSafeRouteId(candidate.preferredId)) return candidate.preferredId
  return `party-${stableSlug(identityKey)}`
}

function buildLinkedRecord(row = {}) {
  const reference = getMatterReference(row)
  const property = getPropertyLabel(row)
  return {
    kind: 'transaction',
    id: row?.transaction?.id || null,
    label: [reference, property].filter(Boolean).join(' - '),
    path: row?.transaction?.id ? `/transactions/${row.transaction.id}` : '',
  }
}

function createPartyCandidate(row, options = {}) {
  const category = options.category || 'representative'
  const roleKey = ROLE_KEY_BY_CATEGORY[category] || ROLE_KEY_BY_CATEGORY.representative
  const email = normalizeEmail(options.email)
  const phone = normalizeText(options.phone)
  const name = firstText(options.name, email, phone)
  if (!name && !email && !phone) return null

  const roleKeys = new Set([roleKey])
  const complianceTracked = options.complianceEligible !== false && ['buyer', 'seller'].includes(roleKey)
  if (complianceTracked && hasComplianceFollowUp(row)) {
    roleKeys.add(ROLE_KEY_BY_CATEGORY.compliance)
  }

  const type = inferPartyType(options)
  const roleLabel = firstText(options.roleLabel, humanizeRole(category))
  const typeLabel = firstText(options.typeLabel, getTypeBadgeLabel(type))
  const sourceRecordId = normalizeText(options.sourceRecordId)
  const candidate = {
    source: options.source || category,
    sourceRecordId,
    preferredId: options.preferredId,
    name: name || 'Unnamed party',
    email,
    phone,
    type,
    typeLabel,
    role: roleKey,
    roleLabel,
    roleKeys: [...roleKeys],
    typeLabels: [roleLabel, typeLabel].filter(Boolean),
    organisationName: normalizeText(options.organisationName),
    entityName: type === 'individual' ? '' : firstText(options.organisationName, name),
    complianceStatus: complianceTracked ? getComplianceStatus(row) : '',
    extraSearch: options.extraSearch || [],
  }
  candidate.identityKey = buildIdentityKey(candidate)
  candidate.id = buildPartyId(candidate, candidate.identityKey)
  return candidate
}

function getBuyerCandidate(row) {
  const buyer = row?.buyer || {}
  const transaction = row?.transaction || {}
  const buyerId = firstText(buyer.id, transaction.buyer_id, transaction.buyerId)
  return createPartyCandidate(row, {
    source: 'buyer',
    category: 'client',
    sourceRecordId: buyerId,
    preferredId: buyerId,
    name: firstText(buyer.name, transaction.buyer_name, transaction.buyerName, transaction.client_name, transaction.clientName),
    email: firstText(buyer.email, transaction.buyer_email, transaction.buyerEmail, transaction.client_email, transaction.clientEmail),
    phone: firstText(buyer.phone, transaction.buyer_phone, transaction.buyerPhone, transaction.client_phone, transaction.clientPhone),
    type: getClientType(row),
    roleLabel: 'Purchaser',
  })
}

function getSellerCandidate(row) {
  const transaction = row?.transaction || {}
  return createPartyCandidate(row, {
    source: 'seller',
    category: 'counterparty',
    name: firstText(transaction.seller_name, transaction.sellerName, transaction.vendor_name, transaction.vendorName),
    email: firstText(transaction.seller_email, transaction.sellerEmail, transaction.vendor_email, transaction.vendorEmail),
    phone: firstText(transaction.seller_phone, transaction.sellerPhone, transaction.vendor_phone, transaction.vendorPhone),
    roleLabel: 'Seller',
  })
}

function getAgentCandidate(row) {
  const transaction = row?.transaction || {}
  const agentId = firstText(transaction.assigned_agent_id, transaction.assignedAgentId)
  return createPartyCandidate(row, {
    source: 'estate_agent',
    category: 'representative',
    sourceRecordId: agentId,
    name: firstText(transaction.assigned_agent, transaction.assignedAgent, transaction.agent_name, transaction.agentName),
    email: firstText(transaction.assigned_agent_email, transaction.assignedAgentEmail, transaction.agent_email, transaction.agentEmail),
    phone: firstText(transaction.assigned_agent_phone, transaction.assignedAgentPhone),
    roleLabel: 'Estate Agent',
  })
}

function getBondOriginatorCandidate(row) {
  const transaction = row?.transaction || {}
  return createPartyCandidate(row, {
    source: 'bond_originator',
    category: 'representative',
    sourceRecordId: firstText(transaction.bond_originator_id, transaction.bondOriginatorId),
    name: firstText(transaction.bond_originator, transaction.bondOriginator),
    email: firstText(transaction.assigned_bond_originator_email, transaction.assignedBondOriginatorEmail),
    phone: firstText(transaction.assigned_bond_originator_phone, transaction.assignedBondOriginatorPhone),
    type: 'organisation',
    roleLabel: 'Bond Originator',
    organisationName: firstText(transaction.bond_originator, transaction.bondOriginator),
  })
}

function getBankCandidates(row) {
  const transaction = row?.transaction || {}
  const bankNames = new Set(
    [
      transaction.bank,
      transaction.bank_name,
      transaction.bankName,
      transaction.current_bond_bank,
      transaction.currentBondBank,
      row?.primaryBondApplication?.bank_name,
      row?.primaryBondApplication?.bankName,
      ...firstArray(row?.bondApplications, transaction.bondApplications).map((item) => item?.bank_name || item?.bankName),
    ]
      .map(normalizeText)
      .filter(Boolean),
  )

  return [...bankNames].map((bankName) =>
    createPartyCandidate(row, {
      source: 'bank',
      category: 'organisation',
      name: bankName,
      type: 'organisation',
      roleLabel: 'Bank',
      organisationName: bankName,
      complianceEligible: false,
    }),
  )
}

function getRolePlayerCandidates(row) {
  const rolePlayers = firstArray(
    row?.rolePlayers,
    row?.transaction_role_players,
    row?.transaction?.rolePlayers,
    row?.transaction?.transaction_role_players,
  )
  return rolePlayers
    .filter(rolePlayerIsActive)
    .map((rolePlayer) => {
      const snapshot = getSnapshot(rolePlayer)
      const roleType = firstText(rolePlayer.role_type, rolePlayer.roleType, snapshot.roleType)
      const category = getRolePlayerCategory(roleType)
      const roleLabel = humanizeRole(roleType)
      const organisationName = firstText(
        rolePlayer.organisation_name,
        rolePlayer.organisationName,
        rolePlayer.partner_name,
        rolePlayer.partnerName,
        snapshot.organisationName,
        snapshot.organizationName,
        snapshot.companyName,
        snapshot.partnerName,
      )
      const contactName = firstText(
        rolePlayer.contact_person,
        rolePlayer.contactPerson,
        snapshot.contactPerson,
        snapshot.assigned_user_name,
        snapshot.assignedUserName,
        organisationName,
      )
      return createPartyCandidate(row, {
        source: 'role_player',
        category,
        sourceRecordId: firstText(rolePlayer.organisation_id, rolePlayer.organisationId, rolePlayer.preferred_partner_id, rolePlayer.preferredPartnerId),
        name: contactName,
        email: firstText(rolePlayer.email_address, rolePlayer.emailAddress, snapshot.email, snapshot.assigned_user_email, snapshot.assignedUserEmail),
        phone: firstText(rolePlayer.phone_number, rolePlayer.phoneNumber, snapshot.phone, snapshot.phoneNumber),
        type: category === 'organisation' || contactName === organisationName ? 'organisation' : '',
        roleLabel,
        organisationName,
        extraSearch: [roleType, organisationName],
      })
    })
}

function collectPartyCandidates(row) {
  return [
    getBuyerCandidate(row),
    getSellerCandidate(row),
    getAgentCandidate(row),
    getBondOriginatorCandidate(row),
    ...getBankCandidates(row),
    ...getRolePlayerCandidates(row),
  ].filter(Boolean)
}

function mergeParty(grouped, candidate, row) {
  if (!candidate?.identityKey) return

  if (!grouped.has(candidate.identityKey)) {
    grouped.set(candidate.identityKey, {
      id: candidate.id,
      identityKey: candidate.identityKey,
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      type: candidate.type,
      typeLabel: candidate.typeLabel,
      role: candidate.role,
      roleLabel: candidate.roleLabel,
      entityName: candidate.entityName,
      organisationName: candidate.organisationName,
      complianceStatus: candidate.complianceStatus,
      activeTransactions: 0,
      completedTransactions: 0,
      totalTransactions: 0,
      lastActivityAt: null,
      latestTransactionId: null,
      latestMatterTypeLabel: '',
      latestMatterStatusLabel: '',
      latestMatterReference: '',
      latestPropertyLabel: '',
      latestStage: '',
      assignedAgentName: '',
      assignedAgentEmail: '',
      complianceKey: '',
      complianceLabel: '',
      linkedTransactionIds: [],
      linkedRecords: [],
      transactions: [],
      _roleKeys: new Set(),
      _roleLabels: new Set(),
      _typeLabels: new Set(),
      _matterTypeKeys: new Set(),
      _matterTypeLabels: new Set(),
      _matterStatusKeys: new Set(),
      _matterStatusLabels: new Set(),
      _complianceKeys: new Set(),
      _complianceLabels: new Set(),
      _transactionIds: new Set(),
      _linkedRecordKeys: new Set(),
      _searchParts: new Set(),
    })
  }

  const party = grouped.get(candidate.identityKey)
  const transactionId = row?.transaction?.id || ''
  const lastActivityAt = getLastActivityAt(row)
  const linkedRecord = buildLinkedRecord(row)
  const matterTypeKeys = getMatterTypeKeys(row)
  const matterStatus = getMatterStatus(row)
  const complianceState = (candidate.roleKeys || []).includes(ROLE_KEY_BY_CATEGORY.compliance)
    ? getComplianceState(row)
    : { key: 'clear', label: 'Clear' }

  if (!party.email && candidate.email) party.email = candidate.email
  if (!party.phone && candidate.phone) party.phone = candidate.phone
  if (!party.organisationName && candidate.organisationName) party.organisationName = candidate.organisationName
  if (!party.entityName && candidate.entityName) party.entityName = candidate.entityName
  if (!party.complianceStatus && candidate.complianceStatus) party.complianceStatus = candidate.complianceStatus
  if (!party.complianceKey || party.complianceKey === 'clear') party.complianceKey = complianceState.key
  if (!party.complianceLabel || party.complianceLabel === 'Clear') party.complianceLabel = complianceState.label

  for (const key of candidate.roleKeys || []) party._roleKeys.add(key)
  party._roleLabels.add(candidate.roleLabel)
  party._typeLabels.add(candidate.typeLabel)
  for (const label of candidate.typeLabels || []) party._typeLabels.add(label)
  for (const key of matterTypeKeys) {
    party._matterTypeKeys.add(key)
    party._matterTypeLabels.add(getMatterTypeLabel(key))
  }
  party._matterStatusKeys.add(matterStatus.key)
  party._matterStatusLabels.add(matterStatus.label)
  party._complianceKeys.add(complianceState.key)
  party._complianceLabels.add(complianceState.label)
  for (const item of [candidate.name, candidate.email, candidate.phone, candidate.roleLabel, candidate.organisationName, ...candidate.extraSearch]) {
    const text = normalizeText(item)
    if (text) party._searchParts.add(text)
  }

  if (transactionId && !party._transactionIds.has(transactionId)) {
    party._transactionIds.add(transactionId)
    party.transactions.push(row)
    party.totalTransactions += 1
    if (isCompletedMatter(row)) party.completedTransactions += 1
    else party.activeTransactions += 1
    party.linkedTransactionIds.push(transactionId)
  }

  const linkedKey = linkedRecord.id || linkedRecord.label
  if (linkedKey && !party._linkedRecordKeys.has(linkedKey)) {
    party._linkedRecordKeys.add(linkedKey)
    party.linkedRecords.push(linkedRecord)
  }

  if (!party.lastActivityAt || new Date(lastActivityAt || 0) > new Date(party.lastActivityAt || 0)) {
    party.lastActivityAt = lastActivityAt
    party.latestTransactionId = transactionId || null
    party.latestMatterTypeLabel = getPrimaryMatterTypeLabel(matterTypeKeys)
    party.latestMatterStatusLabel = matterStatus.label
    party.latestMatterReference = getMatterReference(row)
    party.latestPropertyLabel = getPropertyLabel(row)
    party.latestStage = getStageLabel(row)
    party.assignedAgentName = getResponsibleAttorneyLabel(row)
    party.assignedAgentEmail = getResponsibleAttorneyEmail(row)
  }
}

function finalizeParty(party) {
  const roleKeys = [...party._roleKeys]
  const roleLabels = [...party._roleLabels].filter(Boolean)
  const typeLabels = [...party._typeLabels].filter(Boolean)
  const primaryRole = roleKeys[0] || ROLE_KEY_BY_CATEGORY.representative
  const active = party.activeTransactions > 0
  const publicParty = { ...party }
  delete publicParty._roleKeys
  delete publicParty._roleLabels
  delete publicParty._typeLabels
  delete publicParty._matterTypeKeys
  delete publicParty._matterTypeLabels
  delete publicParty._matterStatusKeys
  delete publicParty._matterStatusLabels
  delete publicParty._complianceKeys
  delete publicParty._complianceLabels
  delete publicParty._transactionIds
  delete publicParty._linkedRecordKeys
  delete publicParty._searchParts
  const matterTypeKeys = [...party._matterTypeKeys]
  const matterTypeLabels = [...party._matterTypeLabels]
  const matterStatusKeys = [...party._matterStatusKeys]
  const matterStatusLabels = [...party._matterStatusLabels]
  const complianceKeys = [...party._complianceKeys]
  const complianceLabels = [...party._complianceLabels]
  const statusKeys = new Set(active ? ['active'] : ['inactive'])
  for (const key of matterStatusKeys) statusKeys.add(key)
  const searchText = [
    party.name,
    party.email,
    party.phone,
    party.typeLabel,
    party.roleLabel,
    party.entityName,
    party.organisationName,
    party.complianceStatus,
    party.complianceLabel,
    party.latestMatterTypeLabel,
    party.latestMatterStatusLabel,
    party.latestMatterReference,
    party.latestPropertyLabel,
    party.latestStage,
    party.assignedAgentName,
    ...roleLabels,
    ...typeLabels,
    ...matterTypeLabels,
    ...matterStatusLabels,
    ...complianceLabels,
    ...party.linkedRecords.map((record) => record.label),
    ...party._searchParts,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(' ')

  return {
    ...publicParty,
    role: primaryRole,
    roleKeys,
    roleLabel: roleLabels.join(' + ') || party.roleLabel,
    typeLabels,
    matterTypeKeys,
    matterTypeLabels,
    matterStatusKeys,
    matterStatusLabels,
    complianceKeys,
    complianceLabels,
    complianceKey: party.complianceKey || (complianceKeys.includes('attention') ? 'attention' : 'clear'),
    complianceLabel: party.complianceLabel || complianceLabels.find((label) => label && label !== 'Clear') || 'Clear',
    status: active ? 'active' : 'inactive',
    statusLabel: active ? 'Active' : 'Inactive',
    statusKeys: [...statusKeys],
    searchText,
  }
}

function getManualRoleKey(value = '') {
  const normalized = ROLE_FILTER_ALIASES[normalizeKey(value)] || normalizeKey(value)
  return ['buyer', 'seller', 'investor', 'tenant', 'prospect'].includes(normalized) ? normalized : 'buyer'
}

function getManualPartyType(value = '', roleKey = '') {
  const normalized = normalizeKey(value)
  if (['trust', 'company', 'organisation', 'organization', 'individual'].includes(normalized)) {
    return normalized === 'organization' ? 'organisation' : normalized
  }
  return roleKey === 'tenant' ? 'organisation' : 'individual'
}

function buildManualMatterLabel(record = {}) {
  const reference = firstText(record.matterReference, record.matter_reference)
  return reference ? `Matter ${reference}` : 'No linked matter yet'
}

function normalizeManualParty(record = {}) {
  const name = firstText(record.name, record.email, record.phone)
  if (!name) return null
  const roleKey = getManualRoleKey(record.role)
  const type = getManualPartyType(record.type, roleKey)
  const id = isSafeRouteId(record.id) ? record.id : `manual-party-${stableSlug(name)}`
  const email = normalizeEmail(record.email)
  const phone = normalizeText(record.phone)
  const matterReference = firstText(record.matterReference, record.matter_reference)
  const linkedTransactionId = firstText(record.linkedTransactionId, record.linked_transaction_id)
  const hasMatterReference = Boolean(matterReference || linkedTransactionId)
  const linkStatus = normalizeKey(record.linkStatus || record.link_status)
  const synced = Boolean(record.remoteRolePlayerId || record.remote_role_player_id || ['synced', 'linked'].includes(linkStatus))
  const statusLabel = synced ? 'Linked' : hasMatterReference ? 'Intake' : 'Unlinked'
  const complianceKey = roleKey === 'prospect' || normalizeKey(record.complianceKey) === 'attention' ? 'attention' : 'clear'
  const complianceLabel = complianceKey === 'attention'
    ? firstText(record.complianceLabel, record.complianceStatus, 'Attention needed')
    : 'Clear'
  const roleLabel = firstText(record.roleLabel, MANUAL_ROLE_LABELS[normalizeKey(record.matterRoleType)] || MANUAL_ROLE_LABELS[normalizeKey(record.role)] || MANUAL_ROLE_LABELS[roleKey], humanizeRole(record.matterRoleType || roleKey))
  const typeLabel = getTypeBadgeLabel(type)
  const linkedRecords = hasMatterReference
    ? [{ kind: linkedTransactionId ? 'transaction' : 'matter_reference', id: linkedTransactionId || matterReference, label: buildManualMatterLabel(record), path: linkedTransactionId ? `/transactions/${linkedTransactionId}` : '' }]
    : []
  const lastActivityAt = firstText(record.updatedAt, record.updated_at, record.createdAt, record.created_at)
  const matterTypeKey = synced ? 'linked' : hasMatterReference ? 'intake' : 'unlinked'
  const manualTransactionRows = hasMatterReference
    ? [{
        manualMatter: true,
        transaction: {
          id: linkedTransactionId || null,
          matter_number: matterReference || linkedTransactionId,
          transaction_type: 'manual_intake',
          updated_at: lastActivityAt,
        },
        stage: statusLabel,
        documentSummary: null,
      }]
    : []
  const searchText = [
    name,
    email,
    phone,
    roleLabel,
    typeLabel,
    matterReference,
    statusLabel,
    complianceLabel,
    linkStatus,
    record.notes,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(' ')

  return {
    id,
    identityKey: `manual:${id}`,
    manual: true,
    name,
    email,
    phone,
    type,
    typeLabel,
    typeLabels: [roleLabel, typeLabel].filter(Boolean),
    role: roleKey,
    roleKeys: [roleKey],
    roleLabel,
    entityName: type === 'individual' ? '' : name,
    organisationName: type === 'individual' ? '' : name,
    completedTransactions: 0,
    lastActivityAt,
    latestTransactionId: null,
    latestMatterTypeLabel: synced ? 'Linked Matter' : hasMatterReference ? 'Intake' : 'Unlinked',
    latestMatterStatusLabel: statusLabel,
    latestMatterReference: matterReference || 'Unlinked',
    latestPropertyLabel: buildManualMatterLabel(record),
    latestStage: statusLabel,
    assignedAgentName: firstText(record.assignedAttorneyName, record.assigned_attorney_name, 'Unassigned'),
    assignedAgentEmail: normalizeEmail(record.assignedAttorneyEmail || record.assigned_attorney_email),
    complianceKey,
    complianceLabel,
    complianceStatus: complianceLabel,
    complianceKeys: [complianceKey],
    complianceLabels: [complianceLabel],
    matterTypeKeys: [matterTypeKey],
    matterTypeLabels: [synced ? 'Linked Matter' : hasMatterReference ? 'Intake' : 'Unlinked'],
    matterStatusKeys: [normalizeKey(statusLabel)],
    matterStatusLabels: [statusLabel],
    status: synced || hasMatterReference ? 'active' : 'inactive',
    statusLabel,
    statusKeys: [synced || hasMatterReference ? 'active' : 'inactive', normalizeKey(statusLabel), ...(complianceKey === 'attention' ? ['attention'] : [])],
    linkedTransactionIds: linkedTransactionId ? [linkedTransactionId] : [],
    linkedRecords,
    transactions: manualTransactionRows,
    totalTransactions: manualTransactionRows.length,
    activeTransactions: synced || hasMatterReference ? manualTransactionRows.length : 0,
    linkStatus: record.linkStatus || record.link_status || '',
    remoteRolePlayerId: record.remoteRolePlayerId || record.remote_role_player_id || '',
    syncError: normalizeText(record.syncError || record.sync_error),
    notes: normalizeText(record.notes),
    searchText,
  }
}

function mergeManualParties(clients = [], manualParties = []) {
  if (!manualParties.length) return clients
  const existingKeys = new Set()
  for (const client of clients) {
    existingKeys.add(String(client.id || ''))
    existingKeys.add(String(client.identityKey || ''))
    if (client.email) existingKeys.add(`email:${normalizeEmail(client.email)}`)
    if (client.phone) existingKeys.add(`phone:${digitsOnly(client.phone)}`)
  }

  const manualClients = manualParties
    .map(normalizeManualParty)
    .filter(Boolean)
    .filter((client) => {
      const keys = [
        String(client.id || ''),
        String(client.identityKey || ''),
        client.email ? `email:${normalizeEmail(client.email)}` : '',
        client.phone ? `phone:${digitsOnly(client.phone)}` : '',
      ].filter(Boolean)
      return !keys.some((key) => existingKeys.has(key))
    })

  return [...clients, ...manualClients]
}

export function deriveAttorneyClients(rows = [], manualParties = []) {
  const grouped = new Map()

  for (const row of rows) {
    if (!row?.transaction) continue
    for (const candidate of collectPartyCandidates(row)) {
      mergeParty(grouped, candidate, row)
    }
  }

  const derivedClients = Array.from(grouped.values())
    .map(finalizeParty)
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))

  return mergeManualParties(derivedClients, manualParties)
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))
}

export function filterAttorneyClients(clients = [], { search = '', filter = 'all' } = {}) {
  const normalizedSearch = normalizeText(search).toLowerCase()
  const normalizedFilter = ROLE_FILTER_ALIASES[normalizeKey(filter)] || normalizeKey(filter) || 'all'

  return clients.filter((client) => {
    const roleKeys = Array.isArray(client.roleKeys) ? client.roleKeys : [client.role].filter(Boolean)
    const filterMatch =
      normalizedFilter === 'all'
        ? true
        : normalizedFilter === 'active'
          ? client.status === 'active'
          : normalizedFilter === 'inactive'
            ? client.status === 'inactive'
            : roleKeys.includes(normalizedFilter)

    if (!filterMatch) return false
    if (!normalizedSearch) return true

    const haystack = [
      client.searchText,
      client.name,
      client.email,
      client.phone,
      client.typeLabel,
      client.roleLabel,
      client.latestMatterReference,
      client.latestPropertyLabel,
      client.latestStage,
    ]
      .map((value) => normalizeText(value).toLowerCase())
      .join(' ')

    return haystack.includes(normalizedSearch)
  })
}

export function getAttorneyClientProfile(rows = [], clientId, manualParties = []) {
  const decodedClientId = (() => {
    try {
      return decodeURIComponent(String(clientId || ''))
    } catch {
      return String(clientId || '')
    }
  })()
  const clients = deriveAttorneyClients(rows, manualParties)
  const client = clients.find((item) => String(item.id) === decodedClientId || String(item.identityKey) === decodedClientId)
  if (!client) return null

  const transactions = (client.transactions || [])
    .map((row) => {
      const typeKeys = getMatterTypeKeys(row)
      const status = getMatterStatus(row)
      const complianceState = (client.roleKeys || []).includes(ROLE_KEY_BY_CATEGORY.compliance)
        ? getComplianceState(row)
        : { key: 'clear', label: 'Clear' }
      return {
        id: row?.transaction?.id || null,
        unitId: row?.unit?.id || null,
        reference: getMatterReference(row),
        propertyLabel: getPropertyLabel(row),
        stageLabel: getStageLabel(row),
        type: getMatterType(row),
        typeKeys,
        typeLabel: getPrimaryMatterTypeLabel(typeKeys),
        status: isCompletedMatter(row) ? 'Completed' : 'Active',
        statusKey: status.key,
        statusLabel: status.label,
        complianceKey: complianceState.key,
        complianceLabel: complianceState.label,
        complianceStatus: getComplianceStatus(row),
        responsibleAttorneyName: getResponsibleAttorneyLabel(row),
        responsibleAttorneyEmail: getResponsibleAttorneyEmail(row),
        lastActivityAt: getLastActivityAt(row),
        documentSummary: row?.documentSummary || row?.document_summary || null,
      }
    })
    .sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0))

  return {
    client: {
      ...client,
      latestMatterStatusLabel: client.latestMatterStatusLabel || getPrimaryMatterStatusLabel(client.matterStatusLabels),
    },
    transactions,
  }
}
