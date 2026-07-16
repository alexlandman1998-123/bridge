import {
  Building2,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  FileCheck2,
  Handshake,
  Home,
  Loader2,
  Plus,
  UserPlus,
  UsersRound,
  Warehouse,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AgentAssignmentSelect from './AgentAssignmentSelect'
import {
  buildActorAgentOption,
  buildAgentOptions,
  getAgentDisplayName,
  getAgentProfileAvatarUrl,
  getSelectedAgentOption,
} from './agentAssignmentSelectModel'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyCrmLeadRecord } from '../lib/agencyCrmRepository'
import { inferLeadCategoryFromRecord, normalizeLeadCategory } from '../lib/leadCategory'
import { readAgentPrivateListings } from '../lib/agentListingStorage'
import { createAppointmentAsync } from '../lib/agencyPipelineService'
import { fetchOrganisationSettings, listOrganisationUsers } from '../lib/settingsApi'
import { getOrganisationPrivateListings } from '../services/privateListingService'
import Modal from './ui/Modal'

const RESIDENTIAL_QUICK_CREATE_GROUPS = [
  {
    label: 'CRM',
    items: [
      {
        type: 'lead',
        label: 'Lead',
        helper: 'Capture a new buyer or seller enquiry',
        icon: UserPlus,
        action: 'modal',
      },
      {
        type: 'prospect',
        label: 'Prospect',
        helper: 'Add a potential future client',
        icon: UsersRound,
        action: 'modal',
      },
      {
        type: 'client',
        label: 'Client',
        helper: 'Open the client workspace',
        icon: UsersRound,
        action: 'route',
        to: '/clients',
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        type: 'listing',
        label: 'Listing',
        helper: 'Create or publish residential stock',
        icon: Home,
        action: 'route',
        to: '/listings',
        state: { openNewListing: true },
      },
      {
        type: 'transaction',
        label: 'Transaction',
        helper: 'Start a residential deal workspace',
        icon: Handshake,
        action: 'route',
        to: '/new-transaction',
      },
    ],
  },
  {
    label: 'Organisation',
    items: [
      {
        type: 'third-party',
        label: 'Third Party',
        helper: 'Add an attorney, bond originator, or referral agency',
        icon: Building2,
        action: 'route',
        to: '/partners',
        state: { openAddThirdParty: true, partnerType: 'transfer_attorney' },
      },
    ],
  },
  {
    label: 'Scheduling',
    items: [
      {
        type: 'appointment',
        label: 'Appointment',
        helper: 'Schedule a viewing or meeting',
        icon: CalendarPlus,
        action: 'modal',
      },
      {
        type: 'viewing',
        label: 'Viewing',
        helper: 'Schedule a property viewing',
        icon: CalendarPlus,
        action: 'modal',
        modalType: 'appointment',
        initialForm: { appointmentType: 'Viewing', title: 'Property Viewing' },
      },
    ],
  },
]

const COMMERCIAL_QUICK_CREATE_GROUPS = [
  {
    label: 'Demand',
    items: [
      {
        type: 'requirement',
        label: 'Requirement',
        helper: 'Open commercial requirement records',
        icon: ClipboardList,
        action: 'route',
        to: '/commercial/requirements',
        state: { openCommercialCreate: true },
      },
      {
        type: 'commercial-client',
        label: 'Client',
        helper: 'Open tenants, buyers, and investors',
        icon: UsersRound,
        action: 'route',
        to: '/commercial/clients',
        state: { openCommercialCreate: true },
      },
    ],
  },
  {
    label: 'Supply',
    items: [
      {
        type: 'vacancy',
        label: 'Vacancy',
        helper: 'Open available space records',
        icon: DoorOpen,
        action: 'route',
        to: '/commercial/vacancies',
        state: { openCommercialCreate: true },
      },
      {
        type: 'property',
        label: 'Property',
        helper: 'Open commercial property stock',
        icon: Building2,
        action: 'route',
        to: '/commercial/properties',
        state: { openCommercialCreate: true },
      },
      {
        type: 'landlord',
        label: 'Landlord',
        helper: 'Open landlord and portfolio records',
        icon: Warehouse,
        action: 'route',
        to: '/commercial/landlords',
        state: { openCommercialCreate: true },
      },
    ],
  },
  {
    label: 'Transactions',
    items: [
      {
        type: 'deal',
        label: 'Deal',
        helper: 'Open commercial deal management',
        icon: Handshake,
        action: 'route',
        to: '/commercial/deals/leasing',
        state: { openCommercialCreate: true },
      },
      {
        type: 'lease',
        label: 'Lease',
        helper: 'Open commercial lease records',
        icon: FileCheck2,
        action: 'route',
        to: '/commercial/leases',
        state: { openCommercialCreate: true },
      },
      {
        type: 'commercial-viewing',
        label: 'Viewing',
        helper: 'Open commercial viewing coordination',
        icon: CalendarPlus,
        action: 'route',
        to: '/commercial/viewings',
      },
      {
        type: 'commercial-appointment',
        label: 'Appointment',
        helper: 'Open commercial viewing coordination',
        icon: CalendarPlus,
        action: 'route',
        to: '/commercial/viewings',
      },
    ],
  },
]

const BOND_ORIGINATOR_QUICK_CREATE_GROUPS = [
  {
    label: 'Applications',
    items: [
      {
        type: 'bond-application',
        label: 'Application',
        helper: 'Open the bond intake queue for a new application',
        icon: FileCheck2,
        action: 'route',
        to: '/bond/pipeline?view=new',
      },
      {
        type: 'bond-client',
        label: 'Client',
        helper: 'Add a buyer or client in the bond workspace',
        icon: UsersRound,
        action: 'route',
        to: '/bond/clients',
        state: { openAddClient: true },
      },
    ],
  },
  {
    label: 'Organisation',
    items: [
      {
        type: 'bond-consultant',
        label: 'Consultant',
        helper: 'Open consultant management in the bond organisation module',
        icon: UserPlus,
        action: 'route',
        to: '/bond/organisation?view=consultants',
      },
      {
        type: 'bond-branch',
        label: 'Branch',
        helper: 'Open branch management in the originator hierarchy',
        icon: Building2,
        action: 'route',
        to: '/bond/organisation?view=branches',
      },
      {
        type: 'bond-region',
        label: 'Region',
        helper: 'Open regional operating scopes',
        icon: Warehouse,
        action: 'route',
        to: '/bond/organisation?view=regions',
      },
    ],
  },
  {
    label: 'Network',
    items: [
      {
        type: 'bond-partner',
        label: 'Partner',
        helper: 'Open partner management for agencies and developers',
        icon: Handshake,
        action: 'route',
        to: '/bond/organisation?view=partners',
      },
      {
        type: 'bond-routing-rule',
        label: 'Routing Rule',
        helper: 'Open application routing defaults',
        icon: ClipboardList,
        action: 'route',
        to: '/bond/organisation?view=routing-rules',
      },
      {
        type: 'bond-appointment',
        label: 'Appointment',
        helper: 'Open the bond calendar workspace',
        icon: CalendarPlus,
        action: 'route',
        to: '/bond/calendar',
      },
    ],
  },
]

const PERSON_TYPES = ['Buyer', 'Seller', 'Tenant', 'Landlord', 'Investor']
const LEAD_SOURCE_OPTIONS = [
  'Property24',
  'Private Property',
  'Website',
  'Referral',
  'Show Day',
  'Walk-In',
  'WhatsApp',
  'Facebook',
  'Google',
  'Signboard',
  'Listing Call',
  'Cold Call',
  'Door Knock',
  'Manual Entry',
  'Other / Unknown',
]
const APPOINTMENT_TYPES = [
  'Viewing',
  'Valuation',
  'Mandate Meeting',
  'Buyer Consultation',
  'Seller Consultation',
  'Lease Meeting',
  'General Meeting',
]

const QUICK_CREATE_MENU_MAX_WIDTH = 384
const QUICK_CREATE_MENU_VIEWPORT_GUTTER = 12

function getQuickCreateMenuOffset(triggerRect, viewportWidth) {
  if (!triggerRect || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0

  const menuWidth = Math.min(
    QUICK_CREATE_MENU_MAX_WIDTH,
    Math.max(0, viewportWidth - QUICK_CREATE_MENU_VIEWPORT_GUTTER * 2),
  )
  const maximumLeft = Math.max(
    QUICK_CREATE_MENU_VIEWPORT_GUTTER,
    viewportWidth - menuWidth - QUICK_CREATE_MENU_VIEWPORT_GUTTER,
  )
  const menuLeft = Math.min(
    Math.max(triggerRect.left, QUICK_CREATE_MENU_VIEWPORT_GUTTER),
    maximumLeft,
  )

  return menuLeft - triggerRect.left
}

const INITIAL_FORMS = {
  lead: {
    name: '',
    phone: '',
    email: '',
    leadType: 'Buyer',
    source: LEAD_SOURCE_OPTIONS[0],
    listingId: '',
    notes: '',
    assignedAgent: '',
    assignedAgentId: '',
    assignedAgentEmail: '',
    assignedAgentAvatarUrl: '',
  },
  prospect: {
    name: '',
    phone: '',
    email: '',
    prospectType: 'Buyer',
    interest: '',
    timeline: '',
    notes: '',
    assignedAgent: '',
    assignedAgentId: '',
    assignedAgentEmail: '',
    assignedAgentAvatarUrl: '',
  },
  appointment: {
    title: '',
    appointmentType: 'Viewing',
    date: '',
    time: '',
    location: '',
    relatedRecord: '',
    assignedAgent: '',
    notes: '',
  },
}

const QUICK_CREATE_AUDIENCE_CHOICES = {
  lead: [
    {
      key: 'buyer',
      label: 'Buyer Lead',
      helper: 'Capture a buyer enquiry with budget and search context.',
      icon: UserPlus,
      tileClass: 'bg-[#eef4fb] text-[#24465d]',
    },
    {
      key: 'seller',
      label: 'Seller Lead',
      helper: 'Capture a seller enquiry with property and value context.',
      icon: ClipboardList,
      tileClass: 'bg-[#edf8f1] text-[#1f7a45]',
    },
  ],
  prospect: [
    {
      key: 'buyer',
      label: 'Buyer Prospect',
      helper: 'Add a potential future buyer client.',
      icon: UserPlus,
      tileClass: 'bg-[#eef4fb] text-[#24465d]',
    },
    {
      key: 'seller',
      label: 'Seller Prospect',
      helper: 'Add a potential future seller client.',
      icon: ClipboardList,
      tileClass: 'bg-[#edf8f1] text-[#1f7a45]',
    },
  ],
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isValidEmail(value) {
  const email = normalizeText(value)
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function splitName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function formatListingPrice(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function isBuyerStyleLeadType(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return ['buyer', 'tenant', 'investor'].includes(normalized)
}

function normalizeLeadSource(value = '') {
  const normalized = normalizeText(value)
  return LEAD_SOURCE_OPTIONS.includes(normalized) ? normalized : LEAD_SOURCE_OPTIONS[0]
}

function isCurrentListing(listing = {}) {
  const status = normalizeText(listing?.listingStatus || listing?.lifecycleStatus || listing?.status).toLowerCase()
  if (!status) return true
  return !['archived', 'withdrawn', 'lost', 'sold', 'registered', 'closed'].some((token) => status.includes(token))
}

function mapListingToOption(listing = {}) {
  const id = normalizeText(listing?.id || listing?.listingId || listing?.privateListingId)
  if (!id || !isCurrentListing(listing)) return null
  const title = normalizeText(listing?.listingTitle || listing?.title || listing?.propertyAddress || listing?.addressLine1) || 'Untitled listing'
  const area = normalizeText(listing?.suburb || listing?.city || listing?.area)
  const price = formatListingPrice(listing?.askingPrice || listing?.price || listing?.estimatedValue)
  const label = [title, area].filter(Boolean).join(' · ')
  return {
    id,
    label,
    meta: price || normalizeText(listing?.listingReference || listing?.listingCode),
  }
}

function dedupeListingOptions(listings = []) {
  const seen = new Set()
  return listings
    .map((listing) => mapListingToOption(listing))
    .filter(Boolean)
    .filter((option) => {
      const key = option.id.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

async function resolveOrganisationId() {
  try {
    const context = await fetchOrganisationSettings()
    const organisationId = normalizeText(context?.organisation?.id)
    if (!organisationId) throw new Error('A resolved workspace is required before quick-create can load.')
    return organisationId
  } catch {
    throw new Error('A resolved workspace is required before quick-create can load.')
  }
}

function FormField({ label, children, className = '' }) {
  return (
    <label className={`grid gap-1.5 ${className}`.trim()}>
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'min-h-[42px] rounded-[12px] border border-[#d8e3ef] bg-white px-3 py-2 text-sm font-medium text-[#162334] outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10'

function QuickCreateAudienceModal({ kind, onClose, onChoose }) {
  const choices = QUICK_CREATE_AUDIENCE_CHOICES[kind] || []
  if (!kind || !choices.length) {
    return null
  }

  const title = kind === 'lead' ? 'What type of lead?' : 'What type of prospect?'
  const subtitle =
    kind === 'lead'
      ? 'Choose the audience before the intake form opens.'
      : 'Choose the audience before the prospect workspace opens.'

  return (
    <Modal
      open={Boolean(kind)}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      className="max-w-[460px]"
      footer={
        <button
          type="button"
          className="min-h-[42px] rounded-[12px] border border-[#d8e3ef] bg-white px-4 text-sm font-semibold text-[#1f3850] transition hover:border-[#b9c8d8] hover:bg-[#f7fafc]"
          onClick={onClose}
        >
          Cancel
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map((choice, index) => {
          const Icon = choice.icon
          return (
            <button
              key={choice.key}
              type="button"
              className="group flex min-h-[132px] flex-col items-start gap-3 rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] p-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.76)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#c9d8e6] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#274c69]/20"
              onClick={() => onChoose(choice.key)}
              autoFocus={index === 0}
              data-testid={`quick-create-${kind}-choice-${choice.key}`}
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] ${choice.tileClass}`}>
                <Icon size={16} />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-[#162334]">{choice.label}</span>
                <span className="block text-xs font-medium leading-5 text-[#6b7d93]">{choice.helper}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function QuickCreateModal({
  type,
  form,
  setForm,
  onClose,
  onSubmit,
  saving,
  feedback,
  listingOptions = [],
  listingOptionsLoading = false,
  agentOptions = [],
  agentOptionsLoading = false,
}) {
  const isLead = type === 'lead'
  const isProspect = type === 'prospect'
  const isAppointment = type === 'appointment'
  const shouldShowListingSelect = isLead && isBuyerStyleLeadType(form.leadType)

  const title = isLead ? 'Create Lead' : isProspect ? 'Create Prospect' : 'Create Appointment'
  const subtitle = isLead
    ? 'Capture a new enquiry without leaving your current workspace.'
    : isProspect
      ? 'Add a future client to keep them on the radar.'
      : 'Schedule a viewing, valuation, consultation, or general meeting.'

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'leadType' && !isBuyerStyleLeadType(value) ? { listingId: '' } : {}),
    }))
  }

  function updateAssignedAgent(agent) {
    setForm((previous) => ({
      ...previous,
      assignedAgent: getAgentDisplayName(agent),
      assignedAgentId: normalizeText(agent.userId || agent.id),
      assignedAgentEmail: normalizeText(agent.email).toLowerCase(),
      assignedAgentAvatarUrl: getAgentProfileAvatarUrl(agent),
    }))
  }

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
      <button
        type="button"
        className="min-h-[42px] rounded-[12px] border border-[#d8e3ef] bg-white px-4 text-sm font-semibold text-[#1f3850] transition hover:border-[#b9c8d8] hover:bg-[#f7fafc]"
        onClick={onClose}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="submit"
        form={`quick-create-${type}-form`}
        className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] bg-[#0f2742] px-4 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(15,39,66,0.18)] transition hover:bg-[#16385c] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={saving}
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        {saving ? 'Saving...' : title}
      </button>
    </div>
  )

  return (
    <Modal open={Boolean(type)} onClose={saving ? undefined : onClose} title={title} subtitle={subtitle} className="max-w-2xl" footer={footer}>
      <form id={`quick-create-${type}-form`} className="grid gap-4" onSubmit={onSubmit}>
        {feedback.message ? (
          <p
            className={`rounded-[14px] border px-4 py-3 text-sm font-medium ${
              feedback.kind === 'success'
                ? 'border-[#b9ead9] bg-[#ecfdf6] text-[#047857]'
                : 'border-[#f4c7c3] bg-[#fef3f2] text-[#b42318]'
            }`}
          >
            {feedback.message}
          </p>
        ) : null}

        {isLead || isProspect ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Client name"
                  autoFocus
                />
              </FormField>
              <FormField label={isLead ? 'Lead type' : 'Prospect type'}>
                <select
                  className={inputClass}
                  value={isLead ? form.leadType : form.prospectType}
                  onChange={(event) => updateField(isLead ? 'leadType' : 'prospectType', event.target.value)}
                >
                  {PERSON_TYPES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Phone">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  placeholder="+27 ..."
                />
              </FormField>
              <FormField label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="client@example.com"
                />
              </FormField>
              {isLead ? (
                <FormField label="Source">
                  <select
                    className={inputClass}
                    value={normalizeLeadSource(form.source)}
                    onChange={(event) => updateField('source', event.target.value)}
                  >
                    {LEAD_SOURCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </FormField>
              ) : (
                <>
                  <FormField label="Interest">
                    <input
                      className={inputClass}
                      value={form.interest}
                      onChange={(event) => updateField('interest', event.target.value)}
                      placeholder="Area, property type, budget..."
                    />
                  </FormField>
                  <FormField label="Timeline">
                    <input
                      className={inputClass}
                      value={form.timeline}
                      onChange={(event) => updateField('timeline', event.target.value)}
                      placeholder="Now, 3 months, 6 months..."
                    />
                  </FormField>
                </>
              )}
              <FormField label="Assigned agent">
                <AgentAssignmentSelect
                  value={normalizeText(form.assignedAgentId || form.assignedAgentEmail || form.assignedAgent)}
                  agents={agentOptions}
                  loading={agentOptionsLoading}
                  onChange={updateAssignedAgent}
                />
              </FormField>
              {shouldShowListingSelect ? (
                <FormField label="Current listing">
                  <select
                    className={inputClass}
                    value={form.listingId}
                    onChange={(event) => updateField('listingId', event.target.value)}
                    disabled={listingOptionsLoading && listingOptions.length === 0}
                  >
                    <option value="">
                      {listingOptionsLoading && listingOptions.length === 0 ? 'Loading current listings...' : 'No listing selected'}
                    </option>
                    {listingOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.meta ? `${option.label} · ${option.meta}` : option.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : null}
            </div>
            <FormField label="Notes">
              <textarea
                className={`${inputClass} min-h-[96px] resize-y`}
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Add helpful context..."
              />
            </FormField>
          </>
        ) : null}

        {isAppointment ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Appointment title">
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  placeholder="Offer review meeting"
                  autoFocus
                />
              </FormField>
              <FormField label="Appointment type">
                <select
                  className={inputClass}
                  value={form.appointmentType}
                  onChange={(event) => updateField('appointmentType', event.target.value)}
                >
                  {APPOINTMENT_TYPES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Date">
                <input
                  className={inputClass}
                  type="date"
                  value={form.date}
                  onChange={(event) => updateField('date', event.target.value)}
                />
              </FormField>
              <FormField label="Time">
                <input
                  className={inputClass}
                  type="time"
                  value={form.time}
                  onChange={(event) => updateField('time', event.target.value)}
                />
              </FormField>
              <FormField label="Location">
                <input
                  className={inputClass}
                  value={form.location}
                  onChange={(event) => updateField('location', event.target.value)}
                  placeholder="Property, office, phone, video link..."
                />
              </FormField>
              <FormField label="Related client/prospect/lead">
                <input
                  className={inputClass}
                  value={form.relatedRecord}
                  onChange={(event) => updateField('relatedRecord', event.target.value)}
                  placeholder="Client or record name"
                />
              </FormField>
              <FormField label="Assigned agent">
                <input
                  className={inputClass}
                  value={form.assignedAgent}
                  onChange={(event) => updateField('assignedAgent', event.target.value)}
                  placeholder="Agent name"
                />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea
                className={`${inputClass} min-h-[96px] resize-y`}
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Agenda, access notes, reminders..."
              />
            </FormField>
          </>
        ) : null}
      </form>
    </Modal>
  )
}

function QuickCreateDropdown({ className = '' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { agencyWorkflowMode, profile, role } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [pendingCreateKind, setPendingCreateKind] = useState('')
  const [pendingCreateInitialForm, setPendingCreateInitialForm] = useState({})
  const [activeType, setActiveType] = useState('')
  const [form, setForm] = useState(INITIAL_FORMS.lead)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ kind: '', message: '' })
  const [listingOptions, setListingOptions] = useState([])
  const [listingOptionsLoading, setListingOptionsLoading] = useState(false)
  const [agentOptions, setAgentOptions] = useState([])
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false)
  const [menuOffsetLeft, setMenuOffsetLeft] = useState(0)
  const containerRef = useRef(null)

  const actor = useMemo(() => {
    const fullName = normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '))
    return {
      id: normalizeText(profile?.id),
      userId: normalizeText(profile?.id),
      name: fullName || 'Current user',
      email: normalizeText(profile?.email),
      avatarUrl: getAgentProfileAvatarUrl(profile),
      branchId: '',
    }
  }, [profile])

  const quickCreateGroups = useMemo(
    () => {
      if (role === 'bond_originator') return BOND_ORIGINATOR_QUICK_CREATE_GROUPS
      return location.pathname.startsWith('/commercial') ? COMMERCIAL_QUICK_CREATE_GROUPS : RESIDENTIAL_QUICK_CREATE_GROUPS
    },
    [location.pathname, role],
  )

  useEffect(() => {
    function onClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return undefined

    function positionMenu() {
      const triggerRect = containerRef.current?.getBoundingClientRect()
      setMenuOffsetLeft(getQuickCreateMenuOffset(triggerRect, window.innerWidth))
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    return () => window.removeEventListener('resize', positionMenu)
  }, [open])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape') {
        return
      }

      if (saving) {
        return
      }

      if (pendingCreateKind) {
        setPendingCreateKind('')
        setPendingCreateInitialForm({})
        return
      }

      if (activeType) {
        setActiveType('')
        setFeedback({ kind: '', message: '' })
        setSaving(false)
        return
      }

      if (open) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeType, open, pendingCreateKind, saving])

  useEffect(() => {
    if (activeType !== 'lead') return undefined
    let isCancelled = false

    async function loadCurrentListings() {
      const localOptions = dedupeListingOptions(readAgentPrivateListings())
      if (!isCancelled) {
        setListingOptions(localOptions)
        setListingOptionsLoading(true)
      }

      try {
        const organisationId = await resolveOrganisationId()
        const remoteListings = await getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
        if (!isCancelled) {
          setListingOptions(dedupeListingOptions([
            ...(Array.isArray(remoteListings) ? remoteListings : []),
            ...readAgentPrivateListings(),
          ]))
        }
      } catch {
        if (!isCancelled) {
          setListingOptions(localOptions)
        }
      } finally {
        if (!isCancelled) {
          setListingOptionsLoading(false)
        }
      }
    }

    void loadCurrentListings()

    return () => {
      isCancelled = true
    }
  }, [activeType])

  useEffect(() => {
    if (activeType !== 'lead' && activeType !== 'prospect') return undefined
    let isCancelled = false

    async function loadAgentOptions() {
      setAgentOptions(buildAgentOptions([], actor))
      setAgentOptionsLoading(true)

      try {
        const users = await listOrganisationUsers()
        if (!isCancelled) {
          setAgentOptions(buildAgentOptions(Array.isArray(users) ? users : [], actor))
        }
      } catch {
        if (!isCancelled) {
          setAgentOptions(buildAgentOptions([], actor))
        }
      } finally {
        if (!isCancelled) {
          setAgentOptionsLoading(false)
        }
      }
    }

    void loadAgentOptions()

    return () => {
      isCancelled = true
    }
  }, [activeType, actor])

  function openModal(type, initialForm = {}) {
    const resolvedType = type || 'lead'
    const actorOption = buildActorAgentOption(actor)
    const nextForm = {
      ...INITIAL_FORMS[resolvedType],
      assignedAgent: actorOption.name === 'Current user' ? '' : actorOption.name,
      assignedAgentId: actorOption.id,
      assignedAgentEmail: actorOption.email,
      assignedAgentAvatarUrl: actorOption.avatarUrl,
      ...initialForm,
    }
    setOpen(false)
    setPendingCreateKind('')
    setPendingCreateInitialForm({})
    setActiveType(resolvedType)
    setFeedback({ kind: '', message: '' })
    setForm({
      ...nextForm,
      ...(resolvedType === 'lead'
        ? {
            source: normalizeLeadSource(nextForm.source),
            listingId: isBuyerStyleLeadType(nextForm.leadType) ? normalizeText(nextForm.listingId) : '',
          }
        : {}),
    })
  }

  function handleItemSelect(item) {
    if (item.action === 'route' && item.to) {
      setOpen(false)
      setPendingCreateKind('')
      setPendingCreateInitialForm({})
      const state =
        item.type === 'listing'
          ? { ...(item.state || {}), listingModalMode: role === 'agent' ? agencyWorkflowMode : 'principal' }
          : item.state
      navigate(item.to, state ? { state } : undefined)
      return
    }

    if (item.type === 'lead' || item.type === 'prospect') {
      setOpen(false)
      setFeedback({ kind: '', message: '' })
      setPendingCreateKind(item.type)
      setPendingCreateInitialForm(item.initialForm || {})
      return
    }

    openModal(item.modalType || item.type, item.initialForm || {})
  }

  function closeModal() {
    setActiveType('')
    setFeedback({ kind: '', message: '' })
    setSaving(false)
    setPendingCreateKind('')
    setPendingCreateInitialForm({})
  }

  function closeAudienceModal() {
    setPendingCreateKind('')
    setPendingCreateInitialForm({})
  }

  function chooseAudience(choiceKey) {
    const flowType = pendingCreateKind
    if (!flowType) {
      closeAudienceModal()
      return
    }

    const selectedChoice = choiceKey === 'seller' ? 'Seller' : 'Buyer'
    const nextInitialForm =
      flowType === 'lead'
        ? { ...pendingCreateInitialForm, leadType: selectedChoice }
        : { ...pendingCreateInitialForm, prospectType: selectedChoice }

    closeAudienceModal()
    openModal(flowType, nextInitialForm)
  }

  function validateCurrentForm() {
    if (activeType === 'lead' || activeType === 'prospect') {
      if (!normalizeText(form.name)) {
        return 'Add a name before saving.'
      }
      if (!isValidEmail(form.email)) {
        return 'Add a valid email address or leave it blank.'
      }
      return ''
    }

    if (activeType === 'appointment') {
      if (!normalizeText(form.title)) {
        return 'Add an appointment title before saving.'
      }
      if (!normalizeText(form.date) || !normalizeText(form.time)) {
        return 'Add a date and time before saving.'
      }
      const scheduledAt = new Date(`${form.date}T${form.time}`)
      if (Number.isNaN(scheduledAt.getTime())) {
        return 'Add a valid appointment date and time.'
      }
      return ''
    }

    return 'Choose what you want to create first.'
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationMessage = validateCurrentForm()
    if (validationMessage) {
      setFeedback({ kind: 'error', message: validationMessage })
      return
    }

    setSaving(true)
    setFeedback({ kind: '', message: '' })

    try {
      const organisationId = await resolveOrganisationId()
      const createdAt = new Date().toISOString()

      if (activeType === 'lead') {
        const nameParts = splitName(form.name)
        const selectedListing = listingOptions.find((option) => option.id === normalizeText(form.listingId)) || null
        const selectedAssignedAgent = getSelectedAgentOption(form, agentOptions, actor)
        await createAgencyCrmLeadRecord(
          organisationId,
          {
            assignedAgent: selectedAssignedAgent,
            assignedUserId: normalizeText(selectedAssignedAgent.userId || selectedAssignedAgent.id),
            createdBy: normalizeText(actor.userId || actor.id),
            contact: {
              firstName: nameParts.firstName,
              lastName: nameParts.lastName,
              phone: normalizeText(form.phone),
              email: normalizeText(form.email).toLowerCase(),
              contactType: normalizeText(form.leadType) || 'Lead',
              notes: normalizeText(form.notes),
            },
            lead: {
              leadCategory: normalizeLeadCategory(form.leadType, 'buyer'),
              leadDirection: 'Inbound',
              leadSource: normalizeLeadSource(form.source),
              stage: 'New Lead',
              status: 'New Lead',
              priority: 'Medium',
              listingId: normalizeText(selectedListing?.id),
              propertyInterest: normalizeText(selectedListing?.label),
              notes: normalizeText(form.notes),
            },
          },
          { actor },
        )
        setFeedback({ kind: 'success', message: 'Lead created. It is ready in the pipeline workspace.' })
      } else if (activeType === 'prospect') {
        const nameParts = splitName(form.name)
        const prospectType = normalizeText(form.prospectType) || 'Buyer'
        const leadCategory = inferLeadCategoryFromRecord({ leadCategory: prospectType, leadSource: 'Manual Entry' }, 'buyer')
        const selectedAssignedAgent = getSelectedAgentOption(form, agentOptions, actor)
        await createAgencyCrmLeadRecord(
          organisationId,
          {
            assignedAgent: selectedAssignedAgent,
            assignedUserId: normalizeText(selectedAssignedAgent.userId || selectedAssignedAgent.id),
            createdBy: normalizeText(actor.userId || actor.id),
            contact: {
              firstName: nameParts.firstName,
              lastName: nameParts.lastName,
              phone: normalizeText(form.phone),
              email: normalizeText(form.email).toLowerCase(),
              contactType: 'Prospect',
              notes: normalizeText(form.notes),
            },
            lead: {
              leadCategory,
              leadDirection: 'Inbound',
              leadSource: 'Manual',
              stage: 'New Lead',
              status: 'New Lead',
              priority: 'Medium',
              propertyInterest: normalizeText(form.interest),
              notes: [
                normalizeText(form.timeline) ? `Timeline: ${normalizeText(form.timeline)}` : '',
                normalizeText(form.notes),
              ].filter(Boolean).join('\n'),
            },
          },
          { actor },
        )
        setFeedback({ kind: 'success', message: 'Prospect created as a canonical lead.' })
      } else if (activeType === 'appointment') {
        const fallbackRecord = {
          organisationId,
          title: normalizeText(form.title),
          appointmentType: normalizeText(form.appointmentType),
          date: form.date,
          time: form.time,
          startTime: `${form.date}T${form.time}`,
          location: normalizeText(form.location),
          relatedRecord: normalizeText(form.relatedRecord),
          assignedAgent: normalizeText(form.assignedAgent) || actor.name,
          assignedAgentId: actor.id,
          assignedAgentEmail: actor.email,
          notes: normalizeText(form.notes),
          status: 'requested',
          workspacePath: location.pathname,
          createdAt,
        }
        await createAppointmentAsync(
          organisationId,
          {
            title: fallbackRecord.title || fallbackRecord.appointmentType || 'Appointment',
            appointmentType: fallbackRecord.appointmentType,
            date: form.date,
            startTime: form.time,
            locationType: 'physical_address',
            location: fallbackRecord.location,
            status: 'requested',
            notes: [
              fallbackRecord.relatedRecord ? `Related record: ${fallbackRecord.relatedRecord}` : '',
              fallbackRecord.notes,
            ].filter(Boolean).join('\n'),
            assignedAgent: {
              id: actor.id,
              name: fallbackRecord.assignedAgent,
              email: actor.email,
            },
            sendInviteEmails: false,
            attachCalendarInvite: false,
          },
          { actor },
        )
        setFeedback({ kind: 'success', message: 'Appointment created and added to the calendar.' })
      }

      setForm({
        ...INITIAL_FORMS[activeType],
        assignedAgent: actor.name === 'Current user' ? '' : actor.name,
        assignedAgentId: actor.id,
        assignedAgentEmail: actor.email,
        assignedAgentAvatarUrl: getAgentProfileAvatarUrl(actor),
        ...(activeType === 'lead' ? { source: LEAD_SOURCE_OPTIONS[0], listingId: '' } : {}),
      })
    } catch {
      setFeedback({ kind: 'error', message: 'We could not save that yet. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={`relative shrink-0 ${className}`.trim()} ref={containerRef}>
        <button
          type="button"
          className="ui-shell-create-button"
          onClick={(event) => {
            if (!open) {
              setMenuOffsetLeft(getQuickCreateMenuOffset(event.currentTarget.getBoundingClientRect(), window.innerWidth))
            }
            setOpen((previous) => !previous)
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="quick-create-button"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Create</span>
          <ChevronDown size={14} />
        </button>

        {open ? (
          <div
            className="ui-surface-floating absolute top-[calc(100%+12px)] z-[120] w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-96px)] overflow-y-auto border-[#dde6ef] bg-white p-2 shadow-[0_24px_56px_rgba(15,23,42,0.14)]"
            style={{ left: menuOffsetLeft }}
            role="menu"
            data-testid="quick-create-menu"
          >
            <div className="px-3 pb-3 pt-2">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Create</p>
              <p className="mt-1 text-sm text-[#7b8ca2]">Choose the record or workspace you want to open.</p>
            </div>
            {quickCreateGroups.map((group, groupIndex) => (
              <div key={group.label} className={`border-t border-[#edf2f7] py-2 first:border-t-0 first:pt-0 ${groupIndex === 0 ? 'pt-0' : 'pt-3'}`.trim()}>
                <p className="px-3 pb-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">{group.label}</p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const iconTileClass =
                    item.type === 'lead' || item.type === 'listing' || item.type === 'appointment'
                      ? 'bg-[#eef4fb] text-[#24465d]'
                      : item.type === 'prospect' || item.type === 'client' || item.type === 'viewing'
                        ? 'bg-[#edf8f1] text-[#1f7a45]'
                        : 'bg-[#f1f5f9] text-[#42596f]'
                  return (
                    <button
                      key={item.type}
                      type="button"
                      className="group flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left transition duration-150 ease-out hover:bg-[#f7fafc] focus-visible:bg-[#f7fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#274c69]/15"
                      onClick={() => handleItemSelect(item)}
                      role="menuitem"
                      aria-haspopup={item.type === 'lead' || item.type === 'prospect' ? 'dialog' : undefined}
                      data-testid={`quick-create-${item.type}`}
                    >
                      <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] transition group-hover:bg-white ${iconTileClass}`}>
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.95rem] font-semibold text-[#162334]">{item.label}</span>
                        <span className="mt-0.5 block text-xs font-medium leading-5 text-[#6b7d93]">{item.helper}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <QuickCreateModal
        type={activeType}
        form={form}
        setForm={setForm}
        onClose={closeModal}
        onSubmit={handleSubmit}
        saving={saving}
        feedback={feedback}
        listingOptions={listingOptions}
        listingOptionsLoading={listingOptionsLoading}
        agentOptions={agentOptions}
        agentOptionsLoading={agentOptionsLoading}
      />

      <QuickCreateAudienceModal
        kind={pendingCreateKind}
        onClose={closeAudienceModal}
        onChoose={chooseAudience}
      />
    </>
  )
}

export default QuickCreateDropdown
