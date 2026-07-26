import { fetchPartnerOperationalPeople } from '../services/bondPartnerProfileService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizePersonId(person = {}) {
  return normalizeText(person.userId || person.user_id || person.id)
}

function normalizePersonName(person = {}) {
  return normalizeText(
    person.label ||
      person.fullName ||
      person.full_name ||
      person.name ||
      [person.firstName || person.first_name, person.lastName || person.last_name].filter(Boolean).join(' ') ||
      person.email,
  )
}

function personMatchesRole(person = {}, roleType = '') {
  const role = normalizeLower(
    person.role ||
      person.organisationRole ||
      person.organisation_role ||
      person.workspaceRole ||
      person.workspace_role ||
      person.title ||
      person.jobTitle ||
      person.job_title,
  )
  if (!role) return true
  if (roleType === 'bond_originator') {
    return [
      'bond_originator',
      'originator',
      'consultant',
      'bond_consultant',
      'bond_independent_consultant',
      'processor',
      'bond_processor',
      'manager',
      'branch_manager',
      'team_lead',
    ].some((allowed) => role === allowed || role.includes(allowed))
  }
  if (['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(roleType)) {
    return [
      'attorney',
      'conveyancer',
      'transfer_attorney',
      'bond_attorney',
      'cancellation_attorney',
      'director_partner',
      'firm_admin',
      'attorney_admin',
      'attorney_manager',
    ].some((allowed) => role === allowed || role.includes(allowed))
  }
  return true
}

export function normalizePartnerPersonOption(person = {}, roleType = '') {
  const id = normalizePersonId(person)
  const name = normalizePersonName(person)
  if (!id || !name) return null
  const email = normalizeText(person.email).toLowerCase()
  const roleLabel = normalizeText(
    person.title ||
      person.jobTitle ||
      person.job_title ||
      person.organisationRole ||
      person.organisation_role ||
      person.role,
  )
  const branchName = normalizeText(person.branchName || person.branch_name)
  return {
    id,
    userId: id,
    name,
    label: name,
    email,
    phone: normalizeText(person.phone || person.phoneNumber || person.phone_number),
    role: roleLabel,
    branchId: normalizeText(person.branchId || person.branch_id),
    branchName,
    regionId: normalizeText(person.regionId || person.region_id),
    teamId: normalizeText(person.teamId || person.team_id),
    detail: [roleLabel, branchName, email].filter(Boolean).join(' · '),
    roleType,
  }
}

export async function loadPartnerPersonOptions(partner = {}, roleType = '') {
  const partnerOrganisationId = normalizeText(
    partner.partnerOrganisationId ||
      partner.partner_organisation_id ||
      partner.partnerOrganizationId ||
      partner.organisationId ||
      partner.organizationId,
  )
  if (!partnerOrganisationId) {
    return { people: [], message: '', source: 'empty' }
  }

  const relationshipId = normalizeText(partner.relationshipId || partner.relationship_id || partner.connectionId || '')
  const payload = await fetchPartnerOperationalPeople(partnerOrganisationId, relationshipId)
  const people = (Array.isArray(payload?.people) ? payload.people : [])
    .filter((person) => personMatchesRole(person, roleType))
    .map((person) => normalizePartnerPersonOption(person, roleType))
    .filter(Boolean)
    .filter((person, index, list) => list.findIndex((item) => item.userId === person.userId) === index)
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    ...payload,
    people,
  }
}

export function findPartnerPersonOption(people = [], personId = '') {
  const id = normalizeText(personId)
  if (!id) return null
  return (Array.isArray(people) ? people : []).find((person) => normalizeText(person.userId || person.id) === id) || null
}

export function mergePartnerPersonIntoOption(partner = null, person = null, { roleType = '' } = {}) {
  if (!partner) return partner
  if (!person) return partner
  const userId = normalizeText(person.userId || person.id)
  if (!userId) return partner
  const name = normalizeText(person.name || person.label || person.fullName || person.email)
  return {
    ...partner,
    userId,
    preferredAttorneyUserId: ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(roleType) ? userId : partner.preferredAttorneyUserId || null,
    contactPerson: name || partner.contactPerson || '',
    email: normalizeText(person.email).toLowerCase() || partner.email || '',
    phone: normalizeText(person.phone) || partner.phone || '',
    selectedPerson: {
      id: userId,
      userId,
      name,
      email: normalizeText(person.email).toLowerCase(),
      phone: normalizeText(person.phone),
      role: normalizeText(person.role),
    },
  }
}
