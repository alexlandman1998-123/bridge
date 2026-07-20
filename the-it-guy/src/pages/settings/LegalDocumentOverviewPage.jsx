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
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import LegalDocumentBuildingBlockCard from '../../components/legal-documents/LegalDocumentBuildingBlockCard'
import { getLegalDocumentDefinition } from '../../core/documents/legalDocumentCatalog'
import {
  buildLegalDocumentEditorPath,
  buildLegalDocumentPreviewPath,
  buildLegalDocumentsLandingPath,
} from '../../core/documents/legalDocumentRoutes'
import { resolveLegalDocumentOrganisationId } from '../../core/documents/legalDocumentWorkspace'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useLegalDocumentLibrary } from '../../hooks/useLegalDocumentLibrary'
import {
  activateConditionalMasterMigration,
  finalizeConditionalMasterMigration,
  prepareConditionalMasterMigration,
  rollbackConditionalMasterMigration,
  verifyConditionalMasterMigration,
} from '../../lib/documentPacketsApi'

const STATUS_PRESENTATION = Object.freeze({
  live: { label: 'Live and ready', Icon: CheckCircle2, classes: 'border-[#ccead8] bg-[#eefaf2] text-[#187442]' },
  draft: { label: 'Draft to review', Icon: FilePenLine, classes: 'border-[#f2d7a5] bg-[#fff8e9] text-[#98600b]' },
  missing: { label: 'Set up required', Icon: CircleAlert, classes: 'border-[#dce5ef] bg-[#f6f8fb] text-[#607387]' },
})

const MIGRATION_PRESENTATION = Object.freeze({
  blocked: { label: 'Migration blocked', detail: 'The global conditional master is not available.' },
  needs_draft: { label: 'Migration not started', detail: 'Prepare an organisation-owned draft before changing the live document.' },
  draft_blocked: { label: 'Draft needs review', detail: 'Resolve coverage or legacy-wording conflicts before activation.' },
  ready_to_activate: { label: 'Ready for controlled activation', detail: 'Coverage is complete. Activation will open a 14-day rollback window.' },
  rollback_window: { label: 'Rollback window open', detail: 'Legacy templates remain live and recoverable during the observation window.' },
  ready_to_archive: { label: 'Legacy archival available', detail: 'The rollback window has closed; archival remains a separate explicit action.' },
  rolled_back: { label: 'Migration rolled back', detail: 'The previous default has been restored and no legacy wording was deleted.' },
  complete: { label: 'Migration complete', detail: 'The conditional master is live and legacy variants are archived as immutable history.' },
})

const ASSEMBLY_STEPS = Object.freeze([
  { key: 'standard', label: 'Standard wording', Icon: FileText },
  { key: 'answers', label: 'Onboarding answers', Icon: UserRound },
  { key: 'situations', label: 'Conditional sections', Icon: Puzzle },
  { key: 'ready', label: 'Ready-to-sign document', Icon: FileCheck2 },
])

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
  const { currentWorkspace, organisationMembership } = useWorkspace()
  const organisationId = resolveLegalDocumentOrganisationId(currentWorkspace, organisationMembership)
  const { documentsByKey, migrationsByType, loading, error, refresh } = useLegalDocumentLibrary({ organisationId: organisationId || null })
  const [migrationAction, setMigrationAction] = useState('')
  const [migrationMessage, setMigrationMessage] = useState('')
  const [migrationError, setMigrationError] = useState('')
  const document = definition ? documentsByKey[definition.key] : null

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const primaryTemplateId = document?.primaryTemplateId || ''
  const fullEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key), primaryTemplateId)
  const previewPath = buildLegalDocumentPreviewPath(definition.key)
  const standardEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'standard'), primaryTemplateId)
  const situationsEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'situations'), primaryTemplateId)
  const signingEditorPath = withTemplate(buildLegalDocumentEditorPath(definition.key, 'signing'), primaryTemplateId)
  const status = STATUS_PRESENTATION[document?.status] || STATUS_PRESENTATION.missing
  const StatusIcon = status.Icon
  const standardItems = (document?.standardSections || []).map((section) => ({ key: section.key, label: section.title }))
  const situationItems = (document?.situationSections || []).map((section) => ({ key: section.key, label: section.ruleLabel || section.title }))
  const signingItems = (document?.signingRoles || []).map((role) => ({ key: role, label: formatRole(role) }))
  const coverageReady = Boolean(document?.coverageReady)
  const hasUnpublishedChanges = document?.status === 'draft'
  const migration = document?.migrationReadiness || null
  const migrationPresentation = MIGRATION_PRESENTATION[migration?.state] || null
  const migrationRecord = migrationsByType?.[definition.packetType] || null
  const verification = document?.verificationReadiness || null

  async function runMigrationAction(action, operation) {
    try {
      setMigrationAction(action)
      setMigrationError('')
      setMigrationMessage('')
      await operation()
      await refresh()
      setMigrationMessage(action === 'prepare'
        ? 'Migration draft prepared. Review its wording and scenario coverage before activation.'
        : action === 'activate'
          ? 'Conditional master activated. The 14-day rollback window is now open.'
          : action === 'rollback'
            ? 'The previous default was restored. Existing documents were not changed.'
            : action === 'verify'
              ? 'Verification completed and a durable evidence receipt was recorded.'
            : 'Legacy variants were archived after the rollback window closed.')
    } catch (actionError) {
      await refresh()
      setMigrationError(actionError?.message || 'Unable to update the legal-document migration.')
    } finally {
      setMigrationAction('')
    }
  }

  function handlePrepareMigration() {
    void runMigrationAction('prepare', () => prepareConditionalMasterMigration({
      packetType: definition.packetType,
      organisationId,
    }))
  }

  function handleActivateMigration() {
    const confirmed = window.confirm('Activate this conditional master and begin the 14-day rollback window? Confirm that you reviewed the reconciled wording and scenario preview.')
    if (!confirmed) return
    void runMigrationAction('activate', () => activateConditionalMasterMigration({
      migrationId: migrationRecord?.id,
      candidateTemplateId: migration?.candidate?.id,
      wordingReviewed: true,
    }))
  }

  function handleRollbackMigration() {
    const confirmed = window.confirm('Restore the previous default template? Existing generated documents will remain unchanged.')
    if (!confirmed) return
    void runMigrationAction('rollback', () => rollbackConditionalMasterMigration(migrationRecord?.id))
  }

  function handleFinalizeMigration() {
    const confirmed = window.confirm('Archive the recorded legacy variants now that the rollback window has closed? Their immutable history will remain available.')
    if (!confirmed) return
    void runMigrationAction('finalize', () => finalizeConditionalMasterMigration(migrationRecord?.id))
  }

  function handleVerifyMigration() {
    void runMigrationAction('verify', () => verifyConditionalMasterMigration({
      migrationId: migrationRecord?.id,
      candidateTemplateId: migration?.candidate?.id,
    }))
  }

  return (
    <div className="w-full max-w-none space-y-6 pb-10" aria-labelledby="document-overview-title">
      <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#6b7d91]" aria-label="Breadcrumb">
        <Link to={buildLegalDocumentsLandingPath()} className="transition hover:text-[#0f7f4f]">Legal Documents</Link>
        <span className="text-[#b0bdc9]" aria-hidden="true">/</span>
        <span aria-current="page" className="text-[#45596f]">{definition.label}</span>
      </nav>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h1 id="document-overview-title" className="text-3xl font-semibold tracking-[-0.03em] text-[#101c2d] sm:text-[2.15rem]">{definition.label}</h1>
          <p className="mt-2 text-[15px] leading-7 text-[#62758a]">
            Bridge automatically builds the correct {definition.shortLabel || definition.label} from your standard wording and conditional sections.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {document?.status !== 'missing' ? (
            <Link to={previewPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#d6e1ea] bg-white px-4 text-sm font-semibold text-[#33475c] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:border-[#aac8b8] hover:bg-[#f8fcfa]">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview a situation
            </Link>
          ) : null}
          <Link to={fullEditorPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#0f7f4f] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.2)] transition hover:bg-[#0d7045]">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {document?.status === 'missing' ? 'Set up wording' : 'Edit wording'}
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

      {!loading && migrationPresentation ? (
        <section className="rounded-[18px] border border-[#d9e4ed] bg-[#f8fafc] p-5" aria-labelledby="conditional-master-migration-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
            <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${migration?.state === 'complete' ? 'bg-[#e7f7ed] text-[#187442]' : 'bg-[#fff4d8] text-[#8a650f]'}`}>
              {migration?.state === 'complete' ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div>
              <h2 id="conditional-master-migration-heading" className="text-sm font-semibold text-[#273a4f]">{migrationPresentation.label}</h2>
              <p className="mt-1 text-sm leading-6 text-[#687b90]">{migrationPresentation.detail}</p>
              {migration?.rollbackUntil && migration?.state === 'rollback_window' ? (
                <p className="mt-1 text-xs font-semibold text-[#7b5b13]">Rollback available until {formatDate(migration.rollbackUntil)}</p>
              ) : null}
            </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {migration?.canPrepare ? <button type="button" disabled={Boolean(migrationAction)} onClick={handlePrepareMigration} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white disabled:opacity-50">Prepare migration draft</button> : null}
              {migration?.candidate && !['complete', 'rollback_window', 'ready_to_archive', 'rolled_back'].includes(migration?.state) ? (
                <Link to={fullEditorPath} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#c7d6e2] bg-white px-4 text-sm font-semibold text-[#40566d] transition hover:border-[#98b8a7] hover:text-[#176f46]">Review draft<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              ) : null}
              {migrationRecord?.state === 'prepared' && migration?.coverage?.ready ? <button type="button" disabled={Boolean(migrationAction)} onClick={handleActivateMigration} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#0f7f4f] bg-white px-4 text-sm font-semibold text-[#167347] disabled:opacity-50">Review and activate</button> : null}
              {migration?.canRollback && migrationRecord?.id ? <button type="button" disabled={Boolean(migrationAction)} onClick={handleRollbackMigration} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#d8b976] bg-white px-4 text-sm font-semibold text-[#7a5710] disabled:opacity-50">Roll back</button> : null}
              {migration?.canFinalize && migrationRecord?.id ? <button type="button" disabled={Boolean(migrationAction)} onClick={handleFinalizeMigration} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#d5dee7] bg-white px-4 text-sm font-semibold text-[#4d6074] disabled:opacity-50">Archive legacy variants</button> : null}
            </div>
          </div>
          {migrationMessage ? <p className="mt-4 text-sm font-medium text-[#187442]" role="status">{migrationMessage}</p> : null}
          {migrationError ? <p className="mt-4 text-sm font-medium text-[#a0442f]" role="alert">{migrationError}</p> : null}
          {['activated', 'completed'].includes(migrationRecord?.state) ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-[#dce5ed] pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Migration verification">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#78899a]">Phase 11 verification</p>
                <p className={`mt-1 text-sm font-semibold ${verification?.state === 'verified' ? 'text-[#187442]' : verification?.state === 'blocked' ? 'text-[#a0442f]' : 'text-[#52667d]'}`}>
                  {verification?.state === 'verified' ? 'Verified with a current receipt' : verification?.state === 'blocked' ? 'Verification blocked' : 'Ready to verify'}
                </p>
                {verification?.issues?.[0]?.message ? <p className="mt-1 text-xs text-[#8a5a4d]">{verification.issues[0].message}</p> : null}
              </div>
              {verification?.canVerify ? (
                <button type="button" disabled={Boolean(migrationAction)} onClick={handleVerifyMigration} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#9dc9af] bg-white px-4 text-sm font-semibold text-[#167347] disabled:opacity-50">Run verification</button>
              ) : null}
            </div>
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
            title="Standard wording"
            description={`Wording included in every ${definition.shortLabel || 'document'}.`}
            countLabel={`${document?.standardSectionCount || 0} sections`}
            items={standardItems}
            emptyLabel="No standard sections have been set up yet."
            actionLabel="Manage standard wording"
            actionTo={standardEditorPath}
            Icon={FileText}
          />
          <LegalDocumentBuildingBlockCard
            title="Conditional sections"
            description="Protected sections Bridge includes automatically when the transaction facts match."
            countLabel={`${document?.situationClauseCount || 0} conditional sections`}
            items={situationItems}
            emptyLabel="No conditional sections have been set up yet."
            actionLabel="Manage conditional sections"
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
    </div>
  )
}
