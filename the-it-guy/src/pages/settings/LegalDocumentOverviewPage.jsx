import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  FileText,
  Eye,
  Layers3,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
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

const STATUS_PRESENTATION = Object.freeze({
  live: { label: 'Live', Icon: CheckCircle2, classes: 'border-[#ccead8] bg-[#eefaf2] text-[#187442]' },
  draft: { label: 'Draft', Icon: FilePenLine, classes: 'border-[#f2d7a5] bg-[#fff8e9] text-[#98600b]' },
  missing: { label: 'Set up required', Icon: CircleAlert, classes: 'border-[#dce5ef] bg-[#f6f8fb] text-[#607387]' },
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
  const { currentMembership, currentWorkspace } = useWorkspace()
  const organisationId = resolveLegalDocumentOrganisationId(currentWorkspace, currentMembership)
  const { documentsByKey, loading, error, refresh } = useLegalDocumentLibrary({ organisationId: organisationId || null })
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

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 pb-10" aria-labelledby="document-overview-title">
      <nav aria-label="Breadcrumb">
        <Link to={buildLegalDocumentsLandingPath()} className="inline-flex items-center gap-2 text-sm font-semibold text-[#607387] transition hover:text-[#0f7f4f]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Legal documents
        </Link>
      </nav>

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

      <header className="rounded-[22px] border border-[#dce6ee] bg-white px-6 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:px-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#7b8da2]">Document overview</span>
              {!loading ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.classes}`}>
                  <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {status.label}
                </span>
              ) : null}
            </div>
            <h1 id="document-overview-title" className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#101c2d]">{definition.label}</h1>
            <p className="mt-3 text-[15px] leading-7 text-[#62758a]">{definition.description}</p>
            <p className="mt-3 inline-flex items-start gap-2 rounded-[11px] bg-[#f4f8fb] px-3 py-2 text-sm leading-6 text-[#52677d]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#16804d]" aria-hidden="true" />
              Bridge assembles these pieces automatically from onboarding answers. Your team never chooses legal clauses during a transaction.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {document?.status !== 'missing' ? (
              <Link to={previewPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#d8e2eb] bg-white px-4 text-sm font-semibold text-[#34485e] transition hover:border-[#b8c8d7] hover:bg-[#f8fafc]">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Test scenarios
              </Link>
            ) : null}
            <Link to={fullEditorPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#0f7f4f] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.2)] transition hover:bg-[#0d7045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7f4f]">
              {document?.status === 'missing' ? 'Set up document' : 'Edit document'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-label={`Loading ${definition.label}`}>
          {[0, 1, 2].map((item) => <div key={item} className="h-[360px] animate-pulse rounded-[18px] border border-[#e2e9f0] bg-white" />)}
        </div>
      ) : (
        <section aria-labelledby="building-blocks-heading">
          <div className="mb-4">
            <h2 id="building-blocks-heading" className="text-xl font-semibold tracking-[-0.02em] text-[#142033]">What this document is made from</h2>
            <p className="mt-1 text-sm leading-6 text-[#6c7e91]">Open only the part you want to change.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <LegalDocumentBuildingBlockCard
              title="Standard wording"
              description="The main sections included in every version of this document."
              countLabel={`${document?.standardSectionCount || 0} sections`}
              items={standardItems}
              emptyLabel="No standard sections have been set up yet."
              actionLabel="Edit standard wording"
              actionTo={standardEditorPath}
              Icon={FileText}
            />
            <LegalDocumentBuildingBlockCard
              title="Situation wording"
              description="Extra wording Bridge includes only when the people or property require it."
              countLabel={`${document?.situationClauseCount || 0} rules`}
              items={situationItems}
              emptyLabel="No automatic situation wording has been set up yet."
              actionLabel="Edit situation wording"
              actionTo={situationsEditorPath}
              Icon={Layers3}
              tone="blue"
            />
            <LegalDocumentBuildingBlockCard
              title="Signing setup"
              description="Who needs to sign and where their signatures are placed."
              countLabel={`${document?.signerRuleCount || 0} roles`}
              items={signingItems}
              emptyLabel="No signing roles have been set up yet."
              actionLabel="Edit signing setup"
              actionTo={signingEditorPath}
              Icon={UsersRound}
              tone="amber"
            />
          </div>
        </section>
      )}

      {!loading ? (
        <section className="grid gap-4 rounded-[18px] border border-[#dfe7ef] bg-white p-5 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="document-health-heading">
          <div>
            <h2 id="document-health-heading" className="text-sm font-semibold text-[#25374c]">Document health</h2>
            <p className="mt-1 text-xs leading-5 text-[#7a8c9f]">Current saved configuration</p>
          </div>
          <dl>
            <dt className="text-xs font-medium text-[#7b8da0]">Version</dt>
            <dd className="mt-1 text-sm font-semibold text-[#27384d]">{document?.versionLabel || 'Not versioned'}</dd>
          </dl>
          <dl>
            <dt className="text-xs font-medium text-[#7b8da0]">Last published</dt>
            <dd className="mt-1 text-sm font-semibold text-[#27384d]">{formatDate(document?.publishedAt)}</dd>
          </dl>
          <dl>
            <dt className="text-xs font-medium text-[#7b8da0]">Saved versions</dt>
            <dd className="mt-1 text-sm font-semibold text-[#27384d]">{document?.templateCount || 0}</dd>
          </dl>
        </section>
      ) : null}
    </div>
  )
}
