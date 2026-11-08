export const RENTAL_VIEWING_VERSION='arch9_rental_viewing_v1';export const RENTAL_VIEWING_OUTCOMES=Object.freeze(['attended','no_show','cancelled','reschedule_requested'])
const text=(v)=>String(v??'').trim()
export function createRentalViewingAppointment({appointmentId='',organisationId='',vacancyId='',leadId='',startsAt='',idempotencyKey=''}={}){if(!text(appointmentId)||!text(organisationId)||!text(vacancyId)||!text(leadId)||!text(startsAt)||!text(idempotencyKey))throw new Error('Appointment, organisation, vacancy, lead, start time and idempotency key are required.');return{appointmentId:text(appointmentId),organisationId:text(organisationId),vacancyId:text(vacancyId),leadId:text(leadId),appointmentType:'rental_viewing',startsAt:new Date(startsAt).toISOString(),idempotencyKey:text(idempotencyKey)}}
export function recordRentalViewingOutcome(viewing={},outcome=''){if(!RENTAL_VIEWING_OUTCOMES.includes(text(outcome)))throw new Error('Choose a supported viewing outcome.');return{...viewing,outcome:text(outcome),pipelineAction:text(outcome)==='attended'?'advance_to_application':text(outcome)==='reschedule_requested'?'return_to_contacted':'retain_stage'}}

export function findScheduledRentalViewingActivity(activities = [], tenantLeadId = '', startsAt = '') {
  return activities.find((activity) => {
    const metadata = activity.metadata || activity.metadata_json || {}
    return text(activity.activity_type || activity.activityType) === 'rental_viewing_scheduled'
      && text(metadata.tenantLeadId) === text(tenantLeadId)
      && text(metadata.startsAt) === text(startsAt)
  }) || null
}

export function findRentalViewingOutcomeActivity(activities = [], viewingId = '') {
  return activities.find((activity) =>
    text(activity.activity_type || activity.activityType) === 'rental_viewing_outcome'
      && text((activity.metadata || activity.metadata_json || {}).viewingId) === text(viewingId)) || null
}

// The activity primary key makes simultaneous retries conflict at the database,
// even when both agents read the history before either insert has completed.
export async function rentalViewingActivityId(kind, ...identity) {
  const name = new TextEncoder().encode(JSON.stringify([kind, ...identity.map(text)]))
  const namespace = Uint8Array.from([0x7d, 0x00, 0x56, 0xca, 0xb3, 0x6b, 0x4b, 0xfd, 0x8c, 0xd4, 0xa6, 0x60, 0x16, 0x3c, 0xc3, 0x25])
  const input = new Uint8Array(namespace.length + name.length)
  input.set(namespace); input.set(name, namespace.length)
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1', input)).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
