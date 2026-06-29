import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Inbox,
  Mail,
  RefreshCw,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../lib/settingsApi'
import {
  buildLeadCaptureStatusRows,
  ensureDefaultLeadCaptureAliases,
  ensureLeadCaptureAliasesForUsers,
  getLeadCaptureSetupStatus,
  LEAD_CAPTURE_SOURCES,
  listInboundLeadEmails,
  listLeadCaptureAliases,
  listLeadParseFailures,
} from '../../services/leadEmailCaptureService'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsCardClass,
  settingsPageClass,
} from './settingsUi'

const STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  test_received: { label: 'Test Received', tone: 'blue' },
  addresses_generated: { label: 'Ready', tone: 'warning' },
  not_started: { label: 'Not Started', tone: 'slate' },
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function formatDateTime(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function statusToneClass(tone = 'slate') {
  if (tone === 'success') return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  if (tone === 'blue') return 'border-[#c9ddf3] bg-[#f3f8fe] text-[#255e96]'
  if (tone === 'warning') return 'border-[#f4dfa8] bg-[#fff9ed] text-[#9a6408]'
  return 'border-[#dce5ef] bg-[#f7f9fc] text-[#5f7288]'
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_started
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClass(meta.tone)}`}>
      {meta.label}
    </span>
  )
}

function IconButton({ label, icon: Icon, onClick, disabled = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#d7e2ee] bg-white text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon size={15} />
    </button>
  )
}

function PrimaryButton({ children, onClick, disabled = false, icon: Icon = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#244b76] bg-[#274e7a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f4167] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, disabled = false, icon: Icon = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#d7e2ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  )
}

function AliasAddressRow({ alias, onCopy }) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[#162334]">{alias.source || 'General'}</span>
          <span className="rounded-full border border-[#dfe7f0] bg-[#f8fbfe] px-2 py-0.5 text-xs font-semibold text-[#6a7b90]">{alias.routingLevel}</span>
        </div>
        <p className="mt-1 break-all font-mono text-sm text-[#35546c]">{alias.emailAddress}</p>
      </div>
      <IconButton label={`Copy ${alias.source || 'lead'} address`} icon={Copy} onClick={() => onCopy(alias.emailAddress)} />
    </div>
  )
}

function AgentStatusRow({ row, onCopy }) {
  const primaryAlias = row.aliases.find((alias) => alias.source === 'General') || row.aliases[0] || null
  return (
    <tr className="border-t border-[#e8eef5] align-top">
      <td className="px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
            {row.role === 'agency' ? <UsersRound size={16} /> : <UserRound size={16} />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[#162334]">{row.name}</p>
            {row.email ? <p className="truncate text-sm text-[#6b7d93]">{row.email}</p> : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <StatusPill status={row.status} />
      </td>
      <td className="px-4 py-4">
        {primaryAlias ? (
          <div className="flex max-w-[340px] items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] border border-[#e0e8f1] bg-[#fbfdff] px-3 py-2 text-xs text-[#35546c]">
              {primaryAlias.emailAddress}
            </code>
            <IconButton label={`Copy address for ${row.name}`} icon={Copy} onClick={() => onCopy(primaryAlias.emailAddress)} />
          </div>
        ) : (
          <span className="text-sm text-[#8a9aab]">No address</span>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-[#526981]">
        {formatDateTime(row.lastInboundEmail?.receivedAt)}
      </td>
    </tr>
  )
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <div className={settingsCardClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8da6]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#162334]">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#d9e4ef] bg-white text-[#35546c]">
          <Icon size={19} />
        </span>
      </div>
    </div>
  )
}

export default function SettingsLeadCapturePage() {
  const { profile, role, currentWorkspace, workspaceType } = useWorkspace()
  const [context, setContext] = useState(null)
  const [users, setUsers] = useState([])
  const [aliases, setAliases] = useState([])
  const [inboundEmails, setInboundEmails] = useState([])
  const [failures, setFailures] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextContext = await fetchOrganisationSettings({ forceRefresh: true })
      const organisationId = normalizeText(nextContext?.organisation?.id || currentWorkspace?.id)
      if (!organisationId) {
        setContext(nextContext)
        setUsers([])
        setAliases([])
        setInboundEmails([])
        setFailures([])
        return
      }
      const [nextUsers, nextAliases, nextInboundEmails, nextFailures] = await Promise.all([
        listOrganisationUsers().catch(() => []),
        listLeadCaptureAliases(organisationId).catch((aliasError) => {
          if (String(aliasError?.message || '').toLowerCase().includes('lead_capture_aliases')) return []
          throw aliasError
        }),
        listInboundLeadEmails(organisationId, { limit: 80 }).catch((emailError) => {
          if (String(emailError?.message || '').toLowerCase().includes('inbound_lead_emails')) return []
          throw emailError
        }),
        listLeadParseFailures(organisationId, { limit: 50 }).catch((failureError) => {
          if (String(failureError?.message || '').toLowerCase().includes('lead_parse_failures')) return []
          throw failureError
        }),
      ])
      setContext(nextContext)
      setUsers(nextUsers)
      setAliases(nextAliases)
      setInboundEmails(nextInboundEmails)
      setFailures(nextFailures)
    } catch (loadError) {
      setError(loadError?.message || 'Lead capture settings could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace?.id])

  useEffect(() => {
    void load()
  }, [load])

  const resolvedWorkspaceType = context?.organisation?.type || currentWorkspace?.type || workspaceType || ''
  const membershipRole = normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
    appRole: role,
    workspaceType: resolvedWorkspaceType,
  })
  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const organisationId = normalizeText(context?.organisation?.id || currentWorkspace?.id)
  const profileId = normalizeText(profile?.id)
  const currentUser = users.find((user) => normalizeText(user.userId || user.id) === profileId) || {
    userId: profileId,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    fullName: profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '),
    email: profile?.email,
    role: membershipRole,
  }

  const rows = useMemo(
    () => buildLeadCaptureStatusRows({ aliases, inboundEmails, users }),
    [aliases, inboundEmails, users],
  )
  const currentUserAliases = aliases.filter((alias) => alias.agentUserId === profileId || (!alias.agentUserId && !canManage))
  const currentUserLatestEmail = inboundEmails.find((email) => currentUserAliases.some((alias) => alias.aliasId === email.captureAliasId)) || null
  const currentUserStatus = getLeadCaptureSetupStatus({ aliases: currentUserAliases, lastInboundEmail: currentUserLatestEmail })

  const generatedCount = aliases.filter((alias) => alias.status === 'active').length
  const activeAgentCount = rows.filter((row) => row.status === 'active').length
  const receivedCount = inboundEmails.length
  const failureCount = failures.filter((failure) => failure.status === 'open').length

  async function copyAddress(value) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice('Address copied.')
    } catch {
      setNotice(value)
    }
  }

  async function generateMyAddresses() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await ensureDefaultLeadCaptureAliases({
        organisationId,
        agentUserId: profileId,
        branchId: currentUser.branchId,
        sources: LEAD_CAPTURE_SOURCES,
      })
      setNotice('Lead capture addresses generated.')
      await load()
    } catch (generateError) {
      setError(generateError?.message || 'Lead capture addresses could not be generated.')
    } finally {
      setSaving(false)
    }
  }

  async function generateAgencyAddresses() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await ensureDefaultLeadCaptureAliases({
        organisationId,
        sources: LEAD_CAPTURE_SOURCES,
      })
      await ensureLeadCaptureAliasesForUsers({
        organisationId,
        users,
        sources: LEAD_CAPTURE_SOURCES,
      })
      setNotice('Agency lead capture addresses generated.')
      await load()
    } catch (generateError) {
      setError(generateError?.message || 'Agency lead capture addresses could not be generated.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading lead capture settings..." />
  }

  const myAliases = canManage ? aliases.filter((alias) => alias.agentUserId === profileId) : currentUserAliases
  const visibleMyAliases = myAliases.length ? myAliases : aliases.filter((alias) => !alias.agentUserId).slice(0, 1)

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Lead Capture"
        description="Forwarding addresses, agent activation status, and inbound lead email health."
        actions={
          <>
            <SecondaryButton icon={RefreshCw} onClick={load} disabled={saving}>Refresh</SecondaryButton>
            {canManage ? (
              <PrimaryButton icon={Mail} onClick={generateAgencyAddresses} disabled={saving || !organisationId}>Generate Agency Addresses</PrimaryButton>
            ) : (
              <PrimaryButton icon={Mail} onClick={generateMyAddresses} disabled={saving || !organisationId || !profileId}>Generate My Addresses</PrimaryButton>
            )}
          </>
        }
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {notice ? <SettingsBanner tone="success">{notice}</SettingsBanner> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active Addresses" value={generatedCount} icon={Mail} />
        <MetricCard label="Active Agents" value={activeAgentCount} icon={UsersRound} />
        <MetricCard label="Emails Received" value={receivedCount} icon={Inbox} />
        <MetricCard label="Needs Review" value={failureCount} icon={AlertCircle} />
      </section>

      <SettingsSectionCard
        title="My Capture Addresses"
        description={`Status: ${STATUS_META[currentUserStatus]?.label || STATUS_META.not_started.label}`}
        actions={!visibleMyAliases.length ? <SecondaryButton icon={Mail} onClick={generateMyAddresses} disabled={saving || !organisationId || !profileId}>Generate</SecondaryButton> : null}
      >
        {visibleMyAliases.length ? (
          <div className="grid gap-3">
            {visibleMyAliases.map((alias) => (
              <AliasAddressRow key={alias.aliasId || alias.emailAddress} alias={alias} onCopy={copyAddress} />
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            title="No lead capture addresses yet"
            description="Generate addresses before routing portal enquiries into Arch9."
          />
        )}
      </SettingsSectionCard>

      {canManage ? (
        <SettingsSectionCard title="Agency Activation" description="Agent-level lead capture status across the organisation.">
          {rows.length ? (
            <div className="overflow-hidden rounded-[18px] border border-[#e3eaf2] bg-white">
              <table className="min-w-full divide-y divide-[#e8eef5] text-left">
                <thead className="bg-[#f8fbfe]">
                  <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Primary Address</th>
                    <th className="px-4 py-3">Last Email</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <AgentStatusRow key={row.userId || 'agency'} row={row} onCopy={copyAddress} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <SettingsEmptyState
              title="No agents found"
              description="Invite users before generating agent capture addresses."
            />
          )}
        </SettingsSectionCard>
      ) : null}

      <SettingsSectionCard title="Recent Inbound Emails" description="Latest raw email events received through capture addresses.">
        {inboundEmails.length ? (
          <div className="grid gap-3">
            {inboundEmails.slice(0, 8).map((email) => (
              <div key={email.emailId} className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={email.status === 'processed' ? 'active' : email.status === 'failed' ? 'not_started' : 'test_received'} />
                    <span className="text-sm font-semibold text-[#162334]">{email.subject || 'Inbound lead email'}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-[#6b7d93]">{email.fromEmail || 'Unknown sender'} · {formatDateTime(email.receivedAt)}</p>
                </div>
                {email.leadId ? (
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f7a45]">
                    <CheckCircle2 size={16} /> Lead Created
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-[#6b7d93]">{email.status}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            title="No inbound email yet"
            description="Received lead emails will appear here after the inbound provider is connected."
          />
        )}
      </SettingsSectionCard>
    </div>
  )
}
