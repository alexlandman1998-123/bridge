export const PARTNER_BUSINESS_ROLE_TYPES = Object.freeze({
  transferAttorney: 'transfer_attorney',
  bondOriginator: 'bond_originator',
})

export const FINANCE_MIX_BUCKETS = Object.freeze({
  cash: 'cash',
  bond: 'bond',
  hybrid: 'hybrid',
  unknown: 'unknown',
})

const DEFAULT_MAX_ITEMS = 5

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function unwrapTransaction(row = {}) {
  return row?.transaction && typeof row.transaction === 'object' ? row.transaction : row
}

function getTransactionId(row = {}) {
  const transaction = unwrapTransaction(row)
  return normalizeText(
    transaction.id ||
      transaction.transaction_id ||
      transaction.transactionId ||
      row.transaction_id ||
      row.transactionId ||
      row.id,
  )
}

function getDealValue(row = {}) {
  const transaction = unwrapTransaction(row)
  return toNumber(
    transaction.purchase_price ||
      transaction.purchasePrice ||
      transaction.sales_price ||
      transaction.salesPrice ||
      transaction.sale_price ||
      transaction.salePrice ||
      transaction.offer_amount ||
      transaction.offerAmount ||
      transaction.estimated_value ||
      transaction.estimatedValue ||
      transaction.budget ||
      transaction.asking_price ||
      transaction.askingPrice ||
      transaction.price,
  )
}

function getNestedRolePlayers(row = {}) {
  const transaction = unwrapTransaction(row)
  return [
    row.transaction_role_players,
    row.transactionRolePlayers,
    row.rolePlayers,
    row.role_players,
    transaction.transaction_role_players,
    transaction.transactionRolePlayers,
    transaction.rolePlayers,
    transaction.role_players,
  ].find(Array.isArray) || []
}

function buildRolePlayersByTransaction(rolePlayers = []) {
  const grouped = new Map()
  for (const rolePlayer of Array.isArray(rolePlayers) ? rolePlayers : []) {
    const transactionId = normalizeText(rolePlayer?.transaction_id || rolePlayer?.transactionId)
    if (!transactionId) continue
    if (!grouped.has(transactionId)) grouped.set(transactionId, [])
    grouped.get(transactionId).push(rolePlayer)
  }
  return grouped
}

function normalizeRoleType(value = '') {
  const key = normalizeKey(value)
  if (['transfer_attorney', 'transferring_attorney', 'attorney', 'conveyancer'].includes(key)) {
    return PARTNER_BUSINESS_ROLE_TYPES.transferAttorney
  }
  if (['bond_originator', 'originator', 'bond_originator_firm'].includes(key)) {
    return PARTNER_BUSINESS_ROLE_TYPES.bondOriginator
  }
  return key
}

function isRemovedRolePlayer(row = {}) {
  const status = normalizeKey(row.status || row.assignment_status || row.assignmentStatus)
  return Boolean(row.removed_at || row.removedAt || ['removed', 'deleted', 'inactive', 'cancelled', 'canceled'].includes(status))
}

function getRolePlayersForTransaction(row = {}, rolePlayersByTransaction = new Map()) {
  const transactionId = getTransactionId(row)
  return [
    ...getNestedRolePlayers(row),
    ...(transactionId ? rolePlayersByTransaction.get(transactionId) || [] : []),
  ].filter((rolePlayer) => rolePlayer && !isRemovedRolePlayer(rolePlayer))
}

function getSnapshot(row = {}) {
  return row.snapshot_json && typeof row.snapshot_json === 'object'
    ? row.snapshot_json
    : row.snapshot && typeof row.snapshot === 'object'
      ? row.snapshot
      : {}
}

function getRolePlayerPartner(row = {}) {
  const snapshot = getSnapshot(row)
  const label = normalizeText(
    row.partner_name ||
      row.partnerName ||
      row.company_name ||
      row.companyName ||
      row.organisation_name ||
      row.organisationName ||
      row.organization_name ||
      row.organizationName ||
      snapshot.companyName ||
      snapshot.company_name ||
      snapshot.partnerName ||
      snapshot.partner_name ||
      row.contact_person ||
      row.contactPerson ||
      snapshot.contactPerson ||
      snapshot.contact_person ||
      row.email_address ||
      row.emailAddress ||
      row.email ||
      snapshot.email,
  )
  const email = normalizeEmail(row.email_address || row.emailAddress || row.email || snapshot.email)
  const key =
    normalizeText(row.partner_relationship_id || row.partnerRelationshipId || snapshot.relationshipId || snapshot.relationship_id) ||
    normalizeText(row.organisation_id || row.organisationId || row.partner_organisation_id || row.partnerOrganisationId || snapshot.organisationId || snapshot.organisation_id) ||
    email ||
    normalizeKey(label)

  return {
    key,
    label,
    email,
    source: 'role_player',
  }
}

function pickRolePlayerPartner(rolePlayers = [], roleType = '') {
  const normalizedRoleType = normalizeRoleType(roleType)
  const match = rolePlayers.find((rolePlayer) => normalizeRoleType(rolePlayer.role_type || rolePlayer.roleType || rolePlayer.transaction_role || rolePlayer.transactionRole) === normalizedRoleType)
  if (!match) return null
  const partner = getRolePlayerPartner(match)
  return partner.label || partner.key ? partner : null
}

function makeFallbackPartner({ key, label, source }) {
  const normalizedLabel = normalizeText(label)
  const normalizedKey = normalizeText(key) || normalizeEmail(normalizedLabel) || normalizeKey(normalizedLabel)
  return {
    key: normalizedKey,
    label: normalizedLabel,
    email: normalizedLabel.includes('@') ? normalizeEmail(normalizedLabel) : '',
    source,
  }
}

function getFallbackAttorneyPartner(row = {}) {
  const transaction = unwrapTransaction(row)
  const label = normalizeText(
    transaction.attorney ||
      transaction.attorney_name ||
      transaction.attorneyName ||
      transaction.conveyancer_name ||
      transaction.conveyancerName ||
      transaction.transfer_attorney ||
      transaction.transferAttorney ||
      transaction.assigned_attorney_email ||
      transaction.assignedAttorneyEmail,
  )
  if (!label) return null
  return makeFallbackPartner({
    key: transaction.assigned_attorney_email || transaction.assignedAttorneyEmail || label,
    label,
    source: 'transaction',
  })
}

function getFallbackBondOriginatorPartner(row = {}) {
  const transaction = unwrapTransaction(row)
  const label = normalizeText(
    transaction.bond_originator ||
      transaction.bondOriginator ||
      transaction.preferred_bond_originator_name ||
      transaction.preferredBondOriginatorName ||
      transaction.assigned_bond_originator_email ||
      transaction.assignedBondOriginatorEmail,
  )
  if (!label) return null
  return makeFallbackPartner({
    key: transaction.assigned_bond_originator_email || transaction.assignedBondOriginatorEmail || label,
    label,
    source: 'transaction',
  })
}

export function getPartnerBusinessFinanceBucket(row = {}) {
  const transaction = unwrapTransaction(row)
  const financeType = normalizeKey(
    transaction.finance_type ||
      transaction.financeType ||
      transaction.purchase_finance_type ||
      transaction.purchaseFinanceType ||
      transaction.funding_type ||
      transaction.fundingType,
  )
  const cashAmount = toNumber(transaction.cash_amount || transaction.cashAmount)
  const bondAmount = toNumber(transaction.bond_amount || transaction.bondAmount)

  if (financeType.includes('hybrid') || financeType.includes('combination') || financeType.includes('cash_and_bond') || (cashAmount > 0 && bondAmount > 0)) {
    return FINANCE_MIX_BUCKETS.hybrid
  }
  if (financeType.includes('bond') || financeType.includes('finance') || bondAmount > 0) return FINANCE_MIX_BUCKETS.bond
  if (financeType.includes('cash') || cashAmount > 0) return FINANCE_MIX_BUCKETS.cash
  return FINANCE_MIX_BUCKETS.unknown
}

function getDistributionPartner({ row, roleType, rolePlayers }) {
  const rolePlayerPartner = pickRolePlayerPartner(rolePlayers, roleType)
  if (rolePlayerPartner?.label || rolePlayerPartner?.key) return rolePlayerPartner

  if (roleType === PARTNER_BUSINESS_ROLE_TYPES.transferAttorney) return getFallbackAttorneyPartner(row)
  if (roleType === PARTNER_BUSINESS_ROLE_TYPES.bondOriginator) return getFallbackBondOriginatorPartner(row)
  return null
}

function addBucket(map, key, label, row, options = {}) {
  const safeKey = normalizeText(key) || normalizeKey(label) || 'unknown'
  const safeLabel = normalizeText(label) || 'Unknown'
  const existing = map.get(safeKey) || {
    key: safeKey,
    label: safeLabel,
    count: 0,
    dealValue: 0,
    source: options.source || '',
    isUnassigned: Boolean(options.isUnassigned),
  }
  existing.count += 1
  existing.dealValue += getDealValue(row)
  existing.isUnassigned = existing.isUnassigned || Boolean(options.isUnassigned)
  map.set(safeKey, existing)
}

function finalizeItems(map, totalDeals, maxItems = DEFAULT_MAX_ITEMS) {
  const rawItems = [...map.values()]
    .map((item) => ({
      ...item,
      value: item.count,
      percentage: totalDeals ? Math.round((item.count / totalDeals) * 100) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))

  if (!Number.isFinite(maxItems) || maxItems <= 0 || rawItems.length <= maxItems) return rawItems

  const visible = rawItems.slice(0, maxItems)
  const remaining = rawItems.slice(maxItems)
  const other = remaining.reduce(
    (accumulator, item) => ({
      ...accumulator,
      count: accumulator.count + item.count,
      value: accumulator.value + item.count,
      dealValue: accumulator.dealValue + item.dealValue,
      isUnassigned: accumulator.isUnassigned || item.isUnassigned,
    }),
    {
      key: 'other',
      label: 'Other',
      count: 0,
      value: 0,
      dealValue: 0,
      percentage: 0,
      source: 'grouped',
      isOther: true,
      isUnassigned: false,
    },
  )
  other.percentage = totalDeals ? Math.round((other.count / totalDeals) * 100) : 0
  return [...visible, other]
}

function finalizePartnerDistribution(map, totalDeals, { unassignedKey, maxItems }) {
  const rawItems = finalizeItems(map, totalDeals, 0)
  const items = finalizeItems(map, totalDeals, maxItems)
  const assignedItems = rawItems.filter((item) => !item.isUnassigned)
  const unassignedItems = rawItems.filter((item) => item.isUnassigned)
  const assignedDeals = assignedItems.reduce((sum, item) => sum + item.count, 0)
  const unassignedDeals = totalDeals - assignedDeals
  const totalDealValue = rawItems.reduce((sum, item) => sum + toNumber(item.dealValue), 0)
  const assignedDealValue = assignedItems.reduce((sum, item) => sum + toNumber(item.dealValue), 0)
  const unassignedDealValue = unassignedItems.reduce((sum, item) => sum + toNumber(item.dealValue), 0)
  const topPartner = assignedItems[0] || null
  const topPartnerSharePercent = totalDeals && topPartner ? Math.round((topPartner.count / totalDeals) * 100) : 0
  const unassignedPercent = totalDeals ? Math.round((unassignedDeals / totalDeals) * 100) : 0

  return {
    totalDeals,
    assignedDeals,
    unassignedDeals,
    uniquePartners: assignedItems.length,
    assignmentCoveragePercent: totalDeals ? Math.round((assignedDeals / totalDeals) * 100) : 0,
    unassignedPercent,
    totalDealValue,
    assignedDealValue,
    unassignedDealValue,
    averageDealValue: totalDeals ? Math.round(totalDealValue / totalDeals) : 0,
    topPartnerSharePercent,
    topPartner,
    items,
    rawItems,
    unassignedKey,
  }
}

function buildFinanceMix(transactions = [], maxItems = DEFAULT_MAX_ITEMS) {
  const labels = {
    [FINANCE_MIX_BUCKETS.cash]: 'Cash',
    [FINANCE_MIX_BUCKETS.bond]: 'Bond',
    [FINANCE_MIX_BUCKETS.hybrid]: 'Hybrid',
    [FINANCE_MIX_BUCKETS.unknown]: 'Unknown',
  }
  const map = new Map()
  for (const row of transactions) {
    const bucket = getPartnerBusinessFinanceBucket(row)
    addBucket(map, bucket, labels[bucket] || 'Unknown', row)
  }
  const totalDeals = transactions.length
  const rawItems = finalizeItems(map, totalDeals, 0)
  const totalDealValue = rawItems.reduce((sum, item) => sum + toNumber(item.dealValue), 0)
  const dominantBucket = rawItems[0] || null
  return {
    totalDeals,
    cashDeals: rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.cash)?.count || 0,
    bondDeals: rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.bond)?.count || 0,
    hybridDeals: rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.hybrid)?.count || 0,
    unknownDeals: rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.unknown)?.count || 0,
    cashSharePercent: totalDeals ? Math.round(((rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.cash)?.count || 0) / totalDeals) * 100) : 0,
    bondSharePercent: totalDeals ? Math.round(((rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.bond)?.count || 0) / totalDeals) * 100) : 0,
    hybridSharePercent: totalDeals ? Math.round(((rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.hybrid)?.count || 0) / totalDeals) * 100) : 0,
    unknownSharePercent: totalDeals ? Math.round(((rawItems.find((item) => item.key === FINANCE_MIX_BUCKETS.unknown)?.count || 0) / totalDeals) * 100) : 0,
    totalDealValue,
    averageDealValue: totalDeals ? Math.round(totalDealValue / totalDeals) : 0,
    dominantBucket,
    dominantBucketSharePercent: totalDeals && dominantBucket ? Math.round((dominantBucket.count / totalDeals) * 100) : 0,
    items: finalizeItems(map, totalDeals, maxItems),
    rawItems,
  }
}

function hasBondOriginatorAssignment(row = {}, rolePlayers = []) {
  return Boolean(
    pickRolePlayerPartner(rolePlayers, PARTNER_BUSINESS_ROLE_TYPES.bondOriginator) ||
      getFallbackBondOriginatorPartner(row),
  )
}

function shouldIncludeBondOriginatorDeal(row = {}, rolePlayers = []) {
  const bucket = getPartnerBusinessFinanceBucket(row)
  return bucket === FINANCE_MIX_BUCKETS.bond || bucket === FINANCE_MIX_BUCKETS.hybrid || hasBondOriginatorAssignment(row, rolePlayers)
}

export function buildPartnerBusinessDistribution({
  transactions = [],
  rolePlayers = [],
  maxItems = DEFAULT_MAX_ITEMS,
} = {}) {
  const rows = Array.isArray(transactions) ? transactions : []
  const rolePlayersByTransaction = buildRolePlayersByTransaction(rolePlayers)
  const attorneyMap = new Map()
  const bondOriginatorMap = new Map()
  let attorneyDealCount = 0
  let bondOriginatorDealCount = 0

  for (const row of rows) {
    const transactionRolePlayers = getRolePlayersForTransaction(row, rolePlayersByTransaction)
    const attorneyPartner = getDistributionPartner({
      row,
      roleType: PARTNER_BUSINESS_ROLE_TYPES.transferAttorney,
      rolePlayers: transactionRolePlayers,
    })
    attorneyDealCount += 1
    if (attorneyPartner?.label || attorneyPartner?.key) {
      addBucket(attorneyMap, attorneyPartner.key, attorneyPartner.label, row, { source: attorneyPartner.source })
    } else {
      addBucket(attorneyMap, 'unassigned_attorney', 'Unassigned Attorney', row, { isUnassigned: true })
    }

    if (!shouldIncludeBondOriginatorDeal(row, transactionRolePlayers)) continue
    const bondPartner = getDistributionPartner({
      row,
      roleType: PARTNER_BUSINESS_ROLE_TYPES.bondOriginator,
      rolePlayers: transactionRolePlayers,
    })
    bondOriginatorDealCount += 1
    if (bondPartner?.label || bondPartner?.key) {
      addBucket(bondOriginatorMap, bondPartner.key, bondPartner.label, row, { source: bondPartner.source })
    } else {
      addBucket(bondOriginatorMap, 'unassigned_bond_originator', 'Unassigned Bond Originator', row, { isUnassigned: true })
    }
  }

  return {
    attorneys: finalizePartnerDistribution(attorneyMap, attorneyDealCount, {
      unassignedKey: 'unassigned_attorney',
      maxItems,
    }),
    bondOriginators: finalizePartnerDistribution(bondOriginatorMap, bondOriginatorDealCount, {
      unassignedKey: 'unassigned_bond_originator',
      maxItems,
    }),
    financeMix: buildFinanceMix(rows, maxItems),
    meta: {
      totalTransactions: rows.length,
      maxItems,
    },
  }
}
