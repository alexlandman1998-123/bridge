import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer, RotateCcw } from 'lucide-react'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ReportView from '../components/ReportView'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentOptions, fetchReportRows, RISK_STATUSES } from '../lib/api'
import { financeTypeMatchesFilter, financeTypeShortLabel } from '../core/transactions/financeType'
import { getReportNextAction } from '../core/transactions/reportNextAction'
import { STAGES, isInTransferStage } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const REPORT_TYPES = [
  { value: 'overview', label: 'Overview' },
  { value: 'unit_view', label: 'Unit View' },
]

const TRANSACTION_SCOPE_OPTIONS = [
  { value: 'all_transactions', label: 'All Transactions' },
  { value: 'active_transactions', label: 'Active Transactions' },
  { value: 'in_transfer', label: 'In Transfer' },
  { value: 'registered', label: 'Registered' },
  { value: 'attention_needed', label: 'Delayed / Attention Needed' },
]

const FINANCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Finance Types' },
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'combination', label: 'Combination' },
]

const STAGE_FILTER_OPTIONS = [{ value: 'all', label: 'All Stages' }, ...STAGES.map((stage) => ({ value: stage, label: stage }))]

const RISK_FILTER_OPTIONS = [{ value: 'all', label: 'All Risk Statuses' }, ...RISK_STATUSES.map((risk) => ({ value: risk, label: risk }))]
const MARKETING_SOURCE_BENCHMARKS = {
  property24: 1250,
  website: 420,
  show_day: 280,
  referral: 180,
  walk_in: 240,
  facebook: 560,
  other: 320,
  unknown: 250,
}

const REPORT_EXPORT_CSS = `
  @page {
    size: A4 portrait;
    margin: 12mm;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #eef3f8;
    color: #0f172a;
    font-family: Inter, "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  body.report-export-window {
    padding: 28px;
  }

  .report-export-shell {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    display: grid;
    gap: 18px;
  }

  .investor-print-page {
    display: grid !important;
    grid-template-rows: auto 1fr auto;
    gap: 20px;
    min-height: 254mm;
    padding: 18mm 16mm 14mm;
    border: 1px solid #dce3ee;
    border-radius: 24px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-page-one {
    break-after: page;
    page-break-after: always;
  }

  .report-doc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid #e8eef5;
  }

  .report-doc-eyebrow {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #64748b;
  }

  .report-doc-head h1 {
    margin: 0;
    font-size: 30px;
    line-height: 0.98;
    letter-spacing: -0.045em;
    color: #102033;
  }

  .report-doc-subtitle {
    margin: 10px 0 0;
    font-size: 14px;
    color: #5d7085;
  }

  .report-doc-head-meta {
    min-width: 180px;
    display: grid;
    gap: 6px;
    text-align: right;
  }

  .report-doc-head-meta span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7b8ca2;
  }

  .report-doc-head-meta strong {
    font-size: 14px;
    color: #102033;
  }

  .report-doc-body {
    display: grid;
    gap: 18px;
    align-content: start;
  }

  .report-doc-body-table {
    gap: 0;
  }

  .report-doc-kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .report-doc-kpis article,
  .report-doc-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-doc-kpis article {
    padding: 16px 18px;
    border: 1px solid #dce3ee;
    border-radius: 18px;
    background: #fbfdff;
  }

  .report-doc-kpis span,
  .report-doc-card > header span,
  .report-doc-mini-kpis span {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7b8ca2;
  }

  .report-doc-kpis strong {
    display: block;
    margin-top: 12px;
    font-size: 22px;
    line-height: 1.05;
    color: #102033;
  }

  .report-doc-grid {
    display: grid;
    gap: 16px;
    align-items: start;
  }

  .report-doc-grid-primary,
  .report-doc-grid-secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-doc-card {
    padding: 18px 20px;
    border: 1px solid #dce3ee;
    border-radius: 20px;
    background: #ffffff;
  }

  .report-doc-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .report-doc-card > header h3 {
    margin: 0;
    font-size: 18px;
    line-height: 1.15;
    color: #102033;
  }

  .report-doc-mini-kpis {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .report-doc-mini-kpis div {
    padding: 14px;
    border: 1px solid #e6edf5;
    border-radius: 14px;
    background: #fbfdff;
  }

  .report-doc-mini-kpis strong {
    display: block;
    margin-top: 8px;
    font-size: 18px;
    line-height: 1.1;
    color: #102033;
  }

  .report-doc-source-list,
  .report-doc-stage-list,
  .report-doc-finance-list {
    display: grid;
    gap: 12px;
  }

  .report-doc-source-row,
  .report-doc-finance-row {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid #e6edf5;
    border-radius: 14px;
    background: #fbfdff;
  }

  .report-doc-source-row > div,
  .report-doc-finance-row > div {
    display: grid;
    gap: 4px;
    align-content: start;
  }

  .report-doc-source-row strong,
  .report-doc-finance-row strong,
  .report-doc-stage-row strong {
    display: block;
    margin: 0;
    font-size: 14px;
    color: #102033;
  }

  .report-doc-source-row span,
  .report-doc-finance-row span,
  .report-doc-stage-row span,
  .report-doc-empty,
  .report-doc-table td span {
    font-size: 13px;
    line-height: 1.45;
    color: #5d7085;
  }

  .report-doc-source-bar,
  .report-doc-stage-row .track {
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    background: #e7edf5;
  }

  .report-doc-source-bar em,
  .report-doc-stage-row .track em {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #35566f 0%, #6f90ab 100%);
  }

  .report-doc-mix {
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
  }

  .report-doc-donut {
    position: relative;
    width: 108px;
    height: 108px;
    border-radius: 999px;
    margin: 0 auto;
  }

  .report-doc-donut > div {
    position: absolute;
    inset: 24px;
    border-radius: 999px;
    background: #ffffff;
  }

  .report-doc-finance-row {
    grid-template-columns: 10px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: flex-start;
  }

  .report-doc-finance-row .swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
  }

  .report-doc-finance-row em {
    font-style: normal;
    font-size: 13px;
    font-weight: 700;
    color: #243b53;
    align-self: center;
  }

  .report-doc-stage-row {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr) 36px;
    gap: 12px;
    align-items: center;
  }

  .report-doc-stage-row strong {
    text-align: right;
  }

  .report-doc-mini-table,
  .report-doc-table {
    width: 100%;
    border-collapse: collapse;
  }

  .report-doc-mini-table th,
  .report-doc-mini-table td,
  .report-doc-table th,
  .report-doc-table td {
    padding: 12px 10px;
    border-bottom: 1px solid #e8eef5;
    text-align: left;
    vertical-align: top;
  }

  .report-doc-mini-table th,
  .report-doc-table th {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7b8ca2;
  }

  .report-doc-mini-table td,
  .report-doc-table td {
    font-size: 13px;
    line-height: 1.45;
    color: #102033;
  }

  .report-doc-card-table {
    padding: 18px 20px 10px;
  }

  .report-doc-table td strong {
    display: block;
    margin-bottom: 4px;
  }

  .report-doc-table td.comment-cell {
    color: #425466;
  }

  .report-doc-progress {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .report-doc-progress-node {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
  }

  .report-doc-progress-node:last-child {
    flex: 0 0 auto;
  }

  .report-doc-progress-node .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    border: 1px solid #c7d4e3;
    background: #ffffff;
    position: relative;
    z-index: 1;
  }

  .report-doc-progress-node .line {
    height: 2px;
    flex: 1 1 auto;
    margin: 0 3px;
    background: #dbe4ee;
  }

  .report-doc-progress-node.complete .dot,
  .report-doc-progress-node.complete .line {
    background: #35546c;
    border-color: #35546c;
  }

  .report-doc-progress-node.current .dot {
    width: 10px;
    height: 10px;
    background: #1f425c;
    border-color: #1f425c;
    box-shadow: 0 0 0 3px rgba(31, 66, 92, 0.14);
  }

  .report-doc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid #e8eef5;
    font-size: 11px;
    color: #6b7d93;
  }

  @media print {
    html, body {
      background: #ffffff;
    }

    body.report-export-window {
      padding: 0;
    }

    .report-export-shell {
      max-width: none;
      gap: 0;
    }

    .investor-print-page {
      min-height: auto;
      padding: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .report-page-one {
      gap: 12px;
    }

    .report-page-one .report-doc-head {
      gap: 12px;
      padding-bottom: 12px;
    }

    .report-doc-head h1 {
      font-size: 23px;
    }

    .report-page-one .report-doc-subtitle {
      margin-top: 6px;
      font-size: 12px;
    }

    .report-page-one .report-doc-head-meta {
      gap: 4px;
    }

    .report-page-one .report-doc-body {
      gap: 12px;
    }

    .report-page-one .report-doc-kpis {
      gap: 8px;
    }

    .report-page-one .report-doc-kpis article {
      padding: 10px 12px;
      border-radius: 14px;
    }

    .report-page-one .report-doc-kpis strong {
      margin-top: 8px;
      font-size: 18px;
    }

    .report-page-one .report-doc-grid {
      gap: 10px;
    }

    .report-page-one .report-doc-card {
      padding: 12px 14px;
      border-radius: 16px;
    }

    .report-page-one .report-doc-card > header {
      margin-bottom: 10px;
    }

    .report-page-one .report-doc-card > header h3 {
      font-size: 16px;
    }

    .report-page-one .report-doc-mini-kpis {
      gap: 8px;
      margin-bottom: 10px;
    }

    .report-page-one .report-doc-mini-kpis div {
      padding: 10px;
      border-radius: 12px;
    }

    .report-page-one .report-doc-mini-kpis strong {
      font-size: 16px;
      margin-top: 6px;
    }

    .report-page-one .report-doc-source-list,
    .report-page-one .report-doc-stage-list,
    .report-page-one .report-doc-finance-list {
      gap: 8px;
    }

    .report-page-one .report-doc-source-row,
    .report-page-one .report-doc-finance-row {
      padding: 10px;
      gap: 6px;
      border-radius: 12px;
    }

    .report-page-one .report-doc-source-row strong,
    .report-page-one .report-doc-finance-row strong,
    .report-page-one .report-doc-stage-row strong {
      font-size: 12px;
    }

    .report-page-one .report-doc-source-row span,
    .report-page-one .report-doc-finance-row span,
    .report-page-one .report-doc-stage-row span,
    .report-page-one .report-doc-empty,
    .report-page-one .report-doc-table td span {
      font-size: 11px;
      line-height: 1.35;
    }

    .report-page-one .report-doc-mix {
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 10px;
    }

    .report-page-one .report-doc-donut {
      width: 80px;
      height: 80px;
    }

    .report-page-one .report-doc-donut > div {
      inset: 18px;
    }

    .report-page-one .report-doc-stage-row {
      grid-template-columns: 112px minmax(0, 1fr) 26px;
      gap: 8px;
    }

    .report-page-one .report-doc-mini-table th,
    .report-page-one .report-doc-mini-table td {
      padding: 8px 6px;
      font-size: 10px;
    }

    .report-page-one .report-doc-foot {
      padding-top: 10px;
      font-size: 10px;
    }

    .report-doc-card,
    .report-doc-kpis article {
      box-shadow: none;
    }
  }
`

function normalizeSourceKey(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown'
}

function prettifySource(value) {
  const source = String(value || '').trim()
  if (!source) return 'Unknown'
  return source
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getPurchasePriceValue(row) {
  const raw = row.transaction?.sales_price ?? row.report?.purchasePrice ?? row.unit?.price
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

function toMainStage(row) {
  const main = String(row?.transaction?.current_main_stage || row?.report?.currentMainStage || '')
    .trim()
    .toUpperCase()
  if (main) return main
  const stage = String(row?.stage || '').toLowerCase()
  if (stage.includes('available')) return 'AVAIL'
  if (stage.includes('deposit')) return 'DEP'
  if (stage.includes('otp') || stage.includes('reserved') || stage.includes('sign')) return 'OTP'
  if (stage.includes('finance') || stage.includes('bank') || stage.includes('bond')) return 'FIN'
  if (stage.includes('attorney') || stage.includes('tuckers')) return 'ATTY'
  if (stage.includes('transfer') || stage.includes('lodg')) return 'XFER'
  if (stage.includes('registered')) return 'REG'
  return 'AVAIL'
}

function formatExportDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '')
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function Report() {
  const { workspace } = useWorkspace()
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [filters, setFilters] = useState({
    reportType: 'overview',
    developmentId: workspace.id === 'all' ? 'all' : workspace.id,
    transactionScope: 'all_transactions',
    financeType: 'all',
    stage: 'all',
    riskStatus: 'all',
    marketingSpend: '',
  })
  const [baseRows, setBaseRows] = useState([])
  const [generatedAt, setGeneratedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const [rows, options] = await Promise.all([
        fetchReportRows({
          developmentId: filters.developmentId === 'all' ? null : filters.developmentId,
        }),
        fetchDevelopmentOptions(),
      ])

      setBaseRows(rows)
      setDevelopmentOptions(options)
      setGeneratedAt(new Date().toLocaleString())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [filters.developmentId])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  useEffect(() => {
    setFilters((previous) => ({
      ...previous,
      developmentId: workspace.id === 'all' ? previous.developmentId : workspace.id,
    }))
  }, [workspace.id])

  useEffect(() => {
    document.body.classList.remove('report-export-active')
    return () => {
      document.body.classList.remove('report-export-active')
    }
  }, [])

  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString())
  }, [
    filters.reportType,
    filters.developmentId,
    filters.transactionScope,
    filters.financeType,
    filters.stage,
    filters.riskStatus,
    filters.marketingSpend,
  ])

  const filteredRows = useMemo(() => {
    let scopedRows = [...baseRows]

    if (filters.transactionScope === 'active_transactions') {
      scopedRows = scopedRows.filter((row) => row.stage !== 'Registered' && row.stage !== 'Available')
    }

    if (filters.transactionScope === 'in_transfer') {
      scopedRows = scopedRows.filter((row) => isInTransferStage(row.stage))
    }

    if (filters.transactionScope === 'registered') {
      scopedRows = scopedRows.filter((row) => row.stage === 'Registered')
    }

    if (filters.transactionScope === 'attention_needed') {
      scopedRows = scopedRows.filter((row) => ['Delayed', 'Blocked'].includes(row.report?.riskStatus || ''))
    }

    if (filters.financeType !== 'all') {
      scopedRows = scopedRows.filter((row) => financeTypeMatchesFilter(row.transaction?.finance_type, filters.financeType))
    }

    if (filters.stage !== 'all') {
      scopedRows = scopedRows.filter((row) => row.stage === filters.stage)
    }

    if (filters.riskStatus !== 'all') {
      scopedRows = scopedRows.filter((row) => (row.report?.riskStatus || 'On Track') === filters.riskStatus)
    }

    return scopedRows
  }, [baseRows, filters.financeType, filters.riskStatus, filters.stage, filters.transactionScope])

  const summary = useMemo(
    () => ({
      totalTransactions: filteredRows.length,
      inProgress: filteredRows.filter((row) => row.stage !== 'Registered' && row.stage !== 'Available').length,
      inTransfer: filteredRows.filter((row) => isInTransferStage(row.stage)).length,
      registered: filteredRows.filter((row) => row.stage === 'Registered').length,
      delayedAttention: filteredRows.filter((row) => ['Delayed', 'Blocked'].includes(row.report?.riskStatus || '')).length,
      totalRevenue: filteredRows.reduce((total, row) => total + getPurchasePriceValue(row), 0),
    }),
    [filteredRows],
  )

  const marketingSummary = useMemo(() => {
    const bySource = {}
    let totalLeads = 0
    let totalConverted = 0
    let attributedRevenue = 0
    let estimatedSpend = 0

    for (const row of filteredRows) {
      const sourceRaw = row.transaction?.marketing_source || row.transaction?.lead_source || 'Unknown'
      const sourceKey = normalizeSourceKey(sourceRaw)
      const sourceLabel = prettifySource(sourceRaw)
      const rowRevenue = getPurchasePriceValue(row)
      const isConverted = row.stage === 'Registered'

      totalLeads += 1
      if (isConverted) {
        totalConverted += 1
      }
      attributedRevenue += rowRevenue

      if (!bySource[sourceKey]) {
        bySource[sourceKey] = {
          key: sourceKey,
          label: sourceLabel,
          leads: 0,
          converted: 0,
          revenue: 0,
          estimatedSpend: 0,
        }
      }

      bySource[sourceKey].leads += 1
      bySource[sourceKey].revenue += rowRevenue
      if (isConverted) {
        bySource[sourceKey].converted += 1
      }
    }

    const sourceRows = Object.values(bySource)
      .map((item) => {
        const benchmarkCpl = MARKETING_SOURCE_BENCHMARKS[item.key] ?? MARKETING_SOURCE_BENCHMARKS.other
        const sourceEstimatedSpend = benchmarkCpl * item.leads
        estimatedSpend += sourceEstimatedSpend
        return {
          ...item,
          estimatedSpend: sourceEstimatedSpend,
          leadShare: totalLeads ? (item.leads / totalLeads) * 100 : 0,
          conversionRate: item.leads ? (item.converted / item.leads) * 100 : 0,
        }
      })
      .sort((left, right) => right.leads - left.leads)

    const parsedSpend = Number(filters.marketingSpend)
    const actualSpend = Number.isFinite(parsedSpend) && parsedSpend > 0 ? parsedSpend : null
    const spendUsed = actualSpend ?? estimatedSpend

    return {
      totalLeads,
      totalConverted,
      conversionRate: totalLeads ? (totalConverted / totalLeads) * 100 : 0,
      attributedRevenue,
      estimatedSpend,
      actualSpend,
      spendUsed,
      costPerLead: totalLeads ? spendUsed / totalLeads : 0,
      costPerConversion: totalConverted ? spendUsed / totalConverted : 0,
      topSource: sourceRows[0]?.label || 'Unknown',
      sourceRows,
    }
  }, [filteredRows, filters.marketingSpend])

  const selectedDevelopment = developmentOptions.find((option) => option.id === filters.developmentId)
  const developmentLabel =
    filters.developmentId === 'all' ? 'All Developments' : selectedDevelopment?.name || 'Selected Development'
  const transactionScopeLabel =
    TRANSACTION_SCOPE_OPTIONS.find((option) => option.value === filters.transactionScope)?.label || 'All Transactions'
  const reportTypeLabel = REPORT_TYPES.find((option) => option.value === filters.reportType)?.label || 'Overview'

  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        unit: row.unit?.unit_number || '',
        development: row.development?.name || '',
        phase: row.unit?.phase || row.report?.developmentPhase || '',
        buyer: row.buyer?.name || '',
        buyerType: financeTypeShortLabel(row.transaction?.finance_type),
        transactionStage: row.stage || '',
        currentMainStage: toMainStage(row),
        startedAt: formatExportDate(row.transaction?.created_at),
        stageUpdatedAt: formatExportDate(row.report?.stageDate || row.transaction?.updated_at),
        comment: row.report?.workflowComment || row.report?.latestOperationalNote || row.report?.notesSummary || '',
        purchasePrice: getPurchasePriceValue(row),
      })),
    [filteredRows],
  )

  function handleExportCsv() {
    const header = [
      'Unit',
      'Development',
      'Phase',
      'Buyer',
      'Buyer Type',
      'Transaction Stage',
      'Current Main Stage',
      'Date Started',
      'Stage Updated',
      'Purchase Price',
      'Comment',
    ]
    const lines = [
      header.join(','),
      ...exportRows.map((row) =>
        [
          row.unit,
          row.development,
          row.phase,
          row.buyer,
          row.buyerType,
          row.transactionStage,
          row.currentMainStage,
          row.startedAt,
          row.stageUpdatedAt,
          row.purchasePrice,
          row.comment,
        ]
          .map(escapeCsvValue)
          .join(','),
      ),
    ]
    downloadBlob(`report-${Date.now()}.csv`, 'text/csv;charset=utf-8', lines.join('\n'))
  }

  function handleExportExcel() {
    const header = [
      'Unit',
      'Development',
      'Phase',
      'Buyer',
      'Buyer Type',
      'Transaction Stage',
      'Current Main Stage',
      'Date Started',
      'Stage Updated',
      'Purchase Price',
      'Comment',
    ]
    const lines = [
      header.join('\t'),
      ...exportRows.map((row) =>
        [
          row.unit,
          row.development,
          row.phase,
          row.buyer,
          row.buyerType,
          row.transactionStage,
          row.currentMainStage,
          row.startedAt,
          row.stageUpdatedAt,
          row.purchasePrice,
          row.comment,
        ]
          .map((value) => String(value ?? '').replace(/\t/g, ' ').replace(/\n/g, ' '))
          .join('\t'),
      ),
    ]
    downloadBlob(`report-${Date.now()}.xls`, 'application/vnd.ms-excel;charset=utf-8', lines.join('\n'))
  }

  function handleExportPdf() {
    const exportPages = Array.from(document.querySelectorAll('.report-export-shell .investor-print-page'))
    if (!exportPages.length) {
      window.print()
      return
    }

    const printWindow = window.open('', '_blank', 'width=1280,height=900')
    if (!printWindow) {
      window.print()
      return
    }

    const reportMarkup = exportPages.map((node) => node.outerHTML).join('\n')

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bridge Portfolio Report</title>
    <style>${REPORT_EXPORT_CSS}</style>
  </head>
  <body class="report-export-window">
    <div class="report-export-shell">
      ${reportMarkup}
    </div>
    <script>
      const runPrint = () => {
        window.focus();
        setTimeout(() => window.print(), 180);
      };

      if (document.readyState === 'complete') {
        runPrint();
      } else {
        window.addEventListener('load', runPrint, { once: true });
      }

      window.addEventListener('afterprint', () => {
        window.close();
      }, { once: true });
    </script>
  </body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  function handleResetFilters() {
    setFilters((previous) => ({
      ...previous,
      developmentId: workspace.id === 'all' ? 'all' : workspace.id,
      transactionScope: 'all_transactions',
      financeType: 'all',
      stage: 'all',
      riskStatus: 'all',
      marketingSpend: '',
    }))
  }

  const showDevelopmentFilter = workspace.id === 'all' && developmentOptions.length > 1

  return (
    <section className="space-y-5">
      {!isSupabaseConfigured ? (
        <p className="rounded-[18px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[18px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
      ) : null}
      {loading ? (
        <LoadingSkeleton lines={10} className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]" />
      ) : null}

      {!loading && isSupabaseConfigured ? (
        <ReportView
          reportType={filters.reportType}
          reportTypeLabel={reportTypeLabel}
          title={developmentLabel}
          transactionScopeLabel={transactionScopeLabel}
          generatedAt={generatedAt || new Date().toLocaleString()}
          summary={summary}
          rows={filteredRows}
          marketingSummary={marketingSummary}
          onReportTypeChange={(value) => setFilters((previous) => ({ ...previous, reportType: value }))}
          filtersPanel={
            <section className="no-print rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex flex-col gap-4 border-b border-[#edf2f7] pb-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">Report Filters</h4>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                    {showDevelopmentFilter
                      ? 'Refine the snapshot across developments, stage exposure, finance mix, and risk.'
                      : 'Refine the snapshot by scope, stage exposure, finance mix, and risk.'}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <Button variant="ghost" className="w-full sm:w-auto" onClick={handleResetFilters}>
                    <RotateCcw size={15} />
                    <span>Reset Filters</span>
                  </Button>
                  <Button variant="primary" className="w-full sm:w-auto" onClick={handleExportPdf}>
                    <Printer size={15} />
                    <span>Export PDF</span>
                  </Button>
                </div>
              </div>

              <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${showDevelopmentFilter ? '2xl:grid-cols-6' : '2xl:grid-cols-5'}`}>
                {showDevelopmentFilter ? (
                  <label className="grid gap-2">
                    <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
                    <Field
                      as="select"
                      className="bg-[#fbfdff]"
                      value={filters.developmentId}
                      onChange={(event) => setFilters((previous) => ({ ...previous, developmentId: event.target.value }))}
                    >
                      <option value="all">All Developments</option>
                      {developmentOptions.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Field>
                  </label>
                ) : null}

                <label className="grid gap-2">
                  <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transaction Scope</span>
                  <Field
                    as="select"
                    className="bg-[#fbfdff]"
                    value={filters.transactionScope}
                    onChange={(event) => setFilters((previous) => ({ ...previous, transactionScope: event.target.value }))}
                  >
                    {TRANSACTION_SCOPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Finance Type</span>
                  <Field
                    as="select"
                    className="bg-[#fbfdff]"
                    value={filters.financeType}
                    onChange={(event) => setFilters((previous) => ({ ...previous, financeType: event.target.value }))}
                  >
                    {FINANCE_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current Stage</span>
                  <Field
                    as="select"
                    className="bg-[#fbfdff]"
                    value={filters.stage}
                    onChange={(event) => setFilters((previous) => ({ ...previous, stage: event.target.value }))}
                  >
                    {STAGE_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Risk Status</span>
                  <Field
                    as="select"
                    className="bg-[#fbfdff]"
                    value={filters.riskStatus}
                    onChange={(event) => setFilters((previous) => ({ ...previous, riskStatus: event.target.value }))}
                  >
                    {RISK_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Marketing Spend</span>
                  <Field
                    className="bg-[#fbfdff]"
                    type="number"
                    min="0"
                    step="100"
                    value={filters.marketingSpend}
                    onChange={(event) => setFilters((previous) => ({ ...previous, marketingSpend: event.target.value }))}
                    placeholder="Optional spend"
                  />
                </label>
              </div>
            </section>
          }
        />
      ) : null}
    </section>
  )
}

export default Report
