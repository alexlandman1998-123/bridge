import { ArrowLeft, Home, MapPin, Printer, RefreshCw, User2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import PageActionBar from '../components/PageActionBar'
import ProgressTimeline from '../components/ProgressTimeline'
import SharedTransactionShell from '../components/SharedTransactionShell'
import StageAgingChip from '../components/StageAgingChip'
import AttorneyStageWorkflowPanel from '../components/AttorneyStageWorkflowPanel'
import AttorneyCloseoutPanel from '../components/AttorneyCloseoutPanel'
import TransactionProgressPanel from '../components/TransactionProgressPanel'
import { getAttorneyMockTransactionDetail } from '../core/transactions/attorneyMockData'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { getReportNextAction } from '../core/transactions/reportNextAction'
import { addTransactionDiscussionComment, fetchTransactionById, updateTransactionSubprocessStep } from '../lib/api'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildPropertyAddress(transaction) {
  return [
    transaction?.property_address_line_1,
    transaction?.property_address_line_2,
    transaction?.suburb,
    transaction?.city,
    transaction?.province,
    transaction?.postal_code,
  ]
    .filter(Boolean)
    .join(', ')
}

function toTitle(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function AttorneyTransactionDetail() {
  const navigate = useNavigate()
  const { transactionId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState('overview')
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const workflowPanelRef = useRef(null)
  const documentsPanelRef = useRef(null)

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const detail = String(transactionId || '').startsWith('mock-trx-')
        ? getAttorneyMockTransactionDetail(transactionId)
        : await fetchTransactionById(transactionId)
      setData(detail)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load transaction.')
    } finally {
      setLoading(false)
    }
  }, [transactionId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (data?.unit?.id && !String(transactionId || '').startsWith('mock-trx-')) {
      navigate(`/units/${data.unit.id}`, {
        replace: true,
        state: { headerTitle: `Unit ${data.unit.unit_number}` },
      })
    }
  }, [data, navigate, transactionId])

  const transaction = data?.transaction || null
  const buyer = data?.buyer || null
  const development = data?.development || null
  const unit = data?.unit || null
  const documents = data?.documents || []
  const requiredDocumentChecklist = data?.requiredDocumentChecklist || []
  const transactionDiscussion = data?.transactionDiscussion || []
  const transactionEvents = data?.transactionEvents || []
  const transactionSubprocesses = data?.transactionSubprocesses || data?.subprocesses || []
  const attorneyWorkflowSubprocesses = transactionSubprocesses.filter((process) => process?.process_type === 'attorney')
  const propertyAddress = useMemo(() => {
    const explicitAddress = buildPropertyAddress(transaction)
    if (explicitAddress) return explicitAddress
    if (String(transaction?.transaction_type || '').toLowerCase() === 'development') {
      return [development?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null].filter(Boolean).join(' • ')
    }
    return ''
  }, [development?.name, transaction, unit?.unit_number])
  const nextAction = useMemo(() => (transaction ? getReportNextAction(data) : 'No next action set'), [data, transaction])
  const mainStage = useMemo(
    () => data?.mainStage || getMainStageFromDetailedStage(transaction?.stage || 'Available'),
    [data?.mainStage, transaction?.stage],
  )
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || toTitle(transaction?.stage || 'Available')
  const purchasePriceValue = Number(transaction?.purchase_price || transaction?.sales_price || unit?.price || 0)
  const matterHeadline =
    String(transaction?.transaction_type || '').toLowerCase() === 'development'
      ? `${development?.name || 'Development'}${unit?.unit_number ? ` • Unit ${unit.unit_number}` : ''}`
      : transaction?.property_description || transaction?.property_address_line_1 || 'Private Property Transaction'
  const subtitleLine =
    buyer?.name ||
    (String(transaction?.transaction_type || '').toLowerCase() === 'development' ? 'Buyer not assigned yet' : 'Client not assigned yet')
  const matterReference = transaction?.transaction_reference || `TRX-${String(transaction?.id || '').slice(0, 8).toUpperCase()}`
  const financeTypeLabel = toTitle(normalizeFinanceType(transaction?.finance_type || 'cash'))
  const matterTypeLabel = String(transaction?.transaction_type || '').toLowerCase() === 'development' ? 'Development Matter' : 'Private Matter'
  const documentReadinessText = requiredDocumentChecklist.length
    ? `${documents.length}/${requiredDocumentChecklist.length} uploaded`
    : documents.length
      ? `${documents.length} files uploaded`
      : 'No requirements configured'
  const workspaceMenus = [
    { id: 'overview', label: 'Overview', meta: matterTypeLabel },
    { id: 'progress', label: 'Progress', meta: mainStageLabel },
    { id: 'client', label: 'Client Information', meta: buyer?.name || 'Client record' },
    { id: 'documents', label: 'Documents', meta: `${documents.length} files` },
    { id: 'activity', label: 'Activity', meta: `${transactionDiscussion.length + transactionEvents.length} updates` },
    { id: 'closeout', label: 'Close-Out', meta: 'Fees & invoice' },
  ]
  const activeWorkspaceMenu = workspaceMenus.some((tab) => tab.id === workspaceMenu) ? workspaceMenu : 'overview'
  const activityFeed = [
    ...transactionEvents.map((event) => ({
      id: `event-${event.id}`,
      title: event.title || toTitle(event.event_type || 'Update'),
      body: event.body || 'Transaction event recorded.',
      createdAt: event.created_at,
      kind: 'event',
    })),
    ...transactionDiscussion.map((comment) => ({
      id: `comment-${comment.id}`,
      title: `${comment.authorName || 'Participant'} • ${comment.authorRoleLabel || toTitle(comment.authorRole || 'Participant')}`,
      body: comment.commentBody || comment.commentText || 'Comment added.',
      createdAt: comment.createdAt || comment.created_at,
      kind: 'comment',
    })),
  ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
  const clientInfoEntries = Object.entries(data?.onboardingFormData?.formData || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))

  async function handleSaveStep(payload) {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')

      if (String(transactionId || '').startsWith('mock-trx-')) {
        setData((previous) => {
          if (!previous) return previous
          const nextDiscussion =
            payload.shareToDiscussion && payload.userComment?.trim()
              ? [
                  {
                    id: `${transaction.id}-comment-${Date.now()}`,
                    authorName: 'Bridge Conveyancing',
                    authorRole: 'attorney',
                    authorRoleLabel: 'Attorney / Conveyancer',
                    discussionType: 'operational',
                    commentBody: `${payload.stepLabel || 'Workflow step'}: ${payload.userComment.trim()}`,
                    createdAt: new Date().toISOString(),
                  },
                  ...(previous.transactionDiscussion || []),
                ]
              : previous.transactionDiscussion || []

          const nextProcesses = (previous.transactionSubprocesses || previous.subprocesses || []).map((process) => {
            const processMatch =
              (payload.subprocessId && process.id === payload.subprocessId) ||
              process.transaction_id === payload.transactionId ||
              !payload.subprocessId

            if (!processMatch) return process

            const nextSteps = (process.steps || []).map((step) =>
              step.id === payload.stepId
                ? {
                    ...step,
                    status: payload.status,
                    comment: payload.comment,
                    completed_at: payload.completedAt || step.completed_at,
                  }
                : step,
            )

            const completedSteps = nextSteps.filter((step) => step.status === 'completed').length
            return {
              ...process,
              steps: nextSteps,
              summary: {
                ...(process.summary || {}),
                totalSteps: nextSteps.length,
                completedSteps,
              },
            }
          })

          return {
            ...previous,
            transactionSubprocesses: nextProcesses,
            subprocesses: nextProcesses,
            transactionDiscussion: nextDiscussion,
          }
        })
        return
      }

      await updateTransactionSubprocessStep({
        ...payload,
        actorRole: 'attorney',
      })

      if (payload.shareToDiscussion && payload.userComment?.trim()) {
        await addTransactionDiscussionComment({
          transactionId: transaction.id,
          authorName: 'Bridge Conveyancing',
          authorRole: 'attorney',
          commentText: `[operational][shared] ${payload.stepLabel || 'Workflow step'}: ${payload.userComment.trim()}`,
          unitId: unit?.id || null,
        })
      }

      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to update workflow step.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDiscussion(event) {
    event.preventDefault()

    if (!transaction?.id || !discussionBody.trim()) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const normalizedDiscussion = discussionBody.trim()
      const prefixedDiscussion = normalizedDiscussion.match(/^\[[a-z_ ]+\]/i)
        ? normalizedDiscussion
        : `[${discussionType}] ${normalizedDiscussion}`

      if (String(transactionId || '').startsWith('mock-trx-')) {
        setData((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            transactionDiscussion: [
              {
                id: `${transaction.id}-comment-${Date.now()}`,
                authorName: 'Bridge Conveyancing',
                authorRole: 'attorney',
                authorRoleLabel: 'Attorney / Conveyancer',
                discussionType,
                commentBody: normalizedDiscussion,
                createdAt: new Date().toISOString(),
              },
              ...(previous.transactionDiscussion || []),
            ],
          }
        })
      } else {
        await addTransactionDiscussionComment({
          transactionId: transaction.id,
          authorName: 'Bridge Conveyancing',
          authorRole: 'attorney',
          commentText: prefixedDiscussion,
          unitId: unit?.id || null,
        })
        await loadData()
      }

      setDiscussionBody('')
    } catch (saveError) {
      setError(saveError.message || 'Unable to post update.')
    } finally {
      setSaving(false)
    }
  }

  function scrollToSection(ref) {
    ref?.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function handleOpenAttorneyWorkflowFromProgress() {
    setWorkspaceMenu('overview')
    window.setTimeout(() => {
      scrollToSection(workflowPanelRef)
    }, 0)
  }

  function handleOpenDocumentsFromProgress() {
    setWorkspaceMenu('documents')
    window.setTimeout(() => {
      scrollToSection(documentsPanelRef)
    }, 0)
  }

  if (!isSupabaseConfigured) {
    return <p className="status-message error">Supabase is not configured for this workspace.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (!data || !transaction) {
    return <p className="status-message error">Transaction not found.</p>
  }

  return (
    <SharedTransactionShell
      printTitle="Attorney Matter Report"
      printSubtitle={matterHeadline}
      printGeneratedAt={formatDate(new Date().toISOString())}
      errorMessage={error}
      toolbar={(
        <PageActionBar
          actions={[
            {
              id: 'back',
              label: 'Back to transactions',
              variant: 'ghost',
              icon: <ArrowLeft size={14} />,
              onClick: () => navigate('/transactions'),
            },
            {
              id: 'refresh',
              label: 'Refresh',
              variant: 'primary',
              icon: <RefreshCw size={14} />,
              onClick: loadData,
              disabled: loading,
            },
          ]}
        />
      )}
      headline={(
        <section className="panel unit-headline">
          <div className="unit-headline-top no-print">
            <Link to="/transactions" className="back-link">
              <ArrowLeft size={14} />
              Back to Transactions
            </Link>

            <div className="unit-headline-actions">
              <button type="button" className="ghost-button unit-headline-action-secondary" onClick={() => window.print()}>
                <Printer size={14} />
                Print Report
              </button>
            </div>
          </div>

          <div className="unit-headline-main">
            <span className="unit-headline-kicker">Transaction Workspace</span>
            <h1>{matterHeadline}</h1>
            <p className="unit-header-subtitle">{subtitleLine}</p>
          </div>

          <div className="unit-headline-identity-grid">
            <article className="unit-headline-identity-card">
              <span>Current Stage</span>
              <strong>{mainStageLabel}</strong>
            </article>
            <article className="unit-headline-identity-card">
              <span>Purchase Price</span>
              <strong>{currency.format(purchasePriceValue || 0)}</strong>
            </article>
            <article className="unit-headline-identity-card">
              <span>Matter Type</span>
              <strong>{matterTypeLabel}</strong>
            </article>
            <article className="unit-headline-identity-card">
              <span>Time In Stage</span>
              <div className="unit-context-stage-age">
                <StageAgingChip stage={transaction.stage} updatedAt={transaction.updated_at || transaction.created_at} />
              </div>
            </article>
          </div>
        </section>
      )}
    >
      <div className="transaction-cockpit">
        <section className="panel-section unit-main-timeline-panel">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Main Deal Timeline</h3>
              <p>High-level process visibility from instruction through registration.</p>
            </div>
          </div>
          <ProgressTimeline currentStage={mainStage} stages={MAIN_PROCESS_STAGES} stageLabelMap={MAIN_STAGE_LABELS} />
        </section>

        <section className="panel-section no-print rounded-[18px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#fbfdff_0%,#f4f8fc_100%)] p-4 shadow-[0_14px_28px_rgba(15,23,42,0.05)]">
          <div className="grid gap-1">
            <h3>Transaction Workspace</h3>
            <p>Shared structure with the developer transaction workspace, adapted for attorney matters.</p>
          </div>
          <div
            className="mt-4 grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
            role="tablist"
            aria-label="Attorney transaction workspace tabs"
          >
            {workspaceMenus.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeWorkspaceMenu === tab.id}
                className={
                  activeWorkspaceMenu === tab.id
                    ? 'min-h-[88px] rounded-[16px] border border-[#2f5168] bg-[linear-gradient(160deg,#36576f_0%,#2d4c61_100%)] px-4 py-3 text-left text-[#f8fbff] shadow-[0_16px_28px_rgba(22,38,52,0.18)] transition'
                    : 'min-h-[88px] rounded-[16px] border border-[#d7e3ef] bg-white/90 px-4 py-3 text-left text-[#304256] shadow-[0_10px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-[1px] hover:border-[#c5d5e6] hover:bg-white hover:shadow-[0_14px_24px_rgba(15,23,42,0.07)]'
                }
                onClick={() => setWorkspaceMenu(tab.id)}
              >
                <span className="block text-[0.92rem] font-semibold">{tab.label}</span>
                {tab.meta ? (
                  <em className={`mt-1 block text-[0.72rem] not-italic ${activeWorkspaceMenu === tab.id ? 'text-[#c8d8e8]' : 'text-[#7a8798]'}`}>
                    {tab.meta}
                  </em>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        {activeWorkspaceMenu === 'overview' ? (
          <>
            <section className="panel-section grid gap-4">
              <div className="section-header">
                <div className="section-header-copy">
                  <h3>Matter Overview</h3>
                  <p>Operational summary, file context, and the next required move in one place.</p>
                </div>
                <span className="client-stage-explainer-chip">{mainStageLabel}</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <article className="grid gap-1 rounded-[14px] border border-[#e6ebf2] bg-[#fbfcff] px-4 py-4">
                  <span className="block text-[0.74rem] font-semibold uppercase tracking-[0.04em] text-[#667085]">Current Matter Status</span>
                  <strong className="text-[1.04rem] leading-[1.32] text-[#0f172a]">{toTitle(transaction.stage || 'Available')}</strong>
                  <p className="m-0 text-[0.84rem] leading-[1.45] text-[#1f2937]">
                    {String(transaction.transaction_type || '').toLowerCase() === 'development'
                      ? 'Development-linked conveyancing matter currently active in the attorney workspace.'
                      : 'Standalone private property transfer being managed directly by the firm.'}
                  </p>
                </article>
                <article className="grid gap-1 rounded-[14px] border border-[#cfe0f3] bg-[linear-gradient(180deg,#f7fbff_0%,#f0f7ff_100%)] px-4 py-4">
                  <span className="block text-[0.74rem] font-semibold uppercase tracking-[0.04em] text-[#667085]">Next Action</span>
                  <strong className="text-[1.04rem] leading-[1.32] text-[#0f172a]">{nextAction}</strong>
                  <p className="m-0 text-[0.84rem] leading-[1.45] text-[#1f2937]">Use this as the immediate operational focus to move the matter forward.</p>
                </article>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[12px] border border-[#e6ebf2] bg-white px-4 py-3">
                  <span className="block text-[0.73rem] font-semibold uppercase tracking-[0.04em] text-[#667085]">Matter Reference</span>
                  <strong className="mt-1 block text-[0.95rem] leading-[1.35] text-[#111827]">{matterReference}</strong>
                </article>
                <article className="rounded-[12px] border border-[#e6ebf2] bg-white px-4 py-3">
                  <span className="block text-[0.73rem] font-semibold uppercase tracking-[0.04em] text-[#667085]">Responsible Attorney</span>
                  <strong className="mt-1 block text-[0.95rem] leading-[1.35] text-[#111827]">{transaction.matter_owner || transaction.attorney || 'Attorney team'}</strong>
                </article>
                <article className="rounded-[12px] border border-[#e6ebf2] bg-white px-4 py-3">
                  <span className="block text-[0.73rem] font-semibold uppercase tracking-[0.04em] text-[#667085]">Expected Transfer</span>
                  <strong className="mt-1 block text-[0.95rem] leading-[1.35] text-[#111827]">{formatDate(transaction.expected_transfer_date)}</strong>
                </article>
                <article className="rounded-[12px] border border-[#e6ebf2] bg-white px-4 py-3">
                  <span className="block text-[0.73rem] font-semibold uppercase tracking-[0.04em] text-[#667085]">Document Readiness</span>
                  <strong className="mt-1 block text-[0.95rem] leading-[1.35] text-[#111827]">{documentReadinessText}</strong>
                </article>
              </div>
            </section>

            <div className="unit-overview-layout">
              <section className="panel-section unit-overview-snapshot-panel">
                <div className="section-header">
                  <div className="section-header-copy">
                    <h3>Property & Deal Context</h3>
                    <p>The core matter record using the same content hierarchy as the developer workspace.</p>
                  </div>
                </div>

                <div className="unit-operational-grid">
                  <article>
                    <span>Client</span>
                    <strong>{buyer?.name || 'Client not captured'}</strong>
                    <em>{buyer?.email || buyer?.phone || 'Contact details not captured'}</em>
                  </article>
                  <article>
                    <span>Purchase Price</span>
                    <strong>{currency.format(purchasePriceValue || 0)}</strong>
                    <em>{financeTypeLabel}</em>
                  </article>
                  <article>
                    <span>Property Context</span>
                    <strong>{propertyAddress || matterHeadline}</strong>
                    <em>{matterTypeLabel}</em>
                  </article>
                  <article>
                    <span>Linked Development</span>
                    <strong>{development?.name || 'Not development-linked'}</strong>
                    <em>{unit?.unit_number ? `Unit ${unit.unit_number}` : 'Standalone property matter'}</em>
                  </article>
                  <article>
                    <span>Last Updated</span>
                    <strong>{formatDate(transaction.updated_at || transaction.created_at)}</strong>
                    <em>{toTitle(transaction.status || 'active')}</em>
                  </article>
                </div>
              </section>

              <aside ref={workflowPanelRef} className="panel-section no-print unit-role-assignments-panel">
                <div className="section-header">
                  <div className="section-header-copy">
                    <h3>Attorney Workflow</h3>
                    <p>Update step progress directly from the matter overview as work is completed.</p>
                  </div>
                </div>

                <AttorneyStageWorkflowPanel
                  subprocesses={attorneyWorkflowSubprocesses}
                  documents={documents}
                  saving={saving}
                  disabled={!transaction?.id}
                  onSaveStep={handleSaveStep}
                  onDocumentUploaded={loadData}
                  onOpenDocuments={() => setWorkspaceMenu('documents')}
                />
              </aside>
            </div>
          </>
        ) : null}

        {activeWorkspaceMenu === 'progress' ? (
          <TransactionProgressPanel
            title="Matter Progress"
            subtitle="A combined look at every workflow milestone and the most recent updates."
            mainStage={mainStage}
            subprocesses={transactionSubprocesses}
            comments={activityFeed.slice(0, 6).map((entry) => ({
              id: entry.id,
              authorName: entry.title,
              commentBody: entry.body,
              createdAt: entry.createdAt,
              discussionType: entry.kind || 'update',
            }))}
          />
        ) : null}

        {activeWorkspaceMenu === 'client' ? (
          <div className="unit-overview-layout">
            <section className="panel-section unit-overview-snapshot-panel">
              <div className="section-header">
                <div className="section-header-copy">
                  <h3>Client Information</h3>
                  <p>Purchaser contact details and submitted onboarding information for this matter.</p>
                </div>
              </div>

              <div className="unit-operational-grid">
                <article>
                  <span>Client Name</span>
                  <strong>{buyer?.name || 'Client not captured'}</strong>
                  <em>{matterTypeLabel}</em>
                </article>
                <article>
                  <span>Email</span>
                  <strong>{buyer?.email || 'Not set'}</strong>
                  <em>Primary email</em>
                </article>
                <article>
                  <span>Phone</span>
                  <strong>{buyer?.phone || 'Not set'}</strong>
                  <em>Primary contact number</em>
                </article>
                <article>
                  <span>Property</span>
                  <strong>{propertyAddress || matterHeadline}</strong>
                  <em>{transaction?.property_description || 'Property context'}</em>
                </article>
              </div>
            </section>

            <aside className="panel-section no-print unit-role-assignments-panel">
              <div className="section-header">
                <div className="section-header-copy">
                  <h3>Submitted Information</h3>
                  <p>Information captured from onboarding or stored directly on the matter.</p>
                </div>
              </div>

              {clientInfoEntries.length ? (
                <div className="development-hub-sidebar-list">
                  {clientInfoEntries.map(([key, value]) => (
                    <div key={key}>
                      <span>{toTitle(key)}</span>
                      <strong>{Array.isArray(value) ? value.join(', ') : String(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="development-hub-sidebar-list">
                  <div>
                    <span><User2 size={14} /> Client Contact</span>
                    <strong>{buyer?.email || buyer?.phone || 'Not set'}</strong>
                  </div>
                  <div>
                    <span><MapPin size={14} /> Property Context</span>
                    <strong>{propertyAddress || matterHeadline}</strong>
                  </div>
                  <div>
                    <span><Home size={14} /> Matter Type</span>
                    <strong>{matterTypeLabel}</strong>
                  </div>
                </div>
              )}
            </aside>
          </div>
        ) : null}

        {activeWorkspaceMenu === 'documents' ? (
          <>
            <section ref={documentsPanelRef} className="panel-section attorney-operational-panel">
              <div className="section-header">
                <div className="section-header-copy">
                  <h3>Document Groups</h3>
                  <p>Attorney-facing document overview in the same grouped layout used by the transaction workspace.</p>
                </div>
              </div>

              <div className="attorney-finance-grid">
                <article>
                  <span>Uploaded Documents</span>
                  <strong>{documents.length}</strong>
                </article>
                <article>
                  <span>Required Documents</span>
                  <strong>{requiredDocumentChecklist.length}</strong>
                </article>
                <article>
                  <span>Readiness</span>
                  <strong>{documentReadinessText}</strong>
                </article>
              </div>

              <div className="unit-document-groups-grid">
                <article className="workspace-share-panel">
                  <div className="section-header-copy">
                    <h4>Uploaded Documents</h4>
                    <p>Transaction files already attached to this matter.</p>
                  </div>
                  {documents.length ? (
                    <ul className="unit-document-list">
                      {documents.slice(0, 8).map((document) => (
                        <li key={document.id}>
                          <strong>{document.name || 'Untitled document'}</strong>
                          <span>{document.category || 'General'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-text">No documents uploaded yet.</p>
                  )}
                </article>

                <article className="workspace-share-panel">
                  <div className="section-header-copy">
                    <h4>Required Checklist</h4>
                    <p>Outstanding document requirements for this file.</p>
                  </div>
                  {requiredDocumentChecklist.length ? (
                    <ul className="unit-document-list">
                      {requiredDocumentChecklist.map((item) => (
                        <li key={item.id}>
                          <strong>{item.label}</strong>
                          <span>{item.complete ? 'Complete' : 'Outstanding'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-text">No document checklist configured yet.</p>
                  )}
                </article>
              </div>
            </section>
          </>
        ) : null}

        {activeWorkspaceMenu === 'activity' ? (
          <section className="panel-section unit-shared-updates-panel">
            <div className="section-header">
              <div className="section-header-copy">
                <h3>Comments & Updates</h3>
                <p>Latest matter activity, commentary, and workflow events for this transaction.</p>
              </div>
            </div>

            <div className="workspace-discussion-list">
              {activityFeed.map((entry) => (
                <article key={entry.id} className="workspace-discussion-item">
                  <div className="workspace-discussion-body">
                    <header>
                      <div className="workspace-discussion-author">
                        <strong>{entry.title}</strong>
                        <span>{entry.kind === 'comment' ? 'Shared update' : 'Workflow event'}</span>
                      </div>
                      <small className={`workspace-discussion-type ${entry.kind === 'comment' ? 'operational' : 'decision'}`}>
                        {entry.kind === 'comment' ? 'Comment' : 'Event'}
                      </small>
                      <em>{formatDateTime(entry.createdAt)}</em>
                    </header>
                    <p>{entry.body}</p>
                  </div>
                </article>
              ))}
              {!activityFeed.length ? <p className="empty-text">No activity logged for this matter yet.</p> : null}
            </div>

            <form onSubmit={handleAddDiscussion} className="stack-form compact-note-form workspace-compose-form no-print">
              <div className="workspace-compose-head">
                <label>
                  Update Type
                  <select value={discussionType} onChange={(event) => setDiscussionType(event.target.value)}>
                    <option value="operational">Operational</option>
                    <option value="blocker">Blocker</option>
                    <option value="document">Document</option>
                    <option value="decision">Decision</option>
                    <option value="client">Client</option>
                  </select>
                </label>
                <button type="submit" disabled={saving || !discussionBody.trim()}>
                  Post Update
                </button>
              </div>
              <textarea
                rows={4}
                value={discussionBody}
                onChange={(event) => setDiscussionBody(event.target.value)}
                placeholder="Add a concise update for the shared transaction workspace..."
              />
            </form>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'closeout' ? (
          <AttorneyCloseoutPanel transaction={transaction} unit={unit} buyer={buyer} visible />
        ) : null}

        <section className="panel-section no-print unit-secondary-client">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Workspace Actions</h3>
              <p>Quick file actions without leaving the shared transaction shell.</p>
            </div>
          </div>

          <div className="unit-access-actions">
            {development?.id ? (
              <button type="button" className="ghost-button" onClick={() => navigate(`/developments/${development.id}`)}>
                Open Development
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={() => setWorkspaceMenu('documents')}>
              View Documents
            </button>
            <button type="button" className="ghost-button" onClick={() => setWorkspaceMenu('activity')}>
              View Activity
            </button>
            <button type="button" className="ghost-button" onClick={() => window.print()}>
              Print Matter Summary
            </button>
          </div>
        </section>
      </div>
    </SharedTransactionShell>
  )
}

export default AttorneyTransactionDetail
