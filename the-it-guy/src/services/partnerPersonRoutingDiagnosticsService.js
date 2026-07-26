import {
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared.js'

const ATTORNEY_ASSIGNMENT_COLUMNS = [
  'id',
  'transaction_id',
  'attorney_firm_id',
  'firm_id',
  'assignment_type',
  'attorney_role',
  'attorney_user_id',
  'primary_attorney_id',
  'preferred_attorney_user_id',
  'preferred_contact_name',
  'preferred_contact_email',
  'firm_acceptance_status',
  'staff_assignment_status',
  'allocation_state',
  'assignment_status',
  'status',
  'assigned_at',
  'updated_at',
  'created_at',
]

const BOND_APPLICATION_COLUMNS = [
  'id',
  'transaction_id',
  'assigned_organisation_id',
  'assigned_region_id',
  'assigned_workspace_unit_id',
  'assigned_branch_id',
  'assigned_user_id',
  'scope_level',
  'assignment_status',
  'assignment_source',
  'updated_at',
  'created_at',
]

const TRANSACTION_COLUMNS = [
  'id',
  'organisation_id',
  'bond_workspace_id',
  'bond_region_id',
  'bond_workspace_unit_id',
  'primary_bond_consultant_user_id',
  'bond_assignment_status',
  'bond_assignment_source',
  'assigned_bond_originator_email',
  'bond_originator',
  'updated_at',
  'created_at',
]

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function unique(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function daysSince(value, now = new Date()) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))
}

function latestTimestamp(row = {}) {
  return row.updated_at || row.updatedAt || row.assigned_at || row.assignedAt || row.created_at || row.createdAt || null
}

function severityForAge(ageDays, staleAfterDays) {
  if (Number.isFinite(ageDays) && ageDays >= staleAfterDays) return 'critical'
  return 'warning'
}

function getAttorneyLane(row = {}) {
  const role = normalizeLower(row.attorney_role || row.attorneyRole)
  if (role.includes('bond')) return 'bond'
  if (role.includes('cancellation')) return 'cancellation'
  const type = normalizeLower(row.assignment_type || row.assignmentType)
  if (type.includes('bond')) return 'bond'
  if (type.includes('cancellation')) return 'cancellation'
  return 'transfer'
}

function getAttorneyPrimaryUserId(row = {}) {
  return normalizeText(row.attorney_user_id || row.attorneyUserId || row.primary_attorney_id || row.primaryAttorneyId)
}

function getAttorneyPreferredUserId(row = {}) {
  return normalizeText(row.preferred_attorney_user_id || row.preferredAttorneyUserId)
}

function getAttorneyFirmId(row = {}) {
  return normalizeText(row.attorney_firm_id || row.attorneyFirmId || row.firm_id || row.firmId)
}

function getBondApplicationUserId(row = {}) {
  return normalizeText(row.assigned_user_id || row.assignedUserId)
}

function getBondApplicationOrganisationId(row = {}) {
  return normalizeText(row.assigned_organisation_id || row.assignedOrganisationId)
}

function getTransactionPrimaryConsultantId(transaction = {}) {
  return normalizeText(transaction.primary_bond_consultant_user_id || transaction.primaryBondConsultantUserId)
}

function getTransactionBondWorkspaceId(transaction = {}) {
  return normalizeText(transaction.bond_workspace_id || transaction.bondWorkspaceId)
}

function buildIssue({
  area,
  code,
  severity = 'warning',
  recordId = '',
  transactionId = '',
  ageDays = null,
  message = '',
  recommendation = '',
  href = '',
  ownerRole = 'Operations',
  metadata = {},
} = {}) {
  return {
    area,
    code,
    severity,
    recordId: normalizeText(recordId),
    transactionId: normalizeText(transactionId),
    ageDays,
    message,
    recommendation,
    href,
    ownerRole,
    metadata,
  }
}

function buildAction({
  id,
  area,
  code,
  mode = 'manual_review',
  status = 'review_required',
  severity = 'warning',
  recordId = '',
  transactionId = '',
  label = '',
  description = '',
  recommendation = '',
  href = '',
  ownerRole = 'Operations',
  patch = null,
  metadata = {},
} = {}) {
  return {
    id: normalizeText(id) || `${area}-${code}-${recordId || transactionId || Math.random().toString(36).slice(2)}`,
    area,
    code,
    mode,
    status,
    severity,
    recordId: normalizeText(recordId),
    transactionId: normalizeText(transactionId),
    label,
    description,
    recommendation,
    href,
    ownerRole,
    patch,
    metadata,
  }
}

function diagnoseAttorneyAssignment(row = {}, { now = new Date(), staleAfterDays = 2 } = {}) {
  const allocationState = normalizeLower(row.allocation_state || row.allocationState)
  const firmAcceptanceStatus = normalizeLower(row.firm_acceptance_status || row.firmAcceptanceStatus)
  const staffAssignmentStatus = normalizeLower(row.staff_assignment_status || row.staffAssignmentStatus)
  const assignmentStatus = normalizeLower(row.assignment_status || row.assignmentStatus || row.status)
  const primaryUserId = getAttorneyPrimaryUserId(row)
  const preferredUserId = getAttorneyPreferredUserId(row)
  const ageDays = daysSince(latestTimestamp(row), now)
  const lane = getAttorneyLane(row)
  const transactionId = normalizeText(row.transaction_id || row.transactionId)
  const recordId = normalizeText(row.id)
  const issues = []

  if (['removed', 'declined', 'completed'].includes(allocationState) || ['removed', 'declined', 'completed'].includes(assignmentStatus)) {
    return issues
  }

  if (allocationState === 'awaiting_staff_assignment' && !primaryUserId) {
    issues.push(buildIssue({
      area: 'attorney',
      code: 'attorney_awaiting_internal_assignment',
      severity: severityForAge(ageDays, staleAfterDays),
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Firm manager',
      href: transactionId ? `/transactions/${encodeURIComponent(transactionId)}?diagnostic=attorney_awaiting_internal_assignment` : '/attorney/matters/incoming',
      message: 'The firm accepted this matter but no primary attorney has been assigned yet.',
      recommendation: 'Assign the primary attorney from Incoming Matters so the person sees it in their queue.',
      metadata: { lane, firmId: getAttorneyFirmId(row), preferredUserId },
    }))
  }

  if (['staff_assigned', 'active'].includes(allocationState) && !primaryUserId) {
    issues.push(buildIssue({
      area: 'attorney',
      code: 'attorney_active_without_primary',
      severity: 'critical',
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Firm manager',
      href: transactionId ? `/transactions/${encodeURIComponent(transactionId)}?diagnostic=attorney_active_without_primary` : '/attorney/matters/incoming',
      message: 'The attorney allocation is marked assigned or active, but no primary attorney user is stored.',
      recommendation: 'Reassign the matter to an active eligible attorney.',
      metadata: { lane, firmId: getAttorneyFirmId(row), preferredUserId },
    }))
  }

  if (firmAcceptanceStatus === 'accepted' && staffAssignmentStatus === 'awaiting_staff_assignment' && allocationState !== 'awaiting_staff_assignment' && !primaryUserId) {
    issues.push(buildIssue({
      area: 'attorney',
      code: 'attorney_accepted_without_staff_owner',
      severity: severityForAge(ageDays, staleAfterDays),
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Firm manager',
      href: '/attorney/matters/incoming',
      message: 'The firm acceptance is complete, but staff assignment has not been completed.',
      recommendation: 'Assign or reassign the primary attorney from the incoming matter queue.',
      metadata: { lane, firmId: getAttorneyFirmId(row), preferredUserId },
    }))
  }

  if (preferredUserId && primaryUserId && preferredUserId !== primaryUserId && allocationState === 'staff_assigned') {
    issues.push(buildIssue({
      area: 'attorney',
      code: 'attorney_assigned_to_non_preferred_person',
      severity: 'info',
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Firm manager',
      href: transactionId ? `/transactions/${encodeURIComponent(transactionId)}?diagnostic=attorney_assigned_to_non_preferred_person` : '/attorney/matters/incoming',
      message: 'The assigned primary attorney differs from the agent-preferred attorney.',
      recommendation: 'Confirm this was intentional or reassign to the preferred attorney.',
      metadata: { lane, firmId: getAttorneyFirmId(row), preferredUserId, primaryUserId },
    }))
  }

  return issues
}

function diagnoseBondApplication(row = {}, transaction = {}, { now = new Date(), staleAfterDays = 2 } = {}) {
  const userId = getBondApplicationUserId(row)
  const organisationId = getBondApplicationOrganisationId(row) || getTransactionBondWorkspaceId(transaction)
  const transactionConsultantId = getTransactionPrimaryConsultantId(transaction)
  const status = normalizeLower(row.assignment_status || row.assignmentStatus || transaction.bond_assignment_status || transaction.bondAssignmentStatus)
  const transactionId = normalizeText(row.transaction_id || row.transactionId || transaction.id)
  const recordId = normalizeText(row.id)
  const ageDays = daysSince(latestTimestamp(row) || latestTimestamp(transaction), now)
  const issues = []

  if (organisationId && !userId && ['organisation_queue', 'workspace_assigned', 'accepted', 'pending', ''].includes(status)) {
    issues.push(buildIssue({
      area: 'bond',
      code: 'bond_company_queue_without_consultant',
      severity: severityForAge(ageDays, staleAfterDays),
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Bond manager',
      href: '/bond/applications?view=new-applications&diagnostic=bond_company_queue_without_consultant',
      message: 'The bond application is routed to the company queue, but no consultant has been assigned.',
      recommendation: 'Assign the application to a consultant so it appears in the person-owned queue.',
      metadata: { organisationId, status, transactionConsultantId },
    }))
  }

  if (userId && !transactionConsultantId) {
    issues.push(buildIssue({
      area: 'bond',
      code: 'bond_transaction_missing_primary_consultant',
      severity: 'warning',
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Bond manager',
      href: transactionId ? `/bond/files/${encodeURIComponent(transactionId)}?diagnostic=bond_transaction_missing_primary_consultant` : '/bond/applications',
      message: 'The bond application has a consultant, but the transaction primary bond consultant is blank.',
      recommendation: 'Sync the transaction primary consultant from the bond application assignee.',
      metadata: { applicationUserId: userId, organisationId },
    }))
  }

  if (userId && transactionConsultantId && userId !== transactionConsultantId) {
    issues.push(buildIssue({
      area: 'bond',
      code: 'bond_application_transaction_consultant_mismatch',
      severity: 'warning',
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Bond manager',
      href: transactionId ? `/bond/files/${encodeURIComponent(transactionId)}?diagnostic=bond_application_transaction_consultant_mismatch` : '/bond/applications',
      message: 'The bond application assignee differs from the transaction primary bond consultant.',
      recommendation: 'Resync the transaction and bond application assignment to the same consultant.',
      metadata: { applicationUserId: userId, transactionConsultantId, organisationId },
    }))
  }

  if (!organisationId && !userId && transactionConsultantId) {
    issues.push(buildIssue({
      area: 'bond',
      code: 'bond_application_missing_company_scope',
      severity: 'warning',
      recordId,
      transactionId,
      ageDays,
      ownerRole: 'Bond manager',
      href: transactionId ? `/bond/files/${encodeURIComponent(transactionId)}?diagnostic=bond_application_missing_company_scope` : '/bond/applications',
      message: 'The transaction has a primary consultant, but the bond application row has no company scope.',
      recommendation: 'Backfill application scope from the transaction assignment.',
      metadata: { transactionConsultantId },
    }))
  }

  return issues
}

function buildPartnerPersonRoutingRemediationActions({
  snapshot,
  bondApplications = [],
  transactions = [],
} = {}) {
  const issues = Array.isArray(snapshot?.issues) ? snapshot.issues : []
  const transactionsById = new Map((Array.isArray(transactions) ? transactions : []).map((row) => [normalizeText(row.id || row.transaction_id || row.transactionId), row]))
  const actions = []
  const seen = new Set()

  function pushAction(action) {
    const key = normalizeText(action?.id)
    if (!key || seen.has(key)) return
    seen.add(key)
    actions.push(action)
  }

  issues
    .filter((issue) => issue.area === 'attorney')
    .forEach((issue) => {
      const manualCodes = new Set([
        'attorney_awaiting_internal_assignment',
        'attorney_active_without_primary',
        'attorney_accepted_without_staff_owner',
        'attorney_assigned_to_non_preferred_person',
      ])
      if (!manualCodes.has(issue.code)) return
      pushAction(buildAction({
        id: `manual-${issue.code}-${issue.recordId || issue.transactionId}`,
        area: 'attorney',
        code: issue.code,
        mode: 'manual_review',
        status: issue.code === 'attorney_assigned_to_non_preferred_person' ? 'review_required' : 'needs_person',
        severity: issue.severity,
        recordId: issue.recordId,
        transactionId: issue.transactionId,
        label: issue.code === 'attorney_assigned_to_non_preferred_person' ? 'Review preferred attorney mismatch' : 'Assign primary attorney',
        description: issue.message,
        recommendation: issue.recommendation,
        href: issue.href || '/attorney/matters/incoming',
        ownerRole: issue.ownerRole,
        metadata: issue.metadata,
      }))
    })

  ;(Array.isArray(bondApplications) ? bondApplications : []).forEach((application) => {
    const applicationId = normalizeText(application.id)
    const transactionId = normalizeText(application.transaction_id || application.transactionId)
    const transaction = transactionsById.get(transactionId) || {}
    const applicationUserId = getBondApplicationUserId(application)
    const transactionConsultantId = getTransactionPrimaryConsultantId(transaction)
    const organisationId = getBondApplicationOrganisationId(application) || getTransactionBondWorkspaceId(transaction)
    const regionId = normalizeText(application.assigned_region_id || application.assignedRegionId || transaction.bond_region_id || transaction.bondRegionId)
    const workspaceUnitId = normalizeText(
      application.assigned_workspace_unit_id ||
        application.assignedWorkspaceUnitId ||
        application.assigned_branch_id ||
        application.assignedBranchId ||
        transaction.bond_workspace_unit_id ||
        transaction.bondWorkspaceUnitId,
    )

    if (!applicationUserId && transactionConsultantId) {
      const payload = {
        assigned_user_id: transactionConsultantId,
        assignment_status: 'consultant_assigned',
        assignment_source: 'phase6_person_routing_sync',
        scope_level: 'consultant',
        updated_at: new Date().toISOString(),
      }
      if (organisationId) payload.assigned_organisation_id = organisationId
      if (regionId) payload.assigned_region_id = regionId
      if (workspaceUnitId) {
        payload.assigned_workspace_unit_id = workspaceUnitId
        payload.assigned_branch_id = workspaceUnitId
      }
      pushAction(buildAction({
        id: `auto-bond-application-from-transaction-${applicationId || transactionId}`,
        area: 'bond',
        code: 'sync_bond_application_from_transaction',
        mode: 'automatic',
        status: 'ready',
        severity: 'warning',
        recordId: applicationId,
        transactionId,
        label: 'Sync application consultant',
        description: 'The transaction already has a primary bond consultant; the bond application can inherit that person.',
        recommendation: 'Apply the safe sync so the application appears in the consultant-owned queue.',
        href: transactionId ? `/bond/files/${encodeURIComponent(transactionId)}?diagnostic=sync_bond_application_from_transaction` : '/bond/applications',
        ownerRole: 'Bond manager',
        patch: { table: 'transaction_bond_applications', idColumn: 'id', id: applicationId, values: payload },
        metadata: { transactionConsultantId, organisationId, regionId, workspaceUnitId },
      }))
      return
    }

    if (applicationUserId && !transactionConsultantId && transactionId) {
      pushAction(buildAction({
        id: `auto-bond-transaction-from-application-${transactionId}`,
        area: 'bond',
        code: 'sync_bond_transaction_from_application',
        mode: 'automatic',
        status: 'ready',
        severity: 'warning',
        recordId: applicationId,
        transactionId,
        label: 'Sync transaction consultant',
        description: 'The bond application already has a consultant; the transaction can inherit that person as primary bond consultant.',
        recommendation: 'Apply the safe sync so transaction and application ownership match.',
        href: `/bond/files/${encodeURIComponent(transactionId)}?diagnostic=sync_bond_transaction_from_application`,
        ownerRole: 'Bond manager',
        patch: {
          table: 'transactions',
          idColumn: 'id',
          id: transactionId,
          values: {
            primary_bond_consultant_user_id: applicationUserId,
            bond_assignment_status: 'consultant_assigned',
            bond_assignment_source: 'phase6_person_routing_sync',
            updated_at: new Date().toISOString(),
          },
        },
        metadata: { applicationUserId, organisationId },
      }))
      return
    }

    if (applicationUserId && transactionConsultantId && applicationUserId !== transactionConsultantId) {
      pushAction(buildAction({
        id: `manual-bond-consultant-mismatch-${applicationId || transactionId}`,
        area: 'bond',
        code: 'bond_application_transaction_consultant_mismatch',
        mode: 'manual_review',
        status: 'review_required',
        severity: 'warning',
        recordId: applicationId,
        transactionId,
        label: 'Review consultant mismatch',
        description: 'The transaction and bond application point to different consultants.',
        recommendation: 'Choose the correct consultant before syncing either side.',
        href: transactionId ? `/bond/files/${encodeURIComponent(transactionId)}?diagnostic=bond_application_transaction_consultant_mismatch` : '/bond/applications',
        ownerRole: 'Bond manager',
        metadata: { applicationUserId, transactionConsultantId, organisationId },
      }))
      return
    }

    if (organisationId && !applicationUserId) {
      pushAction(buildAction({
        id: `manual-bond-company-queue-${applicationId || transactionId}`,
        area: 'bond',
        code: 'bond_company_queue_without_consultant',
        mode: 'manual_review',
        status: 'needs_person',
        severity: 'warning',
        recordId: applicationId,
        transactionId,
        label: 'Assign bond consultant',
        description: 'The bond application is still in the company queue.',
        recommendation: 'Assign a consultant from the bond applications queue.',
        href: '/bond/applications?view=new-applications&diagnostic=bond_company_queue_without_consultant',
        ownerRole: 'Bond manager',
        metadata: { organisationId },
      }))
    }
  })

  const summary = actions.reduce(
    (accumulator, action) => {
      accumulator.total += 1
      accumulator.byMode[action.mode] = (accumulator.byMode[action.mode] || 0) + 1
      accumulator.byStatus[action.status] = (accumulator.byStatus[action.status] || 0) + 1
      accumulator.byCode[action.code] = (accumulator.byCode[action.code] || 0) + 1
      return accumulator
    },
    { total: 0, byMode: {}, byStatus: {}, byCode: {} },
  )

  return {
    status: summary.byMode.automatic ? 'actionable' : summary.total ? 'manual_review' : 'clear',
    summary: {
      ...summary,
      automatic: summary.byMode.automatic || 0,
      manualReview: summary.byMode.manual_review || 0,
      ready: summary.byStatus.ready || 0,
      needsPerson: summary.byStatus.needs_person || 0,
      reviewRequired: summary.byStatus.review_required || 0,
    },
    actions,
    automaticActions: actions.filter((action) => action.mode === 'automatic'),
    manualActions: actions.filter((action) => action.mode !== 'automatic'),
  }
}

export function buildPartnerPersonRoutingReleaseGate(plan = {}) {
  const diagnostics = plan.diagnostics || plan
  const remediation = plan.remediation || {}
  const totals = diagnostics.totals || {}
  const summary = remediation.summary || {}
  const blockers = []
  const warnings = []

  if (Number(totals.critical || 0) > 0) {
    blockers.push({
      code: 'critical_routing_gaps',
      label: 'Critical company-to-person routing gaps remain.',
      count: Number(totals.critical || 0),
      ownerRole: 'Operations',
      action: 'Resolve critical attorney and bond routing diagnostics.',
    })
  }
  if (Number(summary.automatic || 0) > 0) {
    blockers.push({
      code: 'automatic_syncs_pending',
      label: 'Safe automatic syncs have not been applied.',
      count: Number(summary.automatic || 0),
      ownerRole: 'Operations',
      action: 'Apply Phase 6 automatic syncs and rerun the gate.',
    })
  }
  if (Number(summary.needsPerson || 0) > 0) {
    blockers.push({
      code: 'person_assignment_pending',
      label: 'Company queue items still need a named person.',
      count: Number(summary.needsPerson || 0),
      ownerRole: 'Firm or bond manager',
      action: 'Assign the primary attorney or bond consultant from the relevant queue.',
    })
  }
  if (Number(summary.reviewRequired || 0) > 0) {
    blockers.push({
      code: 'ownership_review_pending',
      label: 'Ownership mismatches still need manager review.',
      count: Number(summary.reviewRequired || 0),
      ownerRole: 'Firm or bond manager',
      action: 'Confirm the intended owner and resync the transaction/application records.',
    })
  }
  if (Number(totals.warnings || 0) > 0 && !blockers.length) {
    warnings.push({
      code: 'non_blocking_warnings',
      label: 'Non-critical routing warnings remain.',
      count: Number(totals.warnings || 0),
      action: 'Review warning-level diagnostics before expanding rollout.',
    })
  }
  if (Number(totals.info || 0) > 0) {
    warnings.push({
      code: 'informational_diagnostics',
      label: 'Informational routing diagnostics are present.',
      count: Number(totals.info || 0),
      action: 'Confirm these are intentional during rollout review.',
    })
  }

  const status = blockers.length ? 'no_go' : warnings.length ? 'conditional_go' : 'go'
  const totalChecks = 5
  const failedChecks = blockers.length
  const warningChecks = warnings.length
  const score = Math.max(0, Math.round(((totalChecks - failedChecks - warningChecks * 0.5) / totalChecks) * 100))

  return {
    version: 'partner_person_routing_phase7_release_gate_v1',
    status,
    score,
    checkedAt: new Date().toISOString(),
    blockers,
    warnings,
    evidence: {
      diagnosticsStatus: diagnostics.status || 'unknown',
      remediationStatus: remediation.status || 'unknown',
      criticalIssues: Number(totals.critical || 0),
      warningIssues: Number(totals.warnings || 0),
      infoIssues: Number(totals.info || 0),
      automaticActions: Number(summary.automatic || 0),
      manualActions: Number(summary.manualReview || 0),
      needsPerson: Number(summary.needsPerson || 0),
      reviewRequired: Number(summary.reviewRequired || 0),
      attorneyCompanyQueue: Number(totals.attorneyCompanyQueue || 0),
      bondCompanyQueue: Number(totals.bondCompanyQueue || 0),
    },
    nextAction: blockers[0]?.action || warnings[0]?.action || 'Company-to-person routing is ready for controlled rollout.',
  }
}

function summarizeIssues(issues = []) {
  return issues.reduce(
    (accumulator, issue) => {
      accumulator.total += 1
      accumulator.bySeverity[issue.severity] = (accumulator.bySeverity[issue.severity] || 0) + 1
      accumulator.byCode[issue.code] = (accumulator.byCode[issue.code] || 0) + 1
      accumulator.byArea[issue.area] = (accumulator.byArea[issue.area] || 0) + 1
      return accumulator
    },
    {
      total: 0,
      bySeverity: {},
      byCode: {},
      byArea: {},
    },
  )
}

export function buildPartnerPersonRoutingDiagnosticsFromSources({
  attorneyAssignments = [],
  bondApplications = [],
  transactions = [],
} = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const staleAfterDays = Number.isFinite(Number(options.staleAfterDays)) ? Number(options.staleAfterDays) : 2
  const transactionsById = new Map((Array.isArray(transactions) ? transactions : []).map((row) => [normalizeText(row.id || row.transaction_id || row.transactionId), row]))
  const attorneyRows = Array.isArray(attorneyAssignments) ? attorneyAssignments : []
  const bondRows = Array.isArray(bondApplications) ? bondApplications : []
  const issues = [
    ...attorneyRows.flatMap((row) => diagnoseAttorneyAssignment(row, { now, staleAfterDays })),
    ...bondRows.flatMap((row) => diagnoseBondApplication(row, transactionsById.get(normalizeText(row.transaction_id || row.transactionId)) || {}, { now, staleAfterDays })),
  ].sort((left, right) => {
    const severityRank = { critical: 0, warning: 1, info: 2 }
    return (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9) ||
      (right.ageDays || 0) - (left.ageDays || 0)
  })

  const attorneyPersonAssigned = attorneyRows.filter((row) => getAttorneyPrimaryUserId(row)).length
  const attorneyCompanyQueue = attorneyRows.filter((row) =>
    getAttorneyFirmId(row) &&
    !getAttorneyPrimaryUserId(row) &&
    ['awaiting_firm_acceptance', 'awaiting_staff_assignment'].includes(normalizeLower(row.allocation_state || row.allocationState)),
  ).length
  const bondPersonAssigned = bondRows.filter((row) => getBondApplicationUserId(row)).length
  const bondCompanyQueue = bondRows.filter((row) => getBondApplicationOrganisationId(row) && !getBondApplicationUserId(row)).length
  const summary = summarizeIssues(issues)
  const status = summary.bySeverity.critical
    ? 'critical'
    : summary.bySeverity.warning
      ? 'warning'
      : 'healthy'

  return {
    status,
    checkedAt: now.toISOString(),
    staleAfterDays,
    totals: {
      attorneyRows: attorneyRows.length,
      attorneyPersonAssigned,
      attorneyCompanyQueue,
      bondRows: bondRows.length,
      bondPersonAssigned,
      bondCompanyQueue,
      issues: summary.total,
      critical: summary.bySeverity.critical || 0,
      warnings: summary.bySeverity.warning || 0,
      info: summary.bySeverity.info || 0,
      byCode: summary.byCode,
      byArea: summary.byArea,
    },
    issues,
    topIssues: issues.slice(0, 20),
  }
}

function errorMentionsColumn(error, column = '') {
  if (!column || !isMissingColumnError(error, column)) return false
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  const normalizedColumn = column.toLowerCase()
  return text.includes(normalizedColumn)
}

async function selectWithColumnFallback(client, table, columns, applyQuery = (query) => query) {
  let activeColumns = [...columns]
  let lastError = null
  for (let attempt = 0; attempt <= columns.length; attempt += 1) {
    const result = await applyQuery(client.from(table).select(activeColumns.join(', ')))
    if (!result.error) return result.data || []
    if (isMissingTableError(result.error, table) || isPermissionDeniedError(result.error)) return []
    const missingColumn = activeColumns.find((column) => errorMentionsColumn(result.error, column))
    if (!missingColumn) throw result.error
    lastError = result.error
    activeColumns = activeColumns.filter((column) => column !== missingColumn)
  }
  if (lastError) throw lastError
  return []
}

async function updateWithColumnFallback(client, table, idColumn, id, payload = {}) {
  let activePayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  let lastError = null
  for (let attempt = 0; attempt <= Object.keys(payload).length; attempt += 1) {
    const result = await client.from(table).update(activePayload).eq(idColumn, id).select(idColumn).limit(1)
    if (!result.error) return { skipped: false, data: result.data || null, values: activePayload }
    if (isMissingTableError(result.error, table) || isPermissionDeniedError(result.error)) {
      return { skipped: true, reason: result.error.message || 'Table missing or permission denied.', values: activePayload }
    }
    const missingColumn = Object.keys(activePayload).find((column) => errorMentionsColumn(result.error, column))
    if (!missingColumn) throw result.error
    lastError = result.error
    activePayload = Object.fromEntries(Object.entries(activePayload).filter(([column]) => column !== missingColumn))
    if (!Object.keys(activePayload).length) return { skipped: true, reason: 'All remediation columns are unavailable.', values: {} }
  }
  if (lastError) throw lastError
  return { skipped: true, reason: 'No remediation values were available.', values: {} }
}

async function insertRemediationEvent(client, action = {}, actorUserId = '') {
  if (!action.transactionId) return { skipped: true }
  const payload = {
    transaction_id: action.transactionId,
    event_type: 'PartnerPersonRoutingRemediation',
    title: action.label || 'Partner person routing remediation',
    description: action.description || action.recommendation || null,
    created_by: actorUserId || null,
    metadata: {
      area: action.area,
      code: action.code,
      mode: action.mode,
      recordId: action.recordId,
      patch: action.patch,
    },
    created_at: new Date().toISOString(),
  }
  const result = await client.from('transaction_events').insert(payload).select('id').limit(1)
  if (!result.error) return { skipped: false, data: result.data || null }
  if (isMissingTableError(result.error, 'transaction_events') || isPermissionDeniedError(result.error)) return { skipped: true }
  if (isMissingColumnError(result.error, 'metadata')) {
    const fallback = await client.from('transaction_events').insert({
      transaction_id: action.transactionId,
      event_type: 'PartnerPersonRoutingRemediation',
      title: action.label || 'Partner person routing remediation',
      description: action.description || action.recommendation || null,
      created_by: actorUserId || null,
      created_at: new Date().toISOString(),
    }).select('id').limit(1)
    if (!fallback.error) return { skipped: false, data: fallback.data || null }
    if (isMissingTableError(fallback.error, 'transaction_events') || isPermissionDeniedError(fallback.error)) return { skipped: true }
    throw fallback.error
  }
  throw result.error
}

async function loadPartnerPersonRoutingSources({ workspaceId = '', limit = 500, client = requireClient() } = {}) {
  const normalizedWorkspaceId = normalizeText(workspaceId)
  const rowLimit = Math.max(1, Math.min(Number(limit) || 500, 2000))

  const attorneyAssignments = await selectWithColumnFallback(
    client,
    'transaction_attorney_assignments',
    ATTORNEY_ASSIGNMENT_COLUMNS,
    (query) => query.limit(rowLimit),
  )

  const bondApplications = await selectWithColumnFallback(
    client,
    'transaction_bond_applications',
    BOND_APPLICATION_COLUMNS,
    (query) => query.limit(rowLimit),
  )

  const transactionIds = unique([
    ...bondApplications.map((row) => row.transaction_id || row.transactionId),
  ])
  const transactions = transactionIds.length
    ? await selectWithColumnFallback(
        client,
        'transactions',
        TRANSACTION_COLUMNS,
        (query) => query.in('id', transactionIds).limit(rowLimit),
      )
    : []

  const transactionsById = new Map(transactions.map((row) => [normalizeText(row.id), row]))
  const scopedAttorneyAssignments = normalizedWorkspaceId
    ? attorneyAssignments.filter((row) => [row.attorney_firm_id, row.firm_id, row.attorneyFirmId, row.firmId].map(normalizeText).includes(normalizedWorkspaceId))
    : attorneyAssignments
  const scopedBondApplications = normalizedWorkspaceId
    ? bondApplications.filter((row) => {
        const transaction = transactionsById.get(normalizeText(row.transaction_id || row.transactionId)) || {}
        return [
          row.assigned_organisation_id,
          row.assignedOrganisationId,
          transaction.bond_workspace_id,
          transaction.bondWorkspaceId,
          transaction.organisation_id,
          transaction.organisationId,
        ].map(normalizeText).includes(normalizedWorkspaceId)
      })
    : bondApplications

  return {
    attorneyAssignments: scopedAttorneyAssignments,
    bondApplications: scopedBondApplications,
    transactions,
  }
}

export async function getPartnerPersonRoutingDiagnosticsSnapshot({
  workspaceId = '',
  staleAfterDays = 2,
  limit = 500,
  client = requireClient(),
} = {}) {
  const sources = await loadPartnerPersonRoutingSources({ workspaceId, limit, client })
  return buildPartnerPersonRoutingDiagnosticsFromSources(sources, { staleAfterDays })
}

export function buildPartnerPersonRoutingRemediationPlanFromSources({
  attorneyAssignments = [],
  bondApplications = [],
  transactions = [],
} = {}, options = {}) {
  const diagnostics = buildPartnerPersonRoutingDiagnosticsFromSources({
    attorneyAssignments,
    bondApplications,
    transactions,
  }, options)
  const remediation = buildPartnerPersonRoutingRemediationActions({
    snapshot: diagnostics,
    bondApplications,
    transactions,
  })
  return {
    status: diagnostics.status === 'healthy' && remediation.status === 'clear' ? 'healthy' : remediation.status,
    checkedAt: diagnostics.checkedAt,
    staleAfterDays: diagnostics.staleAfterDays,
    diagnostics,
    remediation,
    releaseGate: buildPartnerPersonRoutingReleaseGate({ diagnostics, remediation }),
  }
}

export async function getPartnerPersonRoutingRemediationPlan({
  workspaceId = '',
  staleAfterDays = 2,
  limit = 500,
  client = requireClient(),
} = {}) {
  const sources = await loadPartnerPersonRoutingSources({ workspaceId, limit, client })
  return buildPartnerPersonRoutingRemediationPlanFromSources(sources, { staleAfterDays })
}

export async function getPartnerPersonRoutingReleaseGate({
  workspaceId = '',
  staleAfterDays = 2,
  limit = 500,
  client = requireClient(),
} = {}) {
  const plan = await getPartnerPersonRoutingRemediationPlan({ workspaceId, staleAfterDays, limit, client })
  return plan.releaseGate
}

export async function applyPartnerPersonRoutingRemediation({
  workspaceId = '',
  staleAfterDays = 2,
  limit = 500,
  actionIds = [],
  dryRun = true,
  actorUserId = '',
  client = requireClient(),
} = {}) {
  const plan = await getPartnerPersonRoutingRemediationPlan({ workspaceId, staleAfterDays, limit, client })
  const requestedIds = new Set((Array.isArray(actionIds) ? actionIds : []).map(normalizeText).filter(Boolean))
  const actions = plan.remediation.automaticActions.filter((action) => !requestedIds.size || requestedIds.has(action.id))
  if (dryRun) {
    return {
      dryRun: true,
      checkedAt: new Date().toISOString(),
      plan,
      summary: {
        planned: actions.length,
        applied: 0,
        skipped: 0,
        failed: 0,
      },
      actions: actions.map((action) => ({ ...action, result: 'planned' })),
    }
  }

  const applied = []
  const skipped = []
  const failed = []
  for (const action of actions) {
    try {
      const patch = action.patch || {}
      if (!patch.table || !patch.idColumn || !patch.id || !patch.values) {
        skipped.push({ ...action, result: 'skipped', reason: 'Remediation action has no write patch.' })
        continue
      }
      const result = await updateWithColumnFallback(client, patch.table, patch.idColumn, patch.id, patch.values)
      if (result.skipped) {
        skipped.push({ ...action, result: 'skipped', reason: result.reason || 'Write skipped.', appliedValues: result.values || {} })
        continue
      }
      await insertRemediationEvent(client, action, actorUserId).catch(() => ({ skipped: true }))
      applied.push({ ...action, result: 'applied', appliedValues: result.values || patch.values })
    } catch (error) {
      failed.push({ ...action, result: 'failed', error: error?.message || 'Remediation failed.' })
    }
  }

  const refreshed = await getPartnerPersonRoutingRemediationPlan({ workspaceId, staleAfterDays, limit, client }).catch(() => null)
  return {
    dryRun: false,
    checkedAt: new Date().toISOString(),
    plan,
    refreshed,
    summary: {
      planned: actions.length,
      applied: applied.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    actions: [...applied, ...skipped, ...failed],
    applied,
    skipped,
    failed,
  }
}
