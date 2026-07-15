import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileCheck2,
  FilePenLine,
  FileText,
  Puzzle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import LegalDocumentLibraryCard from '../../components/legal-documents/LegalDocumentLibraryCard'
import {
  buildLegalDocumentOverviewPath,
  buildLegalDocumentPreviewPath,
} from '../../core/documents/legalDocumentRoutes'
import { resolveLegalDocumentOrganisationId } from '../../core/documents/legalDocumentWorkspace'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useLegalDocumentLibrary } from '../../hooks/useLegalDocumentLibrary'

const BUILD_STEPS = Object.freeze([
  {
    label: 'Onboarding answers',
    description: 'Your team captures the people, deal and property details.',
    Icon: ClipboardList,
  },
  {
    label: 'Bridge selects the wording',
    description: 'The standard template and matching conditional clauses are assembled.',
    Icon: Puzzle,
  },
  {
    label: 'Document and signers are ready',
    description: 'One clean draft is prepared for review and signing.',
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
  const otpDocument = documents.find((document) => document.key === 'otp')
  const firstDraft = documents.find((document) => document.status === 'draft')
  const primaryActionDocument = firstDraft || otpDocument || documents[0]
  const coverageLabel = summary.allCovered ? 'All' : `${summary.coveredCount} of ${summary.documentCount}`

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10" aria-labelledby="legal-documents-title">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 id="legal-documents-title" className="text-3xl font-semibold tracking-[-0.03em] text-[#101c2d] sm:text-[2.15rem]">Legal Documents</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#62758a]">
            Manage the wording Bridge uses to automatically build your legal documents.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to={buildLegalDocumentPreviewPath('otp')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#d6e1ea] bg-white px-4 text-sm font-semibold text-[#33475c] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:border-[#aac8b8] hover:bg-[#f8fcfa]"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview a situation
          </Link>
          {primaryActionDocument ? (
            <Link
              to={buildLegalDocumentOverviewPath(primaryActionDocument.key)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#0f7f4f] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.2)] transition hover:bg-[#0d7045]"
            >
              {firstDraft ? <FilePenLine className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
              {firstDraft ? 'Review draft' : 'Manage documents'}
            </Link>
          ) : null}
        </div>
      </header>

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

      <section className="grid gap-4 md:grid-cols-3" aria-label="Legal document status">
        <Link to={primaryActionDocument ? buildLegalDocumentOverviewPath(primaryActionDocument.key) : buildLegalDocumentOverviewPath('otp')} className="flex min-h-[112px] items-center gap-4 rounded-[18px] border border-[#dde6ee] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)] transition hover:border-[#e1c884] hover:bg-[#fffdf8]">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[15px] border border-[#d3e9dc] bg-[#f0faf4] text-[#16804d]">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-2xl font-semibold tracking-[-0.03em] text-[#142033]">{loading ? '—' : summary.liveCount}</strong>
            <span className="mt-0.5 block text-sm text-[#66798e]">documents live</span>
          </div>
          {!loading ? <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-[#32a268]" aria-hidden="true" /> : null}
        </Link>

        <article className="flex min-h-[112px] items-center gap-4 rounded-[18px] border border-[#dde6ee] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[15px] border border-[#d3e9dc] bg-[#f0faf4] text-[#16804d]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-2xl font-semibold tracking-[-0.03em] text-[#142033]">{loading ? '—' : coverageLabel}</strong>
            <span className="mt-0.5 block text-sm text-[#66798e]">documents covered</span>
          </div>
          {!loading && summary.allCovered ? <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-[#32a268]" aria-hidden="true" /> : null}
        </article>

        <article className="flex min-h-[112px] items-center gap-4 rounded-[18px] border border-[#dde6ee] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[15px] border border-[#f0dfb6] bg-[#fff9ea] text-[#a06b0d]">
            <FilePenLine className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-2xl font-semibold tracking-[-0.03em] text-[#142033]">{loading ? '—' : summary.draftCount}</strong>
            <span className="mt-0.5 block text-sm text-[#66798e]">{summary.draftCount === 1 ? 'draft to review' : 'drafts to review'}</span>
          </div>
          {firstDraft ? <ArrowRight className="ml-auto h-5 w-5 shrink-0 text-[#8192a4]" aria-hidden="true" /> : <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-[#32a268]" aria-hidden="true" />}
        </article>
      </section>

      <section aria-labelledby="document-library-heading">
        <div className="mb-4">
          <h2 id="document-library-heading" className="text-xl font-semibold tracking-[-0.02em] text-[#142033]">Document library</h2>
          <p className="mt-1 text-sm leading-6 text-[#6c7e91]">Choose a document to manage its standard wording, situations and signing setup.</p>
        </div>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading legal documents">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-[210px] animate-pulse rounded-[18px] border border-[#e2e9f0] bg-white p-6">
                <div className="h-14 w-14 rounded-[15px] bg-[#edf2f5]" />
                <div className="mt-5 h-5 w-44 rounded bg-[#edf2f5]" />
                <div className="mt-3 h-4 w-4/5 rounded bg-[#f1f4f7]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {documents.map((document) => (
              <LegalDocumentLibraryCard key={document.key} document={document} compact={document.kind === 'addendum'} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[20px] border border-[#dde6ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6" aria-labelledby="build-flow-heading">
        <h2 id="build-flow-heading" className="text-lg font-semibold tracking-[-0.01em] text-[#142033]">How documents are built</h2>
        <ol className="mt-5 grid gap-5 lg:grid-cols-3">
          {BUILD_STEPS.map((step, index) => {
            const StepIcon = step.Icon
            return (
              <li key={step.label} className="relative flex items-start gap-4 lg:pr-8">
                <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#bfe0cc] bg-[#f0faf4] text-[#147748]">
                  <StepIcon className="h-6 w-6" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#29955b] text-[10px] font-bold text-white">{index + 1}</span>
                </span>
                <span className="min-w-0 pt-1">
                  <strong className="block text-sm font-semibold text-[#26384d]">{step.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-[#718398]">{step.description}</span>
                </span>
                {index < BUILD_STEPS.length - 1 ? <ArrowRight className="absolute right-0 top-5 hidden h-5 w-5 text-[#b4c2cf] lg:block" aria-hidden="true" /> : null}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
