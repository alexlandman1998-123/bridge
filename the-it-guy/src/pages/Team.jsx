import { Building2, ChevronRight, Clock3, Mail, ShieldUser, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { APP_ROLE_LABELS } from '../lib/roles'
import { listDevelopmentTeamAssignments, listOrganisationUsers } from '../lib/settingsApi'

function formatRoleLabel(role) {
  const normalized = String(role || '').trim().toLowerCase()
  return APP_ROLE_LABELS[normalized] || normalized.replaceAll('_', ' ') || 'Viewer'
}

function formatStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return 'Unknown'
  return normalized.replaceAll('_', ' ')
}

function formatLastActive(value) {
  if (!value) {
    return 'Not tracked'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not tracked'
  }

  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function StatusPill({ tone = 'neutral', children }) {
  const classes = {
    success: 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]',
    warning: 'border-[#f6dec7] bg-[#fff7ed] text-[#b54708]',
    neutral: 'border-[#d7e3ef] bg-white text-[#51657b]',
  }

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${classes[tone] || classes.neutral}`}>
      {children}
    </span>
  )
}

export default function Team() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [developmentTeams, setDevelopmentTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [userRows, teamRows] = await Promise.all([
        listOrganisationUsers(),
        listDevelopmentTeamAssignments(),
      ])
      setUsers(userRows || [])
      setDevelopmentTeams(teamRows || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load team workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const teamStats = useMemo(() => {
    const activeUsers = users.filter((item) => item.status !== 'deactivated')
    const pendingInvites = users.filter((item) => item.status === 'invited')
    const roleCounts = activeUsers.reduce((accumulator, user) => {
      const key = String(user.role || 'viewer').trim().toLowerCase() || 'viewer'
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    }, {})

    const partnerTotals = developmentTeams.reduce(
      (accumulator, item) => {
        accumulator.agents += item.stakeholderTeams.agents.length
        accumulator.conveyancers += item.stakeholderTeams.conveyancers.length
        accumulator.bondOriginators += item.stakeholderTeams.bondOriginators.length
        if (
          item.stakeholderTeams.agents.length ||
          item.stakeholderTeams.conveyancers.length ||
          item.stakeholderTeams.bondOriginators.length
        ) {
          accumulator.coveredDevelopments += 1
        }
        return accumulator
      },
      { agents: 0, conveyancers: 0, bondOriginators: 0, coveredDevelopments: 0 },
    )

    return {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      pendingInvites: pendingInvites.length,
      coveredDevelopments: partnerTotals.coveredDevelopments,
      externalPartners:
        partnerTotals.agents + partnerTotals.conveyancers + partnerTotals.bondOriginators,
      roleCounts,
    }
  }, [developmentTeams, users])

  const roleMix = useMemo(() => {
    return Object.entries(teamStats.roleCounts)
      .map(([role, count]) => ({ role, count, label: formatRoleLabel(role) }))
      .sort((left, right) => right.count - left.count)
  }, [teamStats.roleCounts])

  return (
    <section className="min-w-0 space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Team Workspace</span>
            <h1 className="mt-3 text-[2.15rem] font-semibold tracking-[-0.04em] text-[#142132]">People, roles, and development coverage</h1>
            <p className="mt-3 text-[1rem] leading-7 text-[#6b7d93]">
              Keep your internal team visible, track role coverage, and see which developments already have agents, conveyancers, and bond originators allocated.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            <Button variant="secondary" onClick={() => navigate('/settings/users')}>
              <UserPlus size={16} />
              Manage Users
            </Button>
            <Button onClick={() => navigate('/developments')}>
              <Building2 size={16} />
              Open Developments
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
      ) : null}

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 lg:grid-cols-5">
          {[
            { label: 'Total Team', value: teamStats.totalUsers, icon: Users },
            { label: 'Active Users', value: teamStats.activeUsers, icon: ShieldUser },
            { label: 'Pending Invites', value: teamStats.pendingInvites, icon: UserPlus },
            { label: 'Developments Covered', value: teamStats.coveredDevelopments, icon: Building2 },
            { label: 'External Partners', value: teamStats.externalPartners, icon: ChevronRight },
          ].map((item) => {
            const Icon = item.icon
            return (
              <article key={item.label} className="rounded-[18px] border border-[#dde4ee] bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <span className="text-[0.95rem] font-medium tracking-[-0.01em] text-[#3b4f65]">{item.label}</span>
                  <Icon size={18} className="text-[#94a3b8]" aria-hidden="true" />
                </div>
                <strong className="block text-[1.7rem] font-semibold leading-none tracking-[-0.035em] text-[#142132]">{item.value}</strong>
              </article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Internal Team</h2>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Active users, role coverage, and invite status across your organisation.</p>
            </div>
            <Button variant="ghost" onClick={() => navigate('/settings/users')}>
              View User Settings
            </Button>
          </div>

          {loading ? <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">Loading team members…</p> : null}

          {!loading && !users.length ? (
            <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
              <p className="text-sm text-[#6b7d93]">No users have been invited yet.</p>
            </div>
          ) : null}

          {!loading && users.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {users.map((user) => (
                <article key={user.id || user.email} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block text-base font-semibold tracking-[-0.02em] text-[#142132]">{user.fullName || user.email}</strong>
                      <span className="mt-1 block text-sm text-[#6b7d93]">{formatRoleLabel(user.role)}</span>
                    </div>
                    <StatusPill tone={user.status === 'active' ? 'success' : user.status === 'invited' ? 'warning' : 'neutral'}>
                      {formatStatusLabel(user.status)}
                    </StatusPill>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-[#51657b]">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-[#8aa0b8]" />
                      <span className="truncate">{user.email || 'No email recorded'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 size={14} className="text-[#8aa0b8]" />
                      <span>Last active: {formatLastActive(user.lastActiveAt)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="grid gap-5">
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Role Mix</h2>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Quick read on whether the internal team is balanced across operating roles.</p>

            <div className="mt-4 grid gap-3">
              {roleMix.length ? (
                roleMix.map((item) => (
                  <article key={item.role} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[#22384c]">{item.label}</span>
                      <strong className="text-lg font-semibold text-[#142132]">{item.count}</strong>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">No active users to summarise yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Coverage Notes</h2>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Use this page to see who is on the organisation and which developments already have partner teams configured.</p>

            <div className="mt-4 space-y-3 text-sm leading-6 text-[#51657b]">
              <p>Internal users are managed through settings so invites, role changes, and deactivations stay controlled.</p>
              <p>External partner allocations are managed on each development and shown below as a coverage map.</p>
            </div>
          </section>
        </section>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Team Coverage</h2>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Partner teams configured per development for agent, conveyancing, and bond allocation.</p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/developments')}>
            Open Development Setup
          </Button>
        </div>

        {loading ? <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">Loading development allocations…</p> : null}

        {!loading && !developmentTeams.length ? (
          <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
            <p className="text-sm text-[#6b7d93]">No developments available yet.</p>
          </div>
        ) : null}

        {!loading && developmentTeams.length ? (
          <div className="divide-y divide-[#e9eff5] overflow-hidden rounded-[18px] border border-[#e3ebf4]">
            <div className="hidden grid-cols-[1.3fr_0.65fr_0.65fr_0.65fr_0.65fr] gap-4 bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] lg:grid">
              <span>Development</span>
              <span>Units</span>
              <span>Agents</span>
              <span>Conveyancers</span>
              <span>Bond Originators</span>
            </div>

            {developmentTeams.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/developments/${item.id}`)}
                className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#f8fbff] lg:grid-cols-[1.3fr_0.65fr_0.65fr_0.65fr_0.65fr] lg:items-center lg:gap-4"
              >
                <div className="space-y-1">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Development</span>
                  <strong className="text-sm text-[#162334]">{item.name}</strong>
                  <span className="block text-xs text-[#7b8ca2]">{item.code || 'No code assigned'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Units</span>
                  <span className="text-sm text-[#51657b]">{item.plannedUnits || 0}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Agents</span>
                  <span className="text-sm text-[#51657b]">{item.stakeholderTeams.agents.length}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Conveyancers</span>
                  <span className="text-sm text-[#51657b]">{item.stakeholderTeams.conveyancers.length}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Bond Originators</span>
                  <span className="text-sm text-[#51657b]">{item.stakeholderTeams.bondOriginators.length}</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}
