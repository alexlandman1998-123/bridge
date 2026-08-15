import { CheckCircle2, Download, ExternalLink, FileCheck2, Landmark, Scale, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { buildBondOriginatorAttorneyHandoffViewModel } from '../../modules/bond/integrations'
import Button from '../ui/Button'
import StatusBadge from '../ui/StatusBadge'

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : 'Amount pending'
}

function formatDateTime(value) {
  if (!value) return 'No update yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No update yet'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getDocumentUrl(document = {}) {
  return document?.url || document?.downloadUrl || document?.download_url || document?.publicUrl || document?.public_url || ''
}

function GrantDocumentButton({ document, label, onOpenDocument }) {
  const hasDocument = Boolean(document?.id)
  const hasUrl = Boolean(getDocumentUrl(document))
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={!hasDocument || !hasUrl}
      onClick={() => onOpenDocument?.(document)}
      title={!hasDocument ? `${label} is not available yet.` : !hasUrl ? `${label} does not have a secure link available.` : label}
    >
      <Download size={14} />
      {label}
    </Button>
  )
}

function BondOriginatorAttorneyHandoffView({
  handoffView = null,
  transaction = null,
  documents = [],
  rolePlayers = [],
  deepLinks = null,
  onOpenDocument = null,
  onOpenRoleplayers = null,
  onOpenDeepLink = null,
}) {
  const model = useMemo(
    () => buildBondOriginatorAttorneyHandoffViewModel({
      handoffPackage:
        handoffView ||
        transaction?.bondOriginatorAttorneyHandoffView ||
        transaction?.bond_originator_attorney_handoff_view ||
        {},
      documents,
      rolePlayers,
      transaction,
    }),
    [documents, handoffView, rolePlayers, transaction],
  )

  const statusTone = model.status === 'signed_grant_available'
    ? 'transaction-health-track'
    : model.available
      ? 'transaction-chip-watch'
      : 'transaction-chip-muted'
  const sourceLinks = deepLinks?.links || deepLinks || {}
  const openSourceLink = (link) => {
    if (link?.href && typeof onOpenDeepLink === 'function') onOpenDeepLink(link)
  }

  return (
    <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primarySoft bg-primarySoft text-primary">
              <Scale size={18} aria-hidden="true" />
            </span>
            <StatusBadge className={`transaction-workflow-chip ${statusTone}`.trim()}>
              {model.statusLabel}
            </StatusBadge>
            <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
              Attorney handoff
            </span>
          </div>
          <h3 className="mt-3 text-section-title font-semibold text-textStrong">{model.headline}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-textMuted">{model.summary}</p>
          <p className="mt-2 text-helper font-medium text-textMuted">Last update: {formatDateTime(model.lastUpdatedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sourceLinks.instruction?.href && onOpenDeepLink ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => openSourceLink(sourceLinks.instruction)}>
              <ExternalLink size={14} />
              Instruction
            </Button>
          ) : null}
          {onOpenRoleplayers ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenRoleplayers}>
              <UserRound size={14} />
              Roleplayers
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.cards.map((card) => (
          <article key={card.key} className="rounded-[14px] border border-borderDefault bg-surface p-4">
            <p className="text-helper font-semibold uppercase text-textMuted">{card.label}</p>
            <strong className="mt-2 block text-base font-semibold text-textStrong">{card.value}</strong>
            <span className="mt-1 block text-sm text-textMuted">{card.detail}</span>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[14px] border border-borderDefault bg-surface p-4">
          <div className="flex items-center gap-2">
            <FileCheck2 size={16} className="text-primary" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-textStrong">Bond Grant Documents</h4>
          </div>

          {model.grants.length ? (
            <div className="mt-3 space-y-3">
              {model.grants.map((grant) => (
                <article key={grant.id || `${grant.bankName}-${grant.grantReference}`} className="rounded-[12px] border border-borderDefault bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <strong className="block text-sm font-semibold text-textStrong">{grant.bankName}</strong>
                      <span className="mt-1 block text-sm text-textMuted">{formatCurrency(grant.approvedAmount)}</span>
                      {grant.grantReference ? (
                        <span className="mt-1 block text-helper text-textMuted">Ref {grant.grantReference}</span>
                      ) : null}
                      {grant.conditionsSummary ? (
                        <p className="mt-2 text-sm leading-5 text-textMuted">{grant.conditionsSummary}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <GrantDocumentButton document={grant.grantDocument} label="Grant" onOpenDocument={onOpenDocument} />
                      <GrantDocumentButton document={grant.signedGrantDocument} label="Signed grant" onOpenDocument={onOpenDocument} />
                      {(sourceLinks.grant?.href || sourceLinks.signedGrant?.href) && onOpenDeepLink ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => openSourceLink(sourceLinks.signedGrant || sourceLinks.grant)}>
                          <ExternalLink size={14} />
                          Source
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-textMuted">No attorney-ready bond grant document has been captured yet.</p>
          )}
        </div>

        <aside className="rounded-[14px] border border-borderDefault bg-surface p-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-primary" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-textStrong">Handoff Checklist</h4>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-textMuted">
            {model.nextActions.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 size={15} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-[12px] border border-borderDefault bg-white p-3 text-sm text-textMuted">
            <strong className="block text-textStrong">Current allocation</strong>
            <span className="mt-2 block">Bond attorney: {model.assignments.bondAttorney || 'Not assigned'}</span>
            <span className="mt-1 block">Cancellation attorney: {model.assignments.cancellationAttorney || 'Not assigned'}</span>
          </div>
          {sourceLinks.activity?.href && onOpenDeepLink ? (
            <Button type="button" variant="secondary" size="sm" className="mt-3 w-full justify-center" onClick={() => openSourceLink(sourceLinks.activity)}>
              <ExternalLink size={14} />
              Originator Activity
            </Button>
          ) : null}
        </aside>
      </div>

      <p className="mt-4 rounded-[14px] border border-borderDefault bg-mutedBg px-4 py-3 text-sm leading-6 text-textMuted">
        This handoff makes captured grant evidence available to the attorney workflow. It does not submit to banks, mutate bank status, alter offers or grants, or make lending decisions.
      </p>
    </section>
  )
}

export default BondOriginatorAttorneyHandoffView
