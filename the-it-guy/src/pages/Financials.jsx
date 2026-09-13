import { DollarSign, FileBadge2, Receipt, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import Drawer from '../components/ui/Drawer'
import Field from '../components/ui/Field'
import MetricCard from '../components/ui/MetricCard'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  fetchAttorneyFinancials,
  fetchTransactionFinancialRecord,
  saveTransactionFinancialRecord,
  uploadTransactionFinancialInvoice,
} from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  completeTransactionFeeInvoice,
  listTransactionFeeInvoiceQueue,
  prepareTransactionFeeInvoice,
} from '../services/transactionFeeControlService.js'
import { downloadTransactionFeeInvoiceDraft } from '../services/transactionFeeInvoicePdf.js'
import { buildTransactionFeeInvoiceEmailDraft } from '../services/transactionFeeInvoiceDelivery.js'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const STATUS_FILTERS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'paid', label: 'Paid' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'not_invoiced', label: 'Not Invoiced' },
  { key: 'needs_attention', label: 'Needs Attention' },
]

function formatMoney(value) {
  return currency.format(Number(value || 0))
}

function formatRelativeDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent update'
  const diffMs = Date.now() - date.getTime()
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / (60 * 1000)))}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`
  return date.toLocaleDateString('en-ZA')
}

function formatDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-ZA')
}

function getMatterLabel(row) {
  if (row.type === 'private') {
    return row.propertyAddress || 'Private property matter'
  }
  return `${row.developmentName || 'Unknown Development'} • Unit ${row.unitNumber || '—'}`
}

function getStatusLabel(status) {
  if (status === 'paid') return 'Paid'
  if (status === 'invoiced') return 'Invoiced'
  if (status === 'needs_attention') return 'Needs Attention'
  return 'Not Invoiced'
}

function getStatusClass(status) {
  if (status === 'paid') return 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
  if (status === 'invoiced') return 'border-[#cfe1f7] bg-[#eff6ff] text-[#35546c]'
  if (status === 'needs_attention') return 'border-[#f4dfba] bg-[#fff7e9] text-[#b67218]'
  return 'border-[#dde4ee] bg-[#f8fafc] text-[#66758b]'
}

function getVarianceTone(value) {
  if (value > 0) return 'text-[#b67218]'
  if (value < 0) return 'text-[#1c7d45]'
  return 'text-[#142132]'
}

function buildBreakdown(summary) {
  const items = [
    { key: 'expected', label: 'Expected', value: Number(summary.totalExpectedFees || 0) },
    { key: 'invoiced', label: 'Invoiced', value: Number(summary.totalInvoiced || 0) },
    { key: 'paid', label: 'Paid', value: Number(summary.totalPaid || 0) },
    { key: 'outstanding', label: 'Outstanding', value: Number(summary.outstanding || 0) },
  ]

  const total = items.reduce((sum, item) => sum + item.value, 0)
  return items.map((item) => ({
    ...item,
    width: total > 0 ? `${(item.value / total) * 100}%` : '25%',
  }))
}

function TransactionFeeInvoiceQueue({ items = [], busyTransactionId = '', invoiceReferences = {}, deliveryEmails = {}, error = '', organisationName = '', onPrepare, onReferenceChange, onDeliveryEmailChange, onComplete }) {
  if (!items.length && !error) return null
  return (
    <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <SectionHeader title="R1,500 Transaction Fee — Finance Queue" copy="Only verified OTPs with attorney receipt confirmation appear here. This queue records finance handling; it does not generate or email a tax invoice." />
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const readyToPrepare = item.status === 'ready_to_prepare'
            const completed = item.status === 'completed'
            const isBusy = busyTransactionId === item.transactionId
            return (
              <article key={item.feeControlId || item.id || item.transactionId} className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <strong className="text-sm font-semibold text-[#142132]">Transaction fee · {item.billingPartyType === 'attorney' ? 'Attorney billed' : 'Agent billed'}</strong>
                    <p className="mt-1 text-sm text-[#66758b]">R1,500 excl. VAT · R1,725 incl. VAT</p>
                  </div>
                  <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${completed ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]' : 'border-[#f4dfba] bg-[#fff7e9] text-[#b67218]'}`}>
                    {completed ? `Completed · ${item.invoiceReference}` : readyToPrepare ? 'Ready to prepare' : 'Ready for finance'}
                  </span>
                </div>
                {readyToPrepare ? (
                  <div className="mt-3">
                    <Button size="sm" disabled={isBusy} onClick={() => onPrepare(item.transactionId)}>{isBusy ? 'Preparing…' : 'Prepare for finance'}</Button>
                  </div>
                ) : !completed ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="grid flex-1 gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Accounting-system invoice reference</span>
                      <Field value={invoiceReferences[item.transactionId] || ''} onChange={(event) => onReferenceChange(item.transactionId, event.target.value)} placeholder="e.g. INV-100" />
                    </label>
                    <Button size="sm" disabled={isBusy} onClick={() => onComplete(item.transactionId)}>{isBusy ? 'Saving…' : 'Mark invoice completed'}</Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Agreed billing email</span><Field type="email" value={deliveryEmails[item.transactionId] || ''} onChange={(event) => onDeliveryEmailChange(item.transactionId, event.target.value)} placeholder="billing@example.com" /></label><Button size="sm" variant="secondary" onClick={() => void downloadTransactionFeeInvoiceDraft({ invoiceReference: item.invoiceReference, transactionId: item.transactionId, billingPartyType: item.billingPartyType, organisationName })}>Download invoice copy</Button><Button size="sm" variant="ghost" disabled={!deliveryEmails[item.transactionId]} onClick={async () => { const draft = buildTransactionFeeInvoiceEmailDraft({ recipientEmail: deliveryEmails[item.transactionId], billingPartyType: item.billingPartyType, invoiceReference: item.invoiceReference, transactionId: item.transactionId }); await navigator.clipboard?.writeText(`To: ${draft.recipientEmail}\nSubject: ${draft.subject}\n\n${draft.body}`) }}>Copy email</Button></div>
                )}
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function FinancialDetailDrawer({ row, record, loading, saving, error, onClose, onSave, onUpload, onOpenMatter }) {
  const [form, setForm] = useState({
    expectedFee: '',
    invoicedAmount: '',
    paymentStatus: 'not_invoiced',
    invoiceReference: '',
    invoiceDate: '',
    paymentDate: '',
    notes: '',
  })

  useEffect(() => {
    if (!row) {
      return
    }

    setForm({
      expectedFee: record?.expectedFee ?? row.expectedFee ?? '',
      invoicedAmount: record?.invoicedAmount ?? row.invoicedAmount ?? '',
      paymentStatus: record?.paymentStatus || row.paymentStatus || 'not_invoiced',
      invoiceReference: record?.invoiceReference || row.invoiceReference || '',
      invoiceDate: record?.invoiceDate || row.invoiceDate || '',
      paymentDate: record?.paymentDate || row.paymentDate || '',
      notes: record?.notes || row.notes || '',
    })
  }, [record, row])

  if (!row) {
    return null
  }

  const variance = Number(form.invoicedAmount || 0) - Number(form.expectedFee || 0)

  return (
    <Drawer
      open={Boolean(row)}
      onClose={onClose}
      title={getMatterLabel(row)}
      subtitle={`${row.clientName} • ${row.type === 'private' ? 'Private Matter' : 'Development Matter'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onOpenMatter}>
            Open Transaction
          </Button>
          <Button disabled={saving || loading} onClick={() => onSave(form)}>
            {saving ? 'Saving…' : 'Save Financials'}
          </Button>
        </>
      }
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-[20px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Expected Fee</span>
          <strong className="mt-2 block text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatMoney(form.expectedFee)}</strong>
        </article>
        <article className="rounded-[20px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Actual / Invoiced</span>
          <strong className="mt-2 block text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatMoney(form.invoicedAmount)}</strong>
        </article>
        <article className="rounded-[20px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Difference</span>
          <strong className={`mt-2 block text-[1.1rem] font-semibold tracking-[-0.03em] ${getVarianceTone(variance)}`}>
            {formatMoney(variance)}
          </strong>
        </article>
      </section>

      <div className="mt-5 space-y-5">
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <SectionHeader title="Financial Summary" copy="Expected, actual and payment tracking against this matter." />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Expected Fee</span>
              <Field type="number" min="0" value={form.expectedFee} onChange={(event) => setForm((previous) => ({ ...previous, expectedFee: event.target.value }))} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Invoiced Amount</span>
              <Field type="number" min="0" value={form.invoicedAmount} onChange={(event) => setForm((previous) => ({ ...previous, invoicedAmount: event.target.value }))} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Payment Status</span>
              <Field as="select" value={form.paymentStatus} onChange={(event) => setForm((previous) => ({ ...previous, paymentStatus: event.target.value }))}>
                {STATUS_FILTERS.filter((item) => item.key !== 'all').map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Payment Date</span>
              <Field type="date" value={form.paymentDate} onChange={(event) => setForm((previous) => ({ ...previous, paymentDate: event.target.value }))} />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <SectionHeader title="Invoice" copy="Capture the invoice reference and attach the current invoice." />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Invoice Reference</span>
              <Field value={form.invoiceReference} onChange={(event) => setForm((previous) => ({ ...previous, invoiceReference: event.target.value }))} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Invoice Date</span>
              <Field type="date" value={form.invoiceDate} onChange={(event) => setForm((previous) => ({ ...previous, invoiceDate: event.target.value }))} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-[14px] border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2.5 text-sm font-semibold text-[#35546c] transition hover:bg-[#eef4fb]">
              Upload Invoice
              <input
                type="file"
                hidden
                onChange={(event) => {
                  const nextFile = event.target.files?.[0]
                  if (nextFile) {
                    onUpload(nextFile)
                  }
                  event.target.value = ''
                }}
              />
            </label>
            {record?.invoiceUrl ? (
              <a
                className="inline-flex items-center justify-center rounded-[14px] border border-[#dbe5ef] bg-white px-4 py-2.5 text-sm font-semibold text-[#35546c] transition hover:bg-[#f7f9fc]"
                href={record.invoiceUrl}
                target="_blank"
                rel="noreferrer"
              >
                View {record.invoiceFilename || 'Invoice'}
              </a>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <SectionHeader title="Notes" copy="Keep internal payment and invoice context with the matter." />
          <label className="grid gap-2">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes</span>
            <Field as="textarea" rows={4} value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} />
          </label>
        </section>
      </div>

      {error ? <p className="status-message error">{error}</p> : null}
    </Drawer>
  )
}

function Financials() {
  const navigate = useNavigate()
  const { profile, workspace } = useWorkspace()
  const [data, setData] = useState({ rows: [], summary: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerError, setDrawerError] = useState('')
  const [transactionFeeInvoiceQueue, setTransactionFeeInvoiceQueue] = useState([])
  const [transactionFeeInvoiceBusyId, setTransactionFeeInvoiceBusyId] = useState('')
  const [transactionFeeInvoiceReferences, setTransactionFeeInvoiceReferences] = useState({})
  const [transactionFeeInvoiceDeliveryEmails, setTransactionFeeInvoiceDeliveryEmails] = useState({})
  const [transactionFeeInvoiceError, setTransactionFeeInvoiceError] = useState('')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const response = await fetchAttorneyFinancials({ userId: profile.id })
      setData(response)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load financials.')
    } finally {
      setLoading(false)
    }
  }, [profile?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const loadTransactionFeeInvoiceQueue = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.id) return
    try {
      setTransactionFeeInvoiceError('')
      const items = await listTransactionFeeInvoiceQueue(supabase)
      setTransactionFeeInvoiceQueue(items)
    } catch (queueError) {
      // The queue migrates with this feature; keep existing financials usable
      // during a staged frontend/database rollout.
      if (!['42P01', 'PGRST202', 'PGRST205'].includes(queueError?.code)) {
        setTransactionFeeInvoiceError(queueError?.message || 'Unable to load the transaction-fee finance queue.')
      }
    }
  }, [profile?.id])

  useEffect(() => {
    void loadTransactionFeeInvoiceQueue()
  }, [loadTransactionFeeInvoiceQueue])

  useEffect(() => {
    function refreshFinancials() {
      void loadData()
    }

    window.addEventListener('itg:transaction-created', refreshFinancials)
    window.addEventListener('itg:transaction-updated', refreshFinancials)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshFinancials)
      window.removeEventListener('itg:transaction-updated', refreshFinancials)
    }
  }, [loadData])

  useEffect(() => {
    async function loadSelectedRecord() {
      if (!selectedRow?.transactionId) {
        setSelectedRecord(null)
        return
      }

      try {
        setDrawerLoading(true)
        setDrawerError('')
        const record = await fetchTransactionFinancialRecord(selectedRow.transactionId)
        setSelectedRecord(record)
      } catch (loadError) {
        setDrawerError(loadError.message || 'Unable to load transaction financial detail.')
      } finally {
        setDrawerLoading(false)
      }
    }

    void loadSelectedRecord()
  }, [selectedRow])

  const filteredRows = useMemo(() => data.rows || [], [data.rows])

  const registeredRows = useMemo(
    () => filteredRows.filter((row) => String(row.stage || '').toLowerCase() === 'registered'),
    [filteredRows],
  )

  const financialSummary = useMemo(
    () =>
      registeredRows.reduce(
        (accumulator, row) => {
          accumulator.registeredFeeBook += Number(row.expectedFee || 0)
          accumulator.totalInvoiced += Number(row.invoicedAmount || 0)
          accumulator.totalPaid += Number(row.paidAmount || 0)
          accumulator.outstanding += Number(row.outstandingAmount || 0)
          if (row.paymentStatus === 'needs_attention') accumulator.needsAttention += 1
          return accumulator
        },
        {
          registeredFeeBook: 0,
          totalInvoiced: 0,
          totalPaid: 0,
          outstanding: 0,
          needsAttention: 0,
        },
      ),
    [registeredRows],
  )

  const breakdown = useMemo(
    () =>
      buildBreakdown({
        totalExpectedFees: financialSummary.registeredFeeBook,
        totalInvoiced: financialSummary.totalInvoiced,
        totalPaid: financialSummary.totalPaid,
        outstanding: financialSummary.outstanding,
      }),
    [financialSummary.outstanding, financialSummary.registeredFeeBook, financialSummary.totalInvoiced, financialSummary.totalPaid],
  )

  async function handleSave(form) {
    if (!selectedRow?.transactionId) {
      return
    }

    try {
      setDrawerSaving(true)
      setDrawerError('')
      const nextRecord = await saveTransactionFinancialRecord(selectedRow.transactionId, form)
      setSelectedRecord(nextRecord)
      await loadData()
    } catch (saveError) {
      setDrawerError(saveError.message || 'Unable to save financials.')
    } finally {
      setDrawerSaving(false)
    }
  }

  async function handleUpload(file) {
    if (!selectedRow?.transactionId) {
      return
    }

    try {
      setDrawerSaving(true)
      setDrawerError('')
      const nextRecord = await uploadTransactionFinancialInvoice({ transactionId: selectedRow.transactionId, file })
      setSelectedRecord(nextRecord)
      await loadData()
    } catch (uploadError) {
      setDrawerError(uploadError.message || 'Unable to upload invoice.')
    } finally {
      setDrawerSaving(false)
    }
  }

  async function handlePrepareTransactionFeeInvoice(transactionId) {
    try {
      setTransactionFeeInvoiceBusyId(transactionId)
      setTransactionFeeInvoiceError('')
      await prepareTransactionFeeInvoice(supabase, { transactionId })
      await loadTransactionFeeInvoiceQueue()
    } catch (invoiceError) {
      setTransactionFeeInvoiceError(invoiceError?.message || 'Unable to prepare the transaction-fee invoice.')
    } finally {
      setTransactionFeeInvoiceBusyId('')
    }
  }

  async function handleCompleteTransactionFeeInvoice(transactionId) {
    try {
      setTransactionFeeInvoiceBusyId(transactionId)
      setTransactionFeeInvoiceError('')
      await completeTransactionFeeInvoice(supabase, {
        transactionId,
        invoiceReference: transactionFeeInvoiceReferences[transactionId] || '',
      })
      await loadTransactionFeeInvoiceQueue()
    } catch (invoiceError) {
      setTransactionFeeInvoiceError(invoiceError?.message || 'Unable to complete the transaction-fee invoice.')
    } finally {
      setTransactionFeeInvoiceBusyId('')
    }
  }

  function openMatter(row) {
    if (row.unitId) {
      navigate(`/units/${row.unitId}`)
      return
    }
    navigate(`/transactions/${row.transactionId}`)
  }

  return (
    <section className="space-y-5">
      {error ? <p className="status-message error">{error}</p> : null}
      {loading ? <LoadingSkeleton lines={8} className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]" /> : null}

      {!loading ? (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Registered Fee Book"
              className="h-full"
              labelClassName="block max-w-full min-h-[1.1rem] truncate text-[0.62rem] uppercase tracking-[0.06em] leading-[1.25] text-[#64748b]"
              iconPosition="top"
              value={formatMoney(financialSummary.registeredFeeBook)}
              icon={DollarSign}
            />
            <MetricCard
              label="Total Invoiced"
              className="h-full"
              labelClassName="block max-w-full min-h-[1.1rem] truncate text-[0.62rem] uppercase tracking-[0.06em] leading-[1.25] text-[#64748b]"
              iconPosition="top"
              value={formatMoney(financialSummary.totalInvoiced)}
              icon={Receipt}
            />
            <MetricCard
              label="Collected / Paid"
              className="h-full"
              labelClassName="block max-w-full min-h-[1.1rem] truncate text-[0.62rem] uppercase tracking-[0.06em] leading-[1.25] text-[#64748b]"
              iconPosition="top"
              value={formatMoney(financialSummary.totalPaid)}
              icon={Wallet}
            />
            <MetricCard
              label="Outstanding"
              className="h-full"
              labelClassName="block max-w-full min-h-[1.1rem] truncate text-[0.62rem] uppercase tracking-[0.06em] leading-[1.25] text-[#64748b]"
              iconPosition="top"
              value={formatMoney(financialSummary.outstanding)}
              icon={FileBadge2}
            />
            <MetricCard
              label="Registered This Month"
              className="h-full"
              labelClassName="block max-w-full min-h-[1.1rem] truncate text-[0.62rem] uppercase tracking-[0.06em] leading-[1.25] text-[#64748b]"
              iconPosition="top"
              value={data.summary.registeredThisMonth || 0}
              icon={Receipt}
            />
          </section>

          <TransactionFeeInvoiceQueue
            items={transactionFeeInvoiceQueue}
            busyTransactionId={transactionFeeInvoiceBusyId}
            invoiceReferences={transactionFeeInvoiceReferences}
            deliveryEmails={transactionFeeInvoiceDeliveryEmails}
            error={transactionFeeInvoiceError}
            organisationName={workspace?.name || workspace?.displayName || ''}
            onPrepare={handlePrepareTransactionFeeInvoice}
            onReferenceChange={(transactionId, value) => setTransactionFeeInvoiceReferences((current) => ({ ...current, [transactionId]: value }))}
            onDeliveryEmailChange={(transactionId, value) => setTransactionFeeInvoiceDeliveryEmails((current) => ({ ...current, [transactionId]: value }))}
            onComplete={handleCompleteTransactionFeeInvoice}
          />

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <SectionHeader title="Registered Revenue Mix" copy="Expected, invoiced, paid, and outstanding across your registered matter fee book." />

            <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-[#edf2f7]">
              {breakdown.map((item) => (
                <div
                  key={item.key}
                  className={
                    item.key === 'expected'
                      ? 'bg-[#7ea2c7]'
                      : item.key === 'invoiced'
                        ? 'bg-[#4f7da3]'
                        : item.key === 'paid'
                          ? 'bg-[#2b8b53]'
                          : 'bg-[#d6a54f]'
                  }
                  style={{ width: item.width }}
                  aria-label={item.label}
                >
                  <span className="sr-only">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {breakdown.map((item) => (
                <article key={item.key} className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{item.label}</span>
                  <strong className="mt-2 block text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatMoney(item.value)}</strong>
                </article>
              ))}
            </div>
          </section>

          <DataTable
            title="Registered Matters Fee Table"
            copy="Each row shows the matter and the amount now added into the registered fee book."
            className="rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
          >
            {!registeredRows.length ? (
              <div className="attorney-clients-empty-state ui-table-shell-empty">
                <div className="attorney-clients-empty-icon">
                  <DollarSign size={28} />
                </div>
                <h3>No registered matters found.</h3>
                <p>Once a matter is marked as registered, its fee value will flow into this page automatically.</p>
              </div>
            ) : (
              <div className="max-h-[min(62vh,760px)] overflow-y-auto">
                <DataTableInner className="rounded-[24px] min-w-[1080px]">
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-[2]">Transaction / Property</th>
                      <th className="sticky top-0 z-[2]">Client</th>
                      <th className="sticky top-0 z-[2]">Registered On</th>
                      <th className="sticky top-0 z-[2]">Added to Fee Book</th>
                      <th className="sticky top-0 z-[2]">Invoiced</th>
                      <th className="sticky top-0 z-[2]">Payment Status</th>
                      <th className="sticky top-0 z-[2]">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredRows.map((row) => (
                      <tr
                        key={row.transactionId}
                        className="ui-data-row-clickable"
                        onClick={() => setSelectedRow(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedRow(row)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td>
                          <div className="grid gap-1">
                            <strong className="text-[0.98rem] font-semibold text-[#142132]">{getMatterLabel(row)}</strong>
                          </div>
                        </td>
                        <td>{row.clientName}</td>
                        <td>{formatDate(row.lastUpdated)}</td>
                        <td>{formatMoney(row.expectedFee)}</td>
                        <td>{formatMoney(row.invoicedAmount)}</td>
                        <td>
                          <span
                            className={`inline-flex whitespace-nowrap items-center rounded-full border px-3 py-1 text-[0.76rem] font-semibold ${getStatusClass(row.paymentStatus)}`}
                          >
                            {getStatusLabel(row.paymentStatus)}
                          </span>
                        </td>
                        <td>{formatRelativeDate(row.lastUpdated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTableInner>
              </div>
            )}
          </DataTable>
        </>
      ) : null}

      <FinancialDetailDrawer
        row={selectedRow}
        record={selectedRecord}
        loading={drawerLoading}
        saving={drawerSaving}
        error={drawerError}
        onClose={() => {
          setSelectedRow(null)
          setSelectedRecord(null)
          setDrawerError('')
        }}
        onSave={handleSave}
        onUpload={handleUpload}
        onOpenMatter={() => selectedRow && openMatter(selectedRow)}
      />
    </section>
  )
}

export default Financials
