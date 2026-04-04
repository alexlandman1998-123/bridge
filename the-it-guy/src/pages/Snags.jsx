import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, Download, ExternalLink, Grid3X3, Home, List, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import SummaryCards from '../components/SummaryCards'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import Field from '../components/ui/Field'
import SearchInput from '../components/ui/SearchInput'
import Button from '../components/ui/Button'
import { ViewToggle } from '../components/ui/FilterBar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { fetchDeveloperSnagsData, updateClientIssueStatus } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const COMPLETED_STATUSES = ['completed', 'closed', 'resolved']
const ADDRESSED_STATUSES = ['addressed']
const DEMO_SNAG_ISSUES = [
  {
    id: 'mock-snag-junoah-12-kitchen',
    reference: 'SNAG-JE-012',
    category: 'Kitchen finish',
    description: 'Island counter edge needs re-sealing and one cupboard hinge is misaligned.',
    location: 'Kitchen',
    priority: 'Medium',
    status: 'Open',
    created_at: '2026-04-01T09:15:00.000Z',
    updated_at: '2026-04-02T10:05:00.000Z',
    development: { id: 'mock-dev-junoah', name: 'Junoah Estate' },
    unit: { id: 'mock-unit-junoah-12', unit_number: '12' },
    unit_id: 'mock-unit-junoah-12',
    buyer: { id: 'mock-buyer-megan', name: 'Megan Barnard' },
    transaction_id: 'mocktrxj',
    isMock: true,
  },
  {
    id: 'mock-snag-junoah-7-bathroom',
    reference: 'SNAG-JE-007',
    category: 'Bathroom fittings',
    description: 'Guest bathroom mixer is loose and silicone line behind basin needs touch-up.',
    location: 'Guest bathroom',
    priority: 'High',
    status: 'Addressed',
    created_at: '2026-03-28T11:40:00.000Z',
    updated_at: '2026-04-02T08:25:00.000Z',
    development: { id: 'mock-dev-junoah', name: 'Junoah Estate' },
    unit: { id: 'mock-unit-junoah-7', unit_number: '7' },
    unit_id: 'mock-unit-junoah-7',
    buyer: { id: 'mock-buyer-marius', name: 'Marius Botha' },
    transaction_id: 'mocktrxp',
    isMock: true,
  },
  {
    id: 'mock-snag-ridge-a04-bedroom',
    reference: 'SNAG-TR-A04',
    category: 'Built-in wardrobe',
    description: 'Main bedroom wardrobe door catches on the frame and needs adjustment.',
    location: 'Main bedroom',
    priority: 'Medium',
    status: 'Completed',
    created_at: '2026-03-24T14:10:00.000Z',
    updated_at: '2026-03-30T16:15:00.000Z',
    signed_off_at: '2026-03-31T09:45:00.000Z',
    signed_off_by: 'Arian Moosa',
    development: { id: 'mock-dev-ridge', name: 'The Ridge' },
    unit: { id: 'mock-unit-ridge-a04', unit_number: 'A04' },
    unit_id: 'mock-unit-ridge-a04',
    buyer: { id: 'mock-buyer-arian', name: 'Arian Moosa' },
    transaction_id: 'mocktrxr',
    isMock: true,
  },
  {
    id: 'mock-snag-harbour-18-balcony',
    reference: 'SNAG-HV-018',
    category: 'Balcony drainage',
    description: 'Balcony outlet is retaining water after washdown and needs inspection.',
    location: 'Balcony',
    priority: 'High',
    status: 'Open',
    created_at: '2026-04-02T07:20:00.000Z',
    updated_at: '2026-04-02T12:10:00.000Z',
    development: { id: 'mock-dev-harbour', name: 'Harbour View' },
    unit: { id: 'mock-unit-harbour-18', unit_number: '18' },
    unit_id: 'mock-unit-harbour-18',
    buyer: { id: 'mock-buyer-lerato', name: 'Lerato Dlamini' },
    transaction_id: 'mocktrxh',
    isMock: true,
  },
  {
    id: 'mock-snag-junoah-12-paint',
    reference: 'SNAG-JE-012B',
    category: 'Paint touch-up',
    description: 'Scuff marks visible on passage wall near the linen cupboard.',
    location: 'Passage',
    priority: 'Low',
    status: 'Open',
    created_at: '2026-04-03T08:55:00.000Z',
    updated_at: '2026-04-03T08:55:00.000Z',
    development: { id: 'mock-dev-junoah', name: 'Junoah Estate' },
    unit: { id: 'mock-unit-junoah-12', unit_number: '12' },
    unit_id: 'mock-unit-junoah-12',
    buyer: { id: 'mock-buyer-megan', name: 'Megan Barnard' },
    transaction_id: 'mocktrxj',
    isMock: true,
  },
]

function isCompletedStatus(status) {
  return COMPLETED_STATUSES.includes(String(status || '').toLowerCase())
}

function isAddressedStatus(status) {
  return ADDRESSED_STATUSES.includes(String(status || '').toLowerCase())
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}

function toStatusLabel(value) {
  const normalized = String(value || 'Open').trim()
  return normalized || 'Open'
}

function getStatusTone(status) {
  if (isCompletedStatus(status)) {
    return 'border-[#cfe6d8] bg-[#f5fcf7] text-[#22824d]'
  }

  if (isAddressedStatus(status)) {
    return 'border-[#eed8b5] bg-[#fffaf2] text-[#9a6700]'
  }

  return 'border-[#dbe5ef] bg-[#f8fbff] text-[#35546c]'
}

function buildDeveloperSnagDemoRows(liveIssues = []) {
  const byId = new Map()
  ;[...liveIssues, ...DEMO_SNAG_ISSUES].forEach((issue) => {
    if (!issue?.id || byId.has(issue.id)) {
      return
    }
    byId.set(issue.id, issue)
  })
  return Array.from(byId.values()).sort((left, right) => {
    const leftDate = new Date(left.updated_at || left.created_at || 0).getTime()
    const rightDate = new Date(right.updated_at || right.created_at || 0).getTime()
    return rightDate - leftDate
  })
}

function openPrintDocument(markup, title) {
  const blob = new Blob([markup], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank', 'noopener,noreferrer')

  if (!printWindow) {
    URL.revokeObjectURL(url)
    throw new Error('Unable to open the snag report. Please allow pop-ups and try again.')
  }

  const cleanup = () => {
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  printWindow.addEventListener?.('load', () => {
    printWindow.document.title = title
    printWindow.focus()
    printWindow.print()
    cleanup()
  })

  printWindow.addEventListener?.('afterprint', cleanup)
}

function buildDocumentShell({ title, subtitle, sectionTitle, sectionCopy, content }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #142132; background: #eef3f8; }
        main { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 16mm; background: white; }
        .hero { border: 1px solid #dbe5ef; border-radius: 26px; padding: 16mm 14mm; background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%); }
        .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #7b8ca2; }
        h1 { margin: 12px 0 6px; font-size: 30px; line-height: 1.05; letter-spacing: -0.05em; }
        .subtitle { margin: 0; font-size: 15px; line-height: 1.6; color: #5b6d82; }
        .meta { margin-top: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .meta-card { border: 1px solid #e3ebf4; border-radius: 18px; padding: 12px 14px; background: #fbfdff; }
        .meta-card strong { display: block; margin-top: 8px; font-size: 18px; letter-spacing: -0.04em; }
        .section { margin-top: 18px; border: 1px solid #dbe5ef; border-radius: 24px; padding: 14px; background: #fbfdff; }
        .section h2 { margin: 0; font-size: 18px; letter-spacing: -0.03em; }
        .section p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; color: #5b6d82; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #7b8ca2; padding: 0 0 12px; text-align: left; }
        td { padding: 14px 0; border-top: 1px solid #e5edf5; vertical-align: top; font-size: 13px; line-height: 1.6; }
        .pill { display: inline-block; border: 1px solid #dbe5ef; border-radius: 999px; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #35546c; background: #f8fbff; }
        .tone-open { background: #f8fbff; color: #35546c; }
        .tone-addressed { background: #fffaf2; color: #9a6700; border-color: #eed8b5; }
        .tone-complete { background: #f5fcf7; color: #22824d; border-color: #cfe6d8; }
        .job-card { display: grid; gap: 12px; margin-top: 16px; }
        .job-row { border: 1px solid #e3ebf4; border-radius: 18px; background: #fbfdff; padding: 12px 14px; }
        .job-row strong { display: block; margin-bottom: 6px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #7b8ca2; }
      </style>
    </head>
    <body>
      <main>
        <section class="hero">
          <span class="eyebrow">Bridge.</span>
          <h1>${title}</h1>
          <p class="subtitle">${subtitle}</p>
          <div class="section">
            <h2>${sectionTitle}</h2>
            <p>${sectionCopy}</p>
            ${content}
          </div>
        </section>
      </main>
    </body>
  </html>`
}

function buildSnagReportMarkup({ title, subtitle, sectionTitle, sectionCopy, issues }) {
  const rows = issues
    .map((issue) => {
      const toneClass = isCompletedStatus(issue.status) ? 'tone-complete' : isAddressedStatus(issue.status) ? 'tone-addressed' : 'tone-open'
      return `<tr>
        <td><strong>${issue.development?.name || 'Development'}</strong><br />${issue.unit?.unit_number ? `Unit ${issue.unit.unit_number}` : 'Unit'}<br />${issue.location || 'Location not specified'}</td>
        <td>${issue.buyer?.name || 'Client not assigned'}</td>
        <td>${issue.category || 'Snag item'}</td>
        <td>${issue.description || 'No description provided.'}</td>
        <td><span class="pill ${toneClass}">${toStatusLabel(issue.status)}</span></td>
        <td>${formatDate(issue.created_at)}</td>
      </tr>`
    })
    .join('')

  return buildDocumentShell({
    title,
    subtitle,
    sectionTitle,
    sectionCopy,
    content: `<table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Client</th>
          <th>Issue</th>
          <th>Notes</th>
          <th>Status</th>
          <th>Logged</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`,
  })
}

function buildJobCardMarkup(issue) {
  const toneClass = isCompletedStatus(issue.status) ? 'tone-complete' : isAddressedStatus(issue.status) ? 'tone-addressed' : 'tone-open'
  return buildDocumentShell({
    title: `${issue.reference} Job Card`,
    subtitle: `${issue.development?.name || 'Development'} • ${issue.unit?.unit_number ? `Unit ${issue.unit.unit_number}` : 'Unit'} • ${issue.buyer?.name || 'Client'}`,
    sectionTitle: 'Maintenance instruction',
    sectionCopy: 'Use this printed job card when the repair team is working offline or on-site without a tablet.',
    content: `<div class="job-card">
      <div class="job-row"><strong>Status</strong><span class="pill ${toneClass}">${toStatusLabel(issue.status)}</span></div>
      <div class="job-row"><strong>Issue type</strong>${issue.category || 'Snag item'}</div>
      <div class="job-row"><strong>Location</strong>${issue.location || 'Location not specified'}</div>
      <div class="job-row"><strong>Priority</strong>${issue.priority || 'Standard'}</div>
      <div class="job-row"><strong>Description</strong>${issue.description || 'No description provided.'}</div>
      <div class="job-row"><strong>Logged</strong>${formatDateTime(issue.created_at)}</div>
      <div class="job-row"><strong>Completion notes</strong>____________________________________________________________</div>
      <div class="job-row"><strong>Completed by</strong>____________________________________________________________</div>
      <div class="job-row"><strong>Date completed</strong>____________________________________________________________</div>
      <div class="job-row"><strong>Client sign-off</strong>____________________________________________________________</div>
    </div>`,
  })
}

function Snags() {
  const navigate = useNavigate()
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [developmentFilter, setDevelopmentFilter] = useState('all')
  const [activeIssueId, setActiveIssueId] = useState(null)
  const [viewMode, setViewMode] = useState('cards')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIssues(buildDeveloperSnagDemoRows([]))
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await fetchDeveloperSnagsData()
      setIssues(buildDeveloperSnagDemoRows(data))
      if (activeIssueId && !data.some((issue) => issue.id === activeIssueId)) {
        setActiveIssueId(null)
      }
    } catch (loadError) {
      setError(loadError.message || 'Unable to load snag data.')
    } finally {
      setLoading(false)
    }
  }, [activeIssueId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const developmentOptions = useMemo(
    () =>
      [...new Map(issues.map((issue) => [String(issue.development?.id || ''), issue.development]).entries())]
        .map(([, development]) => development)
        .filter(Boolean)
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))),
    [issues],
  )

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase()
    return issues.filter((issue) => {
      if (developmentFilter !== 'all' && String(issue.development?.id || '') !== developmentFilter) {
        return false
      }

      if (statusFilter === 'open' && (isCompletedStatus(issue.status) || isAddressedStatus(issue.status))) {
        return false
      }

      if (statusFilter === 'addressed' && !isAddressedStatus(issue.status)) {
        return false
      }

      if (statusFilter === 'completed' && !isCompletedStatus(issue.status)) {
        return false
      }

      if (!query) {
        return true
      }

      const haystack = [
        issue.reference,
        issue.category,
        issue.description,
        issue.location,
        issue.development?.name,
        issue.unit?.unit_number ? `Unit ${issue.unit.unit_number}` : '',
        issue.buyer?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [developmentFilter, issues, search, statusFilter])

  const summary = useMemo(() => {
    const openCount = issues.filter((issue) => !isCompletedStatus(issue.status) && !isAddressedStatus(issue.status)).length
    const addressedCount = issues.filter((issue) => isAddressedStatus(issue.status)).length
    const completedCount = issues.filter((issue) => isCompletedStatus(issue.status)).length
    const developmentCount = new Set(issues.map((issue) => issue.development?.id).filter(Boolean)).size

    return { openCount, addressedCount, completedCount, developmentCount }
  }, [issues])

  const activeIssue = filteredIssues.find((issue) => issue.id === activeIssueId) || issues.find((issue) => issue.id === activeIssueId) || null
  const activeUnitIssues = activeIssue ? issues.filter((issue) => String(issue.unit_id) === String(activeIssue.unit_id)) : []

  async function handleUpdateStatus(issueId, status) {
    const targetIssue = issues.find((issue) => issue.id === issueId)

    if (targetIssue?.isMock) {
      setIssues((current) =>
        current.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                status,
                updated_at: new Date().toISOString(),
                ...(isCompletedStatus(status)
                  ? { signed_off_at: new Date().toISOString(), signed_off_by: 'Developer team' }
                  : {}),
              }
            : issue,
        ),
      )
      return
    }

    try {
      setSaving(true)
      setError('')
      await updateClientIssueStatus(issueId, status)
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to update the snag status.')
    } finally {
      setSaving(false)
    }
  }

  function handleOpenTransaction(issue) {
    if (!issue?.unit_id) {
      return
    }

    navigate(`/units/${issue.unit_id}?tab=snags`, {
      state: {
        headerTitle: issue.unit?.unit_number ? `Unit ${issue.unit.unit_number}` : 'Unit',
      },
    })
  }

  function handleExportFullReport() {
    try {
      setError('')
      const markup = buildSnagReportMarkup({
        title: 'Developer Snag Report',
        subtitle: 'All live snags across the active development portfolio.',
        sectionTitle: 'Snag register',
        sectionCopy: 'This report captures every snag currently logged in the developer workspace.',
        issues: filteredIssues,
      })
      openPrintDocument(markup, 'Developer Snag Report')
    } catch (exportError) {
      setError(exportError.message || 'Unable to generate the snag report.')
    }
  }

  function handleExportUnitReport() {
    if (!activeIssue) {
      return
    }

    try {
      setError('')
      const markup = buildSnagReportMarkup({
        title: `${activeIssue.development?.name || 'Development'} | Unit ${activeIssue.unit?.unit_number || ''} Snag Report`.trim(),
        subtitle: `${activeIssue.buyer?.name || 'Client'} • ${activeUnitIssues.length} snag item${activeUnitIssues.length === 1 ? '' : 's'}`,
        sectionTitle: 'Unit snag register',
        sectionCopy: 'Use this report to review every snag currently associated with this specific unit.',
        issues: activeUnitIssues,
      })
      openPrintDocument(markup, 'Unit Snag Report')
    } catch (exportError) {
      setError(exportError.message || 'Unable to generate the unit snag report.')
    }
  }

  function handleExportJobCard() {
    if (!activeIssue) {
      return
    }

    try {
      setError('')
      openPrintDocument(buildJobCardMarkup(activeIssue), `${activeIssue.reference} Job Card`)
    } catch (exportError) {
      setError(exportError.message || 'Unable to generate the job card.')
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {!isSupabaseConfigured ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </p>
      ) : null}

      <SummaryCards
        items={[
          { label: 'Open Snags', value: summary.openCount, meta: 'Items still needing developer action.', icon: AlertTriangle },
          { label: 'Addressed', value: summary.addressedCount, meta: 'Issues already attended to and awaiting close-out.', icon: Wrench },
          { label: 'Completed', value: summary.completedCount, meta: 'Snags fully resolved and closed.', icon: CheckCircle2 },
          { label: 'Developments Affected', value: summary.developmentCount, meta: 'Projects currently carrying logged snag items.', icon: Building2 },
        ]}
      />

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(190px,220px))_auto] xl:items-end">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Search</span>
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search development, unit, buyer, or snag…"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
            <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="addressed">Addressed</option>
              <option value="completed">Completed</option>
            </Field>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
            <Field as="select" value={developmentFilter} onChange={(event) => setDevelopmentFilter(event.target.value)}>
              <option value="all">All Developments</option>
              {developmentOptions.map((development) => (
                <option key={development.id} value={development.id}>
                  {development.name}
                </option>
              ))}
            </Field>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <ViewToggle
              items={[
                { key: 'cards', label: 'Card View', icon: Grid3X3 },
                { key: 'list', label: 'List View', icon: List },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
            <Button variant="secondary" onClick={loadData} disabled={loading || !isSupabaseConfigured}>
              Refresh
            </Button>
            <Button variant="primary" onClick={handleExportFullReport} disabled={!filteredIssues.length}>
              <Download size={16} />
              Export Snag Report
            </Button>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}

      {viewMode === 'cards' ? (
        <section className="rounded-[28px] border border-[#dde4ee] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e9eff5] pb-4">
            <div>
              <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag Register</h2>
              <p className="mt-1 text-sm leading-7 text-[#6b7d93]">
                Every client-raised snag across the developer portfolio, with direct access into the live transaction workspace.
              </p>
            </div>
            <span className="meta-chip">{filteredIssues.length} snag items</span>
          </div>

          {loading ? (
            <div className="px-2 py-8 text-sm text-[#6b7d93]">Loading snag register…</div>
          ) : filteredIssues.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredIssues.map((issue) => (
                <article
                  key={issue.id}
                  className="group flex h-full cursor-pointer flex-col rounded-[26px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)]"
                  onClick={() => setActiveIssueId(issue.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveIssueId(issue.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                        {issue.reference}
                      </span>
                      <h3 className="mt-3 text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">
                        {issue.development?.name || 'Development'} • {issue.unit?.unit_number ? `Unit ${issue.unit.unit_number}` : 'Unit'}
                      </h3>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold ${getStatusTone(issue.status)}`}>
                      {toStatusLabel(issue.status)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-[0.76rem] font-semibold text-[#35546c]">
                      {issue.category || 'Snag item'}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-[0.76rem] font-semibold text-[#35546c]">
                      {issue.priority || 'Standard priority'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Client</span>
                      <strong className="mt-2 block text-base font-semibold text-[#142132]">{issue.buyer?.name || 'Client not assigned'}</strong>
                    </div>
                    <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3.5">
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Location</span>
                      <strong className="mt-2 block text-base font-semibold text-[#142132]">{issue.location || 'Location not specified'}</strong>
                    </div>
                  </div>

                  <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#5f748b]">
                    {issue.description || 'No description provided.'}
                  </p>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e7eef6]">
                    <div
                      className={`h-full rounded-full ${
                        isCompletedStatus(issue.status)
                          ? 'bg-[#22a06b]'
                          : isAddressedStatus(issue.status)
                            ? 'bg-[#d97706]'
                            : 'bg-[#35546c]'
                      }`}
                      style={{
                        width: isCompletedStatus(issue.status) ? '100%' : isAddressedStatus(issue.status) ? '68%' : '32%',
                      }}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
                    <div className="text-sm text-[#6b7d93]">
                      Logged {formatDate(issue.created_at)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-[38px] px-3 py-2 text-[#244b72] hover:bg-[#eff4f8] hover:text-[#1d3d5f]"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleOpenTransaction(issue)
                      }}
                    >
                      Open Transaction
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-2 py-8 text-sm text-[#6b7d93]">No snag items match the current filters.</div>
          )}
        </section>
      ) : (
        <DataTable
          title="Snag Register"
          copy="Every client-raised snag across the developer portfolio, with fast access into the live transaction workspace."
          actions={<span className="meta-chip">{filteredIssues.length} snag items</span>}
        >
          <DataTableInner className="units-table developer-transactions-table min-w-[1380px]">
            <thead>
              <tr>
                <th>Property</th>
                <th>Client</th>
                <th>Issue</th>
                <th>Location</th>
                <th>Status</th>
                <th>Logged</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-sm text-[#6b7d93]">
                    Loading snag register…
                  </td>
                </tr>
              ) : filteredIssues.length ? (
                filteredIssues.map((issue) => (
                  <tr
                    key={issue.id}
                    className="cursor-pointer transition hover:bg-[#fbfdff]"
                    onClick={() => setActiveIssueId(issue.id)}
                  >
                    <td>
                      <strong className="table-primary">{issue.development?.name || 'Development'}</strong>
                      <span className="table-secondary">
                        {issue.unit?.unit_number ? `Unit ${issue.unit.unit_number}` : 'Unit not linked'}
                      </span>
                    </td>
                    <td>
                      <strong className="table-primary">{issue.buyer?.name || 'Client not assigned'}</strong>
                      <span className="table-secondary">{issue.reference}</span>
                    </td>
                    <td>
                      <strong className="table-primary">{issue.category || 'Snag item'}</strong>
                      <span className="table-secondary line-clamp-2 max-w-[260px]">{issue.description || 'No description provided.'}</span>
                    </td>
                    <td>
                      <strong className="table-primary">{issue.location || 'Location not specified'}</strong>
                      <span className="table-secondary">{issue.priority || 'Standard priority'}</span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${getStatusTone(issue.status)}`}>
                        {toStatusLabel(issue.status)}
                      </span>
                    </td>
                    <td>
                      <strong className="table-primary">{formatDate(issue.created_at)}</strong>
                      <span className="table-secondary">{formatDateTime(issue.created_at)}</span>
                    </td>
                    <td>
                      <strong className="table-primary">{formatDate(issue.updated_at || issue.created_at)}</strong>
                      <span className="table-secondary">{issue.signed_off_at ? `Signed off ${formatDate(issue.signed_off_at)}` : 'Awaiting close-out'}</span>
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleOpenTransaction(issue)
                        }}
                      >
                        Open Transaction
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-sm text-[#6b7d93]">
                    No snag items match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTableInner>
        </DataTable>
      )}

      <Sheet open={Boolean(activeIssue)} onOpenChange={(open) => (!open ? setActiveIssueId(null) : null)}>
        <SheetContent side="right" className="overflow-y-auto border-[#dbe5ef] bg-white p-0">
          {activeIssue ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-[#e5edf5] px-6 pb-4 pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    {activeIssue.reference}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusTone(activeIssue.status)}`}>
                    {toStatusLabel(activeIssue.status)}
                  </span>
                </div>
                <SheetTitle className="text-[1.5rem] tracking-[-0.04em] text-[#142132]">
                  {activeIssue.development?.name || 'Development'} • {activeIssue.unit?.unit_number ? `Unit ${activeIssue.unit.unit_number}` : 'Unit'}
                </SheetTitle>
                <SheetDescription className="text-sm leading-7 text-[#6b7d93]">
                  {activeIssue.buyer?.name || 'Client'} • {activeIssue.category || 'Snag item'} • Logged {formatDateTime(activeIssue.created_at)}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 px-6 py-6">
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Issue details</span>
                  <p className="mt-3 text-sm leading-7 text-[#324559]">{activeIssue.description || 'No description provided.'}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-3">
                      <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Location</span>
                      <strong className="mt-2 block text-sm font-semibold text-[#142132]">{activeIssue.location || 'Location not specified'}</strong>
                    </article>
                    <article className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-3">
                      <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Priority</span>
                      <strong className="mt-2 block text-sm font-semibold text-[#142132]">{activeIssue.priority || 'Standard'}</strong>
                    </article>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Status updates</span>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      variant={isAddressedStatus(activeIssue.status) ? 'primary' : 'secondary'}
                      onClick={() => void handleUpdateStatus(activeIssue.id, 'Addressed')}
                      disabled={saving || isAddressedStatus(activeIssue.status)}
                    >
                      Mark Addressed
                    </Button>
                    <Button
                      variant={isCompletedStatus(activeIssue.status) ? 'primary' : 'secondary'}
                      onClick={() => void handleUpdateStatus(activeIssue.id, 'Completed')}
                      disabled={saving || isCompletedStatus(activeIssue.status)}
                    >
                      Mark Completed
                    </Button>
                  </div>
                  {activeIssue.signed_off_at ? (
                    <p className="mt-4 text-sm leading-6 text-[#6b7d93]">Signed off {formatDateTime(activeIssue.signed_off_at)} by {activeIssue.signed_off_by || 'team'}.</p>
                  ) : null}
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Exports</span>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={handleExportUnitReport}>
                      <Download size={16} />
                      Unit Report
                    </Button>
                    <Button variant="secondary" onClick={handleExportJobCard}>
                      <ClipboardList size={16} />
                      Job Card
                    </Button>
                  </div>
                </section>

                {activeIssue.photo_url ? (
                  <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Supporting photo</span>
                    <a
                      href={activeIssue.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                    >
                      <Download size={14} />
                      Open uploaded photo
                    </a>
                  </section>
                ) : null}
              </div>

              <div className="border-t border-[#e5edf5] px-6 py-5">
                <Button className="w-full" onClick={() => handleOpenTransaction(activeIssue)}>
                  <ExternalLink size={16} />
                  Open Transaction Snags
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  )
}

export default Snags
