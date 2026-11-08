// Booking destinations supplied by the site owner on 21 October 2026.
export const homeSeekersInformationSessionUrl = 'https://my.demio.com/ref/ZvxISM3Y0S1q0ClZ'
export const homeSeekersFounderCalendarUrl = 'https://calendly.com/thomas-homeseekers/30min'

// Verified from the public Demio registration page on 24 October 2026.
// Only one future session is published. Do not invent four recurring dates.
// An expired snapshot falls back to the provider link rather than a past date.
const publishedSessions = [{ id: '2026-10-30T10:00:00.000Z', start: '2026-10-30T10:00:00.000Z' }]
export function upcomingHomeSeekersSessions(now = new Date()) {
  return publishedSessions.filter(session => new Date(session.start) > now)
}

export function redirectToHomeSeekersWebinar() {
  window.location.assign(homeSeekersInformationSessionUrl)
}
