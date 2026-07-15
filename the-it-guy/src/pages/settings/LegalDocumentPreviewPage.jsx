import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Eye,
  FilePenLine,
  FlaskConical,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getLegalDocumentDefinition } from '../../core/documents/legalDocumentCatalog'
import { buildOtpCompositionPlan } from '../../core/documents/otpCompositionModel'
import {
  listLegalDocumentPreviewScenarios,
  resolveLegalDocumentPreviewScenario,
} from '../../core/documents/legalDocumentPreviewScenarios'
import {
  buildLegalDocumentEditorPath,
  buildLegalDocumentOverviewPath,
  buildLegalDocumentsLandingPath,
} from '../../core/documents/legalDocumentRoutes'
import { resolveLegalDocumentOrganisationId } from '../../core/documents/legalDocumentWorkspace'
import { renderPacketPreview } from '../../core/documents/packetService'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useLegalDocumentLibrary } from '../../hooks/useLegalDocumentLibrary'

const EMPTY_PREVIEW = Object.freeze({
  html: '',
  critical: [],
  warnings: [],
  dataRequirements: [],
  sectionManifest: [],
  profile: null,
  composition: null,
  runtimeAssembly: null,
  error: '',
})

function formatPackLabel(value = '') {
  return String(value || '')
    .replace(/_pack$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getIssueText(issue) {
  if (typeof issue === 'string') return issue
  return issue?.message || issue?.label || issue?.placeholderLabel || issue?.placeholderKey || 'Review this item.'
}

export default function LegalDocumentPreviewPage() {
  const { documentKey = '' } = useParams()
  const definition = getLegalDocumentDefinition(documentKey)
  const { currentMembership, currentWorkspace } = useWorkspace()
  const organisationId = resolveLegalDocumentOrganisationId(currentWorkspace, currentMembership)
  const { documentsByKey, loading, error, refresh } = useLegalDocumentLibrary({ organisationId: organisationId || null })
  const document = definition ? documentsByKey[definition.key] : null
  const scenarios = listLegalDocumentPreviewScenarios()
  const [scenarioKey, setScenarioKey] = useState(scenarios[0].key)
  const [preview, setPreview] = useState(EMPTY_PREVIEW)
  const [previewing, setPreviewing] = useState(false)
  const previewRequestIdRef = useRef(0)

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const selectedScenario = scenarios.find((scenario) => scenario.key === scenarioKey) || scenarios[0]
  const overviewPath = buildLegalDocumentOverviewPath(definition.key)
  const editorPath = buildLegalDocumentEditorPath(definition.key)
  const issueCount = preview.critical.length + preview.warnings.length
  const canPreview = Boolean(document?.primaryTemplate) && !loading && !previewing

  const handleScenarioChange = (nextScenarioKey) => {
    previewRequestIdRef.current += 1
    setScenarioKey(nextScenarioKey)
    setPreview(EMPTY_PREVIEW)
    setPreviewing(false)
  }

  const handleGeneratePreview = async () => {
    if (!document?.primaryTemplate || previewing) return
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId
    setPreviewing(true)
    setPreview(EMPTY_PREVIEW)
    try {
      const scenario = resolveLegalDocumentPreviewScenario({
        scenarioKey,
        packetType: definition.packetType,
        organisationId,
      })
      const result = await renderPacketPreview({
        packetType: definition.packetType,
        context: scenario.context,
        title: `${definition.label} · ${scenario.scenario.label} preview`,
        template: document.primaryTemplate,
        validationAction: 'template_preview',
      })
      const composition = definition.packetType === 'otp'
        ? buildOtpCompositionPlan({
            sections: document.primaryTemplate.sections || [],
            input: {
              sourceContext: scenario.context,
              seller: scenario.context.seller,
              buyer: scenario.context.buyer,
              property: scenario.context.property,
              transaction: scenario.context.transaction,
            },
          })
        : null
      if (requestId !== previewRequestIdRef.current) return
      setPreview({
        html: result?.previewHtml || '',
        critical: Array.isArray(result?.critical) ? result.critical : [],
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        dataRequirements: Array.isArray(result?.dataRequirements) ? result.dataRequirements : [],
        sectionManifest: Array.isArray(result?.sectionManifest) ? result.sectionManifest : [],
        profile: result?.legalDocumentScenarioProfile || scenario.profile,
        composition,
        runtimeAssembly: result?.otpRuntimeAssembly || null,
        error: '',
      })
    } catch (previewError) {
      if (requestId !== previewRequestIdRef.current) return
      setPreview({ ...EMPTY_PREVIEW, error: previewError?.message || 'Unable to build this sample preview.' })
    } finally {
      if (requestId === previewRequestIdRef.current) setPreviewing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-5 pb-10" aria-labelledby="legal-preview-title">
      <nav aria-label="Breadcrumb">
        <Link to={overviewPath} className="inline-flex items-center gap-2 text-sm font-semibold text-[#607387] transition hover:text-[#0f7f4f]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {definition.label}
        </Link>
      </nav>

      <header className="rounded-[22px] border border-[#dce6ee] bg-white px-6 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#7b8da2]">Safe scenario preview</span>
            <h1 id="legal-preview-title" className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#101c2d]">Test {definition.label}</h1>
            <p className="mt-3 text-[15px] leading-7 text-[#62758a]">
              Pick a real-world situation and Bridge will assemble the matching wording from this template.
            </p>
          </div>
          <Link to={editorPath} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-[#d9e3ec] bg-white px-4 text-sm font-semibold text-[#31465d] transition hover:border-[#b9c9d8] hover:bg-[#f8fafc]">
            <FilePenLine className="h-4 w-4" aria-hidden="true" />
            Edit wording
          </Link>
        </div>
        <p className="mt-5 inline-flex items-start gap-2 rounded-[11px] bg-[#eff9f3] px-3 py-2 text-sm leading-6 text-[#27714a]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          This uses sample details only. It cannot create, change or send a live legal document.
        </p>
      </header>

      {error ? (
        <section className="flex flex-col gap-3 rounded-[16px] border border-[#f0cfaa] bg-[#fff8ed] px-5 py-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div>
            <h2 className="text-sm font-semibold text-[#8b5209]">We could not load this template</h2>
            <p className="mt-1 text-sm text-[#9b6a2d]">{error}</p>
          </div>
          <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#e1b875] bg-white px-4 text-sm font-semibold text-[#80500d]" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start" aria-labelledby="scenario-heading">
          <section className="rounded-[18px] border border-[#dfe7ef] bg-white p-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-[#0f7f4f]" aria-hidden="true" />
              <h2 id="scenario-heading" className="text-lg font-semibold text-[#142033]">Choose a situation</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#6c7e91]">No legal knowledge needed. Choose what you want to check.</p>
            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Preview situation">
              {scenarios.map((scenario) => {
                const selected = scenario.key === scenarioKey
                return (
                  <button
                    key={scenario.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`w-full rounded-[13px] border px-4 py-3 text-left transition ${selected ? 'border-[#37a66c] bg-[#eff9f3] shadow-[0_5px_14px_rgba(15,127,79,0.08)]' : 'border-[#e0e8f0] bg-white hover:border-[#b9cbd9] hover:bg-[#f9fbfc]'}`}
                    onClick={() => handleScenarioChange(scenario.key)}
                  >
                    <span className={`block text-sm font-semibold ${selected ? 'text-[#166c42]' : 'text-[#27394e]'}`}>{scenario.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#728398]">{scenario.description}</span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              disabled={!canPreview}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.18)] transition hover:bg-[#0d7045] disabled:cursor-not-allowed disabled:bg-[#9bb6a8] disabled:shadow-none"
              onClick={() => void handleGeneratePreview()}
            >
              {previewing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {previewing ? 'Building preview…' : 'Build sample preview'}
            </button>
          </section>

          {preview.profile ? (
            <section className="rounded-[18px] border border-[#dfe7ef] bg-white p-5" aria-labelledby="included-wording-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="included-wording-heading" className="text-sm font-semibold text-[#24364b]">Wording included</h2>
                <span className="rounded-full bg-[#eef8f2] px-2.5 py-1 text-xs font-semibold text-[#1c7446]">{preview.profile.activeClausePacks?.length || 0}</span>
              </div>
              <ul className="mt-3 space-y-2">
                {(preview.profile.activeClausePacks || []).map((pack) => (
                  <li key={pack} className="flex items-start gap-2 text-xs leading-5 text-[#607387]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2b9a5d]" aria-hidden="true" />
                    {formatPackLabel(pack)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.composition ? (
            <section className="rounded-[18px] border border-[#dfe7ef] bg-white p-5" aria-labelledby="composition-decision-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="composition-decision-heading" className="text-sm font-semibold text-[#24364b]">How Bridge decided</h2>
                <span className="rounded-full bg-[#eef8f2] px-2.5 py-1 text-xs font-semibold text-[#1c7446]">{preview.composition.summary.includedCount} included</span>
              </div>

              {preview.runtimeAssembly ? (
                <div className={`mt-3 rounded-[11px] border px-3 py-2.5 text-xs leading-5 ${preview.runtimeAssembly.canAssemble ? 'border-[#cfe7d8] bg-[#f4fbf6] text-[#35694b]' : 'border-[#eed5ad] bg-[#fff9ee] text-[#89611d]'}`}>
                  <strong className="block">
                    {preview.runtimeAssembly.canAssemble ? 'Runtime selection matches' : 'Runtime selection needs attention'}
                  </strong>
                  <span className="mt-1 block">
                    {preview.runtimeAssembly.expectedPackKeys.length} clause pack{preview.runtimeAssembly.expectedPackKeys.length === 1 ? '' : 's'} required; {preview.runtimeAssembly.selectedPackKeys.length} rendered.
                    {preview.runtimeAssembly.runtimeEnforced ? ' Phase 4 enforcement is active.' : ' Legacy warning mode is active.'}
                  </span>
                  {preview.runtimeAssembly.blockers.length ? (
                    <ul className="mt-2 space-y-1">
                      {preview.runtimeAssembly.blockers.slice(0, 3).map((item) => <li key={`${item.code}-${item.packKey || 'assembly'}`}>• {item.message}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 rounded-[11px] border border-[#dce8e1] bg-[#f5fbf7] px-3 py-2.5 text-xs leading-5 text-[#456a55]">
                <strong className="block text-[#236a43]">Always included</strong>
                {preview.composition.summary.coreCount} core wording section{preview.composition.summary.coreCount === 1 ? '' : 's'} and {preview.composition.summary.transactionDataCount} transaction-data section{preview.composition.summary.transactionDataCount === 1 ? '' : 's'}.
              </div>

              <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8293a5]">Answers used</h3>
              <dl className="mt-2 space-y-2">
                {preview.composition.facts.filter((fact) => fact.required).map((fact) => (
                  <div key={fact.key} className="flex items-start justify-between gap-3 text-xs leading-5">
                    <dt className="text-[#687b90]">{fact.label}</dt>
                    <dd className={`text-right font-semibold ${fact.answered ? 'text-[#2d465f]' : 'text-[#a26417]'}`}>{fact.answered ? formatPackLabel(fact.value) : 'Answer needed'}</dd>
                  </div>
                ))}
              </dl>

              <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8293a5]">Conditional clauses</h3>
              {preview.composition.groups.conditional.length ? (
                <ul className="mt-2 space-y-2">
                  {preview.composition.groups.conditional.map((decision) => (
                    <li key={decision.key} className={`rounded-[10px] border px-3 py-2.5 ${decision.included ? 'border-[#cfe7d8] bg-[#f4fbf6]' : 'border-[#e1e7ed] bg-[#f8fafb]'}`}>
                      <div className="flex items-start gap-2">
                        {decision.included
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#29945a]" aria-hidden="true" />
                          : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8a98a7]" aria-hidden="true" />}
                        <div>
                          <strong className={`block text-xs ${decision.included ? 'text-[#286a45]' : 'text-[#5f7082]'}`}>{decision.label}</strong>
                          <span className="mt-1 block text-[11px] leading-4 text-[#718295]">{decision.reason}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-[10px] border border-[#eed5ad] bg-[#fff9ee] px-3 py-2 text-xs leading-5 text-[#89611d]">No conditional clauses are configured in this template yet.</p>
              )}
            </section>
          ) : null}
        </aside>

        <main className="min-w-0 rounded-[20px] border border-[#dfe7ef] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]" aria-live="polite">
          <div className="flex flex-col gap-3 border-b border-[#e3eaf1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8596a8]">Previewing</p>
              <h2 className="mt-1 text-base font-semibold text-[#203248]">{selectedScenario.label}</h2>
            </div>
            {preview.html ? (
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d7e7dc] bg-[#f2faf5] px-3 py-1.5 text-[#257348]">
                  <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {preview.sectionManifest.length} sections assembled
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${issueCount ? 'border-[#efd9ad] bg-[#fff9ec] text-[#8c6419]' : 'border-[#d7e7dc] bg-[#f2faf5] text-[#257348]'}`}>
                  {issueCount ? <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {issueCount ? `${issueCount} items to review` : 'Template checks passed'}
                </span>
              </div>
            ) : null}
          </div>

          {loading || previewing ? (
            <div className="flex min-h-[650px] flex-col items-center justify-center px-6 text-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-[#0f7f4f]" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold text-[#33475d]">{loading ? 'Loading your template…' : 'Assembling the matching puzzle pieces…'}</p>
            </div>
          ) : !document?.primaryTemplate ? (
            <div className="flex min-h-[650px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f2f5f8] text-[#6e8195]"><FilePenLine className="h-6 w-6" aria-hidden="true" /></div>
              <h2 className="mt-4 text-lg font-semibold text-[#203248]">Set up this document first</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#718398]">Add the standard wording and situation pieces before testing how Bridge assembles them.</p>
              <Link to={editorPath} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[#0f7f4f] px-5 text-sm font-semibold text-white">Set up document</Link>
            </div>
          ) : preview.error ? (
            <div className="flex min-h-[650px] flex-col items-center justify-center px-6 text-center" role="alert">
              <CircleAlert className="h-8 w-8 text-[#b36d13]" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-[#203248]">Preview could not be built</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#7a5c32]">{preview.error}</p>
              <button type="button" className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#d8b77f] bg-white px-4 text-sm font-semibold text-[#81591d]" onClick={() => void handleGeneratePreview()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
              </button>
            </div>
          ) : preview.html ? (
            <>
              {issueCount || preview.dataRequirements.length ? (
                <div className="border-b border-[#e7edf3] bg-[#fffdf8] px-5 py-4">
                  <details open={Boolean(preview.critical.length)}>
                    <summary className="cursor-pointer text-sm font-semibold text-[#6f551e]">Preview checks ({issueCount + preview.dataRequirements.length})</summary>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[#756342]">
                      {[...preview.critical, ...preview.warnings, ...preview.dataRequirements].slice(0, 8).map((issue, index) => (
                        <li key={`${getIssueText(issue)}-${index}`} className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{getIssueText(issue)}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-[#897657]">Sample-data requirements are checked again against real onboarding answers when a live document is generated.</p>
                  </details>
                </div>
              ) : null}
              <div className="bg-[#edf2f7] p-3 sm:p-5">
                <iframe
                  title={`${definition.label} ${selectedScenario.label} sample preview`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[900px] w-full rounded-[8px] border border-[#cfd9e3] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.1)]"
                />
              </div>
            </>
          ) : (
            <div className="flex min-h-[650px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#edf8f2] text-[#16804d]"><Eye className="h-7 w-7" aria-hidden="true" /></div>
              <h2 className="mt-5 text-lg font-semibold text-[#203248]">See exactly what Bridge will assemble</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#718398]">Choose a situation, then build a sample preview. Change situations to compare the wording.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
