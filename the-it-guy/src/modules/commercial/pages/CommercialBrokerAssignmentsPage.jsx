import { RefreshCw, UserRoundCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { BranchPicker, BrokerPicker, TeamPicker, branchOptions, brokerOptions, teamOptions } from '../components/CommercialAssignmentPickers'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { assignCommercialRecord, bulkAssignCommercialRecords, clearCommercialAssignment, getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function recordTitle(kind, row = {}) {
  if (kind === 'requirements') return row.requirement_name || 'Requirement'
  if (kind === 'deals') return row.deal_name || 'Deal'
  if (kind === 'vacancies') return row.vacancy_name || 'Vacancy'
  if (kind === 'listings') return row.title || 'Listing'
  if (kind === 'headsOfTerms') return row.premises_description || 'Heads of Terms'
  return row.id || 'Commercial record'
}

function recordMeta(kind, row = {}) {
  if (kind === 'requirements') return `${titleize(row.stage)} · ${formatNumber(row.min_size_m2, 'm²')} - ${formatNumber(row.max_size_m2, 'm²')}`
  if (kind === 'deals') return `${titleize(row.stage)} · ${formatCurrency(row.deal_value)}`
  if (kind === 'vacancies') return `${formatNumber(row.available_area_m2, 'm²')} · Available ${formatDate(row.availability_date)}`
  if (kind === 'listings') return `${titleize(row.listing_status)} · ${titleize(row.listing_category)} · ${formatCurrency(row.pricing)}`
  if (kind === 'headsOfTerms') return `${titleize(row.status)} · ${formatDate(row.updated_at || row.created_at)}`
  return `${titleize(row.status)} · ${formatDate(row.lease_end_date || row.updated_at || row.created_at)}`
}

function AssignmentRow({ kind, row, brokerChoices, teamChoices, branchChoices, onAssigned, disabled }) {
  const [brokerId, setBrokerId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleAssign() {
    if (!brokerId && !teamId && !branchId) return
    setSaving(true)
    setError('')
    try {
      await assignCommercialRecord({ kind, id: row.id, brokerId, teamId, branchId })
      onAssigned?.()
    } catch (assignError) {
      setError(assignError?.message || 'Broker assignment failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    setError('')
    try {
      await clearCommercialAssignment({ kind, id: row.id })
      onAssigned?.()
    } catch (assignError) {
      setError(assignError?.message || 'Assignment could not be cleared.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_minmax(180px,0.55fr)_minmax(180px,0.55fr)_180px] xl:items-end">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#102236]">{recordTitle(kind, row)}</p>
        <p className="mt-1 text-xs text-slate-500">{recordMeta(kind, row)}</p>
        {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
      </div>
      <BrokerPicker
        value={brokerId}
        options={brokerChoices}
        onChange={setBrokerId}
        disabled={disabled || saving}
      />
      <TeamPicker value={teamId} options={teamChoices} onChange={setTeamId} disabled={disabled || saving} />
      <BranchPicker value={branchId} options={branchChoices} onChange={setBranchId} disabled={disabled || saving} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleAssign}
          disabled={(!brokerId && !teamId && !branchId) || disabled || saving}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserRoundCheck size={15} />
          {saving ? 'Saving' : 'Assign'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || saving}
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </article>
  )
}

function AssignmentSection({ title, kind, rows = [], brokerChoices = [], teamChoices = [], branchChoices = [], canManage, onAssigned }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkBrokerId, setBulkBrokerId] = useState('')
  const [bulkTeamId, setBulkTeamId] = useState('')
  const [bulkBranchId, setBulkBranchId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const selectedSet = new Set(selectedIds)

  function toggle(rowId) {
    setSelectedIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId])
  }

  async function handleBulkAssign() {
    setBulkSaving(true)
    setBulkError('')
    try {
      await bulkAssignCommercialRecords({ kind, ids: selectedIds, brokerId: bulkBrokerId, teamId: bulkTeamId, branchId: bulkBranchId })
      setSelectedIds([])
      setBulkBrokerId('')
      setBulkTeamId('')
      setBulkBranchId('')
      onAssigned?.()
    } catch (assignError) {
      setBulkError(assignError?.message || 'Bulk assignment failed.')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <section className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#102236]">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{rows.length} unassigned {rows.length === 1 ? 'record' : 'records'}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
          <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
            <BrokerPicker value={bulkBrokerId} options={brokerChoices} onChange={setBulkBrokerId} disabled={!canManage || bulkSaving} />
            <TeamPicker value={bulkTeamId} options={teamChoices} onChange={setBulkTeamId} disabled={!canManage || bulkSaving} />
            <BranchPicker value={bulkBranchId} options={branchChoices} onChange={setBulkBranchId} disabled={!canManage || bulkSaving} />
            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={!selectedIds.length || (!bulkBrokerId && !bulkTeamId && !bulkBranchId) || !canManage || bulkSaving}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? 'Assigning' : `Assign ${selectedIds.length || ''}`}
            </button>
          </div>
          {bulkError ? <p className="mt-2 text-xs font-semibold text-rose-600">{bulkError}</p> : null}
        </div>
      ) : null}
      <div className="mt-5 grid gap-3">
        {rows.length ? rows.map((row) => (
          <div key={`${kind}-${row.id}`} className="grid gap-2">
            <label className="flex w-fit items-center gap-2 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4 rounded border-slate-300" />
              Select for bulk assignment
            </label>
            <AssignmentRow kind={kind} row={row} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} disabled={!canManage} onAssigned={onAssigned} />
          </div>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No unassigned records in this queue.</p>
        )}
      </div>
    </section>
  )
}

function CommercialBrokerAssignmentsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, loading, error } = useCommercialData(getCommercialBrokerageData, [refreshKey])
  const unassigned = data?.unassigned || {}
  const brokerChoices = useMemo(() => brokerOptions(data?.brokers || []), [data?.brokers])
  const teamChoices = useMemo(() => teamOptions(data?.teams || []), [data?.teams])
  const branchChoices = useMemo(() => branchOptions(data?.branches || []), [data?.branches])
  const canManage = data?.context?.canManageBrokerage === true

  function refresh() {
    setRefreshKey((value) => value + 1)
  }

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Assignments</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Assign or reassign commercial requirements, listings, deals, Heads of Terms, vacancies, and leases to brokers.</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {!canManage && !loading ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Broker assignment is available to principal, HQ, admin, and branch management users.</p>
        ) : null}
      </section>

      {error ? <CommercialEmptyState title="Assignment queues could not be loaded" description={error} /> : null}
      {loading ? <div className="h-32 animate-pulse rounded-3xl bg-slate-100" /> : null}

      {!loading ? (
        <div className="grid gap-4">
          <AssignmentSection title="Unassigned Requirements" kind="requirements" rows={unassigned.requirements || []} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} canManage={canManage} onAssigned={refresh} />
          <AssignmentSection title="Unassigned Deals" kind="deals" rows={unassigned.deals || []} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} canManage={canManage} onAssigned={refresh} />
          <AssignmentSection title="Unassigned Heads of Terms" kind="headsOfTerms" rows={unassigned.headsOfTerms || []} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} canManage={canManage} onAssigned={refresh} />
          <AssignmentSection title="Unassigned Listings" kind="listings" rows={unassigned.listings || []} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} canManage={canManage} onAssigned={refresh} />
          <AssignmentSection title="Unassigned Vacancies" kind="vacancies" rows={unassigned.vacancies || []} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} canManage={canManage} onAssigned={refresh} />
          <AssignmentSection title="Unassigned Leases" kind="leases" rows={unassigned.leases || []} brokerChoices={brokerChoices} teamChoices={teamChoices} branchChoices={branchChoices} canManage={canManage} onAssigned={refresh} />
        </div>
      ) : null}
    </div>
  )
}

export default CommercialBrokerAssignmentsPage
