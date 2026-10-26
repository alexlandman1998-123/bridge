const text = value => String(value || '').trim()
const email = value => text(value).toLowerCase()
export const isOrganiser = person => ['agent', 'co-agent', 'co_agent'].includes(text(person.participantRole || person.role).toLowerCase())
export const samePerson = (left, right) => Boolean(
  (left.userId && right.userId && left.userId === right.userId) ||
  (left.contactId && right.contactId && left.contactId === right.contactId) ||
  (email(left.email) && email(left.email) === email(right.email)),
)

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
    const linkedLead = form.relatedEntityType === 'lead' && form.relatedEntityId === client.leadId
    return { ...form, participants: participants.filter(person => isOrganiser(person) || !samePerson(person, client)),
      ...(linked ? { contactId: '' } : {}), ...(linkedLead ? { relatedEntityType: 'none', relatedEntityId: '' } : {}),
    }
  }
  const canLink = !form.relatedEntityId && !form.contactId
  return { ...form,
    ...(canLink ? { contactId: client.contactId || '', listingId: form.listingId || client.listingId || '', relatedEntityType: 'lead', relatedEntityId: client.leadId } : {}),
    participants: [...participants, { name: client.name, email: client.email, phone: client.phone,
      contactId: client.contactId || null, participantRole: client.role || 'Client', isRequired: true, rsvpStatus: 'Pending' }],
  }
}
