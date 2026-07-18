import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileText,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  createMatterFinancialDocumentRequest,
  fetchMatterFinancialAccounts,
  publishMatterFinancialDocument,
  recordMatterFinancialEntry,
  reconcileMatterFinancialProofDocument,
  registerMatterFinancialDocument,
  reverseMatterFinancialEntry,
  updateMatterFinancialDocumentRequestStatus,
  updateMatterFinancialAccountPaymentInstructions,
  updateMatterFinancialAccountPortal,
} from '../lib/api'
import { downloadMatterFinancialStatement } from '../core/attorneyAccounting/matterAccountStatement'
import {
  downloadMatterFinancialSubmissionPack,
  summarizeMatterFinancialSubmissionPack,
} from '../core/attorneyAccounting/matterAccountSubmissionPack'
import Button from './ui/Button'
import Field from './ui/Field'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
})

const DOCUMENT_TYPE_OPTIONS = [
  ['invoice', 'Invoice'],
  ['statement', 'Statement'],
  ['receipt', 'Receipt'],
  ['proof_of_payment', 'Proof of payment'],
  ['credit_note', 'Credit note'],
  ['debit_note', 'Debit note'],
  ['other', 'Other'],
]

const ENTRY_TYPE_OPTIONS = [
  ['payment', 'Payment received'],
  ['charge', 'Charge / invoice amount'],
  ['credit', 'Credit'],
  ['debit', 'Debit'],
  ['adjustment', 'Adjustment'],
  ['write_off', 'Write-off'],
]

const STATUS_CLASSES = {
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  superseded: 'border-slate-200 bg-slate-50 text-slate-600',
  void: 'border-rose-200 bg-rose-50 text-rose-700',
  reversed: 'border-rose-200 bg-rose-50 text-rose-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  requested: 'border-sky-200 bg-sky-50 text-sky-700',
  submitted: 'border-amber-200 bg-amber-50 text-amber-700',
  awaiting_review: 'border-amber-200 bg-amber-50 text-amber-700',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
}

function formatCurrency(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? currency.format(parsed) : currency.format(0)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function title(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusClass(status) {
  return STATUS_CLASSES[status] || 'border-borderSoft bg-surfaceAlt text-textMuted'
}

function readinessClass(status) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'attention') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'blocked') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-borderSoft bg-surfaceAlt text-textMuted'
}

function followUpClass(urgency) {
  if (urgency === 'overdue') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (urgency === 'resubmission') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (urgency === 'due_soon') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-borderSoft bg-surfaceAlt text-textMuted'
}

function emptyDocumentDraft(account = null) {
  return {
    documentType: 'invoice',
    audienceRole: account?.partyRole || 'internal',
    title: '',
    externalReference: '',
    amountTotal: '',
    amountDue: '',
    issuedOn: '',
    dueOn: '',
    notes: '',
    publishNow: false,
  }
}

function emptyEntryDraft() {
  return {
    entryType: 'payment',
    amount: '',
    occurredOn: new Date().toISOString().slice(0, 10),
    description: '',
    clientVisible: true,
  }
}

function emptyRequestDraft(account = null) {
  return {
    requestType: 'proof_of_payment',
    audienceRole: account?.partyRole || 'client',
    title: '',
    externalReference: '',
    amountDue: '',
    dueOn: '',
    description: '',
    portalVisible: true,
  }
}

function emptyProofReviewDraft(document = {}) {
  const reference = document.externalReference || document.title || 'proof of payment'
  return {
    amount: document.amountTotal || document.amountDue || '',
    occurredOn: document.issuedOn || new Date().toISOString().slice(0, 10),
    description: `Payment received - ${reference}`,
    reviewNotes: '',
  }
}

function emptyPaymentInstructionDraft(account = {}) {
  const instructions = account.paymentInstructions || {}
  return {
    accountHolder: instructions.accountHolder || '',
    bankName: instructions.bankName || '',
    accountNumber: instructions.accountNumber || '',
    branchCode: instructions.branchCode || '',
    accountType: instructions.accountType || '',
    paymentReference: instructions.paymentReference || '',
    instructions: instructions.instructions || '',
    published: instructions.published === true,
  }
}

function proofNeedsAttorneyReview(document = {}) {
  return (
    document.documentType === 'proof_of_payment' &&
    document.metadata?.requiresAttorneyReview === true &&
    document.metadata?.reviewStatus !== 'posted' &&
    !document.metadata?.postedEntryId
  )
}

function proofIsReconciled(document = {}) {
  return document.documentType === 'proof_of_payment' && (document.metadata?.reviewStatus === 'posted' || Boolean(document.metadata?.postedEntryId))
}

function accountEventLabel(event = {}) {
  const payload = event.payload || {}
  const labels = {
    account_bootstrapped: 'Account created',
    financial_accounts_bootstrapped: 'Account created',
    financial_document_uploaded_as_draft: 'Document uploaded as draft',
    financial_document_uploaded_and_published: 'Document uploaded and published',
    financial_document_published: 'Document published',
    financial_entry_posted: 'Ledger entry posted',
    financial_entry_reversed: 'Ledger entry reversed',
    financial_account_portal_enabled: 'Portal enabled',
    financial_account_portal_disabled: 'Portal paused',
    payment_instructions_saved: 'Payment instructions saved',
    payment_instructions_published: 'Payment instructions published',
    finance_document_request_created: 'Finance request created',
    finance_document_request_status_updated: 'Finance request updated',
    client_finance_request_document_uploaded: 'Requested document uploaded',
    client_payment_proof_uploaded: 'Client proof uploaded',
    client_payment_proof_posted: 'Client proof posted to ledger',
  }
  return payload.title || payload.description || labels[event.eventType] || title(event.eventType)
}

function accountEventDetail(event = {}) {
  const payload = event.payload || {}
  if (payload.amount) return `${title(event.eventType)} · ${formatCurrency(payload.amount)}`
  if (payload.documentType) return `${title(payload.documentType)} · ${payload.audienceRole ? title(payload.audienceRole) : title(event.eventVisibility)}`
  return `${title(event.eventType)} · ${title(event.eventVisibility)}`
}

export default function AttorneyMatterAccountsPanel({ transactionId, buyerName = 'Buyer', sellerName = 'Seller' }) {
  const [accounts, setAccounts] = useState([])
  const [summary, setSummary] = useState(null)
  const [reviewQueue, setReviewQueue] = useState([])
  const [reviewQueueSummary, setReviewQueueSummary] = useState(null)
  const [followUps, setFollowUps] = useState([])
  const [followUpSummary, setFollowUpSummary] = useState(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [documentDraft, setDocumentDraft] = useState(emptyDocumentDraft())
  const [requestDraft, setRequestDraft] = useState(emptyRequestDraft())
  const [entryDraft, setEntryDraft] = useState(emptyEntryDraft())
  const [proofReviewDrafts, setProofReviewDrafts] = useState({})
  const [paymentInstructionDrafts, setPaymentInstructionDrafts] = useState({})
  const [documentFile, setDocumentFile] = useState(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [unavailableMessage, setUnavailableMessage] = useState('')

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || accounts[0] || null,
    [accounts, selectedAccountId],
  )
  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const submissionPackSummary = useMemo(
    () => summarizeMatterFinancialSubmissionPack(accounts, { reviewQueue, followUps }),
    [accounts, followUps, reviewQueue],
  )

  async function loadAccounts({ background = false } = {}) {
    if (!transactionId) return
    try {
      if (!background) setLoading(true)
      setError('')
      const result = await fetchMatterFinancialAccounts(transactionId)
      setAccounts(result.accounts || [])
      setSummary(result.summary || null)
      setReviewQueue(result.reviewQueue || [])
      setReviewQueueSummary(result.reviewQueueSummary || null)
      setFollowUps(result.followUps || [])
      setFollowUpSummary(result.followUpSummary || null)
      setUnavailableMessage(result.unavailable ? result.message || 'Matter accounting is not set up yet.' : '')
      const nextSelectedId =
        selectedAccountId && result.accounts?.some((account) => account.id === selectedAccountId)
          ? selectedAccountId
          : result.accounts?.[0]?.id || ''
      setSelectedAccountId(nextSelectedId)
      const nextSelectedAccount = result.accounts?.find((account) => account.id === nextSelectedId) || result.accounts?.[0] || null
      setDocumentDraft((draft) => ({
        ...draft,
        audienceRole: nextSelectedAccount?.partyRole || draft.audienceRole || 'internal',
      }))
      setRequestDraft((draft) => ({
        ...draft,
        audienceRole: nextSelectedAccount?.partyRole || draft.audienceRole || 'client',
      }))
    } catch (loadError) {
      setAccounts([])
      setSummary(null)
      setReviewQueue([])
      setReviewQueueSummary(null)
      setFollowUps([])
      setFollowUpSummary(null)
      setError(loadError?.message || 'Unable to load buyer/seller accounts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId])

  function handleSelectAccount(nextAccountId) {
    const account = accounts.find((item) => item.id === nextAccountId) || null
    setSelectedAccountId(nextAccountId)
    setDocumentDraft((draft) => ({
      ...draft,
      audienceRole: account?.partyRole || draft.audienceRole || 'internal',
    }))
    setRequestDraft((draft) => ({
      ...draft,
      audienceRole: account?.partyRole || draft.audienceRole || 'client',
    }))
  }

  async function handleUploadDocument(event) {
    event.preventDefault()
    if (!selectedAccount?.id) {
      setError('Choose a buyer or seller account first.')
      return
    }
    if (!documentFile) {
      setError('Select the invoice, statement, or proof file to upload.')
      return
    }

    try {
      setBusyAction('upload-document')
      setError('')
      setMessage('')
      await registerMatterFinancialDocument({
        accountId: selectedAccount.id,
        transactionId,
        file: documentFile,
        ...documentDraft,
      })
      setMessage(documentDraft.publishNow ? 'Document uploaded and published to the account.' : 'Document uploaded as a draft.')
      setDocumentDraft(emptyDocumentDraft(selectedAccount))
      setDocumentFile(null)
      setFileInputKey((key) => key + 1)
      await loadAccounts({ background: true })
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload this financial document.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleCreateRequest(event) {
    event.preventDefault()
    if (!selectedAccount?.id) {
      setError('Choose a buyer or seller account first.')
      return
    }

    try {
      setBusyAction('create-request')
      setError('')
      setMessage('')
      await createMatterFinancialDocumentRequest({
        accountId: selectedAccount.id,
        transactionId,
        ...requestDraft,
      })
      setMessage('Finance document request published to the buyer/seller checklist.')
      setRequestDraft(emptyRequestDraft(selectedAccount))
      await loadAccounts({ background: true })
    } catch (requestError) {
      setError(requestError?.message || 'Unable to create this finance document request.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleUpdateRequestStatus(request, requestStatus, reviewNotes = '') {
    if (!request?.id) return
    try {
      setBusyAction(`request-${requestStatus}-${request.id}`)
      setError('')
      setMessage('')
      await updateMatterFinancialDocumentRequestStatus({
        requestId: request.id,
        transactionId,
        requestStatus,
        reviewNotes,
      })
      setMessage(`Request marked ${title(requestStatus)}.`)
      await loadAccounts({ background: true })
    } catch (requestError) {
      setError(requestError?.message || 'Unable to update this request.')
    } finally {
      setBusyAction('')
    }
  }

  function updateProofReviewDraft(document, patch) {
    if (!document?.id) return
    setProofReviewDrafts((drafts) => ({
      ...drafts,
      [document.id]: {
        ...emptyProofReviewDraft(document),
        ...(drafts[document.id] || {}),
        ...patch,
      },
    }))
  }

  function getPaymentInstructionDraft(account) {
    return {
      ...emptyPaymentInstructionDraft(account),
      ...(paymentInstructionDrafts[account.id] || {}),
    }
  }

  function updatePaymentInstructionDraft(account, patch) {
    if (!account?.id) return
    setPaymentInstructionDrafts((drafts) => ({
      ...drafts,
      [account.id]: {
        ...emptyPaymentInstructionDraft(account),
        ...(drafts[account.id] || {}),
        ...patch,
      },
    }))
  }

  async function handleSavePaymentInstructions(account, publishToPortal = false) {
    if (!account?.id) return
    const draft = getPaymentInstructionDraft(account)
    try {
      setBusyAction(`payment-instructions-${account.id}`)
      setError('')
      setMessage('')
      await updateMatterFinancialAccountPaymentInstructions({
        accountId: account.id,
        transactionId,
        paymentInstructions: draft,
        publishToPortal,
      })
      setMessage(publishToPortal ? 'Payment instructions published to the buyer/seller portal.' : 'Payment instructions saved as an internal draft.')
      await loadAccounts({ background: true })
    } catch (instructionError) {
      setError(instructionError?.message || 'Unable to save payment instructions.')
    } finally {
      setBusyAction('')
    }
  }

  async function handlePostProofPayment(account, document) {
    if (!account?.id || !document?.id) return
    const draft = {
      ...emptyProofReviewDraft(document),
      ...(proofReviewDrafts[document.id] || {}),
    }

    try {
      setBusyAction(`proof-post-${document.id}`)
      setError('')
      setMessage('')
      await reconcileMatterFinancialProofDocument({
        documentId: document.id,
        accountId: account.id,
        transactionId,
        amount: draft.amount,
        occurredOn: draft.occurredOn,
        description: draft.description,
        reviewNotes: draft.reviewNotes,
      })
      if (document.metadata?.requestId) {
        await updateMatterFinancialDocumentRequestStatus({
          requestId: document.metadata.requestId,
          transactionId,
          requestStatus: 'complete',
          reviewNotes: draft.reviewNotes || 'Proof reviewed and payment posted.',
        })
      }
      setMessage('Payment posted from client-submitted proof of payment.')
      setProofReviewDrafts((drafts) => {
        const nextDrafts = { ...drafts }
        delete nextDrafts[document.id]
        return nextDrafts
      })
      await loadAccounts({ background: true })
    } catch (proofError) {
      setError(proofError?.message || 'Unable to post this proof of payment.')
    } finally {
      setBusyAction('')
    }
  }

  async function handlePublishDocument(document) {
    if (!document?.id) return
    try {
      setBusyAction(`publish-${document.id}`)
      setError('')
      setMessage('')
      await publishMatterFinancialDocument(document.id)
      setMessage('Document published to the selected account.')
      await loadAccounts({ background: true })
    } catch (publishError) {
      setError(publishError?.message || 'Unable to publish this document.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleRecordEntry(event) {
    event.preventDefault()
    if (!selectedAccount?.id) {
      setError('Choose a buyer or seller account first.')
      return
    }

    try {
      setBusyAction('record-entry')
      setError('')
      setMessage('')
      await recordMatterFinancialEntry({
        accountId: selectedAccount.id,
        transactionId,
        entryType: entryDraft.entryType,
        amount: entryDraft.amount,
        occurredOn: entryDraft.occurredOn,
        description: entryDraft.description,
        entryVisibility: entryDraft.clientVisible ? 'client_visible' : 'internal',
      })
      setMessage('Account entry posted.')
      setEntryDraft(emptyEntryDraft())
      await loadAccounts({ background: true })
    } catch (entryError) {
      setError(entryError?.message || 'Unable to post this account entry.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleReverseEntry(entry) {
    if (!entry?.id) return
    const confirmed = window.confirm(`Reverse this ${title(entry.entryType)} entry for ${formatCurrency(entry.amount)}?`)
    if (!confirmed) return

    try {
      setBusyAction(`reverse-${entry.id}`)
      setError('')
      setMessage('')
      await reverseMatterFinancialEntry(entry.id, { reason: 'Reversed from attorney matter accounts panel.' })
      setMessage('Entry reversed.')
      await loadAccounts({ background: true })
    } catch (reverseError) {
      setError(reverseError?.message || 'Unable to reverse this entry.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleTogglePortal(account) {
    if (!account?.id) return
    try {
      setBusyAction(`portal-${account.id}`)
      setError('')
      setMessage('')
      await updateMatterFinancialAccountPortal({
        accountId: account.id,
        transactionId,
        portalEnabled: !account.portalEnabled,
      })
      setMessage(!account.portalEnabled ? 'Portal visibility enabled for this account.' : 'Portal visibility paused for this account.')
      await loadAccounts({ background: true })
    } catch (portalError) {
      setError(portalError?.message || 'Unable to update portal visibility.')
    } finally {
      setBusyAction('')
    }
  }

  function handleDownloadStatement(account) {
    if (!account?.id) return
    try {
      downloadMatterFinancialStatement(account, {
        scope: 'attorney',
        generatedFor: 'attorney',
        includeInternal: true,
      })
      setError('')
      setMessage('Statement CSV prepared for download.')
    } catch (downloadError) {
      setError(downloadError?.message || 'Unable to prepare this account statement.')
    }
  }

  function handleDownloadSubmissionPack() {
    if (!accounts.length) return
    try {
      const result = downloadMatterFinancialSubmissionPack(accounts, {
        matterLabel: transactionId,
        transactionId,
        reviewQueue,
        followUps,
      })
      setError('')
      setMessage(`Finance handover pack prepared: ${result.fileName}`)
    } catch (downloadError) {
      setError(downloadError?.message || 'Unable to prepare the finance handover pack.')
    }
  }

  async function handleCopyFollowUp(followUp) {
    if (!followUp?.copyText) return
    try {
      await navigator.clipboard.writeText(followUp.copyText)
      setError('')
      setMessage('Follow-up message copied. Paste it into your normal email or WhatsApp workflow.')
    } catch {
      setError('Unable to copy this follow-up message automatically. Select the message text and copy it manually.')
    }
  }

  const summaryCards = [
    ['Balance due', formatCurrency(summary?.balanceDue || 0), 'Across buyer/seller operational accounts'],
    ['Launch ready', `${summary?.readyAccounts || 0}/${accounts.length || 0}`, `${summary?.blockedAccounts || 0} blocked · ${summary?.accountsNeedingAttention || 0} attention`],
    ['Charged', formatCurrency(summary?.totalCharged || 0), 'Posted charges/debits'],
    ['Received / credited', formatCurrency(summary?.totalCredited || 0), 'Posted payments, credits, write-offs'],
    ['Review queue', reviewQueueSummary?.attorneyAction || summary?.reviewQueueAttorneyAction || 0, `${reviewQueueSummary?.clientAction || summary?.reviewQueueClientAction || 0} waiting on client`],
    ['Follow-ups', followUpSummary?.total || summary?.followUpItems || 0, `${followUpSummary?.overdue || summary?.followUpOverdue || 0} overdue · ${followUpSummary?.resubmissions || summary?.followUpResubmissions || 0} resubmit`],
    ['Handover pack', submissionPackSummary.documentCount, `${submissionPackSummary.requestCount} requests · ${submissionPackSummary.postedEntries} entries`],
    ['Client requests', summary?.openRequests || 0, `${summary?.requestsAwaitingReview || 0} awaiting review · ${summary?.overdueRequests || 0} overdue`],
    ['Proofs to review', summary?.proofsNeedingReview || 0, 'Client proofs awaiting reconciliation'],
    ['Updates', summary?.eventCount || 0, 'Account audit events'],
  ]

  return (
    <section className="space-y-5 rounded-[20px] border border-borderDefault bg-white p-5 shadow-surface">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-helper font-semibold uppercase tracking-[0.12em] text-primary">Matter accounts</p>
          <h3 className="mt-1 text-section-title font-semibold text-textStrong">Buyer / seller accounting workspace</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">
            Upload external invoices or statements, publish approved documents, and post operational payments or adjustments. Invoice generation stays out of
            scope for now.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleDownloadSubmissionPack} disabled={!accounts.length}>
            <Download size={14} />
            Download handover pack
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => loadAccounts()} disabled={loading || Boolean(busyAction)}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>
      ) : null}
      {unavailableMessage ? (
        <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">{unavailableMessage}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        {summaryCards.map(([label, value, helper]) => (
          <article key={label} className="rounded-[15px] border border-borderSoft bg-surfaceAlt px-4 py-3">
            <span className="text-helper font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
            <strong className="mt-2 block text-lg text-textStrong">{value}</strong>
            <p className="mt-1 text-xs text-textMuted">{helper}</p>
          </article>
        ))}
      </div>

      <section className="rounded-[18px] border border-borderDefault bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-helper font-semibold uppercase tracking-[0.12em] text-primary">Finance handover pack</p>
            <h4 className="mt-1 text-base font-semibold text-textStrong">Submission manifest for internal or accountant review</h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">
              Export a CSV manifest of buyer/seller accounts, uploaded finance documents, request statuses, review queue items, follow-ups, and ledger entries.
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={handleDownloadSubmissionPack} disabled={!accounts.length}>
            <Download size={14} />
            Download CSV
          </Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {[
            ['Documents', submissionPackSummary.documentCount, `${submissionPackSummary.publishedDocuments} published · ${submissionPackSummary.draftDocuments} draft`],
            ['Requests', submissionPackSummary.requestCount, `${submissionPackSummary.openRequests} waiting on client`],
            ['Review actions', submissionPackSummary.reviewQueueAttorneyAction, `${submissionPackSummary.reviewQueueClientAction} client-side actions`],
            ['Follow-ups', submissionPackSummary.followUpItems, `${submissionPackSummary.followUpOverdue} overdue · ${submissionPackSummary.followUpDueSoon} due soon`],
          ].map(([label, value, helper]) => (
            <article key={label} className="rounded-[13px] border border-borderSoft bg-white px-3 py-3">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
              <strong className="mt-1 block text-sm text-textStrong">{value}</strong>
              <p className="mt-1 text-xs text-textMuted">{helper}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[18px] border border-borderDefault bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-helper font-semibold uppercase tracking-[0.12em] text-primary">Attorney finance review queue</p>
            <h4 className="mt-1 text-base font-semibold text-textStrong">Items needing review or follow-up</h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">
              Review submitted finance documents, reconcile POPs, and spot requests still waiting on the buyer or seller.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {reviewQueueSummary?.attorneyAction || 0} attorney action
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              {reviewQueueSummary?.clientAction || 0} client action
            </span>
          </div>
        </div>

        {reviewQueue.length ? (
          <div className="mt-4 grid gap-3">
            {reviewQueue.slice(0, 12).map((item) => {
              const account = accountsById.get(item.accountId)
              const proofDraft =
                item.kind === 'proof_review' && item.document
                  ? {
                      ...emptyProofReviewDraft(item.document),
                      ...(proofReviewDrafts[item.document.id] || {}),
                    }
                  : null
              return (
                <article key={item.id} className="rounded-[15px] border border-borderSoft bg-white px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${statusClass(item.status)}`}>
                          {item.label}
                        </span>
                        <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
                          {title(item.partyRole)}
                        </span>
                        <strong className="text-sm text-textStrong">{item.title}</strong>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-textMuted">
                        {item.partyLabel || title(item.partyRole)} · {title(item.documentType)} · Due {formatDate(item.dueOn)}
                        {item.submittedAt ? ` · Submitted ${formatDate(item.submittedAt)}` : ''}
                      </p>
                      {item.amount !== null && item.amount !== undefined ? (
                        <p className="mt-1 text-xs font-semibold text-textStrong">{formatCurrency(item.amount)}</p>
                      ) : null}
                      {item.description ? <p className="mt-2 text-xs leading-5 text-textMuted">{item.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {item.documentUrl ? (
                        <Button type="button" asChild size="sm" variant="ghost">
                          <a href={item.documentUrl} target="_blank" rel="noreferrer">
                            View file
                          </a>
                        </Button>
                      ) : null}
                      {item.canAccept ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyAction === `request-accepted-${item.requestId}`}
                          onClick={() => handleUpdateRequestStatus(item.request, 'accepted', 'Submission accepted from review queue.')}
                        >
                          Accept
                        </Button>
                      ) : null}
                      {item.canReject ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyAction === `request-rejected-${item.requestId}`}
                          onClick={() => handleUpdateRequestStatus(item.request, 'rejected', 'Please resubmit this item.')}
                        >
                          Reject
                        </Button>
                      ) : null}
                      {item.canComplete ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyAction === `request-complete-${item.requestId}`}
                          onClick={() => handleUpdateRequestStatus(item.request, 'complete', item.request?.reviewNotes || 'Completed from review queue.')}
                        >
                          Complete
                        </Button>
                      ) : null}
                      {item.actionRequiredBy === 'client' && item.canCancel ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyAction === `request-cancelled-${item.requestId}`}
                          onClick={() => handleUpdateRequestStatus(item.request, 'cancelled', 'Cancelled from review queue.')}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {item.kind === 'proof_review' && item.document && account ? (
                    <div className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-xs font-semibold text-amber-800">Review this POP, then post the matching payment entry when confirmed externally.</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <label className="text-xs font-semibold text-textStrong">
                          Payment amount
                          <Field
                            className="mt-1 bg-white"
                            type="number"
                            min="0"
                            step="0.01"
                            value={proofDraft.amount}
                            onChange={(event) => updateProofReviewDraft(item.document, { amount: event.target.value })}
                          />
                        </label>
                        <label className="text-xs font-semibold text-textStrong">
                          Payment date
                          <Field
                            className="mt-1 bg-white"
                            type="date"
                            value={proofDraft.occurredOn}
                            onChange={(event) => updateProofReviewDraft(item.document, { occurredOn: event.target.value })}
                          />
                        </label>
                        <label className="text-xs font-semibold text-textStrong md:col-span-2">
                          Ledger description
                          <Field
                            className="mt-1 bg-white"
                            value={proofDraft.description}
                            onChange={(event) => updateProofReviewDraft(item.document, { description: event.target.value })}
                          />
                        </label>
                        <label className="text-xs font-semibold text-textStrong md:col-span-2">
                          Review note
                          <Field
                            as="textarea"
                            className="mt-1 min-h-[64px] bg-white"
                            placeholder="Optional internal reconciliation note"
                            value={proofDraft.reviewNotes}
                            onChange={(event) => updateProofReviewDraft(item.document, { reviewNotes: event.target.value })}
                          />
                        </label>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3"
                        disabled={busyAction === `proof-post-${item.document.id}`}
                        onClick={() => handlePostProofPayment(account, item.document)}
                      >
                        <CheckCircle2 size={14} />
                        Post payment
                      </Button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-[13px] border border-dashed border-borderSoft bg-white px-4 py-5 text-sm text-textMuted">
            No finance review items are waiting right now. Lovely little quiet inbox.
          </p>
        )}
      </section>

      <section className="rounded-[18px] border border-borderDefault bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-helper font-semibold uppercase tracking-[0.12em] text-primary">Submission follow-up pack</p>
            <h4 className="mt-1 text-base font-semibold text-textStrong">Copy-ready reminders for buyer/seller uploads</h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">
              Use these to chase outstanding invoices, statements, POPs, and resubmissions through your normal email or WhatsApp process.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {followUpSummary?.overdue || 0} overdue
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {followUpSummary?.resubmissions || 0} resubmissions
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              {followUpSummary?.dueSoon || 0} due soon
            </span>
          </div>
        </div>

        {followUps.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {followUps.slice(0, 8).map((followUp) => (
              <article key={followUp.id} className="rounded-[15px] border border-borderSoft bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${followUpClass(followUp.urgency)}`}>
                        {followUp.label}
                      </span>
                      <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
                        {title(followUp.partyRole)}
                      </span>
                    </div>
                    <h5 className="mt-2 text-sm font-semibold text-textStrong">{followUp.subject}</h5>
                    <p className="mt-1 text-xs leading-5 text-textMuted">
                      {followUp.partyLabel} · {title(followUp.requestType)} · Due {formatDate(followUp.dueOn)}
                      {followUp.partyEmail ? ` · ${followUp.partyEmail}` : ''}
                    </p>
                    {followUp.portalWarning ? (
                      <p className="mt-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                        {followUp.portalWarning}
                      </p>
                    ) : null}
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => handleCopyFollowUp(followUp)}>
                    <ClipboardList size={14} />
                    Copy
                  </Button>
                </div>
                <textarea
                  className="mt-3 min-h-[160px] w-full rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-xs leading-5 text-textMuted outline-none"
                  readOnly
                  value={followUp.copyText}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-[13px] border border-dashed border-borderSoft bg-white px-4 py-5 text-sm text-textMuted">
            No buyer/seller submission follow-ups are needed right now.
          </p>
        )}
      </section>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[buyerName, sellerName].map((label) => (
            <div key={label} className="h-44 animate-pulse rounded-[18px] border border-borderSoft bg-surfaceAlt" />
          ))}
        </div>
      ) : accounts.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((account) => (
            <article key={account.id} className="rounded-[18px] border border-borderDefault bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-textStrong">
                      {account.partyLabel || (account.partyRole === 'buyer' ? buyerName : account.partyRole === 'seller' ? sellerName : title(account.partyRole))}
                    </h4>
                    <span className="rounded-full border border-primary/20 bg-primarySoft px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-primary">
                      {title(account.partyRole)}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${readinessClass(account.readiness?.status)}`}>
                      {account.readiness?.label || 'Not assessed'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-textMuted">{account.partyEmail || 'Email not captured yet'}</p>
                </div>
                <div className="text-right">
                  <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Balance due</span>
                  <strong className="mt-1 block text-lg text-textStrong">{formatCurrency(account.balance?.balanceDue || 0)}</strong>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {[
                  ['Charged', formatCurrency(account.balance?.totalCharged || 0)],
                  ['Credited', formatCurrency(account.balance?.totalCredited || 0)],
                  ['Requests', account.requests?.filter((request) => ['requested', 'submitted', 'awaiting_review', 'rejected'].includes(request.requestStatus)).length || 0],
                  ['Documents', account.documents.length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-borderSoft bg-white px-3 py-2">
                    <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                    <strong className="mt-1 block text-sm text-textStrong">{value}</strong>
                  </div>
                ))}
              </div>

              {account.readiness?.issues?.length || account.readiness?.warnings?.length ? (
                <div className="mt-4 rounded-[12px] border border-borderSoft bg-white px-3 py-3">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Launch checklist</span>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-textMuted">
                    {(account.readiness.issues || []).slice(0, 3).map((issue) => (
                      <li key={issue} className="text-rose-700">• {issue}</li>
                    ))}
                    {(account.readiness.warnings || []).slice(0, 2).map((warning) => (
                      <li key={warning} className="text-amber-700">• {warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => handleSelectAccount(account.id)}>
                  <CheckCircle2 size={14} />
                  Use account
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleTogglePortal(account)}
                  disabled={busyAction === `portal-${account.id}`}
                >
                  {account.portalEnabled ? <EyeOff size={14} /> : <Eye size={14} />}
                  {account.portalEnabled ? 'Pause portal' : 'Enable portal'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => handleDownloadStatement(account)}>
                  <Download size={14} />
                  Download statement
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-8 text-center">
          <FileText className="mx-auto text-textMuted" size={28} />
          <h4 className="mt-3 text-sm font-semibold text-textStrong">No buyer/seller accounts yet</h4>
          <p className="mt-1 text-sm text-textMuted">Run the Phase 1.2 participant account backfill migration, then refresh this matter.</p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <form className="rounded-[18px] border border-borderDefault bg-surface p-4 xl:col-span-2" onSubmit={handleUploadDocument}>
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-primarySoft text-primary">
              <Upload size={18} />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-textStrong">Upload external financial document</h4>
              <p className="mt-1 text-xs leading-5 text-textMuted">Use this for invoices, statements, receipts, or proof documents generated outside Bridge.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-textStrong">
              Account
              <Field as="select" className="mt-1" value={selectedAccountId} onChange={(event) => handleSelectAccount(event.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {title(account.partyRole)} · {account.partyLabel || account.partyEmail || 'Account'}
                  </option>
                ))}
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Document type
              <Field
                as="select"
                className="mt-1"
                value={documentDraft.documentType}
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, documentType: event.target.value }))}
              >
                {DOCUMENT_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Title
              <Field
                className="mt-1"
                value={documentDraft.title}
                placeholder="e.g. Buyer transfer costs invoice"
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, title: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Reference
              <Field
                className="mt-1"
                value={documentDraft.externalReference}
                placeholder="Invoice / statement number"
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, externalReference: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Total amount
              <Field
                className="mt-1"
                type="number"
                min="0"
                step="0.01"
                value={documentDraft.amountTotal}
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, amountTotal: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Amount due
              <Field
                className="mt-1"
                type="number"
                min="0"
                step="0.01"
                value={documentDraft.amountDue}
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, amountDue: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Issued on
              <Field
                className="mt-1"
                type="date"
                value={documentDraft.issuedOn}
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, issuedOn: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Due on
              <Field
                className="mt-1"
                type="date"
                value={documentDraft.dueOn}
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, dueOn: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Visibility
              <Field
                as="select"
                className="mt-1"
                value={documentDraft.audienceRole}
                onChange={(event) => setDocumentDraft((draft) => ({ ...draft, audienceRole: event.target.value }))}
              >
                <option value={selectedAccount?.partyRole || 'client'}>{title(selectedAccount?.partyRole || 'client')} only</option>
                <option value="shared">Buyer and seller</option>
                <option value="internal">Internal draft only</option>
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              File
              <Field key={fileInputKey} className="mt-1" type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} />
            </label>
          </div>

          <label className="mt-3 block text-sm font-semibold text-textStrong">
            Notes
            <Field
              as="textarea"
              className="mt-1 min-h-[88px]"
              value={documentDraft.notes}
              placeholder="Internal context, calculation note, or payment instructions."
              onChange={(event) => setDocumentDraft((draft) => ({ ...draft, notes: event.target.value }))}
            />
          </label>

          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-textStrong">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-borderDefault text-primary"
              checked={documentDraft.publishNow}
              onChange={(event) => setDocumentDraft((draft) => ({ ...draft, publishNow: event.target.checked }))}
            />
            Publish after upload
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!accounts.length || busyAction === 'upload-document'}>
              <Upload size={14} />
              {documentDraft.publishNow ? 'Upload & publish' : 'Upload draft'}
            </Button>
          </div>
        </form>

        <form className="rounded-[18px] border border-borderDefault bg-surface p-4" onSubmit={handleCreateRequest}>
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-sky-50 text-sky-700">
              <ClipboardList size={18} />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-textStrong">Request finance document / POP</h4>
              <p className="mt-1 text-xs leading-5 text-textMuted">Create a buyer/seller checklist item for an invoice, statement, proof of payment, or supporting finance document.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-semibold text-textStrong">
              Account
              <Field as="select" className="mt-1" value={selectedAccountId} onChange={(event) => handleSelectAccount(event.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {title(account.partyRole)} · {account.partyLabel || account.partyEmail || 'Account'}
                  </option>
                ))}
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Request type
              <Field
                as="select"
                className="mt-1"
                value={requestDraft.requestType}
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, requestType: event.target.value }))}
              >
                {DOCUMENT_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Title
              <Field
                className="mt-1"
                value={requestDraft.title}
                placeholder="e.g. Upload POP for transfer costs"
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, title: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Reference
              <Field
                className="mt-1"
                value={requestDraft.externalReference}
                placeholder="Matter / invoice ref"
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, externalReference: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Amount due
              <Field
                className="mt-1"
                type="number"
                min="0"
                step="0.01"
                value={requestDraft.amountDue}
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, amountDue: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Due date
              <Field
                className="mt-1"
                type="date"
                value={requestDraft.dueOn}
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, dueOn: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Visibility
              <Field
                as="select"
                className="mt-1"
                value={requestDraft.audienceRole}
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, audienceRole: event.target.value }))}
              >
                <option value={selectedAccount?.partyRole || 'client'}>{title(selectedAccount?.partyRole || 'client')} only</option>
                <option value="shared">Buyer and seller</option>
                <option value="internal">Internal only</option>
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Instructions
              <Field
                as="textarea"
                className="mt-1 min-h-[88px]"
                value={requestDraft.description}
                placeholder="Tell the client exactly what to upload or pay."
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, description: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-textStrong">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-borderDefault text-primary"
                checked={requestDraft.portalVisible}
                onChange={(event) => setRequestDraft((draft) => ({ ...draft, portalVisible: event.target.checked }))}
              />
              Show in buyer/seller portal checklist
            </label>
          </div>

          <Button type="submit" size="sm" className="mt-4" disabled={!accounts.length || busyAction === 'create-request'}>
            <Send size={14} />
            Create request
          </Button>
        </form>

        <form className="rounded-[18px] border border-borderDefault bg-surface p-4" onSubmit={handleRecordEntry}>
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-emerald-50 text-emerald-700">
              <ArrowDownCircle size={18} />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-textStrong">Post payment / adjustment</h4>
              <p className="mt-1 text-xs leading-5 text-textMuted">Manual operational ledger entry. Payments, credits, and write-offs reduce the balance.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-semibold text-textStrong">
              Account
              <Field as="select" className="mt-1" value={selectedAccountId} onChange={(event) => handleSelectAccount(event.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {title(account.partyRole)} · {account.partyLabel || account.partyEmail || 'Account'}
                  </option>
                ))}
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Entry type
              <Field
                as="select"
                className="mt-1"
                value={entryDraft.entryType}
                onChange={(event) => setEntryDraft((draft) => ({ ...draft, entryType: event.target.value }))}
              >
                {ENTRY_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Amount
              <Field
                className="mt-1"
                type="number"
                min="0"
                step="0.01"
                value={entryDraft.amount}
                onChange={(event) => setEntryDraft((draft) => ({ ...draft, amount: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Date
              <Field
                className="mt-1"
                type="date"
                value={entryDraft.occurredOn}
                onChange={(event) => setEntryDraft((draft) => ({ ...draft, occurredOn: event.target.value }))}
              />
            </label>
            <label className="text-sm font-semibold text-textStrong">
              Description
              <Field
                as="textarea"
                className="mt-1 min-h-[88px]"
                value={entryDraft.description}
                placeholder="e.g. EFT received from buyer for transfer costs"
                onChange={(event) => setEntryDraft((draft) => ({ ...draft, description: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-textStrong">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-borderDefault text-primary"
                checked={entryDraft.clientVisible}
                onChange={(event) => setEntryDraft((draft) => ({ ...draft, clientVisible: event.target.checked }))}
              />
              Buyer/seller visible when portal is enabled
            </label>
          </div>

          <Button type="submit" size="sm" className="mt-4" disabled={!accounts.length || busyAction === 'record-entry'}>
            <Send size={14} />
            Record entry
          </Button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {accounts.map((account) => (
          <article key={`activity-${account.id}`} className="rounded-[18px] border border-borderDefault bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-textStrong">{title(account.partyRole)} account details</h4>
                <p className="mt-1 text-xs text-textMuted">{account.portalEnabled ? 'Portal visibility enabled' : 'Portal visibility paused'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${readinessClass(account.readiness?.status)}`}>
                  {account.readiness?.label || 'Not assessed'}
                </span>
                <span className="rounded-full border border-borderSoft bg-white px-3 py-1 text-xs font-semibold text-textMuted">
                  {account.requests?.length || 0} requests · {account.documents.length} docs · {account.entries.length} entries · {account.events.length} updates
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-[14px] border border-borderSoft bg-white p-3">
              <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Launch readiness</h5>
              {account.readiness?.issues?.length || account.readiness?.warnings?.length ? (
                <div className="mt-2 grid gap-2">
                  {(account.readiness.issues || []).map((issue) => (
                    <p key={issue} className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{issue}</p>
                  ))}
                  {(account.readiness.warnings || []).map((warning) => (
                    <p key={warning} className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{warning}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  This account is ready for buyer/seller portal operation.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-[14px] border border-borderSoft bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Client submission requests</h5>
                  <p className="mt-1 text-xs text-textMuted">Checklist items for invoices, statements, POPs, and finance supporting documents.</p>
                </div>
                <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold text-textMuted">
                  {account.requests?.filter((request) => ['requested', 'submitted', 'awaiting_review', 'rejected'].includes(request.requestStatus)).length || 0} open
                </span>
              </div>
              {account.requests?.length ? (
                <div className="mt-3 grid gap-2">
                  {account.requests.map((request) => (
                    <div key={request.id} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm text-textStrong">{request.title}</strong>
                            <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${statusClass(request.requestStatus)}`}>
                              {title(request.requestStatus)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-textMuted">
                            {title(request.requestType)} · {request.externalReference || 'No reference'} · Due {formatDate(request.dueOn)}
                          </p>
                          {request.amountDue ? (
                            <p className="mt-1 text-xs font-semibold text-textStrong">Requested amount {formatCurrency(request.amountDue)}</p>
                          ) : null}
                          {request.description ? <p className="mt-2 text-xs leading-5 text-textMuted">{request.description}</p> : null}
                          {request.reviewNotes ? <p className="mt-2 text-xs leading-5 text-textMuted">Review note: {request.reviewNotes}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {['submitted', 'awaiting_review'].includes(request.requestStatus) ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busyAction === `request-accepted-${request.id}`}
                                onClick={() => handleUpdateRequestStatus(request, 'accepted', 'Submission accepted.')}
                              >
                                Accept
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busyAction === `request-rejected-${request.id}`}
                                onClick={() => handleUpdateRequestStatus(request, 'rejected', 'Please resubmit this item.')}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {request.requestStatus === 'accepted' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busyAction === `request-complete-${request.id}`}
                              onClick={() => handleUpdateRequestStatus(request, 'complete', request.reviewNotes || 'Completed.')}
                            >
                              Complete
                            </Button>
                          ) : null}
                          {!['complete', 'cancelled'].includes(request.requestStatus) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busyAction === `request-cancelled-${request.id}`}
                              onClick={() => handleUpdateRequestStatus(request, 'cancelled', 'Cancelled by legal team.')}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-[12px] border border-dashed border-borderSoft bg-surfaceAlt px-3 py-4 text-sm text-textMuted">
                  No finance document or proof requests created for this account yet.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-[14px] border border-borderSoft bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Payment instructions</h5>
                  <p className="mt-1 text-xs text-textMuted">
                    {account.paymentInstructions?.published ? 'Published to this party portal.' : 'Internal draft until you publish.'}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                  account.paymentInstructions?.published ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {account.paymentInstructions?.published ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs font-semibold text-textStrong">
                  Account holder
                  <Field
                    className="mt-1"
                    value={getPaymentInstructionDraft(account).accountHolder}
                    onChange={(event) => updatePaymentInstructionDraft(account, { accountHolder: event.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-textStrong">
                  Bank
                  <Field
                    className="mt-1"
                    value={getPaymentInstructionDraft(account).bankName}
                    onChange={(event) => updatePaymentInstructionDraft(account, { bankName: event.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-textStrong">
                  Account number
                  <Field
                    className="mt-1"
                    value={getPaymentInstructionDraft(account).accountNumber}
                    onChange={(event) => updatePaymentInstructionDraft(account, { accountNumber: event.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-textStrong">
                  Branch code
                  <Field
                    className="mt-1"
                    value={getPaymentInstructionDraft(account).branchCode}
                    onChange={(event) => updatePaymentInstructionDraft(account, { branchCode: event.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-textStrong">
                  Account type
                  <Field
                    className="mt-1"
                    value={getPaymentInstructionDraft(account).accountType}
                    onChange={(event) => updatePaymentInstructionDraft(account, { accountType: event.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-textStrong">
                  Payment reference
                  <Field
                    className="mt-1"
                    value={getPaymentInstructionDraft(account).paymentReference}
                    onChange={(event) => updatePaymentInstructionDraft(account, { paymentReference: event.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold text-textStrong md:col-span-2">
                  Instructions
                  <Field
                    as="textarea"
                    className="mt-1 min-h-[72px]"
                    value={getPaymentInstructionDraft(account).instructions}
                    placeholder="e.g. Use the matter reference exactly as shown and upload proof after payment."
                    onChange={(event) => updatePaymentInstructionDraft(account, { instructions: event.target.value })}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busyAction === `payment-instructions-${account.id}`}
                  onClick={() => handleSavePaymentInstructions(account, false)}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyAction === `payment-instructions-${account.id}`}
                  onClick={() => handleSavePaymentInstructions(account, true)}
                >
                  Publish instructions
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Documents</h5>
              {account.documents.length ? (
                account.documents.map((document) => {
                  const needsReview = proofNeedsAttorneyReview(document)
                  const isReconciled = proofIsReconciled(document)
                  const proofDraft = {
                    ...emptyProofReviewDraft(document),
                    ...(proofReviewDrafts[document.id] || {}),
                  }
                  return (
                    <div key={document.id} className="rounded-[13px] border border-borderSoft bg-white px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm text-textStrong">{document.title}</strong>
                            <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${statusClass(document.documentStatus)}`}>
                              {title(document.documentStatus)}
                            </span>
                            {needsReview ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-700">
                                Needs review
                              </span>
                            ) : null}
                            {isReconciled ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-700">
                                Reconciled
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-textMuted">
                            {title(document.documentType)} · {document.externalReference || 'No reference'} · {formatDate(document.issuedOn)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {document.url ? (
                            <Button type="button" asChild size="sm" variant="ghost">
                              <a href={document.url} target="_blank" rel="noreferrer">
                                View
                              </a>
                            </Button>
                          ) : null}
                          {document.documentStatus === 'draft' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busyAction === `publish-${document.id}`}
                              onClick={() => handlePublishDocument(document)}
                            >
                              Publish
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {document.amountDue || document.amountTotal ? (
                        <p className="mt-2 text-xs font-semibold text-textStrong">
                          {document.amountDue ? `Due ${formatCurrency(document.amountDue)}` : `Total ${formatCurrency(document.amountTotal)}`}
                        </p>
                      ) : null}
                      {needsReview ? (
                        <div className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50/80 p-3">
                          <p className="text-xs font-semibold text-amber-800">Client submitted this proof. Review the file, then post the matching payment entry.</p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <label className="text-xs font-semibold text-textStrong">
                              Payment amount
                              <Field
                                className="mt-1 bg-white"
                                type="number"
                                min="0"
                                step="0.01"
                                value={proofDraft.amount}
                                onChange={(event) => updateProofReviewDraft(document, { amount: event.target.value })}
                              />
                            </label>
                            <label className="text-xs font-semibold text-textStrong">
                              Payment date
                              <Field
                                className="mt-1 bg-white"
                                type="date"
                                value={proofDraft.occurredOn}
                                onChange={(event) => updateProofReviewDraft(document, { occurredOn: event.target.value })}
                              />
                            </label>
                            <label className="text-xs font-semibold text-textStrong md:col-span-2">
                              Ledger description
                              <Field
                                className="mt-1 bg-white"
                                value={proofDraft.description}
                                onChange={(event) => updateProofReviewDraft(document, { description: event.target.value })}
                              />
                            </label>
                            <label className="text-xs font-semibold text-textStrong md:col-span-2">
                              Review note
                              <Field
                                as="textarea"
                                className="mt-1 min-h-[72px] bg-white"
                                placeholder="Optional internal reconciliation note"
                                value={proofDraft.reviewNotes}
                                onChange={(event) => updateProofReviewDraft(document, { reviewNotes: event.target.value })}
                              />
                            </label>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            disabled={busyAction === `proof-post-${document.id}`}
                            onClick={() => handlePostProofPayment(account, document)}
                          >
                            <CheckCircle2 size={14} />
                            Post payment
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <p className="rounded-[13px] border border-dashed border-borderSoft bg-white px-3 py-4 text-sm text-textMuted">
                  No financial documents uploaded for this account yet.
                </p>
              )}
            </div>

            <div className="mt-5 space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Ledger entries</h5>
              {account.entries.length ? (
                account.entries.map((entry) => (
                  <div key={entry.id} className="rounded-[13px] border border-borderSoft bg-white px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.amount < 0 ? <ArrowDownCircle size={14} className="text-emerald-700" /> : <ArrowUpCircle size={14} className="text-amber-700" />}
                          <strong className="text-sm text-textStrong">{entry.description}</strong>
                          <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${statusClass(entry.entryStatus)}`}>
                            {title(entry.entryStatus)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-textMuted">
                          {title(entry.entryType)} · {formatDate(entry.occurredOn)} · {title(entry.entryVisibility)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <strong className={entry.amount < 0 ? 'text-emerald-700' : 'text-textStrong'}>{formatCurrency(entry.amount)}</strong>
                        {entry.entryStatus === 'posted' ? (
                          <button
                            type="button"
                            className="ui-icon-button h-8 w-8"
                            aria-label="Reverse entry"
                            disabled={busyAction === `reverse-${entry.id}`}
                            onClick={() => handleReverseEntry(entry)}
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[13px] border border-dashed border-borderSoft bg-white px-3 py-4 text-sm text-textMuted">
                  No charges, payments, or adjustments posted yet.
                </p>
              )}
            </div>

            <div className="mt-5 space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">Updates</h5>
              {account.events.length ? (
                account.events.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-[13px] border border-borderSoft bg-white px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="text-sm text-textStrong">{accountEventLabel(event)}</strong>
                        <p className="mt-1 text-xs text-textMuted">{accountEventDetail(event)}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-textMuted">{formatDate(event.createdAt)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[13px] border border-dashed border-borderSoft bg-white px-3 py-4 text-sm text-textMuted">
                  No account updates recorded yet.
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
