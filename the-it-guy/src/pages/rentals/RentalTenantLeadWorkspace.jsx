import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  SearchCheck,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import { MobileDashboardShell } from '../../components/dashboard/PremiumDashboard'
import { listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import {
  advanceRentalLead,
  assignRentalLead,
  updateRentalLeadQualification,
} from '../../services/rentals/rentalLeadService'
import {
  listRentalLeadCommunications,
  logRentalLeadCommunication,
} from '../../services/rentals/rentalLeadCommunicationService'
import {
  listRentalLeadMatches,
  recordRentalLeadListingShortlist,
} from '../../services/rentals/rentalLeadMatchingService'
import {
  createRentalViewing,
  listRentalViewings,
  recordRentalViewingOutcome,
} from '../../services/rentals/rentalViewingService'
import {
  getRentalApplicationTenancyConversion,
  getRentalApplicationReview,
} from '../../services/rentals/rentalApplicationRepository.js'
import { buildRentalListingQueryOptions } from '../../services/rentals/rentalWorkspaceScope'
import {
  TENANT_JOURNEY,
  TENANT_QUESTIONS,
  TENANT_WORKSPACE_TABS,
  tenantBudgetMatches,
  tenantEnquiryProperty,
  tenantJourneyStage,
  tenantQualificationProgress,
  tenantQualificationValues,
} from '../../services/rentals/rentalTenantWorkspaceModel'
import RentalTenantApplicationProfile from './RentalTenantApplicationProfile'
import './RentalTenantLeadWorkspace.css'

const text = (value) => String(value ?? '').trim()
const label = (value) =>
  text(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
const money = (value) =>
  value === null || value === undefined || value === ''
    ? 'Not captured'
    : `R ${Number(value).toLocaleString('en-ZA')}`
const date = (value) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString('en-ZA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Not captured'
const icons = [
  Home,
  MapPin,
  CalendarDays,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Home,
  Users,
  Home,
  MessageCircle,
]
const EMPTY_ROWS = []
const freshActivity = () => ({
  communicationType: 'call',
  direction: 'outbound',
  summary: '',
  outcome: '',
})

function PropertyCard({ listing, children }) {
  return (
    <>
      <div className="mt-3 h-44 overflow-hidden rounded-[16px] bg-[#edf4fa]">
        {listing?.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.listingTitle || 'Rental property'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-content-center gap-2 text-center text-xs font-semibold text-[#7890a6]">
            <Home className="mx-auto h-7 w-7" />
            {listing
              ? 'Listing image unavailable'
              : 'No property enquiry linked'}
          </div>
        )}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-[#102033]">
        {listing?.listingTitle ||
          listing?.title ||
          'No property enquiry captured'}
      </h3>
      {listing ? (
        <>
          <p className="mt-1 flex gap-1.5 text-sm text-[#60758b]">
            <MapPin size={15} />
            {listing.propertyAddress ||
              listing.address ||
              listing.suburb ||
              'Address not captured'}
          </p>
          <p className="mt-3 text-lg font-semibold text-[#102033]">
            {money(listing.monthlyRent)} / month
          </p>
          {listing.bedrooms != null ? (
            <p className="mt-3 flex gap-2 text-xs text-[#60758b]">
              <BedDouble size={15} />
              {listing.bedrooms} Beds
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-[#60758b]">
          The original enquired property will appear here once linked to this
          lead.
        </p>
      )}
      {children}
    </>
  )
}

export default function RentalTenantLeadWorkspace({
  lead,
  leadActivities = EMPTY_ROWS,
  tasks = EMPTY_ROWS,
  applications = EMPTY_ROWS,
  vacancies = EMPTY_ROWS,
  scope,
  options,
  actor,
  onReload,
  applicationContent,
  documentsContent,
  parentError = '',
}) {
  const [params, setParams] = useSearchParams()
  const tab = TENANT_WORKSPACE_TABS.includes(params.get('tab'))
    ? params.get('tab')
    : 'Overview'
  const selectTab = (value) => {
    const next = new URLSearchParams(params)
    value === 'Overview' ? next.delete('tab') : next.set('tab', value)
    setParams(next, { replace: true })
  }
  const [qualification, setQualification] = useState(() =>
    tenantQualificationValues(lead),
  )
  const [editing, setEditing] = useState(false)
  const [activity, setActivity] = useState(freshActivity)
  const [viewing, setViewing] = useState({
    listingId: '',
    startsAt: '',
    note: '',
  })
  const [assignee, setAssignee] = useState(lead.assignedAgentId || '')
  const [extra, setExtra] = useState({
    matches: [],
    viewings: [],
    communications: [],
    conversions: [],
    users: [],
    documents: [],
    errors: [],
    loading: true,
  })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const guard = useRef(false)
  const profileDrafts = useRef(new Map())
  const loadVersion = useRef(0)
  const planner = useRef(null)
  const qualificationPanel = useRef(null)
  const assignmentScopeLevel = scope.scopeLevel || options.scopeLevel
  const canAssign = ['organisation', 'branch'].includes(assignmentScopeLevel)
  const context = useMemo(
    () => ({
      organisationId: scope.organisationId,
      actor,
      scope: { ...options, ...scope, includeClosed: true },
    }),
    [actor, options, scope],
  )
  const loadExtra = useCallback(async () => {
    const version = ++loadVersion.current
    setExtra((current) => ({ ...current, loading: true }))
    const results = await Promise.allSettled([
      listRentalLeadMatches(scope.organisationId, lead.id, {
        ...options,
        ...scope,
        includeClosed: true,
      }),
      listRentalViewings(scope.assignedAgentId, {
        ...buildRentalListingQueryOptions(scope),
        requireActivity: true,
      }),
      listRentalLeadCommunications(scope.organisationId, lead.id, {
        ...options,
        includeClosed: true,
      }),
      Promise.all(
        applications.map((item) =>
          getRentalApplicationTenancyConversion(item.id),
        ),
      ),
      canAssign
        ? listOrganisationUsersForWorkspace({
            organisationId: scope.organisationId,
          })
        : Promise.resolve([]),
      Promise.all(
        applications.map((item) => getRentalApplicationReview(item.id)),
      ),
    ])
    const [matches, viewings, communications, conversions, users, reviews] =
      results.map((result) =>
        result.status === 'fulfilled' ? result.value : null,
      )
    const names = [
      'Rental matches',
      'Viewing appointments',
      'Activity history',
      'Lease and tenancy status',
      'Agent directory',
      'Application documents',
    ]
    if (version !== loadVersion.current) return
    setExtra({
      matches: matches?.matches || [],
      viewings: (viewings || []).filter(
        (item) => item.tenantLeadId === lead.id,
      ),
      communications: communications || [],
      conversions: (conversions || []).filter(Boolean),
      users: users || [],
      documents: (reviews || []).flatMap((review) =>
        (review?.documents || []).map((document) => ({
          ...document,
          applicationId: review.id,
        })),
      ),
      loading: false,
      errors: results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [`${names[index]}: ${result.reason?.message || 'Unable to load'}`]
          : [],
      ),
    })
  }, [applications, canAssign, lead.id, options, scope])
  useEffect(() => {
    void loadExtra()
    return () => {
      loadVersion.current += 1
    }
  }, [loadExtra, lead.monthlyBudget, lead.desiredArea, lead.bedrooms])
  useEffect(() => {
    if (!editing) setQualification(tenantQualificationValues(lead))
  }, [lead, editing])
  useEffect(() => {
    setAssignee(lead.assignedAgentId || '')
  }, [lead.id, lead.assignedAgentId])
  const progress = tenantQualificationProgress(lead)
  const savedQualification = tenantQualificationValues(lead)
  const stage = tenantJourneyStage(lead, extra.conversions, applications)
  const onboardingSent = applications.some((item) => item.data?.onboarding?.sentAt)
  const journeyRail = useRef(null)
  useEffect(() => {
    const rail = journeyRail.current
    const current = rail?.querySelector('[aria-current="step"]')
    if (!current || typeof rail.scrollTo !== 'function') return
    const left = current.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft - (rail.clientWidth - current.clientWidth) / 2
    rail.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [stage])
  const matches = tenantBudgetMatches(lead, extra.matches)
  const enquiry = tenantEnquiryProperty(lead, extra.matches, vacancies)
  const eligibleUsers = extra.users.filter(
    (user) =>
      user.userId &&
      ['active', 'accepted'].includes(text(user.status).toLowerCase()) &&
      user.organisationId === scope.organisationId &&
      (assignmentScopeLevel !== 'branch' || user.branchId === (scope.branchId || options.branchId)),
  ).sort((a, b) => text(a.fullName || a.email).localeCompare(text(b.fullName || b.email)))
  const visibleActivities = leadActivities.filter(
    item => !extra.communications.length || item.outcome !== 'communication_event',
  )
  const owner = extra.users.find((user) => user.userId === lead.assignedAgentId)
  const ownerName =
    owner?.fullName ||
    (lead.assignedAgentId === actor.id && actor.name
      ? actor.name
      : lead.assignedAgentName) ||
    'Unassigned'
  const next = {
    new: [
      'Contact the tenant',
      'Make first contact and capture their rental requirements.',
      'Mark contacted',
    ],
    contacted: [
      'Qualify the tenant',
      'Confirm budget, move date and rental requirements before arranging a viewing.',
      'Mark qualified',
    ],
    qualified: [
      'Arrange a viewing',
      'Choose a suitable rental property and confirm a viewing time.',
      'Arrange a viewing',
    ],
    viewing_scheduled: [
      'Record the viewing outcome',
      'Confirm attendance before inviting the tenant to apply.',
      'View appointments',
    ],
    viewing_completed: [
      'Invite an application',
      'Move this tenant into the application step.',
      'Invite application',
    ],
    application_pending: [
      'Collect the application',
      'Create or reopen the tenant’s secure application link.',
      'Open application',
    ],
    application_submitted: [
      'Start screening',
      'Review the submitted application before continuing.',
      'Start screening',
    ],
    screening_pending: [
      'Complete screening',
      'Review the screening results and supporting evidence.',
      'Open application',
    ],
    fica_pending: [
      'Collect FICA documents',
      'Verify the tenant’s required identity and address documents.',
      'Open documents',
    ],
    fica_complete: [
      'Confirm placement readiness',
      'Confirm the application and verified documents are ready for placement.',
      'Confirm readiness',
    ],
    placement_ready: [
      'Prepare the lease',
      'Open the approved application to prepare the linked lease and tenancy.',
      'Open application',
    ],
  }[lead.stage] || [
    'Review the tenant',
    'Review this tenant’s linked records.',
    'Open application',
  ]
  async function run(key, action, success) {
    if (guard.current) return
    guard.current = true
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(success)
      await onReload()
    } catch (cause) {
      setError(cause?.message || 'Unable to save this tenant lead change.')
    } finally {
      guard.current = false
      setBusy('')
    }
  }
  const changeQualification = (key, value) =>
    setQualification((current) => ({ ...current, [key]: value }))
  async function advance(toStage, evidence = {}) {
    await advanceRentalLead(lead, { ...context, toStage, evidence })
  }
  function nextAction() {
    if (lead.stage === 'new')
      void run(
        'journey',
        () => advance('contacted'),
        'Tenant marked contacted.',
      )
    else if (lead.stage === 'contacted') {
      if (progress.count < 10) {
        setEditing(true)
        qualificationPanel.current?.scrollIntoView({ behavior: 'smooth' })
        setNotice(
          'Complete the ten tenant qualification answers before marking the tenant qualified.',
        )
      } else
        void run(
          'journey',
          () => advance('qualified', { qualificationOutcome: 'qualified' }),
          'Tenant marked qualified.',
        )
    } else if (lead.stage === 'qualified')
      planner.current?.scrollIntoView({ behavior: 'smooth' })
    else if (lead.stage === 'viewing_scheduled') selectTab('Appointments')
    else if (lead.stage === 'viewing_completed')
      void run(
        'journey',
        () => advance('application_pending'),
        'Tenant ready for an application.',
      )
    else if (lead.stage === 'application_submitted')
      void run(
        'journey',
        () => advance('screening_pending'),
        'Screening started.',
      )
    else if (lead.stage === 'fica_complete')
      void run(
        'journey',
        () => advance('placement_ready'),
        'Placement readiness confirmed.',
      )
    else selectTab(lead.stage === 'fica_pending' ? 'Documents' : 'Application')
  }
  async function schedule(event) {
    event.preventDefault()
    if (
      !['qualified', 'viewing_scheduled', 'viewing_completed'].includes(
        lead.stage,
      )
    ) {
      setError('Qualify the tenant before booking a viewing.')
      return
    }
    if (!extra.matches.some((item) => item.listing.id === viewing.listingId)) {
      setError('Choose a rental listing available in this workspace.')
      return
    }
    await run(
      'viewing',
      async () => {
        await createRentalViewing(
          { ...viewing, tenantLeadId: lead.id, tenantName: lead.name },
          { assignedAgentId: scope.assignedAgentId },
        )
        if (lead.stage === 'qualified')
          await advance('viewing_scheduled', { scheduledFor: viewing.startsAt })
        setViewing({ listingId: '', startsAt: '', note: '' })
      },
      'Viewing booked.',
    )
  }
  async function outcome(item, value) {
    await run(
      'viewing',
      async () => {
        await recordRentalViewingOutcome(item, value, '', {
          assignedAgentId: scope.assignedAgentId,
        })
        if (value === 'attended') {
          let current = lead
          if (current.stage === 'qualified')
            current = await advanceRentalLead(current, {
              ...context,
              toStage: 'viewing_scheduled',
            })
          if (current.stage === 'viewing_scheduled')
            await advanceRentalLead(current, {
              ...context,
              toStage: 'viewing_completed',
              evidence: { viewingOutcome: 'attended' },
            })
        }
      },
      'Viewing outcome recorded.',
    )
  }
  const renderQualification = ({ profile = false } = {}) => (
    <section ref={qualificationPanel} className="tenant-card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tenant-eyebrow">Tenant qualification</p>
          <h2 className="mt-1 text-lg font-semibold text-[#102033]">
            Phone qualification questions
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-24 overflow-hidden rounded-full bg-[#e8eef5]">
              <span
                className="block h-full bg-[#157aaf]"
                style={{ width: `${progress.percent}%` }}
              />
            </span>
            <span className="text-xs font-semibold text-[#60758b]">
              {progress.count}/10 captured
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={() => setEditing((current) => !current)}
        >
          <Pencil size={14} />
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>
      {editing || profile ? (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              'qualification',
              async () => {
                await updateRentalLeadQualification(
                  lead.id,
                  qualification,
                  context,
                )
                setEditing(false)
              },
              'Tenant qualification saved.',
            )
          }}
        >
          {TENANT_QUESTIONS.map((question) => (
            <div
              key={question.key}
              className={question.type === 'textarea' ? 'sm:col-span-2' : ''}
            >
              {question.boolean ? (
                <fieldset>
                  <legend className="tenant-label">{question.question}</legend>
                  <div className="mt-2 flex gap-2">
                    {question.options.map((value, index) => (
                      <button
                        type="button"
                        key={value}
                        data-rental-control="tenant-answer"
                        aria-pressed={qualification[question.key] === value}
                        className={`tenant-answer ${qualification[question.key] === value ? 'tenant-answer-selected' : ''}`}
                        onClick={() => changeQualification(question.key, value)}
                      >
                        {question.key === 'pets'
                          ? index === 0
                            ? 'No'
                            : 'Yes'
                          : value}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <label className="form-field">
                  <span>{question.question}</span>
                  {question.options ? (
                    <select
                      value={qualification[question.key]}
                      onChange={(event) =>
                        changeQualification(question.key, event.target.value)
                      }
                    >
                      <option value="">Select status</option>
                      {question.options.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  ) : question.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={qualification[question.key]}
                      onChange={(event) =>
                        changeQualification(question.key, event.target.value)
                      }
                    />
                  ) : (
                    <input
                      required={question.key === 'desiredArea'}
                      type={question.type || 'text'}
                      min={question.type === 'number' ? '0' : undefined}
                      step={question.key === 'occupants' ? '1' : 'any'}
                      value={qualification[question.key]}
                      onChange={(event) =>
                        changeQualification(question.key, event.target.value)
                      }
                    />
                  )}
                </label>
              )}
              {question.key === 'propertyNeed' ? (
                <label className="form-field mt-2">
                  <span>Bedrooms required</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={qualification.bedrooms}
                    onChange={(event) =>
                      changeQualification('bedrooms', event.target.value)
                    }
                  />
                </label>
              ) : null}
            </div>
          ))}
          <div className="flex justify-end gap-2 border-t border-[#edf3f8] pt-4 sm:col-span-2">
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() => setQualification(tenantQualificationValues(lead))}
            >
              Reset
            </Button>
            <Button type="submit" disabled={Boolean(busy)}>
              {busy === 'qualification' ? 'Saving…' : 'Save qualification'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 grid flex-1 auto-rows-fr border-t border-[#edf3f8] sm:grid-cols-2">
          {TENANT_QUESTIONS.map((question, index) => {
            const Icon = icons[index]
            const value = savedQualification[question.key]
            return (
              <div
                key={question.key}
                className="flex min-w-0 items-center gap-3 border-b border-[#edf3f8] py-4 sm:px-3 sm:odd:border-r"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#eef5fb] text-[#1d65a6]">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#29435d]">
                    {question.label}
                  </p>
                  <p
                    className={`mt-1 break-words text-sm ${text(value) ? 'font-semibold text-[#102033]' : 'text-[#8ea0b2]'}`}
                  >
                    {text(value)
                      ? question.key === 'monthlyBudget'
                        ? money(value)
                        : value
                      : 'Not captured'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
  const Logger = (
    <section className="tenant-card">
      <p className="tenant-eyebrow">Activity logger</p>
      <h2 className="mt-1 text-base font-semibold text-[#102033]">
        Capture touchpoint
      </h2>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void run(
            'activity',
            async () => {
              await logRentalLeadCommunication(lead, activity, context)
              setActivity(freshActivity())
            },
            'Activity recorded.',
          )
        }}
      >
        <div className="grid grid-cols-4 gap-1 rounded-[14px] bg-[#f3f7fb] p-1">
          {['call', 'email', 'whatsapp', 'note'].map((value) => (
            <button
              data-rental-control="tenant-activity-type"
              type="button"
              key={value}
              aria-pressed={activity.communicationType === value}
              className={`rounded-[10px] px-2 py-2 text-xs font-semibold ${activity.communicationType === value ? 'bg-white text-[#20364c] shadow-sm' : 'text-[#60758b]'}`}
              onClick={() =>
                setActivity((current) => ({
                  ...current,
                  communicationType: value,
                }))
              }
            >
              {label(value)}
            </button>
          ))}
        </div>
        <label className="form-field">
          <span>Direction</span>
          <select
            value={activity.direction}
            onChange={(event) =>
              setActivity((current) => ({
                ...current,
                direction: event.target.value,
              }))
            }
          >
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <label className="form-field">
          <span>Activity summary</span>
          <textarea
            required
            rows={3}
            value={activity.summary}
            onChange={(event) =>
              setActivity((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
          />
        </label>
        <label className="form-field">
          <span>Outcome</span>
          <input
            value={activity.outcome}
            onChange={(event) =>
              setActivity((current) => ({
                ...current,
                outcome: event.target.value,
              }))
            }
            placeholder="Reached, voicemail, replied…"
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={Boolean(busy)}>
            {busy === 'activity' ? 'Saving…' : 'Log activity'}
          </Button>
        </div>
      </form>
    </section>
  )
  const Planner = (
    <section ref={planner} className="tenant-card">
      <p className="tenant-eyebrow">Viewing planner</p>
      <h2 className="mt-1 text-xl font-semibold text-[#102033]">
        Arrange a rental viewing
      </h2>
      <form
        className="mt-4 grid gap-4 md:grid-cols-2"
        onSubmit={(event) => void schedule(event)}
      >
        <label className="form-field">
          <span>Rental property</span>
          <select
            required
            value={viewing.listingId}
            onChange={(event) =>
              setViewing((current) => ({
                ...current,
                listingId: event.target.value,
              }))
            }
          >
            <option value="">Choose property</option>
            {matches.map(({ listing }) => (
              <option key={listing.id} value={listing.id}>
                {listing.listingTitle || listing.title} ·{' '}
                {money(listing.monthlyRent)}
              </option>
            ))}
            {enquiry?.id &&
            !matches.some((item) => item.listing.id === enquiry.id) &&
            extra.matches.some((item) => item.listing.id === enquiry.id) ? (
              <option value={enquiry.id}>
                {enquiry.listingTitle} · {money(enquiry.monthlyRent)}
              </option>
            ) : null}
          </select>
        </label>
        <label className="form-field">
          <span>Viewing time</span>
          <input
            required
            type="datetime-local"
            value={viewing.startsAt}
            onChange={(event) =>
              setViewing((current) => ({
                ...current,
                startsAt: event.target.value,
              }))
            }
          />
        </label>
        <label className="form-field md:col-span-2">
          <span>Viewing note / access requirements</span>
          <textarea
            rows={2}
            value={viewing.note}
            onChange={(event) =>
              setViewing((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
          <p className="text-xs text-[#60758b]">
            {lead.stage === 'new' || lead.stage === 'contacted'
              ? 'Qualify the tenant before booking a viewing.'
              : `${matches.length} rentals within the captured monthly budget.`}
          </p>
          <Button
            type="submit"
            disabled={
              Boolean(busy) ||
              !['qualified', 'viewing_scheduled', 'viewing_completed'].includes(
                lead.stage,
              ) ||
              !viewing.listingId ||
              !viewing.startsAt
            }
          >
            <CalendarDays size={16} />
            {busy === 'viewing' ? 'Booking…' : 'Book viewing'}
          </Button>
        </div>
      </form>
    </section>
  )
  const Appointments = (
    <section className="tenant-card">
      <p className="tenant-eyebrow">Appointments</p>
      <h2 className="mt-1 text-lg font-semibold text-[#102033]">
        Tenant viewings
      </h2>
      <div className="mt-4 space-y-3">
        {extra.viewings.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-[#dce7f2] p-4"
          >
            <p className="font-semibold text-[#20364c]">
              {item.listingTitle || 'Rental viewing'}
            </p>
            <p className="mt-1 text-sm text-[#60758b]">{date(item.startsAt)}</p>
            {item.outcome ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#20364c]">
                  {label(item.outcome)}
                </span>
                {item.outcome === 'attended' &&
                ['qualified', 'viewing_scheduled'].includes(lead.stage) ? (
                  <Button
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void outcome(item, 'attended')}
                  >
                    Sync tenant journey
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  'attended',
                  'no_show',
                  'cancelled',
                  'reschedule_requested',
                ].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void outcome(item, value)}
                  >
                    {label(value)}
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))}
        {!extra.viewings.length ? (
          <p className="text-sm text-[#60758b]">
            {extra.loading
              ? 'Loading viewings…'
              : 'No viewings booked for this tenant yet.'}
          </p>
        ) : null}
      </div>
    </section>
  )
  return (
    <main className="rental-tenant-workspace mx-auto w-full max-w-[1600px] py-2">
      <MobileDashboardShell>
        <section className="overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_22px_52px_rgba(31,54,78,0.08)]">
          <div className="grid lg:grid-cols-[minmax(0,1.32fr)_minmax(340px,.92fr)]">
            <div className="flex min-h-[290px] min-w-0 flex-col justify-between gap-8 bg-[#0b2b4c] p-6 text-white sm:p-8">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">
                    Tenant lead
                  </span>
                  <span className="rounded-full bg-[#2f7b9e]/25 px-3 py-1 text-xs font-semibold text-[#ccecff] ring-1 ring-[#66b4dd]/25">
                    {lead.stageLabel}
                  </span>
                </div>
                <h1 className="mt-7 break-words text-[2.2rem] font-bold leading-tight tracking-[-.035em] text-white sm:text-[2.8rem]">
                  {lead.name}
                </h1>
                <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-white/90">
                  <Home size={16} />
                  {lead.desiredArea || 'Area pending'}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
                {lead.phone ? (
                  <a
                    data-rental-control="tenant-contact"
                    href={`tel:${lead.phone}`}
                    className="inline-flex gap-2 text-white/90"
                  >
                    <Phone size={16} />
                    {lead.phone}
                  </a>
                ) : null}
                {lead.email ? (
                  <a
                    data-rental-control="tenant-contact"
                    href={`mailto:${lead.email}`}
                    className="inline-flex min-w-0 items-center gap-2 text-white/90"
                  >
                    <Mail size={16} />
                    <span className="truncate">{lead.email}</span>
                  </a>
                ) : null}
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Users size={16} />
                  <span className="truncate">{ownerName}</span>
                </span>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <p className="tenant-eyebrow">Tenant readiness</p>
              <div className="mt-5 flex flex-col items-center justify-center gap-5 sm:flex-row sm:flex-wrap">
                <div className="text-center">
                  <div
                    className="grid h-36 w-36 place-items-center rounded-full"
                    role="progressbar"
                    aria-label="Tenant readiness"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    style={{
                      background: `conic-gradient(#2f7b9e ${progress.percent * 3.6}deg,#e6edf4 0deg)`,
                    }}
                  >
                    <div className="grid h-28 w-28 place-items-center rounded-full bg-white">
                      <strong className="text-3xl font-bold text-[#102033]">
                        {progress.percent}
                      </strong>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#20364c]">
                    {progress.count}/10 answers captured
                  </p>
                </div>
                <dl className="w-full min-w-0 divide-y divide-[#e8eef5] rounded-[16px] border border-[#e1eaf4] bg-[#fbfdff] sm:w-auto sm:flex-1">
                  {[
                    ['Budget', money(lead.monthlyBudget)],
                    [
                      'Employment',
                      lead.qualification?.employmentStatus || 'Not captured',
                    ],
                    [
                      'Deposit',
                      lead.qualification?.depositAvailable || 'Not captured',
                    ],
                    ['Move date', lead.occupationDate || 'Not captured'],
                  ].map(([title, value]) => (
                    <div
                      key={title}
                      className="flex justify-between gap-3 p-3 text-xs"
                    >
                      <dt className="font-semibold text-[#20364c]">{title}</dt>
                      <dd className="min-w-0 break-words text-right text-[#60758b]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>
        <nav
          className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-[16px] border border-[#dbe7f2] bg-white p-1.5 sm:grid-cols-3 lg:grid-cols-7"
          aria-label="Tenant lead workspace"
        >
          {TENANT_WORKSPACE_TABS.map((title, index) => {
            const Icon = [
              Home,
              SearchCheck,
              Users,
              ClipboardCheck,
              FileText,
              CalendarDays,
              MessageCircle,
            ][index]
            return (
              <button
                type="button"
                data-rental-control="tenant-tab"
                key={title}
                aria-pressed={tab === title}
                onClick={() => selectTab(title)}
                className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-center text-sm font-semibold ${tab === title ? 'bg-[#edf3fa] text-[#20364c]' : 'text-[#60758b] hover:bg-[#f8fafc]'}`}
              >
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                <span>{title}</span>
              </button>
            )
          })}
        </nav>
        <section className="min-w-0 overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_16px_42px_rgba(31,54,78,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf3f8] px-5 py-5 sm:px-8">
            <div>
              <p className="tenant-eyebrow">Tenant journey</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{stage === 4 && !onboardingSent ? 'Tenant onboarding' : TENANT_JOURNEY[stage]}</h2>
            </div>
            <span className="rounded-full border border-[#cbdcf5] bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#245f86]">Stage {stage + 1} of {TENANT_JOURNEY.length}</span>
          </div>
          <div ref={journeyRail} className="overflow-x-auto px-5 py-6 sm:px-8">
            <ol aria-label="Tenant journey stages" className="grid min-w-[1040px] grid-cols-8 gap-0">
              {TENANT_JOURNEY.map((title, index) => {
                const current = stage === index
                const completed = index < stage
                return <li key={title} aria-current={current ? 'step' : undefined} className="relative px-1.5">
                  {index < TENANT_JOURNEY.length - 1 ? <span aria-hidden="true" className={`absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-[32px] h-0.5 ${completed ? 'bg-[#9bc7de]' : 'bg-[#dce6f1]'}`} /> : null}
                  <div className={`relative flex min-h-[140px] flex-col items-center px-2 py-3 text-center ${current ? 'rounded-[18px] border border-[#cfe0ee] bg-[#f4f9fc] shadow-[0_10px_22px_rgba(31,54,78,0.06)]' : ''}`}>
                    <span className={`z-10 grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-bold ${current ? 'border-[#2f7b9e] bg-white text-[#245f86] shadow-[0_0_0_7px_rgba(47,123,158,0.12)]' : completed ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white' : 'border-[#cad7e5] bg-white text-[#8fa1b4]'}`}>
                      {completed ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}
                    </span>
                    <span className="mt-4 text-sm font-semibold leading-5 text-[#203a54]">{title}</span>
                    <span className="mt-1 text-xs font-semibold text-[#6d839b]">{current ? index === 4 && !onboardingSent ? 'Ready to send' : 'Current stage' : completed ? 'Complete' : 'Upcoming'}</span>
                    {current ? <span className="mt-2 rounded-full bg-[#dfeef7] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[#245f86]">Live</span> : null}
                  </div>
                </li>
              })}
            </ol>
          </div>
        </section>
        {parentError || error ? (
          <p
            role="alert"
            className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-4 text-sm text-[#9f3131]"
          >
            {error || parentError}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-xl border border-[#cfe8dc] bg-[#effaf3] p-3 text-sm text-[#26724c]"
          >
            {notice}
          </p>
        ) : null}
        {extra.errors.length ? (
          <p
            role="alert"
            className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]"
          >
            {extra.errors.join(' · ')}
          </p>
        ) : null}
        {tab === 'Overview' ? (
          <>
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
              {renderQualification()}
              <div className="grid content-start gap-5">
                <section className="tenant-next tenant-card flex flex-col">
                  <p className="tenant-eyebrow">What’s next</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    {next[0]}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#c7d5e2]">{next[1]}</p>
                  <button
                    data-rental-control="tenant-next-action"
                    type="button"
                    disabled={Boolean(busy)}
                    className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#102033]"
                    onClick={nextAction}
                  >
                    {next[2]}
                  </button>
                </section>
                <section className="tenant-card">
                  <p className="tenant-eyebrow">Lead assigned to</p>
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f7fafc] p-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eaf6ef] text-sm font-bold text-[#167149]" aria-hidden="true">
                      {ownerName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#18324b]">{ownerName}</p>
                      <p className="mt-1 truncate text-xs text-[#60758b]" title={owner?.email || lead.assignedAgentEmail || ''}>{owner?.email || lead.assignedAgentEmail || 'Primary agent'}</p>
                    </div>
                  </div>
                  <form className="mt-5 grid gap-3 border-t border-[#edf3f8] pt-4" onSubmit={(event) => {
                    event.preventDefault()
                    if (!canAssign || !eligibleUsers.some((user) => user.userId === assignee) || assignee === lead.assignedAgentId) return
                    void run('assignment', () => assignRentalLead(lead.id, assignee, context), 'Lead assignment saved.')
                  }}>
                    <label className="grid gap-2 text-sm font-medium text-[#29435d]">
                      Assigned agent
                      <select
                        aria-label="Assign tenant lead"
                        className="h-11 w-full min-w-0 rounded-xl border border-[#dce7f2] bg-white px-3 text-sm text-[#18324b] outline-none focus:border-[#91abc0] focus:ring-2 focus:ring-[#eef4fa] disabled:bg-[#f7fafc] disabled:text-[#60758b]"
                        value={assignee}
                        disabled={!canAssign || extra.loading || Boolean(busy) || !eligibleUsers.length}
                        onChange={(event) => setAssignee(event.target.value)}
                      >
                        <option value="">{extra.loading && canAssign ? 'Loading agents…' : 'Choose agent'}</option>
                        {lead.assignedAgentId && !eligibleUsers.some((user) => user.userId === lead.assignedAgentId) ? <option value={lead.assignedAgentId}>{ownerName} (current)</option> : null}
                        {eligibleUsers.map((user) => <option key={user.userId} value={user.userId}>{user.fullName || user.email}</option>)}
                      </select>
                    </label>
                    {canAssign ? <>
                      {!extra.loading && !eligibleUsers.length ? <p className="text-xs text-[#60758b]">No active agents available in this workspace.</p> : null}
                      <Button type="submit" size="sm" className="justify-self-end" disabled={extra.loading || Boolean(busy) || !eligibleUsers.some((user) => user.userId === assignee) || assignee === lead.assignedAgentId}>{busy === 'assignment' ? 'Saving…' : 'Save assignment'}</Button>
                    </> : <p className="text-xs leading-5 text-[#60758b]">Your branch or organisation manager can change the assigned agent.</p>}
                  </form>
                </section>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="tenant-card">
                <p className="tenant-eyebrow">Property enquiry</p>
                <PropertyCard listing={enquiry}>
                  {enquiry?.id ? (
                    <Link
                      data-rental-control="tenant-property"
                      className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#315b7a]"
                      to={`/agent/rentals/listings/${enquiry.id}`}
                    >
                      View listing
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : null}
                </PropertyCard>
              </section>
              {Logger}
            </div>
            <section className="tenant-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="tenant-eyebrow">Viewing request</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#102033]">
                    Confirm the tenant’s preferred viewing
                  </h2>
                  <p className="mt-2 text-sm text-[#60758b]">
                    {extra.viewings.length
                      ? `${extra.viewings.length} viewing appointments linked to this tenant.`
                      : 'Choose the enquired property or a rental match and agree on a suitable time.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    planner.current?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  <CalendarDays size={16} />
                  Plan viewing
                </Button>
              </div>
            </section>
            {Planner}
          </>
        ) : null}
        {tab === 'Tenant profile' ? <RentalTenantApplicationProfile draftsRef={profileDrafts} applications={applications} lead={lead} onReload={onReload} onSetup={() => selectTab('Application')} documentsContent={documentsContent} requirementsContent={renderQualification({ profile: true })} /> : null}
        {tab === 'Matches' ? (
          <section className="tenant-card">
            <p className="tenant-eyebrow">Rental matches</p>
            <h2 className="mt-1 text-lg font-semibold text-[#102033]">
              Properties within {money(lead.monthlyBudget)} per month
            </h2>
            <p className="mt-2 text-sm text-[#60758b]">Monthly rates only. Confirm availability, pet policy and other requirements before arranging a viewing.</p>
            <Button type="button" variant="secondary" size="sm" className="mt-3" disabled={extra.loading} onClick={() => void loadExtra()}>
              Refresh matches
            </Button>
            {extra.loading ? (
              <p className="mt-4 text-sm text-[#60758b]">Finding rentals…</p>
            ) : extra.errors.some((message) => message.startsWith('Rental matches:')) ? (
              <p className="mt-4 text-sm text-[#9f3131]">Rental matches could not load. Refresh matches to retry.</p>
            ) : !matches.length ? (
              <p className="mt-4 text-sm text-[#60758b]">
                {Number(lead.monthlyBudget) > 0
                  ? 'No rental listings match this budget in the current workspace.'
                  : 'Capture a monthly budget to find rentals in the tenant’s price class.'}
              </p>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {matches.map((match) => (
                  <article
                    key={match.listing.id}
                    className="rounded-2xl border border-[#dce7f2] p-4"
                  >
                    <PropertyCard listing={match.listing}>
                      <p className="mt-3 text-xs text-[#60758b]">
                        Area {!text(lead.desiredArea) ? 'not captured' : match.locationMatch ? 'matches' : 'needs review'}{' '}
                        · Bedrooms{' '}
                        {match.listing.bedrooms == null ? 'not captured' : match.bedroomMatch ? 'match' : 'need review'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link className="inline-flex items-center gap-1 rounded-lg border border-[#dce7f2] px-3 py-2 text-sm font-semibold text-[#315b7a]" to={`/agent/rentals/listings/${encodeURIComponent(match.listing.id)}`}>
                          Open listing <ArrowUpRight size={15} />
                        </Link>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void run(
                              'shortlist',
                              () =>
                                recordRentalLeadListingShortlist(
                                  lead,
                                  match,
                                  context,
                                ),
                              'Rental shortlisted.',
                            )
                          }
                        >
                          Shortlist
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setViewing((current) => ({
                              ...current,
                              listingId: match.listing.id,
                            }))
                            selectTab('Appointments')
                          }}
                        >
                          Plan viewing
                        </Button>
                      </div>
                    </PropertyCard>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
        {tab === 'Application' ? (
          <>
            {applicationContent}
            {extra.conversions.map((item) => (
              <section key={item.id} className="tenant-card">
                <p className="tenant-eyebrow">Lease & tenancy</p>
                <Link
                  className="mt-3 inline-flex items-center gap-2 font-semibold text-[#315b7a]"
                  data-rental-control="tenant-linked-tenancy"
                  to={`/agent/rentals/tenancies/${item.id}`}
                >
                  Open linked tenancy
                  <ArrowUpRight size={16} />
                </Link>
              </section>
            ))}
          </>
        ) : null}
        {tab === 'Documents' ? (
          <>
            {documentsContent}
            <section className="tenant-card">
              <p className="tenant-eyebrow">Application documents</p>
              <div className="mt-4 space-y-3">
                {extra.documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dce7f2] p-3 text-sm"
                  >
                    <span className="font-semibold text-[#20364c]">
                      {label(document.type)}
                    </span>
                    <span className="text-[#60758b]">
                      {label(document.status)}
                    </span>
                    <Link
                      data-rental-control="tenant-document-review"
                      to={`/agent/rentals/applications/${document.applicationId}`}
                      className="font-semibold text-[#315b7a]"
                    >
                      Review application
                    </Link>
                  </div>
                ))}
                {!extra.documents.length ? (
                  <p className="text-sm text-[#60758b]">
                    {extra.loading
                      ? 'Loading documents…'
                      : 'No application documents attached yet.'}
                  </p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
        {tab === 'Appointments' ? (
          <>
            {Planner}
            {Appointments}
          </>
        ) : null}
        {tab === 'Activity' ? (
          <>
            {Logger}
            <section className="tenant-card">
              <p className="tenant-eyebrow">Activity history</p>
              <div className="mt-4 divide-y divide-[#edf3f8]">
                {extra.communications.map((item) => (
                  <article key={item.communicationId} className="py-3">
                    <p className="font-semibold text-[#20364c]">
                      {label(item.communicationType)} · {label(item.direction)}
                    </p>
                    <p className="mt-1 text-sm text-[#60758b]">
                      {item.summary || item.message}
                    </p>
                    <p className="mt-1 text-xs text-[#7890a8]">
                      {date(item.occurredAt)}
                    </p>
                  </article>
                ))}
                {visibleActivities.map((item) => (
                  <article key={item.activityId} className="py-3">
                    <p className="font-semibold text-[#20364c]">
                      {item.activityType}
                    </p>
                    <p className="mt-1 text-sm text-[#60758b]">
                      {item.activityNote || item.outcome}
                    </p>
                    <p className="mt-1 text-xs text-[#7890a8]">
                      {date(item.activityDate)}
                    </p>
                  </article>
                ))}
                {!extra.communications.length && !visibleActivities.length ? (
                  <p className="text-sm text-[#60758b]">
                    No activity recorded for this tenant yet.
                  </p>
                ) : null}
              </div>
              {tasks.length ? (
                <div className="mt-4 border-t border-[#edf3f8] pt-4">
                  <h2 className="font-semibold text-[#20364c]">Follow-ups</h2>
                  {tasks.map((item) => (
                    <p
                      key={item.taskId}
                      className="mt-2 text-sm text-[#60758b]"
                    >
                      {item.title} · {date(item.dueDate)}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </MobileDashboardShell>
    </main>
  )
}
