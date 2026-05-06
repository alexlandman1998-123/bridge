import { generateId } from './agentListingStorage'

const KEY_AGENT_DIRECTORY = 'itg:agent-directory:v1'
const KEY_AGENT_INVITES = 'itg:agent-invites:v1'
const INVITE_EXPIRY_DAYS = 7

export const AGENT_INVITE_STATUS = {
  PENDING_INVITE: 'pending_invite',
  INVITE_SENT: 'invite_sent',
  ONBOARDING_STARTED: 'onboarding_started',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
}

export const AGENT_ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'senior_agent', label: 'Senior Agent' },
  { value: 'branch_admin', label: 'Branch Admin / Manager' },
]

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizePhone(value) {
  return String(value || '').trim()
}

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (AGENT_ROLE_OPTIONS.some((option) => option.value === normalized)) {
    return normalized
  }
  return 'agent'
}

function createInviteToken() {
  const random = Math.random().toString(36).slice(2, 12)
  return `agt-${random}${Date.now().toString(36)}`
}

function expiryIso(days = INVITE_EXPIRY_DAYS) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function ensureDirectoryShape(directory = {}) {
  return {
    agency: directory?.agency || null,
    principals: Array.isArray(directory?.principals) ? directory.principals : [],
    agents: Array.isArray(directory?.agents) ? directory.agents : [],
    users: Array.isArray(directory?.users) ? directory.users : [],
  }
}

function getAgentKey(email, organisationId) {
  return `${normalizeEmail(email)}::${String(organisationId || 'default').trim().toLowerCase()}`
}

function upsertDirectoryAgent(directory, agentRecord) {
  const next = ensureDirectoryShape(directory)
  const key = getAgentKey(agentRecord.email, agentRecord.agencyId)
  const existingIndex = next.agents.findIndex((row) => getAgentKey(row?.email, row?.agencyId) === key)
  if (existingIndex === -1) {
    next.agents.unshift(agentRecord)
    return next
  }
  next.agents[existingIndex] = {
    ...next.agents[existingIndex],
    ...agentRecord,
  }
  return next
}

function updateAgentStatusByInvite(directory, invite, status, extra = {}) {
  const next = ensureDirectoryShape(directory)
  const key = getAgentKey(invite?.email, invite?.organisationId)
  next.agents = next.agents.map((row) => {
    if (getAgentKey(row?.email, row?.agencyId) !== key) return row
    return {
      ...row,
      status,
      ...extra,
    }
  })
  return next
}

function markExpiredInvites(invites = [], directory) {
  const now = Date.now()
  let changed = false
  const nextInvites = invites.map((invite) => {
    const status = String(invite?.status || '').trim().toLowerCase()
    if ([AGENT_INVITE_STATUS.ACTIVE, AGENT_INVITE_STATUS.REVOKED, AGENT_INVITE_STATUS.EXPIRED].includes(status)) {
      return invite
    }
    const expiresAt = new Date(invite?.expiresAt || 0).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt > now) {
      return invite
    }
    changed = true
    return {
      ...invite,
      status: AGENT_INVITE_STATUS.EXPIRED,
      expiredAt: new Date().toISOString(),
    }
  })

  if (!changed) {
    return { invites, directory, changed: false }
  }

  let nextDirectory = ensureDirectoryShape(directory)
  for (const invite of nextInvites) {
    if (String(invite?.status || '').trim().toLowerCase() === AGENT_INVITE_STATUS.EXPIRED) {
      nextDirectory = updateAgentStatusByInvite(nextDirectory, invite, AGENT_INVITE_STATUS.EXPIRED)
    }
  }
  return { invites: nextInvites, directory: nextDirectory, changed: true }
}

function persistDirectory(directory) {
  writeJson(KEY_AGENT_DIRECTORY, ensureDirectoryShape(directory))
}

function persistInvites(invites) {
  writeJson(KEY_AGENT_INVITES, Array.isArray(invites) ? invites : [])
}

export function readAgentDirectory() {
  const directory = ensureDirectoryShape(readJson(KEY_AGENT_DIRECTORY, {}))
  return directory
}

export function writeAgentDirectory(directory) {
  persistDirectory(directory)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
}

export function readAgentInvites() {
  const directory = readAgentDirectory()
  const invites = readJson(KEY_AGENT_INVITES, [])
  const normalizedInvites = Array.isArray(invites) ? invites : []
  const result = markExpiredInvites(normalizedInvites, directory)
  if (result.changed) {
    persistInvites(result.invites)
    persistDirectory(result.directory)
  }
  return result.invites
}

export function buildAgentInviteLink(token, baseUrl = '') {
  if (!token) return ''
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.bridgenine.co.za')
  return `${origin}/agent/invite/${token}`
}

export function createAgentInvite({
  firstName,
  surname,
  email,
  mobile,
  organisationId,
  organisationName,
  office = '',
  role = 'agent',
  notes = '',
  invitedByUserId = '',
  invitedByEmail = '',
  invitedByName = '',
  principalId = '',
} = {}) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    throw new Error('Agent email is required.')
  }

  const nowIso = new Date().toISOString()
  const directory = readAgentDirectory()
  const existingInvites = readAgentInvites()
  const normalizedOrgId = String(organisationId || directory?.agency?.id || 'agency-default').trim().toLowerCase()
  const resolvedOrgName = String(organisationName || directory?.agency?.name || 'Bridge Organisation').trim()

  const duplicateInvite = existingInvites.find((invite) => {
    const inviteEmail = normalizeEmail(invite?.email)
    const inviteOrgId = String(invite?.organisationId || '').trim().toLowerCase()
    const inviteStatus = String(invite?.status || '').trim().toLowerCase()
    return (
      inviteEmail === normalizedEmail &&
      inviteOrgId === normalizedOrgId &&
      [AGENT_INVITE_STATUS.PENDING_INVITE, AGENT_INVITE_STATUS.INVITE_SENT, AGENT_INVITE_STATUS.ONBOARDING_STARTED].includes(inviteStatus)
    )
  })

  if (duplicateInvite) {
    throw new Error('This agent has already been invited to this organisation.')
  }

  const existingAgent = directory.agents.find((agent) => {
    return getAgentKey(agent?.email, agent?.agencyId) === getAgentKey(normalizedEmail, normalizedOrgId)
  })

  if (String(existingAgent?.status || '').trim().toLowerCase() === AGENT_INVITE_STATUS.ACTIVE) {
    throw new Error('This agent is already active in this organisation.')
  }

  const existingBridgeUser = Boolean(
    directory.users.some((user) => normalizeEmail(user?.email) === normalizedEmail) ||
      directory.agents.some((agent) => normalizeEmail(agent?.email) === normalizedEmail),
  )

  const inviteId = generateId('agent_invite')
  const token = createInviteToken()
  const invite = {
    id: inviteId,
    token,
    firstName: String(firstName || '').trim(),
    surname: String(surname || '').trim(),
    email: normalizedEmail,
    mobile: normalizePhone(mobile),
    organisationId: normalizedOrgId,
    organisationName: resolvedOrgName,
    office: String(office || '').trim(),
    role: normalizeRole(role),
    notes: String(notes || '').trim(),
    status: AGENT_INVITE_STATUS.PENDING_INVITE,
    invitedByUserId: String(invitedByUserId || '').trim(),
    invitedByEmail: normalizeEmail(invitedByEmail),
    invitedByName: String(invitedByName || '').trim(),
    principalId: String(principalId || '').trim(),
    existingBridgeUser,
    invitedAt: nowIso,
    lastSentAt: null,
    onboardingStartedAt: null,
    activatedAt: null,
    revokedAt: null,
    expiresAt: expiryIso(),
  }

  const agentRecord = {
    id: existingAgent?.id || normalizedEmail,
    name: `${invite.firstName} ${invite.surname}`.trim() || normalizedEmail,
    firstName: invite.firstName,
    surname: invite.surname,
    email: normalizedEmail,
    phone: invite.mobile,
    mobile: invite.mobile,
    office: invite.office || 'Office',
    status: AGENT_INVITE_STATUS.PENDING_INVITE,
    role: invite.role,
    agencyId: normalizedOrgId,
    agencyName: resolvedOrgName,
    principalId: invite.principalId,
    invitedAt: nowIso,
    activatedAt: null,
    lastActiveAt: null,
    inviteId,
  }

  const nextDirectory = upsertDirectoryAgent(directory, agentRecord)
  const nextInvites = [invite, ...existingInvites]

  persistDirectory(nextDirectory)
  persistInvites(nextInvites)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }

  return {
    invite,
    onboardingUrl: buildAgentInviteLink(token),
    existingBridgeUser,
  }
}

export function markAgentInviteSent(inviteId) {
  const directory = readAgentDirectory()
  const invites = readAgentInvites()
  const nowIso = new Date().toISOString()
  let target = null

  const nextInvites = invites.map((invite) => {
    if (String(invite?.id || '') !== String(inviteId || '')) return invite
    target = {
      ...invite,
      status: AGENT_INVITE_STATUS.INVITE_SENT,
      lastSentAt: nowIso,
    }
    return target
  })

  if (!target) {
    throw new Error('Invite not found.')
  }

  const nextDirectory = updateAgentStatusByInvite(directory, target, AGENT_INVITE_STATUS.INVITE_SENT, {
    invitedAt: target.invitedAt || nowIso,
  })

  persistInvites(nextInvites)
  persistDirectory(nextDirectory)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
  return target
}

export function revokeAgentInvite(inviteId) {
  const directory = readAgentDirectory()
  const invites = readAgentInvites()
  const nowIso = new Date().toISOString()
  let target = null

  const nextInvites = invites.map((invite) => {
    if (String(invite?.id || '') !== String(inviteId || '')) return invite
    target = {
      ...invite,
      status: AGENT_INVITE_STATUS.REVOKED,
      revokedAt: nowIso,
    }
    return target
  })

  if (!target) {
    throw new Error('Invite not found.')
  }

  const nextDirectory = updateAgentStatusByInvite(directory, target, AGENT_INVITE_STATUS.REVOKED)
  persistInvites(nextInvites)
  persistDirectory(nextDirectory)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
  return target
}

export function updateAgentRole({ agentEmail, organisationId, role }) {
  const normalizedEmail = normalizeEmail(agentEmail)
  const normalizedOrgId = String(organisationId || '').trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Agent email is required.')

  const directory = readAgentDirectory()
  const nextDirectory = ensureDirectoryShape(directory)
  const targetKey = getAgentKey(normalizedEmail, normalizedOrgId)

  let found = false
  nextDirectory.agents = nextDirectory.agents.map((agent) => {
    if (getAgentKey(agent?.email, agent?.agencyId) !== targetKey) return agent
    found = true
    return {
      ...agent,
      role: normalizeRole(role),
    }
  })

  if (!found) throw new Error('Agent not found.')
  persistDirectory(nextDirectory)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
}

export function setAgentStatus({ agentEmail, organisationId, status }) {
  const normalizedEmail = normalizeEmail(agentEmail)
  const normalizedOrgId = String(organisationId || '').trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Agent email is required.')

  const allowedStatus = String(status || '').trim().toLowerCase()
  if (!Object.values(AGENT_INVITE_STATUS).includes(allowedStatus)) {
    throw new Error('Invalid agent status.')
  }

  const directory = readAgentDirectory()
  const nextDirectory = ensureDirectoryShape(directory)
  const targetKey = getAgentKey(normalizedEmail, normalizedOrgId)
  const nowIso = new Date().toISOString()

  let found = false
  nextDirectory.agents = nextDirectory.agents.map((agent) => {
    if (getAgentKey(agent?.email, agent?.agencyId) !== targetKey) return agent
    found = true
    return {
      ...agent,
      status: allowedStatus,
      activatedAt: allowedStatus === AGENT_INVITE_STATUS.ACTIVE ? agent?.activatedAt || nowIso : agent?.activatedAt || null,
    }
  })

  if (!found) throw new Error('Agent not found.')
  persistDirectory(nextDirectory)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
}

export function removeAgentFromOrganisation({ agentEmail, organisationId }) {
  const normalizedEmail = normalizeEmail(agentEmail)
  const normalizedOrgId = String(organisationId || '').trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Agent email is required.')

  const directory = readAgentDirectory()
  const invites = readAgentInvites()
  const targetKey = getAgentKey(normalizedEmail, normalizedOrgId)

  const nextDirectory = ensureDirectoryShape(directory)
  nextDirectory.agents = nextDirectory.agents.filter((agent) => getAgentKey(agent?.email, agent?.agencyId) !== targetKey)

  const nowIso = new Date().toISOString()
  const nextInvites = invites.map((invite) => {
    if (getAgentKey(invite?.email, invite?.organisationId) !== targetKey) return invite
    if (String(invite?.status || '').trim().toLowerCase() === AGENT_INVITE_STATUS.ACTIVE) return invite
    return {
      ...invite,
      status: AGENT_INVITE_STATUS.REVOKED,
      revokedAt: invite?.revokedAt || nowIso,
    }
  })

  persistDirectory(nextDirectory)
  persistInvites(nextInvites)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
}

function getInviteByToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized) return null
  return readAgentInvites().find((invite) => String(invite?.token || '').trim() === normalized) || null
}

export function getAgentInviteContext(token) {
  const invite = getInviteByToken(token)
  if (!invite) {
    return { ok: false, reason: 'not_found', invite: null }
  }
  const status = String(invite?.status || '').trim().toLowerCase()
  if (status === AGENT_INVITE_STATUS.REVOKED) {
    return { ok: false, reason: 'revoked', invite }
  }
  if (status === AGENT_INVITE_STATUS.EXPIRED) {
    return { ok: false, reason: 'expired', invite }
  }
  if (status === AGENT_INVITE_STATUS.ACTIVE) {
    return { ok: false, reason: 'already_accepted', invite }
  }
  return { ok: true, reason: '', invite }
}

export function startAgentInviteOnboarding(token) {
  const context = getAgentInviteContext(token)
  if (!context.ok) return context

  const directory = readAgentDirectory()
  const invites = readAgentInvites()
  const nowIso = new Date().toISOString()
  let target = context.invite
  const status = String(target?.status || '').trim().toLowerCase()

  if (status === AGENT_INVITE_STATUS.PENDING_INVITE || status === AGENT_INVITE_STATUS.INVITE_SENT) {
    const nextInvites = invites.map((invite) => {
      if (String(invite?.id || '') !== String(target?.id || '')) return invite
      target = {
        ...invite,
        status: AGENT_INVITE_STATUS.ONBOARDING_STARTED,
        onboardingStartedAt: invite?.onboardingStartedAt || nowIso,
      }
      return target
    })
    const nextDirectory = updateAgentStatusByInvite(directory, target, AGENT_INVITE_STATUS.ONBOARDING_STARTED, {
      onboardingStartedAt: target.onboardingStartedAt,
    })
    persistInvites(nextInvites)
    persistDirectory(nextDirectory)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('itg:agent-directory-updated'))
    }
  }

  return { ok: true, reason: '', invite: target }
}

export function acceptAgentInvite({
  token,
  firstName,
  surname,
  email,
  mobile,
  ppraNumber = '',
  photoUrl = '',
  acceptedTerms = false,
} = {}) {
  if (!acceptedTerms) {
    throw new Error('You must accept the invitation terms to continue.')
  }

  const context = getAgentInviteContext(token)
  if (!context.ok) {
    if (context.reason === 'expired') throw new Error('This invite link has expired.')
    if (context.reason === 'revoked') throw new Error('This invite link has been revoked.')
    if (context.reason === 'already_accepted') throw new Error('This invite has already been used.')
    throw new Error('Invalid invite link.')
  }

  const invite = context.invite
  const directory = readAgentDirectory()
  const invites = readAgentInvites()
  const nowIso = new Date().toISOString()

  const resolvedFirstName = String(firstName || invite?.firstName || '').trim()
  const resolvedSurname = String(surname || invite?.surname || '').trim()
  const resolvedEmail = normalizeEmail(email || invite?.email)
  const resolvedMobile = normalizePhone(mobile || invite?.mobile)

  const nextInvites = invites.map((item) => {
    if (String(item?.id || '') !== String(invite?.id || '')) return item
    return {
      ...item,
      firstName: resolvedFirstName,
      surname: resolvedSurname,
      email: resolvedEmail,
      mobile: resolvedMobile,
      status: AGENT_INVITE_STATUS.ACTIVE,
      activatedAt: nowIso,
      acceptedAt: nowIso,
      consumedAt: nowIso,
      ppraNumber: String(ppraNumber || '').trim(),
      photoUrl: String(photoUrl || '').trim(),
    }
  })

  const fullName = `${resolvedFirstName} ${resolvedSurname}`.trim() || resolvedEmail
  let nextDirectory = updateAgentStatusByInvite(directory, invite, AGENT_INVITE_STATUS.ACTIVE, {
    name: fullName,
    firstName: resolvedFirstName,
    surname: resolvedSurname,
    email: resolvedEmail,
    phone: resolvedMobile,
    mobile: resolvedMobile,
    activatedAt: nowIso,
    inviteId: invite?.id,
    role: normalizeRole(invite?.role),
    office: invite?.office || 'Office',
    ppraNumber: String(ppraNumber || '').trim(),
    profilePhotoUrl: String(photoUrl || '').trim(),
    lastActiveAt: nowIso,
  })

  const existingUserIndex = nextDirectory.users.findIndex((user) => normalizeEmail(user?.email) === resolvedEmail)
  if (existingUserIndex === -1) {
    nextDirectory.users.unshift({
      id: generateId('agent_user'),
      email: resolvedEmail,
      fullName,
      role: normalizeRole(invite?.role),
      status: 'active',
      createdAt: nowIso,
      lastActiveAt: nowIso,
    })
  } else {
    nextDirectory.users[existingUserIndex] = {
      ...nextDirectory.users[existingUserIndex],
      fullName: nextDirectory.users[existingUserIndex]?.fullName || fullName,
      status: 'active',
      lastActiveAt: nowIso,
    }
  }

  persistInvites(nextInvites)
  persistDirectory(nextDirectory)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:agent-directory-updated'))
  }
}
