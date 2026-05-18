import { CalendarPlus, ChevronDown, Loader2, Plus, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyCrmLeadRecord } from '../lib/agencyCrmRepository'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import Modal from './ui/Modal'

const QUICK_CREATE_STORAGE_KEY = 'bridge:quick-create-records:v1'

const QUICK_CREATE_ITEMS = [
  {
    type: 'lead',
    label: 'Lead',
    helper: 'Capture a new buyer or seller enquiry',
    icon: UserPlus,
  },
  {
    type: 'prospect',
    label: 'Prospect',
    helper: 'Add a potential future client',
    icon: UsersRound,
  },
  {
    type: 'appointment',
    label: 'Appointment',
    helper: 'Schedule a viewing or meeting',
    icon: CalendarPlus,
  },
]

const PERSON_TYPES = ['Buyer', 'Seller', 'Tenant', 'Landlord', 'Investor']
const APPOINTMENT_TYPES = [
  'Viewing',
  'Valuation',
  'Mandate Meeting',
  'Buyer Consultation',
  'Seller Consultation',
  'Lease Meeting',
  'General Meeting',
]

const INITIAL_FORMS = {
  lead: {
    name: '',
    phone: '',
    email: '',
    leadType: 'Buyer',
    source: '',
    notes: '',
    assignedAgent: '',
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

function normalizeText(value) {
  return String(value || '').trim()
}

function isValidEmail(value) {
  const email = normalizeText(value)
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function createRecordId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function splitName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function readQuickCreateStore() {
  if (typeof window === 'undefined') {
    return { prospects: [], appointments: [] }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUICK_CREATE_STORAGE_KEY) || '{}')
    return {
      prospects: Array.isArray(parsed.prospects) ? parsed.prospects : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
    }
  } catch {
    return { prospects: [], appointments: [] }
  }
}

function saveQuickCreateRecord(type, payload) {
  if (typeof window === 'undefined') {
    return payload
  }

  const store = readQuickCreateStore()
  const collectionKey = type === 'appointment' ? 'appointments' : 'prospects'
  const nextStore = {
    ...store,
    [collectionKey]: [payload, ...(store[collectionKey] || [])],
  }
  window.localStorage.setItem(QUICK_CREATE_STORAGE_KEY, JSON.stringify(nextStore))
  return payload
}

async function resolveOrganisationId() {
  try {
    const context = await fetchOrganisationSettings()
    return normalizeText(context?.organisation?.id || 'default') || 'default'
  } catch {
    return 'default'
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

function QuickCreateModal({ type, form, setForm, onClose, onSubmit, saving, feedback }) {
  const isLead = type === 'lead'
  const isProspect = type === 'prospect'
  const isAppointment = type === 'appointment'

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
                  <input
                    className={inputClass}
                    value={form.source}
                    onChange={(event) => updateField('source', event.target.value)}
                    placeholder="Website, referral, signboard..."
                  />
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
  const { profile } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [activeType, setActiveType] = useState('')
  const [form, setForm] = useState(INITIAL_FORMS.lead)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ kind: '', message: '' })
  const containerRef = useRef(null)

  const actor = useMemo(() => {
    const fullName = normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '))
    return {
      id: normalizeText(profile?.id),
      name: fullName || 'Current user',
      email: normalizeText(profile?.email),
    }
  }, [profile?.email, profile?.firstName, profile?.fullName, profile?.id, profile?.lastName])

  useEffect(() => {
    function onClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function openModal(type) {
    setOpen(false)
    setActiveType(type)
    setFeedback({ kind: '', message: '' })
    setForm({
      ...INITIAL_FORMS[type],
      assignedAgent: actor.name === 'Current user' ? '' : actor.name,
    })
  }

  function closeModal() {
    setActiveType('')
    setFeedback({ kind: '', message: '' })
    setSaving(false)
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
        await createAgencyCrmLeadRecord(
          organisationId,
          {
            assignedAgent: actor,
            contact: {
              firstName: nameParts.firstName,
              lastName: nameParts.lastName,
              phone: normalizeText(form.phone),
              email: normalizeText(form.email).toLowerCase(),
              contactType: normalizeText(form.leadType) || 'Lead',
              notes: normalizeText(form.notes),
            },
            lead: {
              leadCategory: normalizeText(form.leadType) || 'Buyer',
              leadDirection: 'Inbound',
              leadSource: normalizeText(form.source) || 'Quick Create',
              stage: 'New Lead',
              status: 'New Lead',
              priority: 'Medium',
              notes: normalizeText(form.notes),
            },
          },
          { actor },
        )
        setFeedback({ kind: 'success', message: 'Lead created. It is ready in the pipeline workspace.' })
      } else if (activeType === 'prospect') {
        saveQuickCreateRecord('prospect', {
          id: createRecordId('prospect'),
          organisationId,
          name: normalizeText(form.name),
          phone: normalizeText(form.phone),
          email: normalizeText(form.email).toLowerCase(),
          prospectType: normalizeText(form.prospectType),
          interest: normalizeText(form.interest),
          timeline: normalizeText(form.timeline),
          notes: normalizeText(form.notes),
          assignedAgent: normalizeText(form.assignedAgent),
          workspacePath: location.pathname,
          createdAt,
        })
        setFeedback({ kind: 'success', message: 'Prospect saved to quick-create records.' })
      } else if (activeType === 'appointment') {
        saveQuickCreateRecord('appointment', {
          id: createRecordId('appointment'),
          organisationId,
          title: normalizeText(form.title),
          appointmentType: normalizeText(form.appointmentType),
          startTime: `${form.date}T${form.time}`,
          location: normalizeText(form.location),
          relatedRecord: normalizeText(form.relatedRecord),
          assignedAgent: normalizeText(form.assignedAgent),
          notes: normalizeText(form.notes),
          status: 'scheduled',
          workspacePath: location.pathname,
          createdAt,
        })
        setFeedback({ kind: 'success', message: 'Appointment saved to quick-create records.' })
      }

      setForm({
        ...INITIAL_FORMS[activeType],
        assignedAgent: actor.name === 'Current user' ? '' : actor.name,
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
          onClick={() => setOpen((previous) => !previous)}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="quick-create-button"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Create</span>
          <ChevronDown size={14} />
        </button>

        {open ? (
          <div className="ui-surface-floating absolute right-0 top-[calc(100%+12px)] z-40 w-[300px] p-2" role="menu">
            <div className="px-3 pb-2 pt-1">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-textMuted">Create</p>
            </div>
            {QUICK_CREATE_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.type}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left transition hover:bg-surfaceAlt"
                  onClick={() => openModal(item.type)}
                  role="menuitem"
                  data-testid={`quick-create-${item.type}`}
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#edf4fb] text-[#24465d]">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-textStrong">{item.label}</span>
                    <span className="mt-0.5 block text-xs font-medium text-textMuted">{item.helper}</span>
                  </span>
                </button>
              )
            })}
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
      />
    </>
  )
}

export default QuickCreateDropdown
