import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Mail, Phone, RefreshCw, Search, UserRound } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { listDemoEnquiries, updateDemoEnquiryStatus } from '../services/demoEnquiryService'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'closed', label: 'Closed' },
  { value: 'spam', label: 'Spam' },
]

const STATUS_TONE = {
  new: 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]',
  contacted: 'border-[#dbe4ee] bg-[#f7f9fc] text-[#31485e]',
  scheduled: 'border-[#c7d7ff] bg-[#f2f6ff] text-[#1d4ed8]',
  closed: 'border-[#e1d7c7] bg-[#fbf7ef] text-[#7a4c13]',
  spam: 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]',
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatList(value = []) {
  if (!Array.isArray(value)) return normalizeText(value) || 'Not provided'
  return value.map(normalizeText).filter(Boolean).join(', ') || 'Not provided'
}

function getFullName(enquiry = {}) {
  return [enquiry.first_name, enquiry.last_name].map(normalizeText).filter(Boolean).join(' ') || 'Unknown lead'
}

function StatusBadge({ status = 'new' }) {
  const safeStatus = normalizeText(status) || 'new'
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold capitalize ${STATUS_TONE[safeStatus] || STATUS_TONE.contacted}`}>
      {safeStatus.replace(/_/g, ' ')}
    </span>
  )
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <article className="rounded-[16px] border border-[#dfe7ef] bg-white px-4 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#60758d]">{label}</p>
        <Icon className="h-4 w-4 text-[#0b5b49]" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#142132]">{value}</p>
    </article>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-[14px] border border-[#edf1f6] bg-[#fbfcfe] px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#60758d]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#142132]">{value || 'Not provided'}</p>
    </div>
  )
}

function EnquiryDetail({ enquiry, onStatusChange, updatingStatus }) {
  if (!enquiry) {
    return (
      <aside className="rounded-[18px] border border-[#dfe7ef] bg-white p-6 text-sm leading-6 text-[#60758d]">
        Select an enquiry to see the full intake payload.
      </aside>
    )
  }

  return (
    <aside className="rounded-[18px] border border-[#dfe7ef] bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f6] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#60758d]">Selected enquiry</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#142132]">{getFullName(enquiry)}</h2>
          <p className="mt-1 text-sm font-medium text-[#60758d]">{enquiry.company}</p>
        </div>
        <StatusBadge status={enquiry.status} />
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#60758d]">Status</span>
        <select
          value={enquiry.status || 'new'}
          disabled={updatingStatus}
          onChange={(event) => onStatusChange(enquiry.id, event.target.value)}
          className="mt-2 min-h-11 w-full rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold text-[#142132] outline-none focus:border-[#0b5b49]"
        >
          {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <div className="mt-5 grid gap-3">
        <DetailRow label="Role" value={enquiry.role} />
        <DetailRow label="Email" value={enquiry.email} />
        <DetailRow label="Phone" value={enquiry.phone} />
        <DetailRow label="Business Size" value={enquiry.business_size} />
        <DetailRow label="Monthly Volume" value={enquiry.monthly_volume} />
        <DetailRow label="Demo Focus" value={formatList(enquiry.demo_focus)} />
        <DetailRow label="Preferred Window" value={formatList(enquiry.preferred_window)} />
        <DetailRow label="Biggest Frustration" value={enquiry.biggest_frustration} />
        <DetailRow label="Notification" value={`${enquiry.notification_status || 'pending'}${enquiry.notified_at ? ` · ${formatDate(enquiry.notified_at)}` : ''}`} />
        <DetailRow label="Submitted" value={formatDate(enquiry.created_at || enquiry.submitted_at)} />
        <DetailRow label="Source Page" value={enquiry.page_url} />
      </div>
    </aside>
  )
}

export default function PlatformDemoEnquiriesPage() {
  const location = useLocation()
  const [enquiries, setEnquiries] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const selectedEnquiry = useMemo(
    () => enquiries.find((enquiry) => enquiry.id === selectedId) || enquiries[0] || null,
    [enquiries, selectedId],
  )

  const requestedEnquiryId = useMemo(
    () => new URLSearchParams(location.search).get('enquiry') || '',
    [location.search],
  )

  const summary = useMemo(() => ({
    total: enquiries.length,
    newCount: enquiries.filter((enquiry) => enquiry.status === 'new').length,
    scheduled: enquiries.filter((enquiry) => enquiry.status === 'scheduled').length,
  }), [enquiries])

  const loadEnquiries = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await listDemoEnquiries({ status, search })
      setEnquiries(result.enquiries)
      setSelectedId((current) => {
        if (requestedEnquiryId && result.enquiries.some((enquiry) => enquiry.id === requestedEnquiryId)) return requestedEnquiryId
        return result.enquiries.some((enquiry) => enquiry.id === current) ? current : result.enquiries[0]?.id || ''
      })
    } catch (loadError) {
      setError(loadError?.message || 'Demo enquiries could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [requestedEnquiryId, search, status])

  async function handleStatusChange(id, nextStatus) {
    try {
      setUpdatingStatus(true)
      setError('')
      const updated = await updateDemoEnquiryStatus(id, nextStatus)
      setEnquiries((current) => current.map((enquiry) => (enquiry.id === id ? { ...enquiry, ...updated } : enquiry)))
    } catch (statusError) {
      setError(statusError?.message || 'Status could not be updated.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadEnquiries()
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [loadEnquiries])

  return (
    <section className="page">
      <article className="panel card-tier-standard">
        <header className="flex flex-col gap-4 border-b border-[#e8eef5] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Platform Admin</p>
            <h1 className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-[#142132]">Demo Enquiries</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
              Website book-demo submissions saved from Arch9.co.za, with notification delivery state and full intake context.
            </p>
          </div>
          <button type="button" className="header-secondary-cta inline-flex items-center gap-2" onClick={loadEnquiries} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MetricCard label="Loaded" value={summary.total} icon={UserRound} />
          <MetricCard label="New" value={summary.newCount} icon={Mail} />
          <MetricCard label="Scheduled" value={summary.scheduled} icon={CheckCircle2} />
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-[16px] border border-[#dfe7ef] bg-[#f8fafc] p-3 md:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#60758d]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company, email or role"
              className="min-h-11 w-full rounded-[12px] border border-[#dbe4ee] bg-white pl-10 pr-3 text-sm font-semibold text-[#142132] outline-none focus:border-[#0b5b49]"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="min-h-11 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold text-[#142132] outline-none focus:border-[#0b5b49]"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="mt-4 rounded-[14px] border border-[#f2c8c4] bg-[#fff5f4] px-4 py-3 text-sm font-semibold text-[#9f1c1c]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="overflow-hidden rounded-[18px] border border-[#dfe7ef] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
                  <tr>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Focus</th>
                    <th className="px-4 py-3">Window</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6]">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-[#60758d]" colSpan={6}>
                        Loading demo enquiries...
                      </td>
                    </tr>
                  ) : enquiries.length ? enquiries.map((enquiry) => (
                    <tr
                      key={enquiry.id}
                      className={`cursor-pointer transition hover:bg-[#f8fafc] ${selectedEnquiry?.id === enquiry.id ? 'bg-[#f2fbf7]' : ''}`}
                      onClick={() => setSelectedId(enquiry.id)}
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-[#142132]">{getFullName(enquiry)}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[#60758d]">
                          <span>{enquiry.company}</span>
                          <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{enquiry.email}</span>
                          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{enquiry.phone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-[#31485e]">{enquiry.role}</td>
                      <td className="px-4 py-4 text-[#60758d]">{formatList(enquiry.demo_focus)}</td>
                      <td className="px-4 py-4 text-[#60758d]">{formatList(enquiry.preferred_window)}</td>
                      <td className="px-4 py-4"><StatusBadge status={enquiry.status} /></td>
                      <td className="px-4 py-4 text-[#60758d]">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDate(enquiry.created_at || enquiry.submitted_at)}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-4 py-8 text-center text-[#60758d]" colSpan={6}>
                        No demo enquiries match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <EnquiryDetail enquiry={selectedEnquiry} onStatusChange={handleStatusChange} updatingStatus={updatingStatus} />
        </div>
      </article>
    </section>
  )
}
