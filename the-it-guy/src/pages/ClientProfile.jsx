import { ArrowLeft, Building2, Mail, Phone, Scale, ShieldCheck, User2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import { getAgentClientProfile, loadAgentClientDirectory } from '../core/clients/agentClientDirectory'
import { getAttorneyClientProfile } from '../core/clients/attorneyClientSelectors'
import { readAttorneyManualParties } from '../core/clients/attorneyManualParties'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDashboardOverview, fetchTransactionsByParticipant, fetchTransactionsByParticipantSummary } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

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
  const { profile, role, workspace } = useWorkspace()
  const [rows, setRows] = useState([])
  const [agentClients, setAgentClients] = useState([])
  const [manualAttorneyParties, setManualAttorneyParties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  const loadData = useCallback(async () => {
    if (role === 'attorney') {
      setManualAttorneyParties(readAttorneyManualParties())
    }

    if (role === 'agent') {
      try {
        setLoading(true)
        setError('')
        const directory = await loadAgentClientDirectory({ profile, role, workspace })
        setAgentClients(directory.clients || [])
        setRows([])
      } catch (loadError) {
        setError(loadError.message || 'Unable to load client profile.')
      } finally {
        setLoading(false)
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
        const overview = await fetchDashboardOverview({ developmentId: null })
        transactionRows = overview?.rows || []
      } else if ((role === 'agent' || role === 'attorney' || role === 'bond_originator') && profile?.id) {
        transactionRows = role === 'attorney'
          ? await fetchTransactionsByParticipantSummary({ userId: profile.id, roleType: role })
          : await fetchTransactionsByParticipant({ userId: profile.id, roleType: role })
      }
      setRows(transactionRows || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load client profile.')
    } finally {
      setLoading(false)
    }
  }, [profile, role, workspace])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const profileData = useMemo(
    () => (role === 'agent' ? getAgentClientProfile(agentClients, clientId) : getAttorneyClientProfile(rows, clientId, role === 'attorney' ? manualAttorneyParties : [])),
    [agentClients, clientId, manualAttorneyParties, role, rows],
  )
  const copy = useMemo(() => getProfileCopy(role), [role])
  const isAttorneyProfile = role === 'attorney'

  if (loading) {
    return (
      <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
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
        <Button variant="secondary" onClick={() => navigate('/clients')}>
          {copy.backLabel || 'Back to Clients'}
        </Button>
      </section>
    )
  }

  const { client, transactions } = profileData
  const showDocumentTab = role === 'bond_originator' || isAttorneyProfile
  const clientDocumentSections = showDocumentTab ? buildClientDocumentSections(transactions, role) : []
  const latestTransaction = transactions[0] || null
  const profileStatusLabel = isAttorneyProfile
    ? client.latestMatterStatusLabel || client.statusLabel
    : client.statusLabel
  const complianceKey = client.complianceKey || 'clear'
  const complianceLabel = client.complianceLabel || client.complianceStatus || 'Clear'

  return (
    <section className="space-y-5">
      <div>
        <Button variant="ghost" className="px-0 text-[#35546c] hover:bg-transparent hover:text-[#22384c]" onClick={() => navigate('/clients')}>
          <ArrowLeft size={16} />
          {copy.backLabel || 'Back to Clients'}
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-[#dde4ee] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#35546c] to-[#65839b] text-[1.65rem] font-semibold text-white shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
            {getInitials(client.name)}
          </div>
          <div className="mt-5">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{copy.profileLabel || 'Client Profile'}</span>
            <h1 className="mt-3 text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">{client.name}</h1>
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
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.email || 'Not provided'}</strong>
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
        </aside>

        <div className="space-y-5">
          <div className="rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className={`grid gap-2 ${showDocumentTab ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`} role="tablist" aria-label={`${copy.profileNoun || 'Client'} tabs`}>
              <button
                type="button"
                className={[
                  'inline-flex min-h-[52px] items-center justify-center rounded-[16px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                  activeTab === 'overview'
                    ? 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]'
                    : 'border-transparent bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white',
                ].join(' ')}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                className={[
                  'inline-flex min-h-[52px] items-center justify-center rounded-[16px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                  activeTab === 'transactions'
                    ? 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]'
                    : 'border-transparent bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white',
                ].join(' ')}
                onClick={() => setActiveTab('transactions')}
              >
                {copy.tabLabel || 'Transactions'}
              </button>
              {showDocumentTab ? (
                <button
                  type="button"
                  className={[
                    'inline-flex min-h-[52px] items-center justify-center rounded-[16px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                    activeTab === 'documents'
                      ? 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]'
                      : 'border-transparent bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white',
                  ].join(' ')}
                  onClick={() => setActiveTab('documents')}
                >
                  {copy.documentTabLabel || 'Documents'}
                </button>
              ) : null}
            </div>
          </div>

          {activeTab === 'overview' ? (
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
          ) : null}

          {activeTab === 'transactions' ? (
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
                    className="cursor-pointer rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5 transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
                    onClick={() =>
                      navigate(
                        getMatterPath({
                          role,
                          transactionId: transaction.id,
                          unitId: transaction.unitId,
                          fallbackSearch: client.name,
                        }),
                      )
                    }
                    onKeyDown={(event) => {
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
                    role="button"
                    tabIndex={0}
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
