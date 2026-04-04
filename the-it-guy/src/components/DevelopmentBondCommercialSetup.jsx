import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Field from './ui/Field'
import Modal from './ui/Modal'
import {
  fetchDevelopmentBondConfig,
  fetchDevelopmentBondReconciliationReport,
  saveDevelopmentBondConfig,
} from '../lib/api'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return '—'
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

function DevelopmentBondCommercialSetup({ developmentId, onSaved }) {
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
        fetchDevelopmentBondConfig(developmentId),
        fetchDevelopmentBondReconciliationReport(developmentId),
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
      eligibleCount: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalVariance: 0,
      outstandingStatements: 0,
      outstandingConfirmations: 0,
      closeOutPending: 0,
    }

    return report?.summary || emptySummary
  }, [report?.summary])

  async function handleSave(event) {
    event.preventDefault()
    if (!config || !developmentId) return

    try {
      setSaving(true)
      setError('')
      const saved = await saveDevelopmentBondConfig(developmentId, config)
      setConfig(saved)
      const reportResponse = await fetchDevelopmentBondReconciliationReport(developmentId)
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
        Loading bond commercial setup...
      </p>
    )
  }

  if (!config || !report) return null

  const modelLabel = config.commissionModelType === 'percentage' ? 'Percentage model' : 'Fixed amount model'
  const summaryCards = [
    [
      'Mandated Originator',
      config.bondOriginatorName || 'Not configured',
      config.primaryContactName || 'Primary contact still missing',
    ],
    [
      'Commission Default',
      config.commissionModelType === 'percentage'
        ? `${Number(config.defaultCommissionAmount || 0)}%`
        : formatCurrency(config.defaultCommissionAmount),
      modelLabel,
    ],
    [
      'Close-Out Defaults',
      `${selectedRequiredDocuments.length} required documents`,
      config.overrideAllowed ? 'Per-deal commission overrides allowed' : 'Per-deal overrides locked',
    ],
    [
      'Eligible Bond Matters',
      Number(displaySummary.eligibleCount || 0),
      `${Number(displaySummary.closeOutPending || 0)} still need commission close-out`,
    ],
  ]

  return (
    <div className="grid gap-4">
      <section className="min-w-0 max-w-full rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Bond Originator Setup</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                Set the originator relationship once, lock the commission model, and keep the payout rules clean for every bond-backed matter.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={config.bondOriginatorName ? 'success' : 'warning'}>
                {config.bondOriginatorName ? 'Originator configured' : 'Originator missing'}
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
                  <h4 className="text-base font-semibold text-[#142132]">Originator and commission model</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Capture the mandated originator, how Bridge earns, and the default payout assumption for granted bonds.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={() => setRulesModalOpen(true)}>
                  Configure rules
                </Button>
              </div>
              <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SetupField label="Bond Originator">
                  <Field
                    type="text"
                    value={config.bondOriginatorName}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, bondOriginatorName: event.target.value }))
                    }
                    placeholder="OOBA"
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
                <SetupField label="Commission Model">
                  <Field
                    as="select"
                    value={config.commissionModelType || 'fixed_fee'}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, commissionModelType: event.target.value }))
                    }
                  >
                    <option value="fixed_fee">Fixed Amount</option>
                    <option value="percentage">Percentage</option>
                  </Field>
                </SetupField>
                <SetupField label="Contact Email">
                  <Field
                    type="email"
                    value={config.primaryContactEmail}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, primaryContactEmail: event.target.value }))
                    }
                    placeholder="originator@firm.com"
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
                <SetupField
                  label={
                    config.commissionModelType === 'percentage'
                      ? 'Expected Commission Per Granted Bond (%)'
                      : 'Expected Commission Per Granted Bond'
                  }
                >
                  <Field
                    type="number"
                    min="0"
                    step="0.01"
                    value={config.defaultCommissionAmount ?? ''}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        defaultCommissionAmount: event.target.value,
                      }))
                    }
                    placeholder={config.commissionModelType === 'percentage' ? '1.25' : '7500'}
                  />
                </SetupField>
                <article className="rounded-[16px] border border-[#dfe8f1] bg-white px-4 py-4 md:col-span-2 xl:col-span-3">
                  <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Rule snapshot</span>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={config.commissionModelType === 'percentage' ? 'neutral' : 'success'}>
                      {config.commissionModelType === 'percentage' ? 'Percentage commission' : 'Fixed commission'}
                    </StatusBadge>
                    <StatusBadge tone={config.vatIncluded ? 'success' : 'neutral'}>
                      {config.vatIncluded ? 'VAT included' : 'VAT excluded'}
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
                  {selectedRequiredDocuments.length} commission close-out documents required by default.
                </span>
                <span className="block text-xs text-[#6b7d93]">
                  Eligible bond matters inherit these rules and reconcile against them immediately.
                </span>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Bond Originator Setup'}
              </Button>
            </div>
          </form>
        </div>
      </section>

      <Modal
        open={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
        title="Bond Originator Rules"
        subtitle="Adjust override behavior, close-out requirements, and notes without keeping a permanent side column on screen."
        className="max-w-4xl"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
            <div className="mb-4">
              <h4 className="text-base font-semibold text-[#142132]">Operating rules</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                Control whether VAT is baked into the fee and how much live deal-level flexibility the team has.
              </p>
            </div>
            <div className="grid gap-3">
              <ToggleCard
                title="VAT Included"
                copy="Record whether the agreed commission amount already includes VAT."
                checked={Boolean(config.vatIncluded)}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, vatIncluded: event.target.checked }))
                }
              />
              <ToggleCard
                title="Allow Transaction Overrides"
                copy="Allow per-transaction overrides where commission differs from the default development agreement."
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
                Keep payout assumptions and special terms close to the mandate without crowding the main setup form.
              </p>
            </div>
            <SetupField label="Notes">
              <Field
                as="textarea"
                rows={6}
                className="min-h-[220px]"
                value={config.notes}
                onChange={(event) => setConfig((previous) => ({ ...previous, notes: event.target.value }))}
                placeholder="Commission agreement notes, payout assumptions, or development-specific billing terms."
              />
            </SetupField>
          </section>

          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5 lg:col-span-2">
            <div className="mb-4">
              <h4 className="text-base font-semibold text-[#142132]">Required close-out documents</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                Choose the supporting payout artifacts that must exist before a granted bond can be commercially closed.
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
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Bond Commission Reconciliation</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                See the current commission pool, spot missing payout proof, and understand which bond matters still block close-out.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={displaySummary.outstandingStatements ? 'warning' : 'success'}>
                {Number(displaySummary.outstandingStatements || 0)} statements missing
              </StatusBadge>
              <StatusBadge tone={displaySummary.outstandingConfirmations ? 'warning' : 'success'}>
                {Number(displaySummary.outstandingConfirmations || 0)} approvals missing
              </StatusBadge>
              <StatusBadge tone={displaySummary.closeOutPending ? 'warning' : 'success'}>
                {Number(displaySummary.closeOutPending || 0)} close-outs pending
              </StatusBadge>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Eligible Bond Matters"
              value={displaySummary.eligibleCount}
              meta="Current bond-backed matters in scope for reconciliation"
            />
            <SummaryCard
              label="Total Budgeted"
              value={formatCurrency(displaySummary.totalBudgeted)}
              meta="Expected commission pool based on the agreed model"
            />
            <SummaryCard
              label="Total Actual Paid"
              value={formatCurrency(displaySummary.totalActual)}
              meta="Captured from settlement statements and confirmations"
            />
            <SummaryCard
              label="Variance"
              value={formatCurrency(displaySummary.totalVariance)}
              meta="Difference between expected commission and what has been paid"
            />
          </div>

          <div className="min-w-0 overflow-hidden rounded-[18px] border border-[#e3ebf4]">
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-full divide-y divide-[#e8eef5]">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['Matter', 'Commission', 'Documents', 'Close-Out', 'Reconciliation'].map((heading) => (
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
                              {item.bondOriginator || config.bondOriginatorName || 'Originator not set'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[230px] space-y-2 text-sm text-[#22384c]">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#6b7d93]">Expected</span>
                              <strong className="font-semibold text-[#142132]">{formatCurrency(item.budgetedAmount)}</strong>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#6b7d93]">Actual paid</span>
                              <strong className="font-semibold text-[#142132]">{formatCurrency(item.actualPaidAmount)}</strong>
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
                              <span className="text-sm text-[#6b7d93]">Statement</span>
                              <DocumentState
                                href={item.statementUrl}
                                uploaded={item.statementUploaded}
                                missingLabel="Missing"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm text-[#6b7d93]">Approval proof</span>
                              <DocumentState
                                href={item.confirmationUrl}
                                uploaded={item.confirmationUploaded}
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
                        No approved bond matters are available for commission reconciliation yet.
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

export default DevelopmentBondCommercialSetup
