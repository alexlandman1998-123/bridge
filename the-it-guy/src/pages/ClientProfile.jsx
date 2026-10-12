import { Activity, ArrowLeft, BriefcaseBusiness, Building2, Clock3, LayoutDashboard, Link2, Mail, Megaphone, Phone, Scale, ShieldCheck, User2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ClientIdentityPanel from '../components/clients/ClientIdentityPanel'
import ClientEnquiryHistoryPanel from '../components/clients/ClientEnquiryHistoryPanel'
import ClientActivityPanel from '../components/clients/ClientActivityPanel'
import ClientAttributionPanel from '../components/clients/ClientAttributionPanel'
import ClientCampaignPanel from '../components/clients/ClientCampaignPanel'
import ClientMarketingTagsPanel from '../components/clients/ClientMarketingTagsPanel'
import ClientTransactionsPanel from '../components/clients/ClientTransactionsPanel'
import Button from '../components/ui/Button'
import { getAgentClientProfile, invalidateAgentClientDirectoryCache, loadAgentClientDirectory, loadAgentClientProfile } from '../core/clients/agentClientDirectory'
import { getAttorneyClientProfile } from '../core/clients/attorneyClientSelectors'
import { getLocalClientPreview } from '../core/clients/localClientPreview'
import { readAttorneyManualParties } from '../core/clients/attorneyManualParties'
import { useWorkspace } from '../context/WorkspaceContext'
import { useOrganisation } from '../context/OrganisationContext'
import { resolveDocumentBrandPalette } from '../lib/onboardingBranding'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchTransactionsByParticipantSummary } from '../lib/transactionsListApi'

let reportingApiPromise = null

function loadReportingApi() {
  reportingApiPromise ||= import('../domains/reporting/api.js')
  return reportingApiPromise
}

function formatRelativeTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now'
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / (60 * 1000)))}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`
  return date.toLocaleDateString('en-ZA')
}

function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
  return parts.map((item) => item[0]?.toUpperCase() || '').join('') || 'CL'
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function getMatterPath({ role, transactionId, unitId, fallbackSearch = '' }) {
  if (role === 'bond_originator' && transactionId) {
    return `/bond/files/${transactionId}`
  }

  if (role === 'attorney' && transactionId) {
    return `/transactions/${transactionId}`
  }

  if (unitId) {
    return `/units/${unitId}`
  }

  return fallbackSearch ? `/units?search=${encodeURIComponent(fallbackSearch)}` : '/units'
}

function getStatusBadgeClass(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('attention') || normalized.includes('risk') || normalized.includes('delay')) return 'border border-[#f1d49a] bg-[#fff7e8] text-[#8a5a12]'
  if (normalized.includes('active') || normalized.includes('intake')) return 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
  if (normalized.includes('registered') || normalized.includes('complete')) return 'border border-[#cfe1f7] bg-[#f0f6ff] text-[#275f9a]'
  return 'border border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]'
}

function getComplianceBadgeClass(complianceKey = '') {
  const normalized = String(complianceKey || '').toLowerCase()
  if (normalized === 'clear') return 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
  if (normalized === 'attention') return 'border border-[#f1d49a] bg-[#fff7e8] text-[#8a5a12]'
  return 'border border-[#cfe1f7] bg-[#f0f6ff] text-[#275f9a]'
}

function AgentClientHeader({ client, onOpenBuyer, workspace }) {
  const organisationContext = useOrganisation()
  const palette = resolveDocumentBrandPalette(
    organisationContext.onboarding,
    organisationContext.organisationSettings,
    organisationContext.branding,
    organisationContext.organisation,
    workspace,
    workspace?.raw,
  )
  const linkedRecordCount = client.linkedRecords?.length || 0
  return (
    <header aria-label="Client summary" className="min-w-0 overflow-hidden rounded-2xl p-5 text-white shadow-[0_8px_24px_rgba(15,40,29,0.1)] sm:p-7" style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${palette.primaryInk} 78%, #071814) 0%, ${palette.primaryInk} 55%, ${palette.accentInk} 100%)` }}>
      <div className="flex min-w-0 flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-[-0.04em] text-white sm:text-[2rem]">{client.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {[...new Set([client.typeLabel, ...String(client.roleLabel || '').split(' + ')].filter(Boolean))].map((label) => (
                <span key={label} className="text-xs font-medium text-white/85">{label}</span>
              ))}
            </div>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white sm:self-center"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${client.status === 'active' ? 'bg-[#b8efcd]' : 'bg-white/70'}`} />{client.statusLabel}</span>
      </div>
      <dl className="mt-5 flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/15 pt-4 text-xs text-white/85">
        <div className="inline-flex items-center gap-2"><Clock3 aria-hidden="true" size={14} className="shrink-0" /><dt>Last activity</dt><dd className="font-medium text-white">{client.lastActivityAt ? formatRelativeTime(client.lastActivityAt) : 'No recent activity'}</dd></div>
        <div className="inline-flex items-center gap-2"><Link2 aria-hidden="true" size={14} className="shrink-0" /><dt>Linked records</dt><dd className="font-medium text-white">{linkedRecordCount}</dd></div>
      </dl>
      {client.source === 'buyer' && isUuidLike(client.sourceRecordId) ? <Button className="mt-4 border-white/30 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white" variant="secondary" onClick={onOpenBuyer}>Open reusable buyer profile</Button> : null}
    </header>
  )
}

function getProfileCopy(role) {
  if (role === 'developer') {
    return {
      transactionLabel: 'Transactions',
      transactionSubtitle: 'All development-linked deals where this client appears in your portfolio.',
      snapshotLabel: 'portfolio item',
    }
  }

  if (role === 'agent') {
    return {
      transactionLabel: 'Transactions',
      transactionSubtitle: 'All active deals where this client appears in your agent workspace.',
      snapshotLabel: 'deal',
      profileLabel: 'Client Workspace',
      notFoundDescription: 'This client is not visible in your current workspace.',
      emptyDescription: 'Enquiries and contact history stay in this workspace before a transaction is opened.',
    }
  }

  if (role === 'bond_originator') {
    return {
      transactionLabel: 'Linked Applications',
      transactionSubtitle: 'All bond applications where this client appears in your finance workspace.',
      snapshotLabel: 'application',
      tabLabel: 'Applications',
      latestLabel: 'Latest Application',
      emptyTitle: 'No linked applications yet',
      emptyDescription: 'This contact can still be a buyer lead, seller lead, prospect, or manually created client before an application is opened.',
    }
  }

  if (role === 'attorney') {
    return {
      transactionLabel: 'Linked Matters',
      transactionSubtitle: 'All matters where this party appears in your conveyancing workspace.',
      snapshotLabel: 'matter',
      tabLabel: 'Matters',
      documentTabLabel: 'Documents & Compliance',
      latestLabel: 'Latest Matter Ref',
      profileLabel: 'Party Profile',
      profileNoun: 'party',
      backLabel: 'Back to Clients & Parties',
      activeLabel: 'Active Matters',
      completedLabel: 'Registered Matters',
      latestPropertyLabel: 'Latest Property',
      snapshotTitle: 'Party Snapshot',
      relationshipTitle: 'Party Context',
      emptyTitle: 'No linked matters yet',
      emptyDescription: 'This party can be kept as an intake record until they are linked to a matter.',
      notFoundTitle: 'Party not found',
      notFoundDescription: 'This party is not currently linked to any matters or intake records visible in your workspace.',
      documentsTitle: 'Party Documents & Compliance',
      documentsSubtitle: 'FICA, signature packs, supporting documents and compliance follow-ups grouped around this party.',
      noDocumentsTitle: 'No matter documents yet',
      noDocumentsDescription: 'Documents will appear here once this party is linked to a matter document request.',
      openDocumentsLabel: 'Open Matter Documents',
    }
  }

  return {
    transactionLabel: 'Linked Transactions',
    transactionSubtitle: 'All matters where this client appears in your conveyancing workspace.',
    snapshotLabel: 'matter',
    tabLabel: 'Transactions',
    latestLabel: 'Latest Matter',
    profileLabel: 'Client Profile',
    profileNoun: 'client',
    backLabel: 'Back to Clients',
    activeLabel: 'Active Matters',
    completedLabel: 'Completed Matters',
    latestPropertyLabel: 'Latest Property',
    snapshotTitle: 'Client Snapshot',
    relationshipTitle: 'Relationship Context',
    emptyTitle: 'No linked transactions yet',
    emptyDescription: 'This contact can still be a buyer lead, seller lead, prospect, or manually created client before a transaction is opened.',
    notFoundTitle: 'Client not found',
    notFoundDescription: 'This client is not currently linked to any matters visible in your workspace.',
  }
}

function getDocumentSummaryValue(summary = {}, keys = []) {
  for (const key of keys) {
    const value = Number(summary?.[key])
    if (Number.isFinite(value)) return value
  }
  return 0
}

function buildClientDocumentSections(transactions = [], role = '') {
  const totals = transactions.reduce(
    (accumulator, transaction) => {
      const summary = transaction.documentSummary || {}
      accumulator.required += getDocumentSummaryValue(summary, ['requiredCount', 'totalRequired', 'total_required_documents', 'total'])
      accumulator.uploaded += getDocumentSummaryValue(summary, ['uploadedCount', 'uploaded_documents_count', 'uploaded'])
      accumulator.missing += getDocumentSummaryValue(summary, ['missingCount', 'missing_documents_count', 'missing'])
      return accumulator
    },
    { required: 0, uploaded: 0, missing: 0 },
  )

  if (role === 'attorney') {
    return [
      {
        title: 'FICA / KYC',
        value: totals.required ? `${Math.max(totals.required - totals.missing, 0)} of ${totals.required} complete` : 'No requests yet',
        description: 'Identity, proof of address, authority and entity documents tied to the party across linked matters.',
      },
      {
        title: 'Matter Documents',
        value: transactions.length ? `${transactions.length} linked ${transactions.length === 1 ? 'matter' : 'matters'}` : 'No linked matters',
        description: 'Signed packs, correspondence and matter documents remain managed inside the matter workspace.',
      },
      {
        title: 'Outstanding Requests',
        value: totals.missing ? `${totals.missing} outstanding` : 'Clear',
        description: 'Open document or compliance requests that still need party follow-up.',
      },
    ]
  }

  return [
    {
      title: 'Uploaded FICA',
      value: totals.uploaded ? `${totals.uploaded} uploaded` : 'Linked to applications',
      description: 'Identity, proof of address, company, trust, and related FICA files stay attached to the client record through each application.',
    },
    {
      title: 'Application Documents',
      value: totals.required ? `${Math.max(totals.required - totals.missing, 0)} of ${totals.required} complete` : `${transactions.length} linked ${transactions.length === 1 ? 'application' : 'applications'}`,
      description: 'Payslips, bank statements, OTPs, affordability packs, and finance documents are managed inside the linked application detail.',
    },
    {
      title: 'Supporting Docs',
      value: totals.missing ? `${totals.missing} outstanding` : 'No outstanding count',
      description: 'Additional requests and supporting documents are surfaced here as a client-level view without becoming a standalone file manager.',
    },
  ]
}

function ClientProfile() {
  const navigate = useNavigate()
  const { clientId } = useParams()
  const location = useLocation()
  const returnTo = location.state?.clientsReturnTo
  const clientsPath = typeof returnTo === 'string' && /^\/(?:bond\/)?clients(?:\?|$)/.test(returnTo)
    ? returnTo : location.pathname.startsWith('/bond/clients/') ? '/bond/clients' : '/clients'

  const backToClients = () => navigate(clientsPath, { state: { clientsDirectoryState: location.state?.clientsDirectoryState } })
  const { profile, role, workspace, currentMembership, businessWorkspaceId } = useWorkspace()
  const [rows, setRows] = useState([])
  const [agentClients, setAgentClients] = useState([])
  const [agentProfileData, setAgentProfileData] = useState(null)
  const [manualAttorneyParties, setManualAttorneyParties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const loadGeneration = useRef(0)

  const loadData = useCallback(async () => {
    const request = ++loadGeneration.current
    const current = () => request === loadGeneration.current
    if (role === 'attorney') {
      setManualAttorneyParties(readAttorneyManualParties())
    }

    if (role === 'agent') {
      try {
        setLoading(true)
        setError('')
        const directProfile = await loadAgentClientProfile({ clientId, profile, role, workspace })
        if (!current()) return
        if (directProfile !== undefined) {
          setAgentProfileData(directProfile)
          setAgentClients([])
          setRows([])
          return
        }
        const directory = await loadAgentClientDirectory({ profile, role, workspace, currentMembership, businessWorkspaceId })
        if (!current()) return
        setAgentProfileData(null)
        setAgentClients(directory.clients || [])
        setRows([])
      } catch (loadError) {
        if (current()) setError(loadError.message || 'Unable to load client profile.')
      } finally {
        if (current()) setLoading(false)
      }
      return
    }

    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      let transactionRows = []
      if (role === 'developer') {
        const { fetchDashboardOverview } = await loadReportingApi()
        const overview = await fetchDashboardOverview({ developmentId: null })
        transactionRows = overview?.rows || []
      } else if ((role === 'agent' || role === 'attorney' || role === 'bond_originator') && profile?.id) {
        transactionRows = await fetchTransactionsByParticipantSummary({
          userId: profile.id,
          roleType: role,
          organisationId: workspace?.id === 'all' ? '' : workspace?.id || '',
          identityContext: {
            email: profile?.email || '',
            fullName: profile?.fullName || '',
          },
        })
      }
      if (current()) setRows(transactionRows || [])
    } catch (loadError) {
      if (current()) setError(loadError.message || 'Unable to load client profile.')
    } finally {
      if (current()) setLoading(false)
    }
  }, [businessWorkspaceId, clientId, currentMembership, profile, role, workspace])

  useEffect(() => {
    void loadData()
    return () => { loadGeneration.current += 1 }
  }, [loadData])

  useEffect(() => { setActiveTab('overview'); setPreviewEnabled(true) }, [clientId, role])

  const profileData = useMemo(
    () => (role === 'agent' ? agentProfileData || getAgentClientProfile(agentClients, clientId) : getAttorneyClientProfile(rows, clientId, role === 'attorney' ? manualAttorneyParties : [])),
    [agentClients, agentProfileData, clientId, manualAttorneyParties, role, rows],
  )
  const copy = useMemo(() => getProfileCopy(role), [role])
  const localPreview = useMemo(() => role === 'agent' ? getLocalClientPreview(profileData) : null, [profileData, role])
  const isAttorneyProfile = role === 'attorney'

  if (loading) {
    return (
      <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]" role="status" aria-live="polite">
        <h1 className="text-lg font-semibold text-[#142132]">Loading client profile</h1>
        <p className="mt-1 text-sm text-[#6b7d93]">Fetching the latest client details and linked transactions.</p>
        <LoadingSkeleton lines={10} />
      </div>
    )
  }

  if (error) {
    return <div className="rounded-[22px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">{error}</div>
  }

  if (!profileData) {
    return (
      <section className="flex flex-col items-center rounded-[28px] border border-[#dde4ee] bg-white px-6 py-12 text-center shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#dbe4ef] bg-[#f6f9fc] text-[#5d7690]">
          <User2 size={28} />
        </div>
        <h3 className="text-[1.18rem] font-semibold tracking-[-0.025em] text-[#142132]">{copy.notFoundTitle || 'Client not found'}</h3>
        <p className="mt-3 max-w-[560px] text-sm leading-7 text-[#6b7d93]">
          {copy.notFoundDescription || 'This client is not currently linked to any matters visible in your workspace.'}
        </p>
        <Button variant="secondary" onClick={backToClients}>
          {copy.backLabel || 'Back to Clients'}
        </Button>
      </section>
    )
  }

  const { client, transactions, preview } = previewEnabled && localPreview ? localPreview : profileData
  const showDocumentTab = role === 'bond_originator' || isAttorneyProfile
  const clientDocumentSections = showDocumentTab ? buildClientDocumentSections(transactions, role) : []
  const latestTransaction = transactions[0] || null
  const profileStatusLabel = isAttorneyProfile
    ? client.latestMatterStatusLabel || client.statusLabel
    : client.statusLabel
  const complianceKey = client.complianceKey || 'clear'
  const complianceLabel = client.complianceLabel || client.complianceStatus || 'Clear'
  const isAgentProfile = role === 'agent'
  const workspaceTabs = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} aria-hidden="true" /> },
    { key: 'transactions', label: copy.tabLabel || 'Transactions', icon: <BriefcaseBusiness size={17} aria-hidden="true" /> },
    ...(showDocumentTab ? [{ key: 'documents', label: copy.documentTabLabel || 'Documents' }] : []),
    ...(isAgentProfile ? [{ key: 'activity', label: 'Activity', icon: <Activity size={17} aria-hidden="true" /> }, { key: 'sources', label: 'Sources', icon: <Link2 size={17} aria-hidden="true" /> }, { key: 'campaigns', label: 'Campaigns', icon: <Megaphone size={17} aria-hidden="true" /> }] : []),
  ]

  return (
    <section className="space-y-5">
      <div>
        <Button variant="ghost" className="px-0 text-[#35546c] hover:bg-transparent hover:text-[#22384c]" onClick={backToClients}>
          <ArrowLeft size={16} />
          {copy.backLabel || 'Back to Clients'}
        </Button>
      </div>

      <div className={isAgentProfile ? 'min-w-0 space-y-5' : 'grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]'}>
        {isAgentProfile ? <AgentClientHeader client={client} workspace={workspace} onOpenBuyer={() => navigate(`/buyers/${client.sourceRecordId}`)} /> : (
        <aside className="min-w-0 rounded-[28px] border border-[#dde4ee] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#35546c] to-[#65839b] text-[1.65rem] font-semibold text-white shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
            {getInitials(client.name)}
          </div>
          <div className="mt-5">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{copy.profileLabel || 'Client Profile'}</span>
            <h1 className="mt-3 break-words text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">{client.name}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#5d7690]">
                {client.typeLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#5d7690]">
                {client.roleLabel}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-[0.78rem] font-semibold ${
                  isAttorneyProfile
                    ? getStatusBadgeClass(profileStatusLabel)
                    : client.status === 'active'
                      ? 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                      : 'border border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]'
                }`}
              >
                {profileStatusLabel}
              </span>
              {isAttorneyProfile ? (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[0.78rem] font-semibold ${getComplianceBadgeClass(complianceKey)}`}>
                  {complianceLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Email</span>
              <strong className="mt-2 block break-words text-base font-semibold text-[#142132]">{client.email || 'Not provided'}</strong>
            </div>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Phone</span>
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.phone || 'Not provided'}</strong>
            </div>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Last Activity</span>
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatRelativeTime(client.lastActivityAt)}</strong>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{copy.activeLabel || 'Active Matters'}</span>
              <strong className="mt-2 block text-lg font-semibold text-[#142132]">{client.activeTransactions}</strong>
            </div>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{copy.completedLabel || 'Completed Matters'}</span>
              <strong className="mt-2 block text-lg font-semibold text-[#142132]">{client.completedTransactions}</strong>
            </div>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{copy.latestPropertyLabel || 'Latest Property'}</span>
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.latestPropertyLabel || 'No linked property yet'}</strong>
            </div>
            {isAttorneyProfile ? (
              <>
                <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                  <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Latest Matter Ref</span>
                  <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.latestMatterReference || 'Unlinked'}</strong>
                </div>
                <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                  <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Matter Type</span>
                  <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.latestMatterTypeLabel || 'Matter'}</strong>
                </div>
              </>
            ) : null}
          </div>
          {client.source === 'buyer' && isUuidLike(client.sourceRecordId) ? (
            <Button className="mt-6 w-full" variant="secondary" onClick={() => navigate(`/buyers/${client.sourceRecordId}`)}>
              Open reusable buyer profile
            </Button>
          ) : null}
        </aside>
        )}

        <div className="min-w-0 space-y-5">
          {localPreview ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dbe7dc] bg-[#f0f6ef] px-4 py-2 text-xs text-[#49654c]" aria-label="Local mock preview"><p><strong>{preview ? 'Mock preview' : 'Live profile'}</strong>{preview ? ' · Sample transactions, activity, sources and campaigns for layout review.' : ' · Showing the client’s saved records.'}</p><button type="button" className="rounded-lg px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setPreviewEnabled(enabled => !enabled)}>{preview ? 'Show live data' : 'Show mock data'}</button></div> : null}
          <div className={isAgentProfile
            ? 'w-full max-w-none overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1'
            : 'rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'}>
            <div className={isAgentProfile ? 'grid w-full gap-1' : `grid gap-2 ${showDocumentTab ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`} style={isAgentProfile ? { gridTemplateColumns: `repeat(${workspaceTabs.length}, minmax(144px, 1fr))` } : undefined} role="tablist" aria-label={`${copy.profileNoun || 'Client'} tabs`}>
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={[
                    isAgentProfile
                      ? 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset'
                      : 'inline-flex min-h-[52px] items-center justify-center rounded-[16px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                    activeTab === tab.key
                      ? (isAgentProfile
                        ? 'border-slate-200 bg-white text-slate-950 shadow-[0_3px_10px_rgba(15,23,42,0.09)]'
                        : 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]')
                      : (isAgentProfile ? 'border-transparent bg-transparent text-slate-500 hover:bg-white/65 hover:text-slate-800' : 'border-transparent bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white'),
                  ].join(' ')}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  tabIndex={isAgentProfile ? activeTab === tab.key ? 0 : -1 : undefined}
                  onKeyDown={isAgentProfile ? (event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const index = workspaceTabs.findIndex((item) => item.key === tab.key)
                    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? workspaceTabs.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + workspaceTabs.length) % workspaceTabs.length
                    setActiveTab(workspaceTabs[nextIndex].key)
                    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex]?.focus()
                  } : undefined}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {isAgentProfile ? <span className="shrink-0 opacity-80">{tab.icon}</span> : null}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'activity' && role === 'agent' ? <ClientActivityPanel client={client} previewData={preview?.activity} onChanged={async () => { invalidateAgentClientDirectoryCache(); await loadData() }} /> : null}
          {activeTab === 'sources' && role === 'agent' ? <ClientAttributionPanel client={client} previewData={preview?.sources} /> : null}
          {activeTab === 'campaigns' && role === 'agent' ? <ClientCampaignPanel client={client} previewData={preview?.campaigns} onChanged={async () => { invalidateAgentClientDirectoryCache(); await loadData() }} /> : null}

          {activeTab === 'overview' ? (
            isAgentProfile ? (
              <div className="min-w-0 space-y-5">
                <section aria-label="Client deal summary" className="overflow-hidden rounded-2xl border border-[#e0e7e3] bg-white">
                  <dl className="grid grid-cols-2 md:grid-cols-4">
                    {[
                      ['Active deals', client.activeTransactions ?? 0, true],
                      ['Completed deals', client.completedTransactions ?? 0, true],
                      ['Latest stage', client.latestStage || 'No stage yet'],
                      ['Latest transaction', latestTransaction?.reference || client.latestMatterReference || 'Not opened yet'],
                    ].map(([label, value, numeric], index) => (
                      <div key={label} className={`min-w-0 px-5 py-5 sm:px-6 ${index % 2 ? 'border-l border-[#edf1ee]' : ''} ${index > 1 ? 'border-t border-[#edf1ee] md:border-l md:border-t-0' : ''}`}>
                        <dt className="text-xs font-medium text-[#7a887f]">{label}</dt>
                        <dd className={`mt-2 break-words font-semibold tracking-tight ${numeric ? 'text-3xl leading-none text-[#194a37]' : 'text-sm leading-6 text-[#293f34]'}`}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <ClientEnquiryHistoryPanel key={`${client.organisationId}:${client.identityId}`} client={client} />
                <div className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                  <ClientIdentityPanel client={client} clients={agentClients} onChanged={async (identityId) => { invalidateAgentClientDirectoryCache(); if (clientId === `client:${identityId}`) await loadData(); else navigate(`/clients/${encodeURIComponent(`client:${identityId}`)}`, { replace: true, state: location.state }) }} />
                  <ClientMarketingTagsPanel key={`${client.organisationId}:${client.id}:${client.email}`} client={client} />
                </div>
              </div>
            ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{copy.snapshotTitle || 'Client Snapshot'}</h3>
                <p className="mt-2 text-sm leading-7 text-[#6b7d93]">
                  {client.name} is currently linked to {client.totalTransactions} {copy.snapshotLabel}
                  {client.totalTransactions === 1 ? '' : 's'}.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Active</span>
                    <strong className="mt-2 block text-lg font-semibold text-[#142132]">{client.activeTransactions}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Completed</span>
                    <strong className="mt-2 block text-lg font-semibold text-[#142132]">{client.completedTransactions}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Latest Stage</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.latestStage || 'No stage yet'}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{copy.latestLabel || 'Latest Matter'}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{latestTransaction?.reference || client.latestMatterReference || 'Pending'}</strong>
                  </div>
                  {isAttorneyProfile ? (
                    <>
                      <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Matter Status</span>
                        <strong className="mt-2 block text-base font-semibold text-[#142132]">{profileStatusLabel}</strong>
                      </div>
                      <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Compliance</span>
                        <span className={`mt-2 inline-flex max-w-full items-center rounded-full px-3 py-1 text-[0.78rem] font-semibold ${getComplianceBadgeClass(complianceKey)}`}>
                          <span className="truncate">{complianceLabel}</span>
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{copy.relationshipTitle || 'Relationship Context'}</h3>
                <div className="mt-5 grid gap-3">
                  <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                    <Mail size={15} />
                    <span>{client.email || 'No email saved'}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                    <Phone size={15} />
                    <span>{client.phone || 'No phone saved'}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                    <Building2 size={15} />
                    <span>{client.entityName || client.typeLabel}</span>
                  </div>
                  {isAttorneyProfile ? (
                    <>
                      <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                        <Scale size={15} />
                        <span>{client.roleLabel || 'Matter Party'}</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                        <ShieldCheck size={15} />
                        <span>{complianceLabel}</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                        <User2 size={15} />
                        <span>{client.assignedAgentName || 'Unassigned attorney'}</span>
                      </div>
                      {client.manual ? (
                        <div className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-[#22384c]">
                          <ShieldCheck size={15} />
                          <span>{client.syncError ? 'Saved locally - sync needs review' : client.linkStatus === 'synced' ? 'Synced to matter role-players' : 'Intake record'}</span>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </section>
            </div>
            )
          ) : null}

          {activeTab === 'transactions' ? (
            isAgentProfile ? <ClientTransactionsPanel key={`${client.organisationId}:${client.id}:${Boolean(preview)}`} client={client} transactions={transactions} preview={Boolean(preview)} /> : (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{copy.transactionLabel}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{copy.transactionSubtitle}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {transactions.length ? transactions.map((transaction) => (
                  <article
                    key={transaction.reference}
                    className={`rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5 ${preview ? '' : 'cursor-pointer transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]'}`}
                    onClick={preview ? undefined : () =>
                      navigate(
                        getMatterPath({
                          role,
                          transactionId: transaction.id,
                          unitId: transaction.unitId,
                          fallbackSearch: client.name,
                        }),
                      )
                    }
                    onKeyDown={preview ? undefined : (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(
                          getMatterPath({
                            role,
                            transactionId: transaction.id,
                            unitId: transaction.unitId,
                            fallbackSearch: client.name,
                          }),
                        )
                      }
                    }}
                    role={preview ? undefined : 'button'}
                    tabIndex={preview ? undefined : 0}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{transaction.propertyLabel}</h4>
                        <p className="mt-1 text-sm text-[#7c8ea4]">{transaction.reference}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#5d7690]">
                          {transaction.typeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[0.78rem] font-semibold ${
                            isAttorneyProfile
                              ? getStatusBadgeClass(transaction.statusLabel)
                              : transaction.status === 'Active'
                                ? 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                                : 'border border-[#dde4ee] bg-white text-[#66758b]'
                          }`}
                        >
                          {isAttorneyProfile ? transaction.statusLabel : transaction.status}
                        </span>
                        {isAttorneyProfile ? (
                          <span className={`inline-flex max-w-[190px] items-center rounded-full px-3 py-1 text-[0.78rem] font-semibold ${getComplianceBadgeClass(transaction.complianceKey)}`}>
                            <span className="truncate">{transaction.complianceLabel || 'Clear'}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className={`mt-4 grid gap-3 ${isAttorneyProfile ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Stage</span>
                        <strong className="mt-2 block text-base font-semibold text-[#142132]">{transaction.stageLabel}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Last Activity</span>
                        <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatRelativeTime(transaction.lastActivityAt)}</strong>
                      </div>
                      {isAttorneyProfile ? (
                        <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                          <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Responsible Attorney</span>
                          <strong className="mt-2 block text-base font-semibold text-[#142132]">{transaction.responsibleAttorneyName || 'Unassigned'}</strong>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )) : (
                  <div className="rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{copy.emptyTitle || 'No linked transactions yet'}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                      {copy.emptyDescription || 'This contact can still be a buyer lead, seller lead, prospect, or manually created client before a transaction is opened.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
            )
          ) : null}

          {activeTab === 'documents' && showDocumentTab ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{copy.documentsTitle || 'Client Documents'}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                    {copy.documentsSubtitle || 'FICA, application documents, and supporting docs grouped around this client and their linked applications.'}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {clientDocumentSections.map((section) => (
                  <article key={section.title} className="rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{section.title}</span>
                    <strong className="mt-2 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{section.value}</strong>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                  </article>
                ))}
              </div>

              <div className="mt-5 divide-y divide-[#e6edf5] overflow-hidden rounded-[18px] border border-[#dfe8f2] bg-white">
                {transactions.length ? transactions.map((transaction) => (
                  <article key={`docs-${transaction.reference}`} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-[#142132]">{transaction.propertyLabel}</h4>
                      <p className="mt-1 text-xs text-[#7c8ea4]">{transaction.reference} - {transaction.stageLabel}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `${getMatterPath({
                            role,
                            transactionId: transaction.id,
                            unitId: transaction.unitId,
                            fallbackSearch: client.name,
                          })}?tab=documents`,
                        )
                      }
                    >
                      {copy.openDocumentsLabel || 'Open Documents'}
                    </Button>
                  </article>
                )) : (
                  <div className="px-4 py-5">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{copy.noDocumentsTitle || 'No application documents yet'}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{copy.noDocumentsDescription || 'Documents will appear here once this client is linked to a bond application.'}</p>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default ClientProfile
