const text = value => String(value || '').trim()
const email = value => text(value).toLowerCase()
export const isOrganiser = person => ['agent', 'co-agent', 'co_agent'].includes(text(person.participantRole || person.role).toLowerCase())
export const samePerson = (left, right) => Boolean(
  (left.clientKey && right.clientKey && left.clientKey === right.clientKey) ||
  (left.leadId && right.leadId && left.leadId === right.leadId) ||
  (left.userId && right.userId && left.userId === right.userId) ||
  (left.contactId && right.contactId && left.contactId === right.contactId) ||
  (email(left.email) && email(left.email) === email(right.email)),
)

const hasName = value => Boolean(text(value) && !/^(client|contact|lead|buyer|seller|unnamed(?: client| contact| lead)?)$/i.test(text(value)))

// The calendar and Clients page must refer to the same people. Prefer the
// directory's saved identity, while retaining the CRM links used by bookings.
export function mergeAppointmentClients(crmClients = [], directoryClients = []) {
  const rows = []
  const keys = person => [
    ...[person.leadId, ...(person.leadIds || [])].filter(Boolean).map(id => `lead:${id}`),
    ...[person.contactId, ...(person.contactIds || [])].filter(Boolean).map(id => `contact:${id}`),
    ...[person.email, ...(person.emails || [])].filter(Boolean).map(value => `email:${email(value)}`),
    person.clientKey && `client:${person.clientKey}`,
  ].filter(Boolean)
  const directory = directoryClients.map(client => ({
    id: `directory:${client.id}`, clientKey: client.id,
    name: client.name, email: client.email, phone: client.phone,
    emails: client.emails, role: text(client.typeLabel).replace(/ Lead$/i, '') || 'Client',
    leadId: client.linkedLeadIds?.[0] || '',
    contactId: (client.sources || []).find(source => source.identitySource?.kind === 'contact')?.identitySource.id || '',
    leadIds: client.linkedLeadIds || [],
    contactIds: (client.sources || []).filter(source => source.identitySource?.kind === 'contact').map(source => source.identitySource.id),
  }))
  for (const person of [...crmClients, ...directory]) {
    const identityKeys = keys(person)
    const matching = rows.filter(row => keys(row).some(key => identityKeys.includes(key)))
    const previous = matching[0]
    const merged = { ...previous, ...person,
      id: previous?.id || person.id,
      clientKey: person.clientKey || previous?.clientKey || person.id,
      name: hasName(person.name) ? person.name : previous?.name || person.name,
      role: person.role && person.role !== 'Client' ? person.role : previous?.role || 'Client',
      email: text(person.email) || previous?.email || '',
      phone: text(person.phone) || previous?.phone || '',
      leadId: previous?.leadId || person.leadId || '',
      contactId: previous?.contactId || person.contactId || '',
      listingId: previous?.listingId || person.listingId || '',
      leadIds: [...new Set([...matching.flatMap(row => row.leadIds || [row.leadId]), ...(person.leadIds || [person.leadId])].filter(Boolean))],
      contactIds: [...new Set([...matching.flatMap(row => row.contactIds || [row.contactId]), ...(person.contactIds || [person.contactId])].filter(Boolean))],
      emails: [...new Set([...matching.flatMap(row => row.emails || [row.email]), ...(person.emails || [person.email])].filter(Boolean).map(email))],
    }
    for (const row of matching) rows.splice(rows.indexOf(row), 1)
    rows.push(merged)
  }
  return rows.map(person => ({ ...person,
    name: hasName(person.name) ? person.name : person.email || person.phone || `Unnamed client · ${person.id.split(':').pop().slice(0, 8)}`,
  })).sort((left, right) => left.name.localeCompare(right.name))
}

// Keep RSVP identity and all unrelated guests when changing the organiser team.
export function updateAppointmentOrganisers(form, organisers) {
  if (!organisers.length) return form
  const existing = form.participants || []
  return { ...form, assignedAgentId: organisers[0].id, participants: [
    ...existing.filter(person => !isOrganiser(person)),
    ...organisers.map((agent, index) => ({
      ...existing.find(person => isOrganiser(person) && samePerson(person, agent)),
      userId: agent.userId || agent.id, name: agent.name, email: agent.email,
      participantRole: index === 0 ? 'Agent' : 'Co-Agent', isRequired: true,
    })),
  ] }
}

export function toggleAppointmentClient(form, client) {
  const participants = form.participants || []
  const selected = participants.some(person => !isOrganiser(person) && samePerson(person, client)) || Boolean(client.contactId && form.contactId === client.contactId)
  if (selected) {
    const linked = client.contactId && form.contactId === client.contactId
    const linkedLead = (form.relatedEntityType === 'lead' && form.relatedEntityId === client.leadId)
      || (form.relatedEntityType === 'client' && client.contactId && form.relatedEntityId === client.contactId)
    return { ...form, participants: participants.filter(person => isOrganiser(person) || !samePerson(person, client)),
      ...(linked ? { contactId: '' } : {}), ...(linkedLead ? { relatedEntityType: 'none', relatedEntityId: '' } : {}),
    }
  }
  const canLink = !form.relatedEntityId && !form.contactId
  return { ...form,
    ...(canLink ? { contactId: client.contactId || '', listingId: form.listingId || client.listingId || '', relatedEntityType: client.leadId ? 'lead' : client.contactId ? 'client' : 'none', relatedEntityId: client.leadId || client.contactId || '' } : {}),
    participants: [...participants, { clientKey: client.clientKey || client.id, leadId: client.leadId, name: client.name, email: client.email, phone: client.phone,
      contactId: client.contactId || null, participantRole: client.role || 'Client', isRequired: true, rsvpStatus: 'Pending' }],
  }
}
