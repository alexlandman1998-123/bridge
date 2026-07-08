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
  },
}

export function isMobileCreateType(type = '') {
  return Boolean(CREATE_CONFIG[String(type || '').trim()])
}

export function getMobileCreateConfig(type = '') {
  return CREATE_CONFIG[String(type || '').trim()] || null
}

export function mobileDraftMatchesModule(draft = {}, moduleKey = '') {
  const module = String(draft.module || '').trim()
  if (moduleKey === 'transactions') return module === 'transaction'
  if (moduleKey === 'leads') return module === 'lead'
  if (moduleKey === 'tasks') return module === 'task'
  if (moduleKey === 'activity') return module === 'activity'
  return module === moduleKey
}
