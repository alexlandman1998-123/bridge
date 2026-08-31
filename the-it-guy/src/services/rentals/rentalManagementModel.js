export const RENTAL_MANAGEMENT_EVENT_VERSION = 'arch9_rental_management_event_v1'

export const RENTAL_MANAGEMENT_EVENT_TYPES = Object.freeze([
  { value: 'renewal', label: 'Renewal' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'arrears_follow_up', label: 'Arrears follow-up' },
  { value: 'communication', label: 'Communication' },
])

export const RENTAL_MANAGEMENT_EVENT_STATUSES = Object.freeze(['open', 'scheduled', 'in_progress', 'completed', 'cancelled'])

const text = (value) => String(value ?? '').trim()
const eventLabel = (value) => RENTAL_MANAGEMENT_EVENT_TYPES.find((item) => item.value === value)?.label || 'Management update'

export function buildRentalManagementEventPayload(lease = {}, form = {}, context = {}) {
  const type = text(form.type) || 'communication'
  const status = RENTAL_MANAGEMENT_EVENT_STATUSES.includes(text(form.status)) ? text(form.status) : 'open'
  const metadata = {
    captureVersion: RENTAL_MANAGEMENT_EVENT_VERSION,
    leaseReference: text(lease.reference),
    sourceLeaseId: text(lease.id),
    tenancy: { tenantName: text(lease.tenantName), listingId: text(lease.listingId), listingTitle: text(lease.listingTitle) },
    management: { type, status, dueDate: text(form.dueDate), note: text(form.note), createdAt: context.nowIso || new Date().toISOString() },
  }
  return {
    privateListingId: metadata.tenancy.listingId,
    activityType: 'rental_management_event',
    activityTitle: `${eventLabel(type)} - ${metadata.tenancy.tenantName || 'tenant'}`,
    activityDescription: metadata.management.note || `${eventLabel(type)} recorded.`,
    performedBy: context.performedBy || context.assignedAgentId || null,
    visibility: 'internal',
    metadata,
  }
}

export function mapRentalManagementEvent(activity = {}) {
  const metadata = activity.metadata || activity.metadata_json || {}
  const management = metadata.management || {}
  return {
    id: text(activity.id), leaseReference: text(metadata.leaseReference), leaseId: text(metadata.sourceLeaseId), tenantName: text(metadata.tenancy?.tenantName), listingTitle: text(metadata.tenancy?.listingTitle), type: text(management.type) || 'communication', status: text(management.status) || 'open', dueDate: text(management.dueDate), note: text(management.note || activity.activity_description || activity.activityDescription), createdAt: text(management.createdAt || activity.created_at),
  }
}

export function buildRentalManagementSummary({ leases = [], events = [], now = new Date() } = {}) {
  const activeLeases = leases.filter((lease) => ['active', 'fully_signed'].includes(text(lease.leaseStatus)))
  const open = events.filter((event) => !['completed', 'cancelled'].includes(event.status))
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() + 90)
  return {
    activeTenancies: activeLeases.length,
    renewalsDue: activeLeases.filter((lease) => lease.leaseEndDate && new Date(lease.leaseEndDate) <= cutoff).length,
    openMaintenance: open.filter((event) => event.type === 'maintenance').length,
    inspectionsDue: open.filter((event) => event.type === 'inspection').length,
    arrearsFollowUps: open.filter((event) => event.type === 'arrears_follow_up').length,
  }
}
