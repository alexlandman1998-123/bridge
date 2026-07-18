import { useMemo, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  runIntegrityChecks,
  validateTransactionStateById,
  validateUserState,
  validateWorkspaceStateById,
} from '../services/validation/validationEngine'
import { getWorkflowEngineHealth } from '../lib/api'
import { listOrganisationPartnerRoutingRules } from '../lib/settingsApi'
import { getRecentOperationalEvents, getAuditMetrics } from '../services/observability/auditMetrics'
import { deploymentHealthCheck, getOperationalHealthSummary } from '../services/observability/systemHealth'
import { getDemoEnvironmentSummary, resetDemoEnvironment } from '../services/demo/demoEnvironmentService'
import { calculateLaunchReadiness } from '../services/release/launchReadiness'
import { getUniversalPartnerRoutingDiagnosticsSnapshot } from '../services/universalPartnerRoutingService'
import { getUniversalAssignmentDiagnosticsSnapshot } from '../services/universalAssignmentService'
import { applyCanonicalInviteReconciliation, getCanonicalInviteHealth, reconcileCanonicalInvites } from '../services/inviteOperationsService'
import { dispatchNotificationReminders, getNotificationAutomationHealth } from '../services/notificationAutomationOperationsService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  getSellerMandateContinuityDiagnosticsSnapshot,
  getSellerMandateContinuityReleaseGate,
} from '../services/sellerMandateContinuityReportService'
import {
  backfillSellerPortalInvitesAfterSignedMandates,
  runSellerDocumentRequirementReconciliation,
} from '../services/privateListingService'
import {
  buildCrossModuleDocumentConsistencyGate,
  buildCrossModuleDocumentConsistencyAudit,
  fetchCrossModuleDocumentConsistencySnapshot,
  summarizeCrossModuleDocumentConsistencyAudit,
} from '../services/documents/crossModuleDocumentConsistencyService'
import { getWorkspaceBrandingIntegrityDiagnostics } from '../services/workspaceBrandingIntegrityService'
import { listLegalDocumentGenerationSupportHandoffs, transitionLegalDocumentGenerationSupportHandoff } from '../lib/documentPacketsApi'
import { LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES } from '../core/documents/legalDocumentSupportTriage'

function StatCard({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'critical'
      ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]'
      : tone === 'warning'
        ? 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]'
        : tone === 'success'
          ? 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'
          : 'border-[#dbe4ee] bg-white text-[#31485e]'
  return (
    <article className={`rounded-[14px] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-75">{label}</p>
      <strong className="mt-1 block text-2xl">{value}</strong>
    </article>
  )
}

function SellerPortalInviteBackfillResult({ result = null }) {
  if (!result) return null
  const actions = Array.isArray(result.actions) ? result.actions : []
  return (
    <div className={`rounded-[14px] border p-4 ${result.dryRun ? 'border-[#f5d3a4] bg-[#fff8ec]' : 'border-[#cfe8d8] bg-[#effaf3]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">
            {result.dryRun ? 'Invite backfill dry-run result' : 'Invite backfill result'}
          </h3>
          <p className="mt-2 text-sm text-[#60758d]">
            {result.dryRun ? 'No seller emails were sent.' : 'Seller portal invite backfill finished.'}
          </p>
          {!result.dryRun && result.planLocked ? (
            <p className="mt-1 text-xs font-semibold text-[#60758d]">
              Applied from dry-run plan: {result.plannedCandidateCount || 0}
            </p>
          ) : null}
        </div>
        <span className="text-sm font-semibold text-[#31485e]">{result.dryRun ? 'dry-run' : 'applied'}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <StatCard label="Scanned" value={result.scannedRecords || 0} />
        <StatCard label="Candidates" value={result.candidateCount || 0} tone={result.candidateCount ? 'warning' : 'success'} />
        <StatCard label={result.dryRun ? 'Planned' : 'Sent'} value={result.dryRun ? result.summary?.planned || 0 : result.summary?.sent || 0} tone="success" />
        <StatCard label="Skipped" value={result.summary?.skipped || 0} tone={result.summary?.skipped ? 'warning' : 'success'} />
        <StatCard label="Failed" value={result.summary?.failed || 0} tone={result.summary?.failed ? 'critical' : 'success'} />
      </div>
      {actions.length ? (
        <ul className="mt-3 divide-y divide-[#edf1f6] text-sm text-[#60758d]">
          {actions.slice(0, 5).map((action) => (
            <li key={`${action.packetId}-${action.status}`} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>{action.listingId || 'Unknown listing'} · {action.previousInviteStatus || 'missing'}</span>
              <span className="font-semibold text-[#31485e]">{action.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SellerDocumentReconciliationResult({ result = null }) {
  if (!result) return null
  const summary = result.summary || {}
  const syncable = result.actionQueues?.syncable || []
  const applied = Array.isArray(result.applied) ? result.applied : []
  const isApply = result.dryRun === false
  return (
    <div className={`rounded-[14px] border p-4 ${isApply ? 'border-[#cfe8d8] bg-[#effaf3]' : 'border-[#f5d3a4] bg-[#fff8ec]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">
            {isApply ? 'Seller document reconciliation result' : 'Seller document reconciliation dry-run'}
          </h3>
          <p className="mt-2 text-sm text-[#60758d]">
            {isApply ? 'Requirement sync finished for the reviewed listings.' : 'No requirement rows were changed.'}
          </p>
        </div>
        <span className="text-sm font-semibold text-[#31485e]">{isApply ? 'applied' : 'dry-run'}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-6">
        <StatCard label="Checked" value={summary.total || 0} />
        <StatCard label="Ready" value={summary.ready || 0} tone="success" />
        <StatCard label="Need sync" value={summary.needsSync || 0} tone={summary.needsSync ? 'warning' : 'success'} />
        <StatCard label="Syncable" value={summary.syncable || 0} tone={summary.syncable ? 'warning' : 'success'} />
        <StatCard label="Missing rows" value={summary.missingRequirementRows || 0} tone={summary.missingRequirementRows ? 'warning' : 'success'} />
        <StatCard label="Stale rows" value={summary.staleRequirementRows || 0} tone={summary.staleRequirementRows ? 'warning' : 'success'} />
      </div>
      {isApply ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatCard label="Attempted" value={result.applySummary?.attempted || applied.length || 0} />
          <StatCard label="Synced" value={result.applySummary?.synced || 0} tone="success" />
          <StatCard label="Failed" value={result.applySummary?.failed || 0} tone={result.applySummary?.failed ? 'critical' : 'success'} />
        </div>
      ) : null}
      {syncable.length ? (
        <ul className="mt-3 divide-y divide-[#edf1f6] text-sm text-[#60758d]">
          {syncable.slice(0, 6).map((row) => (
            <li key={row.listingId} className="grid gap-2 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <span className="font-semibold text-[#31485e]">{row.title || row.listingId}</span>
              <span>Missing: {(row.missingRequirementKeys || []).join(', ') || '-'}</span>
              <span>Stale: {(row.staleRequirementKeys || []).join(', ') || '-'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function IssueList({ issues = [] }) {
  if (!issues.length) {
    return <p className="rounded-[14px] border border-[#cfe8d8] bg-[#effaf3] px-4 py-3 text-sm text-[#236340]">No integrity issues detected in this check.</p>
  }
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
          <tr>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">Issue</th>
            <th className="px-4 py-3">Entity</th>
            <th className="px-4 py-3">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f6]">
          {issues.map((issue, index) => (
            <tr key={`${issue.code}-${issue.entityId}-${index}`}>
              <td className="px-4 py-3 font-semibold capitalize">{issue.severity}</td>
              <td className="px-4 py-3">{String(issue.code || '').replace(/_/g, ' ')}</td>
              <td className="px-4 py-3">{issue.entityType || 'system'} {issue.entityId ? `· ${issue.entityId}` : ''}</td>
              <td className="px-4 py-3 text-[#60758d]">{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function sumActionCounts(actions = []) {
  return (Array.isArray(actions) ? actions : []).reduce((total, action) => total + Number(action?.count || 0), 0)
}

function formatDiagnosticDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleString()
}

function getDiagnosticStatusTone(status) {
  if (status === 'critical' || status === 'forbidden' || status === 'not_configured' || status === 'fail' || status === 'blocked') return 'critical'
  if (status === 'warning' || status === 'attention' || status === 'not_installed') return 'warning'
  if (status === 'healthy' || status === 'pass') return 'success'
  return 'neutral'
}

function asDiagnosticObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export default function PlatformDiagnosticsPage() {
  const { authState } = useAuthSession()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [entityType, setEntityType] = useState('user')
  const [entityId, setEntityId] = useState(authState.user?.id || '')
  const [error, setError] = useState('')
  const [operations, setOperations] = useState(null)
  const [operationsLoading, setOperationsLoading] = useState(false)
  const [demoSummary, setDemoSummary] = useState(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [launchReadiness, setLaunchReadiness] = useState(null)
  const [launchLoading, setLaunchLoading] = useState(false)
  const [routingDiagnostics, setRoutingDiagnostics] = useState(null)
  const [routingLoading, setRoutingLoading] = useState(false)
  const [assignmentDiagnostics, setAssignmentDiagnostics] = useState(null)
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [inviteHealth, setInviteHealth] = useState(null)
  const [inviteReconciliation, setInviteReconciliation] = useState(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteApplyLoading, setInviteApplyLoading] = useState(false)
  const [inviteApplyResult, setInviteApplyResult] = useState(null)
  const [notificationHealth, setNotificationHealth] = useState(null)
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationDispatchLoading, setNotificationDispatchLoading] = useState(false)
  const [notificationDispatchResult, setNotificationDispatchResult] = useState(null)
  const [mandateContinuity, setMandateContinuity] = useState(null)
  const [mandateContinuityLoading, setMandateContinuityLoading] = useState(false)
  const [mandateInviteBackfill, setMandateInviteBackfill] = useState(null)
  const [mandateInviteBackfillLoading, setMandateInviteBackfillLoading] = useState(false)
  const [mandateInviteBackfillApplyLoading, setMandateInviteBackfillApplyLoading] = useState(false)
  const [sellerDocumentReconciliation, setSellerDocumentReconciliation] = useState(null)
  const [sellerDocumentReconciliationLoading, setSellerDocumentReconciliationLoading] = useState(false)
  const [sellerDocumentReconciliationApplyLoading, setSellerDocumentReconciliationApplyLoading] = useState(false)
  const [documentConsistency, setDocumentConsistency] = useState(null)
  const [documentConsistencyLoading, setDocumentConsistencyLoading] = useState(false)
  const [workspaceBrandingIntegrity, setWorkspaceBrandingIntegrity] = useState(null)
  const [workspaceBrandingIntegrityLoading, setWorkspaceBrandingIntegrityLoading] = useState(false)
  const [legalGenerationHandoffs, setLegalGenerationHandoffs] = useState(null)
  const [legalGenerationHandoffsLoading, setLegalGenerationHandoffsLoading] = useState(false)
  const [legalGenerationHandoffAction, setLegalGenerationHandoffAction] = useState('')
  const [legalGenerationResolutionByReference, setLegalGenerationResolutionByReference] = useState({})

  const summary = useMemo(() => result?.summary || result || {}, [result])
  const issues = result?.issues || []
  const inviteReconciliationActionCount = sumActionCounts(inviteReconciliation?.actions)
  const inviteAppliedActionCount = sumActionCounts(inviteApplyResult?.actions)
  const mandateInviteBackfillPlannedCandidates = useMemo(() => {
    if (!mandateInviteBackfill?.dryRun) return []
    return (Array.isArray(mandateInviteBackfill.actions) ? mandateInviteBackfill.actions : [])
      .filter((action) => action.status === 'planned' && action.packetId && action.listingId)
      .map((action) => ({
        listingId: action.listingId,
        packetId: action.packetId,
        sellerWorkspaceToken: action.sellerWorkspaceToken || '',
        previousInviteStatus: action.previousInviteStatus || 'missing',
      }))
  }, [mandateInviteBackfill])
  const mandateInviteBackfillPlannedCount = mandateInviteBackfill?.dryRun
    ? Number(mandateInviteBackfillPlannedCandidates.length || 0)
    : 0
  const sellerDocumentReconciliationPlannedIds = useMemo(() => {
    if (!sellerDocumentReconciliation?.dryRun) return []
    return (sellerDocumentReconciliation.actionQueues?.syncable || [])
      .map((row) => row.listingId)
      .filter(Boolean)
  }, [sellerDocumentReconciliation])
  const sellerDocumentReconciliationPlannedCount = sellerDocumentReconciliationPlannedIds.length

  async function refreshNotificationAutomationHealth() {
    const snapshot = await getNotificationAutomationHealth({
      organisationId: currentWorkspace?.id || '',
    })
    setNotificationHealth(snapshot)
    return snapshot
  }

  async function loadOperationsCenter() {
    try {
      setOperationsLoading(true)
      setError('')
      const [health, auditMetrics, recentEvents, deployment, workflowEngine] = await Promise.all([
        getOperationalHealthSummary({ createdBy: authState.user?.id || null }),
        getAuditMetrics(),
        getRecentOperationalEvents(12),
        deploymentHealthCheck({ persist: true, createdBy: authState.user?.id || null }),
        getWorkflowEngineHealth(),
      ])
      setOperations({ health, auditMetrics, recentEvents, deployment, workflowEngine })
    } catch (operationsError) {
      setError(operationsError?.message || 'Operations health check failed.')
    } finally {
      setOperationsLoading(false)
    }
  }

  async function loadLegalGenerationHandoffs() {
    try {
      setLegalGenerationHandoffsLoading(true)
      setError('')
      setLegalGenerationHandoffs(await listLegalDocumentGenerationSupportHandoffs({
        organisationId: currentWorkspace?.id || null,
        limit: 50,
      }))
    } catch (handoffError) {
      setError(handoffError?.code === 'SUPPORT_HANDOFF_ADMIN_REQUIRED'
        ? 'Organisation administrator access is required to view legal-document support handoffs.'
        : 'Legal-document support handoffs could not be loaded.')
    } finally {
      setLegalGenerationHandoffsLoading(false)
    }
  }

  async function transitionLegalGenerationHandoff(handoff, action) {
    const actionKey = `${action}:${handoff.supportReference}`
    try {
      setLegalGenerationHandoffAction(actionKey)
      setError('')
      await transitionLegalDocumentGenerationSupportHandoff({
        organisationId: currentWorkspace?.id || null,
        packetId: handoff.packetId,
        supportReference: handoff.supportReference,
        action,
        resolutionCode: action === 'resolve'
          ? legalGenerationResolutionByReference[handoff.supportReference] || 'generation_succeeded'
          : '',
      })
      await loadLegalGenerationHandoffs()
    } catch (handoffError) {
      setError(handoffError?.code === 'SUPPORT_HANDOFF_ACKNOWLEDGEMENT_REQUIRED'
        ? 'A legal-generation support handoff must be acknowledged before it can be resolved.'
        : 'The legal-generation support handoff could not be updated.')
    } finally {
      setLegalGenerationHandoffAction('')
    }
  }

  async function loadWorkspaceBrandingIntegrity() {
    try {
      setWorkspaceBrandingIntegrityLoading(true)
      setError('')
      setWorkspaceBrandingIntegrity(await getWorkspaceBrandingIntegrityDiagnostics())
    } catch (integrityError) {
      setError(integrityError?.message || 'Workspace branding integrity check failed.')
    } finally {
      setWorkspaceBrandingIntegrityLoading(false)
    }
  }

  async function loadDemoAndLaunchReadiness() {
    try {
      setLaunchLoading(true)
      setError('')
      const [demo, readiness] = await Promise.all([
        getDemoEnvironmentSummary(),
        calculateLaunchReadiness({ persist: true, checkedBy: authState.user?.id || null }),
      ])
      setDemoSummary(demo)
      setLaunchReadiness(readiness)
    } catch (readinessError) {
      setError(readinessError?.message || 'Launch readiness check failed.')
    } finally {
      setLaunchLoading(false)
    }
  }

  async function runDemoDryRunReset() {
    try {
      setDemoLoading(true)
      setError('')
      const resetResult = await resetDemoEnvironment({ scope: 'all', dryRun: true, userId: authState.user?.id || '' })
      const nextDemo = await getDemoEnvironmentSummary()
      setDemoSummary({ ...nextDemo, lastResetResult: resetResult })
    } catch (demoError) {
      setError(demoError?.message || 'Demo reset dry-run failed.')
    } finally {
      setDemoLoading(false)
    }
  }

  async function loadRoutingDiagnostics() {
    try {
      setRoutingLoading(true)
      setError('')
      const routingRules = await listOrganisationPartnerRoutingRules().catch(() => [])
      const snapshot = await getUniversalPartnerRoutingDiagnosticsSnapshot({
        workspaceId: currentWorkspace?.id || '',
        routingRules,
      })
      setRoutingDiagnostics(snapshot)
    } catch (routingError) {
      setError(routingError?.message || 'Partner routing diagnostics failed.')
    } finally {
      setRoutingLoading(false)
    }
  }

  async function loadAssignmentDiagnostics() {
    try {
      setAssignmentLoading(true)
      setError('')
      const snapshot = await getUniversalAssignmentDiagnosticsSnapshot({
        workspaceId: currentWorkspace?.id || '',
      })
      setAssignmentDiagnostics(snapshot)
    } catch (assignmentError) {
      setError(assignmentError?.message || 'Assignment diagnostics failed.')
    } finally {
      setAssignmentLoading(false)
    }
  }

  async function loadInviteDiagnostics() {
    try {
      setInviteLoading(true)
      setError('')
      setInviteApplyResult(null)
      const [health, reconciliation] = await Promise.all([
        getCanonicalInviteHealth(),
        reconcileCanonicalInvites({ dryRun: true }),
      ])
      setInviteHealth(health)
      setInviteReconciliation(reconciliation)
    } catch (inviteError) {
      setError(inviteError?.message || 'Canonical invite diagnostics failed.')
    } finally {
      setInviteLoading(false)
    }
  }

  async function loadNotificationAutomationDiagnostics() {
    try {
      setNotificationLoading(true)
      setError('')
      setNotificationDispatchResult(null)
      await refreshNotificationAutomationHealth()
    } catch (notificationError) {
      setError(notificationError?.message || 'Notification automation diagnostics failed.')
    } finally {
      setNotificationLoading(false)
    }
  }

  async function loadSellerMandateContinuityDiagnostics() {
    try {
      setMandateContinuityLoading(true)
      setError('')
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured for seller mandate continuity diagnostics.')
      }
      const snapshot = await getSellerMandateContinuityDiagnosticsSnapshot({
        client: supabase,
        organisationId: currentWorkspace?.id || '',
        limit: 50,
      })
      setMandateContinuity(snapshot)
    } catch (mandateError) {
      setError(mandateError?.message || 'Seller mandate continuity diagnostics failed.')
    } finally {
      setMandateContinuityLoading(false)
    }
  }

  async function runSellerPortalInviteBackfillDryRun() {
    try {
      setMandateInviteBackfillLoading(true)
      setError('')
      const dryRun = await backfillSellerPortalInvitesAfterSignedMandates({
        organisationId: currentWorkspace?.id || '',
        limit: 50,
        dryRun: true,
      })
      setMandateInviteBackfill(dryRun)
    } catch (backfillError) {
      setError(backfillError?.message || 'Seller portal invite backfill dry-run failed.')
    } finally {
      setMandateInviteBackfillLoading(false)
    }
  }

  async function applySellerPortalInviteBackfill() {
    if (!mandateInviteBackfillPlannedCount) return
    const confirmed = window.confirm(`Send ${mandateInviteBackfillPlannedCount} seller portal password setup invite${mandateInviteBackfillPlannedCount === 1 ? '' : 's'} now? This can send live seller emails.`)
    if (!confirmed) return

    try {
      setMandateInviteBackfillApplyLoading(true)
      setError('')
      const applied = await backfillSellerPortalInvitesAfterSignedMandates({
        organisationId: currentWorkspace?.id || '',
        limit: 50,
        dryRun: false,
        plannedCandidates: mandateInviteBackfillPlannedCandidates,
      })
      setMandateInviteBackfill(applied)
      await loadSellerMandateContinuityDiagnostics()
    } catch (backfillError) {
      setError(backfillError?.message || 'Seller portal invite backfill failed.')
    } finally {
      setMandateInviteBackfillApplyLoading(false)
    }
  }

  async function runSellerDocumentReconciliationDryRun() {
    try {
      setSellerDocumentReconciliationLoading(true)
      setError('')
      const dryRun = await runSellerDocumentRequirementReconciliation({
        organisationId: currentWorkspace?.id || '',
        limit: 100,
        dryRun: true,
      })
      setSellerDocumentReconciliation(dryRun)
    } catch (reconciliationError) {
      setError(reconciliationError?.message || 'Seller document reconciliation dry-run failed.')
    } finally {
      setSellerDocumentReconciliationLoading(false)
    }
  }

  async function applySellerDocumentReconciliation() {
    if (!sellerDocumentReconciliationPlannedCount) return
    const confirmed = window.confirm(`Apply seller document requirement sync for ${sellerDocumentReconciliationPlannedCount} listing${sellerDocumentReconciliationPlannedCount === 1 ? '' : 's'} from the reviewed dry-run plan?`)
    if (!confirmed) return

    try {
      setSellerDocumentReconciliationApplyLoading(true)
      setError('')
      const applied = await runSellerDocumentRequirementReconciliation({
        listingIds: sellerDocumentReconciliationPlannedIds,
        limit: sellerDocumentReconciliationPlannedCount,
        dryRun: false,
      })
      setSellerDocumentReconciliation(applied)
    } catch (reconciliationError) {
      setError(reconciliationError?.message || 'Seller document reconciliation failed.')
    } finally {
      setSellerDocumentReconciliationApplyLoading(false)
    }
  }

  async function loadCrossModuleDocumentConsistency() {
    try {
      setDocumentConsistencyLoading(true)
      setError('')
      const audit = {
        ...buildCrossModuleDocumentConsistencyAudit(),
        source: 'static_contract',
      }
      setDocumentConsistency({
        ...audit,
        gate: buildCrossModuleDocumentConsistencyGate(audit),
      })
    } catch (consistencyError) {
      setError(consistencyError?.message || 'Cross-module document consistency diagnostics failed.')
    } finally {
      setDocumentConsistencyLoading(false)
    }
  }

  async function loadLiveCrossModuleDocumentConsistency() {
    try {
      setDocumentConsistencyLoading(true)
      setError('')
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured for live document consistency diagnostics.')
      }
      const snapshot = await fetchCrossModuleDocumentConsistencySnapshot({
        client: supabase,
        organisationId: currentWorkspace?.id || '',
        limit: 100,
      })
      setDocumentConsistency({
        ...snapshot,
        gate: buildCrossModuleDocumentConsistencyGate(snapshot),
      })
    } catch (consistencyError) {
      setError(consistencyError?.message || 'Live document consistency diagnostics failed.')
    } finally {
      setDocumentConsistencyLoading(false)
    }
  }

  async function runNotificationReminderDryRun() {
    try {
      setNotificationDispatchLoading(true)
      setError('')
      const dryRun = await dispatchNotificationReminders({
        dryRun: true,
        limit: 25,
        queueDue: true,
        queueLimit: 50,
        resetStale: true,
      })
      setNotificationDispatchResult(dryRun)
      await refreshNotificationAutomationHealth()
    } catch (notificationError) {
      setError(notificationError?.message || 'Notification reminder dry-run failed.')
    } finally {
      setNotificationDispatchLoading(false)
    }
  }

  async function runNotificationReminderDispatch() {
    const confirmed = window.confirm('Dispatch queued notification reminder emails now? This can send live buyer, seller, attorney, bond originator, and agent reminders.')
    if (!confirmed) return
    try {
      setNotificationDispatchLoading(true)
      setError('')
      const dispatched = await dispatchNotificationReminders({
        dryRun: false,
        limit: 25,
        queueDue: true,
        queueLimit: 50,
        resetStale: true,
      })
      setNotificationDispatchResult(dispatched)
      await refreshNotificationAutomationHealth()
    } catch (notificationError) {
      setError(notificationError?.message || 'Notification reminder dispatch failed.')
    } finally {
      setNotificationDispatchLoading(false)
    }
  }

  async function applyInviteReconciliation() {
    const pendingActionCount = sumActionCounts(inviteReconciliation?.actions)
    if (!pendingActionCount) return
    const confirmed = window.confirm(`Apply ${pendingActionCount} canonical invite reconciliation update${pendingActionCount === 1 ? '' : 's'}? This writes audit events and repair logs.`)
    if (!confirmed) return

    try {
      setInviteApplyLoading(true)
      setError('')
      const applied = await applyCanonicalInviteReconciliation()
      const [health, reconciliation] = await Promise.all([
        getCanonicalInviteHealth(),
        reconcileCanonicalInvites({ dryRun: true }),
      ])
      setInviteApplyResult(applied)
      setInviteHealth(health)
      setInviteReconciliation(reconciliation)
    } catch (inviteError) {
      setError(inviteError?.message || 'Canonical invite reconciliation failed.')
    } finally {
      setInviteApplyLoading(false)
    }
  }

  async function runSelectedCheck() {
    try {
      setLoading(true)
      setError('')
      const safeId = String(entityId || '').trim()
      if (entityType !== 'system' && !safeId) throw new Error('Enter an entity id before running diagnostics.')
      const next =
        entityType === 'system'
          ? await runIntegrityChecks({ createdBy: authState.user?.id || null })
          : entityType === 'workspace'
            ? await validateWorkspaceStateById(safeId)
            : entityType === 'transaction'
              ? await validateTransactionStateById(safeId)
              : await validateUserState(safeId)
      setResult(next)
    } catch (diagnosticError) {
      setError(diagnosticError?.message || 'Diagnostics failed.')
    } finally {
      setLoading(false)
    }
  }

  const notificationIssues = notificationHealth?.issues || []
  const notificationQueueResult = asDiagnosticObject(notificationDispatchResult?.queueResult)
  const notificationAutomationCounts = Object.entries(notificationHealth?.countsByAutomation || {}).slice(0, 8)
  const notificationRunRows = notificationHealth?.recentRuns || []
  const notificationFailureRows = notificationHealth?.recentFailures || []
  const notificationPremiumControls = notificationHealth?.premiumControls || null
  const notificationReminderPolicies = notificationHealth?.reminderPolicies || []
  const mandateContinuityGate = mandateContinuity
    ? mandateContinuity.gate || getSellerMandateContinuityReleaseGate(mandateContinuity)
    : null
  const mandateContinuityRows = mandateContinuity?.records || []
  const mandateContinuityWarnings = mandateContinuity?.queryWarnings || []
  const documentConsistencySummary = documentConsistency?.summary || {}
  const documentConsistencyIssues = documentConsistency?.issues || []
  const documentConsistencyGroups = documentConsistency?.parityGroups || []
  const documentConsistencyWarnings = documentConsistency?.queryWarnings || []
  const documentConsistencyGate = documentConsistency
    ? documentConsistency.gate || buildCrossModuleDocumentConsistencyGate(documentConsistency)
    : null

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '1.25rem' }}>
        <header className="grid gap-2 border-b border-[#e8eef5] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Platform Admin</p>
          <h1 className="text-[1.45rem] font-semibold text-[#142132]">Operations Center</h1>
          <p className="max-w-3xl text-sm leading-6 text-[#60758d]">
            Validate platform health, deployment safety, telemetry, errors, users, workspaces, transactions, onboarding state, memberships, and orphaned records without silently repairing production data.
          </p>
          <div>
            <button type="button" className="header-secondary-cta" onClick={loadOperationsCenter} disabled={operationsLoading}>
              {operationsLoading ? 'Checking operations...' : 'Run operations health'}
            </button>
            <button type="button" className="header-secondary-cta ml-2" onClick={loadDemoAndLaunchReadiness} disabled={launchLoading}>
              {launchLoading ? 'Checking launch...' : 'Launch readiness'}
            </button>
          </div>
        </header>

        {operations ? (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard label="Health" value={operations.health?.status || 'unknown'} tone={operations.health?.status === 'critical' ? 'critical' : 'success'} />
              <StatCard label="Deploy" value={operations.deployment?.status || 'unknown'} tone={operations.deployment?.status === 'failed' ? 'critical' : operations.deployment?.status === 'warning' ? 'warning' : 'success'} />
              <StatCard label="Errors" value={operations.auditMetrics?.errorEvents || 0} tone={operations.auditMetrics?.errorEvents ? 'warning' : 'success'} />
              <StatCard label="Telemetry" value={operations.auditMetrics?.telemetryEvents || 0} />
            </div>
            <div className="rounded-[14px] border border-[#dde4ee] bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Recent operational events</h2>
              {operations.recentEvents?.length ? (
                <ul className="mt-3 divide-y divide-[#edf1f6] text-sm">
                  {operations.recentEvents.map((event) => (
                    <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <span>{event.category} · {event.event_name}</span>
                      <span className="text-[#60758d]">{event.route || 'system'} · {event.severity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#60758d]">No telemetry events available yet.</p>
              )}
            </div>
            {operations.workflowEngine ? (
              <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Workflow engine health</h2>
                    <p className="mt-2 text-sm text-[#60758d]">
                      Canonical lifecycle coverage, stale roll-ups, recompute failures, overrides, and missing workflow scaffolding.
                    </p>
                  </div>
                  <p className="text-xs font-medium text-[#60758d]">
                    Generated {new Date(operations.workflowEngine.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard label="Roll-up coverage" value={`${operations.workflowEngine.totals?.coveragePercent || 0}%`} tone={(operations.workflowEngine.totals?.coveragePercent || 0) >= 95 ? 'success' : 'warning'} />
                  <StatCard label="Stale roll-ups" value={operations.workflowEngine.totals?.staleRollups || 0} tone={operations.workflowEngine.totals?.staleRollups ? 'warning' : 'success'} />
                  <StatCard label="Recompute failures" value={operations.workflowEngine.totals?.recomputeFailures || 0} tone={operations.workflowEngine.totals?.recomputeFailures ? 'critical' : 'success'} />
                  <StatCard label="Blocked workflows" value={operations.workflowEngine.totals?.blockedWorkflows || 0} tone={operations.workflowEngine.totals?.blockedWorkflows ? 'warning' : 'success'} />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard label="Overrides" value={operations.workflowEngine.totals?.overrideCount || 0} />
                  <StatCard label="Audit rows" value={operations.workflowEngine.totals?.auditVolume || 0} />
                  <StatCard label="Missing instances" value={operations.workflowEngine.totals?.missingWorkflowInstances || 0} tone={operations.workflowEngine.totals?.missingWorkflowInstances ? 'warning' : 'success'} />
                  <StatCard label="Missing steps" value={operations.workflowEngine.totals?.missingWorkflowSteps || 0} tone={operations.workflowEngine.totals?.missingWorkflowSteps ? 'warning' : 'success'} />
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Workflow engine notes</h3>
                  <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                    <li>Average recompute time: {operations.workflowEngine.totals?.averageRecomputeTimeMs ?? 'Unavailable'} ms</li>
                    <li>Stale threshold: {operations.workflowEngine.staleThresholdMinutes || 30} minutes</li>
                    <li>Stale transactions: {(operations.workflowEngine.staleTransactions || []).slice(0, 5).join(', ') || 'None'}</li>
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Legal generation support handoffs</h2>
              <p className="mt-2 max-w-3xl text-sm text-[#60758d]">
                Find sanitised mandate and OTP generation escalations for the active organisation. This view is read-only and restricted to organisation administrators.
              </p>
            </div>
            <button type="button" className="header-secondary-cta" onClick={loadLegalGenerationHandoffs} disabled={legalGenerationHandoffsLoading}>
              {legalGenerationHandoffsLoading ? 'Loading handoffs...' : 'Load support handoffs'}
            </button>
          </div>
          {legalGenerationHandoffs ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-7">
                <StatCard label="Total" value={legalGenerationHandoffs.summary?.total || 0} />
                <StatCard label="Open" value={legalGenerationHandoffs.summary?.open || 0} tone={legalGenerationHandoffs.summary?.open ? 'warning' : 'success'} />
                <StatCard label="Acknowledged" value={legalGenerationHandoffs.summary?.acknowledged || 0} />
                <StatCard label="Resolved" value={legalGenerationHandoffs.summary?.resolved || 0} tone="success" />
                <StatCard label="SLA overdue" value={legalGenerationHandoffs.summary?.overdue || 0} tone={legalGenerationHandoffs.summary?.overdue ? 'critical' : 'success'} />
                <StatCard label="Repeated failures" value={legalGenerationHandoffs.summary?.repeatedFailures || 0} tone={legalGenerationHandoffs.summary?.repeatedFailures ? 'warning' : 'success'} />
                <StatCard label="Support escalations" value={legalGenerationHandoffs.summary?.support || 0} tone={legalGenerationHandoffs.summary?.support ? 'warning' : 'success'} />
              </div>
              {legalGenerationHandoffs.handoffs?.length ? (
                <div className="overflow-x-auto rounded-[14px] border border-[#dde4ee]">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
                      <tr>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Document</th>
                        <th className="px-4 py-3">Failure</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Case status</th>
                        <th className="px-4 py-3">SLA</th>
                        <th className="px-4 py-3">Created</th>
                        <th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1f6]">
                      {legalGenerationHandoffs.handoffs.map((handoff) => (
                        <tr key={handoff.id || `${handoff.supportReference}-${handoff.createdAt}`}>
                          <td className="px-4 py-3">
                            <button type="button" className="font-semibold text-[#245f91] hover:underline" onClick={() => navigator.clipboard?.writeText(handoff.supportReference).catch(() => null)}>
                              {handoff.supportReference}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className={`font-semibold capitalize ${handoff.overdue ? 'text-[#9f1c1c]' : handoff.slaState === 'complete' ? 'text-[#236340]' : 'text-[#60758d]'}`}>{handoff.slaState.replace(/_/g, ' ')}</p>
                            <p className="mt-1 text-xs text-[#60758d]">
                              {handoff.caseStatus === 'open' && handoff.responseDueAt ? `Acknowledge by ${new Date(handoff.responseDueAt).toLocaleString('en-ZA')}` : handoff.caseStatus === 'acknowledged' && handoff.resolutionDueAt ? `Resolve by ${new Date(handoff.resolutionDueAt).toLocaleString('en-ZA')}` : 'Completed'}
                            </p>
                            {handoff.acknowledgedBy ? <p className="mt-1 text-xs text-[#60758d]">Owner {handoff.acknowledgedBy.slice(0, 8)}…</p> : null}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#31485e]">{handoff.packetTitle}</p>
                            <p className="mt-1 text-xs uppercase text-[#60758d]">{handoff.packetType} · {handoff.packetStatus}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p>{handoff.failureCode.replace(/_/g, ' ')}</p>
                            <p className="mt-1 text-xs text-[#60758d]">Attempt {handoff.failureCount} · {handoff.escalationType}</p>
                          </td>
                          <td className="px-4 py-3 text-[#60758d]">{handoff.surface.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${handoff.caseStatus === 'resolved' ? 'bg-[#effaf3] text-[#236340]' : handoff.caseStatus === 'acknowledged' ? 'bg-[#eef5ff] text-[#245f91]' : 'bg-[#fff8ec] text-[#8a4b10]'}`}>
                              {handoff.caseStatus}
                            </span>
                            {handoff.resolutionCode ? <p className="mt-1 text-xs text-[#60758d]">{handoff.resolutionCode.replace(/_/g, ' ')}</p> : null}
                          </td>
                          <td className="px-4 py-3 text-[#60758d]">{handoff.createdAt ? new Date(handoff.createdAt).toLocaleString('en-ZA') : 'Unknown'}</td>
                          <td className="px-4 py-3">
                            {handoff.caseStatus === 'open' ? (
                              <button type="button" className="header-secondary-cta" disabled={Boolean(legalGenerationHandoffAction)} onClick={() => void transitionLegalGenerationHandoff(handoff, 'acknowledge')}>
                                {legalGenerationHandoffAction === `acknowledge:${handoff.supportReference}` ? 'Acknowledging...' : 'Acknowledge'}
                              </button>
                            ) : handoff.caseStatus === 'acknowledged' ? (
                              <div className="flex min-w-[250px] items-center gap-2">
                                <select className="rounded-lg border border-[#d7e2ee] bg-white px-2 py-2 text-xs" value={legalGenerationResolutionByReference[handoff.supportReference] || 'generation_succeeded'} onChange={(event) => setLegalGenerationResolutionByReference((current) => ({ ...current, [handoff.supportReference]: event.target.value }))}>
                                  {LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES.map((code) => <option key={code} value={code}>{code.replace(/_/g, ' ')}</option>)}
                                </select>
                                <button type="button" className="header-primary-cta" disabled={Boolean(legalGenerationHandoffAction)} onClick={() => void transitionLegalGenerationHandoff(handoff, 'resolve')}>
                                  {legalGenerationHandoffAction === `resolve:${handoff.supportReference}` ? 'Resolving...' : 'Resolve'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-[#236340]">Closed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">No legal-generation support handoffs were found for this organisation.</p>
              )}
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">Load the read-only feed when support receives a legal-document reference.</p>
          )}
        </div>

        {launchReadiness ? (
          <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard label="Launch" value={launchReadiness.summary?.status || 'unknown'} tone={launchReadiness.summary?.status === 'blocked' ? 'critical' : launchReadiness.summary?.status === 'ready' ? 'success' : 'warning'} />
              <StatCard label="Score" value={`${launchReadiness.summary?.score ?? 0}%`} tone={(launchReadiness.summary?.score || 0) >= 90 ? 'success' : 'warning'} />
              <StatCard label="Blockers" value={launchReadiness.summary?.blockerCount || 0} tone={launchReadiness.summary?.blockerCount ? 'critical' : 'success'} />
              <StatCard label="Warnings" value={launchReadiness.summary?.warningCount || 0} tone={launchReadiness.summary?.warningCount ? 'warning' : 'success'} />
            </div>
            <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
                  <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6]">
                  {launchReadiness.rows.map((row) => (
                    <tr key={row.category}>
                      <td className="px-4 py-3 font-semibold capitalize">{row.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">{row.status}</td>
                      <td className="px-4 py-3">{row.riskLevel}</td>
                      <td className="px-4 py-3 text-[#60758d]">{row.blockers[0] || row.recommendations[0] || 'Ready for verification.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Workspace branding integrity</h2>
              <p className="mt-2 max-w-3xl text-sm text-[#60758d]">
                Validate canonical attorney membership sources, mirrored organisation memberships, workspace identities, and logo availability. This check is read-only.
              </p>
            </div>
            <button type="button" className="header-secondary-cta" onClick={loadWorkspaceBrandingIntegrity} disabled={workspaceBrandingIntegrityLoading}>
              {workspaceBrandingIntegrityLoading ? 'Checking workspaces...' : 'Run workspace integrity'}
            </button>
          </div>

          {workspaceBrandingIntegrity ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-6">
                <StatCard label="Gate" value={workspaceBrandingIntegrity.gate?.status || 'unknown'} tone={getDiagnosticStatusTone(workspaceBrandingIntegrity.gate?.status)} />
                <StatCard label="Workspaces" value={workspaceBrandingIntegrity.summary?.rowCount || 0} />
                <StatCard label="Blocked" value={workspaceBrandingIntegrity.summary?.blockingCount || 0} tone={workspaceBrandingIntegrity.summary?.blockingCount ? 'critical' : 'success'} />
                <StatCard label="Source overlaps" value={workspaceBrandingIntegrity.summary?.overlapCount || 0} tone="success" />
                <StatCard label="IDs normalized" value={workspaceBrandingIntegrity.summary?.normalizedIdentityCount || 0} />
                <StatCard label="Unbranded" value={workspaceBrandingIntegrity.summary?.unbrandedCount || 0} tone={workspaceBrandingIntegrity.summary?.unbrandedCount ? 'warning' : 'success'} />
              </div>
              <p className={`rounded-[12px] border px-3 py-2 text-sm ${workspaceBrandingIntegrity.gate?.status === 'blocked' ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]' : workspaceBrandingIntegrity.gate?.status === 'warning' ? 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]' : 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'}`}>
                Phase 7 gate {workspaceBrandingIntegrity.gate?.status}: {workspaceBrandingIntegrity.gate?.reason} No records were changed.
              </p>
              {workspaceBrandingIntegrity.actions?.length ? (
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Repair preview</h3>
                  <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                    {workspaceBrandingIntegrity.actions.map((action) => (
                      <li key={action.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                        <span>{action.label}</span>
                        <span className="font-semibold text-[#31485e]">{action.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">
              Run workspace integrity after deploying the Phase 6 database projection and before expanding the attorney rollout.
            </p>
          )}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Seller mandate continuity</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Audit signed mandate linkage across listings, leads, seller-visible documents, seller portal context, invite delivery, and activity feed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="header-secondary-cta" onClick={loadSellerMandateContinuityDiagnostics} disabled={mandateContinuityLoading}>
                {mandateContinuityLoading ? 'Checking mandates...' : 'Run mandate continuity'}
              </button>
              <button type="button" className="header-secondary-cta" onClick={runSellerPortalInviteBackfillDryRun} disabled={mandateInviteBackfillLoading || mandateInviteBackfillApplyLoading}>
                {mandateInviteBackfillLoading ? 'Planning...' : 'Dry-run invite backfill'}
              </button>
              <button
                type="button"
                className="header-primary-cta"
                onClick={applySellerPortalInviteBackfill}
                disabled={mandateInviteBackfillApplyLoading || mandateInviteBackfillLoading || !mandateInviteBackfillPlannedCount}
              >
                {mandateInviteBackfillApplyLoading ? 'Sending...' : 'Apply invite backfill'}
              </button>
            </div>
          </div>

          {mandateContinuity ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Continuity" value={mandateContinuity.summary?.status || 'unknown'} tone={mandateContinuity.summary?.status === 'blocked' ? 'critical' : mandateContinuity.summary?.status === 'ready' ? 'success' : 'warning'} />
                <StatCard label="Score" value={`${mandateContinuity.summary?.score ?? 0}%`} tone={(mandateContinuity.summary?.score || 0) >= 90 ? 'success' : 'warning'} />
                <StatCard label="Blocked" value={mandateContinuity.summary?.blocked || 0} tone={mandateContinuity.summary?.blocked ? 'critical' : 'success'} />
                <StatCard label="Gate" value={mandateContinuityGate?.status || 'unknown'} tone={mandateContinuityGate?.status === 'fail' ? 'critical' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Ready" value={mandateContinuity.summary?.ready || 0} tone="success" />
                <StatCard label="Needs review" value={mandateContinuity.summary?.warning || 0} tone={mandateContinuity.summary?.warning ? 'warning' : 'success'} />
                <StatCard label="Linked document" value={mandateContinuity.summary?.linkedSignedDocument || 0} tone="success" />
                <StatCard label="Packet fallback" value={mandateContinuity.summary?.packetArtifactFallback || 0} tone={mandateContinuity.summary?.packetArtifactFallback ? 'warning' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Missing evidence" value={mandateContinuity.summary?.missingSignedDocument || 0} tone={mandateContinuity.summary?.missingSignedDocument ? 'critical' : 'success'} />
                <StatCard label="Missing activity" value={mandateContinuity.summary?.missingSellerActivity || 0} tone={mandateContinuity.summary?.missingSellerActivity ? 'warning' : 'success'} />
                <StatCard label="Portal warnings" value={mandateContinuity.summary?.portalWarnings || 0} tone={mandateContinuity.summary?.portalWarnings ? 'warning' : 'success'} />
                <StatCard label="Query warnings" value={mandateContinuityWarnings.length || 0} tone={mandateContinuityWarnings.length ? 'warning' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                <StatCard label="Portal invite sent" value={mandateContinuity.summary?.portalInviteSent || 0} tone="success" />
                <StatCard label="Invite action" value={mandateContinuity.summary?.portalInviteNeedsAction || 0} tone={mandateContinuity.summary?.portalInviteNeedsAction ? 'warning' : 'success'} />
                <StatCard label="Invite failed" value={mandateContinuity.summary?.portalInviteFailed || 0} tone={mandateContinuity.summary?.portalInviteFailed ? 'critical' : 'success'} />
                <StatCard label="Invite blocked" value={mandateContinuity.summary?.portalInviteBlocked || 0} tone={mandateContinuity.summary?.portalInviteBlocked ? 'warning' : 'success'} />
                <StatCard label="Invite skipped" value={mandateContinuity.summary?.portalInviteSkipped || 0} tone={mandateContinuity.summary?.portalInviteSkipped ? 'warning' : 'success'} />
              </div>

              {mandateContinuityGate?.reason ? (
                <p className={`rounded-[12px] border px-3 py-2 text-sm ${mandateContinuityGate.status === 'fail' ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]' : 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'}`}>
                  {mandateContinuityGate.reason}
                </p>
              ) : null}

              {mandateContinuityWarnings.length ? (
                <div className="rounded-[12px] border border-[#f5d3a4] bg-[#fff8ec] p-3 text-sm text-[#8a4b10]">
                  {mandateContinuityWarnings.length} diagnostic query warning{mandateContinuityWarnings.length === 1 ? '' : 's'} occurred. The report is partial.
                </div>
              ) : null}

              <SellerPortalInviteBackfillResult result={mandateInviteBackfill} />

              <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Listing</th>
                      <th className="px-4 py-3">Packet</th>
                      <th className="px-4 py-3">Signed evidence</th>
                      <th className="px-4 py-3">Portal invite</th>
                      <th className="px-4 py-3">Next action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f6]">
                    {mandateContinuityRows.length ? mandateContinuityRows.slice(0, 8).map((record) => (
                      <tr key={record.listingId || record.leadId || record.packetId}>
                        <td className="px-4 py-3 font-semibold capitalize">{String(record.status || 'unknown').replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-[#31485e]">{record.title || record.listingId || 'Unlabelled listing'}</span>
                          <span className="text-xs text-[#60758d]">{record.listingId || record.leadId || 'No listing id'}</span>
                        </td>
                        <td className="px-4 py-3 text-[#60758d]">{record.packetId || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-[#31485e]">
                            {record.signedDocumentSource === 'packet_artifact'
                              ? 'Packet artifact'
                              : record.signedDocumentSource === 'listing_document'
                                ? 'Listing document'
                                : '-'}
                          </span>
                          <span className="block max-w-[220px] truncate text-xs text-[#60758d]">
                            {record.signedDocumentName || record.finalSignedFilePath || record.finalSignedFileUrl || ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold capitalize text-[#31485e]">{String(record.portalInviteStatus || 'missing').replace(/_/g, ' ')}</span>
                          <span className="block max-w-[220px] truncate text-xs text-[#60758d]">
                            {record.portalInviteSentAt || record.portalInviteFailedAt || record.portalInviteBlockedAt || record.portalInviteReadyAt || record.portalInviteSkipReason || record.portalInviteDetail || ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#60758d]">{record.actionItems?.[0] || (record.ready ? 'No action required.' : 'Review continuity checks.')}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-4 py-5 text-center text-[#60758d]" colSpan={6}>No signed mandate records found for this workspace.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : mandateInviteBackfill ? (
            <SellerPortalInviteBackfillResult result={mandateInviteBackfill} />
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">
              Run mandate continuity to verify signed mandates before release checks or seller support follow-up.
            </p>
          )}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Cross-module document consistency</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Check seller, listing, seller-lead, buyer agency, transaction, attorney, bond, and cancellation document touchpoints against the shared canonical document map.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="header-secondary-cta" onClick={loadCrossModuleDocumentConsistency} disabled={documentConsistencyLoading}>
                {documentConsistencyLoading ? 'Checking documents...' : 'Run static contract'}
              </button>
              <button type="button" className="header-primary-cta" onClick={loadLiveCrossModuleDocumentConsistency} disabled={documentConsistencyLoading}>
                {documentConsistencyLoading ? 'Checking documents...' : 'Run live workspace'}
              </button>
            </div>
          </div>

          {documentConsistency ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-6">
                <StatCard label="Gate" value={documentConsistencyGate?.status || 'unknown'} tone={getDiagnosticStatusTone(documentConsistencyGate?.status)} />
                <StatCard label="Consistency" value={documentConsistencySummary.status || 'unknown'} tone={getDiagnosticStatusTone(documentConsistencySummary.status)} />
                <StatCard label="Mode" value={String(documentConsistencySummary.source || documentConsistency.source || 'static').replace(/_/g, ' ')} />
                <StatCard label="Rows checked" value={documentConsistencySummary.rowCount || 0} />
                <StatCard label="Parity groups" value={documentConsistencySummary.parityGroupCount || 0} tone={documentConsistencySummary.inconsistentParityGroupCount ? 'warning' : 'success'} />
                <StatCard label="Issues" value={documentConsistencySummary.issueCount || 0} tone={documentConsistencySummary.issueCount ? 'warning' : 'success'} />
              </div>
              {documentConsistencyGate ? (
                <p className={`rounded-[12px] border px-3 py-2 text-sm ${documentConsistencyGate.status === 'fail' ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]' : documentConsistencyGate.status === 'warning' ? 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]' : 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'}`}>
                  Phase 6 gate {documentConsistencyGate.status}: {documentConsistencyGate.reason} No document rows were changed.
                </p>
              ) : null}
              {documentConsistency.source === 'live_workspace' ? (
                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard label="Listings scoped" value={documentConsistencySummary.scopedListingCount || 0} />
                  <StatCard label="Transactions scoped" value={documentConsistencySummary.scopedTransactionCount || 0} />
                  <StatCard label="Touchpoint rows" value={documentConsistency.sourceCounts?.touchpointRows || 0} />
                  <StatCard label="Query warnings" value={documentConsistencySummary.queryWarningCount || 0} tone={documentConsistencySummary.queryWarningCount ? 'warning' : 'success'} />
                </div>
              ) : null}
              <p className={`rounded-[12px] border px-3 py-2 text-sm ${documentConsistencySummary.status === 'healthy' ? 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]' : 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]'}`}>
                {summarizeCrossModuleDocumentConsistencyAudit(documentConsistency)}
              </p>
              {documentConsistencyWarnings.length ? (
                <div className="rounded-[12px] border border-[#f5d3a4] bg-[#fff8ec] p-3 text-sm text-[#8a4b10]">
                  {documentConsistencyWarnings.length} live query warning{documentConsistencyWarnings.length === 1 ? '' : 's'} occurred. The report may be partial.
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Key parity groups</h3>
                  {documentConsistencyGroups.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {documentConsistencyGroups.slice(0, 8).map((group) => (
                        <li key={group.parityGroup} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                          <span>{String(group.parityGroup || '').replace(/_/g, ' ')}</span>
                          <span className="font-semibold text-[#31485e]">{group.canonicalDocumentKeys.join(', ') || 'unknown'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">Run diagnostics to view parity groups.</p>
                  )}
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Consistency issues</h3>
                  {documentConsistencyIssues.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {documentConsistencyIssues.slice(0, 8).map((issue, index) => (
                        <li key={`${issue.code}-${issue.touchpointKey}-${issue.parityGroup}-${index}`} className="border-b border-[#edf1f6] py-2 last:border-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span>{String(issue.code || '').replace(/_/g, ' ')}</span>
                            <span className="font-semibold capitalize text-[#31485e]">{issue.severity || 'warning'}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[#60758d]">{issue.message}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No cross-module document consistency issues detected.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">
              Run document consistency before changing document requirements, portal labels, attorney workspaces, or buyer agency document prompts.
            </p>
          )}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Seller document reconciliation</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Compare persisted seller document requirements with the shared listing document source-of-truth and sync old listings from a reviewed dry-run plan.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="header-secondary-cta" onClick={runSellerDocumentReconciliationDryRun} disabled={sellerDocumentReconciliationLoading || sellerDocumentReconciliationApplyLoading}>
                {sellerDocumentReconciliationLoading ? 'Checking documents...' : 'Dry-run document reconciliation'}
              </button>
              <button
                type="button"
                className="header-primary-cta"
                onClick={applySellerDocumentReconciliation}
                disabled={sellerDocumentReconciliationApplyLoading || sellerDocumentReconciliationLoading || !sellerDocumentReconciliationPlannedCount}
              >
                {sellerDocumentReconciliationApplyLoading ? 'Syncing...' : 'Apply requirement sync'}
              </button>
            </div>
          </div>

          {sellerDocumentReconciliation ? (
            <SellerDocumentReconciliationResult result={sellerDocumentReconciliation} />
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">
              Run a dry-run to find listings whose seller document requirements are missing or stale across listing documents, seller leads, and seller portal touchpoints.
            </p>
          )}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Partner routing diagnostics</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Track route outcomes, fallback pressure, and the most-used routing rules for the universal partner routing engine.
              </p>
            </div>
            <button type="button" className="header-secondary-cta" onClick={loadRoutingDiagnostics} disabled={routingLoading}>
              {routingLoading ? 'Checking routing...' : 'Run routing diagnostics'}
            </button>
          </div>

          {routingDiagnostics ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Total routes" value={routingDiagnostics.totals?.totalRoutes || 0} />
                <StatCard label="Successful" value={routingDiagnostics.totals?.successfulRoutes || 0} tone="success" />
                <StatCard label="Fallbacks" value={routingDiagnostics.totals?.fallbackRoutes || 0} tone={routingDiagnostics.totals?.fallbackRoutes ? 'warning' : 'success'} />
                <StatCard label="Failed" value={routingDiagnostics.totals?.failedRoutes || 0} tone={routingDiagnostics.totals?.failedRoutes ? 'critical' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Most used rules</h3>
                  {routingDiagnostics.mostUsedRules?.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {routingDiagnostics.mostUsedRules.map((rule) => (
                        <li key={rule.ruleId} className="flex items-center justify-between gap-3">
                          <span>{rule.ruleName || rule.ruleId}</span>
                          <span className="font-semibold text-[#31485e]">{rule.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No routing events yet.</p>
                  )}
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Recent decisions</h3>
                  {routingDiagnostics.recentEvents?.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {routingDiagnostics.recentEvents.map((event) => (
                        <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                          <span>{event.resolutionScope || 'system'} · {event.assignmentMode || 'manual'}</span>
                          <span className="font-semibold text-[#31485e]">{event.resolutionReason || 'Resolved'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No recent routing events recorded.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Notification automation diagnostics</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Monitor automation coverage, queued reminders, dispatch runs, and failed notification email events.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="header-secondary-cta" onClick={loadNotificationAutomationDiagnostics} disabled={notificationLoading}>
                {notificationLoading ? 'Checking notifications...' : 'Run notification diagnostics'}
              </button>
              <button type="button" className="header-secondary-cta" onClick={runNotificationReminderDryRun} disabled={notificationDispatchLoading}>
                {notificationDispatchLoading ? 'Running...' : 'Dry-run reminders'}
              </button>
              <button type="button" className="header-primary-cta" onClick={runNotificationReminderDispatch} disabled={notificationDispatchLoading}>
                {notificationDispatchLoading ? 'Dispatching...' : 'Dispatch reminders'}
              </button>
            </div>
          </div>

          {notificationHealth ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Automation health" value={notificationHealth.status || 'unknown'} tone={getDiagnosticStatusTone(notificationHealth.status)} />
                <StatCard label="Active automations" value={notificationHealth.totals?.activeDefinitions || 0} tone={(notificationHealth.totals?.activeDefinitions || 0) >= 17 ? 'success' : 'warning'} />
                <StatCard label="Queued reminders" value={notificationHealth.totals?.queuedReminders || 0} tone={notificationHealth.totals?.queuedReminders ? 'warning' : 'success'} />
                <StatCard label="Failed reminders" value={notificationHealth.totals?.failedReminders || 0} tone={notificationHealth.totals?.failedReminders ? 'critical' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Sent events" value={notificationHealth.totals?.sentEvents || 0} tone="success" />
                <StatCard label="Failed events" value={notificationHealth.totals?.failedEvents || 0} tone={notificationHealth.totals?.failedEvents ? 'warning' : 'success'} />
                <StatCard label="Stale processing" value={notificationHealth.totals?.staleProcessingReminders || 0} tone={notificationHealth.totals?.staleProcessingReminders ? 'critical' : 'success'} />
                <StatCard label="Planned automations" value={notificationHealth.totals?.plannedDefinitions || 0} tone={notificationHealth.totals?.plannedDefinitions ? 'warning' : 'success'} />
              </div>
              {notificationPremiumControls ? (
                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard label="Premium controls" value={notificationPremiumControls.ready ? 'ready' : 'needs setup'} tone={notificationPremiumControls.ready ? 'success' : 'warning'} />
                  <StatCard label="Cadence policies" value={`${notificationPremiumControls.cadenceConfigured || 0}/${notificationPremiumControls.totalReminderAutomations || 0}`} tone={(notificationPremiumControls.missingControls || 0) ? 'warning' : 'success'} />
                  <StatCard label="Quiet hours" value={`${notificationPremiumControls.quietHoursConfigured || 0}/${notificationPremiumControls.totalReminderAutomations || 0}`} tone={(notificationPremiumControls.quietHoursConfigured || 0) === (notificationPremiumControls.totalReminderAutomations || 0) ? 'success' : 'warning'} />
                  <StatCard label="Escalations" value={`${notificationPremiumControls.escalationConfigured || 0}/${notificationPremiumControls.totalReminderAutomations || 0}`} tone={(notificationPremiumControls.escalationConfigured || 0) === (notificationPremiumControls.totalReminderAutomations || 0) ? 'success' : 'warning'} />
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Health details</h3>
                  <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f6] py-2">
                      <span>Last event</span>
                      <span className="font-semibold text-[#31485e]">{formatDiagnosticDate(notificationHealth.totals?.lastEventAt)}</span>
                    </li>
                    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f6] py-2">
                      <span>Last reminder dispatch</span>
                      <span className="font-semibold text-[#31485e]">{formatDiagnosticDate(notificationHealth.totals?.lastDispatchAt)}</span>
                    </li>
                    <li className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <span>Events since</span>
                      <span className="font-semibold text-[#31485e]">{formatDiagnosticDate(notificationHealth.since)}</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Automation issues</h3>
                  {notificationIssues.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {notificationIssues.map((issue) => (
                        <li key={issue.code} className="flex items-start justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                          <span>{String(issue.code || '').replace(/_/g, ' ')}</span>
                          <span className="font-semibold text-[#31485e]">{issue.count || 0}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No notification automation issues detected.</p>
                  )}
                </div>
              </div>

              {notificationDispatchResult ? (
                <div className={`rounded-[14px] border p-4 ${notificationDispatchResult.dryRun ? 'border-[#f5d3a4] bg-[#fff8ec]' : 'border-[#cfe8d8] bg-[#effaf3]'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">
                        {notificationDispatchResult.dryRun ? 'Reminder dry-run result' : 'Reminder dispatch result'}
                      </h3>
                      <p className="mt-2 text-sm text-[#60758d]">
                        {notificationDispatchResult.dryRun ? 'No emails were sent.' : 'Live reminder dispatch finished.'}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[#31485e]">{notificationDispatchResult.type || 'notification_reminder_dispatch'}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <StatCard label="Due candidates" value={notificationQueueResult.candidateCount || 0} />
                    <StatCard label="Queued" value={notificationQueueResult.queuedCount || 0} />
                    <StatCard label="Claimed" value={notificationDispatchResult.claimedCount || 0} />
                    <StatCard label={notificationDispatchResult.dryRun ? 'Ready' : 'Sent'} value={notificationDispatchResult.dryRun ? notificationDispatchResult.claimedCount || 0 : notificationDispatchResult.dispatchedCount || 0} tone="success" />
                    <StatCard label="Failed" value={notificationDispatchResult.failedCount || 0} tone={notificationDispatchResult.failedCount ? 'critical' : 'success'} />
                  </div>
                  <p className="mt-3 text-sm text-[#60758d]">
                    Quiet-hour deferred: {notificationQueueResult.quietHoursDeferredCount || 0}. Stale claims reset: {notificationDispatchResult.staleResetCount || 0}. Skipped queue candidates: {notificationQueueResult.skippedCount || 0}.
                  </p>
                </div>
              ) : null}

              {notificationReminderPolicies.length ? (
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Premium reminder controls</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {notificationReminderPolicies.map((policy) => {
                      const cadenceDays = Array.isArray(policy.cadenceDays) ? policy.cadenceDays : []
                      const quietHours = asDiagnosticObject(policy.quietHours)
                      const escalation = asDiagnosticObject(policy.escalation)
                      return (
                        <div key={policy.automationKey} className="rounded-[12px] border border-[#dde4ee] bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#31485e]">{String(policy.displayName || policy.automationKey || '').replace(/_/g, ' ')}</p>
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">{policy.status || 'unknown'}</span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[#60758d]">
                            Cadence: {cadenceDays.length ? cadenceDays.map((day) => `day ${day}`).join(', ') : 'Not configured'}.
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#60758d]">
                            Quiet hours: {quietHours.enabled ? `${quietHours.startHour}:00-${quietHours.endHour}:00 ${quietHours.timezone || ''}` : 'Off'}.
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#60758d]">
                            Escalation: {escalation.enabled ? escalation.label || escalation.recipientRole || 'Enabled' : 'Off'}.
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Automation volume</h3>
                  {notificationAutomationCounts.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {notificationAutomationCounts.map(([automationKey, count]) => (
                        <li key={automationKey} className="flex items-center justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                          <span>{String(automationKey).replace(/_/g, ' ')}</span>
                          <span className="font-semibold text-[#31485e]">{count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No notification events in the selected window.</p>
                  )}
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Recent dispatch runs</h3>
                  {notificationRunRows.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {notificationRunRows.map((run) => (
                        <li key={run.id} className="border-b border-[#edf1f6] py-2 last:border-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span>{run.dry_run ? 'Dry-run' : 'Dispatch'} · {run.status || 'unknown'}</span>
                            <span className="font-semibold text-[#31485e]">{formatDiagnosticDate(run.started_at || run.startedAt)}</span>
                          </div>
                          <p className="mt-1 text-xs text-[#60758d]">Queued {run.queued_count ?? run.queuedCount ?? 0} · skipped {run.skipped_count ?? run.skippedCount ?? 0}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No reminder dispatch runs recorded yet.</p>
                  )}
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Recent failures</h3>
                  {notificationFailureRows.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {notificationFailureRows.map((failure) => (
                        <li key={failure.id} className="border-b border-[#edf1f6] py-2 last:border-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span>{String(failure.automation_key || 'notification').replace(/_/g, ' ')}</span>
                            <span className="font-semibold text-[#31485e]">{formatDiagnosticDate(failure.failed_at || failure.created_at)}</span>
                          </div>
                          <p className="mt-1 text-xs text-[#60758d]">{failure.error_message || failure.last_dispatch_error || failure.subject || 'No failure detail recorded.'}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No notification failures in the selected window.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-4 py-6 text-center text-sm text-[#60758d]">
              Run notification diagnostics to view automation health and reminder dispatch readiness.
            </p>
          )}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Canonical invite diagnostics</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Monitor partner, buyer, and seller invite activation sync across canonical invites, participants, and portal records.
              </p>
            </div>
            <button type="button" className="header-secondary-cta" onClick={loadInviteDiagnostics} disabled={inviteLoading}>
              {inviteLoading ? 'Checking invites...' : 'Run invite diagnostics'}
            </button>
          </div>

          {inviteHealth ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Invite health" value={inviteHealth.status || 'unknown'} tone={inviteHealth.status === 'critical' ? 'critical' : inviteHealth.status === 'warning' ? 'warning' : 'success'} />
                <StatCard label="Pending partners" value={inviteHealth.totals?.pendingPartnerInvites || 0} />
                <StatCard label="Pending clients" value={inviteHealth.totals?.pendingClientInvites || 0} />
                <StatCard label="Stale pending" value={inviteHealth.totals?.stalePendingInvites || 0} tone={inviteHealth.totals?.stalePendingInvites ? 'warning' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Partner gaps" value={inviteHealth.totals?.partnerSyncGaps || 0} tone={inviteHealth.totals?.partnerSyncGaps ? 'critical' : 'success'} />
                <StatCard label="Buyer participant gaps" value={inviteHealth.totals?.buyerParticipantSyncGaps || 0} tone={inviteHealth.totals?.buyerParticipantSyncGaps ? 'critical' : 'success'} />
                <StatCard label="Portal gaps" value={(inviteHealth.totals?.buyerPortalSyncGaps || 0) + (inviteHealth.totals?.sellerPortalSyncGaps || 0)} tone={(inviteHealth.totals?.buyerPortalSyncGaps || inviteHealth.totals?.sellerPortalSyncGaps) ? 'warning' : 'success'} />
                <StatCard label="Duplicate pending" value={inviteHealth.totals?.duplicatePendingInvites || 0} tone={inviteHealth.totals?.duplicatePendingInvites ? 'warning' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Invite issues</h3>
                  {inviteHealth.issues?.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {inviteHealth.issues.map((issue) => (
                        <li key={issue.code} className="flex items-start justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                          <span>{String(issue.code || '').replace(/_/g, ' ')}</span>
                          <span className="font-semibold text-[#31485e]">{issue.count || 0}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No canonical invite issues detected.</p>
                  )}
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Dry-run reconciliation</h3>
                  {inviteReconciliation?.actions?.length ? (
                    <>
                      <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                        {inviteReconciliation.actions.map((action) => (
                          <li key={action.code} className="flex items-center justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                            <span>{String(action.code || '').replace(/_/g, ' ')}</span>
                            <span className="font-semibold text-[#31485e]">{action.count || 0}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#dde4ee] bg-white p-3">
                        <p className="text-sm text-[#60758d]">
                          {inviteReconciliationActionCount ? `${inviteReconciliationActionCount} update${inviteReconciliationActionCount === 1 ? '' : 's'} ready to apply.` : 'No reconciliation updates are currently needed.'}
                        </p>
                        <button
                          type="button"
                          className="header-primary-cta"
                          onClick={applyInviteReconciliation}
                          disabled={inviteApplyLoading || inviteLoading || !inviteReconciliationActionCount}
                        >
                          {inviteApplyLoading ? 'Applying...' : 'Apply reconciliation'}
                        </button>
                      </div>
                      {inviteApplyResult ? (
                        <div className="mt-3 rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] p-3 text-sm text-[#236340]">
                          Applied {inviteAppliedActionCount} reconciliation update{inviteAppliedActionCount === 1 ? '' : 's'} and refreshed invite health.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">Run diagnostics to preview reconciliation work.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Assignment diagnostics</h2>
              <p className="mt-2 text-sm text-[#60758d]">
                Track assignment events, ownership pressure, and the most recent ownership changes from the universal assignment engine.
              </p>
            </div>
            <button type="button" className="header-secondary-cta" onClick={loadAssignmentDiagnostics} disabled={assignmentLoading}>
              {assignmentLoading ? 'Checking assignments...' : 'Run assignment diagnostics'}
            </button>
          </div>

          {assignmentDiagnostics ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Events" value={assignmentDiagnostics.totals?.totalEvents || 0} />
                <StatCard label="Assigned" value={assignmentDiagnostics.totals?.assignedToUser || 0} tone="success" />
                <StatCard label="Queue" value={assignmentDiagnostics.totals?.assignedToQueue || 0} tone="warning" />
                <StatCard label="Fallbacks" value={assignmentDiagnostics.totals?.fallbacks || 0} tone={assignmentDiagnostics.totals?.fallbacks ? 'warning' : 'success'} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Event types</h3>
                  {Object.keys(assignmentDiagnostics.totals?.byType || {}).length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {Object.entries(assignmentDiagnostics.totals.byType).map(([type, count]) => (
                        <li key={type} className="flex items-center justify-between gap-3">
                          <span>{String(type).replace(/_/g, ' ')}</span>
                          <span className="font-semibold text-[#31485e]">{count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No assignment events yet.</p>
                  )}
                </div>
                <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Recent events</h3>
                  {assignmentDiagnostics.recentEvents?.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#60758d]">
                      {assignmentDiagnostics.recentEvents.map((event) => (
                        <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f6] py-2 last:border-0">
                          <span>{event.payload?.itemType || 'assignment'} · {event.payload?.itemId || event.id}</span>
                          <span className="font-semibold text-[#31485e]">{event.type}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#60758d]">No recent assignment events recorded.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {demoSummary ? (
          <div className="grid gap-4 rounded-[14px] border border-[#dde4ee] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Demo and staging tools</h2>
                <p className="mt-2 text-sm text-[#60758d]">{demoSummary.demoToolsReason}</p>
                {demoSummary.lastResetResult ? <p className="mt-2 text-sm font-semibold text-[#31485e]">Last reset: {demoSummary.lastResetResult.status}</p> : null}
              </div>
              <button type="button" className="header-secondary-cta" onClick={runDemoDryRunReset} disabled={demoLoading}>
                {demoLoading ? 'Dry-running reset...' : 'Dry-run demo reset'}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard label="Environment" value={demoSummary.environment || 'unknown'} />
              <StatCard label="Demo accounts" value={demoSummary.accounts?.length || 0} />
              <StatCard label="Seed manifests" value={demoSummary.manifests?.length || 0} />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Check type
            <select
              className="auth-input"
              value={entityType}
              onChange={(event) => {
                const nextType = event.target.value
                setEntityType(nextType)
                if (nextType === 'user') setEntityId(authState.user?.id || '')
                else if (nextType === 'workspace') setEntityId(currentWorkspace?.id || '')
                else if (nextType === 'system') setEntityId('')
              }}
            >
              <option value="user">User</option>
              <option value="workspace">Workspace</option>
              <option value="transaction">Transaction</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Entity id
            <input className="auth-input" value={entityId} disabled={entityType === 'system'} onChange={(event) => setEntityId(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="button" className="header-primary-cta w-full" onClick={runSelectedCheck} disabled={loading}>
              {loading ? 'Checking...' : 'Run check'}
            </button>
          </div>
        </div>

        {error ? <p className="rounded-[12px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f1c1c]">{error}</p> : null}

        {result ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard label="Status" value={summary.status || 'unknown'} tone={summary.status === 'valid' || result.status === 'valid' ? 'success' : summary.status === 'invalid' ? 'critical' : 'warning'} />
              <StatCard label="Issues" value={summary.issueCount ?? result.issueCount ?? issues.length} />
              <StatCard label="Critical" value={summary.criticalCount ?? result.criticalCount ?? 0} tone={(summary.criticalCount || result.criticalCount) ? 'critical' : 'success'} />
              <StatCard label="Repairs" value={result.repairActions?.length || result.repair?.actions?.length || 0} tone="warning" />
            </div>
            <IssueList issues={issues} />
          </>
        ) : (
          <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-white px-4 py-8 text-center text-sm text-[#60758d]">
            Run a diagnostic check to see validation results and repair recommendations.
          </p>
        )}
      </article>
    </section>
  )
}
