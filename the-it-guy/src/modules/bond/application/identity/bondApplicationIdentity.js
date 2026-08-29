export const BOND_APPLICATION_IDENTITY_VERSION = 'bond-application-identity-v1'

export const BOND_APPLICATION_IDENTITY_ISSUES = Object.freeze({
  transactionRequired: 'transaction_required',
  canonicalApplicationTransactionMismatch: 'canonical_application_transaction_mismatch',
  serverIdentityTransactionMismatch: 'server_identity_transaction_mismatch',
  canonicalApplicationMismatch: 'canonical_application_mismatch',
  exportPackageTransactionMismatch: 'export_package_transaction_mismatch',
  exportPackageApplicationMismatch: 'export_package_application_mismatch',
  financeWorkflowTransactionMismatch: 'finance_workflow_transaction_mismatch',
  lenderSubmissionTransactionMismatch: 'lender_submission_transaction_mismatch',
  lenderSubmissionWorkflowMismatch: 'lender_submission_workflow_mismatch',
  exportPackageLenderSubmissionMismatch: 'export_package_lender_submission_mismatch',
  quoteTransactionMismatch: 'quote_transaction_mismatch',
  quoteWorkflowMismatch: 'quote_workflow_mismatch',
  quoteLenderSubmissionMismatch: 'quote_lender_submission_mismatch',
})

function text(value) {
  return String(value || '').trim()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function addIssue(issues, code, detail = {}) {
  issues.push(Object.freeze({ code, ...detail }))
}

function getTransactionId(transaction = null) {
  if (typeof transaction === 'string') return text(transaction)
  return firstText(transaction?.id, transaction?.transactionId, transaction?.transaction_id)
}

function getCanonicalApplicationId(application = {}) {
  return firstText(application?.id, application?.bondApplicationId, application?.bond_application_id)
}

function getCanonicalApplicationTransactionId(application = {}) {
  return firstText(application?.transactionId, application?.transaction_id)
}

function getProgressTransactionId(progress = {}) {
  return firstText(progress?.transactionId, progress?.transaction_id)
}

function getProgressCanonicalApplicationId(progress = {}) {
  return firstText(progress?.canonicalBondApplicationId, progress?.bondApplicationId, progress?.bond_application_id)
}

function getWorkflow(workflowData = {}) {
  return workflowData?.workflow || workflowData?.financeWorkflow || workflowData?.finance_workflow || {}
}

/**
 * Resolves the identity chain shared by the transaction workspace and bond-originator module.
 *
 * `canonicalBondApplicationId` is always a `bond_applications.id`.
 * `lenderSubmissionIds` are always `transaction_bond_applications.id` values. They are
 * deliberately named and validated separately because quotes reference lender submissions,
 * not the canonical guided application.
 */
export function buildBondApplicationIdentity({
  transaction = null,
  bondApplication = null,
  originatorProgress = null,
  financeWorkflow = null,
  serverIdentity = null,
} = {}) {
  const issues = []
  const transactionId = firstText(
    getTransactionId(transaction),
    serverIdentity?.transactionId,
    serverIdentity?.transaction_id,
    getCanonicalApplicationTransactionId(bondApplication),
    getProgressTransactionId(originatorProgress),
  )

  if (!transactionId) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.transactionRequired)
  }

  const localCanonicalApplicationId = getCanonicalApplicationId(bondApplication)
  const progressCanonicalApplicationId = getProgressCanonicalApplicationId(originatorProgress)
  const serverCanonicalApplicationId = firstText(
    serverIdentity?.canonicalBondApplicationId,
    serverIdentity?.canonical_bond_application_id,
  )
  const canonicalBondApplicationId = firstText(
    serverCanonicalApplicationId,
    localCanonicalApplicationId,
    progressCanonicalApplicationId,
  )

  const applicationTransactionId = getCanonicalApplicationTransactionId(bondApplication)
  if (applicationTransactionId && transactionId && applicationTransactionId !== transactionId) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.canonicalApplicationTransactionMismatch, {
      expectedTransactionId: transactionId,
      actualTransactionId: applicationTransactionId,
    })
  }

  const serverTransactionId = firstText(serverIdentity?.transactionId, serverIdentity?.transaction_id)
  if (serverTransactionId && transactionId && serverTransactionId !== transactionId) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.serverIdentityTransactionMismatch, {
      expectedTransactionId: transactionId,
      actualTransactionId: serverTransactionId,
    })
  }

  const canonicalCandidates = [
    ['server_identity', serverCanonicalApplicationId],
    ['bond_application', localCanonicalApplicationId],
    ['originator_export_package', progressCanonicalApplicationId],
  ].filter(([, value]) => value)
  const distinctCanonicalIds = new Set(canonicalCandidates.map(([, value]) => value))
  if (distinctCanonicalIds.size > 1) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.canonicalApplicationMismatch, {
      candidates: Object.fromEntries(canonicalCandidates),
    })
  }

  const exportPackageTransactionId = getProgressTransactionId(originatorProgress)
  if (exportPackageTransactionId && transactionId && exportPackageTransactionId !== transactionId) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.exportPackageTransactionMismatch, {
      expectedTransactionId: transactionId,
      actualTransactionId: exportPackageTransactionId,
    })
  }
  if (
    progressCanonicalApplicationId &&
    canonicalBondApplicationId &&
    progressCanonicalApplicationId !== canonicalBondApplicationId
  ) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.exportPackageApplicationMismatch, {
      expectedCanonicalBondApplicationId: canonicalBondApplicationId,
      actualCanonicalBondApplicationId: progressCanonicalApplicationId,
    })
  }

  const workflow = getWorkflow(financeWorkflow)
  const financeWorkflowId = firstText(
    serverIdentity?.financeWorkflowId,
    serverIdentity?.finance_workflow_id,
    workflow?.id,
    financeWorkflow?.workflowId,
    financeWorkflow?.workflow_id,
  )
  const workflowTransactionId = firstText(workflow?.transactionId, workflow?.transaction_id)
  if (workflowTransactionId && transactionId && workflowTransactionId !== transactionId) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.financeWorkflowTransactionMismatch, {
      expectedTransactionId: transactionId,
      actualTransactionId: workflowTransactionId,
    })
  }

  const lenderSubmissions = list(financeWorkflow?.applications)
  const localLenderSubmissionIds = lenderSubmissions.map((row) => text(row?.id)).filter(Boolean)
  const serverLenderSubmissionIds = list(
    serverIdentity?.lenderSubmissionIds || serverIdentity?.lender_submission_ids,
  ).map(text).filter(Boolean)
  const lenderSubmissionIds = localLenderSubmissionIds.length
    ? localLenderSubmissionIds
    : serverLenderSubmissionIds
  const lenderSubmissionIdSet = new Set(lenderSubmissionIds)
  lenderSubmissions.forEach((row) => {
    const rowId = text(row?.id)
    const rowTransactionId = firstText(row?.transactionId, row?.transaction_id)
    const rowWorkflowId = firstText(row?.workflowId, row?.workflow_id)
    if (rowTransactionId && transactionId && rowTransactionId !== transactionId) {
      addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.lenderSubmissionTransactionMismatch, {
        lenderSubmissionId: rowId,
        expectedTransactionId: transactionId,
        actualTransactionId: rowTransactionId,
      })
    }
    if (rowWorkflowId && financeWorkflowId && rowWorkflowId !== financeWorkflowId) {
      addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.lenderSubmissionWorkflowMismatch, {
        lenderSubmissionId: rowId,
        expectedFinanceWorkflowId: financeWorkflowId,
        actualFinanceWorkflowId: rowWorkflowId,
      })
    }
  })

  list(financeWorkflow?.quotes || financeWorkflow?.offers).forEach((quote) => {
    const quoteId = text(quote?.id)
    const quoteTransactionId = firstText(quote?.transactionId, quote?.transaction_id)
    const quoteWorkflowId = firstText(quote?.workflowId, quote?.workflow_id)
    const quoteLenderSubmissionId = firstText(quote?.bondApplicationId, quote?.bond_application_id)
    if (quoteTransactionId && transactionId && quoteTransactionId !== transactionId) {
      addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.quoteTransactionMismatch, {
        quoteId,
        expectedTransactionId: transactionId,
        actualTransactionId: quoteTransactionId,
      })
    }
    if (quoteWorkflowId && financeWorkflowId && quoteWorkflowId !== financeWorkflowId) {
      addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.quoteWorkflowMismatch, {
        quoteId,
        expectedFinanceWorkflowId: financeWorkflowId,
        actualFinanceWorkflowId: quoteWorkflowId,
      })
    }
    if (quoteLenderSubmissionId && !lenderSubmissionIdSet.has(quoteLenderSubmissionId)) {
      addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.quoteLenderSubmissionMismatch, {
        quoteId,
        lenderSubmissionId: quoteLenderSubmissionId,
      })
    }
  })

  const activeSubmissionId = firstText(
    serverIdentity?.activeSubmissionId,
    serverIdentity?.active_submission_id,
    bondApplication?.activeSubmissionId,
    bondApplication?.active_submission_id,
    originatorProgress?.submissionId,
    originatorProgress?.submission_id,
  )
  const exportPackageId = firstText(
    serverIdentity?.exportPackageId,
    serverIdentity?.export_package_id,
    originatorProgress?.id,
  )
  const packageLenderSubmissionId = firstText(
    serverIdentity?.transactionBondApplicationId,
    serverIdentity?.transaction_bond_application_id,
    originatorProgress?.transactionBondApplicationId,
    originatorProgress?.transaction_bond_application_id,
  )
  if (packageLenderSubmissionId && !lenderSubmissionIdSet.has(packageLenderSubmissionId)) {
    addIssue(issues, BOND_APPLICATION_IDENTITY_ISSUES.exportPackageLenderSubmissionMismatch, {
      lenderSubmissionId: packageLenderSubmissionId,
    })
  }

  return Object.freeze({
    version: BOND_APPLICATION_IDENTITY_VERSION,
    available: Boolean(transactionId && canonicalBondApplicationId),
    valid: issues.length === 0,
    transactionId: transactionId || null,
    canonicalBondApplicationId: canonicalBondApplicationId || null,
    activeSubmissionId: activeSubmissionId || null,
    exportPackageId: exportPackageId || null,
    financeWorkflowId: financeWorkflowId || null,
    transactionBondApplicationId: packageLenderSubmissionId || null,
    lenderSubmissionIds: Object.freeze(lenderSubmissionIds),
    issues: Object.freeze(issues),
  })
}
