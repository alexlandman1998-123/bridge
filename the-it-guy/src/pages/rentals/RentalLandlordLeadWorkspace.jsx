import RentalLandlordOnboardingPanel from '../../modules/rentals/shared/applications/RentalLandlordOnboardingPanel.jsx'
import { rentalLandlordDiscovery, LANDLORD_CONDITIONAL_OPTIONS, rentalLandlordPropertyFieldVisible } from '../../services/rentals/rentalLandlordOnboardingModel.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  MessageCircle,
  CheckCircle2,
  FileText,
  Home,
  Mail,
  Phone,
  Plus,
  Users,
  X,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import { listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { assignRentalLead } from '../../services/rentals/rentalLeadService'
import { MobileDashboardShell } from '../../components/dashboard/PremiumDashboard'
import {
  LANDLORD_TABS,
  LANDLORD_TYPES,
  PROFILE_FIELDS,
  PERSON_FIELDS,
  PROPERTY_GROUPS,
  landlordWorkspace,
  landlordMandateReadiness,
} from '../../services/rentals/rentalLandlordWorkspaceModel'
import {
  saveRentalLandlordProfile,
  saveRentalLandlordProperty,
  saveRentalLandlordDocument,
  recordRentalLandlordPortfolioMandate,
} from '../../services/rentals/rentalLandlordWorkspaceService'
import {
  listRentalLeadCommunications,
  logRentalLeadCommunication,
} from '../../services/rentals/rentalLeadCommunicationService'
import {
  createRentalLeadFollowUp,
  completeRentalLeadFollowUp,
} from '../../services/rentals/rentalLeadFollowUpService'
import {
  getRentalLeadStageLabel,
  RENTAL_LANDLORD_PIPELINE_STAGES,
} from '../../services/rentals/rentalLeadPipelineModel'
import { listRentalProperties } from '../../services/rentals/rentalPropertyRepository'
import './RentalTenantLeadWorkspace.css'
const EMPTY = []
const text = (value) => String(value ?? '').trim()
const money = (value) =>
  text(value)
    ? `R ${Number(value).toLocaleString('en-ZA')}`
    : 'Rent not captured'
const date = (value) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat('en-ZA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not scheduled'
const uid = () => crypto.randomUUID()
const selects = {
  ...LANDLORD_CONDITIONAL_OPTIONS,
  category: [
    ['residential', 'Residential'],
    ['commercial', 'Commercial'],
    ['industrial', 'Industrial'],
    ['retail', 'Retail'],
    ['vacant_land', 'Vacant land'],
    ['agricultural', 'Agricultural'],
  ],
  occupancy: [
    ['vacant', 'Vacant'],
    ['owner_occupied', 'Owner occupied'],
    ['tenanted', 'Tenanted'],
  ],
  ownership: [
    ['freehold', 'Freehold'],
    ['sectional_title', 'Sectional title'],
    ['leasehold', 'Leasehold'],
    ['other', 'Other'],
  ],
}
function Field({ field, values, onChange }) {
  const [key, title, type] = field
  const value = values[key] ?? ''
  if (type === 'boolean')
    return (
      <fieldset>
        <legend className="tenant-label">{title}</legend>
        <div className="mt-2 flex gap-2">
          {['Yes', 'No'].map((answer) => (
            <button
              key={answer}
              type="button"
              data-rental-control="landlord-answer"
              aria-pressed={value === answer}
              className={`tenant-answer ${value === answer ? 'tenant-answer-selected' : ''}`}
              onClick={() => onChange(key, answer)}
            >
              {answer}
            </button>
          ))}
        </div>
      </fieldset>
    )
  return (
    <label className="form-field">
      <span>{title}</span>
      {selects[type] ? (
        <select
          value={value}
          onChange={(event) => onChange(key, event.target.value)}
        >
          <option value="">Select {title.toLowerCase()}</option>
          {selects[type].map(([choice, label]) => (
            <option key={choice} value={choice}>
              {label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          rows={3}
          value={value}
          onChange={(event) => onChange(key, event.target.value)}
        />
      ) : (
        <input
          type={type || 'text'}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 'any' : undefined}
          value={value}
          onChange={(event) => onChange(key, event.target.value)}
        />
      )}
    </label>
  )
}
function Card({ title, children, className = '' }) {
  return (
    <section className={`tenant-card ${className}`}>
      <h2 className="text-lg font-semibold text-[#102033]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}
export default function RentalLandlordLeadWorkspace({
  lead,
  tasks = EMPTY,
  leadActivities = EMPTY,
  scope,
  options,
  actor,
  onReload,
  journeyContent,
  parentError = '',
}) {
  const [params, setParams] = useSearchParams()
  const tab = LANDLORD_TABS.includes(params.get('tab'))
    ? params.get('tab')
    : 'Overview'
  const saved = landlordWorkspace(lead)
  const [profile, setProfile] = useState(saved.profile)
  const [property, setProperty] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const guard = useRef(false)
  const [agents, setAgents] = useState([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const [assignee, setAssignee] = useState(lead.assignedAgentId || '')
  const assignmentScopeLevel = scope.scopeLevel || options.scopeLevel
  const canAssign = ['organisation', 'branch'].includes(assignmentScopeLevel)
  useEffect(() => {
    setAssignee(lead.assignedAgentId || '')
  }, [lead.id, lead.assignedAgentId])
  useEffect(() => {
    let active = true
    setAgents([])
    setAgentsError('')
    setAgentsLoading(canAssign)
    if (canAssign) {
      listOrganisationUsersForWorkspace({ organisationId: scope.organisationId })
        .then((users) => { if (active) setAgents(users || []) })
        .catch((cause) => { if (active) setAgentsError(cause.message || 'Unable to load agents.') })
        .finally(() => { if (active) setAgentsLoading(false) })
    }
    return () => { active = false }
  }, [canAssign, scope.organisationId])
  const eligibleUsers = agents.filter((user) => user.userId
    && ['active', 'accepted'].includes(String(user.status || '').toLowerCase())
    && user.organisationId === scope.organisationId
    && (assignmentScopeLevel !== 'branch' || user.branchId === (scope.branchId || options.branchId)))
    .sort((a, b) => String(a.fullName || a.email).localeCompare(String(b.fullName || b.email)))
  const owner = agents.find((user) => user.userId === lead.assignedAgentId)
  const ownerName = owner?.fullName || (lead.assignedAgentId === actor.id && actor.name ? actor.name : lead.assignedAgentName) || 'Unassigned'

  const [managedProperties, setManagedProperties] = useState([])
  const [managedError, setManagedError] = useState('')
  const [signedConfirmation, setSignedConfirmation] = useState(false)
  const [communications, setCommunications] = useState([])
  const [communicationError, setCommunicationError] = useState('')
  const [activity, setActivity] = useState({
    communicationType: 'call',
    direction: 'outbound',
    summary: '',
    outcome: '',
  })
  const [appointment, setAppointment] = useState({
    title: 'Landlord appraisal',
    dueDate: '',
    description: '',
    priority: 'Medium',
  })
  const [document, setDocument] = useState({
    id: uid(),
    name: '',
    reference: '',
    propertyId: '',
  })
  const context = useMemo(
    () => ({
      organisationId: scope.organisationId,
      actor,
      scope: { ...options, ...scope, includeClosed: true },
      expectedDiscovery: rentalLandlordDiscovery(lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {}),
    }),
    [actor, options, scope, lead],
  )
  useEffect(() => {
    setProfile(landlordWorkspace(lead).profile)
  }, [lead])
  useEffect(() => {
    let active = true
    listRentalLeadCommunications(scope.organisationId, lead.id, {
      ...options,
      includeClosed: true,
    })
      .then((rows) => {
        if (active) {
          setCommunications(rows)
          setCommunicationError('')
        }
      })
      .catch((cause) => {
        if (active)
          setCommunicationError(
            cause.message || 'Activity history could not be loaded.',
          )
      })
    return () => {
      active = false
    }
  }, [lead, scope.organisationId, options])
  useEffect(() => {
    let active = true
    ;(async () => {
      const rows = []
      for (let offset = 0; ; offset += 100) {
        const batch = await listRentalProperties({
          organisationId: scope.organisationId,
          branchId: scope.scopeLevel === 'organisation' ? '' : scope.branchId,
          limit: 100,
          offset,
        })
        rows.push(...batch)
        if (batch.length < 100) break
      }
      return rows
    })()
      .then((rows) => {
        if (active) setManagedProperties(rows)
      })
      .catch((cause) => {
        if (active) setManagedError(cause.message)
      })
    return () => {
      active = false
    }
  }, [scope.organisationId, scope.branchId, scope.scopeLevel])
  const selected = saved.portfolio.find(
    (item) => item.id === params.get('property'),
  )
  const readiness = landlordMandateReadiness(saved.profile, saved.portfolio)
  function chooseTab(value) {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    next.delete('property')
    setParams(next)
  }
  function openProperty(item) {
    setSignedConfirmation(false)
    const next = new URLSearchParams(params)
    next.set('tab', 'Portfolio')
    next.set('property', item.id)
    setParams(next)
    setProperty(null)
  }
  async function run(key, action, success) {
    if (guard.current) return
    guard.current = true
    setBusy(key)
    setError('')
    setNotice('')
    let saved = false
    try {
      await action()
      saved = true
      await onReload()
      setNotice(success)
    } catch (cause) {
      if (saved) setNotice(success)
      setError(saved
        ? `Saved, but the workspace could not refresh. Reload this page to see the updated record. ${cause.message || ''}`
        : cause.message || 'Unable to save this landlord change.')
    } finally {
      guard.current = false
      setBusy('')
    }
  }
  const updateProfile = (key, value) =>
    setProfile((current) => ({ ...current, [key]: value }))
  function peopleRole() {
    return (
      {
        company: 'Director',
        trust: 'Trustee',
        close_corporation: 'Member',
        multiple_owners: 'Owner',
        foreign_owner: 'Representative',
      }[profile.type] || 'Co-owner'
    )
  }
  function visibleField(key) {
    if (
      [
        'maritalStatus',
        'maritalRegime',
        'spouseName',
        'spouseIdNumber',
        'idNumber',
        'nationality',
      ].includes(key)
    )
      return ['individual', 'multiple_owners', 'foreign_owner'].includes(
        profile.type,
      )
    if (
      [
        'registrationNumber',
        'tradingName',
        'vatNumber',
        'resolutionDate',
      ].includes(key)
    )
      return [
        'company',
        'trust',
        'close_corporation',
        'foreign_owner',
      ].includes(profile.type)
    return true
  }
  const history = leadActivities.filter(
    (item) => !communications.length || item.outcome !== 'communication_event',
  )
  const stageIndex = Math.max(0, RENTAL_LANDLORD_PIPELINE_STAGES.indexOf(lead.stage))
  const journeyRail = useRef(null)
  useEffect(() => {
    const rail = journeyRail.current
    const current = rail?.querySelector('[aria-current="step"]')
    if (!current || typeof rail.scrollTo !== 'function') return
    const left = current.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft - (rail.clientWidth - current.clientWidth) / 2
    rail.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [stageIndex, tab])
  const primaryListing = saved.portfolio.find((item) => item.listingId)
  const portfolioCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {saved.portfolio.map((item) => (
        <button
          type="button"
          key={item.id}
          data-rental-control="landlord-portfolio"
          onClick={() => openProperty(item)}
          className="overflow-hidden rounded-[18px] border border-[#dce7f2] bg-white text-left shadow-sm transition hover:border-[#91a9be]"
        >
          <div className="grid h-28 place-items-center bg-[#eef4fa]">
            <Home size={34} className="text-[#5d7f9c]" />
          </div>
          <div className="p-5">
            <h3 className="break-words text-base font-semibold text-[#102033]">
              {item.title || item.address}
            </h3>
            <p className="mt-2 break-words text-sm text-[#60758b]">
              {item.address}
            </p>
            <p className="mt-3 font-semibold text-[#29435d]">
              {money(item.expectedMonthlyRent)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#60758b]">
              <span>{item.propertyType || 'Type pending'}</span>
              <span>·</span>
              <span>
                {item.listingId ? 'Listing linked' : 'Prospective property'}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
  const activityForm = (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void run(
          'activity',
          async () => {
            await logRentalLeadCommunication(lead, activity, context)
            setActivity((current) => ({
              ...current,
              summary: '',
              outcome: '',
            }))
          },
          'Activity recorded.',
        )
      }}
    >
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#f3f7fb] p-1">
        {['call', 'email', 'whatsapp', 'note'].map((type) => (
          <button
            type="button"
            key={type}
            data-rental-control="landlord-activity"
            aria-pressed={activity.communicationType === type}
            onClick={() =>
              setActivity((current) => ({
                ...current,
                communicationType: type,
              }))
            }
            className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize ${activity.communicationType === type ? 'bg-white text-[#20364c] shadow-sm' : 'text-[#60758b]'}`}
          >
            {type}
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
          {['outbound', 'inbound', 'internal'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Activity summary</span>
        <textarea
          required
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
        />
      </label>
      <Button type="submit" disabled={Boolean(busy)}>
        Log activity
      </Button>
    </form>
  )
  return (
    <MobileDashboardShell>
      <div className="rental-tenant-workspace rental-landlord-workspace space-y-4">
        <section className="overflow-hidden rounded-[24px] border border-[#dbe7f2] bg-white">
          <div className="grid xl:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col justify-between bg-[#0d2c4b] p-6 text-white sm:p-8">
              <div>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    Landlord lead
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    {lead.stageLabel}
                  </span>
                </div>
                <h1 className="mt-6 break-words text-3xl font-bold text-white sm:text-4xl">
                  {saved.profile.name || lead.name}
                </h1>
                <p className="mt-3 flex items-center gap-2 text-sm text-white">
                  <Building2 size={16} />
                  {
                    LANDLORD_TYPES.find(
                      ([value]) => value === saved.profile.type,
                    )?.[1]
                  }
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-4 text-sm">
                {saved.profile.phone ? (
                  <a
                    data-rental-control="landlord-phone"
                    className="inline-flex items-center gap-2 text-white"
                    href={`tel:${saved.profile.phone}`}
                  >
                    <Phone size={16} />
                    {saved.profile.phone}
                  </a>
                ) : null}
                {saved.profile.email ? (
                  <a
                    data-rental-control="landlord-email"
                    className="inline-flex min-w-0 items-center gap-2 break-all text-white"
                    href={`mailto:${saved.profile.email}`}
                  >
                    <Mail size={16} />
                    {saved.profile.email}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <p className="tenant-eyebrow">Mandate readiness</p>
              <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
                <div
                  className="grid h-36 w-36 shrink-0 place-items-center rounded-full"
                  role="progressbar"
                  aria-label="Mandate readiness"
                  aria-valuenow={readiness.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{
                    background: `conic-gradient(#2f7b9e ${readiness.percent * 3.6}deg,#e6edf4 0deg)`,
                  }}
                >
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-3xl font-bold text-[#102033]">
                    {readiness.percent}%
                  </div>
                </div>
                <div className="w-full flex-1 divide-y divide-[#e8eef5] rounded-2xl border border-[#e1eaf4]">
                  {readiness.checks.map(([title, done]) => (
                    <p
                      key={title}
                      className="flex items-center justify-between gap-3 p-3 text-xs text-[#60758b]"
                    >
                      <span>{title}</span>
                      {done ? (
                        <CheckCircle2 size={16} className="text-[#237a61]" />
                      ) : (
                        <span>Pending</span>
                      )}
                    </p>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-[#60758b]">
                Captured preparation details; signed mandates are verified
                before listing handoff.
              </p>
            </div>
          </div>
        </section>
        <nav
          className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-[16px] border border-[#dbe7f2] bg-white p-1.5 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Landlord lead workspace"
        >
          {LANDLORD_TABS.map((title, index) => {
            const Icon = [Home, Users, Building2, CalendarDays, FileText, MessageCircle][index]
            return (
              <button
                type="button"
                data-rental-control="landlord-tab"
                key={title}
                aria-pressed={tab === title}
                onClick={() => chooseTab(title)}
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
              <p className="tenant-eyebrow">Landlord journey</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">{getRentalLeadStageLabel(RENTAL_LANDLORD_PIPELINE_STAGES[stageIndex], 'landlord')}</h2>
            </div>
            <span className="rounded-full border border-[#cbdcf5] bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#245f86]">Stage {stageIndex + 1} of {RENTAL_LANDLORD_PIPELINE_STAGES.length}</span>
          </div>
          <div ref={journeyRail} className="overflow-x-auto px-5 py-6 sm:px-8">
            <ol aria-label="Landlord journey stages" className="grid min-w-[1040px] grid-cols-8 gap-0">
              {RENTAL_LANDLORD_PIPELINE_STAGES.map((stageKey, index) => {
                const current = stageIndex === index
                const completed = index < stageIndex
                return <li key={stageKey} aria-current={current ? 'step' : undefined} className="relative px-1.5">
                  {index < RENTAL_LANDLORD_PIPELINE_STAGES.length - 1 ? <span aria-hidden="true" className={`absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-[32px] h-0.5 ${completed ? 'bg-[#9bc7de]' : 'bg-[#dce6f1]'}`} /> : null}
                  <div className={`relative flex min-h-[140px] flex-col items-center px-2 py-3 text-center ${current ? 'rounded-[18px] border border-[#cfe0ee] bg-[#f4f9fc] shadow-[0_10px_22px_rgba(31,54,78,0.06)]' : ''}`}>
                    <span className={`z-10 grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-bold ${current ? 'border-[#2f7b9e] bg-white text-[#245f86] shadow-[0_0_0_7px_rgba(47,123,158,0.12)]' : completed ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white' : 'border-[#cad7e5] bg-white text-[#8fa1b4]'}`}>
                      {completed ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}
                    </span>
                    <span className="mt-4 text-sm font-semibold leading-5 text-[#203a54]">{getRentalLeadStageLabel(stageKey, 'landlord')}</span>
                    <span className="mt-1 text-xs font-semibold text-[#6d839b]">{current ? 'Current stage' : completed ? 'Complete' : 'Upcoming'}</span>
                    {current ? <span className="mt-2 rounded-full bg-[#dfeef7] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[#245f86]">Live</span> : null}
                  </div>
                </li>
              })}
            </ol>
          </div>
        </section>
        {parentError || error ? (
          <div
            role="alert"
            className="rounded-2xl border border-[#efcece] bg-[#fff5f5] p-4 text-sm text-[#a02323]"
          >
            {error || parentError}
          </div>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-2xl bg-[#eff8f2] p-4 text-sm text-[#237452]"
          >
            {notice}
          </p>
        ) : null}
        {tab === 'Overview' ? (
          <>
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
              <section className="tenant-card flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#102033]">Landlord profile</h2><Button type="button" variant="secondary" size="sm" onClick={() => chooseTab('Landlord profile')}>Edit profile</Button></div>
                <dl className="mt-5 grid flex-1 gap-3 sm:grid-cols-2">
                  {[
                    [
                      'Landlord type',
                      LANDLORD_TYPES.find(
                        ([value]) => value === saved.profile.type,
                      )?.[1],
                    ],
                    ['Name', saved.profile.name],
                    ['Email', saved.profile.email],
                    ['Phone', saved.profile.phone],
                    ['Address', saved.profile.residentialAddress],
                    ['Signing authority', saved.profile.authorityBasis],
                  ].map(([title, value]) => (
                    <div key={title} className="min-w-0 rounded-xl border border-[#e6eef5] bg-[#f8fbfd] p-4">
                      <dt className="tenant-eyebrow">{title}</dt>
                      <dd className="mt-2 break-words text-sm font-semibold text-[#20364c]">
                        {value || 'Not captured'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <div className="grid content-start gap-5">
                <section className="tenant-next tenant-card flex flex-col">
                  <p className="tenant-eyebrow">What’s next</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    {lead.nextAction}
                  </h2>
                  <div className="mt-5">{journeyContent}</div>
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
                  {agentsError ? <p role="alert" className="mt-3 text-sm text-[#a02323]">{agentsError}</p> : null}
                  <form className="mt-5 grid gap-3 border-t border-[#edf3f8] pt-4" onSubmit={(event) => {
                    event.preventDefault()
                    if (!canAssign || !eligibleUsers.some((user) => user.userId === assignee) || assignee === lead.assignedAgentId) return
                    void run('assignment', () => assignRentalLead(lead.id, assignee, context), 'Lead assignment saved.')
                  }}>
                    <label className="grid gap-2 text-sm font-medium text-[#29435d]">
                      Assigned agent
                      <select
                        aria-label="Assign landlord lead"
                        className="h-11 w-full min-w-0 rounded-xl border border-[#dce7f2] bg-white px-3 text-sm text-[#18324b] outline-none focus:border-[#91abc0] focus:ring-2 focus:ring-[#eef4fa] disabled:bg-[#f7fafc] disabled:text-[#60758b]"
                        value={assignee}
                        disabled={!canAssign || agentsLoading || Boolean(busy) || !eligibleUsers.length}
                        onChange={(event) => setAssignee(event.target.value)}
                      >
                        <option value="">{agentsLoading && canAssign ? 'Loading agents…' : 'Choose agent'}</option>
                        {lead.assignedAgentId && !eligibleUsers.some((user) => user.userId === lead.assignedAgentId) ? <option value={lead.assignedAgentId}>{ownerName} (current)</option> : null}
                        {eligibleUsers.map((user) => <option key={user.userId} value={user.userId}>{user.fullName || user.email}</option>)}
                      </select>
                    </label>
                    {canAssign ? <>
                      {!agentsLoading && !eligibleUsers.length ? <p className="text-xs text-[#60758b]">No active agents available in this workspace.</p> : null}
                      <Button type="submit" size="sm" className="justify-self-end" disabled={agentsLoading || Boolean(busy) || !eligibleUsers.some((user) => user.userId === assignee) || assignee === lead.assignedAgentId}>{busy === 'assignment' ? 'Saving…' : 'Save assignment'}</Button>
                    </> : <p className="text-xs leading-5 text-[#60758b]">Your branch or organisation manager can change the assigned agent.</p>}
                  </form>
                </section>
              </div>
            </div>
            <Card title="Property portfolio">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-[#60758b]">
                  {saved.portfolio.length} propert
                  {saved.portfolio.length === 1 ? 'y' : 'ies'}
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    chooseTab('Portfolio')
                    setProperty({ id: uid(), category: 'residential' })
                  }}
                >
                  <Plus size={16} />
                  Add property
                </Button>
              </div>
              {saved.portfolio.length ? (
                portfolioCards
              ) : (
                <p className="text-sm text-[#60758b]">
                  Add the landlord’s first property.
                </p>
              )}
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Activity logger">{activityForm}</Card>
              <Card title="Appointments">
                <p className="text-sm text-[#60758b]">
                  Arrange an appraisal, landlord meeting or property visit.
                </p>
                {tasks.slice(0, 3).map((task) => (
                  <div
                    key={task.taskId}
                    className="mt-3 border-b border-[#edf3f8] pb-3"
                  >
                    <p className="font-semibold text-[#20364c]">{task.title}</p>
                    <p className="mt-1 text-xs text-[#60758b]">
                      {date(task.dueDate)} · {task.status}
                    </p>
                  </div>
                ))}
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => chooseTab('Appointments')}
                >
                  Plan appointment
                </Button>
              </Card>
            </div>
          </>
        ) : null}
        {tab === 'Landlord profile' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                'profile',
                () => saveRentalLandlordProfile(lead.id, profile, context),
                'Landlord profile saved.',
              )
            }}
          >
            <Card title="Landlord profile">
              <fieldset>
                <legend className="tenant-label">Landlord type</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {LANDLORD_TYPES.map(([value, title]) => (
                    <button
                      type="button"
                      key={value}
                      data-rental-control="landlord-type"
                      aria-pressed={profile.type === value}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-semibold ${profile.type === value ? 'border-[#73a3c4] bg-[#eef5fa] text-[#20364c]' : 'border-[#dce7f2] bg-white text-[#60758b]'}`}
                      onClick={() => updateProfile('type', value)}
                    >
                      {['company', 'close_corporation'].includes(value) ? (
                        <Building2 size={20} />
                      ) : (
                        <Users size={20} />
                      )}{' '}
                      {title}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {PROFILE_FIELDS.filter(([key]) => visibleField(key)).map(
                  (field) => (
                    <Field
                      key={field[0]}
                      field={field}
                      values={profile}
                      onChange={updateProfile}
                    />
                  ),
                )}
              </div>
            </Card>
            <Card
              title="Owners, representatives & signing authority"
              className="mt-4"
            >
              <p className="text-sm text-[#60758b]">
                Capture each owner, director, trustee, beneficiary, member or
                authorised representative.
              </p>
              <div className="mt-4 space-y-4">
                {(profile.people || []).map((person, index) => (
                  <section
                    key={person.id}
                    className="rounded-2xl border border-[#dce7f2] p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <h3 className="font-semibold text-[#20364c]">
                        {person.role || peopleRole()} {index + 1}
                      </h3>
                      <button
                        type="button"
                        data-rental-control="landlord-person-remove"
                        aria-label={`Remove person ${index + 1}`}
                        onClick={() =>
                          updateProfile(
                            'people',
                            profile.people.filter(
                              (item) => item.id !== person.id,
                            ),
                          )
                        }
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <Field
                        field={['role', 'Role']}
                        values={person}
                        onChange={(key, value) =>
                          updateProfile(
                            'people',
                            profile.people.map((item) =>
                              item.id === person.id
                                ? { ...item, [key]: value }
                                : item,
                            ),
                          )
                        }
                      />
                      {PERSON_FIELDS.map((field) => (
                        <Field
                          key={field[0]}
                          field={field}
                          values={person}
                          onChange={(key, value) =>
                            updateProfile(
                              'people',
                              profile.people.map((item) =>
                                item.id === person.id
                                  ? { ...item, [key]: value }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                    <label className="mt-4 flex items-center gap-2 text-sm text-[#20364c]">
                      <input
                        type="checkbox"
                        checked={person.signingAuthority === true}
                        onChange={(event) =>
                          updateProfile(
                            'people',
                            profile.people.map((item) =>
                              item.id === person.id
                                ? {
                                    ...item,
                                    signingAuthority: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      Authorised to sign the rental mandate
                    </label>
                  </section>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() =>
                  updateProfile('people', [
                    ...(profile.people || []),
                    { id: uid(), role: peopleRole(), signingAuthority: false },
                  ])
                }
              >
                <Plus size={16} />
                Add person
              </Button>
            </Card>
            <div className="mt-4 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => setProfile(saved.profile)}
              >
                Reset
              </Button>
              <Button type="submit" disabled={Boolean(busy)}>
                {busy === 'profile' ? 'Saving…' : 'Save landlord profile'}
              </Button>
            </div>
          </form>
        ) : null}
        {tab === 'Portfolio' ? (
          property ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void run(
                  'property',
                  async () => {
                    await saveRentalLandlordProperty(lead.id, property, context)
                    openProperty(property)
                  },
                  'Property profile saved.',
                )
              }}
            >
              <div className="mb-4 flex justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProperty(null)}
                >
                  <ArrowLeft size={16} />
                  Cancel edit
                </Button>
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === 'property' ? 'Saving…' : 'Save property'}
                </Button>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                {PROPERTY_GROUPS.map(([title, fields]) => (
                  <Card key={title} title={title}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {fields
                        .filter(
                          ([key]) =>
                            rentalLandlordPropertyFieldVisible(key, property) && (!['unitNumber', 'complexName'].includes(key) ||
                            property.ownershipType === 'sectional_title'),
                        )
                        .map((field) =>
                          field[0] === 'canonicalPropertyId' ? (
                            <label key={field[0]} className="form-field">
                              <span>Managed rental property</span>
                              <select
                                value={property.canonicalPropertyId || ''}
                                onChange={(event) =>
                                  setProperty((current) => ({
                                    ...current,
                                    canonicalPropertyId: event.target.value,
                                  }))
                                }
                              >
                                <option value="">
                                  Choose managed property
                                </option>
                                {managedProperties.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} · {item.address?.line1}
                                  </option>
                                ))}
                              </select>
                              {managedError ? (
                                <span role="alert">{managedError}</span>
                              ) : null}
                              <Link
                                className="text-xs font-semibold text-[#1f4f78]"
                                to="/agent/rentals/portfolio/properties"
                              >
                                Add a managed property
                              </Link>
                            </label>
                          ) : (
                            <Field
                              key={field[0]}
                              field={field}
                              values={property}
                              onChange={(key, value) =>
                                setProperty((current) => ({
                                  ...current,
                                  [key]: value,
                                }))
                              }
                            />
                          ),
                        )}
                    </div>
                  </Card>
                ))}
              </div>
            </form>
          ) : selected ? (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => chooseTab('Portfolio')}
                >
                  <ArrowLeft size={16} />
                  Back to portfolio
                </Button>
                <Button
                  type="button"
                  onClick={() => setProperty({ ...selected })}
                >
                  Edit property
                </Button>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                {PROPERTY_GROUPS.map(([title, fields]) => (
                  <Card key={title} title={title}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {fields
                        .filter(
                          ([key]) =>
                            rentalLandlordPropertyFieldVisible(key, selected) && (!['unitNumber', 'complexName'].includes(key) ||
                            selected.ownershipType === 'sectional_title'),
                        )
                        .map(([key, label]) => (
                          <div
                            key={key}
                            className="border-b border-[#edf3f8] pb-3"
                          >
                            <p className="tenant-eyebrow">{label}</p>
                            <p className="mt-2 break-words text-sm font-semibold text-[#20364c]">
                              {text(selected[key]) || 'Not captured'}
                            </p>
                          </div>
                        ))}
                    </div>
                    {title === 'Listing & readiness' ? (
                      <div className="mt-5 space-y-4">
                        {!selected.mandateId &&
                        [
                          'mandate_pending',
                          'mandate_signed',
                          'listing_ready',
                          'listing_created',
                        ].includes(lead.stage) ? (
                          <div className="rounded-xl border border-[#dce7f2] p-4">
                            <label className="flex items-start gap-2 text-sm text-[#20364c]">
                              <input
                                type="checkbox"
                                checked={signedConfirmation}
                                onChange={(event) =>
                                  setSignedConfirmation(event.target.checked)
                                }
                              />
                              I confirm this property’s rental mandate has been
                              signed
                            </label>
                            <Button
                              type="button"
                              className="mt-3"
                              disabled={Boolean(busy) || !signedConfirmation}
                              onClick={() =>
                                void run(
                                  'mandate',
                                  () =>
                                    recordRentalLandlordPortfolioMandate(
                                      lead.id,
                                      selected.id,
                                      signedConfirmation,
                                      context,
                                    ),
                                  'Signed mandate recorded for this property.',
                                )
                              }
                            >
                              Record signed mandate
                            </Button>
                          </div>
                        ) : null}
                        {selected.listingId ? (
                          <Link
                            className="inline-flex rounded-xl bg-[#187052] px-4 py-3 text-sm font-semibold text-white"
                            to={`/agent/rentals/listings/${encodeURIComponent(selected.listingId)}/marketing`}
                          >
                            Open rental listing
                          </Link>
                        ) : ['listing_ready', 'listing_created'].includes(
                            lead.stage,
                          ) && selected.mandateId ? (
                          <Link
                            className="inline-flex rounded-xl bg-[#187052] px-4 py-3 text-sm font-semibold text-white"
                            to={`/agent/rentals/listings/new?leadId=${encodeURIComponent(lead.id)}&portfolioPropertyId=${encodeURIComponent(selected.id)}`}
                          >
                            Create rental listing
                          </Link>
                        ) : (
                          <p className="text-sm text-[#60758b]">
                            Record this property’s signed mandate and complete
                            the landlord journey before creating its rental
                            listing.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card title="Property portfolio">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#60758b]">
                  Capture and manage each property separately.
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    setProperty({ id: uid(), category: 'residential' })
                  }
                >
                  <Plus size={16} />
                  Add property
                </Button>
              </div>
              {saved.portfolio.length ? (
                portfolioCards
              ) : (
                <p className="text-sm text-[#60758b]">
                  No properties captured yet.
                </p>
              )}
            </Card>
          )
        ) : null}
        {tab === 'Appointments' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Appointment planner">
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(
                    'appointment',
                    async () => {
                      await createRentalLeadFollowUp(lead, appointment, context)
                      setAppointment((current) => ({
                        ...current,
                        dueDate: '',
                        description: '',
                      }))
                    },
                    'Appointment saved.',
                  )
                }}
              >
                {[
                  ['title', 'Appointment title'],
                  ['dueDate', 'Date and time', 'datetime-local'],
                  [
                    'description',
                    'Property / access / meeting notes',
                    'textarea',
                  ],
                ].map((field) => (
                  <Field
                    key={field[0]}
                    field={field}
                    values={appointment}
                    onChange={(key, value) =>
                      setAppointment((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                ))}
                <Button type="submit" disabled={Boolean(busy)}>
                  Schedule appointment
                </Button>
              </form>
            </Card>
            <Card title="Landlord appointments">
              {tasks.map((task) => (
                <article
                  key={task.taskId}
                  className="mb-3 rounded-xl border border-[#dce7f2] p-4"
                >
                  <h3 className="font-semibold text-[#20364c]">{task.title}</h3>
                  <p className="mt-2 text-sm text-[#60758b]">
                    {task.description}
                  </p>
                  <p className="mt-2 text-xs text-[#60758b]">
                    {date(task.dueDate)} · {task.status}
                  </p>
                  {!['completed', 'cancelled'].includes(
                    text(task.status).toLowerCase(),
                  ) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run(
                          'appointment',
                          () => completeRentalLeadFollowUp(task, context),
                          'Appointment completed.',
                        )
                      }
                    >
                      Mark completed
                    </Button>
                  ) : null}
                </article>
              ))}
              {!tasks.length ? (
                <p className="text-sm text-[#60758b]">
                  No appointments scheduled.
                </p>
              ) : null}
            </Card>
          </div>
        ) : null}
        {tab === 'Documents' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <RentalLandlordOnboardingPanel
              leadId={lead.id}
              revision={JSON.stringify([saved.profile, saved.portfolio])}
              discoveryDirty={JSON.stringify(profile) !== JSON.stringify(saved.profile) || Boolean(property && JSON.stringify(property) !== JSON.stringify(saved.portfolio.find((item) => item.id === property.id)))}
            />
            <Card title="Landlord documents">
              <p className="text-sm text-[#60758b]">
                Identity, company or trust records, signing authority and
                mandates.
              </p>
              {saved.documents.map((item) => (
                <article
                  key={item.id}
                  className="mt-3 rounded-xl border border-[#dce7f2] p-4"
                >
                  <p className="font-semibold text-[#20364c]">{item.name}</p>
                  <p className="mt-1 break-words text-sm text-[#60758b]">
                    {item.reference}
                  </p>
                  <p className="mt-2 text-xs text-[#60758b]">
                    {saved.portfolio.find((p) => p.id === item.propertyId)
                      ?.title || 'Landlord profile'}
                  </p>
                </article>
              ))}
              {saved.portfolio
                .filter((item) => item.listingId)
                .map((item) => (
                  <Link
                    key={item.id}
                    className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#1f4f78]"
                    to={`/agent/rentals/listings/${encodeURIComponent(item.listingId)}/mandate`}
                  >
                    <FileText size={17} />
                    Open listing documents · {item.title || item.address}
                  </Link>
                ))}
            </Card>
            <Card title="Record a document reference">
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(
                    'document',
                    async () => {
                      await saveRentalLandlordDocument(
                        lead.id,
                        document,
                        context,
                      )
                      setDocument({
                        id: uid(),
                        name: '',
                        reference: '',
                        propertyId: '',
                      })
                    },
                    'Document reference saved.',
                  )
                }}
              >
                {[
                  ['name', 'Document name'],
                  ['reference', 'File / document reference'],
                ].map((field) => (
                  <Field
                    key={field[0]}
                    field={field}
                    values={document}
                    onChange={(key, value) =>
                      setDocument((current) => ({ ...current, [key]: value }))
                    }
                  />
                ))}
                <label className="form-field">
                  <span>Related property</span>
                  <select
                    value={document.propertyId}
                    onChange={(event) =>
                      setDocument((current) => ({
                        ...current,
                        propertyId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Landlord profile</option>
                    {saved.portfolio.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title || item.address}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" disabled={Boolean(busy)}>
                  Save document reference
                </Button>
              </form>
            </Card>
          </div>
        ) : null}
        {tab === 'Activity' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Activity logger">{activityForm}</Card>
            <Card title="Landlord activity">
              {communicationError ? (
                <p role="alert" className="text-sm text-[#a02323]">
                  {communicationError}
                </p>
              ) : null}
              {communications.map((item) => (
                <article
                  key={item.id}
                  className="mb-3 rounded-xl border border-[#dce7f2] p-4"
                >
                  <p className="font-semibold capitalize text-[#20364c]">
                    {item.communicationType ||
                      item.communication_type ||
                      'Contact'}
                  </p>
                  <p className="mt-2 text-sm text-[#60758b]">{item.summary}</p>
                </article>
              ))}
              {history.map((item) => (
                <article
                  key={item.activityId}
                  className="mb-3 rounded-xl border border-[#dce7f2] p-4"
                >
                  <p className="font-semibold text-[#20364c]">
                    {item.activityType}
                  </p>
                  <p className="mt-2 text-sm text-[#60758b]">
                    {item.activityNote || item.outcome}
                  </p>
                  <p className="mt-2 text-xs text-[#60758b]">
                    {date(item.activityDate)}
                  </p>
                </article>
              ))}
              {!history.length &&
              !communications.length &&
              !communicationError ? (
                <p className="text-sm text-[#60758b]">
                  No activity recorded yet.
                </p>
              ) : null}
            </Card>
          </div>
        ) : null}
        {tab === 'Overview' && primaryListing ? (
          <Link
            className="inline-flex text-sm font-semibold text-[#1f4f78]"
            to={`/agent/rentals/listings/${encodeURIComponent(primaryListing.listingId)}/marketing`}
          >
            Open linked rental listing
          </Link>
        ) : null}
      </div>
    </MobileDashboardShell>
  )
}
