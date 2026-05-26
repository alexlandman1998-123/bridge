import fs from 'node:fs'
import path from 'node:path'

const MANUAL_MAPPING_INPUT = process.env.BOND_ASSIGNMENT_MANUAL_MAPPING || ''

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

function isBondRole(value = '') {
  return [
    'bond_originator',
    'consultant',
    'processor',
    'manager',
    'compliance',
    'branch_manager',
    'team_lead',
    'regional_manager',
  ].includes(normalizeText(value).toLowerCase())
}

function getRowParticipants(row = {}) {
  return Array.isArray(row.transaction_participants)
    ? row.transaction_participants.filter(
        (item) =>
          isActiveParticipant(item) &&
          isBondRole(item.role_type || item.role || item.transaction_role || item.legal_role),
      )
    : []
}

function getRowRolePlayers(row = {}) {
  return Array.isArray(row.transaction_role_players)
    ? row.transaction_role_players.filter(
        (item) =>
          isActiveParticipant(item) &&
          normalizeText(item?.role_type || item?.role || '').toLowerCase() === 'bond_originator',
      )
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
  return normalizeText(
    firstText(entry?.user_id, entry?.userId, entry?.id, entry?.profile?.id, entry?.user?.id),
  )
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

function isBondOrganisation(org = {}) {
  const kind = normalizeText(org.workspace_kind || org.workspaceKind).toLowerCase()
  const type = normalizeText(org.type || org.workspace_type || org.workspaceType).toLowerCase()
  return kind === 'bond_company' || kind === 'personal_originator' || type === 'bond_originator'
}

function isArchivedOrInactive(row = {}) {
  return Boolean(
    row.archived_at ||
      row.deleted_at ||
      row.cancelled_at ||
      String(row.lifecycle_state || '').toLowerCase() === 'archived' ||
      String(row.operational_state || '').toLowerCase() === 'archived' ||
      row.is_active === false,
  )
}

function isTestOrDemo(row = {}) {
  return Boolean(
    row.is_demo_data ||
      String(row.client_name || '').toLowerCase().includes('demo') ||
      String(row.client_name || '').toLowerCase().includes('test'),
  )
}

function isLikelyBondTransaction(row = {}, participants = [], rolePlayers = []) {
  if (hasCanonicalData(row)) return true
  if (normalizeEmail(row.assigned_bond_originator_email)) return true
  if (normalizeText(row.bond_originator)) return true
  if (participants.length > 0 || rolePlayers.length > 0) return true
  const financeType = normalizeText(row.finance_type).toLowerCase()
  const managedBy = normalizeText(row.finance_managed_by).toLowerCase()
  if (financeType.includes('bond') || managedBy.includes('bond')) return true
  return false
}

function loadManualMappings() {
  if (!MANUAL_MAPPING_INPUT) return new Map()
  if (!fs.existsSync(MANUAL_MAPPING_INPUT)) {
    throw new Error(`BOND_ASSIGNMENT_MANUAL_MAPPING was provided but file is missing: ${MANUAL_MAPPING_INPUT}`)
  }
  const entries = JSON.parse(fs.readFileSync(MANUAL_MAPPING_INPUT, 'utf8'))
  if (!Array.isArray(entries)) {
    throw new Error('BOND_ASSIGNMENT_MANUAL_MAPPING must be a JSON array.')
  }
  const map = new Map()
  for (const entry of entries) {
    const transactionId = normalizeText(entry?.transactionId || entry?.transaction_id)
    if (!transactionId) continue
    map.set(transactionId, {
      transactionId,
      bondWorkspaceId: normalizeText(entry?.bondWorkspaceId || entry?.bond_workspace_id),
      reason: normalizeText(entry?.reason),
      confidence: normalizeText(entry?.confidence),
      action: normalizeText(entry?.action || '').toLowerCase(), // accepted_unresolved | map
    })
  }
  return map
}

function buildMembershipIndexes(payload = {}) {
  const memberships = [
    ...(Array.isArray(payload?.organisationUsers) ? payload.organisationUsers : []),
    ...(Array.isArray(payload?.organisation_users) ? payload.organisation_users : []),
    ...(Array.isArray(payload?.membershipUsers) ? payload.membershipUsers : []),
  ]
  const organisations = [...(Array.isArray(payload?.organisations) ? payload.organisations : [])]
  const bondOrganisationIds = new Set(
    organisations
      .filter((org) => isBondOrganisation(org))
      .map((org) => normalizeText(org.id))
      .filter(Boolean),
  )
  const userToWorkspaceIds = new Map()
  const emailToWorkspaceIds = new Map()

  function appendTarget(map, key, workspaceId) {
    if (!key || !workspaceId) return
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(workspaceId)
  }

  for (const membership of memberships) {
    const workspaceId = normalizeText(
      membership?.organisation_id ||
        membership?.workspace_id ||
        membership?.organisationId ||
        membership?.workspaceId,
    )
    if (!workspaceId) continue
    if (bondOrganisationIds.size > 0 && !bondOrganisationIds.has(workspaceId)) continue
    appendTarget(
      userToWorkspaceIds,
      normalizeText(membership?.user_id || membership?.userId),
      workspaceId,
    )
    appendTarget(emailToWorkspaceIds, extractEmail(membership), workspaceId)
  }

  return { bondOrganisationIds, userToWorkspaceIds, emailToWorkspaceIds }
}

function dedupeCandidates(candidates = []) {
  const seen = new Set()
  const deduped = []
  for (const candidate of candidates) {
    const workspaceId = normalizeText(candidate?.workspaceId)
    if (!workspaceId) continue
    if (seen.has(workspaceId)) continue
    seen.add(workspaceId)
    deduped.push({ ...candidate, workspaceId })
  }
  return deduped
}

function resolveWorkspaceFromTransaction(row = {}, context = {}, manualMap = new Map()) {
  const warnings = []
  const transactionId = normalizeText(row?.id || row?.transaction_id || row?.transactionId)
  const participants = getRowParticipants(row)
  const rolePlayers = getRowRolePlayers(row)
  const likelyBond = isLikelyBondTransaction(row, participants, rolePlayers)
  const archived = isArchivedOrInactive(row)
  const demo = isTestOrDemo(row)

  if (!likelyBond) {
    return { status: 'notBondScoped', workspaceId: null, source: 'notBondScoped', warnings, candidates: [] }
  }
  if (archived || demo) {
    return { status: 'archivedOrInactive', workspaceId: null, source: 'archivedOrInactive', warnings, candidates: [] }
  }

  const manual = manualMap.get(transactionId)
  if (manual?.action === 'accepted_unresolved') {
    return { status: 'acceptedUnresolvedLegacy', workspaceId: null, source: 'acceptedUnresolvedLegacy', warnings: [manual.reason || 'manual_accepted_unresolved'], candidates: [] }
  }
  if (manual?.bondWorkspaceId) {
    return {
      status: 'resolved',
      workspaceId: manual.bondWorkspaceId,
      source: 'resolvedFromManualMapping',
      warnings,
      candidates: [{ workspaceId: manual.bondWorkspaceId, source: 'manual_mapping' }],
    }
  }

  const canonicalWorkspaceId = normalizeText(row.bond_workspace_id)
  if (canonicalWorkspaceId) {
    return { status: 'resolved', workspaceId: canonicalWorkspaceId, source: 'resolvedFromCanonical', warnings, candidates: [{ workspaceId: canonicalWorkspaceId, source: 'canonical' }] }
  }

  const candidates = []
  for (const participant of participants) {
    const participantWorkspaceId = normalizeText(
      participant.workspace_id || participant.workspaceId,
    )
    const participantOrganisationId = normalizeText(
      participant.organisation_id || participant.organization_id || participant.organisationId,
    )
    if (participantWorkspaceId) candidates.push({ workspaceId: participantWorkspaceId, source: 'resolvedFromParticipantWorkspace' })
    if (participantOrganisationId) candidates.push({ workspaceId: participantOrganisationId, source: 'resolvedFromParticipantOrganisation' })
  }

  const legacyEmail = normalizeEmail(row.assigned_bond_originator_email)
  const participantEmails = participants.map((entry) => extractEmail(entry)).filter(Boolean)
  const participantUserIds = participants.map((entry) => extractUserId(entry)).filter(Boolean)
  const rolePlayerUserIds = rolePlayers.map((entry) => extractUserId(entry)).filter(Boolean)

  if (legacyEmail && context.emailToWorkspaceIds.has(legacyEmail)) {
    for (const workspaceId of context.emailToWorkspaceIds.get(legacyEmail)) {
      candidates.push({ workspaceId, source: 'resolvedFromMembershipEmail' })
    }
  }
  for (const email of participantEmails) {
    if (!context.emailToWorkspaceIds.has(email)) continue
    for (const workspaceId of context.emailToWorkspaceIds.get(email)) {
      candidates.push({ workspaceId, source: 'resolvedFromMembershipEmail' })
    }
  }
  for (const userId of [...participantUserIds, ...rolePlayerUserIds]) {
    if (!context.userToWorkspaceIds.has(userId)) continue
    for (const workspaceId of context.userToWorkspaceIds.get(userId)) {
      candidates.push({ workspaceId, source: 'resolvedFromMembershipUser' })
    }
  }

  const deduped = dedupeCandidates(candidates)
  if (deduped.length === 1) {
    return {
      status: 'resolved',
      workspaceId: deduped[0].workspaceId,
      source: deduped[0].source,
      warnings,
      candidates: deduped,
    }
  }
  if (deduped.length > 1) {
    warnings.push('ambiguous_workspace_candidates')
    return { status: 'ambiguousWorkspace', workspaceId: null, source: 'ambiguousWorkspace', warnings, candidates: deduped }
  }

  if (context.bondOrganisationIds.size === 1) {
    const [singleWorkspaceId] = [...context.bondOrganisationIds]
    return {
      status: 'singleBondWorkspaceLowConfidence',
      workspaceId: singleWorkspaceId,
      source: 'singleBondWorkspaceLowConfidence',
      warnings: ['single_bond_workspace_fallback'],
      candidates: [{ workspaceId: singleWorkspaceId, source: 'single_bond_workspace' }],
    }
  }

  return { status: 'missingWorkspace', workspaceId: null, source: 'missingWorkspace', warnings, candidates: [] }
}

function attachRelationsToTransactions(payload = {}) {
  const transactionRows = rowsFromPayload(payload)
  const participants = Array.isArray(payload?.transaction_participants)
    ? payload.transaction_participants
    : Array.isArray(payload?.transactionParticipants)
      ? payload.transactionParticipants
      : []
  const rolePlayers = Array.isArray(payload?.transaction_role_players)
    ? payload.transaction_role_players
    : Array.isArray(payload?.transactionRolePlayers)
      ? payload.transactionRolePlayers
      : []

  const participantMap = new Map()
  for (const participant of participants) {
    const transactionId = normalizeText(participant?.transaction_id || participant?.transactionId)
    if (!transactionId) continue
    if (!participantMap.has(transactionId)) participantMap.set(transactionId, [])
    participantMap.get(transactionId).push(participant)
  }

  const rolePlayerMap = new Map()
  for (const rolePlayer of rolePlayers) {
    const transactionId = normalizeText(rolePlayer?.transaction_id || rolePlayer?.transactionId)
    if (!transactionId) continue
    if (!rolePlayerMap.has(transactionId)) rolePlayerMap.set(transactionId, [])
    rolePlayerMap.get(transactionId).push(rolePlayer)
  }

  return transactionRows.map((row) => {
    const transactionId = normalizeText(row?.id || row?.transaction_id || row?.transactionId)
    return {
      ...row,
      transaction_participants: Array.isArray(row?.transaction_participants)
        ? row.transaction_participants
        : participantMap.get(transactionId) || [],
      transaction_role_players: Array.isArray(row?.transaction_role_players)
        ? row.transaction_role_players
        : rolePlayerMap.get(transactionId) || [],
    }
  })
}

function classify(rows = [], payload = {}) {
  const knownEmails = buildEmailIndex([
    ...(Array.isArray(payload?.users) ? payload.users : []),
    ...(Array.isArray(payload?.authUsers) ? payload.authUsers : []),
    ...(Array.isArray(payload?.profiles) ? payload.profiles : []),
    ...(Array.isArray(payload?.organisationUsers) ? payload.organisationUsers : []),
    ...(Array.isArray(payload?.organisation_users) ? payload.organisation_users : []),
    ...(Array.isArray(payload?.membershipUsers) ? payload.membershipUsers : []),
  ])
  const membershipContext = buildMembershipIndexes(payload)
  const manualMap = loadManualMappings()

  const report = {
    totalTransactions: 0,
    canonicalAssignmentPresent: 0,
    legacyEmailOnly: 0,
    legacyTextOnly: 0,
    participantOnly: 0,
    rolePlayerOnly: 0,
    canonicalAndLegacyMatch: 0,
    canonicalAndLegacyMismatch: 0,
    resolvedFromCanonical: 0,
    resolvedFromParticipantWorkspace: 0,
    resolvedFromParticipantOrganisation: 0,
    resolvedFromMembershipEmail: 0,
    resolvedFromMembershipUser: 0,
    resolvedFromManualMapping: 0,
    singleBondWorkspaceLowConfidence: 0,
    missingWorkspace: 0,
    ambiguousWorkspace: 0,
    notBondScoped: 0,
    archivedOrInactive: 0,
    acceptedUnresolvedLegacy: 0,
    missingConsultant: 0,
    missingProcessor: 0,
    multipleBondParticipants: 0,
    unsafeToAutoMigrate: 0,
    safeToBackfill: 0,
    manualReviewRequired: 0,
    missingWorkspaceClassification: {
      totalMissingWorkspaceRows: 0,
      activeBondApplications: 0,
      archivedNonActive: 0,
      nonBondTransactions: 0,
      testDemo: 0,
      legacyTextOnly: 0,
      legacyEmailNoUserMatch: 0,
      participantExistsNoWorkspace: 0,
      manualWorkspaceMappingRequired: 0,
      safeToIgnoreForPhase5: 0,
      unsafeForPhase5: 0,
    },
    examples: {
      legacyTextOnly: [],
      rolePlayerOnly: [],
      canonicalAndLegacyMismatch: [],
      safeToBackfill: [],
      manualReviewRequired: [],
      ambiguousWorkspace: [],
      missingWorkspace: [],
      acceptedUnresolvedLegacy: [],
    },
  }

  for (const row of rows) {
    const transactionId =
      normalizeText(row?.id || row?.transaction_id || row?.transactionId) ||
      `row-${report.totalTransactions + 1}`
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
    const participantEmails = participants.map((entry) => extractEmail(entry)).filter(Boolean)
    const hasParticipantWithUser = participantUserIds.length > 0
    const hasRolePlayerWithUser = rolePlayerUserIds.length > 0
    const rolePlayerOnly =
      !hasCanonical && !hasLegacyEmail && !hasLegacyText && !participants.length && rolePlayers.length > 0
    const hasLegacyContext =
      hasLegacyEmail || hasLegacyText || participants.length > 0 || rolePlayers.length > 0
    const canonicalMatchByUserId =
      Boolean(primaryConsultantId) &&
      (participantUserIds.includes(primaryConsultantId) ||
        rolePlayerUserIds.includes(primaryConsultantId))
    const canonicalMatchByEmail =
      Boolean(legacyEmail) &&
      (legacyEmail === canonicalConsultantEmail || participantEmails.includes(legacyEmail))
    const canonicalConflictByEmail =
      Boolean(legacyEmail && canonicalConsultantEmail && legacyEmail !== canonicalConsultantEmail)
    const canonicalConflictByUser =
      Boolean(primaryConsultantId) &&
      (participantUserIds.length > 0 || rolePlayerUserIds.length > 0) &&
      !canonicalMatchByUserId
    const canonicalConflictByLegacyContext =
      hasLegacyContext && !canonicalMatchByUserId && !canonicalMatchByEmail
    const canonicalLegacyMismatch =
      hasCanonical &&
      (canonicalConflictByEmail || canonicalConflictByUser || canonicalConflictByLegacyContext)
    const canonicalLegacyMatch =
      hasCanonical &&
      hasLegacyContext &&
      !canonicalLegacyMismatch &&
      (canonicalMatchByUserId || canonicalMatchByEmail)
    const workspaceResolution = resolveWorkspaceFromTransaction(
      row,
      membershipContext,
      manualMap,
    )

    report.totalTransactions += 1
    if (hasCanonical) report.canonicalAssignmentPresent += 1
    if (hasLegacyEmail && !hasCanonical) report.legacyEmailOnly += 1
    if (hasLegacyText && !hasCanonical && !hasLegacyEmail) report.legacyTextOnly += 1
    if (!hasCanonical && !hasLegacyEmail && participants.length) report.participantOnly += 1
    if (rolePlayerOnly) report.rolePlayerOnly += 1

    if (report[workspaceResolution.source] !== undefined) report[workspaceResolution.source] += 1

    if (hasCanonical) {
      if (!primaryConsultantId) report.missingConsultant += 1
      if (!processorId) report.missingProcessor += 1
      if (canonicalLegacyMatch) report.canonicalAndLegacyMatch += 1
      if (canonicalLegacyMismatch) report.canonicalAndLegacyMismatch += 1
    }

    if (participants.length > 1) report.multipleBondParticipants += 1

    const safeLegacyEmailBackfill =
      !hasCanonical &&
      hasLegacyEmail &&
      (knownEmails.has(legacyEmail) || hasParticipantWithUser || hasRolePlayerWithUser)
    const safeParticipantBackfill = !hasCanonical && hasParticipantWithUser
    const safeRolePlayerBackfill = !hasCanonical && !participants.length && hasRolePlayerWithUser
    const needsManual =
      (!hasCanonical && hasLegacyText && !hasLegacyEmail) ||
      participants.length > 1 ||
      canonicalLegacyMismatch ||
      workspaceResolution.status === 'ambiguousWorkspace' ||
      workspaceResolution.status === 'singleBondWorkspaceLowConfidence' ||
      (!hasCanonical && hasLegacyEmail && !safeLegacyEmailBackfill) ||
      (!hasCanonical && rolePlayers.length > 1)
    const hasSafeSignal =
      safeLegacyEmailBackfill || safeParticipantBackfill || safeRolePlayerBackfill
    const safeToBackfill =
      hasSafeSignal && workspaceResolution.status === 'resolved' && !needsManual

    if (safeToBackfill) report.safeToBackfill += 1

    const unresolvedUnsafe =
      workspaceResolution.status === 'missingWorkspace' ||
      workspaceResolution.status === 'ambiguousWorkspace' ||
      workspaceResolution.status === 'singleBondWorkspaceLowConfidence'
    if (unresolvedUnsafe || (!hasCanonical && hasLegacyText && !hasLegacyEmail)) {
      report.unsafeToAutoMigrate += 1
    }
    if (needsManual || workspaceResolution.status === 'ambiguousWorkspace') {
      report.manualReviewRequired += 1
    }

    if (workspaceResolution.status === 'missingWorkspace') {
      report.missingWorkspaceClassification.totalMissingWorkspaceRows += 1
      if (isArchivedOrInactive(row)) report.missingWorkspaceClassification.archivedNonActive += 1
      if (!isLikelyBondTransaction(row, participants, rolePlayers))
        report.missingWorkspaceClassification.nonBondTransactions += 1
      if (isTestOrDemo(row)) report.missingWorkspaceClassification.testDemo += 1
      if (hasLegacyText && !hasLegacyEmail)
        report.missingWorkspaceClassification.legacyTextOnly += 1
      if (hasLegacyEmail && !knownEmails.has(legacyEmail))
        report.missingWorkspaceClassification.legacyEmailNoUserMatch += 1
      if ((participants.length > 0 || rolePlayers.length > 0) && !workspaceResolution.candidates.length) {
        report.missingWorkspaceClassification.participantExistsNoWorkspace += 1
      }
      if (isLikelyBondTransaction(row, participants, rolePlayers) && !isArchivedOrInactive(row) && !isTestOrDemo(row)) {
        report.missingWorkspaceClassification.activeBondApplications += 1
        report.missingWorkspaceClassification.manualWorkspaceMappingRequired += 1
        report.missingWorkspaceClassification.unsafeForPhase5 += 1
      } else {
        report.missingWorkspaceClassification.safeToIgnoreForPhase5 += 1
      }
    }

    if (workspaceResolution.status === 'acceptedUnresolvedLegacy') {
      report.missingWorkspaceClassification.safeToIgnoreForPhase5 += 1
      if (report.examples.acceptedUnresolvedLegacy.length < 3) {
        report.examples.acceptedUnresolvedLegacy.push(transactionId)
      }
    }

    if (
      report.examples.legacyTextOnly.length < 3 &&
      hasLegacyText &&
      !hasCanonical &&
      !hasLegacyEmail
    )
      report.examples.legacyTextOnly.push(transactionId)
    if (report.examples.rolePlayerOnly.length < 3 && rolePlayerOnly)
      report.examples.rolePlayerOnly.push(transactionId)
    if (report.examples.canonicalAndLegacyMismatch.length < 3 && canonicalLegacyMismatch)
      report.examples.canonicalAndLegacyMismatch.push(transactionId)
    if (report.examples.safeToBackfill.length < 3 && safeToBackfill)
      report.examples.safeToBackfill.push(transactionId)
    if (
      report.examples.manualReviewRequired.length < 3 &&
      (needsManual || workspaceResolution.status === 'ambiguousWorkspace')
    )
      report.examples.manualReviewRequired.push(transactionId)
    if (
      report.examples.ambiguousWorkspace.length < 3 &&
      workspaceResolution.status === 'ambiguousWorkspace'
    )
      report.examples.ambiguousWorkspace.push(transactionId)
    if (
      report.examples.missingWorkspace.length < 3 &&
      workspaceResolution.status === 'missingWorkspace'
    )
      report.examples.missingWorkspace.push(transactionId)
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
  const allowBuiltInSample =
    String(process.env.BOND_ASSIGNMENT_ALLOW_SAMPLE || '')
      .trim()
      .toLowerCase() === 'true'

  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(
        `BOND_ASSIGNMENT_RECONCILIATION_INPUT was provided but file is missing: ${explicitPath}`,
      )
    }
    return JSON.parse(fs.readFileSync(explicitPath, 'utf8'))
  }
  if (fs.existsSync(fallbackPath)) return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
  if (!allowBuiltInSample) {
    throw new Error(
      'No reconciliation input provided. Set BOND_ASSIGNMENT_RECONCILIATION_INPUT or BOND_ASSIGNMENT_ALLOW_SAMPLE=true.',
    )
  }

  return {
    rows: [
      {
        id: 'sample-1',
        bond_workspace_id: 'workspace-1',
        primary_bond_consultant_user_id: 'consultant-1',
        transaction_participants: [
          {
            role: 'bond_originator',
            user_id: 'consultant-1',
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
  const transactions = attachRelationsToTransactions(payload)
  const report = classify(Array.isArray(transactions) ? transactions : [], payload)
  console.log('bond assignment reconciliation report')
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error('Reconciliation report failed:', error?.message || error)
  process.exitCode = 1
}
