import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleGauge,
  ClipboardList,
  GitBranch,
  Layers3,
  UserPlus,
  Users,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
import {
  BRANCH_MANAGER_GOVERNANCE_RULES,
  BRANCH_OWNERSHIP_AWARENESS_MATRIX,
  buildBranchCommandCentreModel,
  getBranchCommandCentre,
} from '../../services/branchManagerOperatingService'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value) {
  const amount = toNumber(value)
  if (amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(value) {
  if (!value) return 'No recent activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getToneClasses(tone = 'slate') {
  return {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    gold: 'border-amber-200 bg-amber-50 text-amber-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-700'
}

function KpiTile({ label, value, helper, icon, tone = 'blue' }) {
  return (
    <article className="rounded-[18px] border border-[#dfe8f1] bg-white p-4 shadow-[0_10px_28px_rgba(24,45,68,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-[13px] ${getToneClasses(tone)}`}>
          {createElement(icon, { size: 16 })}
        </span>
      </div>
      <strong className="mt-3 block text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{value}</strong>
      <p className="mt-1 text-sm font-medium leading-5 text-[#64778c]">{helper}</p>
    </article>
  )
}

function HealthRing({ score = 0, status = 'Stable', tone = 'blue' }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)))
  const color = {
    green: '#10a466',
    blue: '#2563eb',
    gold: '#d39019',
    orange: '#ea580c',
    red: '#dc2626',
    slate: '#64748b',
  }[tone] || '#2563eb'

  return (
    <div className="flex items-center gap-4">
      <div
        className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${safeScore * 3.6}deg, #e8eef6 0deg)` }}
      >
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white">
          <span className="text-2xl font-semibold tracking-[-0.05em] text-[#102236]">{safeScore}</span>
        </div>
      </div>
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Branch Health</p>
        <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#102236]">{status}</h3>
        <p className="mt-1 text-sm leading-6 text-[#64778c]">Balanced from agents, listings, transactions, conversion and pipeline.</p>
      </div>
    </div>
  )
}

function EmptyState({ title, copy }) {
  return (
    <section className="rounded-[22px] border border-dashed border-[#cfdbea] bg-white p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] bg-[#edf4fb] text-[#315f8f]">
        <Building2 size={22} />
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#64778c]">{copy}</p>
    </section>
  )
}

export default function BranchCommandCentrePage() {
  const navigate = useNavigate()
  const [model, setModel] = useState(() => buildBranchCommandCentreModel([]))
  const [actor, setActor] = useState(null)
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const settings = await fetchOrganisationSettings().catch(() => null)
        const currentActor = {
          id: settings?.profile?.id || '',
          userId: settings?.profile?.id || '',
          email: settings?.profile?.email || '',
          role: settings?.membershipRole || 'viewer',
          membershipRole: settings?.membershipRole || 'viewer',
          branchId: settings?.membershipBranchId || settings?.membershipPrimaryBranchId || '',
          primaryBranchId: settings?.membershipPrimaryBranchId || settings?.membershipBranchId || '',
        }
        const nextModel = await getBranchCommandCentre(currentActor)
        if (cancelled) return
        setActor(currentActor)
        setModel(nextModel)
        setSelectedBranchId((current) => current || nextModel.branches?.[0]?.id || '')
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load the branch command centre.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedBranch = useMemo(() => {
    return model.branches.find((branch) => branch.id === selectedBranchId) || model.branches[0] || null
  }, [model.branches, selectedBranchId])

  const teamRows = selectedBranch?.teamRows || []
  const attentionItems = selectedBranch?.attentionItems || []
  const highestWorkload = teamRows.slice().sort((left, right) =>
    (right.leads + right.listings + right.transactions) - (left.leads + left.listings + left.transactions),
  )[0]
  const lowestHealthBranch = model.attentionBranches[0] || selectedBranch
  const actorRole = actor?.membershipRole || 'viewer'
  const isBranchScoped = actorRole === 'branch_manager'

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-36 animate-pulse rounded-[24px] bg-[#edf3f9]" />
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-[18px] bg-[#edf3f9]" />)}
        </div>
      </section>
    )
  }

  if (error) {
    return <p className="rounded-[16px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</p>
  }

  if (!model.branches.length) {
    return (
      <EmptyState
        title="No branch workspace available"
        copy={isBranchScoped ? 'This branch manager does not have an assigned branch yet, so Bridge is withholding branch data by default.' : 'Create or assign a branch before using the command centre.'}
      />
    )
  }

  return (
    <section className="space-y-4">
      <section className="rounded-[24px] border border-[#dfe8f1] bg-white p-5 shadow-[0_16px_40px_rgba(24,45,68,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Agency Operations</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">Branch Command Centre</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">
              Manage agents, listings, leads and transactions inside the branch layer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {model.branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => setSelectedBranchId(branch.id)}
                className={`min-h-[40px] rounded-[13px] border px-3 text-sm font-semibold transition ${
                  selectedBranch?.id === branch.id
                    ? 'border-[#163247] bg-[#163247] text-white shadow-[0_10px_22px_rgba(22,50,71,0.18)]'
                    : 'border-[#dbe5ef] bg-white text-[#40566e] hover:bg-[#f8fbff]'
                }`}
              >
                {branch.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Health Score" value={model.averageHealth} helper={isBranchScoped ? 'Your branch' : `${model.activeBranches.length} active branches`} icon={CircleGauge} tone={selectedBranch?.health?.tone || 'blue'} />
        <KpiTile label="Agents" value={model.totals.agents} helper="Active branch agents" icon={Users} tone="blue" />
        <KpiTile label="Leads" value={model.totals.leads} helper="Open branch pipeline" icon={ClipboardList} tone="gold" />
        <KpiTile label="Listings" value={model.totals.listings} helper="Active inventory" icon={Building2} tone="slate" />
        <KpiTile label="Pipeline" value={formatCurrency(model.totals.pipelineValue)} helper={`${model.totals.transactions} active transactions`} icon={BriefcaseBusiness} tone="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <HealthRing score={selectedBranch?.health?.score} status={selectedBranch?.health?.status} tone={selectedBranch?.health?.tone} />
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => navigate(`/agency/branches/${encodeURIComponent(selectedBranch.id)}`)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] bg-[#163247] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,50,71,0.18)]"
              >
                Open Branch
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/agency/agents')}
                disabled={!model.permissions.canInviteAgents}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] border border-[#dce6f1] bg-white px-4 text-sm font-semibold text-[#263f58] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus size={15} />
                Assign Agent
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Branch Manager</p>
              <p className="mt-2 text-sm font-semibold text-[#102236]">{selectedBranch.principalName || 'Not assigned'}</p>
            </div>
            <div className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Highest Workload</p>
              <p className="mt-2 text-sm font-semibold text-[#102236]">{highestWorkload?.name || 'No active agent workload'}</p>
            </div>
            <div className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Action Rights</p>
              <p className="mt-2 text-sm font-semibold text-[#102236]">{model.permissions.canReassignAssets ? 'Can reassign branch assets' : 'Read-only branch operation'}</p>
            </div>
          </div>
        </article>

        <article className={`rounded-[22px] border p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)] ${attentionItems.length ? 'border-orange-200 bg-orange-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Attention Required</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{attentionItems.length ? lowestHealthBranch?.name || selectedBranch.name : 'Branch operating cleanly'}</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-white text-orange-700 shadow-sm">
              {attentionItems.length ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {(attentionItems.length ? attentionItems : [{ label: 'No immediate operational blockers', action: 'Keep monitoring branch health', severity: 'ok' }]).map((item) => (
              <div key={`${item.label}-${item.action}`} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/70 bg-white px-3 py-2 text-sm">
                <span className="font-semibold text-[#20364f]">{item.label}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.action}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Branch Team</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Workload Control</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/agency/branches/${encodeURIComponent(selectedBranch.id)}`)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-[13px] border border-[#dce6f1] bg-white px-3 text-sm font-semibold text-[#263f58]"
            >
              Review Reassignment
              <GitBranch size={15} />
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-[16px] border border-[#e2eaf3]">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-[#f7faff] text-left text-[0.68rem] uppercase tracking-[0.12em] text-[#6f839a]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 font-semibold">Leads</th>
                  <th className="px-4 py-3 font-semibold">Listings</th>
                  <th className="px-4 py-3 font-semibold">Transactions</th>
                  <th className="px-4 py-3 font-semibold">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] bg-white text-[#223449]">
                {(teamRows.length ? teamRows : [{ id: 'empty', name: 'No active branch agents', role: 'Assign agents to this branch', leads: 0, listings: 0, transactions: 0 }]).map((agent) => (
                  <tr key={agent.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#102236]">{agent.name}</p>
                      <p className="text-xs text-[#6f839a]">{agent.role}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{agent.leads}</td>
                    <td className="px-4 py-3 font-semibold">{agent.listings}</td>
                    <td className="px-4 py-3 font-semibold">{agent.transactions}</td>
                    <td className="px-4 py-3 text-[#60758b]">{formatDate(agent.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Governance</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Manager Boundaries</h2>
          <div className="mt-4 space-y-2">
            {BRANCH_MANAGER_GOVERNANCE_RULES.map((rule) => (
              <div key={rule.action} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-2 text-sm">
                <span className="font-semibold text-[#20364f]">{rule.action}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rule.allowed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {rule.allowed ? 'Allowed' : 'Blocked'}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Branch Assets</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Branch Ownership Coverage</h2>
          <div className="mt-4 space-y-2">
            {BRANCH_OWNERSHIP_AWARENESS_MATRIX.map((row) => (
              <div key={row.object} className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[#20364f]">{row.object}</span>
                  <span className="rounded-full bg-[#edf4fb] px-2.5 py-1 text-xs font-semibold text-[#315f8f]">{row.status.replaceAll('_', ' ')}</span>
                </div>
                <p className="mt-1 text-xs font-medium text-[#6f839a]">{row.branchField}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Performance Intelligence</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Branch Ranking</h2>
            </div>
            <BarChart3 size={20} className="text-[#315f8f]" />
          </div>
          <div className="mt-4 grid gap-3">
            {model.topBranches.map((branch, index) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => setSelectedBranchId(branch.id)}
                className="grid gap-3 rounded-[16px] border border-[#e2eaf3] bg-[#fbfdff] p-3 text-left transition hover:border-[#bdd0e4] md:grid-cols-[52px_1fr_120px_96px]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#edf4fb] text-sm font-bold text-[#315f8f]">#{index + 1}</span>
                <span>
                  <span className="block font-semibold text-[#102236]">{branch.name}</span>
                  <span className="text-xs font-medium text-[#6f839a]">{branch.location || 'Location pending'}</span>
                </span>
                <span className="font-semibold text-[#102236]">{formatCurrency(branch.kpis?.pipelineValue)}</span>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${getToneClasses(branch.health.tone)}`}>{branch.health.score} {branch.health.status}</span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] p-4 text-sm leading-6 text-[#60758b]">
        <div className="flex items-start gap-3">
          <Layers3 size={18} className="mt-0.5 shrink-0 text-[#315f8f]" />
          <p>
            Branch command data is calculated from existing branches, organisation users, leads, private listings and transactions. RLS remains the enforcement layer; this screen adds branch-manager operating visibility without adding new ownership fields.
          </p>
        </div>
      </section>
    </section>
  )
}
