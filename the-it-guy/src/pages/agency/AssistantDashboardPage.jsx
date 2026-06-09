import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Home,
  ListChecks,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import {
  SUPPORT_ACTIVITY_MATRIX,
  SUPPORT_ROLE_PRESETS,
  getAssistantDashboardModel,
} from '../../services/assistantOperatingService'

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function roleLabel(value = '') {
  return SUPPORT_ROLE_PRESETS[value]?.label || normalizeText(value).replaceAll('_', ' ') || 'Assistant'
}

function Kpi({ label, value, helper, icon, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-[#edf5ff] text-[#315f8f]',
    green: 'bg-[#effaf3] text-[#26724c]',
    gold: 'bg-[#fff7e8] text-[#8a641d]',
    red: 'bg-[#fff1f0] text-[#a33a35]',
    slate: 'bg-[#f5f8fc] text-[#405b75]',
  }[tone] || 'bg-[#f5f8fc] text-[#405b75]'

  return (
    <article className="rounded-[18px] border border-[#dfe8f1] bg-white p-4 shadow-[0_10px_28px_rgba(24,45,68,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-[13px] ${toneClass}`}>
          {createElement(icon, { size: 16 })}
        </span>
      </div>
      <strong className="mt-3 block text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{value}</strong>
      <p className="mt-1 text-sm font-medium leading-5 text-[#64778c]">{helper}</p>
    </article>
  )
}

function EmptyState({ title, copy }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#d4e0ed] bg-white p-7 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] bg-[#edf4fb] text-[#315f8f]">
        <Users size={22} />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em] text-[#102236]">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#64778c]">{copy}</p>
    </div>
  )
}

function MiniList({ title, items, empty, renderItem }) {
  return (
    <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
      <div className="mt-4 space-y-2">
        {items.length ? items.slice(0, 5).map(renderItem) : (
          <p className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3 text-sm font-medium text-[#64778c]">{empty}</p>
        )}
      </div>
    </article>
  )
}

export default function AssistantDashboardPage() {
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const nextModel = await getAssistantDashboardModel()
        if (!cancelled) setModel(nextModel)
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load the assistant workspace.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const recentWork = useMemo(() => {
    if (!model) return []
    return [
      ...model.leads.map((row) => ({ type: 'Lead', title: row.lead_category || row.stage || 'Lead follow-up', date: row.updated_at || row.created_at })),
      ...model.listings.map((row) => ({ type: 'Listing', title: row.listing_title || row.title || 'Listing coordination', date: row.updated_at || row.created_at })),
      ...model.transactions.map((row) => ({ type: 'Transaction', title: row.transaction_reference || row.property_address_line_1 || 'Transaction coordination', date: row.updated_at || row.created_at })),
    ].sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0)).slice(0, 6)
  }, [model])

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

  const preset = model?.preset || SUPPORT_ROLE_PRESETS.assistant
  const role = model?.supportRole || 'assistant'

  return (
    <section className="space-y-4">
      <section className="rounded-[24px] border border-[#dfe8f1] bg-white p-5 shadow-[0_16px_40px_rgba(24,45,68,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Operational Support</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{roleLabel(role)} Workspace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">
              Coordinate work for assigned agents without taking ownership, commission attribution, or executive authority.
            </p>
          </div>
          <div className="rounded-[18px] border border-[#d8e6f2] bg-[#f8fbff] px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">Scope</p>
            <p className="mt-1 text-sm font-semibold text-[#20364f]">{preset.scope}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Assigned Agents" value={model.totals.agents} helper="Supported production users" icon={UserRoundCheck} tone="blue" />
        <Kpi label="Leads" value={model.totals.leads} helper="Open follow-ups" icon={ClipboardList} tone="gold" />
        <Kpi label="Listings" value={model.totals.listings} helper="Listing coordination" icon={Home} tone="slate" />
        <Kpi label="Transactions" value={model.totals.transactions} helper="Active coordination" icon={ListChecks} tone="green" />
        <Kpi label="Appointments" value={model.totals.appointments} helper="Upcoming / open" icon={CalendarDays} tone="blue" />
        <Kpi label="Documents" value={model.totals.pendingDocuments} helper="Pending requests" icon={FileText} tone="red" />
      </section>

      {!model.assignments.length ? (
        <EmptyState
          title="No assistant delegation assigned yet"
          copy="Ask an agent, branch manager, or principal to assign supported agents. Until then, this workspace stays intentionally empty."
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Governance</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Support User Guardrails</h2>
            </div>
            <ShieldCheck className="text-[#26724c]" size={22} />
          </div>
          <div className="mt-4 grid gap-2">
            {[
              ['Can own business assets', preset.canOwnAssets],
              ['Can receive commission attribution', preset.canReceiveCommission],
              ['Can invite users', preset.canInviteUsers],
              ['Can manage organisation settings', preset.canManageOrganisation],
            ].map(([label, allowed]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-2 text-sm">
                <span className="font-semibold text-[#20364f]">{label}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${allowed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {allowed ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {allowed ? 'Allowed' : 'Blocked'}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Assigned Agents</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Who You Support</h2>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {model.assignedAgents.length ? model.assignedAgents.map((agent) => (
              <div key={agent.userId || agent.email} className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3">
                <p className="font-semibold text-[#102236]">{agent.name}</p>
                <p className="mt-1 text-xs font-medium text-[#6f839a]">{agent.email || 'No email captured'}</p>
              </div>
            )) : (
              <p className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3 text-sm font-medium text-[#64778c] md:col-span-2">
                No supported agents assigned.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MiniList
          title="Upcoming Appointments"
          items={model.appointments}
          empty="No upcoming appointments in your support scope."
          renderItem={(item) => (
            <div key={item.appointment_id || item.id} className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3">
              <p className="font-semibold text-[#102236]">{item.title || item.appointment_type || 'Appointment'}</p>
              <p className="mt-1 text-xs font-medium text-[#6f839a]">{formatDate(item.date_time || item.appointment_date)}</p>
            </div>
          )}
        />
        <MiniList
          title="Pending Documents"
          items={model.pendingDocuments}
          empty="No pending document requests in your support scope."
          renderItem={(item) => (
            <div key={item.id} className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3">
              <p className="font-semibold text-[#102236]">{item.title || item.request_type || 'Document request'}</p>
              <p className="mt-1 text-xs font-medium text-[#6f839a]">{item.status || 'Pending'}</p>
            </div>
          )}
        />
        <MiniList
          title="Recent Work"
          items={recentWork}
          empty="No recent delegated work yet."
          renderItem={(item) => (
            <div key={`${item.type}-${item.title}-${item.date}`} className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] px-3 py-3">
              <p className="font-semibold text-[#102236]">{item.title}</p>
              <p className="mt-1 text-xs font-medium text-[#6f839a]">{item.type} · {formatDate(item.date)}</p>
            </div>
          )}
        />
      </section>

      <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_32px_rgba(24,45,68,0.05)]">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Activity Matrix</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">What Support Users Can Do</h2>
        <div className="mt-4 overflow-x-auto rounded-[16px] border border-[#e2eaf3]">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="bg-[#f7faff] text-left text-[0.68rem] uppercase tracking-[0.12em] text-[#6f839a]">
              <tr>
                <th className="px-4 py-3 font-semibold">Activity</th>
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold">Assistant</th>
                <th className="px-4 py-3 font-semibold">Coordinator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7]">
              {SUPPORT_ACTIVITY_MATRIX.map((row) => (
                <tr key={row.activity}>
                  <td className="px-4 py-3 font-semibold text-[#102236]">{row.activity}</td>
                  <td className="px-4 py-3">{row.agent ? 'Allowed' : 'Blocked'}</td>
                  <td className="px-4 py-3">{row.assistant ? 'Allowed' : 'Blocked'}</td>
                  <td className="px-4 py-3">{row.coordinator ? 'Allowed' : 'Blocked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
