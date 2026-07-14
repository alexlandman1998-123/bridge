import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  FileText,
  Layers3,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { buildLegalDocumentOverviewPath } from '../../core/documents/legalDocumentRoutes'

const STATUS_PRESENTATION = Object.freeze({
  live: {
    label: 'Live',
    className: 'border-[#ccead8] bg-[#eefaf2] text-[#187442]',
    Icon: CheckCircle2,
  },
  draft: {
    label: 'Draft',
    className: 'border-[#f2d7a5] bg-[#fff8e9] text-[#98600b]',
    Icon: FilePenLine,
  },
  missing: {
    label: 'Set up required',
    className: 'border-[#dce5ef] bg-[#f6f8fb] text-[#607387]',
    Icon: CircleAlert,
  },
})

function getActionLabel(document) {
  if (document.status === 'missing') return 'Set up document'
  if (document.kind === 'addendum') return 'Manage'
  return document.key === 'otp' ? 'Manage OTP' : 'Manage Mandate'
}

export default function LegalDocumentLibraryCard({ document, compact = false }) {
  const status = STATUS_PRESENTATION[document.status] || STATUS_PRESENTATION.missing
  const StatusIcon = status.Icon
  const statusLabel = document.status === 'live' && document.kind === 'standard' ? 'Ready' : status.label

  return (
    <article className={`group relative flex h-full flex-col rounded-[18px] border border-[#dde6ef] bg-white transition hover:border-[#a9d4bc] hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)] sm:flex-row ${compact ? 'min-h-[172px] p-5' : 'min-h-[218px] p-6'}`}>
      <span className={`inline-flex shrink-0 items-center justify-center rounded-[15px] border border-[#d5e7dc] bg-[#f1faf5] text-[#11804b] ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}>
        <FileText className={`${compact ? 'h-5 w-5' : 'h-7 w-7'}`} strokeWidth={1.9} aria-hidden="true" />
      </span>

      <div className={`mt-4 min-w-0 flex-1 sm:mt-0 ${compact ? 'sm:ml-4' : 'sm:ml-5'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-semibold tracking-[-0.015em] text-[#142033]`}>{document.label}</h3>
            <p className="mt-2 text-sm leading-6 text-[#66798e]">{document.description}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

      {!compact ? (
          <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#738599]">
            <div className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <dt className="sr-only">Standard sections</dt>
              <dd>{document.standardSectionCount} standard sections</dd>
            </div>
            <span className="hidden text-[#c3cdd7] sm:inline" aria-hidden="true">•</span>
            <div className="inline-flex items-center gap-1.5">
              <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
              <dt className="sr-only">Situation clauses</dt>
              <dd>{document.situationClauseCount} situation clauses</dd>
            </div>
            {document.signerRuleCount > 0 ? (
              <div className="inline-flex items-center gap-1.5">
                <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                <dt className="sr-only">Signing roles</dt>
                <dd>{document.signerRuleCount} signing roles</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs leading-5 text-[#8090a2]">
            {document.versionLabel ? <span className="font-semibold text-[#607387]">Version {document.versionLabel}</span> : 'Not versioned'}
            <span className="mx-2 text-[#c3cdd7]" aria-hidden="true">•</span>
            <span>{document.templateCount === 1 ? '1 saved version' : `${document.templateCount} saved versions`}</span>
          </div>
          <Link
            to={buildLegalDocumentOverviewPath(document.key)}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-[#b9dcc7] bg-white px-4 text-sm font-semibold text-[#187348] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7f4f]"
          >
            {getActionLabel(document)}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
