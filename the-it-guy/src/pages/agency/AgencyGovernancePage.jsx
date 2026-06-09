import { createElement, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Crown,
  GitBranch,
  ShieldCheck,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../lib/settingsApi'
import { getBranches } from '../../services/agencyBranchService'
import {
  AGENCY_AUTHORITY_ACTIONS,
  AGENCY_AUTHORITY_MATRIX,
  getAgencyAuthorityLabel,
  getAgencyAuthorityLevel,
  normalizeAgencyAuthorityRole,
} from '../../services/agencyAuthorityService'

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getMemberName(member = {}) {
  return normalizeText(member.fullName || `${member.firstName || ''} ${member.lastName || ''}`) || member.email || 'Workspace member'
}

function getInitials(member = {}) {
  return getMemberName(member)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function roleTone(authorityRole = '') {
  if (authorityRole === 'owner') return 'border-[#d8c690] bg-[#fff9e8] text-[#7a5210]'
  if (authorityRole === 'principal') return 'border-[#bfd2ef] bg-[#edf5ff] text-[#164f91]'
  if (authorityRole === 'branch_manager') return 'border-[#bee5cf] bg-[#ecfdf3] text-[#176c3a]'
  if (authorityRole === 'team_lead') return 'border-[#d9d0f2] bg-[#f5f1ff] text-[#5943a5]'
  if (authorityRole === 'agent') return 'border-[#dfe7f1] bg-[#f8fbff] text-[#526981]'
  return 'border-[#e5e7eb] bg-white text-[#6b7280]'
}

function actionLabel(action = '') {
  return action
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function GovernanceKpi({ label, value, helper, Icon: IconComponent, tone }) {
  return (
    <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
          {createElement(IconComponent, { size: 20 })}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#71859c]">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#10243a]">{value}</p>
          <p className="mt-1 text-xs text-[#6f839a]">{helper}</p>
        </div>
      </div>
    </article>
  )
}

function MemberRow({ member, branchName }) {
  const authorityRole = normalizeAgencyAuthorityRole(member.role)
  return (
    <div className="grid gap-3 rounded-2xl border border-[#e3ebf4] bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1.2fr)_180px_160px_130px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0f2742] text-sm font-semibold text-white">
          {getInitials(member)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#10243a]">{getMemberName(member)}</p>
          <p className="truncate text-xs text-[#60758d]">{member.email || 'No email recorded'}</p>
        </div>
      </div>
      <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${roleTone(authorityRole)}`}>
        {getAgencyAuthorityLabel(member.role)}
      </span>
      <span className="text-sm font-semibold text-[#294159]">{branchName || 'All branches'}</span>
      <span className="text-xs text-[#71859c]">Since {formatDate(member.acceptedAt || member.invitedAt)}</span>
    </div>
  )
}

export default function AgencyGovernancePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(null)
  const [members, setMembers] = useState([])
  const [branches, setBranches] = useState([])

  useEffect(() => {
    let active = true
    async function loadGovernance() {
      try {
        setLoading(true)
        setError('')
        const [settingsResult, usersResult, branchResult] = await Promise.all([
          fetchOrganisationSettings(),
          listOrganisationUsers(),
          getBranches().catch(() => []),
        ])
        if (!active) return
        setSettings(settingsResult)
        setMembers(Array.isArray(usersResult) ? usersResult : [])
        setBranches(Array.isArray(branchResult) ? branchResult : [])
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load governance controls.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadGovernance()
    return () => {
      active = false
    }
  }, [])

  const branchNameById = useMemo(() => {
    const map = new Map()
    branches.forEach((branch) => {
      map.set(normalizeText(branch.id || branch.branchId), normalizeText(branch.name || branch.branchName || branch.location || 'Branch'))
    })
    return map
  }, [branches])

  const authorityGroups = useMemo(() => {
    const grouped = {
      owner: [],
      principal: [],
      branch_manager: [],
      team_lead: [],
      agent: [],
      viewer: [],
    }
    members.forEach((member) => {
      const role = normalizeAgencyAuthorityRole(member.role)
      grouped[role]?.push(member)
    })
    Object.values(grouped).forEach((rows) => rows.sort((left, right) => getMemberName(left).localeCompare(getMemberName(right))))
    return grouped
  }, [members])

  const matrixActions = [
    AGENCY_AUTHORITY_ACTIONS.inviteAgent,
    AGENCY_AUTHORITY_ACTIONS.transferAgent,
    AGENCY_AUTHORITY_ACTIONS.promoteUser,
    AGENCY_AUTHORITY_ACTIONS.removePrincipal,
    AGENCY_AUTHORITY_ACTIONS.manageBranches,
    AGENCY_AUTHORITY_ACTIONS.reassignAssets,
    AGENCY_AUTHORITY_ACTIONS.deleteOrganisation,
    AGENCY_AUTHORITY_ACTIONS.manageBilling,
  ]
  const matrixRoles = ['owner', 'principal', 'branch_manager', 'team_lead', 'agent']
  const organisationName = settings?.organisation?.name || 'Agency'
  const activeMembers = members.filter((member) => String(member.status || '').toLowerCase() === 'active')

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#60758d]">Agency / Governance</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#10243a]">{organisationName} Governance</h1>
          <p className="mt-1 text-sm text-[#61778f]">Authority hierarchy, role controls and operational governance for the agency.</p>
        </div>
        <Button type="button" variant="secondary">Export Matrix</Button>
      </div>

      {error ? <div className="rounded-2xl border border-[#f3d1d1] bg-[#fff6f6] px-4 py-3 text-sm font-semibold text-[#b42318]">{error}</div> : null}
      {loading ? <div className="rounded-2xl border border-[#dde6f1] bg-white px-5 py-6 text-sm text-[#647a92]">Loading governance…</div> : null}

      {!loading ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <GovernanceKpi label="Owners" value={authorityGroups.owner.length} helper="Final authority" Icon={Crown} tone="bg-[#fff6db] text-[#8a5a08]" />
            <GovernanceKpi label="Principals" value={authorityGroups.principal.length} helper="Agency operators" Icon={ShieldCheck} tone="bg-[#edf5ff] text-[#1769d1]" />
            <GovernanceKpi label="Branch Managers" value={authorityGroups.branch_manager.length} helper="Branch authority" Icon={GitBranch} tone="bg-[#ecfdf3] text-[#16894f]" />
            <GovernanceKpi label="Active Members" value={activeMembers.length} helper="Current access" Icon={Users} tone="bg-[#f5f1ff] text-[#6a4cc2]" />
          </section>

          <section className="rounded-3xl border border-[#dde6f1] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-[#edf2f7] pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#10243a]">Authority Hierarchy</h2>
                <p className="mt-1 text-sm text-[#61778f]">Owner → Principal → Branch Manager → Team Lead → Agent.</p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#526981]">
                {members.length} members
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {['owner', 'principal', 'branch_manager', 'team_lead', 'agent'].map((role) => (
                <div key={role} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#10243a]">{getAgencyAuthorityLabel(role)}</h3>
                    <span className="text-xs font-semibold text-[#71859c]">Level {getAgencyAuthorityLevel(role)}</span>
                  </div>
                  {authorityGroups[role]?.length ? authorityGroups[role].map((member) => (
                    <MemberRow
                      key={member.id || member.email}
                      member={member}
                      branchName={branchNameById.get(normalizeText(member.branchId || member.branch_id))}
                    />
                  )) : (
                    <div className="rounded-2xl border border-dashed border-[#d9e4ef] bg-[#fbfdff] px-4 py-3 text-sm text-[#6f839a]">No {getAgencyAuthorityLabel(role).toLowerCase()} assigned.</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-[#dde6f1] bg-white shadow-sm">
            <div className="border-b border-[#edf2f7] px-5 py-4">
              <h2 className="text-lg font-semibold text-[#10243a]">Authority Matrix</h2>
              <p className="mt-1 text-sm text-[#61778f]">Visibility is separate from control. These actions define who may govern the agency.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[#f8fbff] text-xs font-semibold uppercase tracking-[0.1em] text-[#71859c]">
                  <tr>
                    <th className="px-5 py-3">Action</th>
                    {matrixRoles.map((role) => <th key={role} className="px-4 py-3">{getAgencyAuthorityLabel(role)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {matrixActions.map((action) => (
                    <tr key={action}>
                      <td className="px-5 py-3 font-semibold text-[#20364d]">{actionLabel(action)}</td>
                      {matrixRoles.map((role) => {
                        const allowed = Boolean(AGENCY_AUTHORITY_MATRIX[action]?.[role])
                        return (
                          <td key={`${action}-${role}`} className="px-4 py-3">
                            {allowed ? <CheckCircle2 size={18} className="text-[#16a365]" /> : <XCircle size={18} className="text-[#c7d1dd]" />}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
              <Building2 size={20} className="text-[#1769d1]" />
              <h3 className="mt-3 text-sm font-semibold text-[#10243a]">Enterprise Ready Shape</h3>
              <p className="mt-2 text-sm leading-6 text-[#61778f]">The hierarchy leaves room for future HQ, region, branch, team and agent structures without changing the current agency model.</p>
            </article>
            <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
              <UserCog size={20} className="text-[#16894f]" />
              <h3 className="mt-3 text-sm font-semibold text-[#10243a]">Controlled Escalation</h3>
              <p className="mt-2 text-sm leading-6 text-[#61778f]">Self-promotion is blocked, principals cannot remove owners, and branch authority stays branch-scoped.</p>
            </article>
            <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
              <ShieldCheck size={20} className="text-[#6a4cc2]" />
              <h3 className="mt-3 text-sm font-semibold text-[#10243a]">Audit First</h3>
              <p className="mt-2 text-sm leading-6 text-[#61778f]">Promotion, demotion and deactivation actions write governance audit events for traceability.</p>
            </article>
          </section>
        </>
      ) : null}
    </section>
  )
}
