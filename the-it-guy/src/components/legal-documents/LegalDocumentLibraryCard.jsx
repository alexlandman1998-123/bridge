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
  return document.kind === 'addendum' ? 'Open addendum' : 'Open document'
}

export default function LegalDocumentLibraryCard({ document, compact = false }) {
  const status = STATUS_PRESENTATION[document.status] || STATUS_PRESENTATION.missing
  const StatusIcon = status.Icon
  const metrics = [
    { label: 'Standard sections', value: document.standardSectionCount, Icon: FileText },
    { label: 'Situation rules', value: document.situationClauseCount, Icon: Layers3 },
    { label: 'Signing roles', value: document.signerRuleCount, Icon: UsersRound },
  ]

  return (
    <article className={`group flex h-full flex-col rounded-[18px] border border-[#dde6ef] bg-white transition hover:border-[#a9d4bc] hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)] ${compact ? 'p-5' : 'p-6'}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex items-center justify-center rounded-[13px] border border-[#d5e7dc] bg-[#f1faf5] text-[#11804b] ${compact ? 'h-11 w-11' : 'h-12 w-12'}`}>
          <FileText className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <div className="mt-5">
        <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-semibold tracking-[-0.01em] text-[#142033]`}>{document.label}</h3>
        <p className="mt-2 text-sm leading-6 text-[#66798e]">{document.description}</p>
      </div>

      {!compact ? (
        <dl className="mt-6 grid grid-cols-3 gap-2 border-y border-[#edf1f5] py-4">
          {metrics.map((metric) => {
            const MetricIcon = metric.Icon
            return (
              <div key={metric.label} className="min-w-0 text-center">
                <dt className="flex items-center justify-center gap-1 text-[11px] font-medium leading-4 text-[#788a9d]">
                  <MetricIcon className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
                  {metric.label}
                </dt>
                <dd className="mt-1 text-base font-semibold text-[#213047]">{metric.value}</dd>
              </div>
            )
          })}
        </dl>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-4 pt-5">
        <div className="min-w-0 text-xs leading-5 text-[#8090a2]">
          {document.versionLabel ? <span className="block font-semibold text-[#607387]">Version {document.versionLabel}</span> : null}
          <span>{document.templateCount === 1 ? '1 saved version' : `${document.templateCount} saved versions`}</span>
        </div>
        <Link
          to={buildLegalDocumentOverviewPath(document.key)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-[#d4e1eb] bg-white px-4 text-sm font-semibold text-[#24364b] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5] hover:text-[#0f7f4f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7f4f]"
        >
          {getActionLabel(document)}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
