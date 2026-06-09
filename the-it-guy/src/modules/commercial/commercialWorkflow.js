export const REQUIREMENT_LIFECYCLE = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'qualified', label: 'Qualified', tone: 'violet' },
  { value: 'matching', label: 'Matching', tone: 'amber' },
  { value: 'viewing', label: 'Viewing', tone: 'amber' },
  { value: 'negotiating', label: 'Negotiating', tone: 'emerald' },
  { value: 'converted', label: 'Converted', tone: 'emerald' },
  { value: 'lost', label: 'Lost', tone: 'rose' },
]

export const VACANCY_LIFECYCLE = [
  { value: 'available', label: 'Available', tone: 'emerald' },
  { value: 'marketing', label: 'Marketing', tone: 'blue' },
  { value: 'under_offer', label: 'Under Offer', tone: 'amber' },
  { value: 'hot_in_progress', label: 'HOT In Progress', tone: 'violet' },
  { value: 'lease_pending', label: 'Lease Pending', tone: 'amber' },
  { value: 'occupied', label: 'Occupied', tone: 'emerald' },
  { value: 'archived', label: 'Archived', tone: 'slate' },
]

export const DEAL_LIFECYCLE = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'qualified', label: 'Qualified', tone: 'violet' },
  { value: 'negotiation', label: 'Negotiation', tone: 'amber' },
  { value: 'hot_draft', label: 'HOT Draft', tone: 'slate' },
  { value: 'hot_sent', label: 'HOT Sent', tone: 'blue' },
  { value: 'hot_accepted', label: 'HOT Accepted', tone: 'emerald' },
  { value: 'lease_pending', label: 'Lease Pending', tone: 'amber' },
  { value: 'converted', label: 'Converted', tone: 'emerald' },
  { value: 'lost', label: 'Lost', tone: 'rose' },
]

export const HOT_LIFECYCLE = [
  { value: 'draft', label: 'Draft', tone: 'slate' },
  { value: 'sent', label: 'Sent', tone: 'blue' },
  { value: 'under_review', label: 'Under Review', tone: 'amber' },
  { value: 'accepted', label: 'Accepted', tone: 'emerald' },
  { value: 'rejected', label: 'Rejected', tone: 'rose' },
  { value: 'signed', label: 'Signed', tone: 'emerald' },
  { value: 'converted', label: 'Converted', tone: 'emerald' },
]

export const LEASE_LIFECYCLE = [
  { value: 'draft', label: 'Draft', tone: 'slate' },
  { value: 'pending_signature', label: 'Pending Signature', tone: 'amber' },
  { value: 'executed', label: 'Executed', tone: 'emerald' },
  { value: 'active', label: 'Active', tone: 'emerald' },
  { value: 'renewal_pending', label: 'Renewal Pending', tone: 'amber' },
  { value: 'expired', label: 'Expired', tone: 'rose' },
  { value: 'terminated', label: 'Terminated', tone: 'rose' },
]

const LIFECYCLE_ALIASES = {
  requirements: {
    new_requirement: 'new',
    shortlisting: 'matching',
    proposal: 'negotiating',
    negotiation: 'negotiating',
    lease_stage: 'converted',
    closed_won: 'converted',
    closed_lost: 'lost',
  },
  vacancies: {
    active: 'available',
    reserved: 'under_offer',
    under_negotiation: 'under_offer',
    leased: 'occupied',
    upcoming: 'marketing',
  },
  deals: {
    requirement: 'new',
    shortlist: 'qualified',
    proposal: 'negotiation',
    heads_of_terms: 'hot_draft',
    lease_draft: 'lease_pending',
    signed: 'converted',
    closed_won: 'converted',
    closed_lost: 'lost',
  },
  headsOfTerms: {
    sent_for_review: 'sent',
    approved_by_landlord: 'accepted',
    approved_by_tenant: 'accepted',
    ready_for_lease: 'signed',
    superseded: 'converted',
  },
  leases: {
    expiring_soon: 'renewal_pending',
    renewed: 'active',
  },
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeCommercialLifecycleStage(kind, value, fallback = 'new') {
  const normalized = normalize(value)
  return LIFECYCLE_ALIASES[kind]?.[normalized] || normalized || fallback
}

export function getCommercialLifecycle(kind) {
  if (kind === 'requirements') return REQUIREMENT_LIFECYCLE
  if (kind === 'vacancies') return VACANCY_LIFECYCLE
  if (kind === 'deals') return DEAL_LIFECYCLE
  if (kind === 'headsOfTerms' || kind === 'heads_of_terms') return HOT_LIFECYCLE
  if (kind === 'leases') return LEASE_LIFECYCLE
  return []
}

export function lifecycleOptions(kind) {
  return getCommercialLifecycle(kind).map(({ value, label }) => ({ value, label }))
}

export function buildCommercialConversionMetrics({
  requirements = [],
  deals = [],
  headsOfTerms = [],
  leases = [],
} = {}) {
  const requirementCount = requirements.length
  const dealCount = deals.length
  const hotCount = headsOfTerms.length
  const signedHotCount = headsOfTerms.filter((hot) => ['signed', 'converted', 'ready_for_lease'].includes(normalize(hot.status))).length
  const leaseCount = leases.length
  const activeLeaseCount = leases.filter((lease) => ['active', 'executed'].includes(normalize(lease.status))).length
  const percentage = (part, total) => total ? Math.round((part / total) * 100) : 0

  return {
    requirementToDeal: { from: requirementCount, to: dealCount, percentage: percentage(dealCount, requirementCount) },
    dealToHot: { from: dealCount, to: hotCount, percentage: percentage(hotCount, dealCount) },
    hotToSigned: { from: hotCount, to: signedHotCount, percentage: percentage(signedHotCount, hotCount) },
    signedToLease: { from: signedHotCount, to: leaseCount, percentage: percentage(leaseCount, signedHotCount) },
    leaseToActive: { from: leaseCount, to: activeLeaseCount, percentage: percentage(activeLeaseCount, leaseCount) },
  }
}
