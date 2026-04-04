import { ArrowLeft, Building2, Mail, Phone, User2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import { getAttorneyClientProfile } from '../core/clients/attorneyClientSelectors'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDashboardOverview, fetchTransactionsByParticipant } from '../lib/api'
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
  if (role === 'attorney' && transactionId) {
    return `/transactions/${transactionId}`
  }

  if (unitId) {
    return `/units/${unitId}`
  }

  return fallbackSearch ? `/units?search=${encodeURIComponent(fallbackSearch)}` : '/units'
}

function getProfileCopy(role) {
  if (role === 'developer') {
    return {
      transactionLabel: 'Transactions',
      transactionSubtitle: 'All development-linked deals where this client appears in your portfolio.',
      snapshotLabel: 'portfolio',
    }
  }

  if (role === 'agent') {
    return {
      transactionLabel: 'Transactions',
      transactionSubtitle: 'All active deals where this client appears in your agent workspace.',
      snapshotLabel: 'deals',
    }
  }

  return {
    transactionLabel: 'Linked Transactions',
    transactionSubtitle: 'All matters where this client appears in your conveyancing workspace.',
    snapshotLabel: 'matters',
  }
}

function ClientProfile() {
  const navigate = useNavigate()
  const { clientId } = useParams()
  const { profile, role } = useWorkspace()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  const loadData = useCallback(async () => {
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
      } else if ((role === 'agent' || role === 'attorney') && profile?.id) {
        transactionRows = await fetchTransactionsByParticipant({ userId: profile.id, roleType: role })
      }
      setRows(transactionRows || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load client profile.')
    } finally {
      setLoading(false)
    }
  }, [profile?.id, role])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const profileData = useMemo(() => getAttorneyClientProfile(rows, clientId), [rows, clientId])
  const copy = useMemo(() => getProfileCopy(role), [role])

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
        <h3 className="text-[1.18rem] font-semibold tracking-[-0.025em] text-[#142132]">Client not found</h3>
        <p className="mt-3 max-w-[560px] text-sm leading-7 text-[#6b7d93]">
          This client is not currently linked to any matters visible in your workspace.
        </p>
        <Button variant="secondary" onClick={() => navigate('/clients')}>
          Back to Clients
        </Button>
      </section>
    )
  }

  const { client, transactions } = profileData

  return (
    <section className="space-y-5">
      <div>
        <Button variant="ghost" className="px-0 text-[#35546c] hover:bg-transparent hover:text-[#22384c]" onClick={() => navigate('/clients')}>
          <ArrowLeft size={16} />
          Back to Clients
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-[#dde4ee] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#35546c] to-[#65839b] text-[1.65rem] font-semibold text-white shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
            {getInitials(client.name)}
          </div>
          <div className="mt-5">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Client Profile</span>
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
                  client.status === 'active'
                    ? 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                    : 'border border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]'
                }`}
              >
                {client.statusLabel}
              </span>
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
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Active Matters</span>
              <strong className="mt-2 block text-lg font-semibold text-[#142132]">{client.activeTransactions}</strong>
            </div>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Completed Matters</span>
              <strong className="mt-2 block text-lg font-semibold text-[#142132]">{client.completedTransactions}</strong>
            </div>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Latest Property</span>
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.latestPropertyLabel || 'No linked property yet'}</strong>
            </div>
          </div>
        </aside>

        <div className="space-y-5">
          <div className="rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Client tabs">
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
                Transactions
              </button>
            </div>
          </div>

          {activeTab === 'overview' ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Client Snapshot</h3>
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
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Latest Matter</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{transactions[0]?.reference || 'Pending'}</strong>
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Relationship Context</h3>
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
                {transactions.map((transaction) => (
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
                            transaction.status === 'Active'
                              ? 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                              : 'border border-[#dde4ee] bg-white text-[#66758b]'
                          }`}
                        >
                          {transaction.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Stage</span>
                        <strong className="mt-2 block text-base font-semibold text-[#142132]">{transaction.stageLabel}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Last Activity</span>
                        <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatRelativeTime(transaction.lastActivityAt)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default ClientProfile
