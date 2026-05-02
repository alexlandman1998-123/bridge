import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  Building2,
  FileCheck2,
  LandPlot,
  PieChart,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SummaryCards from '../components/SummaryCards'
import ConveyancerDashboardPage from '../components/ConveyancerDashboardPage'
import { PillToggle } from '../components/ui/FilterBar'
import {
  STAGE_AGING_BUCKETS,
  selectActiveTransactions,
  selectFinanceMix,
  selectStageAging,
  selectStageDistribution,
} from '../core/transactions/developerSelectors'
import {
  selectAgentSummary,
} from '../core/transactions/agentSelectors'
import {
} from '../core/transactions/attorneySelectors'
import { buildAgentDemoRows, buildAttorneyDemoRows, buildBondDemoRows } from '../core/transactions/attorneyMockData'
import {
  getBondApplicationStage,
  selectBondSummary,
} from '../core/transactions/bondSelectors'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getMainStageFromDetailedStage,
} from '../core/transactions/stageConfig'
import { TRANSACTION_SCOPE_OPTIONS, filterRowsByTransactionScope, getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDashboardOverview, fetchTransactionsByParticipantSummary } from '../lib/api'
import { startRouteTransitionTrace } from '../lib/performanceTrace'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const FINANCE_MIX_COLORS = {
  cash: '#37576f',
  bond: '#22c55e',
  combination: '#2563eb',
  unknown: '#cbd5e1',
}

const SHARED_FINANCE_WORKFLOW_STEPS = [
  'Application Received',
  'Buyer Documents Collected',
  'Submitted to Banks',
  'Bank Feedback Received',
  'Bond Approved',
  'Grant Signed',
]

const SHARED_TRANSFER_WORKFLOW_STEPS = [
  'Instruction Received',
  'FICA Received',
  'Transfer Documents Prepared',
  'Buyer Signed Documents',
  'Seller Signed Documents',
  'Guarantees Received',
]

const DASHBOARD_PANEL_CLASS =
  'rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const DASHBOARD_SUBPANEL_CLASS =
  'rounded-[22px] border border-[#dde4ee] bg-white p-7 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const DASHBOARD_CHIP_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]'
const DASHBOARD_ACTION_PRIMARY_CLASS =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[16px] border border-transparent bg-[#35546c] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:bg-[#2e475c]'
const DASHBOARD_ACTION_SECONDARY_CLASS =
  'inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[#dde4ee] bg-white px-4 py-2.5 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]'
const DASHBOARD_FIELD_CLASS =
  'flex h-[44px] items-center gap-3 rounded-[16px] border border-[#dde4ee] bg-white px-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]'
const DASHBOARD_METRIC_CARD_CLASS =
  'rounded-[20px] border border-[#dde4ee] bg-white px-5 py-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]'

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '0%'
  }

  return `${Math.round(value)}%`
}

function formatDateTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 'No recent update'
  }

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 'No recent update'
  }

  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'Just now'
  }

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`

  return formatDateTime(value)
}

function getHeatLevel(value, max) {
  if (!value || !max) {
    return 0
  }

  const ratio = value / max
  if (ratio >= 0.76) return 4
  if (ratio >= 0.51) return 3
  if (ratio >= 0.26) return 2
  return 1
}

function getRowUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysSinceRowUpdate(row) {
  const value = getRowUpdatedAt(row)
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 0
  }

  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff <= 0) {
    return 0
  }

  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getDaysBetweenTimestamps(startValue, endValue) {
  const start = new Date(startValue || 0)
  const end = new Date(endValue || 0)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }
  const diff = end.getTime() - start.getTime()
  if (!Number.isFinite(diff) || diff < 0) {
    return null
  }
  return diff / (1000 * 60 * 60 * 24)
}

function getRowMainStage(row) {
  return getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available')
}

function extractInterestRate(row) {
  const signal = `${row?.transaction?.current_sub_stage_summary || ''} ${row?.transaction?.next_action || ''} ${row?.transaction?.comment || ''}`
  const match = signal.match(/(\d{1,2}(?:\.\d+)?)\s*%/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function formatRateLabel(value) {
  if (!Number.isFinite(value)) return 'Not logged'
  return `${value.toFixed(2)}%`
}

function getBondStageProgress(stageKey) {
  switch (stageKey) {
    case 'docs_requested':
      return 18
    case 'docs_received':
      return 34
    case 'application_submitted':
      return 52
    case 'bank_reviewing':
      return 72
    case 'approval_granted':
      return 100
    case 'declined':
      return 100
    default:
      return 12
  }
}

function openBondApplication(navigate, item) {
  const unitId = item?.unitId || null
  const unitNumber = item?.unitNumber || '-'
  const transactionId = item?.transactionId || null

  if (unitId) {
    navigate(`/units/${unitId}`, {
      state: { headerTitle: `Unit ${unitNumber}` },
    })
    return
  }

  if (transactionId) {
    navigate(`/transactions/${transactionId}`, {
      state: { headerTitle: item?.reference || 'Application' },
    })
    return
  }

  navigate('/applications')
}

function toSignalText(row) {
  return `${row?.transaction?.next_action || ''} ${row?.transaction?.current_sub_stage_summary || ''} ${row?.transaction?.comment || ''} ${row?.stage || ''}`
    .toLowerCase()
    .trim()
}

function createWorkflowSteps(stepLabels, completedUntil, activeIndex) {
  return stepLabels.map((label, index) => {
    let status = 'pending'
    if (index <= completedUntil) {
      status = 'completed'
    } else if (index === activeIndex) {
      status = 'active'
    }

    return { label, status }
  })
}

function buildFinanceWorkflowSteps(mainStage, signalText) {
  let completedUntil = -1
  let activeIndex = 0

  if (['ATTY', 'XFER', 'REG'].includes(mainStage)) {
    completedUntil = SHARED_FINANCE_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (mainStage === 'FIN') {
    completedUntil = 2
    activeIndex = 3
  } else if (mainStage === 'OTP') {
    completedUntil = 0
    activeIndex = 1
  }

  if (/(approved|grant signed|proof of funds|guarantees)/i.test(signalText)) {
    completedUntil = SHARED_FINANCE_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (/(review|bank feedback|underwriting|valuation)/i.test(signalText)) {
    completedUntil = Math.max(completedUntil, 2)
    activeIndex = 3
  } else if (/(submitted|application lodged|sent to bank)/i.test(signalText)) {
    completedUntil = Math.max(completedUntil, 2)
    activeIndex = 3
  }

  return createWorkflowSteps(SHARED_FINANCE_WORKFLOW_STEPS, completedUntil, activeIndex)
}

function buildTransferWorkflowSteps(mainStage, signalText) {
  let completedUntil = -1
  let activeIndex = 0

  if (mainStage === 'REG') {
    completedUntil = SHARED_TRANSFER_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (mainStage === 'XFER') {
    completedUntil = 4
    activeIndex = 5
  } else if (mainStage === 'ATTY') {
    completedUntil = 1
    activeIndex = 2
  } else if (mainStage === 'FIN') {
    completedUntil = 0
    activeIndex = 1
  }

  if (/(registered|deed registered)/i.test(signalText)) {
    completedUntil = SHARED_TRANSFER_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (/(lodged|lodgement|deeds office)/i.test(signalText)) {
    completedUntil = 4
    activeIndex = 5
  } else if (/(guarantees|signed documents|transfer docs prepared|clearance received|preparing transfer)/i.test(signalText)) {
    completedUntil = Math.max(completedUntil, 2)
    activeIndex = 3
  }

  return createWorkflowSteps(SHARED_TRANSFER_WORKFLOW_STEPS, completedUntil, activeIndex)
}

function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace, role, profile, personaOptions, setActivePersona, rolePreviewActive } = useWorkspace()
  const [overview, setOverview] = useState({
    metrics: {
      totalDevelopments: 0,
      totalUnits: 0,
      activeTransactions: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      totalRevenue: 0,
    },
    developmentSummaries: [],
    rows: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeWorkflowTab, setActiveWorkflowTab] = useState('finance')
  const [transactionScope, setTransactionScope] = useState('all')
  const [propertyTypeView, setPropertyTypeView] = useState('volume')

  const navigateWithTrace = useCallback(
    (to, label = 'dashboard-navigation') => {
      startRouteTransitionTrace({
        from: location.pathname,
        to,
        label,
      })
      navigate(to)
    },
    [location.pathname, navigate],
  )

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      if (role === 'agent' || role === 'bond_originator' || role === 'attorney') {
        const roleType = role === 'bond_originator' ? 'bond_originator' : role === 'attorney' ? 'attorney' : 'agent'
        let participantRows = []
        if (profile?.id) {
          participantRows = await fetchTransactionsByParticipantSummary({
            userId: profile.id,
            roleType,
          })
        }
        const scopedRows =
          role === 'attorney'
            ? buildAttorneyDemoRows(participantRows || [])
            : role === 'agent'
              ? buildAgentDemoRows(participantRows || [])
              : role === 'bond_originator'
                ? buildBondDemoRows(participantRows || [])
                : participantRows

        const filteredRows = scopedRows.filter((row) =>
          workspace.id === 'all' ? true : (row?.development?.id || row?.unit?.development_id) === workspace.id,
        )

        setOverview({
          metrics: {
            totalDevelopments: new Set(
              filteredRows.map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean),
            ).size,
            totalUnits: filteredRows.length,
            activeTransactions: filteredRows.length,
            unitsInTransfer: filteredRows.filter((row) =>
              ['Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged'].includes(row?.stage),
            ).length,
            unitsRegistered: filteredRows.filter((row) => row?.stage === 'Registered').length,
            totalRevenue: filteredRows.reduce((sum, row) => {
              const value = Number(row?.transaction?.sales_price ?? row?.unit?.price)
              return sum + (Number.isFinite(value) ? value : 0)
            }, 0),
          },
          developmentSummaries: [],
          rows: filteredRows,
        })
      } else {
        const data = await fetchDashboardOverview({
          developmentId: workspace.id === 'all' ? null : workspace.id,
        })
        setOverview(data)
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, role, workspace.id])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    function refreshDashboard() {
      void loadDashboard()
    }

    window.addEventListener('itg:transaction-created', refreshDashboard)
    window.addEventListener('itg:transaction-updated', refreshDashboard)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshDashboard)
      window.removeEventListener('itg:transaction-updated', refreshDashboard)
    }
  }, [loadDashboard])

  const rows = useMemo(() => overview.rows || [], [overview.rows])

  const dashboardHeaderMetrics = useMemo(() => {
    const fallbackDevelopments = new Set(
      rows.map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean),
    ).size
    let availableUnits = 0
    let registeredCount = 0
    let revenueSecured = 0
    let inProgressValue = 0

    for (const row of rows) {
      const stage = row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available'
      const mainStage = getMainStageFromDetailedStage(stage)
      const rawValue = Number(
        row?.transaction?.sales_price ??
          row?.transaction?.purchase_price ??
          row?.unit?.current_price ??
          row?.unit?.list_price ??
          row?.unit?.price ??
          0,
      )
      const transactionValue = Number.isFinite(rawValue) ? rawValue : 0

      if (mainStage === 'REG') {
        registeredCount += 1
        revenueSecured += transactionValue
        continue
      }

      if (mainStage === 'AVAIL') {
        availableUnits += 1
        continue
      }

      inProgressValue += transactionValue
    }

    return {
      totalDevelopments: Number(overview?.metrics?.totalDevelopments || 0) || fallbackDevelopments,
      availableUnits,
      inProgressValue,
      revenueSecured,
      registeredCount,
    }
  }, [overview?.metrics?.totalDevelopments, rows])

  const summaryItems = useMemo(() => {
    return [
      { label: 'Total Developments', value: dashboardHeaderMetrics.totalDevelopments, icon: Building2 },
      { label: 'Available Units', value: dashboardHeaderMetrics.availableUnits, icon: LandPlot },
      { label: 'In Progress', value: currency.format(Number(dashboardHeaderMetrics.inProgressValue) || 0), icon: ArrowRightLeft },
      { label: 'Revenue Secured', value: currency.format(Number(dashboardHeaderMetrics.revenueSecured) || 0), icon: Banknote },
      { label: 'Registered', value: dashboardHeaderMetrics.registeredCount, icon: FileCheck2 },
    ]
  }, [dashboardHeaderMetrics])

  const funnelData = useMemo(() => selectStageDistribution(rows), [rows])

  const financeMix = useMemo(() => {
    const segments = selectFinanceMix(rows)
    const totalCount = segments.reduce((sum, item) => sum + item.count, 0)

    let cursor = 0
    const gradientParts = segments
      .filter((item) => item.count > 0)
      .map((item) => {
        const percent = totalCount ? (item.count / totalCount) * 100 : 0
        const start = cursor
        const end = cursor + percent
        cursor = end
        return `${FINANCE_MIX_COLORS[item.key]} ${start}% ${end}%`
      })

    return {
      segments,
      totalCount,
      gradient: gradientParts.length ? `conic-gradient(${gradientParts.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)',
    }
  }, [rows])

  const financeLegendSegments = useMemo(() => {
    const visible = (financeMix.segments || []).filter((item) => item.count > 0 || item.value > 0)
    return visible.length ? visible : financeMix.segments
  }, [financeMix.segments])

  const financeMixSnapshot = useMemo(() => {
    const byKey = Object.fromEntries((financeMix.segments || []).map((item) => [item.key, item]))
    const totalCount = financeMix.totalCount || 0
    const totalValue = (financeMix.segments || []).reduce((sum, item) => sum + Number(item.value || 0), 0)
    const cashCount = Number(byKey.cash?.count || 0)
    const bondCount = Number(byKey.bond?.count || 0)
    const comboCount = Number(byKey.combination?.count || 0)

    return [
      {
        label: 'Cash Share',
        value: formatPercent(totalCount ? (cashCount / totalCount) * 100 : 0),
      },
      {
        label: 'Bond Share',
        value: formatPercent(totalCount ? (bondCount / totalCount) * 100 : 0),
      },
      {
        label: 'Hybrid Deals',
        value: comboCount,
      },
      {
        label: 'Avg Deal Value',
        value: currency.format(totalCount ? totalValue / totalCount : 0),
      },
    ]
  }, [financeMix.segments, financeMix.totalCount])

  const canAccessReports = ['developer', 'attorney', 'bond_originator'].includes(role)
  const isAgentRole = role === 'agent'
  const isBondRole = role === 'bond_originator'
  const isAttorneyRole = role === 'attorney'
  const isRoleScopedDashboard = isAgentRole || isBondRole || isAttorneyRole
  const canViewOperationalWorkflows = role !== 'client'
  const roleScopedRows = useMemo(
    () => ((isAgentRole || isBondRole) ? filterRowsByTransactionScope(rows, transactionScope) : rows),
    [isAgentRole, isBondRole, rows, transactionScope],
  )
  const sharedDashboardRows = useMemo(() => (isAgentRole ? roleScopedRows : rows), [isAgentRole, roleScopedRows, rows])
  const activeTransactionCards = useMemo(
    () => selectActiveTransactions(isAgentRole || isBondRole ? roleScopedRows : rows),
    [isAgentRole, isBondRole, roleScopedRows, rows],
  )
  const stageAging = useMemo(() => selectStageAging(rows), [rows])
  const agentSummary = useMemo(() => selectAgentSummary(roleScopedRows), [roleScopedRows])
  const bondSummary = useMemo(() => selectBondSummary(roleScopedRows), [roleScopedRows])
  const agentPipelineLeadCount = useMemo(() => {
    if (!isAgentRole || typeof window === 'undefined') {
      return 0
    }
    try {
      const raw = window.localStorage.getItem('itg:pipeline-leads:v1')
      if (!raw) return 0
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }, [isAgentRole, roleScopedRows.length])
  const bondApplicationCards = useMemo(
    () =>
      [...roleScopedRows]
        .filter((row) => row?.transaction)
        .sort((left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0))
        .map((row) => {
          const stageKey = getBondApplicationStage(row)
          return {
            id: row?.transaction?.id || row?.unit?.id,
            transactionId: row?.transaction?.id || null,
            unitId: row?.unit?.id || null,
            developmentName: row?.development?.name || 'Unknown Development',
            unitNumber: row?.unit?.unit_number || '-',
            buyerName: row?.buyer?.name || 'Buyer pending',
            reference: row?.transaction?.transaction_reference || row?.transaction?.id || 'Application',
            bank: row?.transaction?.bank || 'Bank not set',
            financeType: row?.transaction?.finance_type || row?.unit?.finance_type || 'bond',
            stageLabel: {
              docs_requested: 'Documents Requested',
              docs_received: 'Documents Received',
              application_submitted: 'Submitted to Banks',
              bank_reviewing: 'Bank Reviewing',
              approval_granted: 'Approval Granted',
              declined: 'Declined',
            }[stageKey] || 'Documents Requested',
            nextAction: row?.transaction?.next_action || row?.transaction?.current_sub_stage_summary || 'Awaiting next finance update',
            progressPercent: getBondStageProgress(stageKey),
            daysSinceUpdate: getDaysSinceRowUpdate(row),
            missingDocuments: Number(row?.documentSummary?.missingCount || 0),
          }
        }),
    [roleScopedRows],
  )
  const bondInsights = useMemo(() => {
    const applications = roleScopedRows.filter((row) => row?.transaction)
    const approvalRows = applications.filter((row) => getBondApplicationStage(row) === 'approval_granted')
    const averageGrantValue =
      approvalRows.reduce(
        (sum, row) => sum + Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.purchase_price || row?.unit?.sales_price || 0),
        0,
      ) / (approvalRows.length || 1)
    const averageDaysInFinance =
      applications.reduce((sum, row) => sum + getDaysSinceRowUpdate(row), 0) / (applications.length || 1)
    const approvalRate = applications.length ? (bondSummary.approvals / applications.length) * 100 : 0
    const bankMap = new Map()
    const capturedRates = []

    applications.forEach((row) => {
      const bank = String(row?.transaction?.bank || 'Unassigned').trim() || 'Unassigned'
      const grantValue = Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.purchase_price || row?.unit?.sales_price || 0)
      const rate = extractInterestRate(row)
      const current = bankMap.get(bank) || { bank, count: 0, grantedValue: 0, approvals: 0, rateTotal: 0, rateCount: 0 }
      current.count += 1
      current.grantedValue += grantValue
      if (getBondApplicationStage(row) === 'approval_granted') {
        current.approvals += 1
      }
      if (Number.isFinite(rate)) {
        current.rateTotal += rate
        current.rateCount += 1
        capturedRates.push(rate)
      }
      bankMap.set(bank, current)
    })

    const bankComparison = [...bankMap.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)
      .map((item, index, array) => ({
        ...item,
        width: ((item.count || 0) / Math.max(array[0]?.count || 1, 1)) * 100,
        approvalRate: item.count ? (item.approvals / item.count) * 100 : 0,
        averageRate: item.rateCount ? item.rateTotal / item.rateCount : null,
      }))

    const averageQuotedRate =
      capturedRates.reduce((sum, value) => sum + value, 0) / (capturedRates.length || 1)
    const lowestQuotedRate = capturedRates.length ? Math.min(...capturedRates) : null

    return {
      averageGrantValue: approvalRows.length ? averageGrantValue : 0,
      averageDaysInFinance,
      approvalRate,
      bankComparison,
      averageQuotedRate: capturedRates.length ? averageQuotedRate : null,
      lowestQuotedRate,
      quotedRateCount: capturedRates.length,
    }
  }, [bondSummary.approvals, roleScopedRows])
  const bondPerformanceMetrics = useMemo(() => {
    const applications = roleScopedRows.filter((row) => row?.transaction)
    const stageCounts = {
      new: 0,
      awaitingDocs: 0,
      submitted: 0,
      approved: 0,
      declined: 0,
    }
    const bankMap = new Map()
    const agentMap = new Map()
    const agencyMap = new Map()

    for (const row of applications) {
      const stage = getBondApplicationStage(row)
      const daysSinceUpdate = getDaysSinceRowUpdate(row)
      const bankName = String(row?.transaction?.bank || 'Unassigned').trim() || 'Unassigned'
      const agentName = String(row?.transaction?.assigned_agent || row?.transaction?.assigned_agent_email || 'Unassigned').trim() || 'Unassigned'
      const agencyName = String(row?.transaction?.marketing_source || row?.transaction?.lead_source || 'Independent / Unmapped').trim() || 'Independent / Unmapped'

      if (stage === 'approval_granted') {
        stageCounts.approved += 1
      } else if (stage === 'declined') {
        stageCounts.declined += 1
      } else if (stage === 'application_submitted' || stage === 'bank_reviewing') {
        stageCounts.submitted += 1
      } else if (stage === 'docs_received') {
        stageCounts.new += 1
      } else if (stage === 'docs_requested') {
        if (daysSinceUpdate <= 2) {
          stageCounts.new += 1
        } else {
          stageCounts.awaitingDocs += 1
        }
      }

      bankMap.set(bankName, (bankMap.get(bankName) || 0) + 1)
      agentMap.set(agentName, (agentMap.get(agentName) || 0) + 1)
      agencyMap.set(agencyName, (agencyMap.get(agencyName) || 0) + 1)
    }

    const bankComparison = [...bankMap.entries()]
      .map(([bank, count]) => ({ bank, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 7)
      .map((item, index, array) => ({
        ...item,
        width: ((item.count || 0) / Math.max(array[0]?.count || 1, 1)) * 100,
      }))

    const rankedAgents = [...agentMap.entries()]
      .map(([name, deals]) => ({ name, deals }))
      .sort((left, right) => right.deals - left.deals)
      .slice(0, 6)

    const rankedAgencies = [...agencyMap.entries()]
      .map(([name, deals]) => ({ name, deals }))
      .sort((left, right) => right.deals - left.deals)
      .slice(0, 6)

    const funnel = [
      { key: 'received', label: 'Deals Received', count: applications.length },
      {
        key: 'submitted',
        label: 'Applications Submitted',
        count: stageCounts.submitted + stageCounts.approved + stageCounts.declined,
      },
      { key: 'approvals', label: 'Approvals', count: stageCounts.approved },
    ]
    const funnelBase = Math.max(funnel[0]?.count || 0, 1)
    const conversionFunnel = funnel.map((item) => ({
      ...item,
      share: (item.count / funnelBase) * 100,
      width: (item.count / funnelBase) * 100,
    }))

    return {
      bankComparison,
      rankedAgents,
      rankedAgencies,
      statusBreakdown: [
        { key: 'new', label: 'New', count: stageCounts.new },
        { key: 'awaiting_docs', label: 'Awaiting Docs', count: stageCounts.awaitingDocs },
        { key: 'submitted', label: 'Submitted', count: stageCounts.submitted },
        { key: 'approved', label: 'Approved', count: stageCounts.approved },
        { key: 'declined', label: 'Declined', count: stageCounts.declined },
      ],
      conversionFunnel,
    }
  }, [roleScopedRows])
  const bondTopStats = useMemo(() => {
    const approvedRows = roleScopedRows.filter((row) => getBondApplicationStage(row) === 'approval_granted')
    const approvalLeadDays = approvedRows
      .map((row) => getDaysBetweenTimestamps(row?.transaction?.created_at, row?.transaction?.updated_at))
      .filter((value) => Number.isFinite(value))
    const avgApprovalTimeDays = approvalLeadDays.length
      ? approvalLeadDays.reduce((sum, value) => sum + value, 0) / approvalLeadDays.length
      : bondInsights.averageDaysInFinance

    return [
      { label: 'Active Applications', value: bondSummary.active, icon: ArrowRightLeft },
      { label: 'Approval Rate', value: formatPercent(bondInsights.approvalRate), icon: TrendingUp },
      { label: 'Avg Bond Grant', value: currency.format(bondInsights.averageGrantValue || 0), icon: Banknote },
      { label: 'Avg Approval Time', value: `${Math.max(0, Math.round(avgApprovalTimeDays || 0))}d`, icon: FileCheck2 },
    ]
  }, [bondInsights.approvalRate, bondInsights.averageDaysInFinance, bondInsights.averageGrantValue, bondSummary.active, roleScopedRows])
  const agentPerformanceMetrics = useMemo(() => {
    const scoped = roleScopedRows.filter((row) => row?.transaction)
    const listingCount = new Set(scoped.map((row) => row?.unit?.id || row?.transaction?.id).filter(Boolean)).size
    const registeredRows = scoped.filter((row) => getRowMainStage(row) === 'REG')
    const dealValueOf = (row) =>
      Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.price || row?.unit?.list_price || 0) || 0
    const askingValueOf = (row) => Number(row?.unit?.list_price || row?.unit?.price || 0) || 0
    const soldValue = scoped.reduce((sum, row) => sum + dealValueOf(row), 0)
    const explicitCommission = scoped.reduce((sum, row) => {
      return (
        sum +
        Number(
          row?.transaction?.commission_earned ||
            row?.transaction?.agent_commission_earned ||
            row?.transaction?.agent_commission ||
            row?.transaction?.commission_amount ||
            0,
        )
      )
    }, 0)
    const commissionEarned = explicitCommission > 0 ? explicitCommission : soldValue * 0.03

    const marketingSourceMap = new Map()
    const developmentPrivateMap = new Map([
      ['development', { key: 'development', label: 'Development', total: 0, registered: 0, totalValue: 0, totalDays: 0 }],
      ['private', { key: 'private', label: 'Private', total: 0, registered: 0, totalValue: 0, totalDays: 0 }],
    ])
    const financeTypeMap = new Map([
      ['cash', { key: 'cash', label: 'Cash', total: 0, registered: 0, totalDays: 0 }],
      ['bond', { key: 'bond', label: 'Bond', total: 0, registered: 0, totalDays: 0 }],
    ])
    const propertyTypeMap = new Map([
      ['residential', { key: 'residential', label: 'Residential', count: 0, value: 0 }],
      ['commercial', { key: 'commercial', label: 'Commercial', count: 0, value: 0 }],
      ['agricultural', { key: 'agricultural', label: 'Agricultural', count: 0, value: 0 }],
      ['mixed_use', { key: 'mixed_use', label: 'Mixed-use', count: 0, value: 0 }],
      ['other', { key: 'other', label: 'Other', count: 0, value: 0 }],
    ])
    const buyerAgeMap = new Map([
      ['18-24', 0],
      ['25-34', 0],
      ['35-44', 0],
      ['45-54', 0],
      ['55+', 0],
      ['Unknown', 0],
    ])
    const buyerGenderMap = new Map([
      ['Male', 0],
      ['Female', 0],
      ['Other', 0],
      ['Unknown', 0],
    ])
    const buyerTypeMap = new Map([
      ['Individual', 0],
      ['Company', 0],
      ['Trust', 0],
      ['Other', 0],
    ])
    const buyerFinanceTypeMap = new Map([
      ['Cash', 0],
      ['Bond', 0],
      ['Hybrid', 0],
      ['Unknown', 0],
    ])
    const agentMap = new Map()

    let leads = Math.max(scoped.length, agentPipelineLeadCount)
    let offers = 0
    let signed = 0
    let registered = 0
    let openDeals = 0
    let totalAsking = 0
    let totalSelling = 0

    for (const row of scoped) {
      const stage = String(row?.stage || row?.transaction?.stage || '').toLowerCase()
      const main = getRowMainStage(row)
      const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
      const isCancelled = lifecycle.includes('cancel')
      const dealValue = dealValueOf(row)
      const askingValue = askingValueOf(row)
      const daysInDeal = getDaysSinceRowUpdate(row)
      const isRegistered = main === 'REG'

      if (['OTP', 'FIN', 'ATTY', 'XFER', 'REG'].includes(main)) offers += 1
      if (stage.includes('signed') || ['FIN', 'ATTY', 'XFER', 'REG'].includes(main)) signed += 1
      if (isRegistered) registered += 1
      if (!isRegistered && !isCancelled) openDeals += 1

      totalAsking += askingValue
      totalSelling += dealValue

      const marketingKey =
        String(row?.transaction?.marketing_source || row?.transaction?.lead_source || 'Unknown')
          .trim() || 'Unknown'
      const currentSource = marketingSourceMap.get(marketingKey) || { source: marketingKey, deals: 0 }
      currentSource.deals += 1
      marketingSourceMap.set(marketingKey, currentSource)

      const scopeKey = getTransactionScopeForRow(row) === 'private' ? 'private' : 'development'
      const scopeEntry = developmentPrivateMap.get(scopeKey)
      scopeEntry.total += 1
      scopeEntry.totalValue += dealValue
      scopeEntry.totalDays += daysInDeal
      if (isRegistered) scopeEntry.registered += 1

      const financeType = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
      const financeKey = financeType === 'cash' ? 'cash' : 'bond'
      const financeEntry = financeTypeMap.get(financeKey)
      financeEntry.total += 1
      financeEntry.totalDays += daysInDeal
      if (isRegistered) financeEntry.registered += 1

      const rawPropertyType = String(
        row?.transaction?.property_type ||
          row?.unit?.property_type ||
          row?.transaction?.property_description ||
          row?.transaction?.transaction_type ||
          '',
      )
        .trim()
        .toLowerCase()
      const propertyTypeKey = rawPropertyType.includes('commercial')
        ? 'commercial'
        : rawPropertyType.includes('agric')
          ? 'agricultural'
          : rawPropertyType.includes('mixed')
            ? 'mixed_use'
            : rawPropertyType.includes('residen') || rawPropertyType.includes('house') || rawPropertyType.includes('apartment')
              ? 'residential'
              : ['development', 'private_sale', 'private'].includes(rawPropertyType)
                ? 'residential'
                : 'other'
      const propertyTypeEntry = propertyTypeMap.get(propertyTypeKey)
      if (propertyTypeEntry) {
        propertyTypeEntry.count += 1
        propertyTypeEntry.value += dealValue
      }

      const ageSignal = String(
        row?.buyer?.age_group ||
          row?.buyer?.age ||
          row?.buyer?.date_of_birth ||
          '',
      )
        .trim()
        .toLowerCase()
      let ageKey = 'Unknown'
      const ageNum = Number(ageSignal)
      if (Number.isFinite(ageNum) && ageNum > 0) {
        ageKey = ageNum < 25 ? '18-24' : ageNum < 35 ? '25-34' : ageNum < 45 ? '35-44' : ageNum < 55 ? '45-54' : '55+'
      } else if (ageSignal.includes('18') || ageSignal.includes('24') || ageSignal.includes('18-24')) {
        ageKey = '18-24'
      } else if (ageSignal.includes('25') || ageSignal.includes('34') || ageSignal.includes('25-34')) {
        ageKey = '25-34'
      } else if (ageSignal.includes('35') || ageSignal.includes('44') || ageSignal.includes('35-44')) {
        ageKey = '35-44'
      } else if (ageSignal.includes('45') || ageSignal.includes('54') || ageSignal.includes('45-54')) {
        ageKey = '45-54'
      } else if (ageSignal.includes('55') || ageSignal.includes('60') || ageSignal.includes('50+')) {
        ageKey = '55+'
      }
      buyerAgeMap.set(ageKey, (buyerAgeMap.get(ageKey) || 0) + 1)

      const genderSignal = String(row?.buyer?.gender || '').trim().toLowerCase()
      const genderKey =
        genderSignal.startsWith('m')
          ? 'Male'
          : genderSignal.startsWith('f')
            ? 'Female'
            : genderSignal
              ? 'Other'
              : 'Unknown'
      buyerGenderMap.set(genderKey, (buyerGenderMap.get(genderKey) || 0) + 1)

      const buyerTypeSignal = String(row?.transaction?.purchaser_type || '').trim().toLowerCase()
      const buyerTypeKey =
        buyerTypeSignal.includes('company') || buyerTypeSignal.includes('pty')
          ? 'Company'
          : buyerTypeSignal.includes('trust')
            ? 'Trust'
            : buyerTypeSignal.includes('individual') || buyerTypeSignal.includes('person')
              ? 'Individual'
              : 'Other'
      buyerTypeMap.set(buyerTypeKey, (buyerTypeMap.get(buyerTypeKey) || 0) + 1)

      const financeTypeLabel =
        financeType === 'cash'
          ? 'Cash'
          : financeType === 'bond'
            ? 'Bond'
            : financeType === 'combination'
              ? 'Hybrid'
              : 'Unknown'
      buyerFinanceTypeMap.set(financeTypeLabel, (buyerFinanceTypeMap.get(financeTypeLabel) || 0) + 1)

      const agentName = String(row?.transaction?.assigned_agent || 'Unassigned').trim() || 'Unassigned'
      const agentEntry = agentMap.get(agentName) || { agent: agentName, deals: 0, registered: 0, totalDays: 0 }
      agentEntry.deals += 1
      agentEntry.totalDays += daysInDeal
      if (isRegistered) agentEntry.registered += 1
      agentMap.set(agentName, agentEntry)
    }

    const marketingSources = [...marketingSourceMap.values()]
      .sort((left, right) => right.deals - left.deals)
      .map((item) => ({
        ...item,
        share: scoped.length ? (item.deals / scoped.length) * 100 : 0,
      }))

    const rawFunnel = [
      { key: 'leads', label: 'Leads', count: leads },
      { key: 'offers', label: 'Offers', count: offers },
      { key: 'signed', label: 'Signed', count: signed },
      { key: 'registered', label: 'Registered', count: registered },
    ]
    const funnelBaseCount = Math.max(rawFunnel[0]?.count || 0, 1)
    const conversionFunnel = rawFunnel.map((item, index, array) => {
      const previous = index > 0 ? array[index - 1] : null
      const fromPreviousShare = previous ? (previous.count ? (item.count / previous.count) * 100 : 0) : 100
      const next = index < array.length - 1 ? array[index + 1] : null
      const dropToNext = next ? (item.count ? Math.max(0, ((item.count - next.count) / item.count) * 100) : 0) : 0

      return {
        ...item,
        shareOfLeads: leads ? (item.count / leads) * 100 : 0,
        fromPreviousShare,
        previousKey: previous?.key || null,
        previousLabel: previous?.label || null,
        dropToNext,
        width: (item.count / funnelBaseCount) * 100,
      }
    })
    const biggestFunnelDrop = conversionFunnel.slice(0, -1).reduce((largest, item, index) => {
      const next = conversionFunnel[index + 1]
      if (!next) return largest
      if (!largest || item.dropToNext > largest.dropPercent) {
        return {
          from: item.label,
          to: next.label,
          fromKey: item.key,
          toKey: next.key,
          dropPercent: item.dropToNext,
        }
      }
      return largest
    }, null)
    const hasFunnelData = conversionFunnel.some((item) => item.count > 0)

    const cashVsBond = [...financeTypeMap.values()].map((item) => ({
      ...item,
      conversion: item.total ? (item.registered / item.total) * 100 : 0,
      avgDealTime: item.total ? item.totalDays / item.total : 0,
    }))

    const developmentVsPrivate = [...developmentPrivateMap.values()].map((item) => ({
      ...item,
      conversion: item.total ? (item.registered / item.total) * 100 : 0,
      avgDealValue: item.total ? item.totalValue / item.total : 0,
      avgDealTime: item.total ? item.totalDays / item.total : 0,
    }))

    const agentPerformance = [...agentMap.values()]
      .map((item) => ({
        ...item,
        conversion: item.deals ? (item.registered / item.deals) * 100 : 0,
        avgDealTime: item.deals ? item.totalDays / item.deals : 0,
      }))
      .sort((left, right) => right.deals - left.deals)
      .slice(0, 8)

    const activeDealValue = scoped
      .filter((row) => getRowMainStage(row) !== 'REG')
      .reduce((sum, row) => sum + dealValueOf(row), 0)
    const avgAskingPrice = scoped.length ? totalAsking / scoped.length : 0
    const avgSellingPrice = scoped.length ? totalSelling / scoped.length : 0
    const askingVsSellingDelta = avgAskingPrice ? ((avgSellingPrice - avgAskingPrice) / avgAskingPrice) * 100 : 0
    const propertyTypeByVolume = [...propertyTypeMap.values()].map((item) => ({
      ...item,
      share: scoped.length ? (item.count / scoped.length) * 100 : 0,
    }))
    const totalPropertyValue = propertyTypeByVolume.reduce((sum, item) => sum + Number(item.value || 0), 0)
    const propertyTypeByValue = propertyTypeByVolume.map((item) => ({
      ...item,
      share: totalPropertyValue ? (Number(item.value || 0) / totalPropertyValue) * 100 : 0,
    }))
    const buyerInsights = {
      ageGroups: [...buyerAgeMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
      genders: [...buyerGenderMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
      buyerTypes: [...buyerTypeMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
      financeTypes: [...buyerFinanceTypeMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
    }

    return {
      listingCount,
      soldValue,
      activeDealValue,
      commissionEarned,
      marketingSources,
      conversionFunnel,
      biggestFunnelDrop,
      hasFunnelData,
      cashVsBond,
      developmentVsPrivate,
      avgAskingPrice,
      avgSellingPrice,
      askingVsSellingDelta,
      agentPerformance,
      propertyTypeByVolume,
      propertyTypeByValue,
      buyerInsights,
      totalDeals: scoped.length,
      registeredDeals: registeredRows.length,
      openDeals,
    }
  }, [agentPipelineLeadCount, roleScopedRows])
  const topSummaryItems = useMemo(() => {
    if (isAgentRole) {
      return [
        { label: 'Number of Listings', value: agentPerformanceMetrics.listingCount, icon: Building2 },
        { label: 'Active Deals', value: agentPerformanceMetrics.openDeals, icon: ArrowRightLeft },
        { label: 'Total Registered', value: agentPerformanceMetrics.registeredDeals, icon: FileCheck2 },
        { label: 'Pipeline Value', value: currency.format(Number(agentPerformanceMetrics.activeDealValue) || 0), icon: Banknote },
        { label: 'Commission', value: currency.format(Number(agentPerformanceMetrics.commissionEarned) || 0), icon: TrendingUp },
      ]
    }

    if (isBondRole) {
      return [
        { label: 'Active Applications', value: bondSummary.active, icon: ArrowRightLeft },
        { label: 'Documents Pending', value: bondSummary.docsPending, icon: FileCheck2 },
        { label: 'Submitted to Banks', value: bondSummary.submittedToBanks, icon: Banknote },
        { label: 'Approvals Received', value: bondSummary.approvals, icon: TrendingUp },
        { label: 'Applications Declined', value: bondSummary.declined, icon: Users },
      ]
    }

    return summaryItems
  }, [agentPerformanceMetrics.activeDealValue, agentPerformanceMetrics.commissionEarned, agentPerformanceMetrics.listingCount, agentPerformanceMetrics.openDeals, agentPerformanceMetrics.registeredDeals, bondSummary.active, bondSummary.approvals, bondSummary.declined, bondSummary.docsPending, bondSummary.submittedToBanks, isAgentRole, isBondRole, summaryItems])
  const agentPipelineValueLookup = useMemo(() => {
    if (!isAgentRole) {
      return new Map()
    }

    const values = new Map()
    for (const row of roleScopedRows) {
      const agentName = String(row?.transaction?.assigned_agent || 'Unassigned').trim() || 'Unassigned'
      const isRegistered = getRowMainStage(row) === 'REG'
      if (isRegistered) {
        continue
      }

      const value = Number(
        row?.transaction?.sales_price ||
        row?.transaction?.purchase_price ||
        row?.unit?.price ||
        0,
      )
      values.set(agentName, (values.get(agentName) || 0) + (Number.isFinite(value) ? value : 0))
    }

    return values
  }, [isAgentRole, roleScopedRows])
  const agentDashboardViewLabel = useMemo(() => {
    const option = personaOptions.find((item) => item.value === role)
    return option?.label || 'Agent'
  }, [personaOptions, role])
  const agentPipelineItems = useMemo(() => {
    if (!isAgentRole) return 0
    return roleScopedRows.filter((row) => getRowMainStage(row) !== 'REG').length
  }, [isAgentRole, roleScopedRows])
  const agentFollowUpsDue = useMemo(() => {
    if (!isAgentRole) return 0
    return roleScopedRows.filter((row) => {
      if (getRowMainStage(row) === 'REG') return false
      const days = getDaysSinceRowUpdate(row)
      const hasNextAction = String(row?.transaction?.next_action || '').trim().length > 0
      return !hasNextAction || days >= 7
    }).length
  }, [isAgentRole, roleScopedRows])
  const sharedActivityViewPath = useMemo(() => {
    if (isAttorneyRole) return '/transactions'
    if (isBondRole) return '/applications'
    return '/units'
  }, [isAttorneyRole, isBondRole])

  const sharedDashboardData = useMemo(() => {
    const scopedRows = sharedDashboardRows.filter((row) => row?.transaction)
    const stageCounts = MAIN_PROCESS_STAGES.reduce((accumulator, stageKey) => {
      accumulator[stageKey] = 0
      return accumulator
    }, {})

    for (const row of scopedRows) {
      const stageKey = getRowMainStage(row)
      stageCounts[stageKey] = (stageCounts[stageKey] || 0) + 1
    }

    const latestRows = [...scopedRows].sort(
      (left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0),
    )

    const anchorRow = latestRows[0] || null
    const anchorMainStage = anchorRow ? getRowMainStage(anchorRow) : 'AVAIL'
    const anchorStageIndex = Math.max(MAIN_PROCESS_STAGES.indexOf(anchorMainStage), 0)
    const currentStageLabel = MAIN_STAGE_LABELS[anchorMainStage] || 'Available'
    const anchorSignal = toSignalText(anchorRow)
    const progressStages = MAIN_PROCESS_STAGES.map((stageKey, index) => ({
      key: stageKey,
      label: MAIN_STAGE_LABELS[stageKey] || stageKey,
      count: stageCounts[stageKey] || 0,
      status: index < anchorStageIndex ? 'completed' : index === anchorStageIndex ? 'active' : 'pending',
    }))

    const financeWorkflow = buildFinanceWorkflowSteps(anchorMainStage, anchorSignal)
    const transferWorkflow = buildTransferWorkflowSteps(anchorMainStage, anchorSignal)
    const blockedCount = scopedRows.filter((row) => {
      const missingDocuments = Number(row?.documentSummary?.missingCount || 0)
      const daysSinceUpdate = getDaysSinceRowUpdate(row)
      const mainStage = getRowMainStage(row)
      if (mainStage === 'REG') {
        return false
      }

      return missingDocuments > 0 || daysSinceUpdate >= 10
    }).length

    const activityItems = latestRows.slice(0, 4).map((row) => ({
      id: row?.transaction?.id || row?.unit?.id,
      unitId: row?.unit?.id || null,
      unitNumber: row?.unit?.unit_number || '-',
      title: `${row?.development?.name || 'Unknown Development'} • Unit ${row?.unit?.unit_number || '-'}`,
      stageLabel: MAIN_STAGE_LABELS[getRowMainStage(row)] || 'Unknown',
      message:
        row?.transaction?.next_action ||
        row?.transaction?.current_sub_stage_summary ||
        `Transaction is currently in ${MAIN_STAGE_LABELS[getRowMainStage(row)] || 'active'} stage.`,
      timestamp: getRowUpdatedAt(row),
    }))

    return {
      stageCounts,
      progressStages,
      anchorMainStage,
      anchorRow,
      currentStageLabel,
      blockedCount,
      financeWorkflow,
      transferWorkflow,
      activityItems,
      hasData: scopedRows.length > 0,
    }
  }, [sharedDashboardRows])

function renderActiveTransactionsBlock({
  title = 'Active Transactions',
  description = 'Live deal execution progress by unit and stage.',
  emptyText = 'No active transactions to display yet.',
  emptyActionLabel = '',
  onEmptyAction = null,
  limit,
  variant = 'showcase',
  compact = false,
} = {}) {
  const cards = Number.isFinite(limit) ? activeTransactionCards.slice(0, limit) : activeTransactionCards
  const transactionsListPath = isBondRole ? '/applications' : '/units'
  const transactionsListQuery =
    (isAgentRole || isBondRole) && transactionScope !== 'all'
      ? `?transactionType=${encodeURIComponent(transactionScope)}`
      : ''

  const formatFinanceType = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized || normalized === 'unknown') return 'Unknown'
    if (normalized === 'combination') return 'Hybrid'
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }

  const getProgressTone = (percent) => {
    if (percent >= 80) return '#2f8a63'
    if (percent >= 60) return '#2f8696'
    if (percent >= 30) return '#3f78a8'
    return '#7e91a8'
  }

  return (
    <div className={`flex flex-col ${compact ? 'gap-5' : 'gap-6'}`}>
      <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'} lg:flex-row lg:items-start lg:justify-between`}>
        <div className="min-w-0">
          <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3>
          <p className={`mt-2 text-[0.98rem] text-[#6b7d93] ${compact ? 'leading-6' : 'leading-7'}`}>{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
            {activeTransactionCards.length} active
          </span>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
            onClick={() =>
              navigateWithTrace(`${transactionsListPath}${transactionsListQuery}`, 'dashboard-to-transactions-list')
            }
          >
            View all
          </button>
        </div>
      </div>

      {cards.length ? (
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-2">
          <div className={`flex min-w-full ${compact ? 'gap-5' : 'gap-6'}`}>
            {cards.map((item) => {
              const progressPercent = Math.max(0, Math.min(100, Number(item.progressPercent || 0)))
              const progressWidth = Math.max(progressPercent > 0 ? 6 : 0, progressPercent)
              const progressTone = getProgressTone(progressPercent)
              const statusLabel = item.stageLabel || 'Available'
              const unitContext = [item.phaseLabel ? `Phase ${item.phaseLabel}` : null, item.blockLabel ? `Block ${item.blockLabel}` : null]
                .filter(Boolean)
                .join(' • ')
              const buyerLabel = String(item.buyerName || '').trim() || 'Buyer pending'
              const financeLabel = formatFinanceType(item.financeType)
              const updatedLabel = formatRelativeTime(item.updatedAt)
              const supportingSignal = !item.buyerId
                ? 'Buyer record pending'
                : item.attorneyName === 'Unassigned'
                  ? 'Attorney unassigned'
                  : `Updated ${updatedLabel}`
              const cardAction = () => {
                if (item.unitId) {
                  startRouteTransitionTrace({
                    from: location.pathname,
                    to: `/units/${item.unitId}`,
                    label: 'dashboard-to-transaction-workspace',
                  })
                  navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                }
              }

              return (
                <article
                  key={item.id}
                  className="group ui-surface-card flex w-[320px] min-w-[320px] flex-col overflow-hidden transition duration-200 ease-out hover:-translate-y-px hover:border-borderStrong hover:shadow-floating"
                  onClick={cardAction}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                      event.preventDefault()
                      cardAction()
                    }
                  }}
                  role={item.unitId ? 'button' : undefined}
                  tabIndex={item.unitId ? 0 : -1}
                >
                  <header className="border-b border-[#dbe6f2] bg-[linear-gradient(135deg,#f1f6fb_0%,#ecf2f9_100%)] px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-medium tracking-[-0.005em] text-[#49647f]">
                          {item.developmentName}
                        </strong>
                        {unitContext ? <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem] text-[#71869d]">{unitContext}</p> : null}
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[#cddced] bg-white/92 px-2.5 py-1 text-[0.76rem] font-semibold text-[#2f4f6f]">
                        Unit {item.unitNumber}
                      </span>
                    </div>
                  </header>

                  <div className="grid gap-3 px-5 py-4">
                    <section className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: progressTone }}
                          aria-hidden
                        />
                        <strong
                          title={statusLabel}
                          className="overflow-hidden text-ellipsis whitespace-nowrap text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]"
                        >
                          {statusLabel}
                        </strong>
                      </div>
                      <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.79rem] text-[#6c8096]">
                        {supportingSignal}
                      </p>
                    </section>

                    <section className="flex items-center justify-between gap-3">
                      <p
                        title={buyerLabel}
                        className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-medium text-[#2f465e]"
                      >
                        {buyerLabel}
                      </p>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[#d6e1ee] bg-white px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#5b7189]">
                        {financeLabel}
                      </span>
                    </section>

                    <section className="rounded-surface-sm border border-[#e1e9f3] bg-[#fafcfe] px-4 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8fa6]">Progress</span>
                        <strong className="text-[0.95rem] font-semibold text-[#162334]">{Math.round(progressPercent)}%</strong>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#dfe7f1]" aria-hidden>
                        <span
                          className="block h-full rounded-full transition-all duration-200 ease-out"
                          style={{ width: `${progressWidth}%`, backgroundColor: progressTone }}
                        />
                      </div>
                    </section>

                    <footer className="flex items-center justify-end pt-0.5">
                      <span className="inline-flex items-center gap-1 text-[0.88rem] font-semibold text-primary transition duration-150 ease-out group-hover:gap-1.5">
                        View Transaction <ArrowRight size={15} />
                      </span>
                    </footer>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-center">
          <p className="text-sm text-[#6b7d93]">{emptyText}</p>
          {emptyActionLabel && typeof onEmptyAction === 'function' ? (
            <button
              type="button"
              className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-transparent bg-[#35546c] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:bg-[#2e475c]"
              onClick={onEmptyAction}
            >
              {emptyActionLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

  function renderSharedTransactionSection() {
    const selectedWorkflow = activeWorkflowTab === 'transfer' ? sharedDashboardData.transferWorkflow : sharedDashboardData.financeWorkflow
    const selectedWorkflowTitle = activeWorkflowTab === 'transfer' ? 'Transfer Workflow' : 'Finance Workflow'
    const selectedWorkflowDescription =
      activeWorkflowTab === 'transfer'
        ? 'Attorney transfer preparation, guarantees, and pre-lodgement progression.'
        : 'Bond/funding progression from intake to approval and grant readiness.'
    const selectedWorkflowCompleted = selectedWorkflow.filter((step) => step.status === 'completed').length

    return (
      <section className={`mt-10 ${DASHBOARD_PANEL_CLASS}`}>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
          <article className="rounded-[20px] border border-[#e3eaf3] bg-[#fbfcfe] p-6">
            <div className="flex flex-col gap-4">
              <div className="min-w-0">
                <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Shared Transaction State</h3>
                <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Unified lifecycle state that stays consistent across all personas.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={DASHBOARD_CHIP_CLASS}>Tracked {sharedDashboardRows.length}</span>
                <span className={DASHBOARD_CHIP_CLASS}>Current {sharedDashboardData.currentStageLabel}</span>
                <span className={DASHBOARD_CHIP_CLASS}>Blocked {sharedDashboardData.blockedCount}</span>
              </div>
            </div>

            {sharedDashboardData.hasData ? (
              <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Shared transaction lifecycle">
                {sharedDashboardData.progressStages.map((item) => {
                  const toneClass =
                    item.status === 'completed'
                      ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                      : item.status === 'active'
                        ? 'border-[#cfe1f7] bg-[#eff6ff] text-[#35546c]'
                        : 'border-[#dde4ee] bg-white text-[#6b7d93]'

                  return (
                    <li key={item.key} className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
                      <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-white/70 text-[0.78rem] font-semibold" aria-hidden>
                        {item.status === 'completed' ? '✓' : item.status === 'active' ? '●' : '○'}
                      </div>
                      <strong className="block text-[0.95rem] font-semibold tracking-[-0.02em]">{item.label}</strong>
                      <small className="mt-2 block text-[0.82rem] font-medium opacity-80">{item.count} matters</small>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="mt-6 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                No transactions are active yet for this persona scope.
              </p>
            )}
          </article>

          <aside className="rounded-[20px] border border-[#e3eaf3] bg-[#fbfcfe] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Transaction Activity</h3>
                <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Live cross-workflow movement from the shared event stream.</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                onClick={() => navigateWithTrace(sharedActivityViewPath, 'dashboard-to-transactions-list')}
              >
                View all
              </button>
            </div>

            {sharedDashboardData.activityItems.length ? (
              <ul className="mt-6 flex flex-col gap-4">
                {sharedDashboardData.activityItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-4 rounded-[18px] border border-[#e3eaf3] bg-white px-4 py-4 transition duration-150 ease-out hover:border-[#d1dbe8] hover:bg-[#fbfdff]"
                    onClick={() => {
                      if (item.unitId) {
                        startRouteTransitionTrace({
                          from: location.pathname,
                          to: `/units/${item.unitId}`,
                          label: 'dashboard-to-transaction-workspace',
                        })
                        navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                        event.preventDefault()
                        startRouteTransitionTrace({
                          from: location.pathname,
                          to: `/units/${item.unitId}`,
                          label: 'dashboard-to-transaction-workspace',
                        })
                        navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                      }
                    }}
                    role={item.unitId ? 'button' : undefined}
                    tabIndex={item.unitId ? 0 : -1}
                  >
                    <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-[#7fa7cc]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <strong className="text-[0.96rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.title}</strong>
                        <span className={DASHBOARD_CHIP_CLASS}>{item.stageLabel}</span>
                      </div>
                      <p className="mt-2 text-[0.92rem] leading-6 text-[#51657b]">{item.message}</p>
                      <small className="mt-2 block text-[0.78rem] font-medium text-[#7b8ca2]">{formatRelativeTime(item.timestamp)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                No activity yet for this dashboard scope.
              </p>
            )}
          </aside>
        </div>

        {canViewOperationalWorkflows ? (
          <article className="mt-8 rounded-[20px] border border-[#e3eaf3] bg-[#fbfcfe] p-6">
            <div className="min-w-0">
              <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Operational Workflows</h3>
              <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">{selectedWorkflowDescription}</p>
            </div>

            <div className="mt-5 inline-flex items-center rounded-[14px] border border-[#dde4ee] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)]" role="tablist" aria-label="Workflow tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeWorkflowTab === 'finance'}
                className={`inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-sm font-semibold transition duration-150 ease-out ${
                  activeWorkflowTab === 'finance' ? 'bg-[#35546c] text-white' : 'text-[#5b7087] hover:bg-[#f8fafc]'
                }`}
                onClick={() => setActiveWorkflowTab('finance')}
              >
                Finance
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeWorkflowTab === 'transfer'}
                className={`inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-sm font-semibold transition duration-150 ease-out ${
                  activeWorkflowTab === 'transfer' ? 'bg-[#35546c] text-white' : 'text-[#5b7087] hover:bg-[#f8fafc]'
                }`}
                onClick={() => setActiveWorkflowTab('transfer')}
              >
                Transfer
              </button>
            </div>

            <div className="mt-6 rounded-[18px] border border-[#e3eaf3] bg-white p-5">
              <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{selectedWorkflowTitle}</h4>
                <span className={DASHBOARD_CHIP_CLASS}>
                  {selectedWorkflowCompleted}/{selectedWorkflow.length} completed
                </span>
              </header>
              <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedWorkflow.map((step) => (
                  <li
                    key={`${activeWorkflowTab}-${step.label}`}
                    className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 ${
                      step.status === 'completed'
                        ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                        : step.status === 'active'
                          ? 'border-[#cfe1f7] bg-[#eff6ff] text-[#35546c]'
                          : 'border-[#dde4ee] bg-[#fbfcfe] text-[#66758b]'
                    }`}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-white/70 text-[0.78rem] font-semibold" aria-hidden>
                      {step.status === 'completed' ? '✓' : step.status === 'active' ? '●' : '○'}
                    </span>
                    <p className="text-[0.9rem] font-medium tracking-[-0.01em]">{step.label}</p>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        ) : null}
      </section>
    )
  }

  return (
    <section className="flex flex-col">
      {!isSupabaseConfigured ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_KEY</code> in
          <code> .env</code>.
        </p>
      ) : null}

      {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
      {loading ? <LoadingSkeleton lines={8} className="rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]" /> : null}

      {!loading && isSupabaseConfigured ? (
        <>
          {!isRoleScopedDashboard ? (
            <section className="rounded-[22px] border border-[#dde4ee] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={DASHBOARD_ACTION_PRIMARY_CLASS}
                    onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))}
                  >
                    + New Development
                  </button>
                  <button
                    type="button"
                    className={DASHBOARD_ACTION_PRIMARY_CLASS}
                    onClick={() => window.dispatchEvent(new Event('itg:open-new-transaction'))}
                  >
                    + New Transaction
                  </button>
                </div>

                <div className="flex min-w-0 flex-col gap-2 xl:flex-1 xl:flex-row xl:items-center xl:justify-end">
                  <div className={`${DASHBOARD_FIELD_CLASS} min-w-[220px] max-w-[280px]`}>
                    <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">View</span>
                    <select
                      className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-[#162334] outline-none"
                      value={role}
                      onChange={(event) => {
                        setActivePersona(event.target.value)
                        navigate('/dashboard')
                      }}
                    >
                      {personaOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {rolePreviewActive ? <em className="text-[0.74rem] font-semibold not-italic text-[#2563eb]">Preview</em> : null}
                  </div>

                  <div className={`${DASHBOARD_FIELD_CLASS} min-w-0 flex-1 xl:max-w-[500px]`}>
                    <Search size={16} className="shrink-0 text-slate-400" />
                    <input
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#162334] outline-none"
                      type="search"
                      placeholder="Search unit, buyer, stage..."
                    />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!isAgentRole && !isAttorneyRole && !isBondRole && isRoleScopedDashboard ? (
            <section className={`mt-10 ${DASHBOARD_PANEL_CLASS}`}>
              <div>
                <SummaryCards items={topSummaryItems} />
              </div>
            </section>
          ) : null}

          {isBondRole ? (
            <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h3 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">Transaction Scope</h3>
                  <p className="mt-1 text-[0.92rem] text-[#6b7d93]">Filter dashboard transactions between all, developments, and private matters.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <PillToggle
                    items={TRANSACTION_SCOPE_OPTIONS.map((item) => ({ key: item.key, label: item.label }))}
                    value={transactionScope}
                    onChange={setTransactionScope}
                  />
                  <span className={DASHBOARD_CHIP_CLASS}>{roleScopedRows.length} records</span>
                </div>
              </div>
            </section>
          ) : null}

          {isAgentRole ? (
            <>
              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div>
                  <SummaryCards items={topSummaryItems} className="xl:grid-cols-5" />
                </div>
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.06rem] font-semibold tracking-[-0.02em] text-[#142132]">Top Performing Agents</h3>
                    <p className="mt-1 text-[0.9rem] text-[#6b7d93]">Ranked visibility across deals closed, pipeline value, and conversion performance.</p>
                  </div>
                  <span className={DASHBOARD_CHIP_CLASS}>{agentPerformanceMetrics.agentPerformance.length} ranked</span>
                </div>
                {agentPerformanceMetrics.agentPerformance.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {agentPerformanceMetrics.agentPerformance.map((item, index) => {
                      const conversion = Math.max(4, Math.min(100, Number(item.conversion || 0)))
                      return (
                        <article key={`top-agent-${item.agent}`} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4 shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
                          <div className="flex items-start justify-between gap-3">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#cfe0f2] bg-white text-[0.82rem] font-semibold text-[#345777]">
                              #{index + 1}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#5f738a]">
                              {formatPercent(item.conversion)}
                            </span>
                          </div>
                          <div className="mt-3">
                            <p className="text-[0.98rem] font-semibold text-[#142132]">{item.agent}</p>
                            <p className="mt-1 text-[0.83rem] text-[#6b7d93]">{item.registered} closed • {item.deals} total deals</p>
                          </div>
                          <div className="mt-3 grid gap-1.5 text-[0.82rem] text-[#5f738a]">
                            <p>Pipeline value: <span className="font-semibold text-[#22374d]">{currency.format(agentPipelineValueLookup.get(item.agent) || 0)}</span></p>
                            <p>Avg deal time: <span className="font-semibold text-[#22374d]">{Math.round(item.avgDealTime || 0)} days</span></p>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-[#dde8f3]">
                            <span className="block h-full rounded-full bg-[#3f78a8]" style={{ width: `${conversion}%` }} />
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d4e0ee] bg-[#f8fbff] px-5 py-8 text-center">
                    <p className="text-[0.96rem] font-medium text-[#33475d]">No ranked agents yet.</p>
                    <p className="mt-1 text-[0.86rem] text-[#6f8298]">
                      Agent rankings will appear once deals and pipeline activity are captured.
                    </p>
                  </div>
                )}
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                {renderActiveTransactionsBlock({
                  title: 'Active Deals',
                  description: 'Live execution across assigned deals with clear stage and activity visibility.',
                  emptyText: 'No active deals yet. Create a new deal or convert a pipeline item to start tracking progress.',
                  emptyActionLabel: '+ New Deal',
                  onEmptyAction: () => navigate('/new-transaction'),
                  variant: 'showcase',
                })}
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-6">
                  <h3 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Performance Analytics</h3>
                  <p className="mt-2 text-[0.95rem] leading-7 text-[#6b7d93]">
                    Conversion health, team accountability, and deal-performance insight.
                  </p>
                </div>

                <div className="grid gap-6">
                  <article className="rounded-[18px] border border-[#d9e5f3] bg-[#f7fbff] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Conversion Funnel</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Lead movement from first enquiry to registration.</p>
                    {(() => {
                      const getTone = (value) => {
                        if (value >= 60) {
                          return {
                            text: 'text-[#1f7a4f]',
                            chip: 'border-[#cfe9da] bg-[#eef8f2] text-[#1f7a4f]',
                            bar: 'bg-[#2f8a63]',
                          }
                        }
                        if (value >= 35) {
                          return {
                            text: 'text-[#976427]',
                            chip: 'border-[#f2debf] bg-[#fdf5e8] text-[#976427]',
                            bar: 'bg-[#d39a49]',
                          }
                        }
                        return {
                          text: 'text-[#a0383f]',
                          chip: 'border-[#f1ced2] bg-[#fff2f4] text-[#a0383f]',
                          bar: 'bg-[#d35b68]',
                        }
                      }

                      const getFocusCopy = (largestDrop) => {
                        if (!largestDrop) {
                          return 'Focus: keep lead qualification and follow-up consistency high.'
                        }

                        if (largestDrop.fromKey === 'leads' && largestDrop.toKey === 'offers') {
                          return 'Focus: improve lead qualification and follow-up speed.'
                        }
                        if (largestDrop.fromKey === 'offers' && largestDrop.toKey === 'signed') {
                          return 'Focus: tighten offer negotiation and signature turnaround.'
                        }
                        if (largestDrop.fromKey === 'signed' && largestDrop.toKey === 'registered') {
                          return 'Focus: accelerate post-signature execution and handoffs.'
                        }
                        return 'Focus: resolve stage handoff blockers across the conversion path.'
                      }

                      const funnel = agentPerformanceMetrics.conversionFunnel
                      const biggestDrop = agentPerformanceMetrics.biggestFunnelDrop

                      if (!agentPerformanceMetrics.hasFunnelData) {
                        return (
                          <div className="mt-4 rounded-[14px] border border-dashed border-[#cfdceb] bg-white px-4 py-5 text-sm text-[#667a91]">
                            No funnel data yet. Lead-to-registration conversion will appear once pipeline activity is captured.
                          </div>
                        )
                      }

                      return (
                        <>
                          <div className="mt-4 hidden overflow-x-auto pb-2 lg:block">
                            <div className="flex min-w-[880px] items-stretch gap-2">
                              {funnel.map((item, index) => {
                                const tone = getTone(index === 0 ? 100 : item.fromPreviousShare)
                                const cardWidth = Math.max(17, Math.min(38, item.width || 0))
                                const connectorDrop = index < funnel.length - 1 ? item.dropToNext : 0
                                const connectorTone = getTone(100 - connectorDrop)
                                return (
                                  <Fragment key={item.key}>
                                    <article
                                      className="flex min-h-[138px] flex-col justify-between rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3.5"
                                      style={{ width: `${cardWidth}%`, minWidth: '180px' }}
                                    >
                                      <div>
                                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</p>
                                        <p className="mt-1 text-[1.28rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.count}</p>
                                        <p className={`mt-1 text-[0.78rem] font-semibold ${tone.text}`}>
                                          {index === 0
                                            ? 'Base volume'
                                            : `${formatPercent(item.fromPreviousShare)} from ${String(item.previousLabel || '').toLowerCase()}`}
                                        </p>
                                      </div>
                                      <div className="mt-3">
                                        <div className="h-1.5 rounded-full bg-[#dfe9f4]">
                                          <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, item.shareOfLeads || 0))}%` }} />
                                        </div>
                                      </div>
                                    </article>

                                    {index < funnel.length - 1 ? (
                                      <div className="flex min-w-[92px] flex-col items-center justify-center gap-1 px-0.5">
                                        <span className={`rounded-full border px-2 py-1 text-[0.66rem] font-semibold ${connectorTone.chip}`}>
                                          -{formatPercent(connectorDrop)} drop
                                        </span>
                                        <ArrowRight size={15} className="text-[#7a8ea6]" />
                                      </div>
                                    ) : null}
                                  </Fragment>
                                )
                              })}
                            </div>
                          </div>

                          <div className="mt-4 space-y-2 lg:hidden">
                            {funnel.map((item, index) => {
                              const tone = getTone(index === 0 ? 100 : item.fromPreviousShare)
                              return (
                                <Fragment key={`mobile-${item.key}`}>
                                  <article className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</p>
                                        <p className="mt-1 text-[1.12rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.count}</p>
                                      </div>
                                      <span className={`rounded-full border px-2 py-1 text-[0.68rem] font-semibold ${tone.chip}`}>
                                        {index === 0 ? 'Base' : `${formatPercent(item.fromPreviousShare)} from prev`}
                                      </span>
                                    </div>
                                    <div className="mt-3 h-1.5 rounded-full bg-[#dfe9f4]">
                                      <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, item.shareOfLeads || 0))}%` }} />
                                    </div>
                                  </article>
                                  {index < funnel.length - 1 ? (
                                    <div className="flex items-center justify-center gap-2 py-1">
                                      <ArrowRight size={14} className="text-[#7a8ea6]" />
                                      <span className={`rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${getTone(100 - item.dropToNext).chip}`}>
                                        -{formatPercent(item.dropToNext)} drop
                                      </span>
                                    </div>
                                  ) : null}
                                </Fragment>
                              )
                            })}
                          </div>

                          <div className="mt-4 rounded-[12px] border border-[#dce6f2] bg-white px-3.5 py-3">
                            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#6f8399]">Insight</p>
                            <p className="mt-1 text-[0.88rem] font-semibold text-[#22374d]">
                              Biggest drop-off: {biggestDrop ? `${biggestDrop.from} → ${biggestDrop.to} (-${formatPercent(biggestDrop.dropPercent)})` : 'No stage drop-off detected'}
                            </p>
                            <p className="mt-1 text-[0.82rem] text-[#5f738a]">{getFocusCopy(biggestDrop)}</p>
                          </div>
                        </>
                      )
                    })()}
                  </article>

                  <div className="grid gap-6 xl:grid-cols-2">
                    {(() => {
                      const development = agentPerformanceMetrics.developmentVsPrivate.find((item) => item.key === 'development') || { total: 0, conversion: 0, avgDealValue: 0, avgDealTime: 0, label: 'Development' }
                      const privateSales = agentPerformanceMetrics.developmentVsPrivate.find((item) => item.key === 'private') || { total: 0, conversion: 0, avgDealValue: 0, avgDealTime: 0, label: 'Private' }
                      const totalDeals = Math.max(development.total + privateSales.total, 1)
                      const developmentShare = (development.total / totalDeals) * 100
                      return (
                        <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                          <h4 className="text-[1rem] font-semibold text-[#142132]">Development vs Private</h4>
                          <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Conversion per category, average deal value, and cycle speed.</p>
                          <div className="mt-4 grid gap-4 lg:grid-cols-[190px_1fr] lg:items-center">
                            <div className="mx-auto h-[170px] w-[170px] rounded-full" style={{ background: `conic-gradient(#3f78a8 0 ${developmentShare}%, #2f8a63 ${developmentShare}% 100%)` }}>
                              <div className="mx-auto mt-[20px] flex h-[130px] w-[130px] items-center justify-center rounded-full bg-white">
                                <span className="text-[1.3rem] font-semibold text-[#142132]">{development.total + privateSales.total}</span>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[0.9rem] font-semibold text-[#22374d]">Development</p>
                                  <p className="text-[0.85rem] font-semibold text-[#35546c]">{development.total} ({formatPercent(developmentShare)})</p>
                                </div>
                                <p className="mt-1 text-[0.8rem] text-[#5f738a]">Conversion {formatPercent(development.conversion)} • Avg {currency.format(development.avgDealValue || 0)} • {Math.round(development.avgDealTime || 0)}d</p>
                              </div>
                              <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[0.9rem] font-semibold text-[#22374d]">Private</p>
                                  <p className="text-[0.85rem] font-semibold text-[#2f8a63]">{privateSales.total} ({formatPercent(100 - developmentShare)})</p>
                                </div>
                                <p className="mt-1 text-[0.8rem] text-[#5f738a]">Conversion {formatPercent(privateSales.conversion)} • Avg {currency.format(privateSales.avgDealValue || 0)} • {Math.round(privateSales.avgDealTime || 0)}d</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })()}

                    {(() => {
                      const cash = agentPerformanceMetrics.cashVsBond.find((item) => item.key === 'cash') || { total: 0, conversion: 0, avgDealTime: 0, label: 'Cash' }
                      const bond = agentPerformanceMetrics.cashVsBond.find((item) => item.key === 'bond') || { total: 0, conversion: 0, avgDealTime: 0, label: 'Bond' }
                      const totalDeals = Math.max(cash.total + bond.total, 1)
                      const cashShare = (cash.total / totalDeals) * 100
                      return (
                        <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                          <h4 className="text-[1rem] font-semibold text-[#142132]">Cash vs Bond</h4>
                          <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Deal mix with conversion and average deal-time signals.</p>
                          <div className="mt-4 grid gap-4 lg:grid-cols-[190px_1fr] lg:items-center">
                            <div className="mx-auto h-[170px] w-[170px] rounded-full" style={{ background: `conic-gradient(#3f78a8 0 ${cashShare}%, #2f8a63 ${cashShare}% 100%)` }}>
                              <div className="mx-auto mt-[20px] flex h-[130px] w-[130px] items-center justify-center rounded-full bg-white">
                                <span className="text-[1.3rem] font-semibold text-[#142132]">{cash.total + bond.total}</span>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[0.9rem] font-semibold text-[#22374d]">Cash</p>
                                  <p className="text-[0.85rem] font-semibold text-[#35546c]">{cash.total} ({formatPercent(cashShare)})</p>
                                </div>
                                <p className="mt-1 text-[0.8rem] text-[#5f738a]">Conversion {formatPercent(cash.conversion)} • Avg {Math.round(cash.avgDealTime || 0)}d</p>
                              </div>
                              <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[0.9rem] font-semibold text-[#22374d]">Bond</p>
                                  <p className="text-[0.85rem] font-semibold text-[#2f8a63]">{bond.total} ({formatPercent(100 - cashShare)})</p>
                                </div>
                                <p className="mt-1 text-[0.8rem] text-[#5f738a]">Conversion {formatPercent(bond.conversion)} • Avg {Math.round(bond.avgDealTime || 0)}d</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })()}
                  </div>

                  <article className="rounded-[18px] border border-[#dce6f2] bg-[#f9fcff] p-5">
                    <div className="mb-4">
                      <h4 className="text-[1rem] font-semibold text-[#142132]">Performance Metrics</h4>
                      <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Property type and buyer profile intelligence across active and closed deals.</p>
                    </div>
                    {(() => {
                      const colors = ['#3f78a8', '#2f8a63', '#22a3ad', '#d39a49', '#7f8fa3', '#bf4ed8']

                      const buildDonutData = (rows) => {
                        const normalizedRows = rows.map((row, index) => ({
                          ...row,
                          value: Number(row.value || row.count || 0),
                          color: colors[index % colors.length],
                        }))
                        const total = normalizedRows.reduce((sum, row) => sum + row.value, 0)
                        return {
                          rows: normalizedRows.map((row) => ({
                            ...row,
                            share: total ? (row.value / total) * 100 : 0,
                          })),
                          total,
                        }
                      }

                      const toConicGradient = (rows, total) => {
                        if (!total) {
                          return 'conic-gradient(#dce6f2 0 100%)'
                        }
                        let cursor = 0
                        const segments = rows.map((row) => {
                          const start = cursor
                          cursor += row.share
                          return `${row.color} ${start}% ${cursor}%`
                        })
                        return `conic-gradient(${segments.join(', ')})`
                      }

                      const propertySource = propertyTypeView === 'volume'
                        ? agentPerformanceMetrics.propertyTypeByVolume.map((item) => ({ key: item.key, label: item.label, value: item.count }))
                        : agentPerformanceMetrics.propertyTypeByValue.map((item) => ({ key: item.key, label: item.label, value: item.value }))
                      const propertyDonut = buildDonutData(propertySource)
                      const ageDonut = buildDonutData(agentPerformanceMetrics.buyerInsights.ageGroups.map((item) => ({ key: item.label, label: item.label, value: item.count })))
                      const buyerTypeDonut = buildDonutData(agentPerformanceMetrics.buyerInsights.buyerTypes.map((item) => ({ key: item.label, label: item.label, value: item.count })))
                      const financeDonut = buildDonutData(agentPerformanceMetrics.buyerInsights.financeTypes.map((item) => ({ key: item.label, label: item.label, value: item.count })))

                      const donutCard = ({ title, subtitle, data, valueFormatter, headerAction = null }) => (
                        <article className="flex h-full min-h-[280px] flex-col justify-between rounded-[14px] border border-[#dce6f2] bg-white p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-[0.93rem] font-semibold text-[#22374d]">{title}</h5>
                            {headerAction}
                          </div>
                          <div className="mt-3 flex flex-1 flex-col justify-between rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                            <div className="grid items-center gap-4 xl:grid-cols-[132px_1fr]">
                              <div className="mx-auto h-[132px] w-[132px] rounded-full" style={{ background: toConicGradient(data.rows, data.total) }}>
                                <div className="mx-auto mt-[16px] flex h-[100px] w-[100px] items-center justify-center rounded-full bg-white">
                                  <span className="text-[1.08rem] font-semibold text-[#142132]">
                                    {valueFormatter ? valueFormatter(data.total) : data.total}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {data.rows.map((item) => (
                                  <div key={`${title}-${item.key}`} className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e0e9f3] bg-white px-2.5 py-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                      <span className="truncate text-[0.8rem] font-medium text-[#22374d]">{item.label}</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[0.78rem] font-semibold text-[#142132]">{valueFormatter ? valueFormatter(item.value) : item.value}</p>
                                      <p className="text-[0.72rem] font-semibold text-[#6c8198]">{formatPercent(item.share)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <p className="mt-3 text-[0.75rem] text-[#7b8ca2]">{subtitle}</p>
                          </div>
                        </article>
                      )

                      return (
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                          {donutCard({
                            title: 'Property Type Breakdown',
                            subtitle: propertyTypeView === 'volume'
                              ? 'Count and share by property category'
                              : 'Secured value and share by property category',
                            data: propertyDonut,
                            valueFormatter: propertyTypeView === 'volume' ? null : (value) => currency.format(value || 0),
                            headerAction: (
                              <div className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-[#f7fbff] p-1">
                                <button
                                  type="button"
                                  onClick={() => setPropertyTypeView('volume')}
                                  className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                    propertyTypeView === 'volume'
                                      ? 'bg-[#1f4f78] text-white'
                                      : 'text-[#35546c]'
                                  }`}
                                >
                                  By Volume
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPropertyTypeView('value')}
                                  className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                    propertyTypeView === 'value'
                                      ? 'bg-[#1f4f78] text-white'
                                      : 'text-[#35546c]'
                                  }`}
                                >
                                  By Value
                                </button>
                              </div>
                            ),
                          })}

                          {donutCard({
                            title: 'Buyer Age Group',
                            subtitle: 'Age distribution across buyers in current deal flow.',
                            data: ageDonut,
                          })}

                          {donutCard({
                            title: 'Buyer Type',
                            subtitle: 'Purchaser profile mix by legal buyer type.',
                            data: buyerTypeDonut,
                          })}

                          {donutCard({
                            title: 'Finance Type',
                            subtitle: 'Funding profile mix across the active portfolio.',
                            data: financeDonut,
                          })}
                        </div>
                      )
                    })()}
                  </article>

                  <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Agent Performance</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Leaderboard view of deal output, conversion, cycle time, pipeline, and commission.</p>
                    {agentPerformanceMetrics.agentPerformance.length ? (
                      <div className="mt-4 grid gap-3">
                        {agentPerformanceMetrics.agentPerformance.map((item) => {
                          const conversion = Math.max(3, Math.min(100, Number(item.conversion || 0)))
                          return (
                            <div key={`agent-performance-${item.agent}`} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                              <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))] md:items-center">
                                <p className="truncate text-[0.92rem] font-semibold text-[#22374d]">{item.agent}</p>
                                <p className="text-[0.8rem] text-[#5f738a]">{item.deals} deals</p>
                                <p className="text-[0.8rem] font-semibold text-[#35546c]">{formatPercent(item.conversion)}</p>
                                <p className="text-[0.8rem] text-[#5f738a]">{Math.round(item.avgDealTime || 0)}d avg</p>
                                <p className="truncate text-[0.8rem] text-[#5f738a]">{currency.format(agentPipelineValueLookup.get(item.agent) || 0)}</p>
                                <p className="truncate text-[0.8rem] text-[#5f738a]">{currency.format((agentPipelineValueLookup.get(item.agent) || 0) * 0.03)}</p>
                              </div>
                              <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                                <span className="block h-full rounded-full bg-[#416f99]" style={{ width: `${conversion}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[14px] border border-dashed border-[#d3ddea] bg-white px-4 py-6 text-center">
                        <p className="text-[0.9rem] font-medium text-[#33475d]">No data yet.</p>
                        <p className="mt-1 text-[0.82rem] text-[#6f8298]">This will update once listings, deals, and pipeline activity are captured.</p>
                      </div>
                    )}
                  </article>

                  <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Asking vs Selling Price</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Compare pricing position and variance across live and completed deals.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Asking Price</p>
                        <p className="mt-1.5 text-[1.08rem] font-semibold text-[#142132]">{currency.format(agentPerformanceMetrics.avgAskingPrice || 0)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Selling Price</p>
                        <p className="mt-1.5 text-[1.08rem] font-semibold text-[#142132]">{currency.format(agentPerformanceMetrics.avgSellingPrice || 0)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Variance</p>
                        <p className={`mt-1.5 text-[1.08rem] font-semibold ${agentPerformanceMetrics.askingVsSellingDelta >= 0 ? 'text-[#2f8a63]' : 'text-[#b54645]'}`}>
                          {agentPerformanceMetrics.askingVsSellingDelta >= 0 ? '+' : ''}
                          {agentPerformanceMetrics.askingVsSellingDelta.toFixed(1)}%
                        </p>
                        <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                          <span
                            className={`block h-full rounded-full ${agentPerformanceMetrics.askingVsSellingDelta >= 0 ? 'bg-[#2f8a63]' : 'bg-[#b54645]'}`}
                            style={{ width: `${Math.min(100, Math.max(8, Math.abs(agentPerformanceMetrics.askingVsSellingDelta) * 4))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Marketing Sources</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Deals per source and percentage contribution.</p>
                    {agentPerformanceMetrics.marketingSources.length ? (
                      <div className="mt-4 grid gap-3">
                        {agentPerformanceMetrics.marketingSources.slice(0, 6).map((item) => (
                          <div key={item.source} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[0.92rem] font-medium text-[#22374d]">{item.source}</span>
                              <span className="text-[0.9rem] font-semibold text-[#142132]">{item.deals} • {formatPercent(item.share)}</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                              <span className="block h-full rounded-full bg-[#4f7da6]" style={{ width: `${Math.max(5, Math.min(100, item.share))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[14px] border border-dashed border-[#d3ddea] bg-white px-4 py-6 text-center">
                        <p className="text-[0.9rem] font-medium text-[#33475d]">No data yet.</p>
                        <p className="mt-1 text-[0.82rem] text-[#6f8298]">
                          This will update once listings, deals, and pipeline activity are captured.
                        </p>
                      </div>
                    )}
                  </article>
                </div>
              </section>
            </>
          ) : isAttorneyRole ? (
            <ConveyancerDashboardPage rows={rows} profileEmail={profile?.email || ''} />
          ) : isBondRole ? (
            <>
              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <SummaryCards items={bondTopStats} className="xl:grid-cols-4" />
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Active Applications</h3>
                    <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Scrollable live applications so you can move through the queue without compressing the detail.</p>
                  </div>
                  <span className={DASHBOARD_CHIP_CLASS}>
                    <ArrowRightLeft size={12} />
                    {bondApplicationCards.length} in motion
                  </span>
                </div>

                <div className="-mx-2 overflow-x-auto overflow-y-hidden px-2 pb-1">
                  <div className="flex min-w-max gap-2.5 pr-2">
                    {bondApplicationCards.map((item) => (
                      <article
                        key={`bond-application-${item.id}`}
                        className="group grid min-h-[248px] w-[328px] shrink-0 grid-rows-[auto_auto_1fr_auto] rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#ccd6e3] hover:shadow-[0_18px_32px_rgba(15,23,42,0.08)]"
                        onClick={() => openBondApplication(navigate, item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openBondApplication(navigate, item)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#8aa0b8]">{item.reference}</span>
                            <span className="mt-2 block text-[0.92rem] font-medium text-[#6e8298]">{item.daysSinceUpdate}d since update</span>
                          </div>
                          <span
                            title={item.stageLabel}
                            className="inline-flex max-w-[136px] shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[#d9e7fb] bg-[#f8fbff] px-3 py-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.09em] text-[#617a94]"
                          >
                            {item.stageLabel}
                          </span>
                        </div>

                        <div className="grid gap-2.5 pt-4">
                          <div className="flex items-start justify-between gap-3">
                            <strong className="line-clamp-2 block min-h-[2.9rem] text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{item.buyerName}</strong>
                            <span className="inline-flex shrink-0 items-center rounded-full border border-[#d9e7fb] bg-[#f8fbff] px-3 py-1 text-[0.72rem] font-semibold text-[#617a94]">
                              {item.financeType === 'combination' ? 'Hybrid' : 'Bond'}
                            </span>
                          </div>
                          <p className="line-clamp-1 min-h-[1.5rem] text-[0.92rem] leading-6 text-[#607387]">
                            {item.developmentName} • Unit {item.unitNumber}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.78rem] font-semibold text-[#617a94]">
                              {item.bank}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.78rem] font-semibold text-[#617a94]">
                              {item.missingDocuments} missing docs
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 min-h-[72px] rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                          <p className="line-clamp-3 text-sm leading-6 text-[#5f7287]">{item.nextAction}</p>
                        </div>

                        <div className="mt-3 border-t border-[#edf2f7] pt-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.8rem] font-medium text-[#7b8ca2]">Application progress</span>
                            <span className="text-[0.82rem] font-semibold text-[#516579]">{item.progressPercent}%</span>
                          </div>
                          <div className="mt-3 h-2.5 rounded-full bg-[#e9f0f6]" aria-hidden>
                            <div className="h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#6f90ab_100%)]" style={{ width: `${Math.max(item.progressPercent, 10)}%` }} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-6">
                  <h3 className="text-[1.12rem] font-semibold tracking-[-0.025em] text-[#142132]">Performance & Insights</h3>
                  <p className="mt-2 text-[0.95rem] leading-7 text-[#6b7d93]">
                    Bank concentration, referral mix, application statuses, and conversion health across your assigned pipeline.
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="text-[1rem] font-semibold text-[#142132]">Bank Comparison</h4>
                      <span className={DASHBOARD_CHIP_CLASS}>
                        <Building2 size={12} />
                        {bondPerformanceMetrics.bankComparison.length} banks
                      </span>
                    </div>
                    <div className="space-y-3.5">
                      {bondPerformanceMetrics.bankComparison.map((item) => (
                        <div key={item.bank} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.9rem] font-medium text-[#22374d]">{item.bank}</span>
                            <span className="text-[0.88rem] font-semibold text-[#142132]">{item.count}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                            <span className="block h-full rounded-full bg-[#4f7da6]" style={{ width: `${Math.max(7, Math.min(100, item.width))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Agent / Agency Comparison</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Ranked list by number of deals</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top Agents</p>
                        <div className="mt-2 space-y-2.5">
                          {bondPerformanceMetrics.rankedAgents.map((item, index) => (
                            <div key={`agent-rank-${item.name}`} className="flex items-center justify-between gap-2 text-[0.88rem]">
                              <span className="truncate text-[#22374d]">{index + 1}. {item.name}</span>
                              <span className="font-semibold text-[#142132]">{item.deals}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top Agencies</p>
                        <div className="mt-2 space-y-2.5">
                          {bondPerformanceMetrics.rankedAgencies.map((item, index) => (
                            <div key={`agency-rank-${item.name}`} className="flex items-center justify-between gap-2 text-[0.88rem]">
                              <span className="truncate text-[#22374d]">{index + 1}. {item.name}</span>
                              <span className="font-semibold text-[#142132]">{item.deals}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Application Status Breakdown</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">New, awaiting docs, submitted, approved, declined</p>
                    <div className="mt-4 space-y-3">
                      {bondPerformanceMetrics.statusBreakdown.map((item) => {
                        const base = Math.max(bondPerformanceMetrics.conversionFunnel[0]?.count || 1, 1)
                        const width = ((item.count || 0) / base) * 100
                        return (
                          <div key={item.key} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[0.9rem] font-medium text-[#22374d]">{item.label}</span>
                              <span className="text-[0.86rem] font-semibold text-[#142132]">{item.count}</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                              <span className="block h-full rounded-full bg-[#3c78a8]" style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, width))}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Conversion Funnel</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Deals received → applications submitted → approvals</p>
                    <div className="mt-4 space-y-3">
                      {bondPerformanceMetrics.conversionFunnel.map((item) => (
                        <div key={item.key} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.9rem] font-medium text-[#22374d]">{item.label}</span>
                            <span className="text-[0.86rem] font-semibold text-[#142132]">{item.count} ({formatPercent(item.share)})</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                            <span className="block h-full rounded-full bg-[#35546c]" style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, item.width))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : (
            <></>
          )}

          {!isRoleScopedDashboard ? (
            <section className="mt-3 rounded-[22px] border border-[#dde4ee] bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="grid gap-2.5 lg:grid-cols-5">
                {summaryItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <article
                      key={item.label}
                      className="rounded-[18px] border border-[#dde4ee] bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                    >
                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <span className="text-[0.95rem] font-medium tracking-[-0.01em] text-[#3b4f65]">{item.label}</span>
                        {Icon ? <Icon size={18} className="text-[#334155]" aria-hidden="true" /> : null}
                      </div>
                      <strong className="block text-[1.75rem] font-semibold leading-none tracking-[-0.035em] text-[#142132]">
                        {item.value}
                      </strong>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {!isRoleScopedDashboard ? (
          <section className="mt-3 rounded-[22px] border border-[#dde4ee] bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            {renderActiveTransactionsBlock({
              title: 'Active Transactions',
              description: 'Live deal execution across the portfolio, with the current stage and next action in one place.',
              limit: 6,
              compact: true,
              withDivider: false,
              variant: 'showcase',
            })}
          </section>
          ) : null}

          {!isRoleScopedDashboard ? (
            <section className="mt-4 grid gap-5">
              <section className="grid items-stretch gap-4 lg:grid-cols-2">
                <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Transaction Funnel</h3>
                      <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">High-level stage distribution and movement conversion.</p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                      <TrendingUp size={12} />
                      {rows.length} tracked units
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col divide-y divide-[#edf2f7]">
                    {funnelData.map((item) => (
                      <div key={item.key} className="grid gap-3 py-4 md:grid-cols-[150px_220px_96px] md:items-center md:justify-between">
                        <div className="text-[0.98rem] font-medium tracking-[-0.02em] text-[#23384d]">{item.label}</div>
                        <div className="h-3 w-[220px] rounded-full bg-[#e7eef6]" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-[#5c82a3]"
                            style={{ width: `${item.width}%` }}
                          />
                        </div>
                        <div className="flex flex-col items-end justify-center text-right">
                          <div className="flex items-baseline gap-2 leading-none">
                            <strong className="text-[0.98rem] font-semibold text-[#142132]">{item.count}</strong>
                            <em className="text-[0.78rem] not-italic font-medium text-[#6b7d93]">{formatPercent(item.share)}</em>
                          </div>
                          {item.conversion !== null ? (
                            <small className="mt-1 text-[0.74rem] leading-none text-[#8da0b5]">{formatPercent(item.conversion)} prev</small>
                          ) : (
                            <small className="mt-1 text-[0.74rem] leading-none text-[#8da0b5]">-</small>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Cash vs Bond Buyers</h3>
                      <p className="mt-1.5 text-[0.88rem] leading-5 text-[#6b7d93]">Buyer financing split by transaction count and value.</p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                      <PieChart size={12} />
                      {financeMix.totalCount} active
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[152px_minmax(0,1fr)] lg:items-center">
                    <div className="mx-auto h-[152px] w-[152px] rounded-full" style={{ background: financeMix.gradient }} aria-hidden="true">
                      <div className="mx-auto mt-[30px] h-[92px] w-[92px] rounded-full bg-white" />
                    </div>

                    <ul className="grid gap-2">
                      {financeLegendSegments.map((item) => (
                        <li key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-3.5 py-2">
                          <span className="h-3 w-3 rounded-full" style={{ background: FINANCE_MIX_COLORS[item.key] }} />
                          <div className="min-w-0">
                            <strong className="block text-[0.9rem] font-semibold text-[#142132]">{item.label}</strong>
                            <small className="block text-[0.78rem] text-[#7c8ea4]">{currency.format(item.value || 0)}</small>
                          </div>
                          <em className="text-[0.94rem] not-italic font-semibold text-[#35546c]">{item.count}</em>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-3.5">
                    <div className="mb-2.5">
                      <strong className="block text-[0.92rem] font-semibold text-[#142132]">Finance Snapshot</strong>
                      <span className="text-[0.78rem] text-[#7c8ea4]">Current funding mix at a glance</span>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {financeMixSnapshot.map((item) => (
                        <article key={item.label} className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                          <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</span>
                          <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{item.value}</strong>
                        </article>
                      ))}
                    </div>
                  </section>
                </article>
              </section>

              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Stage Aging Heatmap</h3>
                    <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">How long transactions have been sitting at each master stage.</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    <TrendingUp size={12} />
                    {stageAging.totalTracked} tracked deals
                  </span>
                </div>

                <div className="grid grid-cols-[minmax(120px,160px)_repeat(4,minmax(0,1fr))] gap-3" role="table" aria-label="Stage aging heatmap by day buckets">
                  <div className="px-3 py-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]" role="columnheader">
                    Stage
                  </div>
                  {STAGE_AGING_BUCKETS.map((bucket) => (
                    <div key={bucket.key} className="px-3 py-2 text-center text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]" role="columnheader">
                      {bucket.label}
                    </div>
                  ))}

                  {stageAging.stages.map((stage) => (
                    <Fragment key={stage.key}>
                      <div className="flex items-center px-3 py-3 text-[0.95rem] font-medium text-[#23384d]" role="rowheader">
                        {stage.label}
                      </div>
                      {stage.cells.map((cell) => {
                        const level = getHeatLevel(cell.count, stageAging.maxCellCount)
                        const toneClass =
                          level >= 4
                            ? 'bg-[#35546c] text-white'
                            : level === 3
                              ? 'bg-[#5f84a7] text-white'
                              : level === 2
                                ? 'bg-[#dfe9f4] text-[#35546c]'
                                : level === 1
                                  ? 'bg-[#eef4f9] text-[#6b7d93]'
                                  : 'bg-[#f8fafc] text-[#97a6b8]'

                        return (
                          <div
                            key={`${stage.key}-${cell.key}`}
                            className={`flex min-h-[54px] items-center justify-center rounded-[14px] border border-[#e4ebf4] text-[0.95rem] font-semibold ${toneClass}`}
                            title={`${stage.label}: ${cell.count} deal${cell.count === 1 ? '' : 's'} in ${cell.label}`}
                            role="cell"
                          >
                            {cell.count}
                          </div>
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              </section>

              {/* TODO(bridge): Reintroduce marketing/demographic analytics once buyer profile fields are intentionally modeled and consistently populated. */}
            </section>
          ) : null}

        </>
      ) : null}
    </section>
  )
}

export default Dashboard
