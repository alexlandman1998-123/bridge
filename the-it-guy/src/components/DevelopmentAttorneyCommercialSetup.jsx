import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Field from './ui/Field'
import Modal from './ui/Modal'
import {
  fetchDevelopmentAttorneyConfig,
  fetchDevelopmentAttorneyReconciliationReport,
  saveDevelopmentAttorneyConfig,
} from '../lib/api'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) {
    return '—'
  }

  return currency.format(Number(value))
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function SetupField({ label, className = '', children }) {
  return (
    <label className={`grid gap-2 text-sm font-medium text-[#35546c] ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function SummaryCard({ label, value, meta }) {
  return (
    <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
      <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
      <strong className="mt-2 block text-lg font-semibold text-[#142132]">{value}</strong>
      {meta ? <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">{meta}</span> : null}
    </article>
  )
}

function ToggleCard({ title, copy, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
      <div className="min-w-0">
        <strong className="block text-sm font-semibold text-[#142132]">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{copy}</span>
      </div>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-[#c7d6e5] text-[#35546c] focus:ring-[#35546c]"
        checked={checked}
        onChange={onChange}
      />
    </label>
  )
}

function StatusBadge({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'border-[#e3ebf4] bg-[#f8fafc] text-[#5f748b]',
    warning: 'border-[#f5ddad] bg-[#fff8eb] text-[#9a6700]',
    success: 'border-[#cfe9d8] bg-[#effaf3] text-[#1d7a46]',
    danger: 'border-[#f3d0cb] bg-[#fff4f2] text-[#b42318]',
  }[tone]

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.04em] ${toneClass}`}
    >
      {children}
    </span>
  )
}

function DocumentState({ href, uploaded, downloadLabel = 'Download', uploadedLabel = 'Uploaded', missingLabel }) {
  if (href) {
    return (
      <a
        className="inline-flex items-center rounded-full border border-[#d9e4ef] bg-white px-3 py-1 text-xs font-semibold text-[#35546c] transition hover:bg-[#f8fafc]"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {downloadLabel}
      </a>
    )
  }

  if (uploaded) {
    return <StatusBadge tone="success">{uploadedLabel}</StatusBadge>
  }

  return <StatusBadge tone="warning">{missingLabel}</StatusBadge>
}

function DevelopmentAttorneyCommercialSetup({ developmentId, onSaved }) {
  const [config, setConfig] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rulesModalOpen, setRulesModalOpen] = useState(false)

  const load = useCallback(async () => {
    if (!developmentId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const [configResponse, reportResponse] = await Promise.all([
        fetchDevelopmentAttorneyConfig(developmentId),
        fetchDevelopmentAttorneyReconciliationReport(developmentId),
      ])
      setConfig(configResponse)
      setReport(reportResponse)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [developmentId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedRequiredDocuments = useMemo(
    () => (config?.requiredDocuments || []).filter((item) => item.requiredForCloseOut),
    [config?.requiredDocuments],
  )
  const displayRows = report?.rows || []
  const displaySummary = useMemo(() => {
    const emptySummary = {
      registeredCount: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalVariance: 0,
      outstandingInvoices: 0,
      outstandingStatements: 0,
      closeOutPending: 0,
    }

    return report?.summary || emptySummary
  }, [report?.summary])

  async function handleSave(event) {
    event.preventDefault()
    if (!config || !developmentId) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const saved = await saveDevelopmentAttorneyConfig(developmentId, config)
      setConfig(saved)
      const reportResponse = await fetchDevelopmentAttorneyReconciliationReport(developmentId)
      setReport(reportResponse)
      onSaved?.(saved)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
        Loading attorney commercial setup...
      </p>
    )
  }

  if (!config || !report) {
    return null
  }

  const summaryCards = [
    [
      'Mandated Firm',
      config.attorneyFirmName || 'Not configured',
      config.primaryContactName || 'Primary contact still missing',
    ],
    [
      'Fee Per Unit',
      formatCurrency(config.defaultFeeAmount),
      config.vatIncluded ? 'VAT already included in the agreement' : 'VAT is currently excluded',
    ],
    [
      'Close-Out Defaults',
      `${selectedRequiredDocuments.length} required documents`,
      config.disbursementsIncluded ? 'Disbursements included in the agreed fee' : 'Disbursements tracked separately',
    ],
    [
      'Registered Matters',
      Number(displaySummary.registeredCount || 0),
      `${Number(displaySummary.closeOutPending || 0)} still need close-out completion`,
    ],
  ]

  return (
    <div className="grid gap-4">
      <section className="min-w-0 max-w-full rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Conveyancing Setup</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                Keep the firm mandate, fee defaults, and close-out rules in one place so each transaction inherits a clean commercial starting point.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={config.attorneyFirmName ? 'success' : 'warning'}>
                {config.attorneyFirmName ? 'Firm configured' : 'Firm missing'}
              </StatusBadge>
              <StatusBadge tone={selectedRequiredDocuments.length ? 'neutral' : 'warning'}>
                {selectedRequiredDocuments.length} close-out docs required
              </StatusBadge>
              <StatusBadge tone={config.overrideAllowed ? 'neutral' : 'warning'}>
                {config.overrideAllowed ? 'Overrides allowed' : 'Overrides locked'}
              </StatusBadge>
            </div>
          </div>

          {error ? (
            <p className="rounded-[16px] border border-[#f6d6d2] bg-[#fff3f2] px-4 py-3 text-sm text-[#b42318]">
              {error}
            </p>
          ) : null}

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(([label, value, meta]) => (
              <SummaryCard key={label} label={label} value={value} meta={meta} />
            ))}
          </div>

          <form className="grid gap-5" onSubmit={handleSave}>
            <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <h4 className="text-base font-semibold text-[#142132]">Mandate and fee defaults</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Capture the commercial terms once here so unit matters inherit the correct legal fee assumptions.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={() => setRulesModalOpen(true)}>
                  Configure rules
                </Button>
              </div>
              <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SetupField label="Mandated Conveyancing Firm">
                  <Field
                    type="text"
                    value={config.attorneyFirmName}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, attorneyFirmName: event.target.value }))
                    }
                    placeholder="Tuckers Attorneys"
                  />
                </SetupField>
                <SetupField label="Primary Contact">
                  <Field
                    type="text"
                    value={config.primaryContactName}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, primaryContactName: event.target.value }))
                    }
                    placeholder="Contact name"
                  />
                </SetupField>
                <SetupField label="Budgeted Transfer Fee Per Unit">
                  <Field
                    type="number"
                    min="0"
                    step="0.01"
                    value={config.defaultFeeAmount ?? ''}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, defaultFeeAmount: event.target.value }))
                    }
                    placeholder="25000"
                  />
                </SetupField>
                <SetupField label="Contact Email">
                  <Field
                    type="email"
                    value={config.primaryContactEmail}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, primaryContactEmail: event.target.value }))
                    }
                    placeholder="legal@firm.com"
                  />
                </SetupField>
                <SetupField label="Contact Phone">
                  <Field
                    type="text"
                    value={config.primaryContactPhone}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, primaryContactPhone: event.target.value }))
                    }
                    placeholder="+27 ..."
                  />
                </SetupField>
                <article className="rounded-[16px] border border-[#dfe8f1] bg-white px-4 py-4">
                  <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Rule snapshot</span>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={config.vatIncluded ? 'success' : 'neutral'}>
                      {config.vatIncluded ? 'VAT included' : 'VAT excluded'}
                    </StatusBadge>
                    <StatusBadge tone={config.disbursementsIncluded ? 'success' : 'neutral'}>
                      {config.disbursementsIncluded ? 'Disbursements included' : 'Disbursements separate'}
                    </StatusBadge>
                    <StatusBadge tone={config.overrideAllowed ? 'neutral' : 'warning'}>
                      {config.overrideAllowed ? 'Overrides allowed' : 'Overrides locked'}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#6b7d93]">
                    {selectedRequiredDocuments.length} required close-out documents are currently enforced.
                  </p>
                </article>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-4">
              <div className="space-y-1">
                <span className="block text-sm font-medium text-[#35546c]">
                  {selectedRequiredDocuments.length} close-out documents required by default.
                </span>
                <span className="block text-xs text-[#6b7d93]">
                  Transaction matters inherit these rules and can reconcile against them immediately.
                </span>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Conveyancing Setup'}
              </Button>
            </div>
          </form>
        </div>
      </section>

      <Modal
        open={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
        title="Conveyancing Rules"
        subtitle="Adjust close-out requirements, override flexibility, and commercial notes without leaving the main setup flow."
        className="max-w-4xl"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
            <div className="mb-4">
              <h4 className="text-base font-semibold text-[#142132]">Operating rules</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                Decide how much flexibility the live matters team has once this mandate is in use.
              </p>
            </div>
            <div className="grid gap-3">
              <ToggleCard
                title="VAT Included"
                copy="Track whether the agreed development legal fee already includes VAT."
                checked={Boolean(config.vatIncluded)}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, vatIncluded: event.target.checked }))
                }
              />
              <ToggleCard
                title="Disbursements Included"
                copy="Record whether disbursements and out-of-pocket costs sit inside the budgeted fee."
                checked={Boolean(config.disbursementsIncluded)}
                onChange={(event) =>
                  setConfig((previous) => ({
                    ...previous,
                    disbursementsIncluded: event.target.checked,
                  }))
                }
              />
              <ToggleCard
                title="Allow Transaction Overrides"
                copy="Let the team override the fee on individual matters when a deal has special legal pricing."
                checked={Boolean(config.overrideAllowed)}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, overrideAllowed: event.target.checked }))
                }
              />
            </div>
          </section>

          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
            <div className="mb-4">
              <h4 className="text-base font-semibold text-[#142132]">Commercial Notes</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                Keep billing notes and special terms close to the mandate without crowding the main form.
              </p>
            </div>
            <SetupField label="Notes">
              <Field
                as="textarea"
                rows={6}
                className="min-h-[220px]"
                value={config.notes}
                onChange={(event) => setConfig((previous) => ({ ...previous, notes: event.target.value }))}
                placeholder="Billing notes, special terms, or reconciliation guidance for this development."
              />
            </SetupField>
          </section>

          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5 lg:col-span-2">
            <div className="mb-4">
              <h4 className="text-base font-semibold text-[#142132]">Required close-out documents</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                Choose what must exist before a registered transaction can be treated as commercially complete.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(config.requiredDocuments || []).map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-3 text-sm text-[#22384c]"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#c7d6e5] text-[#35546c] focus:ring-[#35546c]"
                    checked={Boolean(item.requiredForCloseOut)}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        requiredDocuments: previous.requiredDocuments.map((doc) =>
                          doc.key === item.key
                            ? { ...doc, requiredForCloseOut: event.target.checked }
                            : doc,
                        ),
                      }))
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </Modal>

      <section className="min-w-0 max-w-full rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Conveyancing Reconciliation</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                Review registered matters, compare budget to actual billed amounts, and see which files still need statements or close-out work.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={displaySummary.outstandingInvoices ? 'warning' : 'success'}>
                {Number(displaySummary.outstandingInvoices || 0)} invoices missing
              </StatusBadge>
              <StatusBadge tone={displaySummary.outstandingStatements ? 'warning' : 'success'}>
                {Number(displaySummary.outstandingStatements || 0)} statements missing
              </StatusBadge>
              <StatusBadge tone={displaySummary.closeOutPending ? 'warning' : 'success'}>
                {Number(displaySummary.closeOutPending || 0)} close-outs pending
              </StatusBadge>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Registered Transactions"
              value={displaySummary.registeredCount}
              meta="Current matters in the registered transfer pool"
            />
            <SummaryCard
              label="Total Budgeted"
              value={formatCurrency(displaySummary.totalBudgeted)}
              meta="Expected revenue across registered transfer deals"
            />
            <SummaryCard
              label="Total Actual"
              value={formatCurrency(displaySummary.totalActual)}
              meta="Captured from attorney statements and live close-out records"
            />
            <SummaryCard
              label="Variance"
              value={formatCurrency(displaySummary.totalVariance)}
              meta="Difference between budget and actual billed value"
            />
          </div>

          <div className="min-w-0 overflow-hidden rounded-[18px] border border-[#e3ebf4]">
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-full divide-y divide-[#e8eef5]">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['Matter', 'Budget vs Actual', 'Documents', 'Close-Out', 'Reconciliation'].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7] bg-white">
                  {displayRows.map((item) => {
                    const variance = Number(item.varianceAmount || 0)
                    return (
                      <tr key={item.transactionId} className="align-top transition hover:bg-[#f8fafc]">
                        <td className="px-4 py-4">
                          <div className="min-w-[220px]">
                            <strong className="block text-sm font-semibold text-[#142132]">{item.unitNumber}</strong>
                            <span className="mt-1 block text-sm text-[#22384c]">{item.buyerName || 'Buyer not linked'}</span>
                            <span className="mt-1 block text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">
                              {item.attorney || config.attorneyFirmName || 'Mandated attorney not set'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[230px] space-y-2 text-sm text-[#22384c]">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#6b7d93]">Budgeted</span>
                              <strong className="font-semibold text-[#142132]">{formatCurrency(item.budgetedAmount)}</strong>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#6b7d93]">Actual</span>
                              <strong className="font-semibold text-[#142132]">{formatCurrency(item.actualBilledAmount)}</strong>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#6b7d93]">Variance</span>
                              <StatusBadge tone={variance === 0 ? 'success' : variance > 0 ? 'warning' : 'danger'}>
                                {formatCurrency(item.varianceAmount)}
                              </StatusBadge>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[220px] space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm text-[#6b7d93]">Invoice</span>
                              <DocumentState
                                href={item.invoiceUrl}
                                uploaded={item.invoiceUploaded}
                                missingLabel="Missing"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm text-[#6b7d93]">Statement</span>
                              <DocumentState
                                href={item.statementUrl}
                                uploaded={item.statementUploaded}
                                missingLabel="Missing"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[180px] space-y-2">
                            <StatusBadge tone={item.isClosed ? 'success' : 'warning'}>
                              {item.isClosed ? 'Closed' : 'Open'}
                            </StatusBadge>
                            <div className="text-sm text-[#22384c]">{toTitleLabel(item.closeOutStatus)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[180px]">
                            <StatusBadge
                              tone={
                                item.reconciliationStatus === 'reconciled'
                                  ? 'success'
                                  : item.reconciliationStatus === 'variance_detected'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {toTitleLabel(item.reconciliationStatus)}
                            </StatusBadge>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!displayRows.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#6b7d93]">
                        No registered transactions are available for attorney reconciliation yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default DevelopmentAttorneyCommercialSetup
