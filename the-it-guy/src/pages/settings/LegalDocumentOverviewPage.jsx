import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Eye,
  FileCheck2,
  FilePenLine,
  FileText,
  PencilLine,
  Puzzle,
  RefreshCw,
  Rocket,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import LegalDocumentBuildingBlockCard from '../../components/legal-documents/LegalDocumentBuildingBlockCard'
import { getLegalDocumentDefinition } from '../../core/documents/legalDocumentCatalog'
import {
  buildLegalDocumentEditorPath,
  buildLegalDocumentPreviewPath,
  buildLegalDocumentsLandingPath,
} from '../../core/documents/legalDocumentRoutes'
import { resolveLegalDocumentOrganisationId } from '../../core/documents/legalDocumentWorkspace'
import { buildOtpOperationalAssurance } from '../../core/documents/otpOperationalAssurance'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useLegalDocumentLibrary } from '../../hooks/useLegalDocumentLibrary'
import { canManageOrganisationSettings } from '../../lib/organisationAccess'
import { executeLegalClausePackEscalationPlan } from '../../services/documents/legalClausePackEscalationService'
import { getLegalClausePackOperationalDiagnosticsSnapshot } from '../../services/documents/legalClausePackOperationalDiagnosticsService'
import { getLegalClausePackResolutionSnapshot } from '../../services/documents/legalClausePackResolutionService'

const STATUS_PRESENTATION = Object.freeze({
  live: { label: 'Live and ready', Icon: CheckCircle2, classes: 'border-[#ccead8] bg-[#eefaf2] text-[#187442]' },
  draft: { label: 'Draft to review', Icon: FilePenLine, classes: 'border-[#f2d7a5] bg-[#fff8e9] text-[#98600b]' },
  missing: { label: 'Set up required', Icon: CircleAlert, classes: 'border-[#dce5ef] bg-[#f6f8fb] text-[#607387]' },
})

const ASSEMBLY_STEPS = Object.freeze([
  { key: 'standard', label: 'Standard template', Icon: FileText },
  { key: 'answers', label: 'Onboarding answers', Icon: UserRound },
  { key: 'situations', label: 'Matching conditional clauses', Icon: Puzzle },
  { key: 'ready', label: 'Ready-to-sign document', Icon: FileCheck2 },
])

const ROLLOUT_STATUS_LABELS = Object.freeze({
  missing: 'Set up required',
  preparing_candidate: 'Preparing governed candidate',
  ready_for_activation: 'Ready for controlled activation',
  live_legacy: 'Legacy OTP remains live',
  live_blocked: 'Live rollout needs attention',
  live_governed: 'Governed OTP is live',
})

const OPERATIONS_STATUS_PRESENTATION = Object.freeze({
  healthy: { label: 'Healthy · rollback ready', classes: 'border-[#b9e1c8] bg-[#eef9f2] text-[#187442]' },
  degraded: { label: 'Attention required', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]' },
  critical: { label: 'Critical recovery issue', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]' },
  not_governed: { label: 'Available after activation', classes: 'border-[#dce5ee] bg-[#f7f9fb] text-[#64778b]' },
  not_live: { label: 'No live OTP', classes: 'border-[#dce5ee] bg-[#f7f9fb] text-[#64778b]' },
})

const ASSURANCE_STATUS_PRESENTATION = Object.freeze({
  not_run: { label: 'Not assessed', classes: 'border-[#dce5ee] bg-[#f7f9fb] text-[#64778b]' },
  healthy: { label: 'Healthy · release may continue', classes: 'border-[#b9e1c8] bg-[#eef9f2] text-[#187442]' },
  critical: { label: 'Stop signature release', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]' },
  review_required: { label: 'Hold for review', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]' },
  incomplete: { label: 'Audit incomplete', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]' },
  recovery_attention: { label: 'Recovery route needs attention', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]' },
  no_evidence: { label: 'Awaiting first governed OTP', classes: 'border-[#cbdceb] bg-[#f1f7fc] text-[#45677f]' },
})

const RESOLUTION_STATUS_PRESENTATION = Object.freeze({
  pass: { label: 'Follow-up resolved', classes: 'border-[#b9e1c8] bg-[#eef9f2] text-[#187442]' },
  warning: { label: 'Follow-up still open', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]' },
  fail: { label: 'Missing or overdue', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]' },
  incomplete: { label: 'Resolution check incomplete', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]' },
})

function withTemplate(path, templateId) {
  return templateId ? `${path}?template=${encodeURIComponent(templateId)}` : path
}

function formatDate(value) {
  if (!value) return 'Not published yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Publication date unavailable'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatRole(value = '') {
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function LegalDocumentOverviewPage() {
  const { documentKey = '' } = useParams()
  const definition = getLegalDocumentDefinition(documentKey)
  const { authState } = useAuthSession()
  const { role, currentMembership, currentWorkspace, workspaceType } = useWorkspace()
  const organisationId = resolveLegalDocumentOrganisationId(currentWorkspace, currentMembership)
  const { documentsByKey, loading, error, refresh } = useLegalDocumentLibrary({ organisationId: organisationId || null })
  const document = definition ? documentsByKey[definition.key] : null
  const [otpReleaseDiagnostics, setOtpReleaseDiagnostics] = useState(null)
  const [otpAssuranceLoading, setOtpAssuranceLoading] = useState(false)
  const [otpAssuranceError, setOtpAssuranceError] = useState('')
  const [otpEscalationPlan, setOtpEscalationPlan] = useState(null)
  const [otpEscalationPlanning, setOtpEscalationPlanning] = useState(false)
  const [otpEscalationApplying, setOtpEscalationApplying] = useState(false)
  const [showOtpEscalationConfirm, setShowOtpEscalationConfirm] = useState(false)
  const [otpResolutionReport, setOtpResolutionReport] = useState(null)
  const [otpResolutionLoading, setOtpResolutionLoading] = useState(false)
  const activeOtpReleaseDiagnostics = otpReleaseDiagnostics?.organisationId === organisationId
    ? otpReleaseDiagnostics
    : null
  const activeOtpEscalationPlan = otpEscalationPlan?.organisationId === organisationId
    ? otpEscalationPlan
    : null
  const activeOtpResolutionReport = otpResolutionReport?.organisationId === organisationId
    ? otpResolutionReport
    : null

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const primaryTemplateId = document?.primaryTemplateId || ''
  const previewPath = buildLegalDocumentPreviewPath(definition.key)
  const standardEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'standard'), primaryTemplateId)
  const situationsEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'situations'), primaryTemplateId)
  const signingEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'signing'), primaryTemplateId)
  const rolloutEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'standard'), document?.rolloutCandidateTemplateId || primaryTemplateId)
  const operationsEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'standard'), document?.liveTemplateId || primaryTemplateId)
  const status = STATUS_PRESENTATION[document?.status] || STATUS_PRESENTATION.missing
  const StatusIcon = status.Icon
  const standardItems = (document?.standardSections || []).map((section) => ({ key: section.key, label: section.title }))
  const situationItems = (document?.situationSections || []).map((section) => ({ key: section.key, label: section.ruleLabel || section.title }))
  const signingItems = (document?.signingRoles || []).map((role) => ({ key: role, label: formatRole(role) }))
  const coverageReady = Boolean(document?.coverageReady)
  const hasUnpublishedChanges = document?.status === 'draft'
  const operationsPresentation = OPERATIONS_STATUS_PRESENTATION[document?.rolloutOperations?.status] || OPERATIONS_STATUS_PRESENTATION.not_governed
  const otpAssurance = buildOtpOperationalAssurance({
    rolloutOperations: document?.rolloutOperations || null,
    releaseDiagnostics: activeOtpReleaseDiagnostics,
  })
  const assurancePresentation = ASSURANCE_STATUS_PRESENTATION[otpAssurance.status] || ASSURANCE_STATUS_PRESENTATION.not_run
  const assuranceRows = (activeOtpReleaseDiagnostics?.records || [])
    .filter((record) => record.severity === 'critical' || record.severity === 'warning')
    .slice(0, 6)
  const canManageOtpFollowUp = canManageOrganisationSettings({
    appRole: role,
    membershipRole: currentMembership?.role || currentMembership?.membershipRole,
    workspaceType: currentWorkspace?.type || workspaceType,
  })

  async function runOtpOperationalAssurance() {
    if (!organisationId || otpAssuranceLoading) return
    try {
      setOtpAssuranceLoading(true)
      setOtpAssuranceError('')
      const report = await getLegalClausePackOperationalDiagnosticsSnapshot({ organisationId, limit: 100 })
      setOtpReleaseDiagnostics(report)
      setOtpEscalationPlan(null)
      setOtpResolutionReport(null)
    } catch (assuranceError) {
      setOtpAssuranceError(assuranceError?.message || 'Unable to run the governed OTP operational audit.')
    } finally {
      setOtpAssuranceLoading(false)
    }
  }

  async function planOtpReviewNotifications() {
    if (!activeOtpReleaseDiagnostics || otpEscalationPlanning || otpEscalationApplying) return
    try {
      setOtpEscalationPlanning(true)
      setOtpAssuranceError('')
      const plan = await executeLegalClausePackEscalationPlan({
        diagnostics: activeOtpReleaseDiagnostics,
        dryRun: true,
      })
      setOtpEscalationPlan({ ...plan, organisationId })
    } catch (planError) {
      setOtpAssuranceError(planError?.message || 'Unable to prepare the OTP review-notification plan.')
    } finally {
      setOtpEscalationPlanning(false)
    }
  }

  async function applyOtpReviewNotifications() {
    if (!activeOtpEscalationPlan?.dryRun || !activeOtpEscalationPlan.canApply || otpEscalationApplying) return
    let latestDiagnostics = null
    try {
      setOtpEscalationApplying(true)
      setOtpAssuranceError('')
      latestDiagnostics = await getLegalClausePackOperationalDiagnosticsSnapshot({ organisationId, limit: 100 })
      const applied = await executeLegalClausePackEscalationPlan({
        diagnostics: latestDiagnostics,
        dryRun: false,
        approvedPlanFingerprint: activeOtpEscalationPlan.planFingerprint,
        approvedActionKeys: activeOtpEscalationPlan.actionKeys,
        actorUserId: authState.user?.id || null,
      })
      setOtpReleaseDiagnostics(latestDiagnostics)
      setOtpEscalationPlan({ ...applied, organisationId })
      setOtpResolutionReport(null)
      setShowOtpEscalationConfirm(false)
    } catch (applyError) {
      if (latestDiagnostics) {
        setOtpReleaseDiagnostics(latestDiagnostics)
        setOtpEscalationPlan(null)
      }
      setShowOtpEscalationConfirm(false)
      setOtpAssuranceError(applyError?.message || 'Unable to apply the OTP review-notification plan.')
    } finally {
      setOtpEscalationApplying(false)
    }
  }

  async function runOtpFollowUpResolution() {
    if (!organisationId || otpResolutionLoading || otpEscalationApplying) return
    try {
      setOtpResolutionLoading(true)
      setOtpAssuranceError('')
      const report = await getLegalClausePackResolutionSnapshot({ organisationId, limit: 100 })
      setOtpResolutionReport(report)
      if (report.diagnostics) setOtpReleaseDiagnostics(report.diagnostics)
      setOtpEscalationPlan(null)
    } catch (resolutionError) {
      setOtpAssuranceError(resolutionError?.message || 'Unable to check OTP review follow-up resolution.')
    } finally {
      setOtpResolutionLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10" aria-labelledby="document-overview-title">
      <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#6b7d91]" aria-label="Breadcrumb">
        <Link to={buildLegalDocumentsLandingPath()} className="transition hover:text-[#0f7f4f]">Legal Documents</Link>
        <span className="text-[#b0bdc9]" aria-hidden="true">/</span>
        <span aria-current="page" className="text-[#45596f]">{definition.label}</span>
      </nav>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h1 id="document-overview-title" className="text-3xl font-semibold tracking-[-0.03em] text-[#101c2d] sm:text-[2.15rem]">{definition.label}</h1>
          <p className="mt-2 text-[15px] leading-7 text-[#62758a]">
            Start with one standard template. Bridge then adds the relevant conditional clauses from the onboarding answers.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {document?.status !== 'missing' ? (
            <Link to={previewPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#d6e1ea] bg-white px-4 text-sm font-semibold text-[#33475c] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:border-[#aac8b8] hover:bg-[#f8fcfa]">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview a situation
            </Link>
          ) : null}
          <Link to={standardEditorPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#0f7f4f] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.2)] transition hover:bg-[#0d7045]">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {document?.status === 'missing' ? 'Set up template' : 'Edit standard template'}
          </Link>
        </div>
      </header>

      {error ? (
        <section className="flex flex-col gap-3 rounded-[16px] border border-[#f0cfaa] bg-[#fff8ed] px-5 py-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div>
            <h2 className="text-sm font-semibold text-[#8b5209]">We could not load this document</h2>
            <p className="mt-1 text-sm text-[#9b6a2d]">{error}</p>
          </div>
          <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#e1b875] bg-white px-4 text-sm font-semibold text-[#80500d]" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-[18px] border border-[#dde6ee] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:grid-cols-3 sm:items-center" aria-label="Document status">
        <div className="flex items-center">
          {loading ? <span className="text-sm text-[#7b8da2]">Checking status…</span> : (
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${status.classes}`}>
              <StatusIcon className="h-4 w-4" aria-hidden="true" />
              {status.label}
            </span>
          )}
        </div>
        <div className="text-sm text-[#687b90] sm:text-center">
          <span className="font-semibold text-[#4c6077]">Version {document?.versionLabel || '—'}</span>
          <span className="mx-2 text-[#bdc8d2]" aria-hidden="true">•</span>
          <span>{formatDate(document?.publishedAt)}</span>
        </div>
        <div className={`flex items-center gap-2 text-sm font-semibold sm:justify-end ${coverageReady ? 'text-[#2a7b50]' : 'text-[#8a650f]'}`}>
          {coverageReady ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
          {coverageReady ? 'Legal coverage ready' : 'Coverage needs review'}
        </div>
      </section>

      {!loading && document?.attorneyReadiness ? (
        <section className="rounded-[18px] border border-[#dde6ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6" aria-labelledby="attorney-readiness-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c8ea2]">Attorney readiness</span>
              <h2 id="attorney-readiness-heading" className="mt-2 text-lg font-semibold text-[#142033]">
                {document.attorneyReadiness.canSubmitForAttorneyReview ? 'Wording assembled for legal review' : 'Document structure is incomplete'}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687b90]">
                This separates wording coverage from legal approval. Bridge cannot treat pending starter wording as attorney-approved.
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${document.attorneyReadiness.canPublish ? 'border-[#ccead8] bg-[#eefaf2] text-[#187442]' : 'border-[#efd9ad] bg-[#fff9ec] text-[#8c6419]'}`}>
              {document.attorneyReadiness.canPublish ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
              {document.attorneyReadiness.canPublish ? 'Approved for publication' : `${document.attorneyReadiness.summary.pendingReviewItems} reviews pending`}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
              <dt className="text-xs font-semibold text-[#718397]">Standard legal core</dt>
              <dd className="mt-1 text-xl font-semibold text-[#24364b]">{document.attorneyReadiness.summary.coreCount}</dd>
            </div>
            <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
              <dt className="text-xs font-semibold text-[#718397]">Conditional wording present</dt>
              <dd className="mt-1 text-xl font-semibold text-[#24364b]">{document.attorneyReadiness.summary.clauseWordingCount}/{document.attorneyReadiness.summary.requiredClauseCount}</dd>
            </div>
            <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
              <dt className="text-xs font-semibold text-[#718397]">Attorney approvals</dt>
              <dd className="mt-1 text-xl font-semibold text-[#24364b]">{document.attorneyReadiness.summary.approvedReviewItems}/{document.attorneyReadiness.summary.totalReviewItems}</dd>
            </div>
          </dl>

          {document.attorneyReadiness.blockers.length ? (
            <div className="mt-4 rounded-[13px] border border-[#eed7af] bg-[#fffaf0] px-4 py-3">
              <strong className="text-xs font-semibold text-[#805d1d]">Next items</strong>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#7d6740]">
                {document.attorneyReadiness.blockers.slice(0, 4).map((blocker) => <li key={`${blocker.code}-${blocker.key}`}>• {blocker.message}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && document?.launchReadiness ? (
        <section className="rounded-[18px] border border-[#dbe5ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6" aria-labelledby="otp-rollout-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#edf8f2] text-[#147748]">
                <Rocket className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c8ea2]">Controlled rollout</span>
                <h2 id="otp-rollout-heading" className="mt-1 text-lg font-semibold text-[#142033]">
                  {ROLLOUT_STATUS_LABELS[document.launchReadiness.status] || 'Rollout readiness'}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687b90]">
                  Prepare and certify the candidate while the current live OTP stays unchanged. Activation requires every stage below to pass.
                </p>
              </div>
            </div>
            <Link to={rolloutEditorPath} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#b9dcc7] bg-white px-4 text-sm font-semibold text-[#187348] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5]">
              Review candidate
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {document.launchReadiness.steps.map((step) => (
              <li key={step.key} className={`rounded-[13px] border px-4 py-3 ${step.passed ? 'border-[#d4e9dc] bg-[#f5fbf7]' : 'border-[#ead9b9] bg-[#fffaf1]'}`}>
                <div className="flex items-center gap-2">
                  {step.passed
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#248852]" aria-hidden="true" />
                    : <CircleAlert className="h-4 w-4 shrink-0 text-[#a06a17]" aria-hidden="true" />}
                  <strong className="text-xs font-semibold text-[#304258]">{step.label}</strong>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#697b8e]">{step.detail}</p>
              </li>
            ))}
          </ol>

          {document.rolloutOperations ? (
            <div className="mt-5 rounded-[15px] border border-[#dce6ee] bg-[#f8fafc] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-semibold text-[#304258]">Post-activation safety</strong>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${operationsPresentation.classes}`}>
                        {operationsPresentation.label}
                      </span>
                    </div>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-[#63768a]">
                      {document.rolloutOperations.canRollback
                        ? `${document.rolloutOperations.rollbackTemplateLabel || 'The previous OTP'} is verified and can be restored for new documents without altering existing transactions.`
                        : document.rolloutOperations.status === 'not_governed'
                          ? 'A verified recovery version will appear here after the first governed activation.'
                          : document.rolloutOperations.blockers[0] || 'The recovery route needs an administrator to review it.'}
                    </p>
                  </div>
                  {document.rolloutOperations.canRollback ? (
                    <Link to={operationsEditorPath} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-[#d8b9b5] bg-white px-3 text-xs font-semibold text-[#8f3d35] transition hover:border-[#bd7f78] hover:bg-[#fff7f6]">
                      Open recovery controls
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>

                {document.rolloutOperations.status !== 'not_governed' && document.rolloutOperations.status !== 'not_live' ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="OTP operational safety checks">
                    {document.rolloutOperations.checks.map((item) => (
                      <li key={item.key} className="flex items-start gap-2 rounded-[10px] border border-[#e1e8ee] bg-white px-3 py-2 text-xs leading-5 text-[#627589]">
                        {item.passed
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#248852]" aria-hidden="true" />
                          : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a06a17]" aria-hidden="true" />}
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && definition.key === 'otp' && document?.hasLiveTemplate ? (
        <section className="rounded-[18px] border border-[#dbe5ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6" aria-labelledby="otp-assurance-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f1f7fc] text-[#45677f]">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c8ea2]">Live operational assurance</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${assurancePresentation.classes}`}>
                    {assurancePresentation.label}
                  </span>
                </div>
                <h2 id="otp-assurance-heading" className="mt-1 text-lg font-semibold text-[#142033]">Are generated OTPs being released safely?</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687b90]">
                  Read-only check that each generated OTP came from an exact approved master version, then passed readiness, approval and signing-release checks. It never edits wording, approves a document or triggers rollback.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#b9dcc7] bg-white px-4 text-sm font-semibold text-[#187348] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void runOtpOperationalAssurance()}
                disabled={otpAssuranceLoading || otpEscalationPlanning || otpEscalationApplying || !organisationId}
              >
                <RefreshCw className={`h-4 w-4 ${otpAssuranceLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                {otpAssuranceLoading ? 'Running audit...' : activeOtpReleaseDiagnostics ? 'Run audit again' : 'Run operational audit'}
              </button>
              {canManageOtpFollowUp && activeOtpReleaseDiagnostics ? (
                <button
                  type="button"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#d7c28f] bg-[#fffaf0] px-4 text-sm font-semibold text-[#86601a] transition hover:border-[#bd9c54] hover:bg-[#fff6df] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void planOtpReviewNotifications()}
                  disabled={otpEscalationPlanning || otpEscalationApplying || !otpAssurance.dataComplete}
                >
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                  {otpEscalationPlanning ? 'Preparing follow-up...' : 'Plan review notifications'}
                </button>
              ) : null}
              {canManageOtpFollowUp && activeOtpReleaseDiagnostics ? (
                <button
                  type="button"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#cad9e6] bg-[#f5f9fc] px-4 text-sm font-semibold text-[#48677f] transition hover:border-[#9eb8cb] hover:bg-[#edf5fa] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void runOtpFollowUpResolution()}
                  disabled={otpResolutionLoading || otpAssuranceLoading || otpEscalationPlanning || otpEscalationApplying}
                >
                  <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                  {otpResolutionLoading ? 'Checking follow-up...' : 'Check follow-up status'}
                </button>
              ) : null}
            </div>
          </div>

          {otpAssuranceError ? (
            <p className="mt-4 rounded-[12px] border border-[#ecc7c2] bg-[#fff4f3] px-4 py-3 text-sm text-[#9b3127]" role="alert">{otpAssuranceError}</p>
          ) : null}

          <div className="mt-5 rounded-[15px] border border-[#dce6ee] bg-[#f8fafc] p-4" aria-live="polite">
            <strong className="text-sm font-semibold text-[#304258]">Recommendation</strong>
            <p className="mt-2 text-sm leading-6 text-[#63768a]">{otpAssurance.recommendation}</p>
          </div>

          {activeOtpReleaseDiagnostics ? (
            <>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
                  <dt className="text-xs font-semibold text-[#718397]">Release gate</dt>
                  <dd className="mt-1 text-lg font-semibold capitalize text-[#24364b]">{activeOtpReleaseDiagnostics.gate?.status || 'unknown'}</dd>
                </div>
                <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
                  <dt className="text-xs font-semibold text-[#718397]">Assurance score</dt>
                  <dd className="mt-1 text-lg font-semibold text-[#24364b]">{otpAssurance.summary.score}%</dd>
                </div>
                <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
                  <dt className="text-xs font-semibold text-[#718397]">
                    {otpAssurance.summary.canonicalPackets ? 'Exact master versions' : 'Governed OTPs'}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-[#24364b]">
                    {otpAssurance.summary.canonicalPackets
                      ? `${otpAssurance.summary.canonicalPackets - otpAssurance.summary.invalidCanonicalVersions}/${otpAssurance.summary.canonicalPackets}`
                      : otpAssurance.summary.governedPackets}
                  </dd>
                </div>
                <div className="rounded-[13px] border border-[#e0e8ef] bg-[#f8fafc] px-4 py-3">
                  <dt className="text-xs font-semibold text-[#718397]">Need action</dt>
                  <dd className="mt-1 text-lg font-semibold text-[#24364b]">{otpAssurance.summary.criticalPackets + otpAssurance.summary.warningPackets}</dd>
                </div>
              </dl>

              <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {otpAssurance.steps.map((step) => (
                  <li key={step.key} className={`rounded-[13px] border px-4 py-3 ${step.passed ? 'border-[#d4e9dc] bg-[#f5fbf7]' : 'border-[#ead9b9] bg-[#fffaf1]'}`}>
                    <div className="flex items-center gap-2">
                      {step.passed
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#248852]" aria-hidden="true" />
                        : <CircleAlert className="h-4 w-4 shrink-0 text-[#a06a17]" aria-hidden="true" />}
                      <strong className="text-xs font-semibold text-[#304258]">{step.label}</strong>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#697b8e]">{step.detail}</p>
                  </li>
                ))}
              </ol>

              {assuranceRows.length ? (
                <div className="mt-5 overflow-hidden rounded-[13px] border border-[#e0e8ef]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
                        <tr>
                          <th className="px-4 py-3">Severity</th>
                          <th className="px-4 py-3">OTP</th>
                          <th className="px-4 py-3">State</th>
                          <th className="px-4 py-3">Next action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf1f6] bg-white">
                        {assuranceRows.map((row) => (
                          <tr key={`${row.packetId}-${row.versionId || 'no-version'}`}>
                            <td className="px-4 py-3 font-semibold capitalize text-[#304258]">{row.severity}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-[#304258]">{row.title}</p>
                              <p className="mt-1 text-xs text-[#718397]">Version {row.versionNumber || '—'}</p>
                              {row.canonicalTemplateVersionId ? (
                                <p className="mt-1 text-[11px] text-[#8796a6]">Master {row.canonicalTemplateVersionId.slice(0, 8)}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 capitalize text-[#52677e]">{String(row.operationalState || '').replaceAll('_', ' ')}</td>
                            <td className="px-4 py-3 text-[#63768a]">{row.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] px-4 py-3 text-sm text-[#236340]">
                  No governed OTP packet currently appears in a critical or warning release state.
                </p>
              )}

              {activeOtpEscalationPlan ? (
                <div className={`mt-5 rounded-[15px] border p-4 ${activeOtpEscalationPlan.dryRun ? 'border-[#ead9b9] bg-[#fffaf1]' : activeOtpEscalationPlan.applySummary?.failed ? 'border-[#ecc7c2] bg-[#fff4f3]' : 'border-[#cfe8d8] bg-[#effaf3]'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c6a48]">Controlled human follow-up</span>
                      <h3 className="mt-1 text-sm font-semibold text-[#304258]">
                        {activeOtpEscalationPlan.dryRun ? 'Review notification plan' : 'Notification plan applied'}
                      </h3>
                      <p className="mt-2 max-w-3xl text-xs leading-5 text-[#63768a]">
                        {activeOtpEscalationPlan.dryRun
                          ? 'No notifications have been created. Review every target and action before confirming.'
                          : `Plan ${activeOtpEscalationPlan.planFingerprint} was re-audited and matched immediately before notification.`}
                      </p>
                    </div>
                    <span className="rounded-full border border-[#d8c9aa] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#725d35]">Plan {activeOtpEscalationPlan.planFingerprint}</span>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ['Actions', activeOtpEscalationPlan.summary?.totalActions || 0],
                      ['Can notify', activeOtpEscalationPlan.summary?.executableActions || 0],
                      ['Cannot route', activeOtpEscalationPlan.summary?.skippedActions || 0],
                      ['Attorney', activeOtpEscalationPlan.summary?.attorneyActions || 0],
                      ['Critical', activeOtpEscalationPlan.summary?.criticalActions || 0],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[11px] border border-[#e4dccb] bg-white px-3 py-2">
                        <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b6f5b]">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold text-[#304258]">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {activeOtpEscalationPlan.actions?.length ? (
                    <ul className="mt-4 divide-y divide-[#e5d8bf] text-sm text-[#60758d]">
                      {activeOtpEscalationPlan.actions.slice(0, 12).map((action) => (
                        <li key={action.actionKey} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_150px_minmax(0,1.5fr)]">
                          <span className="font-semibold text-[#304258]">
                            {action.title}
                            {action.canonicalTemplateVersionId ? (
                              <small className="mt-1 block font-normal text-[#8796a6]">Master {action.canonicalTemplateVersionId.slice(0, 8)}</small>
                            ) : null}
                          </span>
                          <span className="capitalize">{action.targetRoles.join(', ')}</span>
                          <span>{action.executable ? action.message : action.skipReason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-[11px] border border-[#cfe8d8] bg-white px-3 py-2 text-sm text-[#236340]">No review notifications are required for the current audit.</p>
                  )}

                  {!activeOtpEscalationPlan.dryRun ? (
                    <p className="mt-4 text-sm font-semibold text-[#47634f]">
                      {activeOtpEscalationPlan.applySummary?.notified || 0} action{activeOtpEscalationPlan.applySummary?.notified === 1 ? '' : 's'} notified · {activeOtpEscalationPlan.applySummary?.noActiveRecipients || 0} without active recipients · {activeOtpEscalationPlan.applySummary?.failed || 0} failed
                    </p>
                  ) : activeOtpEscalationPlan.canApply ? (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#9b7020] bg-[#9b7020] px-4 text-sm font-semibold text-white transition hover:bg-[#815b17]"
                        onClick={() => setShowOtpEscalationConfirm(true)}
                      >
                        <UsersRound className="h-4 w-4" aria-hidden="true" />
                        Review and notify
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeOtpResolutionReport ? (
                <div className="mt-5 rounded-[15px] border border-[#dce6ee] bg-[#f8fafc] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#6e8193]">Closed-loop resolution</span>
                      <h3 className="mt-1 text-sm font-semibold text-[#304258]">Did the underlying OTP findings get resolved?</h3>
                      <p className="mt-2 max-w-3xl text-xs leading-5 text-[#63768a]">Reading a notification is acknowledgement only. A finding is resolved only when it disappears from a freshly generated Phase 8 audit.</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${(RESOLUTION_STATUS_PRESENTATION[activeOtpResolutionReport.gate?.status] || RESOLUTION_STATUS_PRESENTATION.incomplete).classes}`}>
                      {(RESOLUTION_STATUS_PRESENTATION[activeOtpResolutionReport.gate?.status] || RESOLUTION_STATUS_PRESENTATION.incomplete).label}
                    </span>
                  </div>

                  <p className="mt-4 rounded-[11px] border border-[#dce6ee] bg-white px-3 py-2 text-sm leading-6 text-[#52677e]">{activeOtpResolutionReport.gate?.reason}</p>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ['Active findings', activeOtpResolutionReport.summary?.activeFindings || 0],
                      ['Missing outreach', activeOtpResolutionReport.summary?.missingNotifications || 0],
                      ['Overdue unread', activeOtpResolutionReport.summary?.overdue || 0],
                      ['Read, unresolved', activeOtpResolutionReport.summary?.acknowledgedUnresolved || 0],
                      ['Resolved', activeOtpResolutionReport.summary?.resolvedAfterNotification || 0],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[11px] border border-[#e0e8ef] bg-white px-3 py-2">
                        <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#718397]">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold text-[#304258]">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {activeOtpResolutionReport.current?.length ? (
                    <ul className="mt-4 divide-y divide-[#dfe7ed] text-sm">
                      {activeOtpResolutionReport.current.slice(0, 12).map((item) => (
                        <li key={item.actionKey} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_190px_minmax(0,1.5fr)]">
                          <span className="font-semibold text-[#304258]">
                            {item.title}
                            {item.canonicalTemplateVersionId ? (
                              <small className="mt-1 block font-normal text-[#8796a6]">Master {item.canonicalTemplateVersionId.slice(0, 8)}</small>
                            ) : null}
                          </span>
                          <span className="capitalize text-[#52677e]">{String(item.resolutionState || '').replaceAll('_', ' ')}</span>
                          <span className="text-[#63768a]">{item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-[11px] border border-[#cfe8d8] bg-white px-3 py-2 text-sm text-[#236340]">No active governed OTP review finding remains.</p>
                  )}

                  {activeOtpResolutionReport.resolved?.length ? (
                    <details className="mt-4 rounded-[11px] border border-[#cfe8d8] bg-white px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold text-[#236340]">Show {activeOtpResolutionReport.resolved.length} resolved follow-up item{activeOtpResolutionReport.resolved.length === 1 ? '' : 's'}</summary>
                      <ul className="mt-3 space-y-2 text-xs leading-5 text-[#63768a]">
                        {activeOtpResolutionReport.resolved.slice(0, 12).map((item) => (
                          <li key={item.actionId}>
                            Packet {item.packetId || 'unknown'}
                            {item.canonicalTemplateVersionId ? ` · Master ${item.canonicalTemplateVersionId.slice(0, 8)}` : ''}
                            {' · '}{item.detail}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-label={`Loading ${definition.label}`}>
          {[0, 1, 2].map((item) => <div key={item} className="h-[320px] animate-pulse rounded-[18px] border border-[#e2e9f0] bg-white" />)}
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3" aria-label={`${definition.label} building blocks`}>
          <LegalDocumentBuildingBlockCard
            title="Standard template"
            description={`Core wording included in every ${definition.shortLabel || 'document'}.`}
            countLabel={`${document?.standardSectionCount || 0} sections`}
            items={standardItems}
            emptyLabel="No standard template sections have been set up yet."
            actionLabel="Edit standard template"
            actionTo={standardEditorPath}
            Icon={FileText}
          />
          <LegalDocumentBuildingBlockCard
            title="Conditional clauses"
            description="Added automatically when onboarding answers make them relevant."
            countLabel={`${document?.situationClauseCount || 0} conditional clauses`}
            items={situationItems}
            emptyLabel="No conditional clauses have been set up yet."
            actionLabel="Manage conditional clauses"
            actionTo={situationsEditorPath}
            Icon={Puzzle}
            itemDisplay="tags"
          />
          <LegalDocumentBuildingBlockCard
            title="Signing"
            description="Who signs is selected automatically."
            countLabel={`${document?.signerRuleCount || 0} signer rules`}
            items={signingItems}
            emptyLabel="No signing roles have been set up yet."
            actionLabel="Manage signing"
            actionTo={signingEditorPath}
            Icon={UsersRound}
          />
        </section>
      )}

      {!loading ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.8fr)]">
          <article className="rounded-[18px] border border-[#dde6ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6" aria-labelledby="assembly-heading">
            <h2 id="assembly-heading" className="text-lg font-semibold tracking-[-0.01em] text-[#142033]">How this {definition.shortLabel || 'document'} is assembled</h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ASSEMBLY_STEPS.map((step, index) => {
                const StepIcon = step.Icon
                const label = step.key === 'ready' ? `Ready-to-sign ${definition.shortLabel || 'document'}` : step.label
                return (
                  <li key={step.key} className="relative flex flex-col items-center text-center lg:pr-4">
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#bfe0cc] bg-[#f0faf4] text-[#147748]">
                      <StepIcon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <strong className="mt-3 text-xs font-semibold leading-5 text-[#304258]">{label}</strong>
                    {index < ASSEMBLY_STEPS.length - 1 ? <ArrowRight className="absolute -right-2 top-5 hidden h-5 w-5 text-[#b4c2cf] lg:block" aria-hidden="true" /> : null}
                  </li>
                )
              })}
            </ol>
          </article>

          <article className="flex min-h-[210px] flex-col rounded-[18px] border border-[#dde6ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6" aria-labelledby="draft-changes-heading">
            <h2 id="draft-changes-heading" className="text-lg font-semibold tracking-[-0.01em] text-[#142033]">Draft changes</h2>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className={`inline-flex h-14 w-14 items-center justify-center rounded-full border ${hasUnpublishedChanges ? 'border-[#ead5a4] bg-[#fff9ea] text-[#99670c]' : 'border-[#add6bd] bg-[#f3fbf6] text-[#16804d]'}`}>
                {hasUnpublishedChanges ? <FilePenLine className="h-6 w-6" aria-hidden="true" /> : <CheckCircle2 className="h-7 w-7" aria-hidden="true" />}
              </span>
              <p className="mt-4 text-sm font-medium text-[#66798e]">{hasUnpublishedChanges ? 'Unpublished changes need review' : 'No unpublished changes'}</p>
            </div>
          </article>
        </section>
      ) : null}

      {!loading && document?.status !== 'missing' ? (
        <section className="flex flex-col gap-4 rounded-[18px] border border-[#dde6ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="test-result-heading">
          <div>
            <h2 id="test-result-heading" className="text-lg font-semibold tracking-[-0.01em] text-[#142033]">Test the result</h2>
            <p className="mt-1 text-sm leading-6 text-[#6b7e92]">Choose a buyer, seller, property and finance situation to see the exact document Bridge will create.</p>
          </div>
          <Link to={previewPath} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-[#b9dcc7] bg-white px-5 text-sm font-semibold text-[#187348] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5]">
            Open scenario preview
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {showOtpEscalationConfirm && activeOtpEscalationPlan?.dryRun ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(16,32,51,0.28)] px-4 py-8">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#ead9b9] bg-white p-6 shadow-[0_28px_60px_rgba(15,23,42,0.24)]" role="dialog" aria-modal="true" aria-labelledby="otp-followup-confirm-title">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8b641b]">Human follow-up only</p>
            <h2 id="otp-followup-confirm-title" className="mt-3 text-xl font-semibold text-[#102033]">Notify the assigned reviewers?</h2>
            <p className="mt-3 text-sm leading-7 text-[#6b7c93]">
              Arch9 will re-run the audit first. If any packet, generated version, master-version evidence, state or routing action changed, nothing will be sent and a new plan will be required.
            </p>
            <div className="mt-5 rounded-[15px] border border-[#ead9b9] bg-[#fffaf1] p-4 text-sm leading-6 text-[#6f5b35]">
              <strong className="text-[#4d4028]">{activeOtpEscalationPlan.summary?.executableActions || 0} notification action{activeOtpEscalationPlan.summary?.executableActions === 1 ? '' : 's'}</strong>
              {' '}will target assigned agency and/or attorney roles. Duplicate unread notifications for the same packet, version and state are suppressed.
            </div>
            <p className="mt-4 text-sm font-semibold text-[#9b3127]">This does not approve an OTP, clear legal review, lock wording, create signing links or perform rollback.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#50657b]" onClick={() => setShowOtpEscalationConfirm(false)} disabled={otpEscalationApplying}>
                Cancel
              </button>
              <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#9b7020] bg-[#9b7020] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void applyOtpReviewNotifications()} disabled={otpEscalationApplying}>
                <UsersRound className="h-4 w-4" aria-hidden="true" />
                {otpEscalationApplying ? 'Re-auditing and notifying...' : 'Confirm notifications'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
