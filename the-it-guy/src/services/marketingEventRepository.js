import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const EVENT_TYPES = { showDays: 'show_day', launches: 'launch' }

function text(value) { return String(value || '').trim() }
function numeric(value) { return String(Number(value || 0)) }
function status(value) { return text(value).toLowerCase().replaceAll(' ', '_') || 'draft' }

export function canPersistMarketingEvents(organisationId = '') {
  return Boolean(isSupabaseConfigured && supabase && text(organisationId))
}

export function mapMarketingEvent(row = {}) {
  const type = row.event_type === 'launch' ? 'launches' : 'showDays'
  const start = row.starts_at ? new Date(row.starts_at) : null
  const end = row.ends_at ? new Date(row.ends_at) : null
  const date = start && !Number.isNaN(start.valueOf()) ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: row.timezone || 'Africa/Johannesburg' }).format(start) : 'Date to be confirmed'
  const formatTime = (value) => new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: row.timezone || 'Africa/Johannesburg' }).format(value)
  const time = start && !Number.isNaN(start.valueOf()) ? `${formatTime(start)}${end && !Number.isNaN(end.valueOf()) ? ` – ${formatTime(end)}` : ''}` : 'Time to be confirmed'
  const hostName = text(row.metadata?.hostName)
  return {
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
    hostUserId: row.host_user_id,
    hostAgent: hostName,
    hostInitials: hostName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    listingId: row.subject_type === 'listing' ? row.subject_id : null,
    listing: row.metadata?.listingSnapshot || null,
    coHostUserId: row.metadata?.coHostUserId || null,
    coHostName: text(row.metadata?.coHostName),
    hostName,
    visibility: text(row.metadata?.visibility) || 'private',
    registrationEnabled: row.metadata?.registrationEnabled !== false,
    registrationMessage: text(row.metadata?.registrationMessage),
    attendeeCheckInEnabled: row.metadata?.attendeeCheckInEnabled !== false,
    createLeadsForRegistrations: row.metadata?.createLeadsForRegistrations !== false,
    invited: numeric(row.metadata?.invited), registrations: numeric(row.metadata?.registrations), attending: numeric(row.metadata?.attending), leads: numeric(row.metadata?.leads),
    attendees: numeric(row.metadata?.attendees), confirmed: numeric(row.metadata?.confirmed), interestedLeads: numeric(row.metadata?.interestedLeads), attendanceRate: text(row.metadata?.attendanceRate) || '0%',
  }
}

export async function listMarketingEvents(organisationId, kind) {
  const { data, error } = await supabase.from('marketing_events').select('*').eq('organisation_id', organisationId).eq('event_type', EVENT_TYPES[kind]).order('starts_at', { ascending: true })
  if (error) throw error
  return (data || []).map(mapMarketingEvent)
}

export async function createMarketingEvent(organisationId, kind, values) {
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) throw new Error('Sign in before creating an event.')
  const startsAt = text(values.startDate) ? new Date(`${values.startDate}T${text(values.startTime) || '10:00'}:00`).toISOString() : null
  const endsAt = text(values.startDate) && text(values.endTime) ? new Date(`${values.startDate}T${text(values.endTime)}:00`).toISOString() : null
  const metadata = {
    invited: values.invited || 0, registrations: values.registrations || 0, attending: values.attending || 0, leads: values.leads || 0,
    attendees: values.attendees || 0, confirmed: values.confirmed || 0, interestedLeads: values.interestedLeads || 0, attendanceRate: values.attendanceRate || '0%',
    listingSnapshot: values.listingSnapshot || null,
    coHostUserId: values.coHostUserId || null,
    coHostName: values.coHostName || '',
    hostName: values.hostName || '',
    visibility: values.visibility || 'private',
    registrationEnabled: values.registrationEnabled !== false,
    registrationMessage: values.registrationMessage || '',
    attendeeCheckInEnabled: values.attendeeCheckInEnabled !== false,
    createLeadsForRegistrations: values.createLeadsForRegistrations !== false,
  }
  const { data, error } = await supabase.from('marketing_events').insert({
    organisation_id: organisationId, event_type: EVENT_TYPES[kind], title: values.title, status: status(values.status),
    subject_type: kind === 'launches' ? 'development' : 'listing', subject_id: values.subjectId || null, subject_label: values.subjectLabel || values.development || values.title,
    location: values.location || values.address, address: values.address || values.location, image_url: values.image || null,
    description: values.description || null, starts_at: startsAt, ends_at: endsAt, host_user_id: values.hostUserId || null, created_by: userId,
    metadata,
  }).select('*').single()
  if (error) throw error
  return mapMarketingEvent(data)
}

export async function updateMarketingEvent(eventId, values = {}) {
  const startsAt = text(values.startDate) ? new Date(`${values.startDate}T${text(values.startTime) || '10:00'}:00`).toISOString() : undefined
  const endsAt = text(values.startDate) && text(values.endTime) ? new Date(`${values.startDate}T${text(values.endTime)}:00`).toISOString() : undefined
  const patch = {
    ...(values.title !== undefined ? { title: values.title } : {}),
    ...(values.status !== undefined ? { status: status(values.status) } : {}),
    ...(values.subjectId !== undefined ? { subject_id: values.subjectId || null } : {}),
    ...(values.subjectLabel !== undefined ? { subject_label: values.subjectLabel || null } : {}),
    ...(values.address !== undefined ? { address: values.address || null, location: values.address || null } : {}),
    ...(values.image !== undefined ? { image_url: values.image || null } : {}),
    ...(values.description !== undefined ? { description: values.description || null } : {}),
    ...(startsAt !== undefined ? { starts_at: startsAt } : {}),
    ...(endsAt !== undefined ? { ends_at: endsAt } : {}),
    ...(values.hostUserId !== undefined ? { host_user_id: values.hostUserId || null } : {}),
    ...(values.metadata !== undefined ? { metadata: values.metadata } : {}),
  }
  const { data, error } = await supabase.from('marketing_events').update(patch).eq('id', eventId).select('*').single()
  if (error) throw error
  return mapMarketingEvent(data)
}
