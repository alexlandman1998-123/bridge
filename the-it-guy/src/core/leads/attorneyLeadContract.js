export const ATTORNEY_LEAD_DOMAIN = 'attorney'

export const ATTORNEY_LEAD_SERVICE_TYPES = Object.freeze({
  transferQuote: 'transfer_quote',
  propertyTransfer: 'property_transfer',
  bondRegistration: 'bond_registration',
  bondCancellation: 'bond_cancellation',
  propertyLegalAdvice: 'property_legal_advice',
  generalEnquiry: 'general_enquiry',
})

export const ATTORNEY_LEAD_SERVICE_TYPE_VALUES = Object.freeze(
  Object.values(ATTORNEY_LEAD_SERVICE_TYPES),
)

export const ATTORNEY_LEAD_STAGES = Object.freeze({
  new: 'new',
  contacted: 'contacted',
  qualified: 'qualified',
  quoteSent: 'quote_sent',
  followUp: 'follow_up',
  won: 'won',
  lost: 'lost',
})

export const ATTORNEY_LEAD_STAGE_VALUES = Object.freeze(
  Object.values(ATTORNEY_LEAD_STAGES),
)

export const ATTORNEY_LEAD_LIFECYCLE_STATUSES = Object.freeze({
  open: 'open',
  won: 'won',
  lost: 'lost',
  archived: 'archived',
})

export const ATTORNEY_LEAD_LIFECYCLE_STATUS_VALUES = Object.freeze(
  Object.values(ATTORNEY_LEAD_LIFECYCLE_STATUSES),
)

export const ATTORNEY_LEAD_SOURCE_CHANNELS = Object.freeze({
  instagram: 'instagram',
  facebook: 'facebook',
  linkedin: 'linkedin',
  website: 'website',
  whatsapp: 'whatsapp',
  email: 'email',
  qr: 'qr',
  referral: 'referral',
  manual: 'manual',
  other: 'other',
})

export const ATTORNEY_LEAD_SOURCE_CHANNEL_VALUES = Object.freeze(
  Object.values(ATTORNEY_LEAD_SOURCE_CHANNELS),
)

export const ATTORNEY_LEAD_ACCESS_SCOPES = Object.freeze({
  all: 'all',
  branch: 'branch',
  assignedAndUnassigned: 'assigned_and_unassigned',
  assigned: 'assigned',
})

const FULL_ACCESS = Object.freeze({
  scope: ATTORNEY_LEAD_ACCESS_SCOPES.all,
  view: true,
  create: true,
  edit: true,
  assign: true,
  archive: true,
})

const BRANCH_MANAGEMENT_ACCESS = Object.freeze({
  scope: ATTORNEY_LEAD_ACCESS_SCOPES.branch,
  view: true,
  create: true,
  edit: true,
  assign: true,
  archive: false,
})

const PRACTITIONER_ACCESS = Object.freeze({
  scope: ATTORNEY_LEAD_ACCESS_SCOPES.assignedAndUnassigned,
  view: true,
  create: true,
  edit: true,
  assign: false,
  archive: false,
})

const ASSIGNED_CONTRIBUTOR_ACCESS = Object.freeze({
  scope: ATTORNEY_LEAD_ACCESS_SCOPES.assigned,
  view: true,
  create: true,
  edit: true,
  assign: false,
  archive: false,
})

const ASSIGNED_READ_ONLY_ACCESS = Object.freeze({
  scope: ATTORNEY_LEAD_ACCESS_SCOPES.assigned,
  view: true,
  create: false,
  edit: false,
  assign: false,
  archive: false,
})

export const ATTORNEY_LEAD_ROLE_ACCESS = Object.freeze({
  owner: FULL_ACCESS,
  partner: FULL_ACCESS,
  director: FULL_ACCESS,
  firm_admin: FULL_ACCESS,
  director_partner: FULL_ACCESS,
  branch_manager: BRANCH_MANAGEMENT_ACCESS,
  attorney: PRACTITIONER_ACCESS,
  conveyancer: PRACTITIONER_ACCESS,
  transfer_attorney: PRACTITIONER_ACCESS,
  bond_attorney: PRACTITIONER_ACCESS,
  attorney_conveyancer: PRACTITIONER_ACCESS,
  candidate_attorney: PRACTITIONER_ACCESS,
  paralegal: ASSIGNED_CONTRIBUTOR_ACCESS,
  conveyancing_secretary: ASSIGNED_CONTRIBUTOR_ACCESS,
  admin_staff: BRANCH_MANAGEMENT_ACCESS,
  reception_scheduling: BRANCH_MANAGEMENT_ACCESS,
  viewer: ASSIGNED_READ_ONLY_ACCESS,
})

const SOURCE_ALIASES = Object.freeze({
  instagram: ATTORNEY_LEAD_SOURCE_CHANNELS.instagram,
  instagram_bio: ATTORNEY_LEAD_SOURCE_CHANNELS.instagram,
  ig: ATTORNEY_LEAD_SOURCE_CHANNELS.instagram,
  facebook: ATTORNEY_LEAD_SOURCE_CHANNELS.facebook,
  facebook_page: ATTORNEY_LEAD_SOURCE_CHANNELS.facebook,
  fb: ATTORNEY_LEAD_SOURCE_CHANNELS.facebook,
  linkedin: ATTORNEY_LEAD_SOURCE_CHANNELS.linkedin,
  website: ATTORNEY_LEAD_SOURCE_CHANNELS.website,
  web: ATTORNEY_LEAD_SOURCE_CHANNELS.website,
  whatsapp: ATTORNEY_LEAD_SOURCE_CHANNELS.whatsapp,
  email: ATTORNEY_LEAD_SOURCE_CHANNELS.email,
  qr: ATTORNEY_LEAD_SOURCE_CHANNELS.qr,
  qr_code: ATTORNEY_LEAD_SOURCE_CHANNELS.qr,
  referral: ATTORNEY_LEAD_SOURCE_CHANNELS.referral,
  manual: ATTORNEY_LEAD_SOURCE_CHANNELS.manual,
  phone: ATTORNEY_LEAD_SOURCE_CHANNELS.manual,
  walk_in: ATTORNEY_LEAD_SOURCE_CHANNELS.manual,
  other: ATTORNEY_LEAD_SOURCE_CHANNELS.other,
})

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function isAttorneyLeadServiceType(value) {
  return ATTORNEY_LEAD_SERVICE_TYPE_VALUES.includes(normalizeKey(value))
}

export function isAttorneyLeadStage(value) {
  return ATTORNEY_LEAD_STAGE_VALUES.includes(normalizeKey(value))
}

export function isAttorneyLeadLifecycleStatus(value) {
  return ATTORNEY_LEAD_LIFECYCLE_STATUS_VALUES.includes(normalizeKey(value))
}

export function normalizeAttorneyLeadSourceChannel(value) {
  return SOURCE_ALIASES[normalizeKey(value)] || ATTORNEY_LEAD_SOURCE_CHANNELS.other
}

export function sanitizeAttorneyLeadCampaignCode(value, maxLength = 80) {
  const safeMaxLength = Math.max(1, Math.min(Number(maxLength) || 80, 120))
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, safeMaxLength)
}

export function getAttorneyLeadLifecycleStatusForStage(stage, currentStatus = '') {
  const normalizedStage = normalizeKey(stage)
  const normalizedCurrentStatus = normalizeKey(currentStatus)

  if (normalizedCurrentStatus === ATTORNEY_LEAD_LIFECYCLE_STATUSES.archived) {
    return ATTORNEY_LEAD_LIFECYCLE_STATUSES.archived
  }
  if (normalizedStage === ATTORNEY_LEAD_STAGES.won) {
    return ATTORNEY_LEAD_LIFECYCLE_STATUSES.won
  }
  if (normalizedStage === ATTORNEY_LEAD_STAGES.lost) {
    return ATTORNEY_LEAD_LIFECYCLE_STATUSES.lost
  }
  if (isAttorneyLeadStage(normalizedStage)) {
    return ATTORNEY_LEAD_LIFECYCLE_STATUSES.open
  }
  return isAttorneyLeadLifecycleStatus(normalizedCurrentStatus)
    ? normalizedCurrentStatus
    : ATTORNEY_LEAD_LIFECYCLE_STATUSES.open
}

export function getAttorneyLeadRoleAccess(role) {
  return ATTORNEY_LEAD_ROLE_ACCESS[normalizeKey(role)] || null
}
