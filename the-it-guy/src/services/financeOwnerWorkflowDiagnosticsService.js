import {
  FINANCE_MANAGED_BY,
  deriveFinanceManagedBy,
  isBondFinanceType,
  normalizeFinanceManagedBy,
  normalizeFinanceType,
} from '../core/transactions/financeType.js'

const SEVERITY_RANK = Object.freeze({
  healthy: 0,
  warning: 1,
  critical: 2,
})

const ISSUE_META = Object.freeze({
  persisted_owner_mismatch: {
    severity: 'critical',
    title: 'Persisted finance owner mismatch',
    actionLabel: 'Sync finance owner',
    ownerRole: 'Operations',
  },
  cash_has_originator_workflow: {
    severity: 'critical',
    title: 'Cash buyer has originator workflow artifacts',
    actionLabel: 'Remove bond workflow artifacts',
    ownerRole: 'Operations',
  },
  client_bond_originator_workflow_leak: {
    severity: 'critical',
    title: 'Client-managed bond is visible in originator workflow',
    actionLabel: 'Move to external finance tracking',
    ownerRole: 'Operations',
  },
  originator_bond_missing_assignment: {
    severity: 'critical',
    title: 'Originator-managed bond has no originator assignment',
    actionLabel: 'Assign bond originator',
    ownerRole: 'Manager',
  },
  client_bond_missing_external_evidence: {
    severity: 'warning',
    title: 'Client-managed bond is missing external finance evidence',
    actionLabel: 'Request external finance proof',
    ownerRole: 'Attorney / Agent',
  },
  developer_owner_mismatch: {
    severity: 'warning',
    title: 'Developer finance owner is not internal',
    actionLabel: 'Sync developer finance owner',
    ownerRole: 'Operations',
  },
})

function text(value = '') {
  return String(value || '').trim()
}

function lower(value = '') {
  return text(value).toLowerCase()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function compact(values = []) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))]
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function title(value = '') {
  return text(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function resolveTransaction(record = {}) {
  return record?.transaction || record?.transactionRow || record?.transaction_row || record || {}
}

function resolveFormData(record = {}) {
  const candidates = [
    record?.formData,
    record?.form_data,
    record?.onboardingFormData?.formData,
    record?.onboarding_form_data?.form_data,
    record?.onboarding?.formData,
    record?.onboarding?.form_data,
    record?.portalData?.onboardingFormData?.formData,
    record?.portalData?.formData,
    resolveTransaction(record)?.onboarding_form_data,
    resolveTransaction(record)?.onboardingFormData,
  ]
  return candidates.find(isPlainObject) || {}
}

function resolveRecordId(record = {}) {
  const transaction = resolveTransaction(record)
  return text(
    record?.transactionId ||
      record?.transaction_id ||
      transaction?.id ||
      transaction?.transaction_id ||
      record?.id,
  ) || null
}

function resolveFinanceType(record = {}) {
  const transaction = resolveTransaction(record)
  const formData = resolveFormData(record)
  const finance = isPlainObject(formData.finance) ? formData.finance : {}
  return normalizeFinanceType(
    record?.financeType ||
      record?.finance_type ||
      transaction?.finance_type ||
      transaction?.financeType ||
      formData.finance_type ||
      formData.financeType ||
      formData.purchase_finance_type ||
      formData.purchaseFinanceType ||
      finance.finance_type ||
      finance.financeType,
    { allowUnknown: true },
  )
}

function resolvePersistedFinanceManagedBy(record = {}) {
  const transaction = resolveTransaction(record)
  const formData = resolveFormData(record)
  const finance = isPlainObject(formData.finance) ? formData.finance : {}
  return (
    record?.financeManagedBy ||
    record?.finance_managed_by ||
    transaction?.finance_managed_by ||
    transaction?.financeManagedBy ||
    transaction?.finance_owner ||
    transaction?.financeOwner ||
    formData.finance_managed_by ||
    formData.financeManagedBy ||
    finance.finance_managed_by ||
    finance.financeManagedBy ||
    ''
  )
}

function resolveFinanceOwnerSnapshot(record = {}) {
  const financeType = resolveFinanceType(record)
  const persistedRaw = resolvePersistedFinanceManagedBy(record)
  const formData = resolveFormData(record)
  const persisted = persistedRaw
    ? normalizeFinanceManagedBy(persistedRaw, { fallback: FINANCE_MANAGED_BY.BOND_ORIGINATOR })
    : ''
  const derived = deriveFinanceManagedBy({
    financeType,
    financeManagedBy: persistedRaw,
    formData,
    fallback: financeType === 'developer' ? FINANCE_MANAGED_BY.INTERNAL : FINANCE_MANAGED_BY.BOND_ORIGINATOR,
  })
  const onboardingDerived = isPlainObject(formData) && Object.keys(formData).length
    ? deriveFinanceManagedBy({
        financeType,
        financeManagedBy: formData.finance_managed_by || formData.financeManagedBy || formData.finance?.finance_managed_by || formData.finance?.financeManagedBy,
        formData,
        fallback: financeType === 'developer' ? FINANCE_MANAGED_BY.INTERNAL : FINANCE_MANAGED_BY.BOND_ORIGINATOR,
      })
    : ''

  return {
    financeType,
    persistedRaw,
    persisted,
    derived,
    onboardingDerived,
    originatorManagedFinance: isBondFinanceType(financeType) && derived === FINANCE_MANAGED_BY.BOND_ORIGINATOR,
    clientManagedBondFinance: isBondFinanceType(financeType) && derived === FINANCE_MANAGED_BY.CLIENT,
    cashBuyer: financeType === 'cash',
    developerFinance: financeType === 'developer',
  }
}

function getIssueMeta(code) {
  return ISSUE_META[code] || {
    severity: 'warning',
    title: title(code),
    actionLabel: 'Review issue',
    ownerRole: 'Operations',
  }
}

function makeIssue(code, row, evidence = {}) {
  const meta = getIssueMeta(code)
  return {
    code,
    severity: meta.severity,
    title: meta.title,
    actionLabel: meta.actionLabel,
    ownerRole: meta.ownerRole,
    transactionId: row.transactionId,
    financeType: row.financeType,
    financeManagedBy: row.financeManagedBy,
    evidence,
  }
}

function hasActiveStatus(value = '') {
  const normalized = lower(value)
  return !['removed', 'inactive', 'cancelled', 'archived', 'declined'].includes(normalized)
}

function hasBondOriginatorAssignment(record = {}) {
  const transaction = resolveTransaction(record)
  const participants = [
    ...toArray(record?.participants),
    ...toArray(record?.rolePlayers),
    ...toArray(record?.role_players),
    ...toArray(record?.workflowReadModel?.rolePlayers),
    ...toArray(record?.readModel?.rolePlayers),
  ]
  const attorneyAssignments = [
    ...toArray(record?.attorneyAssignments),
    ...toArray(record?.attorney_assignments),
    ...toArray(record?.workflowReadModel?.attorneyAssignments),
    ...toArray(record?.readModel?.attorneyAssignments),
  ]

  return Boolean(
    text(transaction?.bond_originator) ||
      text(transaction?.assigned_bond_originator_email) ||
      text(transaction?.bond_workspace_id) ||
      text(transaction?.primary_bond_consultant_user_id) ||
      participants.some((item) => {
        const role = lower(item?.roleType || item?.role_type || item?.transactionRole || item?.transaction_role)
        return role === 'bond_originator' && hasActiveStatus(item?.status || 'active')
      }) ||
      attorneyAssignments.some((item) => {
        const type = lower(item?.assignment_type || item?.assignmentType)
        return ['bond', 'transfer_and_bond'].includes(type) && lower(item?.status || 'active') === 'active'
      }),
  )
}

function actionLooksLikeBondApplication(action = {}) {
  const blob = lower(`${action?.id || ''} ${action?.type || ''} ${action?.category || ''} ${action?.title || ''} ${action?.actionRoute || action?.action_route || ''}`)
  return blob.includes('bond_application') || blob.includes('bond application')
}

function hasOriginatorWorkflowArtifact(record = {}) {
  const transaction = resolveTransaction(record)
  const workflowData = record?.workflowData || record?.transactionFinanceWorkflow || transaction?.transactionFinanceWorkflow || {}
  const actions = [
    ...toArray(record?.nextActions),
    ...toArray(record?.clientPortalNextActions),
    ...toArray(record?.portalNextActions),
  ]
  const blockers = [
    ...toArray(record?.workflowReadModel?.blockers),
    ...toArray(record?.readModel?.blockers),
  ]
  const bondIntake = record?.bondIntakeStatus || record?.bondIntake || record?.bond_intake || null
  const financeStatusBlob = lower(`${transaction?.finance_status || ''} ${transaction?.next_action || ''}`)

  return Boolean(
    toArray(workflowData?.applications).length ||
      toArray(workflowData?.quotes).length ||
      toArray(workflowData?.offers).length ||
      isPlainObject(workflowData?.instruction) && Object.keys(workflowData.instruction).length ||
      actions.some(actionLooksLikeBondApplication) ||
      blockers.some((blocker) => text(blocker?.id) === 'missing-bond-role-assignment' || lower(blocker?.blockingRole || blocker?.blocking_role) === 'bond_originator') ||
      (isPlainObject(bondIntake) && !['', 'not_applicable', 'hidden', 'excluded'].includes(lower(bondIntake.status || bondIntake.reason))) ||
      financeStatusBlob.includes('submit bank') ||
      financeStatusBlob.includes('bond originator') ||
      financeStatusBlob.includes('grant submitted') ||
      financeStatusBlob.includes('instruction sent')
  )
}

function hasExternalFinanceEvidence(record = {}) {
  const transaction = resolveTransaction(record)
  const requiredRows = toArray(record?.requiredDocumentChecklist || record?.required_documents || record?.documentRequirements)
  const documents = toArray(record?.documents)
  const actions = [
    ...toArray(record?.nextActions),
    ...toArray(record?.clientPortalNextActions),
    ...toArray(record?.portalNextActions),
  ]
  const matcher = /(external finance|bank approval|approval letter|lender approval|finance approval|home loan approval|bank confirmation|loan confirmation)/i
  return Boolean(
    requiredRows.some((item) => {
      const status = lower(item?.status || item?.requiredDocumentStatus || item?.required_document_status)
      const blob = `${item?.key || ''} ${item?.label || ''} ${item?.description || ''}`
      return matcher.test(blob) && ['uploaded', 'approved', 'completed', 'under_review'].includes(status)
    }) ||
      documents.some((item) => {
        const lane = lower(item?.finance_lane || item?.financeLane)
        const blob = `${item?.category || ''} ${item?.name || ''} ${item?.document_type || ''}`
        return lane === 'external' || matcher.test(blob)
      }) ||
      actions.some((action) => lower(action?.id) === 'bond_finance_documents_required' && lower(action?.status) === 'completed') ||
      matcher.test(`${transaction?.next_action || ''} ${transaction?.comment || ''}`),
  )
}

function isPostSigningFinanceActive(record = {}) {
  const transaction = resolveTransaction(record)
  const formData = resolveFormData(record)
  const blob = lower(`${transaction?.stage || ''} ${transaction?.current_main_stage || transaction?.currentMainStage || ''} ${transaction?.next_action || ''}`)
  return Boolean(
    transaction?.onboarding_completed_at ||
      transaction?.external_onboarding_submitted_at ||
      formData?.submitted_at ||
      formData?.submittedAt ||
      /otp|signed|fin|finance|att|transfer|lodg|reg/.test(blob),
  )
}

function evaluateRecord(record = {}) {
  const transaction = resolveTransaction(record)
  const owner = resolveFinanceOwnerSnapshot(record)
  const transactionId = resolveRecordId(record)
  const row = {
    transactionId,
    transactionReference: transaction?.transaction_reference || transaction?.matter_number || null,
    financeType: owner.financeType,
    financeTypeLabel: title(owner.financeType === 'combination' ? 'hybrid' : owner.financeType),
    financeManagedBy: owner.derived,
    persistedFinanceManagedBy: owner.persisted || null,
    onboardingFinanceManagedBy: owner.onboardingDerived || null,
    originatorManagedFinance: owner.originatorManagedFinance,
    clientManagedBondFinance: owner.clientManagedBondFinance,
    cashBuyer: owner.cashBuyer,
    developerFinance: owner.developerFinance,
    hasBondOriginatorAssignment: hasBondOriginatorAssignment(record),
    hasOriginatorWorkflowArtifact: hasOriginatorWorkflowArtifact(record),
    hasExternalFinanceEvidence: hasExternalFinanceEvidence(record),
    postSigningFinanceActive: isPostSigningFinanceActive(record),
    issues: [],
  }

  const persistedOwnerMismatch = owner.persisted && owner.persisted !== owner.derived
  const onboardingOwnerMismatch =
    owner.onboardingDerived &&
    owner.persisted &&
    owner.onboardingDerived !== owner.persisted

  if (persistedOwnerMismatch || onboardingOwnerMismatch) {
    row.issues.push(makeIssue('persisted_owner_mismatch', row, {
      persistedFinanceManagedBy: owner.persisted,
      derivedFinanceManagedBy: owner.derived,
      onboardingFinanceManagedBy: owner.onboardingDerived || null,
      rawFinanceManagedBy: owner.persistedRaw,
    }))
  }

  if (row.cashBuyer && row.hasOriginatorWorkflowArtifact) {
    row.issues.push(makeIssue('cash_has_originator_workflow', row))
  }

  if (row.developerFinance && owner.persisted && owner.persisted !== FINANCE_MANAGED_BY.INTERNAL) {
    row.issues.push(makeIssue('developer_owner_mismatch', row, {
      persistedFinanceManagedBy: owner.persisted,
    }))
  }

  if (row.clientManagedBondFinance && row.hasOriginatorWorkflowArtifact) {
    row.issues.push(makeIssue('client_bond_originator_workflow_leak', row))
  }

  if (row.originatorManagedFinance && !row.hasBondOriginatorAssignment) {
    row.issues.push(makeIssue('originator_bond_missing_assignment', row))
  }

  if (
    row.clientManagedBondFinance &&
    row.postSigningFinanceActive &&
    !row.hasExternalFinanceEvidence
  ) {
    row.issues.push(makeIssue('client_bond_missing_external_evidence', row))
  }

  const highestSeverity = row.issues.reduce((current, issue) => (
    SEVERITY_RANK[issue.severity] > SEVERITY_RANK[current] ? issue.severity : current
  ), 'healthy')
  row.status = highestSeverity
  row.nextAction = row.issues[0]?.actionLabel || 'No finance-owner action required'
  return row
}

function aggregateRemediation(issues = []) {
  const byCode = new Map()
  issues.forEach((issue) => {
    if (!byCode.has(issue.code)) {
      byCode.set(issue.code, {
        code: issue.code,
        title: issue.title,
        severity: issue.severity,
        actionLabel: issue.actionLabel,
        ownerRole: issue.ownerRole,
        count: 0,
        transactionIds: [],
      })
    }
    const item = byCode.get(issue.code)
    item.count += 1
    if (issue.transactionId) item.transactionIds.push(issue.transactionId)
  })
  return [...byCode.values()]
    .map((item) => ({
      ...item,
      transactionIds: compact(item.transactionIds),
    }))
    .sort((left, right) => {
      const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]
      return severityDelta || right.count - left.count || left.code.localeCompare(right.code)
    })
}

export function buildFinanceOwnerWorkflowDiagnostics(records = [], options = {}) {
  const rows = toArray(records).map(evaluateRecord)
  const issues = rows.flatMap((row) => row.issues)
  const status = issues.some((issue) => issue.severity === 'critical')
    ? 'critical'
    : issues.length
      ? 'warning'
      : 'healthy'

  return {
    status,
    generatedAt: options.generatedAt || new Date().toISOString(),
    totals: {
      rows: rows.length,
      healthy: rows.filter((row) => row.status === 'healthy').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      critical: rows.filter((row) => row.status === 'critical').length,
      issues: issues.length,
      originatorManagedBond: rows.filter((row) => row.originatorManagedFinance).length,
      clientManagedBond: rows.filter((row) => row.clientManagedBondFinance).length,
      cashBuyers: rows.filter((row) => row.cashBuyer).length,
      ownerMismatches: issues.filter((issue) => issue.code === 'persisted_owner_mismatch').length,
      workflowLeaks: issues.filter((issue) => ['cash_has_originator_workflow', 'client_bond_originator_workflow_leak'].includes(issue.code)).length,
    },
    rows,
    issues,
    remediationPlan: aggregateRemediation(issues),
  }
}

export function getFinanceOwnerDiagnosticsStatusLabel(status = '') {
  if (status === 'critical') return 'Finance owner gaps found'
  if (status === 'warning') return 'Finance owner warnings'
  if (status === 'healthy') return 'Finance owner workflows healthy'
  return 'Finance owner diagnostics pending'
}

export default buildFinanceOwnerWorkflowDiagnostics
