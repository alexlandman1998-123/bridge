function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function initials(name = '') {
  return text(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TM'
}

function categoryFor(member = {}) {
  const source = `${member.role || ''} ${member.title || ''} ${member.description || ''}`.toLowerCase()
  if (/bond|finance|originator|bank/.test(source)) return 'finance'
  if (/secretary|document|support|operation|admin/.test(source)) return 'documents'
  if (/attorney|conveyanc|legal|transfer/.test(source)) return 'legal'
  return 'general'
}

function normalizeMember(member = {}, index = 0) {
  const name = text(member.name || member.displayName) || `Team contact ${index + 1}`
  const role = text(member.role || member.title) || 'Transaction team'
  const email = text(member.email)
  const phone = text(member.phone)
  const description = text(member.description || member.detail || member.extraDetail) || 'Supports your property purchase and keeps the transaction moving.'
  const note = text(member.note || member.extraDetail)
  return Object.freeze({
    ...member,
    id: text(member.id || member.key) || `${key(role) || 'team'}-${index + 1}`,
    name,
    role,
    title: role,
    organisation: text(member.organisation || member.organization || member.company || member.firmName),
    description,
    detail: description,
    note,
    extraDetail: note,
    currentActivity: text(member.currentActivity || member.activity),
    email,
    phone,
    avatar: text(member.avatar || member.avatarUrl || member.profileImage || member.profile_image),
    initials: text(member.initials) || initials(name),
    category: categoryFor({ ...member, role }),
    isMainContact: Boolean(member.isMainContact || member.is_main_contact || index === 0),
    isActive: Boolean(member.isActive || member.is_active),
    canEmail: Boolean(email),
    canCall: Boolean(phone),
  })
}

function membersFromAttorneyRolePlayer(entry = {}, index = 0) {
  const rolePlayer = entry.value || entry.rolePlayer || entry
  const firm = rolePlayer?.firm || {}
  const attorney = rolePlayer?.attorneyUser || rolePlayer?.primaryAttorney || {}
  const secretary = rolePlayer?.secretary || {}
  const firmName = text(firm.name) || 'Attorney Firm'
  const status = key(rolePlayer?.status || 'active')
  const attorneyMember = {
    id: `attorney-${entry.key || index + 1}`,
    name: text(attorney.name) || firmName,
    role: text(entry.label || entry.assignmentLabel) || 'Attorney / Conveyancer',
    organisation: firmName,
    description: rolePlayer?.isPrimary === false ? 'Supports the legal team handling this purchase.' : 'Manages the legal and transfer work for this purchase.',
    email: text(attorney.email || firm.email),
    phone: text(attorney.phone || firm.phone),
    avatar: text(attorney.avatarUrl || attorney.avatar_url || firm.logoUrl || firm.logo_url),
    isActive: status === 'active',
  }
  const secretaryMember = text(secretary.name) ? {
    id: `secretary-${entry.key || index + 1}`,
    name: text(secretary.name),
    role: 'Conveyancing Secretary',
    organisation: firmName,
    description: 'Coordinates legal documents, signing arrangements, and day-to-day transfer administration.',
    email: text(secretary.email || firm.email),
    phone: text(secretary.phone || firm.phone),
    avatar: text(secretary.avatarUrl || secretary.avatar_url),
    isActive: false,
  } : null
  return secretaryMember ? [attorneyMember, secretaryMember] : [attorneyMember]
}

const ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'general', title: 'General questions about my purchase', preferredCategory: 'general' }),
  Object.freeze({ key: 'finance', title: 'My bond application or bank offers', preferredCategory: 'finance' }),
  Object.freeze({ key: 'legal', title: 'Transfer, signing or registration', preferredCategory: 'legal' }),
  Object.freeze({ key: 'documents', title: 'Documents or signing arrangements', preferredCategory: 'documents' }),
])

export function buildBuyerTeamPresentationModel({
  source = 'unknown',
  members = [],
  attorneyRolePlayers = [],
  heading = 'Your transaction team',
  description = 'The people helping you through your purchase, finance, and transfer.',
  currentProcess = null,
} = {}) {
  const combinedMembers = [
    ...(Array.isArray(members) ? members : []),
    ...(Array.isArray(attorneyRolePlayers) ? attorneyRolePlayers.flatMap(membersFromAttorneyRolePlayer) : []),
  ].filter(Boolean)
  const normalizedMembers = combinedMembers.map(normalizeMember)
  const deduplicatedMembers = normalizedMembers.filter((member, index, list) => {
    const identity = `${member.name.toLowerCase()}|${member.role.toLowerCase()}|${member.email.toLowerCase()}`
    return list.findIndex((candidate) => `${candidate.name.toLowerCase()}|${candidate.role.toLowerCase()}|${candidate.email.toLowerCase()}` === identity) === index
  })
  const mainContact = deduplicatedMembers.find((member) => member.isMainContact) || deduplicatedMembers[0] || null
  const activeMember = deduplicatedMembers.find((member) => member.isActive) || mainContact
  const routes = ROUTE_DEFINITIONS.map((route) => {
    const member = deduplicatedMembers.find((candidate) => candidate.category === route.preferredCategory && (candidate.canEmail || candidate.canCall))
      || (route.key === 'general' ? mainContact : null)
    if (!member) return null
    return Object.freeze({
      ...route,
      member,
      helper: `Speak to ${member.name.split(/\s+/)[0]} · ${member.role}`,
    })
  }).filter(Boolean)

  return Object.freeze({
    source,
    heading: text(heading) || 'Your transaction team',
    description: text(description) || 'The people helping you through your property purchase.',
    members: Object.freeze(deduplicatedMembers),
    mainContact,
    activeMember,
    specialists: Object.freeze(deduplicatedMembers.filter((member) => member.id !== mainContact?.id)),
    routes: Object.freeze(routes),
    contactableCount: deduplicatedMembers.filter((member) => member.canEmail || member.canCall).length,
    currentProcess: currentProcess ? Object.freeze({
      title: text(currentProcess.title || currentProcess.label) || 'Transaction progress',
      helper: text(currentProcess.helper || currentProcess.description),
      status: text(currentProcess.status) || 'In progress',
    }) : null,
    isEmpty: deduplicatedMembers.length === 0,
  })
}

export { ROUTE_DEFINITIONS }
