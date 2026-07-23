import {
  BadgePercent,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  Handshake,
  History,
  MoreHorizontal,
  Plus,
  Search,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  { key: 'levels', label: 'Commission Levels' },
  { key: 'business_rules', label: 'Business Rules' },
]

const INPUT_CLASS = 'h-11 rounded-[12px] border-[#d8e3ee] bg-white text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:ring-[#dff2e8]'
const LABEL_CLASS = 'text-[0.78rem] font-semibold text-[#43566d]'
const CARD_CLASS = 'rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)] sm:p-6'

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

function CommissionPageHeader({ openModal }) {
  return (
    <header className="flex flex-col gap-4 pb-1 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight text-[#17233a]">
          <span className="text-[#6b7d93]">Organisation</span>
          <ChevronRight className="h-4 w-4 text-[#9aa8b8]" strokeWidth={2} />
          <span>Commission</span>
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
          Manage how your agency pays its people: reusable levels, agent assignments, referral logic and operational exceptions.
        </p>
      </div>
      <button
        type="button"
        onClick={() => openModal('history')}
        className="inline-flex w-fit items-center gap-3 rounded-[14px] border border-[#dfe8f1] bg-white px-4 py-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.045)] transition hover:border-[#c8d6e4]"
      >
        <History className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
        <span>
          <span className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#7b8fa5]">Last Updated</span>
          <span className="block text-sm font-semibold text-[#17233a]">Recent · View History</span>
        </span>
      </button>
    </header>
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
    <div className="overflow-x-auto border-b border-[#dfe7f0]">
      <div className="flex min-w-max gap-2 py-1">
        {COMMISSION_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'h-10 rounded-[12px] px-3 text-sm font-semibold transition',
              activeTab === tab.key
                ? 'bg-[#eaf7f1] text-[#0f7f4f] shadow-[inset_0_0_0_1px_rgba(15,127,79,0.1)]'
                : 'text-[#52667d] hover:bg-white hover:text-[#17233a]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function KpiCard({ title, value, description, quickAction, onAction, children }) {
  return (
    <article className="flex min-h-[172px] flex-col rounded-[18px] border border-[#dfe8f1] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#ecfdf3] text-[#0f7f4f]">
          {children}
        </div>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#40566d]">{title}</h3>
      <p className="mt-2 text-[1.55rem] font-semibold leading-none text-[#17233a]">{value}</p>
      <p className="mt-2 text-sm leading-5 text-[#60758d]">{description}</p>
      {quickAction ? (
        <button type="button" onClick={onAction} className="mt-auto flex items-center justify-between border-t border-[#edf2f7] pt-3 text-sm font-semibold text-[#0f7f4f]">
          {quickAction}
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      ) : null}
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

function CommissionOverviewDashboard({ levels, referralRules, tracker, assignableRows, defaultLevel, setActiveTab, openModal, viewReports }) {
  const activeRules = referralRules.filter((rule) => rule.isActive !== false)
  const assigned = assignableRows.filter((row) => row.assignedLevelId).length
  const totalAgents = assignableRows.length
  const customLevels = levels.filter((level) => !['standard', 'senior', 'top_producer', 'principal'].includes(normalizeText(level.key).toLowerCase())).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#17233a]">Commission Overview</h2>
        <p className="mt-1 text-sm leading-6 text-[#60758d]">A complete snapshot of commission configuration, assignment coverage and current performance.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Agency Default Split" value={`${formatPercent(defaultLevel.agentPercentage, 70)} / ${formatPercent(defaultLevel.agencyPercentage, 30)}`} description="Agent / Agency" quickAction="Edit levels" onAction={() => setActiveTab('levels')}>
          <CircleDollarSign className="h-5 w-5" strokeWidth={2} />
        </KpiCard>
        <KpiCard title="Commission Levels" value={levels.length || 4} description={`${customLevels} custom level${customLevels === 1 ? '' : 's'}`} quickAction="Manage levels" onAction={() => setActiveTab('levels')}>
          <BadgePercent className="h-5 w-5" strokeWidth={2} />
        </KpiCard>
        <KpiCard title="Agents Assigned" value={`${assigned}/${totalAgents || 0}`} description={totalAgents ? 'Agents with explicit commission levels' : 'Invite agents before assigning levels'} quickAction="Assign agents" onAction={() => openModal('override')}>
          <UsersRound className="h-5 w-5" strokeWidth={2} />
        </KpiCard>
        <KpiCard title="Referral Rules" value={`${activeRules.length} Active`} description="Rules enabled" quickAction="Edit rules" onAction={() => setActiveTab('business_rules')}>
          <Handshake className="h-5 w-5" strokeWidth={2} />
        </KpiCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CommissionCard title="Commission Levels" description="Reusable agency pay structures shown the way principals assign them.">
          <div className="grid gap-3">
            {(levels.length ? levels : []).map((level) => (
              <button
                key={level.id || level.name}
                type="button"
                onClick={() => openModal('level', level)}
                className="group grid gap-3 rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4 text-left transition hover:border-[#bfd2e4] hover:bg-white md:grid-cols-[1fr_auto] md:items-center"
              >
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[#17233a]">{level.name}</span>
                    {level.isDefault ? <StatusPill tone="green">Default</StatusPill> : null}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[#60758d]">{getLevelDescription(level)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold text-[#0f7f4f]">{formatPercent(level.agentPercentage)} / {formatPercent(level.agencyPercentage)}</span>
                  <span className="text-sm font-semibold text-[#60758d]">{level.assignedAgentsCount || 0} Agents</span>
                  <MoreHorizontal className="h-4 w-4 text-[#8ca0b5] transition group-hover:text-[#17233a]" strokeWidth={2} />
                </span>
              </button>
            ))}
          </div>
        </CommissionCard>
        <MonthlyCommissionProgress tracker={tracker} onViewReports={viewReports} />
      </div>

      <CommissionHealth levels={levels} rows={assignableRows} referralRules={referralRules} tracker={tracker} defaultLevel={defaultLevel} />

      <CommissionCard title="Quick Actions" description="Common commission management tasks without leaving this workspace.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <IconButton onClick={() => openModal('override')}>
            <UsersRound className="h-4 w-4" strokeWidth={2} />
            Assign Agents
          </IconButton>
          <IconButton variant="primary" onClick={() => openModal('level')}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Create Level
          </IconButton>
          <IconButton onClick={() => setActiveTab('business_rules')}>
            <Handshake className="h-4 w-4" strokeWidth={2} />
            Add Referral Rule
          </IconButton>
          <IconButton onClick={() => openModal('override')}>
            <UsersRound className="h-4 w-4" strokeWidth={2} />
            Create Override
          </IconButton>
          <IconButton onClick={viewReports}>
            <TrendingUp className="h-4 w-4" strokeWidth={2} />
            View Reports
          </IconButton>
        </div>
      </CommissionCard>
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

function MonthlyCommissionProgress({ tracker, onViewReports }) {
  const targetAmount = Number(tracker?.targetAmount || 0)
  const projected = Number(tracker?.projectedCommission || tracker?.currentAmount || 0)
  const forecastPercent = targetAmount ? Math.min(100, Math.round((projected / targetAmount) * 100)) : Number(tracker?.projectedPercentage || 0)
  const remaining = Math.max(0, targetAmount - projected)

  return (
    <CommissionCard title="Monthly Commission Progress" description="Target progress now belongs with performance reporting.">
      <div className="space-y-5">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#7b8fa5]">Monthly Target</p>
          <p className="mt-2 text-3xl font-semibold text-[#17233a]">{formatCurrency(targetAmount || 500000)}</p>
        </div>
        <div>
          <div className="h-3 overflow-hidden rounded-full bg-[#dfe8f1]">
            <span className="block h-full rounded-full bg-[#0f7f4f]" style={{ width: `${Math.min(100, forecastPercent || 0)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#60758d]">
            <span>{forecastPercent || tracker?.projectedPercentage || 0}% Forecast</span>
            <span>{tracker?.daysLeftInMonth ?? 0} Days left</span>
          </div>
        </div>
        <div className="grid gap-3">
          <TargetMetric label="Forecast" value={formatCurrency(projected, { compact: true })} />
          <TargetMetric label="Remaining" value={formatCurrency(remaining, { compact: true })} />
        </div>
        <IconButton onClick={onViewReports}>
          <TrendingUp className="h-4 w-4" strokeWidth={2} />
          Open Performance
        </IconButton>
      </div>
    </CommissionCard>
  )
}

function CommissionHealth({ levels, rows, referralRules, tracker, defaultLevel }) {
  const assigned = rows.filter((row) => row.assignedLevelId).length
  const overrides = rows.filter((row) => row.assignedLevelId).length
  const activeRules = referralRules.filter((rule) => rule.isActive !== false).length
  const items = [
    { label: 'Default split', value: `${formatPercent(defaultLevel?.agentPercentage, 70)} / ${formatPercent(defaultLevel?.agencyPercentage, 30)}`, verified: true },
    { label: 'Assigned agents', value: assigned, verified: assigned > 0 },
    { label: 'Referral rules', value: activeRules, verified: activeRules > 0 },
    { label: 'Overrides', value: overrides, verified: true },
    { label: 'Target forecast', value: `${tracker?.projectedPercentage || 0}%`, verified: Number(tracker?.projectedPercentage || 0) >= 80 },
  ]

  return (
    <CommissionCard title="Commission Health" description={levels.length ? 'Everything configured' : 'Create commission levels to complete setup.'}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7b8fa5]">{item.label}</p>
            <p className="mt-2 inline-flex items-center gap-2 text-lg font-semibold text-[#17233a]">
              {item.verified ? <CheckCircle2 className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} /> : null}
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </CommissionCard>
  )
}

function CommissionLevelsWorkspace({ levels, assignableRows, openModal, assignLevel, saving }) {
  return (
    <div className="space-y-6">
      <CommissionCard
        title="Commission Levels"
        description="Reusable commission structures managed as operational business objects."
        actions={
          <IconButton variant="primary" onClick={() => openModal('level')}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Create Level
          </IconButton>
        }
      >
        {!levels.length ? (
          <SettingsEmptyState title="No Commission Levels Yet" description="Create your first commission level." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {levels.map((level) => (
              <button key={level.id || level.name} type="button" onClick={() => openModal('level', level)} className="group rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4 text-left transition hover:border-[#bfd2e4] hover:bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#17233a]">{level.name}</p>
                    <p className="mt-2 text-2xl font-semibold text-[#0f7f4f]">{formatPercent(level.agentPercentage)} / {formatPercent(level.agencyPercentage)}</p>
                  </div>
                  {level.isDefault ? <StatusPill tone="green">Default</StatusPill> : null}
                </div>
                <p className="mt-2 text-sm leading-5 text-[#60758d]">{getLevelDescription(level)}</p>
                <p className="mt-2 text-sm font-semibold text-[#60758d]">{level.assignedAgentsCount || 0} Agents</p>
                <div className="mt-4">
                  <SplitBar agent={level.agentPercentage} agency={level.agencyPercentage} />
                </div>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0f7f4f]">
                  <Edit3 className="h-4 w-4" strokeWidth={2} />
                  Edit Level
                </div>
              </button>
            ))}
          </div>
        )}
      </CommissionCard>

      <AgentAssignmentsTable rows={assignableRows} levels={levels} onAssign={assignLevel} saving={saving} />
    </div>
  )
}

function AgentAssignmentsTable({ rows, levels, onAssign, saving }) {
  return (
    <CommissionCard title="Agent Assignments" description="Assign a commission level to each agent. Agents can view their level and tracker but cannot edit rules.">
      {!rows.length ? (
        <SettingsEmptyState title="No active users yet" description="Invite users first, then assign their commission levels." />
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-[#dfe8f1] bg-white">
          <div className="hidden grid-cols-[1.1fr_1fr_0.7fr_1fr_0.9fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f8fbfe] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8da6] lg:grid">
            <span>Agent</span>
            <span>Level</span>
            <span>Split</span>
            <span>Monthly Commission</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-[#e9eff5]">
            {rows.map((row) => (
              <div key={row.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.1fr_1fr_0.7fr_1fr_0.9fr_0.8fr] lg:items-center lg:gap-4">
                <div>
                  <strong className="text-sm text-[#17233a]">{row.name}</strong>
                  <p className="mt-1 text-xs text-[#60758d]">{row.email}</p>
                </div>
                <Field as="select" value={row.assignedLevelId || ''} className={`${INPUT_CLASS} py-2.5`} disabled={saving} onChange={(event) => onAssign(row.user, event.target.value)}>
                  <option value="">Use default</option>
                  {levels.filter((level) => level.isActive !== false).map((level) => (
                    <option key={level.id} value={level.id}>{level.name}</option>
                  ))}
                </Field>
                <span className="text-sm font-semibold text-[#17233a]">{formatPercent(row.agentPercentage)} / {formatPercent(row.agencyPercentage)}</span>
                <span className="text-sm font-semibold text-[#17233a]">{formatCurrency(row.monthlyCommission || 0, { compact: true })}</span>
                <StatusPill tone={row.assignedLevelId ? 'green' : 'neutral'}>{row.assignedLevelId ? 'Assigned' : 'Default'}</StatusPill>
                <div className="flex flex-wrap gap-2">
                  <IconButton disabled={saving} onClick={() => onAssign(row.user, row.assignedLevelId || row.effectiveLevelId)}>
                    Assign
                  </IconButton>
                  <IconButton disabled={saving || !row.assignedLevelId} onClick={() => onAssign(row.user, '')}>
                    Remove
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
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
              <ChevronRight className="mx-auto h-4 w-4 text-[#9aa8b8]" strokeWidth={2} />
              <span className="rounded-[14px] bg-white p-3">{referralDraft.name || 'Same Branch'}</span>
              <ChevronRight className="mx-auto h-4 w-4 text-[#9aa8b8]" strokeWidth={2} />
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
  assignableRows,
  levels,
  filters,
  setFilters,
  onAssign,
  saving,
}) {
  return (
    <div className="space-y-6">
      <CommissionCard title="Business Rules" description="Referral rules, overrides and templates are managed together because they all shape commission logic.">
        <div className="grid gap-3 md:grid-cols-3">
          <TargetMetric label="Referral Rules" value={`${referralRules.filter((rule) => rule.isActive !== false).length} Active`} />
          <TargetMetric label="Overrides" value={`${assignableRows.filter((row) => row.assignedLevelId).length} Agents`} />
          <TargetMetric label="Templates" value={`${structures.length} Reusable`} />
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

      <SimplifiedOverridesWorkflow
        rows={assignableRows}
        levels={levels}
        filters={filters}
        setFilters={setFilters}
        onAssign={onAssign}
        saving={saving}
      />

      <TemplatesWorkspace structures={structures} openModal={openModal} removeStructure={removeStructure} saving={saving} />
    </div>
  )
}

function SimplifiedOverridesWorkflow({ rows, levels, filters, setFilters, onAssign, saving }) {
  const filteredRows = rows.filter((row) => {
    const search = normalizeText(filters.search).toLowerCase()
    const matchesSearch = !search || `${row.name} ${row.email}`.toLowerCase().includes(search)
    const matchesLevel = !filters.level || row.effectiveLevelId === filters.level || row.assignedLevelId === filters.level
    return matchesSearch && matchesLevel
  })
  const selectedRow = filteredRows[0] || rows[0] || null
  const [overrideDraft, setOverrideDraft] = useState({ agentKey: '', levelId: '' })
  const activeRow = rows.find((row) => row.key === overrideDraft.agentKey) || selectedRow
  const activeLevelId = overrideDraft.agentKey === activeRow?.key && overrideDraft.levelId
    ? overrideDraft.levelId
    : activeRow?.assignedLevelId || activeRow?.effectiveLevelId || levels[0]?.id || ''

  function submitOverride(event) {
    event.preventDefault()
    if (activeRow) onAssign(activeRow.user, activeLevelId)
  }

  return (
    <CommissionCard title="Overrides" description="Search one person, review their current level, choose an override and save.">
      <form className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" onSubmit={submitOverride}>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8fa0b4]" strokeWidth={2} />
              <Field className={`${INPUT_CLASS} pl-9`} placeholder="Search Agent" value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} />
            </div>
            <Field as="select" className={INPUT_CLASS} value={filters.level} onChange={(event) => setFilters((previous) => ({ ...previous, level: event.target.value }))}>
              <option value="">All Levels</option>
              {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
            </Field>
          </div>
          <div className="max-h-[340px] overflow-y-auto rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-2">
            {filteredRows.length ? filteredRows.slice(0, 12).map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => setOverrideDraft({
                  agentKey: row.key,
                  levelId: row.assignedLevelId || row.effectiveLevelId || levels[0]?.id || '',
                })}
                className={`flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-3 text-left transition ${activeRow?.key === row.key ? 'bg-white text-[#0f7f4f] shadow-[0_6px_14px_rgba(15,23,42,0.05)]' : 'text-[#40566d] hover:bg-white'}`}
              >
                <span>
                  <span className="block text-sm font-semibold">{row.name}</span>
                  <span className="block text-xs text-[#60758d]">{row.email}</span>
                </span>
                <StatusPill tone={row.assignedLevelId ? 'green' : 'neutral'}>{row.levelName}</StatusPill>
              </button>
            )) : <SettingsEmptyState title="No agents found" description="Try a different name, email, or level filter." />}
          </div>
        </div>

        <div className="rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
          <p className="text-sm font-semibold text-[#17233a]">Agent Lookup</p>
          <div className="mt-4 grid gap-4">
            <TargetMetric label="Agent" value={activeRow?.name || 'Select an agent'} />
            <TargetMetric label="Current Level" value={activeRow?.levelName || 'None'} />
            <FieldLabel label="Override" id="business-rule-override-level">
              <Field
                as="select"
                id="business-rule-override-level"
                className={INPUT_CLASS}
                value={activeLevelId}
                onChange={(event) => setOverrideDraft((previous) => ({ ...previous, agentKey: activeRow?.key || previous.agentKey, levelId: event.target.value }))}
              >
                {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
              </Field>
            </FieldLabel>
            <div className="grid gap-3 md:grid-cols-2">
              <TargetMetric label="Effective" value="Today" />
              <TargetMetric label="Expiry" value="None" />
            </div>
            <div className="flex justify-end">
              <IconButton variant="primary" type="submit" disabled={saving || !activeRow || !activeLevelId}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                {saving ? 'Saving...' : 'Save Override'}
              </IconButton>
            </div>
          </div>
        </div>
      </form>
    </CommissionCard>
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

function OverrideEditor({ rows, levels, selectedRow, onAssign, onCancel, saving }) {
  const [agentKey, setAgentKey] = useState(selectedRow?.key || rows[0]?.key || '')
  const [levelId, setLevelId] = useState(selectedRow?.assignedLevelId || selectedRow?.effectiveLevelId || levels[0]?.id || '')
  const row = rows.find((item) => item.key === agentKey) || selectedRow || rows[0]
  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault()
      if (row) onAssign(row.user, levelId)
    }}>
      <FieldLabel label="Agent" id="override-agent">
        <Field as="select" id="override-agent" className={INPUT_CLASS} value={agentKey} onChange={(event) => setAgentKey(event.target.value)}>
          {rows.map((item) => <option key={item.key} value={item.key}>{item.name} - {item.email}</option>)}
        </Field>
      </FieldLabel>
      <FieldLabel label="Level" id="override-level">
        <Field as="select" id="override-level" className={INPUT_CLASS} value={levelId} onChange={(event) => setLevelId(event.target.value)}>
          {levels.map((level) => <option key={level.id} value={level.id}>{level.name} ({formatPercent(level.agentPercentage)} / {formatPercent(level.agencyPercentage)})</option>)}
        </Field>
      </FieldLabel>
      <div className="rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
        <p className="text-sm font-semibold text-[#17233a]">Override Preview</p>
        <p className="mt-2 text-sm text-[#60758d]">{row?.name || 'Agent'} will use the selected commission level from today. Expiry can be added once dated overrides are enabled.</p>
      </div>
      <div className="flex justify-end gap-2">
        <IconButton onClick={onCancel}>Cancel</IconButton>
        <IconButton variant="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Override'}</IconButton>
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
  const navigate = useNavigate()
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
  const tracker = useMemo(() => overview?.companyTracker || {}, [overview?.companyTracker])
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
        <CommissionPageHeader openModal={openModal} />
        <SettingsBanner tone="warning">
          Access restricted. Only {administratorLabel} can view and manage agency commission rules.
        </SettingsBanner>
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <CommissionPageHeader openModal={openModal} />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
      {validationWarnings.length ? (
        <SettingsBanner tone="warning">
          {validationWarnings.slice(0, 2).join(' ')}
        </SettingsBanner>
      ) : null}

      <TabRail activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="min-w-0">
        {activeTab === 'overview' ? (
          <CommissionOverviewDashboard
            levels={levels}
            referralRules={referralRules}
            tracker={tracker}
            assignableRows={assignableRows}
            defaultLevel={defaultLevel}
            setActiveTab={setActiveTab}
            openModal={openModal}
            viewReports={() => navigate('/reports?view=performance')}
          />
        ) : null}

        {activeTab === 'levels' ? (
          <CommissionLevelsWorkspace
            levels={levels}
            assignableRows={assignableRows}
            openModal={openModal}
            assignLevel={assignLevel}
            saving={saving}
          />
        ) : null}

        {activeTab === 'business_rules' ? (
          <BusinessRulesWorkspace
            referralRules={referralRules}
            referralDraft={referralDraft}
            setReferralDraft={setReferralDraft}
            updateReferralDraft={updateReferralDraft}
            saveReferral={saveReferral}
            structures={structures}
            openModal={openModal}
            removeStructure={removeStructure}
            assignableRows={assignableRows}
            levels={levels}
            filters={overrideFilters}
            setFilters={setOverrideFilters}
            onAssign={assignLevel}
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

      {modal.type === 'override' ? (
        <CommissionModal title="Add Override" description="Assign or change an agent commission level." onClose={closeModal}>
          <OverrideEditor rows={assignableRows} levels={levels} selectedRow={modal.payload} onAssign={assignLevel} onCancel={closeModal} saving={saving} />
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
