'use client'

import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Columns3,
  FileText,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function getInitials(value = '') {
  const parts = normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '??'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function formatRelativeTime(value) {
  const timestamp = new Date(value || '')
  if (Number.isNaN(timestamp.getTime())) return ''
  const deltaMs = Date.now() - timestamp.getTime()
  const absSeconds = Math.max(1, Math.round(Math.abs(deltaMs) / 1000))
  const absMinutes = Math.max(1, Math.round(absSeconds / 60))
  const absHours = Math.max(1, Math.round(absMinutes / 60))
  const absDays = Math.max(1, Math.round(absHours / 24))
  const suffix = deltaMs >= 0 ? 'ago' : 'from now'
  if (absMinutes < 60) return `${absMinutes}m ${suffix}`
  if (absHours < 24) return `${absHours}h ${suffix}`
  if (absDays < 7) return `${absDays}d ${suffix}`
  return timestamp.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

function formatActivityDate(value) {
  const timestamp = new Date(value || '')
  if (Number.isNaN(timestamp.getTime())) return ''
  return timestamp.toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getActivityPresentation(sourceType = '') {
  const normalized = normalizeText(sourceType).toLowerCase()
  if (normalized === 'call') {
    return { Icon: Phone, rail: 'bg-[#e8f2ff] text-[#2563a8]', pill: 'bg-[#e8f2ff] text-[#2563a8]', label: 'Call' }
  }
  if (normalized === 'appointment') {
    return { Icon: CalendarDays, rail: 'bg-[#f2eaff] text-[#7056b8]', pill: 'bg-[#f2eaff] text-[#7056b8]', label: 'Appointment' }
  }
  if (normalized === 'follow_up') {
    return { Icon: Clock3, rail: 'bg-[#fff4e5] text-[#b76a12]', pill: 'bg-[#fff4e5] text-[#b76a12]', label: 'Follow-up' }
  }
  if (normalized === 'task') {
    return { Icon: CheckSquare, rail: 'bg-[#eef5fb] text-[#315b7a]', pill: 'bg-[#eef5fb] text-[#315b7a]', label: 'Task' }
  }
  if (normalized === 'note') {
    return { Icon: Pencil, rail: 'bg-[#f2f6fa] text-[#60758b]', pill: 'bg-[#f2f6fa] text-[#60758b]', label: 'Note' }
  }
  if (normalized === 'offer') {
    return { Icon: FileText, rail: 'bg-[#e8f7f1] text-[#1d7a52]', pill: 'bg-[#e8f7f1] text-[#1d7a52]', label: 'Offer' }
  }
  if (normalized === 'system') {
    return { Icon: Columns3, rail: 'bg-[#eef3f7] text-[#687c91]', pill: 'bg-[#eef3f7] text-[#687c91]', label: 'System' }
  }
  if (normalized === 'email') {
    return { Icon: Mail, rail: 'bg-[#edf7ff] text-[#277499]', pill: 'bg-[#edf7ff] text-[#277499]', label: 'Email' }
  }
  if (normalized === 'message') {
    return { Icon: MessageCircle, rail: 'bg-[#e7f8ef] text-[#218257]', pill: 'bg-[#e7f8ef] text-[#218257]', label: 'Message' }
  }
  return { Icon: MessageCircle, rail: 'bg-[#eef3f7] text-[#597089]', pill: 'bg-[#eef3f7] text-[#597089]', label: 'Activity' }
}

function getRowActions(row) {
  const sourceType = normalizeText(row?.sourceType).toLowerCase()
  const hasOriginal = Boolean(row?.original)
  if (!hasOriginal) return []
  if (sourceType === 'appointment') {
    return [
      { key: 'open', label: 'Open appointment', icon: CalendarDays },
      { key: 'reschedule', label: 'Reschedule', icon: Pencil },
      { key: 'complete', label: 'Mark complete', icon: CheckCircle2 },
      { key: 'cancel', label: 'Cancel', icon: Trash2 },
    ]
  }
  if (sourceType === 'task' || sourceType === 'follow_up') {
    const completed = normalizeText(row?.original?.status).toLowerCase() === 'completed'
    return [
      { key: 'toggle-task', label: completed ? 'Reopen task' : 'Mark complete', icon: CheckSquare },
      { key: 'edit', label: 'Edit task', icon: Pencil },
      { key: 'delete', label: 'Delete task', icon: Trash2 },
    ]
  }
  return [
    { key: 'edit', label: sourceType === 'note' ? 'Edit note' : 'Edit activity', icon: Pencil },
    { key: 'delete', label: sourceType === 'note' ? 'Delete note' : 'Delete activity', icon: Trash2 },
  ]
}

function buildRoleplayerSummary(rows = []) {
  const counts = rows.reduce((acc, row) => {
    const type = normalizeText(row?.sourceType).toLowerCase()
    if (type === 'appointment') acc.appointments += 1
    if (type === 'task' || type === 'follow_up') acc.tasks += 1
    if (type === 'call') acc.calls += 1
    if (type === 'note') acc.notes += 1
    return acc
  }, { appointments: 0, tasks: 0, calls: 0, notes: 0 })

  return [
    ['Appointments', counts.appointments],
    ['Tasks', counts.tasks],
    ['Calls', counts.calls],
    ['Notes', counts.notes],
  ]
}

export default function LeadActivityWorkspace({
  title = 'Activity',
  helperText = 'Track all interactions, updates and actions related to this lead.',
  rows = [],
  filters = [],
  activeFilter = 'all',
  onFilterChange,
  searchValue = '',
  onSearchChange,
  onLogActivity,
  onRowAction,
  roleplayers = [],
  showHeader = true,
  showSidebar = true,
}) {
  const workspaceRef = useRef(null)
  const [openMenuId, setOpenMenuId] = useState('')

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeText(searchValue).toLowerCase()
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const type = normalizeText(row?.sourceType).toLowerCase()
      const matchesFilter = activeFilter === 'all' || type === activeFilter
      if (!matchesFilter) return false
      if (!normalizedSearch) return true
      return [
        row?.title,
        row?.description,
        row?.actorName,
        row?.sourceLabel,
        row?.outcome,
        row?.status,
        row?.priority,
      ].some((field) => normalizeText(field).toLowerCase().includes(normalizedSearch))
    })
  }, [activeFilter, rows, searchValue])

  const groupedRows = useMemo(() => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const groups = [
      { key: 'today', label: 'Today', rows: [] },
      { key: 'yesterday', label: 'Yesterday', rows: [] },
      { key: 'this-week', label: 'Earlier this week', rows: [] },
      { key: 'older', label: 'Older dates', rows: [] },
    ]

    for (const row of filteredRows) {
      const date = new Date(row?.timestamp || row?.dueDate || '')
      const bucket = !Number.isFinite(date.getTime())
        ? groups[3]
        : date >= startOfWeek && !(
            date.getDate() === now.getDate() &&
            date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear()
          ) && !(
            date.getDate() === yesterday.getDate() &&
            date.getMonth() === yesterday.getMonth() &&
            date.getFullYear() === yesterday.getFullYear()
          )
          ? groups[2]
          : date.getDate() === now.getDate() &&
              date.getMonth() === now.getMonth() &&
              date.getFullYear() === now.getFullYear()
            ? groups[0]
            : date.getDate() === yesterday.getDate() &&
                date.getMonth() === yesterday.getMonth() &&
                date.getFullYear() === yesterday.getFullYear()
              ? groups[1]
              : groups[3]
      bucket.rows.push(row)
    }

    return groups.filter((group) => group.rows.length)
  }, [filteredRows])

  useEffect(() => {
    if (!openMenuId) return undefined
    const handleDocumentClick = (event) => {
      if (workspaceRef.current && !workspaceRef.current.contains(event.target)) {
        setOpenMenuId('')
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [openMenuId])

  const totalCount = filteredRows.length
  const summaryCards = showSidebar ? buildRoleplayerSummary(rows) : []

  return (
    <section ref={workspaceRef} className="min-w-0">
      <div className="min-w-0 space-y-4">
        {showHeader ? (
        <header className="rounded-[24px] border border-[#dbe7f2] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d839b]">Activity</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#102033]">{title}</h2>
                <span className="rounded-full bg-[#eef8f2] px-3 py-1 text-xs font-semibold text-[#237348]">{totalCount} records</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">{helperText}</p>
            </div>
            <Button type="button" size="sm" className="min-h-10 shrink-0 px-4" onClick={onLogActivity}>
              <CheckCircle2 className="h-4 w-4" />
              + Log Activity
            </Button>
          </div>
        </header>
        ) : null}

        <section className="overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_40px_rgba(31,54,78,0.05)]">
          <div className="border-b border-[#edf3f8] px-4 py-4 sm:px-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filters.map((filter) => {
                const active = normalizeText(activeFilter) === normalizeText(filter.key)
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => onFilterChange?.(filter.key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'bg-[#123955] text-white shadow-[0_8px_18px_rgba(18,57,85,0.16)]'
                        : 'bg-[#f3f7fb] text-[#60758b] hover:bg-[#e7f0f8] hover:text-[#123955]'
                    }`}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0b6]" />
              <Field
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="Search activity..."
                className="pl-9"
              />
            </div>
          </div>

          <div className={`grid min-h-0 ${showSidebar ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
            <div className={`min-w-0 ${showSidebar ? 'border-b border-[#edf3f8] xl:border-b-0 xl:border-r xl:border-[#edf3f8]' : ''}`}>
              <div className="max-h-[calc(100dvh-330px)] overflow-y-auto px-4 py-4 sm:px-5">
                {groupedRows.length ? (
                  <div className="space-y-6">
                    {groupedRows.map((group) => (
                      <section key={group.key}>
                        <div className="mb-3 flex items-center gap-3">
                          <span className="h-px flex-1 bg-[#edf2f7]" />
                          <span className="rounded-full bg-[#f4f8fb] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8fa5]">
                            {group.label}
                          </span>
                          <span className="h-px flex-1 bg-[#edf2f7]" />
                        </div>
                        <div className="space-y-3">
                          {group.rows.map((row) => {
                            const presentation = getActivityPresentation(row?.sourceType)
                            const ActivityIcon = presentation.Icon
                            const rowActions = getRowActions(row)
                            const isOpen = openMenuId === row.id
                            return (
                              <article
                                key={row.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setOpenMenuId((current) => (current === row.id ? '' : row.id))}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    setOpenMenuId((current) => (current === row.id ? '' : row.id))
                                  }
                                }}
                                className="relative cursor-pointer rounded-[18px] border border-[#e4edf6] bg-white px-4 py-4 transition hover:border-[#cfe2ef] hover:shadow-[0_12px_28px_rgba(31,54,78,0.06)]"
                              >
                                <div className="flex items-start gap-4">
                                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${presentation.rail}`}>
                                    <ActivityIcon className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="truncate text-sm font-semibold text-[#102033]">{row.title || row.sourceLabel || 'Activity'}</p>
                                          <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${presentation.pill}`}>
                                            {presentation.label}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-sm leading-6 text-[#60758b]">
                                          {row.description || row.sourceLabel || 'No note captured.'}
                                        </p>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#7b8fa5]">
                                          <span className="inline-flex items-center gap-2 rounded-full bg-[#f6f9fc] px-2.5 py-1">
                                            <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[0.68rem] font-bold text-[#315b7a] ring-1 ring-[#e3ebf3]">
                                              {normalizeText(row.actorName) ? getInitials(row.actorName) : 'SY'}
                                            </span>
                                            <span className="max-w-[180px] truncate">{row.actorName || 'System update'}</span>
                                          </span>
                                          <span className="rounded-full bg-[#f6f9fc] px-2.5 py-1">{row.sourceLabel || 'Update'}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="hidden shrink-0 text-xs font-medium text-[#8aa0b7] sm:inline">
                                          {formatRelativeTime(row.timestamp || row.dueDate)}
                                        </span>
                                        {rowActions.length ? (
                                          <button
                                            type="button"
                                            className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-[#7b8fa5] transition hover:border-[#dce7f2] hover:bg-[#f8fbfd] hover:text-[#102033]"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setOpenMenuId((current) => (current === row.id ? '' : row.id))
                                            }}
                                            aria-label="More activity actions"
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      {normalizeText(row.outcome) ? (
                                        <span className="rounded-full bg-[#eef8f2] px-2.5 py-1 text-[0.68rem] font-semibold text-[#237348]">
                                          Outcome: {row.outcome}
                                        </span>
                                      ) : null}
                                      {normalizeText(row.status) ? (
                                        <span className="rounded-full bg-[#f4f8fb] px-2.5 py-1 text-[0.68rem] font-semibold text-[#637b94]">
                                          Status: {row.status}
                                        </span>
                                      ) : null}
                                      {normalizeText(row.priority) ? (
                                        <span className="rounded-full bg-[#fff8ec] px-2.5 py-1 text-[0.68rem] font-semibold text-[#9b651a]">
                                          {row.priority} priority
                                        </span>
                                      ) : null}
                                      {normalizeText(row.dueDate) ? (
                                        <span className="rounded-full bg-[#f4f8fb] px-2.5 py-1 text-[0.68rem] font-semibold text-[#637b94]">
                                          Due {formatActivityDate(row.dueDate)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                {isOpen && rowActions.length ? (
                                  <div className="absolute right-4 top-12 z-20 w-56 rounded-[16px] border border-[#dbe7f2] bg-white p-2 shadow-[0_18px_38px_rgba(31,54,78,0.14)]">
                                    {rowActions.map((action) => (
                                      <button
                                        key={action.key}
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm font-semibold text-[#20364c] transition hover:bg-[#f6f9fc]"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          onRowAction?.(row, action.key)
                                          setOpenMenuId('')
                                        }}
                                      >
                                        {createElement(action.icon, { className: 'h-4 w-4 text-[#57728a]' })}
                                        {action.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#d7e2ef] bg-[#fbfdff] px-4 py-12 text-center">
                    <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#eef5fb] text-[#315b7a]">
                      <Columns3 className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-[#29435d]">No activity matches this filter.</p>
                    <p className="mt-1 text-sm text-[#6d839b]">Try a different filter or search term.</p>
                  </div>
                )}
              </div>
            </div>

            {showSidebar ? (
            <aside className="space-y-4 bg-[#fbfdff] p-4 sm:p-5 xl:sticky xl:top-6 xl:self-start">
              <section className="rounded-[20px] border border-[#dbe7f2] bg-white p-4 shadow-[0_10px_30px_rgba(31,54,78,0.045)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#6d839b]">Roleplayers</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#102033]">People involved</h3>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef8f2] text-[#237348]">
                    <UsersRound className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {roleplayers.length ? (
                    roleplayers.map((person) => (
                      <article key={person.key} className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7c91a8]">{person.role}</p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#20364c]">{person.name}</p>
                          </div>
                          {normalizeText(person.status) ? (
                            <span className="rounded-full bg-[#eef8f2] px-2.5 py-1 text-[0.68rem] font-semibold text-[#237348]">{person.status}</span>
                          ) : null}
                        </div>
                        {Array.isArray(person.meta) && person.meta.filter(Boolean).length ? (
                          <p className="mt-3 text-xs leading-5 text-[#60758b]">
                            {person.meta.filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#d7e2ef] bg-[#fbfdff] px-4 py-8 text-sm text-[#6f839c]">
                      No real roleplayers have been captured for this lead yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[20px] border border-[#dbe7f2] bg-white p-4 shadow-[0_10px_30px_rgba(31,54,78,0.045)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#6d839b]">Quick Summary</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#102033]">Activity snapshot</h3>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef5fb] text-[#315b7a]">
                    <UserRound className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {summaryCards.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between rounded-[14px] bg-[#f8fbfd] px-3 py-3">
                      <span className="text-sm font-semibold text-[#60758b]">{label}</span>
                      <span className="text-sm font-semibold text-[#102033]">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  )
}
