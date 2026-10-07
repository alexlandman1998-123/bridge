// Fictional policy/contact fixtures. These flows never submit or dispatch anything.
export const DEMO_SUPPORT_CONTACT = { name: 'Alex Morgan', phone: '082 555 0106' }
export const DEMO_SUPPORT_POLICIES = [
  { id: 'home', insurer: 'Santam', cover: 'Building & household contents', reference: 'DEMO-HOME-1042', logo: '/brand/insurance/santam.svg' },
  { id: 'contents', insurer: 'King Price', cover: 'Household contents', reference: 'DEMO-CONTENTS-2081', logo: '/brand/insurance/king-price.png' },
]
export const DEMO_ASSIST_SERVICES = [
  { id: 'plumbing', label: 'Plumbing', description: 'A burst pipe or urgent leak.' },
  { id: 'electrical', label: 'Electrical', description: 'A power or electrical fault.' },
  { id: 'locksmith', label: 'Locksmith', description: 'Locked out of your home.' },
]
export function localDateToday() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function formatIncidentDate(date) {
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}
