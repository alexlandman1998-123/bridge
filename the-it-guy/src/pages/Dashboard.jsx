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
import { useNavigate } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import OpenOnboardingButton from '../components/OpenOnboardingButton'
import PageActionBar from '../components/PageActionBar'
import SummaryCards from '../components/SummaryCards'
import BondCommissionEarningsPanel from '../components/BondCommissionEarningsPanel'
import ConveyancerDashboardPage from '../components/ConveyancerDashboardPage'
import {
  STAGE_AGING_BUCKETS,
  selectActiveTransactions,
  selectBuyerIntelligence,
  selectFinanceMix,
  selectPortfolioMetrics,
  selectStageAging,
  selectStageDistribution,
} from '../core/transactions/developerSelectors'
import {
  selectAgentAttention,
  selectAgentPipeline,
  selectAgentRecentActivity,
  selectAgentSummary,
} from '../core/transactions/agentSelectors'
import {
} from '../core/transactions/attorneySelectors'
import { buildAgentDemoRows, buildAttorneyDemoRows, buildBondDemoRows } from '../core/transactions/attorneyMockData'
import {
  getBondApplicationStage,
  isReadyForAttorneys,
  selectBondSummary,
} from '../core/transactions/bondSelectors'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getMainStageFromDetailedStage,
} from '../core/transactions/stageConfig'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDashboardOverview, fetchTransactionsByParticipant } from '../lib/api'
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

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      if ((role === 'agent' || role === 'bond_originator' || role === 'attorney') && profile?.id) {
        const roleType = role === 'bond_originator' ? 'bond_originator' : role === 'attorney' ? 'attorney' : 'agent'
        const participantRows = await fetchTransactionsByParticipant({
          userId: profile.id,
          roleType,
        })
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
      } else if (role === 'agent' || role === 'bond_originator' || role === 'attorney') {
        setOverview({
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
    function onTransactionCreated() {
      void loadDashboard()
    }

    window.addEventListener('itg:transaction-created', onTransactionCreated)
    return () => window.removeEventListener('itg:transaction-created', onTransactionCreated)
  }, [loadDashboard])

  const rows = useMemo(() => overview.rows || [], [overview.rows])

  const portfolioMetrics = useMemo(
    () => selectPortfolioMetrics(rows, { totalDevelopmentsOverride: overview.metrics.totalDevelopments }),
    [overview.metrics.totalDevelopments, rows],
  )

  const summaryItems = useMemo(() => {
    return [
      { label: 'Total Developments', value: portfolioMetrics.totalDevelopments, icon: Building2 },
      { label: 'Total Units', value: portfolioMetrics.totalUnits, icon: LandPlot },
      { label: 'Revenue Secured', value: currency.format(Number(portfolioMetrics.totalSalesValue) || 0), icon: Banknote },
      { label: 'Deals In Progress', value: portfolioMetrics.dealsInProgress, icon: ArrowRightLeft },
      { label: 'Registered', value: portfolioMetrics.unitsRegistered, icon: FileCheck2 },
    ]
  }, [portfolioMetrics])

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

  const activeTransactionCards = useMemo(() => selectActiveTransactions(rows), [rows])
  const stageAging = useMemo(() => selectStageAging(rows), [rows])
  const buyerIntelligence = useMemo(() => selectBuyerIntelligence(rows), [rows])

  const canAccessReports = ['developer', 'attorney', 'bond_originator'].includes(role)
  const isAgentRole = role === 'agent'
  const isBondRole = role === 'bond_originator'
  const isAttorneyRole = role === 'attorney'
  const isRoleScopedDashboard = isAgentRole || isBondRole || isAttorneyRole
  const canViewOperationalWorkflows = role !== 'client'

  const agentSummary = useMemo(() => selectAgentSummary(rows), [rows])
  const agentPipeline = useMemo(() => selectAgentPipeline(rows), [rows])
  const agentAttention = useMemo(() => selectAgentAttention(rows), [rows])
  const agentRecentActivity = useMemo(() => selectAgentRecentActivity(rows), [rows])
  const bondSummary = useMemo(() => selectBondSummary(rows), [rows])
  const bondReadyForAttorneys = useMemo(
    () =>
      rows.filter((row) => row?.transaction && getBondApplicationStage(row) === 'approval_granted' && !isReadyForAttorneys(row)),
    [rows],
  )
  const bondHandedOffToAttorneys = useMemo(() => rows.filter((row) => isReadyForAttorneys(row)).length, [rows])
  const bondApplicationCards = useMemo(
    () =>
      [...rows]
        .filter((row) => row?.transaction)
        .sort((left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0))
        .map((row) => {
          const stageKey = getBondApplicationStage(row)
          return {
            id: row?.transaction?.id || row?.unit?.id,
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
    [rows],
  )
  const bondInsights = useMemo(() => {
    const applications = rows.filter((row) => row?.transaction)
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
  }, [bondSummary.approvals, rows])
  const topSummaryItems = useMemo(() => {
    if (isAgentRole) {
      return [
        { label: 'Active Transactions', value: agentSummary.activeTransactions, icon: ArrowRightLeft },
        { label: 'Awaiting Buyer Action', value: agentSummary.awaitingBuyerAction, icon: Users },
        { label: 'Missing Documents', value: agentSummary.missingDocuments, icon: FileCheck2 },
        { label: 'Ready for OTP / Next Stage', value: agentSummary.readyForNextStage, icon: TrendingUp },
        { label: 'Registered', value: agentSummary.registeredDeals, icon: FileCheck2 },
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
  }, [agentSummary.activeTransactions, agentSummary.awaitingBuyerAction, agentSummary.missingDocuments, agentSummary.readyForNextStage, agentSummary.registeredDeals, bondSummary.active, bondSummary.approvals, bondSummary.declined, bondSummary.docsPending, bondSummary.submittedToBanks, isAgentRole, isBondRole, summaryItems])
  const sharedActivityViewPath = useMemo(() => {
    if (isAttorneyRole) return '/transactions'
    if (isBondRole) return '/applications'
    return '/units'
  }, [isAttorneyRole, isBondRole])

  const sharedDashboardData = useMemo(() => {
    const scopedRows = rows.filter((row) => row?.transaction)
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
  }, [rows])

  const navigateToAttorneyTransfers = useCallback(
    (params = {}) => {
      const search = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).length > 0) {
          search.set(key, String(value))
        }
      })

      const query = search.toString()
      navigate(query ? `/transactions?${query}` : '/transactions')
    },
    [navigate],
  )

function renderActiveTransactionsBlock({
  title = 'Active Transactions',
  description = 'Live deal execution progress by unit and stage.',
  emptyText = 'No active transactions to display yet.',
  limit,
  variant = 'showcase',
  compact = false,
} = {}) {
    const cards = Number.isFinite(limit) ? activeTransactionCards.slice(0, limit) : activeTransactionCards

    const formatFinanceChip = (value) => {
      const normalized = String(value || '').trim().toLowerCase()
      if (normalized === 'combination') return 'Hybrid'
      if (!normalized || normalized === 'unknown') return 'Unknown'
      return normalized.replace(/\b\w/g, (match) => match.toUpperCase())
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
            {Number.isFinite(limit) && activeTransactionCards.length > cards.length ? (
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                onClick={() => navigate('/units')}
              >
                View all
              </button>
            ) : null}
          </div>
        </div>

        <div className={`grid ${compact ? 'gap-5' : 'gap-6'} xl:grid-cols-3`}>
          {cards.map((item) => (
            <article
              key={item.id}
              className="group overflow-hidden rounded-[22px] border border-[#d7e2ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition duration-200 ease-out hover:-translate-y-[2px] hover:border-[#cdd8e5] hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)]"
              onClick={() => {
                if (item.unitId) {
                  navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                  event.preventDefault()
                  navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                }
              }}
              role={item.unitId ? 'button' : undefined}
              tabIndex={item.unitId ? 0 : -1}
            >
              <div className={`flex items-center justify-between bg-gradient-to-r from-[#456883] to-[#5e81a2] text-white transition duration-200 ease-out group-hover:from-[#3f617c] group-hover:to-[#567896] ${compact ? 'px-5 py-4' : 'px-6 py-5'}`}>
                <span className="text-[0.82rem] font-semibold uppercase tracking-[0.09em] text-[#eef5fb]">{item.developmentName}</span>
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.88rem] font-semibold tracking-[-0.02em] text-white">
                  Unit {item.unitNumber}
                </span>
              </div>

              <div className={`flex flex-col ${compact ? 'gap-4 px-5 py-5' : 'gap-5 px-6 py-6'}`}>
                <header className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <strong className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.buyerName}</strong>
                    <span className="text-[0.78rem] font-medium text-[#8ca0b6]">{item.progressPercent}% complete</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-[#cfe1f7] bg-[#eff6ff] px-3 py-1 text-[0.78rem] font-semibold text-[#35546c]">
                      {item.stageKey === 'AVAIL' ? 'Available' : 'Active'}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#e2e8f2] bg-[#fbfcfe] px-3 py-1 text-[0.78rem] font-semibold text-[#6b7d93]">
                      {formatFinanceChip(item.financeType)}
                    </span>
                  </div>
                </header>

                <div className={`grid ${compact ? 'gap-3.5' : 'gap-4'} sm:grid-cols-2`}>
                  <article className="flex flex-col gap-1">
                    <span className="text-[0.76rem] font-medium uppercase tracking-[0.1em] text-[#8a9cb0]">Current Stage</span>
                    <strong
                      title={item.stageLabel}
                      className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.95rem] font-semibold tracking-[-0.02em] text-[#162334]"
                    >
                      {item.stageLabel}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[0.76rem] font-medium uppercase tracking-[0.1em] text-[#8a9cb0]">Attorney</span>
                    <strong className="text-[1rem] font-semibold tracking-[-0.02em] text-[#162334]">{item.attorneyName}</strong>
                  </article>
                </div>

                <section className="border-t border-[#e8eef5] pt-4">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <span className="text-[0.86rem] font-medium text-[#70839a]">Progress</span>
                    <strong className="text-[0.98rem] font-semibold text-[#162334]">{item.progressPercent}% complete</strong>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#e9eff6]" aria-hidden>
                    <span className="block h-full rounded-full bg-[#7fa7cc] transition-all duration-200 ease-out group-hover:bg-[#6f9cc5]" style={{ width: `${item.progressPercent}%` }} />
                  </div>
                </section>

                <footer className="flex items-center justify-between gap-4 border-t border-[#eef3f8] pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.88rem] font-medium text-[#2f8a63]">Documents ready</span>
                    {!item.buyerId ? (
                      <span className="inline-flex items-center rounded-full border border-[#f3d7a8] bg-[#fff8ed] px-3 py-1 text-[0.74rem] font-semibold text-[#9a5b0f]">
                        Buyer record pending
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {!item.buyerId ? (
                      <OpenOnboardingButton
                        transactionId={item.transactionId}
                        purchaserType={item.purchaserType}
                        label="Onboarding Link"
                        variant="secondary"
                        className="min-h-[38px] px-3 py-2 text-[0.82rem]"
                      />
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[0.95rem] font-semibold text-[#2563eb] transition duration-150 ease-out group-hover:gap-1.5">
                      Open Unit <ArrowRight size={16} />
                    </span>
                  </div>
                </footer>
              </div>
            </article>
          ))}
          {!activeTransactionCards.length ? (
            <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-sm text-[#6b7d93]">
              {emptyText}
            </p>
          ) : null}
        </div>
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
                <span className={DASHBOARD_CHIP_CLASS}>Tracked {rows.length}</span>
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
                onClick={() => navigate(sharedActivityViewPath)}
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
                        navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                        event.preventDefault()
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

  const dashboardActions = [
    ...(isAgentRole
      ? [
          {
            id: 'new-transaction',
            label: 'New transaction',
            variant: 'ghost',
            onClick: () => navigate('/new-transaction'),
          },
          {
            id: 'my-transactions',
            label: 'Open transactions',
            variant: 'ghost',
            onClick: () => navigate('/units'),
          },
          {
            id: 'documents',
            label: 'Open documents',
            variant: 'ghost',
            onClick: () => navigate('/documents'),
          },
        ]
      : []),
    ...(isBondRole
      ? [
          {
            id: 'applications',
            label: 'Open applications',
            variant: 'ghost',
            onClick: () => navigate('/applications'),
          },
          {
            id: 'documents',
            label: 'Open documents',
            variant: 'ghost',
            onClick: () => navigate('/documents'),
          },
        ]
      : []),
    ...(isAttorneyRole
      ? [
          {
            id: 'ready-lodgement',
            label: 'View Ready for Lodgement',
            variant: 'primary',
            onClick: () => navigateToAttorneyTransfers({ stage: 'ready_for_lodgement' }),
          },
          {
            id: 'transfers',
            label: 'Open transactions',
            variant: 'ghost',
            onClick: () => navigate('/transactions'),
          },
          {
            id: 'blocked-matters',
            label: 'View Blocked Matters',
            variant: 'ghost',
            onClick: () => navigateToAttorneyTransfers({ missingDocs: 'missing' }),
          },
          {
            id: 'upload-document',
            label: 'Upload document',
            variant: 'ghost',
            onClick: () => navigate('/documents'),
          },
        ]
      : []),
  ]

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

          {!isAttorneyRole && !isBondRole && isRoleScopedDashboard ? (
            <section className={`mt-10 ${DASHBOARD_PANEL_CLASS}`}>
              <div className="mb-6">
                <PageActionBar actions={dashboardActions} />
              </div>
              <div>
                <SummaryCards items={topSummaryItems} />
              </div>
            </section>
          ) : null}

          {isAgentRole ? (
            <>
              {renderSharedTransactionSection()}

              <BondCommissionEarningsPanel />

              <section className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="grid gap-8">
                  <article className={DASHBOARD_SUBPANEL_CLASS}>
                    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">My Deal Pipeline</h3>
                        <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Stage distribution across your assigned transactions.</p>
                      </div>
                      <span className={DASHBOARD_CHIP_CLASS}>
                        <TrendingUp size={12} />
                        {rows.length} tracked deals
                      </span>
                    </div>

                    <div className="flex flex-col divide-y divide-[#edf2f7]">
                      {agentPipeline.map((item) => (
                        <div key={item.key} className="grid gap-3 py-5 md:grid-cols-[140px_minmax(0,1fr)_120px] md:items-center">
                          <div className="text-[1rem] font-medium tracking-[-0.02em] text-[#23384d]">{item.label}</div>
                          <div className="h-5 rounded-full bg-[#edf3f8]" aria-hidden>
                            <span className="block h-full rounded-full bg-[#5c82a3]" style={{ width: `${item.width}%` }} />
                          </div>
                          <div className="flex items-baseline justify-between gap-3 md:flex-col md:items-end">
                            <strong className="text-[1.1rem] font-semibold text-[#142132]">{item.count}</strong>
                            <em className="text-[0.84rem] not-italic font-medium text-[#6b7d93]">{formatPercent(item.share)}</em>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={DASHBOARD_SUBPANEL_CLASS}>
                    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Deals Requiring Attention</h3>
                        <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Items with missing docs, stale updates, or pending actions.</p>
                      </div>
                      <span className={DASHBOARD_CHIP_CLASS}>{agentAttention.length} flagged</span>
                    </div>

                    {agentAttention.length ? (
                      <ul className="flex flex-col gap-3">
                        {agentAttention.slice(0, 8).map((item) => (
                          <li
                            key={`${item.transactionId || item.unitId}-${item.stageLabel}`}
                            className="flex items-start justify-between gap-4 rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] px-4 py-4 transition duration-150 ease-out hover:border-[#d1dbe8] hover:bg-white"
                            onClick={() => {
                              if (item.unitId) {
                                navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                              }
                            }}
                            onKeyDown={(event) => {
                              if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                                event.preventDefault()
                                navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                              }
                            }}
                            role={item.unitId ? 'button' : undefined}
                            tabIndex={item.unitId ? 0 : -1}
                          >
                            <div className="min-w-0">
                              <strong className="block text-[0.96rem] font-semibold tracking-[-0.02em] text-[#142132]">
                                {item.developmentName} • Unit {item.unitNumber}
                              </strong>
                              <p className="mt-1 text-[0.88rem] text-[#6b7d93]">{item.buyerName}</p>
                            </div>
                            <div className="text-right">
                              <span className={DASHBOARD_CHIP_CLASS}>{item.stageLabel}</span>
                              <small className="mt-2 block text-[0.78rem] leading-5 text-[#7b8ca2]">
                                {item.readinessLabel} • {item.missingDocuments} missing docs • {item.daysSinceUpdate}d since update
                              </small>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                        No immediate deal blockers are flagged.
                      </p>
                    )}
                  </article>
                </div>

                <div className="grid gap-8">
                  <article className={DASHBOARD_SUBPANEL_CLASS}>
                    <div className="mb-6 min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Recent Activity</h3>
                      <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Latest movement across your active deals.</p>
                    </div>

                    {agentRecentActivity.length ? (
                      <ul className="flex flex-col gap-3">
                        {agentRecentActivity.map((item) => (
                          <li
                            key={`${item.transactionId || item.unitId}-activity`}
                            className="flex items-start justify-between gap-4 rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] px-4 py-4 transition duration-150 ease-out hover:border-[#d1dbe8] hover:bg-white"
                            onClick={() => {
                              if (item.unitId) {
                                navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                              }
                            }}
                            role={item.unitId ? 'button' : undefined}
                            tabIndex={item.unitId ? 0 : -1}
                          >
                            <div className="min-w-0">
                              <strong className="block text-[0.96rem] font-semibold tracking-[-0.02em] text-[#142132]">
                                {item.developmentName} • Unit {item.unitNumber}
                              </strong>
                              <p className="mt-1 text-[0.88rem] text-[#6b7d93]">{item.buyerName}</p>
                            </div>
                            <div className="text-right">
                              <span className={DASHBOARD_CHIP_CLASS}>{item.stageLabel}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                        No recent activity for your transactions yet.
                      </p>
                    )}
                  </article>
                </div>
              </section>

              <section className={`mt-10 ${DASHBOARD_PANEL_CLASS}`}>
                {renderActiveTransactionsBlock({
                  title: 'My Active Transactions',
                  description: 'All transactions you are currently working on.',
                  emptyText: 'No active transactions are assigned to you yet.',
                  withDivider: false,
                  variant: 'showcase',
                })}
              </section>
            </>
          ) : isAttorneyRole ? (
            <ConveyancerDashboardPage rows={rows} />
          ) : isBondRole ? (
            <>
              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-2.5 xl:grid-cols-5">
                    {[
                      { label: 'Active Applications', value: bondSummary.active, copy: 'Live bond matters in your current queue.' },
                      { label: 'Docs Pending', value: bondSummary.docsPending, copy: 'Applications still waiting on client packs.' },
                      { label: 'Approval Rate', value: formatPercent(bondInsights.approvalRate), copy: 'Approvals received against tracked applications.' },
                      { label: 'Avg Bond Grant', value: currency.format(bondInsights.averageGrantValue || 0), copy: 'Average approved bond size across granted matters.' },
                      { label: 'Avg Days in Finance', value: `${Math.round(bondInsights.averageDaysInFinance || 0)}d`, copy: 'Average time since the last finance movement.' },
                    ].map((item, index) => (
                      <article
                        key={item.label}
                        className={`h-full rounded-[20px] border p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] ${
                          index === 2
                            ? 'border-[#d8ece0] bg-[linear-gradient(180deg,#ffffff_0%,#f3fbf6_100%)]'
                            : index === 3
                              ? 'border-[#d9e7f7] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9fe_100%)]'
                              : 'border-[#dde4ee] bg-white'
                        }`}
                      >
                        <span className="block text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#7f92a7]">{item.label}</span>
                        <strong className="mt-3 block text-[2rem] font-semibold leading-none tracking-[-0.05em] text-[#142132]">{item.value}</strong>
                        <p className="mt-3 text-[0.9rem] leading-6 text-[#6b7d93]">{item.copy}</p>
                      </article>
                    ))}
                  </div>
                </div>
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

              <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <article className={DASHBOARD_SUBPANEL_CLASS}>
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Bank Comparison</h3>
                      <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Live spread of applications by lender, with approval yield and average quoted rate where it has been captured.</p>
                    </div>
                    <span className={DASHBOARD_CHIP_CLASS}>
                      <Building2 size={12} />
                      {bondInsights.bankComparison.length} lenders
                    </span>
                  </div>

                  <div className="flex flex-col divide-y divide-[#edf2f7]">
                    {bondInsights.bankComparison.map((item) => (
                      <div key={item.bank} className="grid gap-3 py-5 md:grid-cols-[minmax(0,170px)_minmax(0,1fr)_150px] md:items-center">
                        <div className="min-w-0">
                          <div className="text-[1rem] font-medium tracking-[-0.02em] text-[#23384d]">{item.bank}</div>
                          <small className="mt-1 block text-[0.8rem] text-[#7b8ca2]">{item.count} applications • {formatPercent(item.approvalRate)} approved</small>
                        </div>
                        <div className="h-3 rounded-full bg-[#e7eef6]" aria-hidden>
                          <span className="block h-full rounded-full bg-[#5c82a3]" style={{ width: `${item.width}%` }} />
                        </div>
                        <div className="text-right">
                          <strong className="text-[0.98rem] font-semibold text-[#142132]">{currency.format(item.grantedValue || 0)}</strong>
                          <small className="mt-1 block text-[0.78rem] text-[#7b8ca2]">{formatRateLabel(item.averageRate)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={DASHBOARD_SUBPANEL_CLASS}>
                  <div className="mb-4 min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Rate & Handoff Snapshot</h3>
                    <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Quick signal on pricing capture and what is ready to move into legal transfer.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] px-4 py-4">
                      <span className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Average Quoted Rate</span>
                      <strong className="mt-3 block text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatRateLabel(bondInsights.averageQuotedRate)}</strong>
                      <small className="mt-2 block text-[0.82rem] leading-6 text-[#6b7d93]">{bondInsights.quotedRateCount} applications have a captured lender rate.</small>
                    </article>
                    <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] px-4 py-4">
                      <span className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Lowest Logged Rate</span>
                      <strong className="mt-3 block text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{formatRateLabel(bondInsights.lowestQuotedRate)}</strong>
                      <small className="mt-2 block text-[0.82rem] leading-6 text-[#6b7d93]">Best captured lender pricing across the current application book.</small>
                    </article>
                    <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] px-4 py-4">
                      <span className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Ready for Attorneys</span>
                      <strong className="mt-3 block text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{bondReadyForAttorneys.length}</strong>
                      <small className="mt-2 block text-[0.82rem] leading-6 text-[#6b7d93]">Approved matters still waiting for legal handoff.</small>
                    </article>
                    <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] px-4 py-4">
                      <span className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Handed to Attorneys</span>
                      <strong className="mt-3 block text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{bondHandedOffToAttorneys}</strong>
                      <small className="mt-2 block text-[0.82rem] leading-6 text-[#6b7d93]">Finance-approved matters already passed into transfer.</small>
                    </article>
                  </div>
                </article>
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

              <section className="grid gap-6 lg:grid-cols-3">
                {[
                  {
                    title: 'Marketing Sources',
                    description: 'Where current transactions are coming from.',
                    items: buyerIntelligence.sources,
                  },
                  {
                    title: 'Buyer Age Group',
                    description: 'Demographic split (unknown where data not captured).',
                    items: buyerIntelligence.ageGroups,
                  },
                  {
                    title: 'Buyer Gender',
                    description: 'Portfolio-level gender distribution.',
                    items: buyerIntelligence.genders,
                  },
                ].map((group) => (
                  <article key={group.title} className="rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="mb-5">
                      <h3 className="text-[1.02rem] font-semibold tracking-[-0.025em] text-[#142132]">{group.title}</h3>
                      <p className="mt-2 text-[0.92rem] leading-6 text-[#6b7d93]">{group.description}</p>
                    </div>
                    <ul className="grid gap-3">
                      {group.items.map((item) => (
                        <li key={item.label} className="flex items-center justify-between gap-4 rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-3">
                          <span className="text-[0.95rem] text-[#3b4f65]">{item.label}</span>
                          <strong className="text-[1rem] font-semibold text-[#142132]">{item.value}</strong>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </section>
            </section>
          ) : null}

        </>
      ) : null}
    </section>
  )
}

export default Dashboard
