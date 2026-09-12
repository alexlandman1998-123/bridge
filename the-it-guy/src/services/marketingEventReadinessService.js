const text = (value) => String(value || '').trim()

export function isPublicMarketingEventStatus(value) {
  return ['planning', 'upcoming'].includes(text(value).toLowerCase().replaceAll(' ', '_'))
}

export function getMarketingEventReadiness(event = {}, kind = '') {
  const type = kind || event.type || (event.event_type === 'launch' ? 'launches' : 'showDays')
  const isLaunch = type === 'launches' || event.event_type === 'launch'
  const checks = [
    { key: 'title', label: 'Event title', complete: Boolean(text(event.title)) },
    { key: 'subject', label: isLaunch ? 'Linked development' : 'Linked listing', complete: Boolean(text(isLaunch ? event.development || event.subjectLabel : event.listingId || event.subjectId || event.subjectLabel)) },
    { key: 'location', label: 'Venue or address', complete: Boolean(text(event.location || event.address)) },
    { key: 'schedule', label: 'Start date and time', complete: Boolean(text(event.startsAt || event.startDate || event.date) && text(event.startTime || event.time || event.startsAt)) },
  ]
  const incomplete = checks.filter((check) => !check.complete)
  return {
    checks,
    incomplete,
    ready: incomplete.length === 0,
    public: isPublicMarketingEventStatus(event.status),
    message: incomplete.length ? `Complete ${incomplete.map((check) => check.label.toLowerCase()).join(', ')} before publishing RSVP.` : 'Ready to publish RSVP.',
  }
}

export function assertMarketingEventPublicationReadiness(event, kind) {
  const readiness = getMarketingEventReadiness(event, kind)
  if (readiness.public && !readiness.ready) throw new Error(readiness.message)
  return readiness
}
