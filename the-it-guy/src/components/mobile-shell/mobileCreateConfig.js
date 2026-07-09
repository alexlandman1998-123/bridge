import { Clock3, FileText, MessageCircle, Plus, ScrollText, UsersRound } from 'lucide-react'

const CREATE_CONFIG = {
  lead: {
    eyebrow: 'Lead Capture',
    title: 'New lead',
    body: 'Capture the first contact details and sync it back to the agency pipeline.',
    module: 'lead',
    draftType: 'Lead Capture',
    primaryLabel: 'Lead name',
    primaryPlaceholder: 'Buyer or seller name',
    secondaryLabel: 'Phone or email',
    secondaryPlaceholder: 'Contact detail',
    notesLabel: 'Need or next step',
    notesPlaceholder: 'Budget, area, property interest, next call...',
    submitLabel: 'Save Lead',
    icon: UsersRound,
    requiredFields: ['primary', 'secondary'],
    contactField: 'secondary',
  },
  prospect: {
    eyebrow: 'Prospecting',
    title: 'Add prospect',
    body: 'Record a canvassing prospect before it becomes a qualified lead.',
    module: 'lead',
    draftType: 'Prospect Capture',
    primaryLabel: 'Prospect name',
    primaryPlaceholder: 'Owner, buyer, landlord or company',
    secondaryLabel: 'Source or area',
    secondaryPlaceholder: 'Canvassing, referral, suburb...',
    notesLabel: 'Prospecting note',
    notesPlaceholder: 'What was discussed and when to follow up...',
    submitLabel: 'Save Prospect',
    icon: FileText,
    requiredFields: ['primary'],
    atLeastOneFields: ['secondary', 'notes'],
  },
  transaction: {
    eyebrow: 'Deal Capture',
    title: 'New transaction',
    body: 'Start a transaction draft from the field and sync the details when ready.',
    module: 'transaction',
    draftType: 'Transaction Draft',
    primaryLabel: 'Client or deal name',
    primaryPlaceholder: 'Buyer, seller or transaction name',
    secondaryLabel: 'Property or reference',
    secondaryPlaceholder: 'Address, unit, listing or mandate',
    notesLabel: 'Deal note',
    notesPlaceholder: 'Price, stage, parties, next step...',
    submitLabel: 'Save Transaction Draft',
    icon: ScrollText,
    requiredFields: ['primary'],
    atLeastOneFields: ['secondary', 'notes'],
  },
  note: {
    eyebrow: 'Activity Note',
    title: 'Add note',
    body: 'Capture a quick field update for the shared activity stream.',
    module: 'activity',
    draftType: 'Note',
    primaryLabel: 'Note title',
    primaryPlaceholder: 'Short summary',
    secondaryLabel: 'Related item',
    secondaryPlaceholder: 'Lead, transaction, matter...',
    notesLabel: 'Note',
    notesPlaceholder: 'What happened?',
    submitLabel: 'Save Note',
    icon: MessageCircle,
    atLeastOneFields: ['primary', 'notes'],
  },
  'follow-up': {
    eyebrow: 'Task Capture',
    title: 'Schedule follow-up',
    body: 'Queue a reminder for yourself or the next owner.',
    module: 'task',
    draftType: 'Follow-up',
    primaryLabel: 'Follow-up title',
    primaryPlaceholder: 'Call buyer, send documents...',
    secondaryLabel: 'Due',
    secondaryPlaceholder: 'Today 16:00, tomorrow morning...',
    notesLabel: 'Reminder detail',
    notesPlaceholder: 'What needs to happen?',
    submitLabel: 'Save Follow-up',
    icon: Clock3,
    requiredFields: ['primary', 'secondary'],
  },
}

const FIELD_LABELS = {
  primary: 'Main detail',
  secondary: 'Supporting detail',
  notes: 'Notes',
}

const FIELD_LIMITS = {
  primary: 80,
  secondary: 140,
  notes: 1200,
}

function normalizeMobileCreateText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function getFieldLabel(config = {}, field = '') {
  if (field === 'primary') return config.primaryLabel || FIELD_LABELS.primary
  if (field === 'secondary') return config.secondaryLabel || FIELD_LABELS.secondary
  if (field === 'notes') return config.notesLabel || FIELD_LABELS.notes
  return FIELD_LABELS[field] || 'Field'
}

function looksLikePhoneOrEmail(value = '') {
  const text = normalizeMobileCreateText(value)
  if (!text) return false
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true
  return text.replace(/\D/g, '').length >= 7
}

export function isMobileCreateType(type = '') {
  return Boolean(CREATE_CONFIG[String(type || '').trim()])
}

export function getMobileCreateConfig(type = '') {
  return CREATE_CONFIG[String(type || '').trim()] || null
}

export function getMobileCreateFieldLimit(field = '') {
  return FIELD_LIMITS[field] || 240
}

export function validateMobileCreateForm(type = '', form = {}) {
  const config = getMobileCreateConfig(type)
  if (!config) {
    return { ok: false, errors: ['Choose a valid quick-create action.'] }
  }

  const errors = []
  const normalizedForm = {
    primary: normalizeMobileCreateText(form.primary),
    secondary: normalizeMobileCreateText(form.secondary),
    notes: normalizeMobileCreateText(form.notes),
  }

  for (const field of config.requiredFields || []) {
    if (!normalizedForm[field]) {
      errors.push(`${getFieldLabel(config, field)} is required.`)
    }
  }

  if (config.atLeastOneFields?.length && config.atLeastOneFields.every((field) => !normalizedForm[field])) {
    const labels = config.atLeastOneFields.map((field) => getFieldLabel(config, field).toLowerCase())
    errors.push(`Add ${labels.join(' or ')} before saving.`)
  }

  Object.entries(FIELD_LIMITS).forEach(([field, limit]) => {
    if (normalizedForm[field].length > limit) {
      errors.push(`${getFieldLabel(config, field)} must be ${limit} characters or fewer.`)
    }
  })

  if (config.contactField && normalizedForm[config.contactField] && !looksLikePhoneOrEmail(normalizedForm[config.contactField])) {
    errors.push('Add a usable phone number or email address.')
  }

  return { ok: errors.length === 0, errors }
}

export function mobileDraftMatchesModule(draft = {}, moduleKey = '') {
  const module = String(draft.module || '').trim()
  if (moduleKey === 'transactions') return module === 'transaction'
  if (moduleKey === 'leads') return module === 'lead'
  if (moduleKey === 'tasks') return module === 'task'
  if (moduleKey === 'activity') return module === 'activity'
  return module === moduleKey
}

export function mobileCreateDraftMatchesModule(draft = {}, moduleKey = '') {
  return mobileDraftMatchesModule({ module: draft.module }, moduleKey)
}
