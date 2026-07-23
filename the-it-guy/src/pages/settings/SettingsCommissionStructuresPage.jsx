import {
  BadgePercent,
  CheckCircle2,
  Edit3,
  Handshake,
  MoreHorizontal,
  Plus,
  Search,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, getWorkspaceAdministratorLabel, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import {
  fetchOrganisationSettings,
  removeOrganisationCommissionStructure,
  saveOrganisationCommissionStructure,
} from '../../lib/settingsApi'
import {
  DEFAULT_AGENT_MONTHLY_TARGET,
  assignUserCommissionLevel,
  createCommissionLevel,
  getCommissionAssignableUsers,
  getCommissionOverview,
  updateCommissionLevel,
  updateReferralCommissionRule,
} from '../../services/commissionService'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  settingsPageClass,
} from './settingsUi'

const COMMISSION_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'levels', label: 'Levels' },
  { key: 'agents', label: 'Agents' },
  { key: 'rules', label: 'Rules' },
]

const INPUT_CLASS = 'h-11 rounded-[12px] border-[#d8e3ee] bg-white text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:ring-[#dff2e8]'
const LABEL_CLASS = 'text-[0.78rem] font-semibold text-[#43566d]'
const CARD_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.055)] sm:p-6'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const compactCurrency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizePercentage(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, Number(parsed.toFixed(2))))
}

function formatCurrency(value, { compact = false } = {}) {
  const amount = Number(value || 0)
  return (compact ? compactCurrency : currency).format(Number.isFinite(amount) ? amount : 0).replace('ZAR', 'R')
}

function formatPercent(value, fallback = 0) {
  const numeric = normalizePercentage(value, fallback)
  return `${numeric.toFixed(numeric % 1 ? 1 : 0)}%`
}

function createLevelDraft(level = {}) {
  const agentPercentage = normalizePercentage(level.agentPercentage, 70)
  return {
    id: level.id || '',
    name: level.name || '',
    agentPercentage,
    monthlyTarget: level.monthlyTarget ?? '',
    annualTarget: level.annualTarget ?? '',
    isDefault: Boolean(level.isDefault),
    isActive: level.isActive !== false,
  }
}

function createStructureDraft(structure = {}) {
  return {
    id: structure.id || '',
    name: structure.name || '',
    listingCommissionType: structure.listingCommissionType || 'percentage',
    listingCommissionPercentage: structure.listingCommissionPercentage ?? 7.5,
    listingCommissionAmount: structure.listingCommissionAmount ?? '',
    agentSplitPercentage: structure.agentSplitPercentage ?? 70,
    allowSalesCommissionOverride: structure.allowSalesCommissionOverride !== false,
    isDefault: Boolean(structure.isDefault),
    isActive: structure.isActive !== false,
    notes: structure.notes || '',
  }
}

function createReferralDraft(rule = {}) {
  return {
    id: rule.id || '',
    name: rule.name || '',
    referralType: rule.referralType || 'same_branch',
    percentage: rule.percentage ?? 10,
    basis: rule.basis || 'gross_commission',
    isDefault: Boolean(rule.isDefault),
    isActive: rule.isActive !== false,
  }
}

function getListingCommissionValue(row = {}, fallback = '7.5%') {
  return normalizeText(row.defaultCommission) || fallback
}

function getCommissionRateNumber(value = '7.5%') {
  const match = normalizeText(value).match(/[\d.]+/)
  const parsed = Number(match?.[0])
  return Number.isFinite(parsed) ? parsed : 7.5
}

function isAgentLikeRole(role) {
  return ['agent', 'branch_manager', 'admin', 'principal', 'super_admin'].includes(normalizeText(role).toLowerCase())
}

function getAgentInitials(name = '', email = '') {
  const words = normalizeText(name).split(/\s+/).filter(Boolean)
  if (words.length) return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('')
  const fallback = normalizeText(email).charAt(0).toUpperCase()
  return fallback || 'A'
}

function getAgentBranchLabel(row = {}) {
  return normalizeText(
    row.branchName ||
      row.branch ||
      row.user?.branchName ||
      row.user?.branch_name ||
      row.user?.branch?.name ||
      row.user?.teamName ||
      row.user?.team_name,
  )
}

function getActiveTransactionsLabel(row = {}) {
  const rawValue =
    row.activeTransactions ??
    row.activeTransactionCount ??
    row.user?.activeTransactions ??
    row.user?.active_transaction_count ??
    row.user?.activeTransactionsCount
  const value = Number(rawValue || 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  return `${value} Active Transaction${value === 1 ? '' : 's'}`
}

function AgentAvatar({ row = {}, size = 'md' }) {
  const avatarUrl = normalizeText(row.avatarUrl || row.user?.avatarUrl || row.user?.avatar_url)
  const name = row.name || row.email || 'Agent'
  const sizeClass = size === 'lg' ? 'h-16 w-16 text-lg' : 'h-12 w-12 text-sm'
  if (avatarUrl) {
    return <img src={avatarUrl} alt={`${name} avatar`} className={`${sizeClass} rounded-full object-cover shadow-[0_10px_24px_rgba(15,23,42,0.08)]`} />
  }
  return (
    <span className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-[#eef7f2] font-semibold text-[#0f7f4f] shadow-[inset_0_0_0_1px_rgba(15,127,79,0.08)]`}>
      {getAgentInitials(name, row.email)}
    </span>
  )
}

function CommissionCard({ title, description, actions, children, className = '' }) {
  return (
    <section className={`${CARD_CLASS} ${className}`.trim()}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[1.05rem] font-semibold text-[#17233a]">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function FieldLabel({ label, id, children, className = '' }) {
  return (
    <label className={`grid gap-1.5 ${className}`.trim()} htmlFor={id}>
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}

function StatusPill({ children, tone = 'neutral' }) {
  const classes = {
    green: 'border-[#cfe8dc] bg-[#edf8f2] text-[#0f7f4f]',
    amber: 'border-[#ead8a9] bg-[#fff8ea] text-[#a35f06]',
    blue: 'border-[#d7e7fb] bg-[#eef6ff] text-[#2563a6]',
    neutral: 'border-[#e0e8f1] bg-[#f8fbfe] text-[#60758d]',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[tone] || classes.neutral}`}>
      {children}
    </span>
  )
}

function IconButton({ children, onClick, variant = 'secondary', type = 'button', disabled = false }) {
  const classes = variant === 'primary'
    ? 'border-[#0f7f4f] bg-[#0f7f4f] text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] hover:bg-[#0d6f45]'
    : 'border-[#d9e3ef] bg-white text-[#24364b] hover:bg-[#f7fafc]'
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${classes}`}
    >
      {children}
    </button>
  )
}

function TabRail({ activeTab, setActiveTab }) {
  return (
    <nav className="overflow-x-auto border-b border-[#dfe7f0]" aria-label="Commission sections">
      <div className="flex min-w-max gap-8">
        {COMMISSION_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'relative h-12 px-0 text-sm font-semibold transition',
              activeTab === tab.key
                ? 'text-[#0f7f4f] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#0f7f4f]'
                : 'text-[#52667d] hover:text-[#17233a]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function OverviewMetric({ title, value, description, children }) {
  return (
    <article className="flex items-center gap-4 rounded-[22px] bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgba(226,235,244,0.9)]">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#f0f7f3] text-[#0f7f4f]">
          {children}
      </div>
      <div>
        <p className="text-sm font-semibold text-[#40566d]">{title}</p>
        <p className="mt-1 text-2xl font-semibold leading-none text-[#17233a]">{value}</p>
        {description ? <p className="mt-1 text-sm text-[#60758d]">{description}</p> : null}
      </div>
    </article>
  )
}

function SplitBar({ agent = 70, agency = 30 }) {
  const safeAgent = normalizePercentage(agent, 70)
  const safeAgency = normalizePercentage(agency, 100 - safeAgent)
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[#dfe8f1]">
        <span className="bg-[#0f7f4f]" style={{ width: `${safeAgent}%` }} />
        <span className="bg-[#9fb4c8]" style={{ width: `${safeAgency}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-[#60758d]">
        <span>{formatPercent(safeAgent)} Agent</span>
        <span>{formatPercent(safeAgency)} Agency</span>
      </div>
    </div>
  )
}

function CommissionOverviewDashboard({ levels, referralRules, structures, assignableRows, defaultLevel, setActiveTab }) {
  const activeRules = referralRules.filter((rule) => rule.isActive !== false)
  const totalAgents = assignableRows.length
  const overrides = assignableRows.filter((row) => row.assignedLevelId).length

  return (
    <div className="space-y-8">
      <section className="grid gap-4 rounded-[24px] border border-[#e1eaf2] bg-[linear-gradient(135deg,#ffffff_0%,#f7fbf8_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)] lg:items-center lg:p-8">
        <button
          type="button"
          onClick={() => setActiveTab('levels')}
          className="rounded-[22px] bg-white/75 p-6 text-left shadow-[inset_0_0_0_1px_rgba(226,235,244,0.9)] transition hover:bg-white"
        >
          <p className="text-sm font-semibold text-[#40566d]">Agency Default</p>
          <p className="mt-4 text-5xl font-semibold tracking-[-0.02em] text-[#101828]">
            {formatPercent(defaultLevel.agentPercentage, 50).replace('%', '')} / {formatPercent(defaultLevel.agencyPercentage, 50).replace('%', '')}
          </p>
          <p className="mt-3 text-sm font-medium text-[#60758d]">Used by {totalAgents || 0} agent{totalAgents === 1 ? '' : 's'}</p>
        </button>

        <div className="grid gap-3 md:grid-cols-3">
          <OverviewMetric title="Commission Levels" value={levels.length || 0} description="Reusable templates">
          <BadgePercent className="h-5 w-5" strokeWidth={2} />
          </OverviewMetric>
          <OverviewMetric title="Referral Rules" value={activeRules.length || 0} description={`${structures.length || 0} operational templates`}>
          <Handshake className="h-5 w-5" strokeWidth={2} />
          </OverviewMetric>
          <OverviewMetric title="Overrides" value={overrides || 0} description="Agent-specific assignments">
            <UsersRound className="h-5 w-5" strokeWidth={2} />
          </OverviewMetric>
        </div>
      </section>
    </div>
  )
}

function getLevelDescription(level = {}) {
  if (level.description) return level.description
  const monthlyTarget = Number(level.monthlyTarget || 0)
  if (monthlyTarget > 0) return `${formatCurrency(monthlyTarget, { compact: true })} monthly target`
  if (level.isDefault) return 'Default agency commission structure'
  return 'Reusable commission level'
}

function CommissionLevelsWorkspace({ levels, openModal }) {
  return (
    <CommissionCard
      title="Levels"
      actions={
        <IconButton variant="primary" onClick={() => openModal('level')}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create Level
        </IconButton>
      }
    >
        {!levels.length ? (
          <SettingsEmptyState title="No levels yet" description="Create your first reusable commission level." />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {levels.map((level) => (
              <button key={level.id || level.name} type="button" onClick={() => openModal('level', level)} className="group rounded-[24px] bg-[#fbfdff] p-5 text-left shadow-[inset_0_0_0_1px_rgba(226,235,244,0.95),0_16px_38px_rgba(15,23,42,0.04)] transition hover:bg-white hover:shadow-[inset_0_0_0_1px_rgba(190,209,226,0.95),0_20px_48px_rgba(15,23,42,0.07)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[#17233a]">{level.name}</p>
                    <p className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-[#0f7f4f]">
                      {formatPercent(level.agentPercentage).replace('%', '')} / {formatPercent(level.agencyPercentage).replace('%', '')}
                    </p>
                  </div>
                  {level.isDefault ? <StatusPill tone="green">Default</StatusPill> : null}
                </div>
                <p className="mt-4 text-sm font-semibold text-[#60758d]">{level.assignedAgentsCount || 0} Agent{Number(level.assignedAgentsCount || 0) === 1 ? '' : 's'}</p>
                <div className="mt-4">
                  <SplitBar agent={level.agentPercentage} agency={level.agencyPercentage} />
                </div>
                <div className="mt-5 flex items-center justify-between text-sm font-semibold text-[#0f7f4f]">
                  <span className="inline-flex items-center gap-2"><Edit3 className="h-4 w-4" strokeWidth={2} />Edit</span>
                  <MoreHorizontal className="h-4 w-4 text-[#8ca0b5]" strokeWidth={2} />
                </div>
              </button>
            ))}
          </div>
        )}
    </CommissionCard>
  )
}

function AgentCard({ row, onEdit }) {
  const branchLabel = getAgentBranchLabel(row)
  const transactionLabel = getActiveTransactionsLabel(row)
  return (
    <article className="group rounded-[24px] bg-white p-5 shadow-[inset_0_0_0_1px_rgba(226,235,244,0.95),0_16px_40px_rgba(15,23,42,0.045)] transition hover:shadow-[inset_0_0_0_1px_rgba(190,209,226,0.95),0_22px_52px_rgba(15,23,42,0.075)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar row={row} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[#17233a]">{row.name}</h3>
            {branchLabel ? <p className="mt-1 truncate text-sm text-[#60758d]">{branchLabel}</p> : null}
          </div>
        </div>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-[#8ca0b5] transition hover:bg-[#f4f8fb] hover:text-[#17233a]" aria-label={`More actions for ${row.name}`}>
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <StatusPill tone={row.assignedLevelId ? 'green' : 'neutral'}>{row.levelName}</StatusPill>
        <span className="rounded-full bg-[#f7fafc] px-3 py-1 text-xs font-semibold text-[#60758d]">
          {formatPercent(row.agentPercentage)} / {formatPercent(row.agencyPercentage)}
        </span>
      </div>
      <div className="mt-5">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[#8ca0b5]">Commission Split</p>
        <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-[#101828]">
          {formatPercent(row.agentPercentage).replace('%', '')} / {formatPercent(row.agencyPercentage).replace('%', '')}
        </p>
      </div>
      {transactionLabel ? <p className="mt-4 text-sm font-medium text-[#60758d]">{transactionLabel}</p> : null}
      <button
        type="button"
        onClick={() => onEdit(row)}
        className="mt-6 inline-flex h-10 items-center justify-center rounded-[14px] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45]"
      >
        Edit Split
      </button>
    </article>
  )
}

function AgentsWorkspace({ rows, filters, setFilters, openModal }) {
  const filteredRows = rows.filter((row) => {
    const search = normalizeText(filters.search).toLowerCase()
    const branch = getAgentBranchLabel(row).toLowerCase()
    return !search || `${row.name} ${row.email} ${row.levelName} ${branch}`.toLowerCase().includes(search)
  })

  return (
    <CommissionCard title="Agents">
      {!rows.length ? (
        <SettingsEmptyState title="No active agents yet" description="Invite agents first, then manage their commission assignments here." />
      ) : (
        <div className="space-y-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8fa0b4]" strokeWidth={2} />
            <Field className={`${INPUT_CLASS} pl-9`} placeholder="Search agents" value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} />
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((row) => <AgentCard key={row.key} row={row} onEdit={(agentRow) => openModal('agent', agentRow)} />)}
          </div>
          {!filteredRows.length ? <SettingsEmptyState title="No agents found" description="Try a different name, branch or level." /> : null}
        </div>
      )}
    </CommissionCard>
  )
}

function TargetMetric({ label, value }) {
  return (
    <div className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7b8fa5]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#17233a]">{value}</p>
    </div>
  )
}

function ReferralRulesWorkspace({ referralRules, referralDraft, setReferralDraft, updateReferralDraft, saveReferral, saving }) {
  return (
    <CommissionCard title="Referral Rules" description="Manage referral payouts with a clear rule list and preview.">
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="grid gap-2">
          {referralRules.map((rule) => (
            <button
              key={rule.id || rule.referralType}
              type="button"
              onClick={() => setReferralDraft(createReferralDraft(rule))}
              className={[
                'rounded-[14px] border px-4 py-3 text-left transition',
                referralDraft.referralType === rule.referralType
                  ? 'border-[#b9d8c6] bg-[#f2fbf5] text-[#0f7f4f]'
                  : 'border-[#e3ebf4] bg-white text-[#344054] hover:bg-[#fbfdff]',
              ].join(' ')}
            >
              <span className="text-sm font-semibold">{rule.name}</span>
              <span className="mt-1 block text-xs">{formatPercent(rule.percentage)} of {normalizeText(rule.basis).replaceAll('_', ' ')}</span>
            </button>
          ))}
        </div>
        <form className="grid gap-5" onSubmit={saveReferral}>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldLabel label="Rule Name" id="referral-rule-name" className="md:col-span-2">
              <Field id="referral-rule-name" className={INPUT_CLASS} value={referralDraft.name} onChange={(event) => updateReferralDraft('name', event.target.value)} />
            </FieldLabel>
            <FieldLabel label="Percentage" id="referral-percentage">
              <Field id="referral-percentage" type="number" min="0" max="100" step="0.01" className={INPUT_CLASS} value={referralDraft.percentage} onChange={(event) => updateReferralDraft('percentage', event.target.value)} />
            </FieldLabel>
            <FieldLabel label="Basis" id="referral-basis">
              <Field as="select" id="referral-basis" className={INPUT_CLASS} value={referralDraft.basis} onChange={(event) => updateReferralDraft('basis', event.target.value)}>
                <option value="gross_commission">Gross Commission</option>
                <option value="agent_commission">Agent Commission</option>
                <option value="fixed_fee">Fixed Fee</option>
              </Field>
            </FieldLabel>
            <FieldLabel label="Status" id="referral-status">
              <Field as="select" id="referral-status" className={INPUT_CLASS} value={referralDraft.isActive ? 'active' : 'inactive'} onChange={(event) => updateReferralDraft('isActive', event.target.value === 'active')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Field>
            </FieldLabel>
          </div>
          <div className="rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
            <p className="text-sm font-semibold text-[#17233a]">Rule Preview</p>
            <div className="mt-4 grid gap-3 text-center text-sm font-semibold text-[#40566d] md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
              <span className="rounded-[14px] bg-white p-3">Agent A refers</span>
              <span className="text-xs uppercase tracking-[0.12em] text-[#9aa8b8]">then</span>
              <span className="rounded-[14px] bg-white p-3">{referralDraft.name || 'Same Branch'}</span>
              <span className="text-xs uppercase tracking-[0.12em] text-[#9aa8b8]">then</span>
              <span className="rounded-[14px] bg-white p-3 text-[#0f7f4f]">{formatPercent(referralDraft.percentage)} {normalizeText(referralDraft.basis).replaceAll('_', ' ')}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <IconButton variant="primary" type="submit" disabled={saving}>
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
              {saving ? 'Saving...' : 'Save Referral Rule'}
            </IconButton>
          </div>
        </form>
      </div>
    </CommissionCard>
  )
}

function TemplatesWorkspace({ structures, openModal, removeStructure, saving }) {
  return (
    <CommissionCard
      title="Templates"
      description="Reusable commission templates for transaction snapshots and listing defaults."
      actions={
        <IconButton variant="primary" onClick={() => openModal('template')}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create Template
        </IconButton>
      }
    >
      {!structures.length ? (
        <SettingsEmptyState title="No Commission Templates Yet" description="Create your first commission template." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {structures.map((structure) => (
            <article key={structure.id} className="rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-[#17233a]">{structure.name}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f7f4f]">
                    {structure.listingCommissionType === 'fixed'
                      ? formatCurrency(structure.listingCommissionAmount || 0, { compact: true })
                      : formatPercent(structure.listingCommissionPercentage, 7.5)}
                  </p>
                </div>
                {structure.isDefault ? <StatusPill tone="green">Default</StatusPill> : null}
              </div>
              <div className="mt-4">
                <SplitBar agent={structure.agentSplitPercentage} agency={structure.agencySplitPercentage} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <IconButton onClick={() => openModal('template', structure)}>
                  <Edit3 className="h-4 w-4" strokeWidth={2} />
                  Edit
                </IconButton>
                <IconButton disabled={saving} onClick={() => removeStructure(structure)}>
                  Remove
                </IconButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </CommissionCard>
  )
}

function BusinessRulesWorkspace({
  referralRules,
  referralDraft,
  setReferralDraft,
  updateReferralDraft,
  saveReferral,
  structures,
  openModal,
  removeStructure,
  saving,
}) {
  const activeRules = referralRules.filter((rule) => rule.isActive !== false).length
  return (
    <div className="space-y-6">
      <CommissionCard title="Rules">
        <div className="grid gap-3 md:grid-cols-3">
          <TargetMetric label="Referral Rules" value={`${activeRules} Active`} />
          <TargetMetric label="Operational Rules" value={`${structures.length} Templates`} />
          <TargetMetric label="Exceptions" value="Managed in Agents" />
        </div>
      </CommissionCard>

      <ReferralRulesWorkspace
        referralRules={referralRules}
        referralDraft={referralDraft}
        setReferralDraft={setReferralDraft}
        updateReferralDraft={updateReferralDraft}
        saveReferral={saveReferral}
        saving={saving}
      />

      <TemplatesWorkspace structures={structures} openModal={openModal} removeStructure={removeStructure} saving={saving} />
    </div>
  )
}

function CommissionModal({ title, description, children, footer, onClose, variant = 'modal' }) {
  const isDrawer = variant === 'drawer'
  return (
    <div className={`fixed inset-0 z-50 grid bg-[#0f172a]/35 p-4 backdrop-blur-sm ${isDrawer ? 'justify-items-end' : 'lg:place-items-center'}`} role="dialog" aria-modal="true">
      <section className={`${isDrawer ? 'h-full max-h-[calc(100vh-32px)] w-full max-w-xl' : 'max-h-[calc(100vh-32px)] w-full lg:max-w-2xl'} overflow-hidden rounded-[24px] border border-[#dfe8f1] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#e5edf4] p-5">
          <div>
            <h2 className="text-lg font-semibold text-[#17233a]">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p> : null}
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-[12px] border border-[#d9e3ef] bg-white text-[#52667d]" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-[#e5edf4] p-5">{footer}</div> : null}
      </section>
    </div>
  )
}

function LevelEditor({ draft, updateDraft, onSubmit, onCancel, saving }) {
  const agentPercentage = normalizePercentage(draft.agentPercentage, 70)
  const agencyPercentage = normalizePercentage(100 - agentPercentage, 30)
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FieldLabel label="Level Name" id="level-name" className="md:col-span-2">
          <Field id="level-name" className={INPUT_CLASS} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Standard" />
        </FieldLabel>
        <FieldLabel label="Agent %" id="level-agent">
          <Field id="level-agent" type="number" min="0" max="100" step="0.01" className={INPUT_CLASS} value={draft.agentPercentage} onChange={(event) => updateDraft('agentPercentage', event.target.value)} />
        </FieldLabel>
        <FieldLabel label="Agency %" id="level-agency">
          <Field id="level-agency" className={INPUT_CLASS} value={agencyPercentage} disabled />
        </FieldLabel>
        <FieldLabel label="Monthly Target" id="level-monthly">
          <Field id="level-monthly" type="number" min="0" step="1000" className={INPUT_CLASS} value={draft.monthlyTarget} onChange={(event) => updateDraft('monthlyTarget', event.target.value)} placeholder="Optional" />
        </FieldLabel>
        <FieldLabel label="Annual Target" id="level-annual">
          <Field id="level-annual" type="number" min="0" step="1000" className={INPUT_CLASS} value={draft.annualTarget} onChange={(event) => updateDraft('annualTarget', event.target.value)} placeholder="Optional" />
        </FieldLabel>
        <FieldLabel label="Default" id="level-default">
          <Field as="select" id="level-default" className={INPUT_CLASS} value={draft.isDefault ? 'yes' : 'no'} onChange={(event) => updateDraft('isDefault', event.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Field>
        </FieldLabel>
        <FieldLabel label="Status" id="level-status">
          <Field as="select" id="level-status" className={INPUT_CLASS} value={draft.isActive ? 'active' : 'inactive'} onChange={(event) => updateDraft('isActive', event.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Field>
        </FieldLabel>
      </div>
      <SplitBar agent={agentPercentage} agency={agencyPercentage} />
      <div className="flex justify-end gap-2">
        <IconButton onClick={onCancel}>Cancel</IconButton>
        <IconButton variant="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Level'}</IconButton>
      </div>
    </form>
  )
}

function TemplateEditor({ draft, updateDraft, onSubmit, onCancel, saving }) {
  const agentSplit = normalizePercentage(draft.agentSplitPercentage, 70)
  const agencySplit = normalizePercentage(100 - agentSplit, 30)
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FieldLabel label="Template Name" id="template-name" className="md:col-span-2">
          <Field id="template-name" className={INPUT_CLASS} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Standard Residential" />
        </FieldLabel>
        <FieldLabel label="Listing Commission Type" id="template-type">
          <Field as="select" id="template-type" className={INPUT_CLASS} value={draft.listingCommissionType} onChange={(event) => updateDraft('listingCommissionType', event.target.value)}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
          </Field>
        </FieldLabel>
        <FieldLabel label={draft.listingCommissionType === 'fixed' ? 'Listing Commission Amount' : 'Listing Commission %'} id="template-commission">
          <Field
            id="template-commission"
            type="number"
            min="0"
            max={draft.listingCommissionType === 'fixed' ? undefined : '100'}
            step="0.01"
            className={INPUT_CLASS}
            value={draft.listingCommissionType === 'fixed' ? draft.listingCommissionAmount : draft.listingCommissionPercentage}
            onChange={(event) => updateDraft(draft.listingCommissionType === 'fixed' ? 'listingCommissionAmount' : 'listingCommissionPercentage', event.target.value)}
          />
        </FieldLabel>
        <FieldLabel label="Agent Split %" id="template-agent">
          <Field id="template-agent" type="number" min="0" max="100" step="0.01" className={INPUT_CLASS} value={draft.agentSplitPercentage} onChange={(event) => updateDraft('agentSplitPercentage', event.target.value)} />
        </FieldLabel>
        <FieldLabel label="Agency Split %" id="template-agency">
          <Field id="template-agency" className={INPUT_CLASS} value={agencySplit} disabled />
        </FieldLabel>
        <FieldLabel label="Default" id="template-default">
          <Field as="select" id="template-default" className={INPUT_CLASS} value={draft.isDefault ? 'yes' : 'no'} onChange={(event) => updateDraft('isDefault', event.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Field>
        </FieldLabel>
        <FieldLabel label="Status" id="template-status">
          <Field as="select" id="template-status" className={INPUT_CLASS} value={draft.isActive ? 'active' : 'inactive'} onChange={(event) => updateDraft('isActive', event.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Field>
        </FieldLabel>
      </div>
      <FieldLabel label="Notes" id="template-notes">
        <Field as="textarea" id="template-notes" className="min-h-[92px] rounded-[12px] border-[#d8e3ee] text-sm" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} />
      </FieldLabel>
      <SplitBar agent={agentSplit} agency={agencySplit} />
      <div className="flex justify-end gap-2">
        <IconButton onClick={onCancel}>Cancel</IconButton>
        <IconButton variant="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</IconButton>
      </div>
    </form>
  )
}

function AgentCommissionDrawer({ row, levels, onAssign, onCancel, saving }) {
  const [levelId, setLevelId] = useState(row?.assignedLevelId || row?.effectiveLevelId || levels[0]?.id || '')
  const [overrideEnabled, setOverrideEnabled] = useState(Boolean(row?.assignedLevelId))
  const selectedLevel = levels.find((level) => normalizeText(level.id) === normalizeText(levelId)) || row || {}
  const agentSplit = normalizePercentage(selectedLevel.agentPercentage ?? row?.agentPercentage, 70)
  const agencySplit = normalizePercentage(selectedLevel.agencyPercentage ?? (100 - agentSplit), 30)

  useEffect(() => {
    setLevelId(row?.assignedLevelId || row?.effectiveLevelId || levels[0]?.id || '')
    setOverrideEnabled(Boolean(row?.assignedLevelId))
  }, [levels, row])

  return (
    <form className="grid gap-6" onSubmit={(event) => {
      event.preventDefault()
      if (row) onAssign(row.user, overrideEnabled ? levelId : '')
    }}>
      <div className="flex items-center gap-4">
        <AgentAvatar row={row} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-[#17233a]">{row?.name || 'Agent'}</h2>
          <p className="mt-1 truncate text-sm text-[#60758d]">{getAgentBranchLabel(row) || row?.email || 'Commission assignment'}</p>
        </div>
      </div>

      <div className="h-px bg-[#edf2f7]" />

      <FieldLabel label="Commission Level" id="agent-commission-level">
        <Field as="select" id="agent-commission-level" className={INPUT_CLASS} value={levelId} onChange={(event) => {
          setLevelId(event.target.value)
          setOverrideEnabled(true)
        }}>
          {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
        </Field>
      </FieldLabel>

      <div className="h-px bg-[#edf2f7]" />

      <section className="grid gap-4">
        <label className="flex items-center justify-between gap-3 rounded-[18px] bg-[#fbfdff] p-4 shadow-[inset_0_0_0_1px_rgba(226,235,244,0.95)]">
          <span>
            <span className="block text-sm font-semibold text-[#17233a]">Override Split</span>
            <span className="mt-1 block text-sm text-[#60758d]">Use an agent-specific assignment.</span>
          </span>
          <input
            type="checkbox"
            checked={overrideEnabled}
            onChange={(event) => setOverrideEnabled(event.target.checked)}
            className="h-5 w-5 rounded border-[#cfd9e4] text-[#0f7f4f] focus:ring-[#dff2e8]"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Agent" id="agent-split-percentage">
            <Field id="agent-split-percentage" className={INPUT_CLASS} value={formatPercent(agentSplit)} disabled />
          </FieldLabel>
          <FieldLabel label="Agency" id="agency-split-percentage">
            <Field id="agency-split-percentage" className={INPUT_CLASS} value={formatPercent(agencySplit)} disabled />
          </FieldLabel>
        </div>
      </section>

      <div className="h-px bg-[#edf2f7]" />

      <TargetMetric label="Effective Date" value="Today" />

      <div className="flex justify-end gap-2">
        <IconButton onClick={onCancel}>Cancel</IconButton>
        <IconButton variant="primary" type="submit" disabled={saving || !row}>{saving ? 'Saving...' : 'Save Changes'}</IconButton>
      </div>
    </form>
  )
}

function AuditTrail({ levels, structures, referralRules }) {
  const rows = [
    ...levels.slice(0, 3).map((level) => ({
      label: `${level.name} level`,
      previous: 'Previous split',
      next: `${formatPercent(level.agentPercentage)} / ${formatPercent(level.agencyPercentage)}`,
      reason: level.isDefault ? 'Default level' : 'Level update',
      date: level.updatedAt || level.createdAt || 'Recent',
    })),
    ...structures.slice(0, 2).map((structure) => ({
      label: `${structure.name} template`,
      previous: 'Template value',
      next: structure.listingCommissionType === 'fixed' ? formatCurrency(structure.listingCommissionAmount || 0) : formatPercent(structure.listingCommissionPercentage, 7.5),
      reason: structure.isDefault ? 'Default template' : 'Template update',
      date: structure.updatedAt || structure.createdAt || 'Recent',
    })),
    ...referralRules.slice(0, 2).map((rule) => ({
      label: rule.name,
      previous: 'Referral value',
      next: `${formatPercent(rule.percentage)} ${rule.basis.replaceAll('_', ' ')}`,
      reason: 'Referral rule',
      date: rule.updatedAt || rule.createdAt || 'Recent',
    })),
  ]
  return (
    <div className="grid gap-3">
      {rows.length ? rows.map((row) => (
        <article key={`${row.label}-${row.next}`} className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#17233a]">{row.label}</p>
              <p className="mt-1 text-sm text-[#60758d]">{row.previous} {'->'} <span className="font-semibold text-[#17233a]">{row.next}</span></p>
            </div>
            <StatusPill tone="neutral">{row.date === 'Recent' ? 'Recent' : new Date(row.date).toLocaleDateString('en-ZA')}</StatusPill>
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">Changed by Arch9 system - Reason: {row.reason}</p>
        </article>
      )) : <SettingsEmptyState title="No audit entries yet" description="Commission changes will appear here once saved." />}
    </div>
  )
}

export default function SettingsCommissionStructuresPage() {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [overview, setOverview] = useState(null)
  const [assignmentData, setAssignmentData] = useState({ users: [], levels: [], profiles: [] })
  const [levelDraft, setLevelDraft] = useState(createLevelDraft())
  const [structureDraft, setStructureDraft] = useState(createStructureDraft())
  const [referralDraft, setReferralDraft] = useState(createReferralDraft())
  const [modal, setModal] = useState({ type: '', payload: null })
  const [overrideFilters, setOverrideFilters] = useState({ search: '', branch: '', level: '' })

  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole, { appRole: role, workspaceType: resolvedWorkspaceType }),
    workspaceType: resolvedWorkspaceType,
  })

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const context = await fetchOrganisationSettings()
      const nextMembershipRole = normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
        appRole: role,
        workspaceType: context?.organisation?.type || resolvedWorkspaceType,
      })
      setMembershipRole(nextMembershipRole)
      const canManageCommissionSettings = canManageOrganisationSettings({
        appRole: role,
        membershipRole: nextMembershipRole,
        workspaceType: context?.organisation?.type || resolvedWorkspaceType,
      })

      if (!canManageCommissionSettings) {
        setOverview(null)
        setAssignmentData({ users: [], levels: [], profiles: [] })
        return
      }

      const [overviewResult, assignableResult] = await Promise.all([
        getCommissionOverview(),
        getCommissionAssignableUsers(),
      ])
      setOverview(overviewResult)
      setAssignmentData(assignableResult)
      const firstReferral = overviewResult.referralRules?.find((rule) => rule.isActive !== false) || overviewResult.referralRules?.[0]
      if (firstReferral) setReferralDraft(createReferralDraft(firstReferral))
      setLevelDraft(createLevelDraft())
      setStructureDraft(createStructureDraft())
    } catch (loadError) {
      setError(loadError.message || 'Unable to load commission settings.')
    } finally {
      setLoading(false)
    }
  }, [role, resolvedWorkspaceType])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const levels = useMemo(() => overview?.levels || [], [overview?.levels])
  const structures = useMemo(() => overview?.structures || [], [overview?.structures])
  const referralRules = useMemo(() => overview?.referralRules || [], [overview?.referralRules])
  const defaultLevel = useMemo(
    () => overview?.defaultLevel || levels.find((level) => level.isDefault) || levels[0] || {},
    [levels, overview?.defaultLevel],
  )

  const profileByUserKey = useMemo(() => {
    const map = new Map()
    for (const profile of assignmentData.profiles || []) {
      const organisationUserId = normalizeText(profile?.organisation_user_id || profile?.organisationUserId)
      const userId = normalizeText(profile?.user_id || profile?.userId)
      const email = normalizeText(profile?.email_address || profile?.email).toLowerCase()
      if (organisationUserId) map.set(`org-user:${organisationUserId}`, profile)
      if (userId) map.set(`user:${userId}`, profile)
      if (email) map.set(`email:${email}`, profile)
    }
    return map
  }, [assignmentData.profiles])

  const assignableRows = useMemo(() => {
    const users = (assignmentData.users || []).filter((user) => isAgentLikeRole(user.role))
    return users.map((user) => {
      const profile =
        profileByUserKey.get(`org-user:${normalizeText(user.id)}`) ||
        profileByUserKey.get(`user:${normalizeText(user.userId || user.user_id)}`) ||
        profileByUserKey.get(`email:${normalizeText(user.email).toLowerCase()}`) ||
        null
      const assignedLevelId = normalizeText(profile?.commission_level_id || profile?.commissionLevelId)
      const assignedLevel = levels.find((level) => normalizeText(level.id) === assignedLevelId)
      const effectiveLevel = assignedLevel || defaultLevel || levels[0] || {}
      return {
        key: normalizeText(user.id || user.userId || user.email),
        user,
        name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Agent',
        email: user.email || '',
        branchName: user.branchName || user.branch_name || user.branch?.name || '',
        role: user.role,
        profile,
        assignedLevelId,
        effectiveLevelId: effectiveLevel.id || '',
        levelName: effectiveLevel.name || 'Standard',
        agentPercentage: effectiveLevel.agentPercentage || 70,
        agencyPercentage: effectiveLevel.agencyPercentage ?? 30,
        monthlyCommission: effectiveLevel.monthlyTarget || DEFAULT_AGENT_MONTHLY_TARGET,
        effectiveFrom: profile?.effective_from || profile?.effectiveFrom || '',
      }
    })
  }, [assignmentData.users, defaultLevel, levels, profileByUserKey])

  const validationWarnings = useMemo(() => {
    const warnings = []
    const duplicateLevelNames = new Set()
    const seenLevelNames = new Set()
    for (const level of levels) {
      const key = normalizeText(level.name).toLowerCase()
      if (!key) continue
      if (seenLevelNames.has(key)) duplicateLevelNames.add(level.name)
      seenLevelNames.add(key)
      if (Number(level.agentPercentage || 0) + Number(level.agencyPercentage || 0) > 100.01) {
        warnings.push(`${level.name} split exceeds 100%.`)
      }
    }
    for (const name of duplicateLevelNames) warnings.push(`Duplicate commission level: ${name}.`)
    const listingRate = getCommissionRateNumber(getListingCommissionValue(overview?.listingRows?.[0] || {}))
    for (const rule of referralRules) {
      if (Number(rule.percentage || 0) > listingRate && rule.basis === 'gross_commission') {
        warnings.push(`${rule.name} referral exceeds the listing commission rate.`)
      }
    }
    if (structures.filter((structure) => structure.isDefault).length > 1) warnings.push('Multiple default templates exist.')
    return warnings
  }, [levels, overview?.listingRows, referralRules, structures])

  function openModal(type, payload = null) {
    setError('')
    if (type === 'level') setLevelDraft(createLevelDraft(payload || {}))
    if (type === 'template') setStructureDraft(createStructureDraft(payload || {}))
    setModal({ type, payload })
  }

  function closeModal() {
    setModal({ type: '', payload: null })
  }

  function updateLevelDraft(key, value) {
    setLevelDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateStructureDraft(key, value) {
    setStructureDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateReferralDraft(key, value) {
    setReferralDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function saveLevel(event) {
    event.preventDefault()
    if (!canEdit) return
    const name = normalizeText(levelDraft.name)
    if (!name) {
      setError('Level name is required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const agentPercentage = normalizePercentage(levelDraft.agentPercentage, 70)
      const payload = {
        ...levelDraft,
        name,
        agentPercentage,
        agencyPercentage: normalizePercentage(100 - agentPercentage, 30),
        monthlyTarget: levelDraft.monthlyTarget === '' ? null : Number(levelDraft.monthlyTarget),
        annualTarget: levelDraft.annualTarget === '' ? null : Number(levelDraft.annualTarget),
      }
      if (levelDraft.id) await updateCommissionLevel(payload)
      else await createCommissionLevel(payload)
      setMessage(levelDraft.id ? 'Commission level updated.' : 'Commission level created.')
      closeModal()
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save commission level.')
    } finally {
      setSaving(false)
    }
  }

  async function saveReferral(event) {
    event.preventDefault()
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await updateReferralCommissionRule({
        ...referralDraft,
        percentage: normalizePercentage(referralDraft.percentage, 0),
      })
      setMessage('Referral rule updated.')
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save referral rule.')
    } finally {
      setSaving(false)
    }
  }

  async function saveStructure(event) {
    event.preventDefault()
    if (!canEdit) return
    const name = normalizeText(structureDraft.name)
    if (!name) {
      setError('Template name is required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const agentSplitPercentage = normalizePercentage(structureDraft.agentSplitPercentage, 70)
      await saveOrganisationCommissionStructure({
        id: structureDraft.id || undefined,
        name,
        listingCommissionType: structureDraft.listingCommissionType,
        listingCommissionPercentage: normalizePercentage(structureDraft.listingCommissionPercentage, 7.5),
        listingCommissionAmount: structureDraft.listingCommissionType === 'fixed' ? Number(structureDraft.listingCommissionAmount || 0) : null,
        agentSplitPercentage,
        agencySplitPercentage: normalizePercentage(100 - agentSplitPercentage, 30),
        allowSalesCommissionOverride: Boolean(structureDraft.allowSalesCommissionOverride),
        isDefault: Boolean(structureDraft.isDefault),
        isActive: Boolean(structureDraft.isActive),
        notes: normalizeText(structureDraft.notes),
      })
      setMessage(structureDraft.id ? 'Commission template updated.' : 'Commission template created.')
      closeModal()
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save commission template.')
    } finally {
      setSaving(false)
    }
  }

  async function removeStructure(structure) {
    if (!canEdit || !structure?.id) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await removeOrganisationCommissionStructure(structure.id)
      setMessage('Commission template removed.')
      await loadData()
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove commission template.')
    } finally {
      setSaving(false)
    }
  }

  async function assignLevel(user, commissionLevelId) {
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await assignUserCommissionLevel({
        organisationUserId: user.id || '',
        userId: user.userId || user.user_id || '',
        email: user.email || '',
        commissionLevelId,
      })
      setMessage(commissionLevelId ? 'Agent commission level saved.' : 'Agent commission override removed.')
      closeModal()
      await loadData()
    } catch (assignError) {
      setError(assignError.message || 'Unable to assign commission level.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SettingsLoadingState label="Loading commission workspace..." />

  if (!canEdit) {
    return (
      <div className={settingsPageClass}>
        <TabRail activeTab={activeTab} setActiveTab={setActiveTab} />
        <SettingsBanner tone="warning">
          Access restricted. Only {administratorLabel} can view and manage agency commission rules.
        </SettingsBanner>
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <TabRail activeTab={activeTab} setActiveTab={setActiveTab} />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
      {validationWarnings.length ? (
        <SettingsBanner tone="warning">
          {validationWarnings.slice(0, 2).join(' ')}
        </SettingsBanner>
      ) : null}

      <main className="min-w-0">
        {activeTab === 'overview' ? (
          <CommissionOverviewDashboard
            levels={levels}
            referralRules={referralRules}
            structures={structures}
            assignableRows={assignableRows}
            defaultLevel={defaultLevel}
            setActiveTab={setActiveTab}
          />
        ) : null}

        {activeTab === 'levels' ? (
          <CommissionLevelsWorkspace
            levels={levels}
            openModal={openModal}
          />
        ) : null}

        {activeTab === 'agents' ? (
          <AgentsWorkspace
            rows={assignableRows}
            filters={overrideFilters}
            setFilters={setOverrideFilters}
            openModal={openModal}
          />
        ) : null}

        {activeTab === 'rules' ? (
          <BusinessRulesWorkspace
            referralRules={referralRules}
            referralDraft={referralDraft}
            setReferralDraft={setReferralDraft}
            updateReferralDraft={updateReferralDraft}
            saveReferral={saveReferral}
            structures={structures}
            openModal={openModal}
            removeStructure={removeStructure}
            saving={saving}
          />
        ) : null}
      </main>

      {modal.type === 'level' ? (
        <CommissionModal title={levelDraft.id ? 'Edit Commission Level' : 'New Commission Level'} description="Set agent split, agency split and targets for this commission level." onClose={closeModal} variant="drawer">
          <LevelEditor draft={levelDraft} updateDraft={updateLevelDraft} onSubmit={saveLevel} onCancel={closeModal} saving={saving} />
        </CommissionModal>
      ) : null}

      {modal.type === 'template' ? (
        <CommissionModal title={structureDraft.id ? 'Edit Template' : 'Create Template'} description="Define listing commission, split and default status." onClose={closeModal}>
          <TemplateEditor draft={structureDraft} updateDraft={updateStructureDraft} onSubmit={saveStructure} onCancel={closeModal} saving={saving} />
        </CommissionModal>
      ) : null}

      {modal.type === 'agent' ? (
        <CommissionModal title="Edit Commission" onClose={closeModal} variant="drawer">
          <AgentCommissionDrawer row={modal.payload} levels={levels} onAssign={assignLevel} onCancel={closeModal} saving={saving} />
        </CommissionModal>
      ) : null}

      {modal.type === 'history' ? (
        <CommissionModal title="Audit Trail" description="Commission changes record changed value, date and reason." onClose={closeModal}>
          <AuditTrail levels={levels} structures={structures} referralRules={referralRules} />
        </CommissionModal>
      ) : null}
    </div>
  )
}
