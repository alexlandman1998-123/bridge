import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Puzzle,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import LegalDocumentLibraryCard from '../../components/legal-documents/LegalDocumentLibraryCard'
import { resolveLegalDocumentOrganisationId } from '../../core/documents/legalDocumentWorkspace'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useLegalDocumentLibrary } from '../../hooks/useLegalDocumentLibrary'

const BUILD_STEPS = Object.freeze([
  {
    label: 'People answer simple questions',
    description: 'Buyer, seller and property details are captured during onboarding.',
    Icon: ClipboardList,
  },
  {
    label: 'Bridge chooses the right pieces',
    description: 'Only the wording needed for that exact transaction is included.',
    Icon: Puzzle,
  },
  {
    label: 'The document is ready',
    description: 'One clean agreement is assembled for review and signing.',
    Icon: FileCheck2,
  },
])

export default function LegalDocumentsLandingPage() {
  const { currentMembership, currentWorkspace } = useWorkspace()
  const organisationId = resolveLegalDocumentOrganisationId(currentWorkspace, currentMembership)
  const {
    documents,
    summary,
    loading,
    error,
    refresh,
  } = useLegalDocumentLibrary({ organisationId: organisationId || null })
  const coreDocuments = documents.filter((document) => document.kind === 'standard')
  const addenda = documents.filter((document) => document.kind === 'addendum')

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10" aria-labelledby="legal-documents-title">
      <section className="overflow-hidden rounded-[24px] border border-[#dde7ef] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.06)]">
        <div className="grid gap-7 px-6 py-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:px-8 lg:py-8">
          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b8da2]">Legal document library</span>
            <h1 id="legal-documents-title" className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#101c2d] sm:text-[2.1rem]">
              Build the right legal document every time
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#62758a]">
              Maintain the wording once. Bridge uses the buyer, seller and property information to assemble the correct document automatically.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cde8d8] bg-[#f0faf4] px-3 py-1.5 text-xs font-semibold text-[#187442]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {loading ? 'Checking your library…' : `${summary.liveCount} of ${summary.documentCount} documents live`}
              </span>
              {!loading && summary.draftCount > 0 ? (
                <span className="text-xs font-medium text-[#7b8da2]">{summary.draftCount} {summary.draftCount === 1 ? 'draft' : 'drafts'} waiting</span>
              ) : null}
            </div>
          </div>

          <aside className="rounded-[18px] border border-[#d8e9df] bg-[#f4faf6] p-5" aria-label="How legal documents are built">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#174c35]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              How it works
            </div>
            <ol className="mt-4 space-y-3">
              {BUILD_STEPS.map((step, index) => {
                const StepIcon = step.Icon
                return (
                  <li key={step.label} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#cbe2d4] bg-white text-[#0f7f4f]">
                      <StepIcon className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Step {index + 1}</span>
                    </span>
                    <span>
                      <strong className="block text-sm font-semibold text-[#20362c]">{step.label}</strong>
                      <span className="mt-0.5 block text-xs leading-5 text-[#678073]">{step.description}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </aside>
        </div>
      </section>

      {error ? (
        <section className="flex flex-col gap-3 rounded-[16px] border border-[#f0cfaa] bg-[#fff8ed] px-5 py-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div>
            <h2 className="text-sm font-semibold text-[#8b5209]">We could not load your document statuses</h2>
            <p className="mt-1 text-sm text-[#9b6a2d]">{error}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#e1b875] bg-white px-4 text-sm font-semibold text-[#80500d] transition hover:bg-[#fffaf2]"
            onClick={() => void refresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </section>
      ) : null}

      <section aria-labelledby="core-documents-heading">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="core-documents-heading" className="text-xl font-semibold tracking-[-0.02em] text-[#142033]">Core documents</h2>
            <p className="mt-1 text-sm leading-6 text-[#6c7e91]">Start here to manage the agreements your team uses most.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7a8ca0]">
            Choose a document to manage its wording
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading core documents">
            {[0, 1].map((item) => (
              <div key={item} className="h-[310px] animate-pulse rounded-[18px] border border-[#e2e9f0] bg-white p-6">
                <div className="h-12 w-12 rounded-[13px] bg-[#edf2f5]" />
                <div className="mt-5 h-6 w-44 rounded bg-[#edf2f5]" />
                <div className="mt-3 h-4 w-4/5 rounded bg-[#f1f4f7]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {coreDocuments.map((document) => <LegalDocumentLibraryCard key={document.key} document={document} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="addenda-heading">
        <div className="mb-4">
          <h2 id="addenda-heading" className="text-lg font-semibold tracking-[-0.01em] text-[#142033]">Addenda</h2>
          <p className="mt-1 text-sm leading-6 text-[#6c7e91]">Optional documents used when a transaction needs a specific change.</p>
        </div>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading addenda">
            {[0, 1].map((item) => <div key={item} className="h-[230px] animate-pulse rounded-[18px] border border-[#e2e9f0] bg-white" />)}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {addenda.map((document) => <LegalDocumentLibraryCard key={document.key} document={document} compact />)}
          </div>
        )}
      </section>
    </div>
  )
}
