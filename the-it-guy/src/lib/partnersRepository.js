import { isSupabaseConfigured, supabase } from './supabaseClient'
import { MOCK_DATA_ENABLED } from './mockData'

const PARTNER_DEMO_STORAGE_KEY = 'itg:partners-demo:v1'
const PARTNERS_DEMO_MODE = Boolean(
  MOCK_DATA_ENABLED ||
    (import.meta.env.DEV && String(import.meta.env.VITE_ENABLE_MOCK_DATA || '').trim().toLowerCase() === 'true'),
)

export const PARTNER_TYPES = [
  { value: 'agency', label: 'Agent' },
  { value: 'attorney_firm', label: 'Attorney' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'developer_company', label: 'Developer' },
]

export const PARTNER_TYPE_LABELS = PARTNER_TYPES.reduce((accumulator, item) => {
  accumulator[item.value] = item.label
  return accumulator
}, {})

export const PARTNER_SPECIALTIES = [
  'Residential',
  'Commercial',
  'Luxury',
  'Development',
  'Transfers',
  'Bonds',
]

export const PARTNER_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
]

const DEMO_ORGANISATIONS = [
  {
    id: 'demo-tuckers',
    name: 'Tuckers Inc',
    displayName: 'Tuckers Inc',
    type: 'attorney_firm',
    city: 'Johannesburg',
    province: 'Gauteng',
    specialties: ['Transfers', 'Development', 'Residential'],
    activeAreas: ['Sandton', 'Bryanston', 'Midrand'],
    verificationStatus: 'verified',
    partnerRating: 4.8,
    transactionStats: { activeTransactions: 42, registrations: 18, avgDealSpeedDays: 62, responseTimeHours: 4 },
  },
  {
    id: 'demo-vdm',
    name: 'VDM Attorneys',
    displayName: 'VDM Attorneys',
    type: 'attorney_firm',
    city: 'Cape Town',
    province: 'Western Cape',
    specialties: ['Transfers', 'Luxury', 'Commercial'],
    activeAreas: ['City Bowl', 'Atlantic Seaboard', 'Southern Suburbs'],
    verificationStatus: 'verified',
    partnerRating: 4.6,
    transactionStats: { activeTransactions: 28, registrations: 12, avgDealSpeedDays: 66, responseTimeHours: 6 },
  },
  {
    id: 'demo-ooba',
    name: 'OOBA',
    displayName: 'OOBA',
    type: 'bond_originator',
    city: 'Johannesburg',
    province: 'Gauteng',
    specialties: ['Bonds', 'Residential', 'Development'],
    activeAreas: ['National'],
    verificationStatus: 'verified',
    partnerRating: 4.7,
    transactionStats: { activeTransactions: 64, registrations: 0, avgDealSpeedDays: 21, responseTimeHours: 3 },
  },
  {
    id: 'demo-betterbond',
    name: 'BetterBond',
    displayName: 'BetterBond',
    type: 'bond_originator',
    city: 'Pretoria',
    province: 'Gauteng',
    specialties: ['Bonds', 'Luxury', 'Residential'],
    activeAreas: ['National'],
    verificationStatus: 'verified',
    partnerRating: 4.5,
    transactionStats: { activeTransactions: 51, registrations: 0, avgDealSpeedDays: 24, responseTimeHours: 5 },
  },
  {
    id: 'demo-aurum',
    name: 'Aurum Developments',
    displayName: 'Aurum Developments',
    type: 'developer_company',
    city: 'Cape Town',
    province: 'Western Cape',
    specialties: ['Development', 'Luxury', 'Residential'],
    activeAreas: ['Atlantic Seaboard', 'Winelands'],
    verificationStatus: 'verified',
    partnerRating: 4.4,
    transactionStats: { activeTransactions: 33, registrations: 9, avgDealSpeedDays: 71, responseTimeHours: 8 },
  },
  {
    id: 'demo-nova-agency',
    name: 'Nova Realty',
    displayName: 'Nova Realty',
    type: 'agency',
    city: 'Durban',
    province: 'KwaZulu-Natal',
    specialties: ['Residential', 'Commercial', 'Luxury'],
    activeAreas: ['Umhlanga', 'Ballito', 'La Lucia'],
    verificationStatus: 'verified',
    partnerRating: 4.6,
    transactionStats: { activeTransactions: 24, registrations: 11, avgDealSpeedDays: 58, responseTimeHours: 5 },
  },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeOrganisationType(value) {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  if (normalized === 'agent') return 'agency'
  if (normalized === 'developer') return 'developer_company'
  if (normalized === 'attorney') return 'attorney_firm'
  if (normalized === 'bond' || normalized === 'bond_company') return 'bond_originator'
  return normalized || 'agency'
}

export function getPartnerTypeLabel(value) {
  return PARTNER_TYPE_LABELS[normalizeOrganisationType(value)] || 'Partner'
}

export function canConnectPartnerTypes(sourceType, targetType) {
  const source = normalizeOrganisationType(sourceType)
  const target = normalizeOrganisationType(targetType)
  const allowed = {
    agency: new Set(['attorney_firm', 'bond_originator', 'developer_company']),
    attorney_firm: new Set(['agency', 'developer_company']),
    developer_company: new Set(['agency', 'attorney_firm', 'bond_originator']),
    bond_originator: new Set(['agency', 'developer_company']),
  }
  return Boolean(allowed[source]?.has(target))
}

function isRecoverablePartnerSchemaError(error) {
  const code = String(error?.code || '')
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('organisation_partners') ||
    message.includes('partner_invitations') ||
    message.includes('partner_referrals') ||
    message.includes('partner_visibility_settings') ||
    message.includes('relationship')
  )
}

function readDemoState() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PARTNER_DEMO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeDemoState(state) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PARTNER_DEMO_STORAGE_KEY, JSON.stringify(state))
}

function createDemoState(organisationId, workspaceType = 'agency') {
  const orgId = normalizeText(organisationId) || 'demo-current-org'
  const type = normalizeOrganisationType(workspaceType)
  const defaultPartners = DEMO_ORGANISATIONS.filter((item) => canConnectPartnerTypes(type, item.type)).slice(0, 3)

  return {
    relationships: defaultPartners.map((partner, index) => ({
      id: `demo-rel-${partner.id}`,
      organisationId: orgId,
      partnerOrganisationId: partner.id,
      relationshipStatus: 'accepted',
      relationshipType: index === 0 ? 'preferred' : 'approved',
      visibilityLevel: index === 0 ? 'preferred_partners_only' : 'connected_partners_only',
      notes: index === 0 ? 'Primary recommended partner for new matters.' : '',
      createdAt: new Date(Date.now() - (index + 7) * 86400000).toISOString(),
      acceptedAt: new Date(Date.now() - (index + 4) * 86400000).toISOString(),
    })),
    invitations: [
      {
        id: 'demo-invite-1',
        senderOrganisationId: orgId,
        recipientEmail: 'partnerships@urbanbond.co.za',
        recipientOrganisationId: '',
        status: 'pending',
        relationshipType: 'approved',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        expiresAt: new Date(Date.now() + 28 * 86400000).toISOString(),
      },
    ],
    referrals: [
      {
        id: 'demo-referral-1',
        referringOrganisationId: orgId,
        referredOrganisationId: defaultPartners[0]?.id || 'demo-tuckers',
        transactionId: 'BR9-1042',
        referralStatus: 'converted',
        referralDate: new Date(Date.now() - 12 * 86400000).toISOString(),
        referralValue: 1850000,
      },
      {
        id: 'demo-referral-2',
        referringOrganisationId: defaultPartners[1]?.id || 'demo-ooba',
        referredOrganisationId: orgId,
        transactionId: 'BR9-1078',
        referralStatus: 'accepted',
        referralDate: new Date(Date.now() - 5 * 86400000).toISOString(),
        referralValue: 2420000,
      },
    ],
  }
}

function getDemoState(organisationId, workspaceType) {
  const state = readDemoState() || createDemoState(organisationId, workspaceType)
  writeDemoState(state)
  return state
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function mapOrganisation(row = {}) {
  const settings = row.settings_json && typeof row.settings_json === 'object' ? row.settings_json : {}
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.display_name || row.displayName || row.name) || 'Bridge Organisation',
    displayName: normalizeText(row.display_name || row.displayName || row.name) || 'Bridge Organisation',
    legalName: normalizeText(row.legal_name || row.legalName),
    type: normalizeOrganisationType(row.type || row.workspace_type),
    logoUrl: normalizeText(row.logo_url || row.logoUrl),
    city: normalizeText(row.city || settings.city),
    province: normalizeText(row.province || settings.province),
    specialties: normalizeArray(row.specialties || settings.specialties),
    activeAreas: normalizeArray(row.active_areas || row.activeAreas || settings.activeAreas),
    verificationStatus: normalizeText(row.verification_status || row.verificationStatus) || 'unverified',
    discoveryVisibility: normalizeText(row.discovery_visibility || row.discoveryVisibility) || 'public',
    partnerRating: Number(row.partner_rating ?? row.partnerRating ?? 0) || null,
    transactionStats: {
      activeTransactions: Number(settings.activeTransactions || settings.active_transaction_count || 0),
      registrations: Number(settings.registrations || settings.registration_count || 0),
      avgDealSpeedDays: Number(settings.avgDealSpeedDays || settings.avg_deal_speed_days || 0),
      responseTimeHours: Number(settings.responseTimeHours || settings.response_time_hours || 0),
    },
  }
}

function mapRelationship(row = {}, currentOrganisationId = '') {
  const organisationId = normalizeText(row.organisation_id || row.organisationId)
  const partnerOrganisationId = normalizeText(row.partner_organisation_id || row.partnerOrganisationId)
  const currentId = normalizeText(currentOrganisationId)
  const counterpartId = currentId && organisationId === currentId ? partnerOrganisationId : organisationId

  return {
    id: normalizeText(row.id),
    organisationId,
    partnerOrganisationId,
    counterpartOrganisationId: counterpartId,
    relationshipStatus: normalizeText(row.relationship_status || row.relationshipStatus) || 'pending',
    relationshipType: normalizeText(row.relationship_type || row.relationshipType) || 'approved',
    visibilityLevel: normalizeText(row.visibility_level || row.visibilityLevel) || 'connected_partners_only',
    notes: normalizeText(row.notes),
    createdAt: normalizeText(row.created_at || row.createdAt),
    acceptedAt: normalizeText(row.accepted_at || row.acceptedAt),
  }
}

function mapInvitation(row = {}) {
  return {
    id: normalizeText(row.id),
    senderOrganisationId: normalizeText(row.sender_organisation_id || row.senderOrganisationId),
    recipientEmail: normalizeText(row.recipient_email || row.recipientEmail),
    recipientOrganisationId: normalizeText(row.recipient_organisation_id || row.recipientOrganisationId),
    status: normalizeText(row.status) || 'pending',
    relationshipType: normalizeText(row.relationship_type || row.relationshipType) || 'approved',
    createdAt: normalizeText(row.created_at || row.createdAt),
    expiresAt: normalizeText(row.expires_at || row.expiresAt),
  }
}

function mapReferral(row = {}) {
  return {
    id: normalizeText(row.id),
    referringOrganisationId: normalizeText(row.referring_organisation_id || row.referringOrganisationId),
    referredOrganisationId: normalizeText(row.referred_organisation_id || row.referredOrganisationId),
    transactionId: normalizeText(row.transaction_id || row.transactionId),
    referralStatus: normalizeText(row.referral_status || row.referralStatus) || 'sent',
    referralDate: normalizeText(row.referral_date || row.referralDate),
    referralValue: Number(row.referral_value ?? row.referralValue ?? 0) || 0,
  }
}

function enrichRelationships(relationships, organisations) {
  const organisationsById = new Map(organisations.map((item) => [item.id, item]))
  return relationships.map((relationship) => ({
    ...relationship,
    partner: organisationsById.get(relationship.counterpartOrganisationId || relationship.partnerOrganisationId) || null,
  }))
}

function buildMetrics({ relationships = [], referrals = [] } = {}) {
  const accepted = relationships.filter((item) => item.relationshipStatus === 'accepted')
  const preferred = accepted.filter((item) => item.relationshipType === 'preferred')
  const converted = referrals.filter((item) => item.referralStatus === 'converted')
  const activeSharedDeals = accepted.reduce((sum, item) => sum + Number(item.partner?.transactionStats?.activeTransactions || 0), 0)

  return {
    activePartners: accepted.length,
    preferredPartners: preferred.length,
    newPartnerGrowth: relationships.filter((item) => {
      const timestamp = new Date(item.createdAt || '').getTime()
      return Number.isFinite(timestamp) && Date.now() - timestamp <= 30 * 86400000
    }).length,
    inviteAcceptanceRate: relationships.length ? Math.round((accepted.length / relationships.length) * 100) : 0,
    activeSharedDeals,
    completedDeals: accepted.reduce((sum, item) => sum + Number(item.partner?.transactionStats?.registrations || 0), 0),
    avgTransactionDuration: accepted.length
      ? Math.round(
          accepted.reduce((sum, item) => sum + Number(item.partner?.transactionStats?.avgDealSpeedDays || 0), 0) /
            accepted.length,
        )
      : 0,
    registrationSuccessRate: 78,
    avgResponseTimeHours: accepted.length
      ? Math.round(
          accepted.reduce((sum, item) => sum + Number(item.partner?.transactionStats?.responseTimeHours || 0), 0) /
            accepted.length,
        )
      : 0,
    documentTurnaroundDays: 4,
    workflowCompletionSpeed: 86,
    financeApprovalRate: 72,
    referralsSent: referrals.filter((item) => item.referringOrganisationId).length,
    referralsReceived: referrals.filter((item) => item.referredOrganisationId).length,
    referralConversionRate: referrals.length ? Math.round((converted.length / referrals.length) * 100) : 0,
    revenueInfluenced: referrals.reduce((sum, item) => sum + Number(item.referralValue || 0), 0),
  }
}

function buildDemoSnapshot(organisationId, workspaceType) {
  const state = getDemoState(organisationId, workspaceType)
  const currentType = normalizeOrganisationType(workspaceType)
  const organisations = DEMO_ORGANISATIONS.filter((item) => item.type !== currentType || item.id !== organisationId).map(mapOrganisation)
  const relationships = enrichRelationships(
    state.relationships.map((item) => mapRelationship(item, organisationId)),
    organisations,
  )
  const invitations = state.invitations.map(mapInvitation)
  const referrals = state.referrals.map(mapReferral)

  return {
    source: 'demo',
    organisations,
    relationships,
    invitations,
    referrals,
    metrics: buildMetrics({ relationships, referrals }),
  }
}

export async function fetchPartnersSnapshot({ organisationId = '', workspaceType = 'agency' } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (PARTNERS_DEMO_MODE || !isSupabaseConfigured || !supabase || !scopedOrganisationId) {
    return buildDemoSnapshot(scopedOrganisationId, workspaceType)
  }

  try {
    const [relationshipResult, invitationResult, referralResult, organisationsResult] = await Promise.all([
      supabase
        .from('organisation_partners')
        .select('id, organisation_id, partner_organisation_id, relationship_status, relationship_type, visibility_level, notes, created_at, accepted_at')
        .or(`organisation_id.eq.${scopedOrganisationId},partner_organisation_id.eq.${scopedOrganisationId}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('partner_invitations')
        .select('id, sender_organisation_id, recipient_email, recipient_organisation_id, status, relationship_type, created_at, expires_at')
        .or(`sender_organisation_id.eq.${scopedOrganisationId},recipient_organisation_id.eq.${scopedOrganisationId}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('partner_referrals')
        .select('id, referring_organisation_id, referred_organisation_id, transaction_id, referral_status, referral_date, referral_value')
        .or(`referring_organisation_id.eq.${scopedOrganisationId},referred_organisation_id.eq.${scopedOrganisationId}`)
        .order('referral_date', { ascending: false }),
      supabase
        .from('organisations')
        .select('id, name, display_name, legal_name, type, logo_url, city, province, specialties, active_areas, discovery_visibility, verification_status, partner_rating, settings_json')
        .neq('id', scopedOrganisationId)
        .neq('discovery_visibility', 'hidden')
        .order('display_name', { ascending: true }),
    ])

    const firstError = [relationshipResult, invitationResult, referralResult, organisationsResult].find((result) => result.error)?.error
    if (firstError) {
      if (isRecoverablePartnerSchemaError(firstError)) {
        return buildDemoSnapshot(scopedOrganisationId, workspaceType)
      }
      throw firstError
    }

    const organisations = (organisationsResult.data || []).map(mapOrganisation)
    const relationships = enrichRelationships(
      (relationshipResult.data || []).map((item) => mapRelationship(item, scopedOrganisationId)),
      organisations,
    )
    const invitations = (invitationResult.data || []).map(mapInvitation)
    const referrals = (referralResult.data || []).map(mapReferral)

    return {
      source: 'supabase',
      organisations,
      relationships,
      invitations,
      referrals,
      metrics: buildMetrics({ relationships, referrals }),
    }
  } catch (error) {
    if (isRecoverablePartnerSchemaError(error)) {
      return buildDemoSnapshot(scopedOrganisationId, workspaceType)
    }
    throw error
  }
}

export function filterDiscoverablePartners(organisations = [], filters = {}) {
  const type = normalizeText(filters.type)
  const province = normalizeText(filters.province)
  const specialty = normalizeText(filters.specialty)
  const query = normalizeLower(filters.query)

  return organisations.filter((organisation) => {
    if (type && organisation.type !== type) return false
    if (province && organisation.province !== province) return false
    if (specialty && !organisation.specialties.includes(specialty)) return false
    if (!query) return true
    return [
      organisation.name,
      organisation.city,
      organisation.province,
      organisation.specialties.join(' '),
      organisation.activeAreas.join(' '),
      getPartnerTypeLabel(organisation.type),
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
}

export function getPartnerAssignmentOptions(snapshot = {}, roleType = 'transfer_attorney') {
  const targetTypes =
    roleType === 'bond_originator'
      ? new Set(['bond_originator'])
      : roleType === 'developer'
        ? new Set(['developer_company'])
        : new Set(['attorney_firm'])

  return (snapshot.relationships || [])
    .filter((relationship) => relationship.relationshipStatus === 'accepted' && targetTypes.has(relationship.partner?.type))
    .sort((left, right) => {
      const preferredDiff = Number(right.relationshipType === 'preferred') - Number(left.relationshipType === 'preferred')
      if (preferredDiff !== 0) return preferredDiff
      return String(left.partner?.name || '').localeCompare(String(right.partner?.name || ''))
    })
    .map((relationship) => ({
      id: relationship.id,
      organisationId: relationship.partner?.id || relationship.counterpartOrganisationId,
      companyName: relationship.partner?.name || 'Connected partner',
      email: '',
      relationshipType: relationship.relationshipType,
      relationshipId: relationship.id,
      roleType,
    }))
}

export async function createPartnerInvitation({
  organisationId = '',
  recipientEmail = '',
  recipientOrganisationId = '',
  relationshipType = 'approved',
  userId = '',
  workspaceType = 'agency',
  forceDemo = false,
} = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const email = normalizeText(recipientEmail).toLowerCase()
  if (!scopedOrganisationId) throw new Error('A workspace organisation is required.')
  if (!email && !recipientOrganisationId) throw new Error('Choose an organisation or enter an invitation email.')

  if (forceDemo || PARTNERS_DEMO_MODE || !isSupabaseConfigured || !supabase) {
    const state = getDemoState(scopedOrganisationId, workspaceType)
    const invitation = {
      id: `demo-invite-${Date.now()}`,
      senderOrganisationId: scopedOrganisationId,
      recipientEmail: email,
      recipientOrganisationId: normalizeText(recipientOrganisationId),
      status: 'pending',
      relationshipType,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    }
    state.invitations = [invitation, ...state.invitations]
    if (recipientOrganisationId) {
      state.relationships = [
        {
          id: `demo-rel-${Date.now()}`,
          organisationId: scopedOrganisationId,
          partnerOrganisationId: normalizeText(recipientOrganisationId),
          relationshipStatus: 'pending',
          relationshipType,
          visibilityLevel: 'connected_partners_only',
          createdAt: new Date().toISOString(),
        },
        ...state.relationships,
      ]
    }
    writeDemoState(state)
    return invitation
  }

  const invitationPayload = {
    sender_organisation_id: scopedOrganisationId,
    recipient_email: email || `organisation-${recipientOrganisationId}@bridge.internal`,
    recipient_organisation_id: normalizeText(recipientOrganisationId) || null,
    relationship_type: relationshipType,
    created_by: normalizeText(userId) || null,
  }

  const result = await supabase
    .from('partner_invitations')
    .insert(invitationPayload)
    .select('id, sender_organisation_id, recipient_email, recipient_organisation_id, status, relationship_type, created_at, expires_at')
    .single()

  if (result.error) {
    if (isRecoverablePartnerSchemaError(result.error)) {
      return createPartnerInvitation({ organisationId, recipientEmail, recipientOrganisationId, relationshipType, userId: '', workspaceType, forceDemo: true })
    }
    throw result.error
  }

  if (recipientOrganisationId) {
    await supabase
      .from('organisation_partners')
      .insert({
        organisation_id: scopedOrganisationId,
        partner_organisation_id: normalizeText(recipientOrganisationId),
        relationship_status: 'pending',
        relationship_type: relationshipType,
        visibility_level: 'connected_partners_only',
        created_by: normalizeText(userId) || null,
      })
  }

  return mapInvitation(result.data)
}

export async function updatePartnerRelationshipStatus({
  relationshipId = '',
  status = 'accepted',
  relationshipType,
  workspaceType = 'agency',
  organisationId = '',
  forceDemo = false,
} = {}) {
  const id = normalizeText(relationshipId)
  if (!id) throw new Error('A partner relationship is required.')

  if (forceDemo || PARTNERS_DEMO_MODE || !isSupabaseConfigured || !supabase) {
    const state = getDemoState(organisationId, workspaceType)
    state.relationships = state.relationships.map((relationship) =>
      relationship.id === id
        ? {
            ...relationship,
            relationshipStatus: status,
            relationshipType: relationshipType || relationship.relationshipType,
            acceptedAt: status === 'accepted' ? new Date().toISOString() : relationship.acceptedAt,
          }
        : relationship,
    )
    writeDemoState(state)
    return true
  }

  const payload = {
    relationship_status: status,
  }
  if (relationshipType) payload.relationship_type = relationshipType
  if (status === 'accepted') payload.accepted_at = new Date().toISOString()

  const result = await supabase.from('organisation_partners').update(payload).eq('id', id)
  if (result.error) {
    if (isRecoverablePartnerSchemaError(result.error)) {
      return updatePartnerRelationshipStatus({ relationshipId, status, relationshipType, workspaceType, organisationId, forceDemo: true })
    }
    throw result.error
  }
  return true
}
