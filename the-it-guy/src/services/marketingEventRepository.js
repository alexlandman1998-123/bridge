import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { assertMarketingEventPublicationReadiness, getMarketingEventReadiness } from './marketingEventReadinessService'

const EVENT_TYPES = { showDays: 'show_day', launches: 'launch' }

function text(value) { return String(value || '').trim() }
function numeric(value) { return String(Number(value || 0)) }
function status(value) { return text(value).toLowerCase().replaceAll(' ', '_') || 'draft' }

function eventMetrics(row = {}) {
  const rsvps = Array.isArray(row.rsvps) ? row.rsvps : []
  if (!rsvps.length) return row.metadata || {}
  const registrations = rsvps.filter((rsvp) => rsvp.status !== 'cancelled')
  const attendees = registrations.filter((rsvp) => rsvp.checked_in_at)
  const interestedLeads = registrations.filter((rsvp) => ['high', 'medium'].includes(text(rsvp.interest_level).toLowerCase()) || text(rsvp.conversion_outcome) === 'attended_interested')
  return {
    ...(row.metadata || {}),
    registrations: registrations.length,
    confirmed: registrations.length,
    attendees: attendees.length,
    interestedLeads: interestedLeads.length,
    attendanceRate: registrations.length ? `${Math.round((attendees.length / registrations.length) * 100)}%` : '0%',
  }
}

function startAt(values = {}) {
  const date = text(values.startDate || values.date)
  const time = text(values.startTime || values.time).split('–')[0].trim() || '10:00'
  return date ? new Date(`${date}T${time}:00`).toISOString() : null
}

function endAt(values = {}) {
  const date = text(values.endDate || values.startDate || values.date)
  const time = text(values.endTime)
  return date && time ? new Date(`${date}T${time}:00`).toISOString() : null
}

export function canPersistMarketingEvents(organisationId = '') {
  return Boolean(isSupabaseConfigured && supabase && text(organisationId))
}

export function mapMarketingEvent(row = {}) {
  const metrics = eventMetrics(row)
  const type = row.event_type === 'launch' ? 'launches' : 'showDays'
  const start = row.starts_at ? new Date(row.starts_at) : null
  const date = start && !Number.isNaN(start.valueOf()) ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: row.timezone || 'Africa/Johannesburg' }).format(start) : 'Date to be confirmed'
  const time = start && !Number.isNaN(start.valueOf()) ? new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: row.timezone || 'Africa/Johannesburg' }).format(start) : 'Time to be confirmed'
  const event = {
    id: row.id,
    type,
    title: row.title,
    development: row.subject_type === 'development' || row.subject_type === 'phase' ? text(row.subject_label) : '',
    location: text(row.location || row.address),
    address: text(row.address || row.location),
    date,
    dayDate: date,
    time,
    status: text(row.status).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    image: text(row.image_url),
    imageAlt: text(row.title),
    description: text(row.description),
    publicToken: row.public_token,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    subjectId: row.subject_id || '',
    subjectLabel: text(row.subject_label),
    hostUserId: row.host_user_id,
    checklist: Array.isArray(metrics.checklist) ? metrics.checklist : [],
    invited: numeric(metrics.invited), registrations: numeric(metrics.registrations), attending: numeric(metrics.attendees || metrics.attending), leads: numeric(metrics.interestedLeads || metrics.leads),
    attendees: numeric(metrics.attendees), confirmed: numeric(metrics.confirmed), interestedLeads: numeric(metrics.interestedLeads), attendanceRate: text(metrics.attendanceRate) || '0%',
  }
  return { ...event, readiness: getMarketingEventReadiness(event, type) }
}

export async function listMarketingEvents(organisationId, kind) {
  const { data, error } = await supabase.from('marketing_events').select('*, rsvps:marketing_event_rsvps(id,status,checked_in_at,interest_level,conversion_outcome)').eq('organisation_id', organisationId).eq('event_type', EVENT_TYPES[kind]).order('starts_at', { ascending: true })
  if (error) throw error
  return (data || []).map(mapMarketingEvent)
}

export async function listMarketingEventListings(organisationId) {
  const { data, error } = await supabase.from('private_listings').select('id,property_address,suburb,city,listing_reference').eq('organisation_id', organisationId).order('updated_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    label: [text(row.property_address), text(row.suburb), text(row.city)].filter(Boolean).join(', ') || text(row.listing_reference) || 'Untitled listing',
  }))
}

export async function createMarketingEvent(organisationId, kind, values) {
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) throw new Error('Sign in before creating an event.')
  const startsAt = startAt(values)
  const endsAt = endAt(values)
  assertMarketingEventPublicationReadiness({ ...values, startsAt, startDate: values.startDate || values.date }, kind)
  const { data, error } = await supabase.from('marketing_events').insert({
    organisation_id: organisationId, event_type: EVENT_TYPES[kind], title: values.title, status: status(values.status),
    subject_type: kind === 'launches' ? 'development' : values.listingId ? 'listing' : 'unlinked', subject_id: values.listingId || null, subject_label: values.development || values.listingLabel || values.title,
    location: values.location || values.address, address: values.address || values.location, image_url: values.image || null,
    description: values.description || null, starts_at: startsAt, ends_at: endsAt, host_user_id: values.hostUserId || null, created_by: userId,
    metadata: { invited: values.invited || 0, registrations: values.registrations || 0, attending: values.attending || 0, leads: values.leads || 0, attendees: values.attendees || 0, confirmed: values.confirmed || 0, interestedLeads: values.interestedLeads || 0, attendanceRate: values.attendanceRate || '0%', checklist: values.checklist || [] },
  }).select('*').single()
  if (error) throw error
  return mapMarketingEvent(data)
}

export async function updateMarketingEvent(eventId, values) {
  const isDevelopmentLaunch = Boolean(values.development || values.subjectType === 'development')
  assertMarketingEventPublicationReadiness(values, isDevelopmentLaunch ? 'launches' : 'showDays')
  const patch = {
    title: values.title,
    status: status(values.status),
    subject_id: isDevelopmentLaunch ? values.subjectId || null : values.listingId || null,
    subject_type: isDevelopmentLaunch ? 'development' : values.listingId ? 'listing' : 'unlinked',
    subject_label: isDevelopmentLaunch ? values.development || values.subjectLabel || values.title : values.listingLabel || values.title,
    address: values.address || null,
    location: values.location || values.address || null,
    description: values.description || null,
    starts_at: startAt(values),
    ends_at: endAt(values),
    host_user_id: values.hostUserId || null,
    image_url: values.image || null,
  }
  const { data, error } = await supabase.from('marketing_events').update(patch).eq('id', eventId).select('*, rsvps:marketing_event_rsvps(id,status,checked_in_at,interest_level,conversion_outcome)').single()
  if (error) throw error
  return mapMarketingEvent(data)
}

export async function updateMarketingEventChecklist(eventId, checklist) {
  const { data: current, error: readError } = await supabase.from('marketing_events').select('metadata').eq('id', eventId).single()
  if (readError) throw readError
  const { data, error } = await supabase.from('marketing_events')
    .update({ metadata: { ...(current?.metadata || {}), checklist: Array.isArray(checklist) ? checklist : [] } })
    .eq('id', eventId)
    .select('*, rsvps:marketing_event_rsvps(id,status,checked_in_at,interest_level,conversion_outcome)')
    .single()
  if (error) throw error
  return mapMarketingEvent(data)
}
