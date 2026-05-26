import fs from 'node:fs'
import path from 'node:path'

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function isActiveParticipant(item = {}) {
  const status = normalizeText(item.status || item.removed_at).toLowerCase()
  return !status || status === 'active'
}

function getRowParticipants(row = {}) {
  return Array.isArray(row.transaction_participants)
    ? row.transaction_participants.filter((item) => isActiveParticipant(item))
    : []
}

function getRowRolePlayers(row = {}) {
  return Array.isArray(row.transaction_role_players)
    ? row.transaction_role_players.filter((item) => isActiveParticipant(item) && normalizeText(item?.role_type || item?.role || '').toLowerCase() === 'bond_originator')
    : []
}

function extractEmail(entry = {}) {
  return normalizeEmail(
    firstText(
      entry?.email,
      entry?.participant_email,
      entry?.participantEmail,
      entry?.user_email,
      entry?.userEmail,
      entry?.profile?.email,
      entry?.user?.email,
    ),
  )
}

function extractUserId(entry = {}) {
  return normalizeText(firstText(entry?.user_id, entry?.userId, entry?.id, entry?.profile?.id, entry?.user?.id))
}

function buildEmailIndex(entries = []) {
  const index = new Set()
  for (const entry of Array.isArray(entries) ? entries : []) {
    const email = extractEmail(entry)
    if (email) index.add(email)
  }
  return index
}

function hasCanonicalData(row = {}) {
  return Boolean(
    row.bond_workspace_id ||
      row.primary_bond_consultant_user_id ||
      row.assigned_bond_processor_user_id ||
      row.assigned_bond_manager_user_id ||
      row.assigned_bond_compliance_user_id,
  )
}

function classify(rows = [], payload = {}) {
  const knownEmails = buildEmailIndex([
    ...(Array.isArray(payload?.users) ? payload.users : []),
    ...(Array.isArray(payload?.authUsers) ? payload.authUsers : []),
    ...(Array.isArray(payload?.profiles) ? payload.profiles : []),
    ...(Array.isArray(payload?.organisationUsers) ? payload.organisationUsers : []),
    ...(Array.isArray(payload?.membershipUsers) ? payload.membershipUsers : []),
  ])

  const report = {
    totalTransactions: 0,
    canonicalAssignmentPresent: 0,
    legacyEmailOnly: 0,
    legacyTextOnly: 0,
    participantOnly: 0,
    rolePlayerOnly: 0,
    canonicalAndLegacyMatch: 0,
    canonicalAndLegacyMismatch: 0,
    missingWorkspace: 0,
    missingConsultant: 0,
    missingProcessor: 0,
    multipleBondParticipants: 0,
    unsafeToAutoMigrate: 0,
    safeToBackfill: 0,
    manualReviewRequired: 0,
    examples: {
      legacyTextOnly: [],
      rolePlayerOnly: [],
      canonicalAndLegacyMismatch: [],
      safeToBackfill: [],
      manualReviewRequired: [],
    },
  }

  for (const row of rows) {
    const transactionId = normalizeText(row?.id || row?.transaction_id || row?.transactionId) || `row-${report.totalTransactions + 1}`
    const hasCanonical = hasCanonicalData(row)
    const hasLegacyEmail = Boolean(normalizeEmail(row.assigned_bond_originator_email))
    const hasLegacyText = Boolean(normalizeText(row.bond_originator))
    const participants = getRowParticipants(row)
    const rolePlayers = getRowRolePlayers(row)
    const primaryConsultantId = normalizeText(row.primary_bond_consultant_user_id)
    const processorId = normalizeText(row.assigned_bond_processor_user_id)
    const canonicalConsultantEmail = normalizeEmail(
      firstText(
        row.primary_bond_consultant_email,
        row.primaryConsultantEmail,
        row.primary_consultant_email,
        row.primaryConsultant?.email,
      ),
    )
    const legacyEmail = normalizeEmail(row.assigned_bond_originator_email)
    const rolePlayerUserIds = rolePlayers.map((entry) => extractUserId(entry)).filter(Boolean)
    const participantUserIds = participants.map((entry) => extractUserId(entry)).filter(Boolean)
    const participantEmails = participants
      .map((entry) => extractEmail(entry))
      .filter(Boolean)
    const hasParticipantWithUser = participantUserIds.length > 0
    const hasRolePlayerWithUser = rolePlayerUserIds.length > 0
    const rolePlayerOnly = !hasCanonical && !hasLegacyEmail && !hasLegacyText && !participants.length && rolePlayers.length > 0
    const hasLegacyContext = hasLegacyEmail || hasLegacyText || participants.length > 0 || rolePlayers.length > 0
    const canonicalMatchByUserId =
      Boolean(primaryConsultantId) &&
      (participantUserIds.includes(primaryConsultantId) || rolePlayerUserIds.includes(primaryConsultantId))
    const canonicalMatchByEmail =
      Boolean(legacyEmail) &&
      (legacyEmail === canonicalConsultantEmail || participantEmails.includes(legacyEmail))
    const canonicalConflictByEmail = Boolean(legacyEmail && canonicalConsultantEmail && legacyEmail !== canonicalConsultantEmail)
    const canonicalConflictByUser =
      Boolean(primaryConsultantId) &&
      (participantUserIds.length > 0 || rolePlayerUserIds.length > 0) &&
      !canonicalMatchByUserId
    const canonicalConflictByLegacyContext = hasLegacyContext && !canonicalMatchByUserId && !canonicalMatchByEmail
    const canonicalLegacyMismatch = hasCanonical && (canonicalConflictByEmail || canonicalConflictByUser || canonicalConflictByLegacyContext)
    const canonicalLegacyMatch = hasCanonical && hasLegacyContext && !canonicalLegacyMismatch && (canonicalMatchByUserId || canonicalMatchByEmail)

    report.totalTransactions += 1

    if (hasCanonical) report.canonicalAssignmentPresent += 1
    if (hasLegacyEmail && !hasCanonical) report.legacyEmailOnly += 1
    if (hasLegacyText && !hasCanonical && !hasLegacyEmail) report.legacyTextOnly += 1
    if (!hasCanonical && !hasLegacyEmail && participants.length) report.participantOnly += 1
    if (rolePlayerOnly) report.rolePlayerOnly += 1

    if (hasCanonical) {
      if (!row.bond_workspace_id) report.missingWorkspace += 1
      if (!primaryConsultantId) report.missingConsultant += 1
      if (!processorId) report.missingProcessor += 1
      if (canonicalLegacyMatch) report.canonicalAndLegacyMatch += 1
      if (canonicalLegacyMismatch) report.canonicalAndLegacyMismatch += 1
    }

    if (participants.length > 1) report.multipleBondParticipants += 1

    const safeLegacyEmailBackfill = !hasCanonical && hasLegacyEmail && (knownEmails.has(legacyEmail) || hasParticipantWithUser || hasRolePlayerWithUser)
    const safeParticipantBackfill = !hasCanonical && hasParticipantWithUser
    const safeRolePlayerBackfill = !hasCanonical && !participants.length && hasRolePlayerWithUser
    const isUnsafe = !hasCanonical && hasLegacyText && !hasLegacyEmail && !hasParticipantWithUser && !hasRolePlayerWithUser
    const needsManual =
      (!hasCanonical && hasLegacyText && !hasLegacyEmail) ||
      participants.length > 1 ||
      canonicalLegacyMismatch ||
      (!hasCanonical && hasLegacyEmail && !safeLegacyEmailBackfill) ||
      (!hasCanonical && participants.length > 1) ||
      (!hasCanonical && rolePlayers.length > 1)
    const safeToBackfill = (safeLegacyEmailBackfill || safeParticipantBackfill || safeRolePlayerBackfill) && !needsManual

    if (safeToBackfill) report.safeToBackfill += 1
    if (isUnsafe) report.unsafeToAutoMigrate += 1
    if (needsManual) report.manualReviewRequired += 1

    if (report.examples.legacyTextOnly.length < 3 && hasLegacyText && !hasCanonical && !hasLegacyEmail) report.examples.legacyTextOnly.push(transactionId)
    if (report.examples.rolePlayerOnly.length < 3 && rolePlayerOnly) report.examples.rolePlayerOnly.push(transactionId)
    if (report.examples.canonicalAndLegacyMismatch.length < 3 && canonicalLegacyMismatch) report.examples.canonicalAndLegacyMismatch.push(transactionId)
    if (report.examples.safeToBackfill.length < 3 && safeToBackfill) report.examples.safeToBackfill.push(transactionId)
    if (report.examples.manualReviewRequired.length < 3 && needsManual) report.examples.manualReviewRequired.push(transactionId)
  }

  return report
}

function rowsFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.transactions)) return payload.transactions
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function loadPayload() {
  const explicitPath = process.env.BOND_ASSIGNMENT_RECONCILIATION_INPUT
  const fallbackPath = path.join(process.cwd(), 'tmp-bond-assignment-reconciliation-sample.json')

  if (explicitPath && fs.existsSync(explicitPath)) {
    return JSON.parse(fs.readFileSync(explicitPath, 'utf8'))
  }
  if (fs.existsSync(fallbackPath)) {
    return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
  }

  return {
    rows: [
      {
        id: 'sample-1',
        bond_workspace_id: 'workspace-1',
        primary_bond_consultant_user_id: 'user-1',
        bond_region_id: null,
        assigned_bond_originator_email: 'legacy@example.test',
        assigned_bond_processor_user_id: null,
        transaction_participants: [
          {
            role: 'bond_originator',
            user_id: 'user-1',
            participant_email: 'legacy@example.test',
            status: 'active',
          },
        ],
      },
    ],
  }
}

try {
  const payload = loadPayload()
  const transactions = rowsFromPayload(payload)
  const report = classify(Array.isArray(transactions) ? transactions : [], payload)
  console.log('bond assignment reconciliation report')
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error('Reconciliation report failed:', error?.message || error)
  process.exitCode = 1
}
