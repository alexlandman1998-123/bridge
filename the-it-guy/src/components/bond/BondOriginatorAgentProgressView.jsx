import { ArrowRight, CheckCircle2, Clock3, FileText, Landmark, ListChecks } from 'lucide-react'
import { useMemo } from 'react'
import { buildBondOriginatorAgentProgressViewModel } from '../../modules/bond/integrations'
import Button from '../ui/Button'
import StatusBadge from '../ui/StatusBadge'

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

function formatShortDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '-'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(numeric)
}

function formatStatusLabel(value, fallback = 'Pending') {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(Boolean)
  }
  return []
}

function getSummaryNumber(summary = {}, key = '') {
  const value = summary?.[key] ?? summary?.[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function getLatestDate(...values) {
  return values
    .flat()
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() || null
}

function getCardIcon(key) {
  if (key === 'document_requests') return FileText
  if (key === 'offers') return Landmark
  if (key === 'grants') return CheckCircle2
  return ListChecks
}

function resolveProgressSource(progressView, transaction) {
  return (
    progressView ||
    transaction?.bondOriginatorAgentProgressView ||
    transaction?.bond_originator_agent_progress_view ||
    transaction?.bondOriginatorProgressView ||
    null
  )
}

function getProgressSourceArrays(source = {}) {
  return {
    documentRequests: getArray(source?.documentRequests, source?.document_requests),
    offerCaptures: getArray(
      source?.offerCaptures,
      source?.offer_captures,
      source?.transaction_bond_originator_bank_offer_captures,
    ),
    grantCaptures: getArray(
      source?.grantCaptures,
      source?.grant_captures,
      source?.transaction_bond_originator_grant_captures,
    ),
  }
}

function getWorkflowArrays(financeWorkflow = {}) {
  return {
    applications: getArray(financeWorkflow?.applications),
    offers: getArray(financeWorkflow?.offers, financeWorkflow?.quotes),
    events: getArray(financeWorkflow?.events),
    bankOutcomes: getArray(financeWorkflow?.bankOutcomes, financeWorkflow?.bank_outcomes),
  }
}

function getOfferAmount(offer = {}) {
  return offer.offeredAmount ?? offer.offered_amount ?? offer.quotedAmount ?? offer.quoted_amount
}

function getOfferStatus(offer = {}) {
  return (
    offer.offerStatusLabel ||
    offer.quoteStatusLabel ||
    formatStatusLabel(offer.status || offer.quoteStatus || offer.quote_status || offer.buyerDecision || offer.buyer_decision, 'Received')
  )
}

function getRowStatusClass(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('accepted') || normalized.includes('approved') || normalized.includes('offer received') || normalized.includes('received')) {
    return 'border-emerald-100 bg-emerald-50 text-emerald-700'
  }
  if (normalized.includes('await') || normalized.includes('pending') || normalized.includes('review')) {
    return 'border-amber-100 bg-amber-50 text-amber-700'
  }
  if (normalized.includes('declined') || normalized.includes('rejected') || normalized.includes('blocked')) {
    return 'border-rose-100 bg-rose-50 text-rose-700'
  }
  if (normalized.includes('submitted') || normalized.includes('published')) {
    return 'border-blue-100 bg-blue-50 text-blue-700'
  }
  return 'border-borderDefault bg-mutedBg text-textMuted'
}

function StatusPill({ value }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[0.7rem] font-semibold ${getRowStatusClass(value)}`}>
      {value}
    </span>
  )
}

function buildBankRows({ applications = [], offers = [], offerCaptures = [] } = {}) {
  if (applications.length) {
    return applications.slice(0, 5).map((application) => {
      const matchingOffer = offers.find((offer) => {
        const offerApplicationId = offer.bondApplicationId || offer.bond_application_id
        if (offerApplicationId && offerApplicationId === application.id) return true
        return String(offer.bankName || offer.bank_name || '').toLowerCase() === String(application.bankName || application.bank_name || '').toLowerCase()
      })
      return {
        id: application.id || `${application.bankName}-${application.createdAt}`,
        bankName: application.bankName || application.bank_name || 'Bank pending',
        status: application.statusLabel || formatStatusLabel(application.status, 'Pending'),
        updatedAt: application.feedbackReceivedAt || application.feedback_received_at || application.submittedAt || application.submitted_at || application.updatedAt || application.updated_at,
        offer: matchingOffer ? formatCurrency(getOfferAmount(matchingOffer)) : '-',
      }
    })
  }

  return offerCaptures.slice(0, 5).map((offer) => ({
    id: offer.id || `${offer.bankName || offer.bank_name}-${offer.capturedAt || offer.captured_at}`,
    bankName: offer.bankName || offer.bank_name || 'Bank pending',
    status: getOfferStatus(offer),
    updatedAt: offer.buyerDecisionAt || offer.buyer_decision_at || offer.publishedAt || offer.published_at || offer.capturedAt || offer.captured_at,
    offer: formatCurrency(getOfferAmount(offer)),
  }))
}

function buildDocumentRows({ documentRequests = [], documentSummary = {} } = {}) {
  if (documentRequests.length) {
    return documentRequests.slice(0, 4).map((request) => ({
      id: request.id || `${request.requirementKey || request.requirement_key}-${request.createdAt || request.created_at}`,
      title:
        request.title ||
        request.buyerInstruction ||
        request.buyer_instruction ||
        formatStatusLabel(request.canonicalDocumentType || request.canonical_document_type || request.requirementKey || request.requirement_key, 'Requested document'),
      requestedAt: request.sentAt || request.sent_at || request.createdAt || request.created_at,
      status: formatStatusLabel(request.status, 'Sent'),
    }))
  }

  const openRequests = getSummaryNumber(documentSummary, 'open')
  const awaitingReview = getSummaryNumber(documentSummary, 'awaitingReview')
  if (!openRequests && !awaitingReview) return []
  return [
    {
      id: 'originator-document-summary',
      title: openRequests ? 'Open originator document requests' : 'Documents awaiting originator review',
      requestedAt: documentSummary.latestAt || documentSummary.latest_at,
      status: openRequests ? `${openRequests} open` : `${awaitingReview} awaiting review`,
    },
  ]
}

function buildGrantLabel({ grantCaptures = [], instruction = null } = {}) {
  if (grantCaptures.length) {
    const signed = grantCaptures.filter((grant) =>
      ['buyer_signed', 'submitted_for_instruction'].includes(String(grant.status || '').toLowerCase()) ||
      grant.signedGrantDocumentAvailable ||
      grant.signed_grant_document_id,
    ).length
    if (signed) return `${signed} signed`
    return `${grantCaptures.length} published`
  }
  if (instruction?.instructionSent || instruction?.instruction_sent) return 'Instruction sent'
  if (instruction?.grantSubmitted || instruction?.grant_submitted) return 'Grant submitted'
  if (instruction?.grantSigned || instruction?.grant_signed) return 'Grant signed'
  if (instruction?.grantReceived || instruction?.grant_received) return 'Grant received'
  return 'Not captured'
}

function buildRecentEvents({ modelEvents = [], applications = [], offers = [], grantCaptures = [], instruction = null } = {}) {
  const synthetic = []
  offers.slice(0, 2).forEach((offer) => {
    synthetic.push({
      id: `offer-${offer.id}`,
      title: `${getOfferStatus(offer)}${offer.bankName || offer.bank_name ? ` from ${offer.bankName || offer.bank_name}` : ''}`,
      summary: getOfferAmount(offer) ? formatCurrency(getOfferAmount(offer)) : '',
      occurredAt: offer.decisionAt || offer.decision_at || offer.approvedAt || offer.approved_at || offer.quoteReceivedAt || offer.quote_received_at || offer.createdAt || offer.created_at,
    })
  })
  applications.slice(0, 2).forEach((application) => {
    synthetic.push({
      id: `application-${application.id}`,
      title: `${application.bankName || application.bank_name || 'Bank'} application ${formatStatusLabel(application.status, 'pending').toLowerCase()}`,
      summary: application.applicationReference || application.application_reference || application.referenceNumber || application.reference_number || '',
      occurredAt: application.feedbackReceivedAt || application.feedback_received_at || application.submittedAt || application.submitted_at || application.createdAt || application.created_at,
    })
  })
  grantCaptures.slice(0, 1).forEach((grant) => {
    synthetic.push({
      id: `grant-${grant.id}`,
      title: `Grant ${formatStatusLabel(grant.status, 'received').toLowerCase()}${grant.bankName || grant.bank_name ? ` from ${grant.bankName || grant.bank_name}` : ''}`,
      summary: getOfferAmount({ offeredAmount: grant.approvedAmount || grant.approved_amount }) ? formatCurrency(grant.approvedAmount || grant.approved_amount) : '',
      occurredAt: grant.publishedAt || grant.published_at || grant.capturedAt || grant.captured_at,
    })
  })
  if (instruction?.instructionSentAt || instruction?.instruction_sent_at) {
    synthetic.push({
      id: 'instruction-sent',
      title: 'Bond instruction sent',
      summary: 'Attorney instruction evidence is recorded.',
      occurredAt: instruction.instructionSentAt || instruction.instruction_sent_at,
    })
  }

  return [...modelEvents, ...synthetic]
    .filter((event) => event?.title)
    .sort((left, right) => new Date(right?.occurredAt || 0).getTime() - new Date(left?.occurredAt || 0).getTime())
    .slice(0, 6)
}

function BondOriginatorAgentProgressView({
  progressView = null,
  financeWorkflow = null,
  transaction = null,
  onOpenFinance = null,
  onOpenDocuments = null,
  onOpenActivity = null,
  compact = false,
}) {
  const progressSource = useMemo(
    () => resolveProgressSource(progressView, transaction) || {},
    [progressView, transaction],
  )
  const model = useMemo(
    () => buildBondOriginatorAgentProgressViewModel({
      exportPackage: progressSource,
    }),
    [progressSource],
  )
  const progressArrays = useMemo(() => getProgressSourceArrays(progressSource), [progressSource])
  const workflowArrays = useMemo(() => getWorkflowArrays(financeWorkflow), [financeWorkflow])
  const documentSummary =
    progressSource?.documentRequestSummary ||
    progressSource?.document_request_summary ||
    progressSource?.document_request_summary_json ||
    {}
  const offerSummary =
    progressSource?.offerGrantSummary?.offers ||
    progressSource?.offer_grant_summary?.offers ||
    progressSource?.offer_grant_summary_json?.offers ||
    {}
  const bankRows = buildBankRows({
    applications: workflowArrays.applications,
    offers: workflowArrays.offers,
    offerCaptures: progressArrays.offerCaptures,
  })
  const documentRows = buildDocumentRows({
    documentRequests: progressArrays.documentRequests,
    documentSummary,
  })
  const hasFinanceWorkflow = Boolean(financeWorkflow?.workflow || workflowArrays.applications.length || workflowArrays.offers.length)
  const available = model.available || hasFinanceWorkflow || bankRows.length || documentRows.length
  const latestUpdate = getLatestDate(
    model.lastUpdatedAt,
    financeWorkflow?.workflow?.lastUpdatedAt || financeWorkflow?.workflow?.last_updated_at,
    progressArrays.documentRequests.map((request) => request.updatedAt || request.updated_at || request.reviewedAt || request.reviewed_at || request.createdAt || request.created_at),
    progressArrays.offerCaptures.map((offer) => offer.buyerDecisionAt || offer.buyer_decision_at || offer.publishedAt || offer.published_at || offer.capturedAt || offer.captured_at),
    progressArrays.grantCaptures.map((grant) => grant.publishedAt || grant.published_at || grant.capturedAt || grant.captured_at),
    workflowArrays.applications.map((application) => application.updatedAt || application.updated_at || application.submittedAt || application.submitted_at || application.createdAt || application.created_at),
    workflowArrays.offers.map((offer) => offer.decisionAt || offer.decision_at || offer.quoteReceivedAt || offer.quote_received_at || offer.createdAt || offer.created_at),
  )
  const offersCount = progressArrays.offerCaptures.length || workflowArrays.offers.length || getSummaryNumber(offerSummary, 'published')
  const acceptedOffers = getSummaryNumber(offerSummary, 'accepted') || workflowArrays.offers.filter((offer) =>
    ['accepted', 'approved_by_buyer'].includes(String(offer.offerStatus || offer.quoteStatus || offer.quote_status || '').toLowerCase()),
  ).length
  const documentCount = progressArrays.documentRequests.length || getSummaryNumber(documentSummary, 'open')
  const grantLabel = buildGrantLabel({
    grantCaptures: progressArrays.grantCaptures,
    instruction: financeWorkflow?.instruction,
  })
  const nextAction =
    model.nextActions?.[0] ||
    financeWorkflow?.summary?.nextAction ||
    financeWorkflow?.workflow?.currentStageLabel ||
    'Wait for the originator to record the next update.'
  const summary = available
    ? 'Live read-only view of the bond originator package, bank feedback, document requests, offers and grants connected to this transaction.'
    : model.summary
  const cards = [
    {
      key: 'applications',
      label: 'Bank applications',
      value: String(bankRows.length || workflowArrays.applications.length || 0),
      detail: bankRows.length ? 'View lender status below' : 'No bank submissions yet',
    },
    {
      key: 'offers',
      label: 'Offers',
      value: String(offersCount),
      detail: acceptedOffers ? `${acceptedOffers} accepted by buyer` : 'No accepted offer recorded',
    },
    {
      key: 'next_action',
      label: 'Next action',
      value: nextAction,
      detail: financeWorkflow?.workflow?.currentStageLabel || model.statusLabel,
    },
    {
      key: 'document_requests',
      label: 'Documents requested',
      value: String(documentCount),
      detail: getSummaryNumber(documentSummary, 'awaitingReview') ? `${getSummaryNumber(documentSummary, 'awaitingReview')} awaiting review` : grantLabel,
    },
  ]
  const recentEvents = buildRecentEvents({
    modelEvents: model.events || [],
    applications: workflowArrays.applications,
    offers: workflowArrays.offers.length ? workflowArrays.offers : progressArrays.offerCaptures,
    grantCaptures: progressArrays.grantCaptures,
    instruction: financeWorkflow?.instruction,
  })

  const statusTone = available ? 'transaction-chip-watch' : 'transaction-chip-muted'

  return (
    <section className={`rounded-[18px] border border-borderDefault bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primarySoft bg-primarySoft text-primary">
              <Landmark size={18} aria-hidden="true" />
            </span>
            <StatusBadge className={`transaction-workflow-chip ${statusTone}`.trim()}>
              {available ? model.statusLabel || financeWorkflow?.workflow?.currentStageLabel || 'Live originator feed' : model.statusLabel}
            </StatusBadge>
            <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
              Read only
            </span>
          </div>
          <h3 className="mt-3 text-section-title font-semibold text-textStrong">Bond Originator Progress</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-textMuted">{summary}</p>
          <p className="mt-2 text-helper font-medium text-textMuted">
            Originator: {model.recipientName || transaction?.bond_originator || 'Bond originator'} · Last update: {formatDateTime(latestUpdate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenDocuments ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenDocuments}>
              <FileText size={14} />
              Documents
            </Button>
          ) : null}
          {onOpenActivity ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenActivity}>
              <Clock3 size={14} />
              Activity
            </Button>
          ) : null}
          {onOpenFinance ? (
            <Button type="button" size="sm" onClick={onOpenFinance}>
              Finance
              <ArrowRight size={14} />
            </Button>
          ) : null}
        </div>
      </div>

      {available ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = getCardIcon(card.key)
            return (
              <article key={card.key} className="rounded-[10px] border border-borderDefault bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-helper font-semibold uppercase text-textMuted">{card.label}</p>
                    <strong className="mt-2 block truncate text-base font-semibold text-textStrong">{card.value}</strong>
                    <span className="mt-1 block text-sm text-textMuted">{card.detail}</span>
                  </div>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-borderDefault bg-white text-textMuted">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      <div className={`mt-5 grid gap-4 ${recentEvents.length ? 'xl:grid-cols-[minmax(0,2fr)_minmax(300px,0.9fr)]' : ''}`}>
        <div className="space-y-4">
          <div className="rounded-[10px] border border-borderDefault bg-surface p-4">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-primary" aria-hidden="true" />
              <h4 className="text-sm font-semibold text-textStrong">Next Step</h4>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-textMuted">
              {(model.nextActions?.length ? model.nextActions : [nextAction]).map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 size={15} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="overflow-hidden rounded-[10px] border border-borderDefault bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-borderSoft px-4 py-3">
                <h4 className="text-sm font-semibold text-textStrong">Bank applications</h4>
                <span className="text-helper font-medium text-textMuted">{bankRows.length} tracked</span>
              </div>
              {bankRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-mutedBg text-helper font-semibold uppercase text-textMuted">
                      <tr>
                        <th className="px-4 py-3">Bank</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Last update</th>
                        <th className="px-4 py-3">Offer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderSoft">
                      {bankRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 font-semibold text-textStrong">{row.bankName}</td>
                          <td className="px-4 py-3"><StatusPill value={row.status} /></td>
                          <td className="px-4 py-3 text-textMuted">{formatShortDate(row.updatedAt)}</td>
                          <td className="px-4 py-3 text-textStrong">{row.offer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-5 text-sm leading-6 text-textMuted">No bank applications have been captured by the bond originator workflow yet.</p>
              )}
            </div>

            <div className="overflow-hidden rounded-[10px] border border-borderDefault bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-borderSoft px-4 py-3">
                <h4 className="text-sm font-semibold text-textStrong">Documents requested</h4>
                <span className="text-helper font-medium text-textMuted">{documentRows.length || documentCount} open</span>
              </div>
              {documentRows.length ? (
                <div className="divide-y divide-borderSoft">
                  {documentRows.map((row) => (
                    <article key={row.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block text-sm font-semibold text-textStrong">{row.title}</strong>
                          <span className="mt-1 block text-helper text-textMuted">{formatShortDate(row.requestedAt)}</span>
                        </div>
                        <StatusPill value={row.status} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-5 text-sm leading-6 text-textMuted">No originator document requests are open.</p>
              )}
            </div>
          </div>
        </div>

        {recentEvents.length ? (
          <div className="rounded-[10px] border border-borderDefault bg-surface p-4">
          <div className="flex items-center gap-2">
            <Clock3 size={16} className="text-primary" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-textStrong">Recent Updates</h4>
          </div>
          <ol className="mt-3 space-y-3">
            {recentEvents.map((event) => (
              <li key={event.id || `${event.title}-${event.occurredAt}`} className="border-l-2 border-primarySoft pl-3">
                <strong className="block text-sm font-semibold text-textStrong">{event.title}</strong>
                {event.summary ? <span className="mt-1 block text-sm leading-5 text-textMuted">{event.summary}</span> : null}
                <span className="mt-1 block text-helper text-textMuted">{formatDateTime(event.occurredAt)}</span>
              </li>
            ))}
          </ol>
          </div>
        ) : null}
      </div>

      <p className="mt-4 rounded-[10px] border border-borderDefault bg-mutedBg px-4 py-3 text-sm leading-6 text-textMuted">
        Arch9 shows the progress supplied through the originator process. Bank decisions, offer records and grants remain governed by the bond originator and existing finance workflows.
      </p>
    </section>
  )
}

export default BondOriginatorAgentProgressView
