import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AddUnitModal from '../components/AddUnitModal'
import AgentTransactionsTable from '../components/AgentTransactionsTable'
import AttorneyTransfersTable from '../components/AttorneyTransfersTable'
import BondApplicationsTable from '../components/BondApplicationsTable'
import LoadingSkeleton from '../components/LoadingSkeleton'
import OpenOnboardingButton from '../components/OpenOnboardingButton'
import PageActionBar from '../components/PageActionBar'
import UnitCardsView from '../components/UnitCardsView'
import UnitsTable from '../components/UnitsTable'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Field from '../components/ui/Field'
import { ViewToggle } from '../components/ui/FilterBar'
import Drawer from '../components/ui/Drawer'
import SearchInput from '../components/ui/SearchInput'
import SectionHeader from '../components/ui/SectionHeader'
import { AGENT_READINESS_OPTIONS, getAgentReadinessState } from '../core/transactions/agentSelectors'
import {
  ATTORNEY_QUEUE_FILTERS,
  getAttorneyOperationalState,
  getAttorneyQueueFilterKey,
  getAttorneyTransferStage,
  stageLabelFromAttorneyKey,
} from '../core/transactions/attorneySelectors'
import { buildAgentDemoRows, buildAttorneyDemoRows, buildBondDemoRows } from '../core/transactions/attorneyMockData'
import { getBondApplicationStage, BOND_APPLICATION_STAGES } from '../core/transactions/bondSelectors'
import { financeTypeMatchesFilter, normalizeFinanceType } from '../core/transactions/financeType'
import { SUBPROCESS_TYPES } from '../core/transactions/roleConfig'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  deleteTransactionEverywhere,
  fetchDevelopmentOptions,
  fetchTransactionsByParticipant,
  fetchUnitsData,
  saveDeveloperTransactionWorkspace,
} from '../lib/api'
import { PURCHASER_ENTITY_OPTIONS } from '../lib/purchaserPersonas'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS, STAGES, getMainStageFromDetailedStage } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const ATTORNEY_SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'development', label: 'Development' },
  { value: 'agent', label: 'Agent' },
  { value: 'private_seller', label: 'Private Seller' },
  { value: 'other', label: 'Other' },
]

const ATTORNEY_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'blocked', label: 'Blocked / On Hold' },
  { value: 'stale', label: 'No Activity / Aged' },
  { value: 'healthy', label: 'Ready / Moving' },
]

const ATTORNEY_TRANSACTION_TYPE_OPTIONS = [
  { value: 'all', label: 'All Transactions' },
  { value: 'development', label: 'Development Transactions' },
  { value: 'private', label: 'Private Transactions' },
]

const BULK_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'registered', label: 'Completed / Registered' },
]

const BULK_PROGRESS_STAGE_OPTIONS = MAIN_PROCESS_STAGES.filter((stage) => !['AVAIL', 'REG'].includes(stage)).map((stage) => ({
  value: stage,
  label: MAIN_STAGE_LABELS[stage] || stage,
}))

const BULK_SUBPROCESS_OPTIONS = SUBPROCESS_TYPES.map((type) => ({
  value: type,
  label: type === 'finance' ? 'Finance Workflow' : 'Attorney Workflow',
}))

const QUICK_EDIT_FINANCE_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'combination', label: 'Combination' },
]

const STALLED_DAYS_THRESHOLD = 10

const WORKSPACE_SORT_OPTIONS = [
  { value: 'development', label: 'Development' },
  { value: 'progress', label: 'Progress %' },
  { value: 'stage', label: 'Stage' },
  { value: 'finance', label: 'Finance Type' },
]

const WORKSPACE_STAGE_RANK = {
  reservation: 0,
  bond: 1,
  transfer: 2,
  registration: 3,
}

const MAIN_STAGE_PROGRESS = {
  AVAIL: 0,
  DEP: 20,
  OTP: 35,
  FIN: 58,
  ATTY: 76,
  XFER: 90,
  REG: 100,
}

const FINANCE_SORT_ORDER = {
  cash: 0,
  bond: 1,
  hybrid: 2,
  unknown: 3,
}

function getDaysSince(value) {
  const timestamp = new Date(value || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.POSITIVE_INFINITY
  const deltaMs = Date.now() - timestamp
  return Math.max(0, Math.floor(deltaMs / (1000 * 60 * 60 * 24)))
}

function resolveMainStage(row) {
  const rawMainStage = String(row?.mainStage || row?.transaction?.current_main_stage || '')
    .trim()
    .toUpperCase()

  if (MAIN_PROCESS_STAGES.includes(rawMainStage)) {
    return rawMainStage
  }

  return getMainStageFromDetailedStage(row?.stage || '')
}

function getProgressPercent(row) {
  const mainStage = resolveMainStage(row)
  const fallback = mainStage === 'REG' ? 100 : mainStage === 'AVAIL' ? 0 : 10
  return MAIN_STAGE_PROGRESS[mainStage] ?? fallback
}

function getProgressTone(progressPercent) {
  if (progressPercent < 30) {
    return 'risk'
  }
  if (progressPercent < 80) {
    return 'watch'
  }
  return 'healthy'
}

function getStagePresentation(row) {
  const mainStage = resolveMainStage(row)

  if (mainStage === 'REG') {
    return {
      key: 'registration',
      label: 'Registration',
      chipClassName: 'border border-[#c7e7d4] bg-[#eefbf3] text-[#17663f]',
    }
  }

  if (mainStage === 'FIN') {
    return {
      key: 'bond',
      label: 'Bond',
      chipClassName: 'border border-[#c5d9ff] bg-[#edf4ff] text-[#1f4ea8]',
    }
  }

  if (mainStage === 'ATTY' || mainStage === 'XFER') {
    return {
      key: 'transfer',
      label: 'Transfer',
      chipClassName: 'border border-[#d7ccff] bg-[#f3efff] text-[#5a3bb0]',
    }
  }

  return {
    key: 'reservation',
    label: 'Reservation',
    chipClassName: 'border border-[#dde3eb] bg-[#f6f8fb] text-[#5b6777]',
  }
}

function getFinancePresentation(row) {
  const normalized = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
  const purchaseAmount = Number((row?.transaction?.purchase_price ?? row?.transaction?.sales_price ?? row?.unit?.price) || 0)
  const bondAmount = Number(row?.transaction?.bond_amount || 0)
  const cashAmount = Number(row?.transaction?.cash_amount || 0)

  if (normalized === 'bond') {
    return {
      key: 'bond',
      label: 'Bond',
      detail: '',
      chipClassName: 'border border-[#c5d9ff] bg-[#edf4ff] text-[#1f4ea8]',
    }
  }

  if (normalized === 'combination') {
    let detail = ''

    if (purchaseAmount > 0 && (bondAmount > 0 || cashAmount > 0)) {
      const bondPercent = Math.round((bondAmount / purchaseAmount) * 100)
      const cashPercent = Math.round((cashAmount / purchaseAmount) * 100)
      if (bondPercent > 0 || cashPercent > 0) {
        detail = `Bond ${Math.max(0, bondPercent)}% / Cash ${Math.max(0, cashPercent)}%`
      }
    }

    return {
      key: 'hybrid',
      label: 'Hybrid',
      detail,
      chipClassName: 'border border-[#d8d9e8] bg-[#f6f7fc] text-[#4f5d85]',
    }
  }

  if (normalized === 'cash') {
    return {
      key: 'cash',
      label: 'Cash',
      detail: '',
      chipClassName: 'border border-[#d8e7df] bg-[#f1faf6] text-[#1f7047]',
    }
  }

  return {
    key: 'unknown',
    label: 'Unknown',
    detail: '',
    chipClassName: 'border border-[#dde3eb] bg-[#f6f8fb] text-[#5b6777]',
  }
}

function enrichWorkspaceRow(row) {
  const progressPercent = getProgressPercent(row)
  const daysSinceUpdate = getDaysSince(row?.transaction?.updated_at || row?.transaction?.created_at)
  const stageMeta = getStagePresentation(row)
  const financeMeta = getFinancePresentation(row)

  return {
    ...row,
    workspace: {
      progressPercent,
      progressTone: getProgressTone(progressPercent),
      stageMeta,
      financeMeta,
      daysSinceUpdate,
      atRisk: progressPercent <= 30 || daysSinceUpdate >= STALLED_DAYS_THRESHOLD,
      stalled: daysSinceUpdate >= STALLED_DAYS_THRESHOLD,
      closingSoon: progressPercent >= 80,
    },
  }
}

function sortWorkspaceRows(rows, { sortBy = 'development', sortDirection = 'asc' } = {}) {
  const direction = sortDirection === 'desc' ? -1 : 1
  const compareText = (left, right) => left.localeCompare(right, 'en-ZA', { sensitivity: 'base' })

  return [...rows].sort((left, right) => {
    if (sortBy === 'progress') {
      return (left?.workspace?.progressPercent - right?.workspace?.progressPercent) * direction
    }

    if (sortBy === 'stage') {
      const leftRank = WORKSPACE_STAGE_RANK[left?.workspace?.stageMeta?.key] ?? 99
      const rightRank = WORKSPACE_STAGE_RANK[right?.workspace?.stageMeta?.key] ?? 99
      if (leftRank !== rightRank) {
        return (leftRank - rightRank) * direction
      }
    }

    if (sortBy === 'finance') {
      const leftRank = FINANCE_SORT_ORDER[left?.workspace?.financeMeta?.key] ?? 99
      const rightRank = FINANCE_SORT_ORDER[right?.workspace?.financeMeta?.key] ?? 99
      if (leftRank !== rightRank) {
        return (leftRank - rightRank) * direction
      }
    }

    const byDevelopment = compareText(String(left?.development?.name || ''), String(right?.development?.name || '')) * direction
    if (byDevelopment !== 0) {
      return byDevelopment
    }

    return compareText(String(left?.unit?.unit_number || ''), String(right?.unit?.unit_number || '')) * direction
  })
}

function inferQuickEditMode(row) {
  const normalizedStage = String(row?.stage || '')
    .trim()
    .toLowerCase()

  if (normalizedStage === 'registered') {
    return 'registered'
  }

  if (normalizedStage && normalizedStage !== 'available') {
    return 'in_progress'
  }

  return 'available'
}

function inferQuickEditSubprocess(row) {
  const signal = `${row?.transaction?.current_sub_stage_summary || ''} ${row?.transaction?.next_action || ''}`.toLowerCase()
  if (signal.includes('attorney') || signal.includes('transfer') || signal.includes('convey')) {
    return 'attorney'
  }
  return 'finance'
}

function buildQuickEditForm(row) {
  return {
    buyerName: row?.buyer?.name || '',
    buyerEmail: row?.buyer?.email || '',
    buyerPhone: row?.buyer?.phone || '',
    mode: inferQuickEditMode(row),
    mainStage: row?.mainStage || row?.transaction?.current_main_stage || 'FIN',
    subprocessType: inferQuickEditSubprocess(row),
    progressNote: row?.transaction?.next_action || '',
    financeType: row?.transaction?.finance_type || 'cash',
    purchaserType: row?.transaction?.purchaser_type || 'individual',
    financeManagedBy: row?.transaction?.finance_managed_by || 'bond_originator',
    listPrice: row?.unit?.list_price ?? row?.unit?.price ?? '',
    salesPrice: row?.transaction?.sales_price ?? '',
  }
}

function formatCurrency(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return 'R0'
  return `R ${Math.round(numeric).toLocaleString('en-ZA')}`
}

function dedupeRowsByTransaction(rows = []) {
  const byIdentity = new Map()

  for (const row of rows || []) {
    const identity = row?.transaction?.id || row?.unit?.id
    if (!identity) {
      continue
    }

    const existing = byIdentity.get(identity)
    if (!existing) {
      byIdentity.set(identity, row)
      continue
    }

    const existingUpdatedAt = new Date(existing?.transaction?.updated_at || existing?.transaction?.created_at || 0).getTime()
    const candidateUpdatedAt = new Date(row?.transaction?.updated_at || row?.transaction?.created_at || 0).getTime()
    if (candidateUpdatedAt >= existingUpdatedAt) {
      byIdentity.set(identity, row)
    }
  }

  return [...byIdentity.values()]
}

function isAttorneyPrivateMatter(row) {
  const explicit = String(row?.transaction?.transaction_type || '').trim().toLowerCase()
  return explicit === 'private' || (!row?.development?.id && !row?.unit?.id)
}

function getAttorneyMatterTitle(row) {
  if (isAttorneyPrivateMatter(row)) {
    return row?.transaction?.property_address_line_1 || row?.transaction?.property_description || 'Private Property Matter'
  }

  return `${row?.development?.name || 'Development'}${row?.unit?.unit_number ? ` | Unit ${row.unit.unit_number}` : ''}`
}

function classifyAttorneySource(row) {
  const assignedAgent = String(row?.transaction?.assigned_agent || '').trim()
  const rawSource = String(row?.transaction?.marketing_source || row?.transaction?.lead_source || '')
    .trim()
    .toLowerCase()

  if (getAttorneyTransactionType(row) === 'private') {
    return 'private_seller'
  }

  if (assignedAgent || /(agent|agency|broker)/i.test(rawSource)) {
    return 'agent'
  }

  if (/(private seller|private sale|private)/i.test(rawSource)) {
    return 'private_seller'
  }

  if (row?.development?.id || row?.unit?.development_id) {
    return 'development'
  }

  return rawSource ? 'other' : 'other'
}

function getAttorneyAgentLabel(row) {
  return String(row?.transaction?.assigned_agent || '').trim() || 'Unassigned'
}

function getAttorneyTransactionType(row) {
  const explicit = String(row?.transaction?.transaction_type || '').trim().toLowerCase()
  if (explicit === 'private' || explicit === 'development') {
    return explicit
  }
  return row?.development?.id || row?.unit?.development_id ? 'development' : 'private'
}

function openBondApplication(navigate, row) {
  const unitId = row?.unit?.id || null
  const unitNumber = row?.unit?.unit_number || '-'
  const transactionId = row?.transaction?.id || null

  if (unitId) {
    navigate(`/units/${unitId}`, {
      state: { headerTitle: `Unit ${unitNumber}` },
    })
    return
  }

  if (transactionId) {
    navigate(`/transactions/${transactionId}`, {
      state: { headerTitle: row?.transaction?.transaction_reference || 'Application' },
    })
    return
  }

  navigate('/applications')
}

function Units() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace, role, profile } = useWorkspace()

  const [rows, setRows] = useState([])
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [filters, setFilters] = useState({
    developmentId: 'all',
    transactionType: 'all',
    source: 'all',
    agent: 'all',
    stage: 'all',
    financeType: 'all',
    readiness: 'all',
    missingDocs: 'all',
    risk: 'all',
    search: '',
    sortBy: 'development',
    sortDirection: 'asc',
  })
  const [loading, setLoading] = useState(true)
  const [deletingTransactionId, setDeletingTransactionId] = useState(null)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [quickEditSaving, setQuickEditSaving] = useState(false)
  const [quickEditForm, setQuickEditForm] = useState(() => buildQuickEditForm({}))
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [bulkDeleteSaving, setBulkDeleteSaving] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null)
  const [pendingDeleteCloseEditor, setPendingDeleteCloseEditor] = useState(false)
  const [unitsViewMode, setUnitsViewMode] = useState(role === 'client' ? 'cards' : 'list')
  const isAgentRole = role === 'agent'
  const isBondRole = role === 'bond_originator'
  const isAttorneyRole = role === 'attorney'
  const isClientRole = role === 'client'
  const isDeveloperWorkspaceRole = role === 'developer' || role === 'internal_admin'
  const canToggleUnitsView = !isBondRole && !isAttorneyRole && !isAgentRole
  const canDeleteTransactions = role === 'developer' || role === 'internal_admin' || role === 'agent'
  const isDeveloperRole = role === 'developer'
  const participantScopedRole = isAgentRole ? 'agent' : isBondRole ? 'bond_originator' : isAttorneyRole ? 'attorney' : null
  const stageOptions = useMemo(
    () =>
      isBondRole
        ? BOND_APPLICATION_STAGES.map((item) => ({ value: item.key, label: item.label }))
        : isAttorneyRole
          ? ATTORNEY_QUEUE_FILTERS.filter((item) => item.key !== 'all').map((item) => ({ value: item.key, label: item.label }))
          : STAGES.map((stage) => ({ value: stage, label: stage })),
    [isAttorneyRole, isBondRole],
  )
  const attorneyAgentOptions = useMemo(() => {
    if (!isAttorneyRole) return []
    return Array.from(new Set(rows.map((row) => getAttorneyAgentLabel(row)).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    )
  }, [isAttorneyRole, rows])
  const unitsTitle = (
    <span className="flex flex-wrap items-center gap-3">
      <span>
        {isClientRole
          ? 'My Transactions'
          : isAgentRole
            ? 'My Transactions'
            : isDeveloperWorkspaceRole
              ? 'Transactions Across Developments'
              : 'Units Across Developments (Operations)'}
      </span>
      <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
        {rows.length} {isDeveloperWorkspaceRole ? 'transactions' : 'units'}
      </span>
    </span>
  )
  const viewToggleControl = canToggleUnitsView ? (
    <ViewToggle
      items={[
        { key: 'cards', label: 'Card View' },
        { key: 'list', label: 'List View' },
      ]}
      value={unitsViewMode}
      onChange={setUnitsViewMode}
      className="shrink-0"
    />
  ) : null
  const selectedTransactionRows = useMemo(
    () => rows.filter((row) => row?.unit?.id && selectedUnitIds.includes(row.unit.id) && Boolean(row?.transaction?.id)),
    [rows, selectedUnitIds],
  )
  const pendingDeleteTransactionId = pendingDeleteRow?.transaction?.id || null
  const pendingDeleteUnitNumber = pendingDeleteRow?.unit?.unit_number || 'this unit'
  const isPendingDeleteSaving = Boolean(pendingDeleteTransactionId && deletingTransactionId === pendingDeleteTransactionId)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.toString()) {
      return
    }

    const allowedStageValues = new Set(['all', ...stageOptions.map((item) => item.value)])
    const allowedFinanceValues = new Set(['all', 'cash', 'bond', 'combination', 'hybrid', 'unknown'])
    const allowedMissingDocValues = new Set(['all', 'missing', 'complete'])
    const allowedReadinessValues = new Set(['all', ...AGENT_READINESS_OPTIONS.map((item) => item.key)])
    const allowedRiskValues = new Set(['all', 'stale', 'blocked', 'healthy'])
    const allowedSourceValues = new Set(ATTORNEY_SOURCE_OPTIONS.map((item) => item.value))
    const allowedSortByValues = new Set(WORKSPACE_SORT_OPTIONS.map((item) => item.value))
    const allowedSortDirectionValues = new Set(['asc', 'desc'])
    const nextValues = {}

    const stage = params.get('stage')
    if (stage && allowedStageValues.has(stage)) {
      nextValues.stage = stage
    }

    const financeType = params.get('financeType')
    if (financeType && allowedFinanceValues.has(financeType)) {
      nextValues.financeType = financeType
    }

    const missingDocs = params.get('missingDocs')
    if (missingDocs && allowedMissingDocValues.has(missingDocs)) {
      nextValues.missingDocs = missingDocs
    }

    const readiness = params.get('readiness')
    if (readiness && allowedReadinessValues.has(readiness)) {
      nextValues.readiness = readiness
    }

    const risk = params.get('risk')
    if (risk && allowedRiskValues.has(risk)) {
      nextValues.risk = risk
    }

    const source = params.get('source')
    if (source && allowedSourceValues.has(source)) {
      nextValues.source = source
    }

    const transactionType = params.get('transactionType')
    if (transactionType && ['all', 'development', 'private'].includes(transactionType)) {
      nextValues.transactionType = transactionType
    }

    const agent = params.get('agent')
    if (agent !== null) {
      nextValues.agent = agent
    }

    const search = params.get('search')
    if (search !== null) {
      nextValues.search = search
    }

    const developmentId = params.get('developmentId')
    if (developmentId) {
      nextValues.developmentId = developmentId
    }

    const sortBy = params.get('sortBy')
    if (sortBy && allowedSortByValues.has(sortBy)) {
      nextValues.sortBy = sortBy
    }

    const sortDirection = params.get('sortDirection')
    if (sortDirection && allowedSortDirectionValues.has(sortDirection)) {
      nextValues.sortDirection = sortDirection
    }

    if (!Object.keys(nextValues).length) {
      return
    }

    setFilters((previous) => {
      let changed = false
      const updated = { ...previous }
      for (const [key, value] of Object.entries(nextValues)) {
        if (updated[key] !== value) {
          updated[key] = value
          changed = true
        }
      }
      return changed ? updated : previous
    })
  }, [location.search, stageOptions])

  useEffect(() => {
    if (workspace.id !== 'all') {
      setFilters((previous) => ({ ...previous, developmentId: workspace.id }))
    }
  }, [workspace.id])

  useEffect(() => {
    setSelectedUnitIds((previous) => previous.filter((unitId) => rows.some((row) => row?.unit?.id === unitId)))
  }, [rows])

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      let unitsData = []
      let options = []

      if (participantScopedRole && profile?.id) {
        const [agentTransactions, allOptions] = await Promise.all([
          fetchTransactionsByParticipant({ userId: profile.id, roleType: participantScopedRole }),
          fetchDevelopmentOptions(),
        ])
        unitsData = isAttorneyRole
          ? buildAttorneyDemoRows(agentTransactions || [])
          : isAgentRole
            ? buildAgentDemoRows(agentTransactions || [])
            : isBondRole
              ? buildBondDemoRows(agentTransactions || [])
              : agentTransactions
        const allowedDevelopmentIds = new Set(
          (unitsData || []).map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean),
        )
        options = allOptions.filter((item) => allowedDevelopmentIds.has(item.id))
        const existingOptionIds = new Set(options.map((item) => item.id))
        const mockOptions = (unitsData || [])
          .map((row) => row?.development)
          .filter((development) => development?.id && development?.name && !existingOptionIds.has(development.id))
          .map((development) => ({
            id: development.id,
            name: development.name,
            location: development.location || '',
          }))
        options = [...options, ...mockOptions]
      } else {
        ;[unitsData, options] = await Promise.all([
          fetchUnitsData({
            ...filters,
            activeTransactionsOnly: isDeveloperWorkspaceRole,
          }),
          fetchDevelopmentOptions(),
        ])
      }

      const normalizedSearch = String(filters.search || '')
        .trim()
        .toLowerCase()
      const filteredRows = (unitsData || []).filter((row) => {
        const developmentId = row?.development?.id || row?.unit?.development_id || null
        const stageMatch = isBondRole
          ? filters.stage === 'all'
            ? true
            : getBondApplicationStage(row) === filters.stage
          : isAttorneyRole
            ? filters.stage === 'all'
              ? true
              : getAttorneyQueueFilterKey(row) === filters.stage
          : filters.stage === 'all'
            ? true
            : row.stage === filters.stage
        const financeMatch =
          filters.financeType === 'all' ? true : financeTypeMatchesFilter(row.transaction?.finance_type, filters.financeType)
        const readiness = isAgentRole ? getAgentReadinessState(row) : null
        const readinessMatch = isAgentRole ? (filters.readiness === 'all' ? true : readiness?.key === filters.readiness) : true
        const uploadedCount = Number(row?.documentSummary?.uploadedCount || 0)
        const totalRequired = Number(row?.documentSummary?.totalRequired || 0)
        const missingFromSource = Number(row?.documentSummary?.missingCount)
        const missingCount = Number.isFinite(missingFromSource) ? missingFromSource : Math.max(totalRequired - uploadedCount, 0)
        const attorneySource = isAttorneyRole ? classifyAttorneySource(row) : 'all'
        const attorneyAgent = isAttorneyRole ? getAttorneyAgentLabel(row) : 'Unassigned'
        const attorneyTransactionType = isAttorneyRole ? getAttorneyTransactionType(row) : 'development'
        const missingDocsMatch = isAgentRole
          ? filters.missingDocs === 'all'
            ? true
            : filters.missingDocs === 'missing'
              ? missingCount > 0
              : missingCount === 0
          : isAttorneyRole
            ? filters.missingDocs === 'all'
              ? true
              : filters.missingDocs === 'missing'
                ? missingCount > 0
                : missingCount === 0
          : true
        const attorneyOperationalState = isAttorneyRole ? getAttorneyOperationalState(row) : null
        const attorneyReady =
          Boolean(attorneyOperationalState?.documentReadiness?.ready) &&
          Boolean(attorneyOperationalState?.financeStatus?.ready) &&
          Boolean(attorneyOperationalState?.clearanceStatus?.ready) &&
          (attorneyOperationalState?.daysSinceUpdate || 0) < 10
        const attorneyRiskMatch = isAttorneyRole
          ? filters.risk === 'all'
            ? true
            : filters.risk === 'stale'
              ? (attorneyOperationalState?.daysSinceUpdate || 0) >= 10 &&
                attorneyOperationalState?.transferStage !== 'registered'
              : filters.risk === 'healthy'
                ? attorneyReady
                : !attorneyOperationalState?.documentReadiness?.ready ||
                  !attorneyOperationalState?.financeStatus?.ready ||
                  !attorneyOperationalState?.clearanceStatus?.ready ||
                  (attorneyOperationalState?.daysSinceUpdate || 0) >= 10
          : true
        const attorneySourceMatch = isAttorneyRole ? (filters.source === 'all' ? true : attorneySource === filters.source) : true
        const attorneyAgentMatch = isAttorneyRole ? (filters.agent === 'all' ? true : attorneyAgent === filters.agent) : true
        const attorneyTransactionTypeMatch = isAttorneyRole
          ? filters.transactionType === 'all'
            ? true
            : attorneyTransactionType === filters.transactionType
          : true
        const developmentMatch = filters.developmentId === 'all' ? true : developmentId === filters.developmentId

        if (!normalizedSearch) {
          return (
            stageMatch &&
            financeMatch &&
            readinessMatch &&
            missingDocsMatch &&
            attorneyRiskMatch &&
            attorneySourceMatch &&
            attorneyAgentMatch &&
            attorneyTransactionTypeMatch &&
            developmentMatch
          )
        }

        const haystack = [
          row?.unit?.unit_number,
          row?.buyer?.name,
          row?.development?.name,
          row?.transaction?.transaction_reference,
          row?.transaction?.property_address_line_1,
          row?.transaction?.property_address_line_2,
          row?.transaction?.suburb,
          row?.transaction?.city,
          row?.transaction?.province,
          row?.transaction?.property_description,
          row?.stage,
          isBondRole ? getBondApplicationStage(row) : '',
          isAttorneyRole ? getAttorneyTransferStage(row) : '',
          isAttorneyRole ? getAttorneyQueueFilterKey(row) : '',
          isAttorneyRole ? attorneySource : '',
          isAttorneyRole ? attorneyAgent : '',
          isAttorneyRole ? attorneyTransactionType : '',
          isAgentRole ? readiness?.label : '',
          row?.transaction?.next_action,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')

        return (
          stageMatch &&
          financeMatch &&
          readinessMatch &&
          missingDocsMatch &&
          attorneyRiskMatch &&
          attorneySourceMatch &&
          attorneyAgentMatch &&
          attorneyTransactionTypeMatch &&
          developmentMatch &&
          haystack.includes(normalizedSearch)
        )
      })

      const normalizedRows = dedupeRowsByTransaction(filteredRows)
      const activeRows = normalizedRows.filter((row) => Boolean(row?.transaction?.id))

      if (isDeveloperWorkspaceRole) {
        const workspaceRows = activeRows.map((row) => enrichWorkspaceRow(row))

        setRows(
          sortWorkspaceRows(workspaceRows, {
            sortBy: filters.sortBy,
            sortDirection: filters.sortDirection,
          }),
        )
      } else {
        setRows(normalizedRows)
      }
      setDevelopmentOptions(options)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [filters, isAgentRole, isAttorneyRole, isBondRole, isDeveloperWorkspaceRole, participantScopedRole, profile?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    function refreshTransactions() {
      void loadData()
    }

    window.addEventListener('itg:transaction-created', refreshTransactions)
    window.addEventListener('itg:transaction-updated', refreshTransactions)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshTransactions)
      window.removeEventListener('itg:transaction-updated', refreshTransactions)
    }
  }, [loadData])

  async function executeDeleteTransaction(row) {
    const transactionId = row?.transaction?.id
    const unitId = row?.unit?.id

    if (!transactionId || !unitId) {
      return false
    }

    try {
      setError('')
      setDeletingTransactionId(transactionId)
      await deleteTransactionEverywhere({ transactionId, unitId })
      setRows((previous) => previous.filter((item) => item?.transaction?.id !== transactionId))
      setSelectedUnitIds((previous) => previous.filter((selectedId) => selectedId !== unitId))
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
      return true
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete the transaction.')
      return false
    } finally {
      setDeletingTransactionId(null)
    }
  }

  function requestDeleteTransaction(row, { closeEditorAfterDelete = false } = {}) {
    const transactionId = row?.transaction?.id
    const unitId = row?.unit?.id
    if (!transactionId || !unitId) {
      return
    }

    setPendingDeleteCloseEditor(closeEditorAfterDelete)
    setPendingDeleteRow(row)
  }

  function cancelDeleteTransactionRequest() {
    if (isPendingDeleteSaving) {
      return
    }

    setPendingDeleteRow(null)
    setPendingDeleteCloseEditor(false)
  }

  async function confirmDeleteTransactionRequest() {
    if (!pendingDeleteRow) {
      return
    }

    const deleted = await executeDeleteTransaction(pendingDeleteRow)
    if (deleted) {
      if (pendingDeleteCloseEditor) {
        setEditingRow(null)
      }
      setPendingDeleteRow(null)
      setPendingDeleteCloseEditor(false)
    }
  }

  function handleBulkDeleteSelectedTransactions() {
    if (!selectedTransactionRows.length) {
      return
    }

    setBulkDeleteConfirmOpen(true)
  }

  async function confirmBulkDeleteSelectedTransactions() {
    try {
      setError('')
      setBulkDeleteSaving(true)
      for (const row of selectedTransactionRows) {
        // Keep deletes sequential so a failure is surfaced at the exact row.
        // eslint-disable-next-line no-await-in-loop
        const deleted = await executeDeleteTransaction(row)
        if (!deleted) {
          break
        }
      }
      setSelectedUnitIds([])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete one or more selected transactions.')
    } finally {
      setBulkDeleteSaving(false)
      setBulkDeleteConfirmOpen(false)
    }
  }

  function handleToggleRowSelection(unitId, checked) {
    setSelectedUnitIds((previous) => {
      if (checked) {
        return previous.includes(unitId) ? previous : [...previous, unitId]
      }
      return previous.filter((item) => item !== unitId)
    })
  }

  function handleToggleAllSelection(checked) {
    setSelectedUnitIds(checked ? rows.map((row) => row?.unit?.id).filter(Boolean) : [])
  }

  function handleOpenTransactionEditor(row) {
    setEditingRow(row)
    setQuickEditForm(buildQuickEditForm(row))
  }

  function handleWorkspaceSortChange(sortBy, sortDirection) {
    setFilters((previous) => ({
      ...previous,
      sortBy,
      sortDirection,
    }))
  }

  async function handleQuickEditSubmit() {
    if (!editingRow?.unit?.id) {
      setError('Choose a valid unit before updating the transaction.')
      return
    }

    try {
      setError('')
      setQuickEditSaving(true)
      await saveDeveloperTransactionWorkspace({
        unitId: editingRow.unit.id,
        transactionId: editingRow?.transaction?.id || null,
        buyerName: quickEditForm.buyerName,
        buyerEmail: quickEditForm.buyerEmail,
        buyerPhone: quickEditForm.buyerPhone,
        mode: quickEditForm.mode,
        mainStage: quickEditForm.mainStage,
        subprocessType: quickEditForm.subprocessType,
        progressNote: quickEditForm.progressNote,
        financeType: quickEditForm.financeType,
        purchaserType: quickEditForm.purchaserType,
        financeManagedBy: quickEditForm.financeManagedBy,
        listPrice: quickEditForm.listPrice,
        salesPrice: quickEditForm.salesPrice,
      })
      setEditingRow(null)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the transaction update.')
    } finally {
      setQuickEditSaving(false)
    }
  }

  function handleOpenAttorneyMatter(row) {
    const unitId = row?.unit?.id
    const transactionId = row?.transaction?.id

    if (unitId) {
      navigate(`/units/${unitId}`, {
        state: { headerTitle: `Unit ${row?.unit?.unit_number || '-'}` },
      })
      return
    }

    if (transactionId) {
      navigate(`/transactions/${transactionId}`)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {isDeveloperRole || isAttorneyRole || isBondRole ? null : (
        <PageActionBar
          actions={[
            ...(isAgentRole || isAttorneyRole
              ? [
                  {
                    id: 'new-transaction',
                    label: 'New Transaction',
                    variant: 'ghost',
                    onClick: () => navigate('/new-transaction'),
                    disabled: !isSupabaseConfigured,
                  },
                ]
              : []),
            {
              id: 'refresh',
              label: isAttorneyRole || role === 'agent' ? 'Refresh Transactions' : 'Refresh Units',
              variant: 'primary',
              onClick: loadData,
              disabled: loading || !isSupabaseConfigured,
            },
          ]}
        />
      )}

      {!isSupabaseConfigured ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </p>
      ) : null}

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] no-print">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {!isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Development</span>
                <Field
                  as="select"
                  className="py-2.5"
                  value={filters.developmentId}
                  onChange={(event) => setFilters((previous) => ({ ...previous, developmentId: event.target.value }))}
                >
                  <option value="all">All Developments</option>
                  {developmentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Field>
              </label>
            ) : null}

            {isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Type</span>
                <Field
                  as="select"
                  value={filters.transactionType}
                  onChange={(event) => setFilters((previous) => ({ ...previous, transactionType: event.target.value }))}
                >
                  {ATTORNEY_TRANSACTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>
            ) : null}

            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Stage</span>
              <Field as="select" className="py-2.5" value={filters.stage} onChange={(event) => setFilters((previous) => ({ ...previous, stage: event.target.value }))}>
                <option value="all">All Stages</option>
                {stageOptions.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </Field>
            </label>

            {!isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Finance Type</span>
                <Field
                  as="select"
                  className="py-2.5"
                  value={filters.financeType}
                  onChange={(event) => setFilters((previous) => ({ ...previous, financeType: event.target.value }))}
                >
                  <option value="all">All Finance Types</option>
                  <option value="cash">Cash</option>
                  <option value="bond">Bond</option>
                  <option value="combination">Combination</option>
                </Field>
              </label>
            ) : null}

            {isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Source</span>
                <Field as="select" value={filters.source} onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))}>
                  {ATTORNEY_SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>
            ) : null}

            {isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Agent</span>
                <Field as="select" value={filters.agent} onChange={(event) => setFilters((previous) => ({ ...previous, agent: event.target.value }))}>
                  <option value="all">All Agents</option>
                  {attorneyAgentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Field>
              </label>
            ) : null}

            {isAgentRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Readiness</span>
                <Field
                  as="select"
                  value={filters.readiness}
                  onChange={(event) => setFilters((previous) => ({ ...previous, readiness: event.target.value }))}
                >
                  {AGENT_READINESS_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>
            ) : null}

            {isAgentRole || isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Missing Docs</span>
                <Field
                  as="select"
                  value={filters.missingDocs}
                  onChange={(event) => setFilters((previous) => ({ ...previous, missingDocs: event.target.value }))}
                >
                  <option value="all">All</option>
                  <option value="missing">Missing Docs</option>
                  <option value="complete">Docs Complete</option>
                </Field>
              </label>
            ) : null}

            {isAttorneyRole ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Status</span>
                <Field as="select" value={filters.risk} onChange={(event) => setFilters((previous) => ({ ...previous, risk: event.target.value }))}>
                  {ATTORNEY_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>
            ) : null}

            <label className={`flex min-w-0 flex-col gap-2 ${isDeveloperWorkspaceRole ? '' : 'xl:col-span-2'}`}>
              <span className="text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-[#6f8298]">Search</span>
              <SearchInput
                className="min-w-0 w-full h-[40px]"
                value={filters.search}
                onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
                placeholder={
                  isAgentRole
                    ? 'Search buyer, unit, stage…'
                    : isBondRole
                      ? 'Search application…'
                      : isAttorneyRole
                        ? 'Search property, reference, buyer…'
                        : 'Search transactions…'
                }
              />
            </label>
          </div>

          {isDeveloperWorkspaceRole ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="sr-only" htmlFor="workspace-sort-by">
                  Sort transactions by
                </label>
                <Field
                  id="workspace-sort-by"
                  as="select"
                  value={filters.sortBy}
                  onChange={(event) =>
                    handleWorkspaceSortChange(event.target.value, event.target.value === 'progress' ? 'desc' : 'asc')
                  }
                  className="min-w-[220px]"
                >
                  {WORKSPACE_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Sort by {option.label}
                    </option>
                  ))}
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-w-[82px] justify-center"
                  onClick={() =>
                    handleWorkspaceSortChange(filters.sortBy, filters.sortDirection === 'asc' ? 'desc' : 'asc')
                  }
                >
                  {filters.sortDirection === 'asc' ? 'Asc' : 'Desc'}
                </Button>
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
      ) : null}
      {loading ? (
        <LoadingSkeleton lines={8} className="rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]" />
      ) : null}

      {!loading && isSupabaseConfigured ? (
        isBondRole ? (
          <BondApplicationsTable
            rows={rows}
            title="Applications Queue"
            onRowClick={(row) => openBondApplication(navigate, row)}
          />
        ) : isAgentRole ? (
          <AgentTransactionsTable
            rows={rows}
            title="My Transactions"
            onDeleteTransaction={canDeleteTransactions ? requestDeleteTransaction : null}
            deletingTransactionId={deletingTransactionId}
            onRowClick={(unitId, unitNumber) =>
              navigate(`/units/${unitId}`, {
                state: { headerTitle: `Unit ${unitNumber}` },
              })
            }
          />
        ) : isAttorneyRole ? (
          <AttorneyTransfersTable
            rows={rows}
            title="All Matters"
            onRowClick={(row) => handleOpenAttorneyMatter(row)}
          />
        ) : canToggleUnitsView && unitsViewMode === 'cards' ? (
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <SectionHeader
              title={unitsTitle}
              copy="Portfolio operations view across developments with clean single-row transaction visibility."
              actions={
                <div className="units-table-actions flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  {viewToggleControl}
                  {isDeveloperRole ? (
                    <Button
                      variant="primary"
                      className="justify-center sm:min-w-[132px]"
                      onClick={() => setShowCreateModal(true)}
                      disabled={!isSupabaseConfigured}
                    >
                      Add Unit
                    </Button>
                  ) : null}
                </div>
              }
            />
            <div className="mt-6">
              <UnitCardsView
                rows={rows}
                onCardClick={(unitId, unitNumber) =>
                  navigate(`/units/${unitId}`, {
                    state: { headerTitle: `Unit ${unitNumber}` },
                  })
                }
              />
            </div>
          </section>
        ) : (
          <UnitsTable
            rows={rows}
            title={unitsTitle}
            showDevelopment={role !== 'developer' || workspace.id === 'all'}
            onDeleteTransaction={!isDeveloperWorkspaceRole && canDeleteTransactions ? requestDeleteTransaction : null}
            onEditTransaction={!isDeveloperWorkspaceRole && isDeveloperRole ? handleOpenTransactionEditor : null}
            deletingTransactionId={deletingTransactionId}
            selectable={isDeveloperRole && !isDeveloperWorkspaceRole}
            selectedUnitIds={selectedUnitIds}
            onToggleRowSelection={handleToggleRowSelection}
            onToggleAllSelection={handleToggleAllSelection}
            compactOperations={isDeveloperWorkspaceRole}
            sortBy={filters.sortBy}
            sortDirection={filters.sortDirection}
            onSortChange={isDeveloperWorkspaceRole ? handleWorkspaceSortChange : null}
            headerActions={
              <div className="units-table-actions flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                {viewToggleControl}
                {isDeveloperRole && !isDeveloperWorkspaceRole ? (
                  <Button
                    variant="ghost"
                    className="justify-center text-[#b42318] hover:bg-[#fff1f1] sm:min-w-[172px]"
                    onClick={() => void handleBulkDeleteSelectedTransactions()}
                    disabled={!selectedTransactionRows.length || bulkDeleteSaving}
                  >
                    {bulkDeleteSaving ? 'Deleting…' : `Delete Selected (${selectedTransactionRows.length})`}
                  </Button>
                ) : null}
                {isDeveloperRole ? (
                  <Button
                    variant="primary"
                    className="justify-center sm:min-w-[132px]"
                    onClick={() => setShowCreateModal(true)}
                    disabled={!isSupabaseConfigured}
                  >
                    Add Unit
                  </Button>
                ) : null}
              </div>
            }
            onRowClick={(row, unitId, unitNumber) => {
              navigate(`/units/${unitId}`, {
                state: { headerTitle: `Unit ${unitNumber}` },
              })
            }}
          />
        )
      ) : null}

      <AddUnitModal
        open={role === 'developer' && showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          window.dispatchEvent(new Event('itg:developments-changed'))
          void loadData()
        }}
        developmentOptions={developmentOptions}
        initialDevelopmentId={workspace.id === 'all' ? '' : workspace.id}
      />

      <Drawer
        open={isDeveloperRole && Boolean(editingRow)}
        onClose={() => !quickEditSaving && setEditingRow(null)}
        title={editingRow?.transaction?.id ? 'Update Transaction' : 'Start Transaction'}
        subtitle="Capture the buyer and progress of the matter directly from the transactions list."
        widthClassName="max-w-[640px]"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[#6b7d93]">
              {editingRow?.transaction?.id ? 'Existing matter' : 'No active matter yet'}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {editingRow?.transaction?.id ? (
                <Button
                  variant="ghost"
                  className="text-[#b42318] hover:bg-[#fff1f1]"
                  onClick={() => requestDeleteTransaction(editingRow, { closeEditorAfterDelete: true })}
                  disabled={quickEditSaving || deletingTransactionId === editingRow?.transaction?.id}
                >
                  {deletingTransactionId === editingRow?.transaction?.id ? 'Deleting…' : 'Delete Transaction'}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setEditingRow(null)} disabled={quickEditSaving}>
                Cancel
              </Button>
              <Button onClick={handleQuickEditSubmit} disabled={quickEditSaving}>
                {quickEditSaving ? 'Saving...' : editingRow?.transaction?.id ? 'Save Update' : 'Create Matter'}
              </Button>
            </div>
          </div>
        }
      >
        {editingRow ? (
          <div className="flex flex-col gap-6">
            <section className="rounded-[18px] border border-[#e3e9f2] bg-[#f8fafc] px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong className="block text-sm font-semibold text-[#142132]">
                    {editingRow?.development?.name || 'Development'} • Unit {editingRow?.unit?.unit_number || '—'}
                  </strong>
                  <p className="mt-1 text-sm text-[#6b7d93]">
                    {editingRow?.transaction?.id
                      ? 'Update the current buyer, progress, and pricing from this single panel.'
                      : 'Create the matter for an existing unit without leaving the transactions list.'}
                  </p>
                </div>
                {editingRow?.transaction?.id ? (
                  <div className="shrink-0">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() =>
                        navigate(`/units/${editingRow.unit.id}`, {
                          state: { headerTitle: `Unit ${editingRow.unit.unit_number}` },
                        })
                      }
                    >
                      Open Full Workspace
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Buyer Name</span>
                <Field
                  value={quickEditForm.buyerName}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, buyerName: event.target.value }))}
                  placeholder="Buyer / purchaser name"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Buyer Email</span>
                <Field
                  type="email"
                  value={quickEditForm.buyerEmail}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, buyerEmail: event.target.value }))}
                  placeholder="buyer@email.com"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Buyer Phone</span>
                <Field
                  value={quickEditForm.buyerPhone}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, buyerPhone: event.target.value }))}
                  placeholder="+27 ..."
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
                <Field
                  as="select"
                  value={quickEditForm.mode}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, mode: event.target.value }))}
                >
                  {BULK_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Finance Type</span>
                <Field
                  as="select"
                  value={quickEditForm.financeType}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, financeType: event.target.value }))}
                >
                  {QUICK_EDIT_FINANCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Purchaser Type</span>
                <Field
                  as="select"
                  value={quickEditForm.purchaserType}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, purchaserType: event.target.value }))}
                >
                  {PURCHASER_ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Finance Managed By</span>
                <Field
                  as="select"
                  value={quickEditForm.financeManagedBy}
                  onChange={(event) => setQuickEditForm((previous) => ({ ...previous, financeManagedBy: event.target.value }))}
                >
                  <option value="bond_originator">Bond Originator</option>
                  <option value="client">Client</option>
                  <option value="internal">Internal Team</option>
                </Field>
              </label>
            </div>

            {quickEditForm.mode === 'in_progress' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Where We Are</span>
                  <Field
                    as="select"
                    value={quickEditForm.mainStage}
                    onChange={(event) => setQuickEditForm((previous) => ({ ...previous, mainStage: event.target.value }))}
                  >
                    {BULK_PROGRESS_STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Subprocess</span>
                  <Field
                    as="select"
                    value={quickEditForm.subprocessType}
                    onChange={(event) => setQuickEditForm((previous) => ({ ...previous, subprocessType: event.target.value }))}
                  >
                    {BULK_SUBPROCESS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>

                <label className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current Step / Progress Note</span>
                  <Field
                    value={quickEditForm.progressNote}
                    onChange={(event) => setQuickEditForm((previous) => ({ ...previous, progressNote: event.target.value }))}
                    placeholder="Example: Awaiting signed OTP and buyer FICA"
                  />
                </label>
              </div>
            ) : null}

            {quickEditForm.mode === 'registered' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">List Price</span>
                  <Field
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickEditForm.listPrice}
                    onChange={(event) => setQuickEditForm((previous) => ({ ...previous, listPrice: event.target.value }))}
                    placeholder="1250000"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sales Price</span>
                  <Field
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickEditForm.salesPrice}
                    onChange={(event) => setQuickEditForm((previous) => ({ ...previous, salesPrice: event.target.value }))}
                    placeholder="1195000"
                  />
                </label>
              </div>
            ) : null}

            {editingRow?.transaction?.id ? (
              <section className="rounded-[18px] border border-[#e3e9f2] bg-[#f8fafc] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Client Onboarding</strong>
                    <p className="mt-1 text-sm text-[#6b7d93]">Generate or open the onboarding link for this transaction directly from the list view.</p>
                  </div>
                  <OpenOnboardingButton
                    transactionId={editingRow.transaction.id}
                    purchaserType={quickEditForm.purchaserType}
                    label="Open Onboarding Link"
                    variant="secondary"
                  />
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDeleteRow)}
        title="Delete Transaction"
        description={`Are you sure you want to delete this transaction for Unit ${pendingDeleteUnitNumber}? This will remove linked workflow, onboarding, and transaction records, and reset the unit to Available.`}
        confirmLabel="Delete Transaction"
        cancelLabel="Cancel"
        variant="destructive"
        confirming={isPendingDeleteSaving}
        onCancel={cancelDeleteTransactionRequest}
        onConfirm={() => void confirmDeleteTransactionRequest()}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="Delete Selected Transactions"
        description={`Are you sure you want to delete ${selectedTransactionRows.length} selected transaction${selectedTransactionRows.length === 1 ? '' : 's'}? Linked units will be reset to Available.`}
        confirmLabel="Delete Selected"
        cancelLabel="Cancel"
        variant="destructive"
        confirming={bulkDeleteSaving}
        onCancel={() => !bulkDeleteSaving && setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDeleteSelectedTransactions()}
      />
    </section>
  )
}

export default Units
