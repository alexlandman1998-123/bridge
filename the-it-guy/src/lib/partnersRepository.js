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
  { value: 'agency_network', label: 'Agency Network' },
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
    id: 'demo-daagency',
    name: 'DaAgency',
    displayName: 'DaAgency',
    type: 'agency',
    city: 'Cape Town',
    province: 'Western Cape',
    specialties: ['Transfers', 'Residential'],
    activeAreas: ['Table View', 'Century City'],
    verificationStatus: 'verified',
    partnerRating: 4.7,
    transactionStats: { activeTransactions: 22, registrations: 14, avgDealSpeedDays: 55, responseTimeHours: 4 },
  },
  {
    id: 'demo-harcourts',
    name: 'Harcourts Demo Group',
    displayName: 'Harcourts Demo Group',
    type: 'agency_network',
    city: 'Johannesburg',
    province: 'Gauteng',
    specialties: ['Residential', 'Commercial', 'Bonds'],
    activeAreas: ['Sandton', 'Rosebank', 'Midrand'],
    verificationStatus: 'verified',
    partnerRating: 4.4,
    transactionStats: { activeTransactions: 34, registrations: 17, avgDealSpeedDays: 60, responseTimeHours: 5 },
  },
  {
    id: 'demo-tuckers',
    name: 'Tuckers Inc. Conveyancers',
    displayName: 'Tuckers Inc. Conveyancers',
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
    name: 'BetterBond Demo Team',
    displayName: 'BetterBond Demo Team',
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
    id: 'demo-samlin',
    name: 'Samlin Residential Developments',
    displayName: 'Samlin Residential Developments',
    type: 'developer_company',
    city: 'Johannesburg',
    province: 'Gauteng',
    specialties: ['Development', 'Residential'],
    activeAreas: ['Centurion', 'Centurion East'],
    verificationStatus: 'verified',
    partnerRating: 4.6,
    transactionStats: { activeTransactions: 44, registrations: 11, avgDealSpeedDays: 63, responseTimeHours: 9 },
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
    id: 'demo-ooba-demo-originators',
    name: 'OOBA Demo Originators',
    displayName: 'OOBA Demo Originators',
    type: 'bond_originator',
    city: 'Pretoria',
    province: 'Gauteng',
    specialties: ['Bonds', 'Residential'],
    activeAreas: ['National'],
    verificationStatus: 'verified',
    partnerRating: 4.8,
    transactionStats: { activeTransactions: 58, registrations: 6, avgDealSpeedDays: 18, responseTimeHours: 3 },
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
  if (normalized === 'agencynetwork') return 'agency_network'
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
    agency_network: new Set(['agency', 'attorney_firm', 'bond_originator', 'developer_company']),
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

function normalizeArray(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function mapDemoRecord({ id, workspaceType = 'agency' }) {
  const orgId = normalizeText(id) || 'demo-current-org'
  const type = normalizeOrganisationType(workspaceType)

  if (type === 'bond_originator') {
    return {
      relationships: [
        {
          id: 'demo-rel-demo-samlin',
          organisationId: orgId,
          partnerOrganisationId: 'demo-samlin',
          relationshipStatus: 'accepted',
          relationshipType: 'approved',
          visibilityLevel: 'connected_partners_only',
          notes: 'Connected partner',
          createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
          acceptedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
        },
        {
          id: 'demo-rel-demo-originators',
          organisationId: 'demo-ooba-demo-originators',
          partnerOrganisationId: orgId,
          relationshipStatus: 'accepted',
          relationshipType: 'approved',
          visibilityLevel: 'connected_partners_only',
          notes: 'Connected partner',
          createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
          acceptedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
      ],
      invitations: [
        {
          id: 'demo-invite-received-daagency',
          fromOrganisationId: 'demo-daagency',
          toOrganisationId: orgId,
          fromOrganisationName: 'DaAgency',
          toOrganisationName: 'Bond Demo Account',
          fromWorkspaceType: 'agency',
          toWorkspaceType: 'bond_originator',
          status: 'pending',
          relationshipType: 'approved',
          message: 'I want to connect with your organisation.',
          invitedByUserId: 'demo-bond-user',
          respondedByUserId: '',
          createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 28 * 86400000).toISOString(),
        },
        {
          id: 'demo-invite-received-harcourts',
          fromOrganisationId: 'demo-harcourts',
          toOrganisationId: orgId,
          fromOrganisationName: 'Harcourts Demo Group',
          toOrganisationName: 'Bond Demo Account',
          fromWorkspaceType: 'agency_network',
          toWorkspaceType: 'bond_originator',
          status: 'pending',
          relationshipType: 'approved',
          message: 'Wants a strategic partner relationship.',
          invitedByUserId: 'demo-bond-user',
          respondedByUserId: '',
          createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 28 * 86400000).toISOString(),
        },
        {
          id: 'demo-invite-sent-tuckers',
          fromOrganisationId: orgId,
          toOrganisationId: 'demo-tuckers',
          fromOrganisationName: 'Bond Demo Account',
          toOrganisationName: 'Tuckers Inc. Conveyancers',
          fromWorkspaceType: 'bond_originator',
          toWorkspaceType: 'attorney_firm',
          status: 'pending',
          relationshipType: 'approved',
          message: 'Would you like to collaborate with us?',
          invitedByUserId: 'demo-bond-user',
          createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
        {
          id: 'demo-invite-sent-betterbond',
          fromOrganisationId: orgId,
          toOrganisationId: 'demo-betterbond',
          fromOrganisationName: 'Bond Demo Account',
          toOrganisationName: 'BetterBond Demo Team',
          fromWorkspaceType: 'bond_originator',
          toWorkspaceType: 'bond_originator',
          status: 'pending',
          relationshipType: 'approved',
          message: 'Cross-originator partner invite.',
          invitedByUserId: 'demo-bond-user',
          createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
        {
          id: 'demo-invite-declined-historic',
          fromOrganisationId: orgId,
          toOrganisationId: 'demo-nova-agency',
          fromOrganisationName: 'Bond Demo Account',
          toOrganisationName: 'Nova Realty',
          fromWorkspaceType: 'bond_originator',
          toWorkspaceType: 'agency',
          status: 'declined',
          relationshipType: 'approved',
          message: 'Past invite not accepted.',
          invitedByUserId: 'demo-bond-user',
          respondedByUserId: 'demo-bond-recipient',
          respondedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
          createdAt: new Date(Date.now() - 16 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 28 * 86400000).toISOString(),
        },
      ],
      referrals: [
        {
          id: 'demo-referral-1',
          referringOrganisationId: orgId,
          referredOrganisationId: 'demo-daagency',
          transactionId: 'BR9-1042',
          referralStatus: 'converted',
          referralDate: new Date(Date.now() - 12 * 86400000).toISOString(),
          referralValue: 1850000,
        },
        {
          id: 'demo-referral-2',
          referringOrganisationId: 'demo-ooba',
          referredOrganisationId: orgId,
          transactionId: 'BR9-1078',
          referralStatus: 'accepted',
          referralDate: new Date(Date.now() - 5 * 86400000).toISOString(),
          referralValue: 2420000,
        },
      ],
    }
  }

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
        fromOrganisationId: orgId,
        toOrganisationId: 'demo-betterbond',
        fromOrganisationName: 'Current Demo Organisation',
        toOrganisationName: 'BetterBond Demo Team',
        fromWorkspaceType: type,
        toWorkspaceType: 'bond_originator',
        status: 'pending',
        relationshipType: 'approved',
        invitedEmail: 'partnerships@urbanbond.co.za',
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

function upsertDemoRelationship(state, senderOrganisationId, recipientOrganisationId, relationshipType = 'approved') {
  if (!state?.relationships || !senderOrganisationId || !recipientOrganisationId) return

  const now = new Date().toISOString()
  const fromId = normalizeText(senderOrganisationId)
  const toId = normalizeText(recipientOrganisationId)
  const existing = state.relationships.find((relationship) => {
    const relationshipFrom = normalizeText(relationship.organisationId || relationship.organisation_id)
    const relationshipTo = normalizeText(relationship.partnerOrganisationId || relationship.partner_organisation_id)
    return (
      (relationshipFrom === fromId && relationshipTo === toId) ||
      (relationshipFrom === toId && relationshipTo === fromId)
    )
  })

  if (!existing) {
    state.relationships = [
      {
        id: `demo-rel-${Date.now()}`,
        organisationId: fromId,
        partnerOrganisationId: toId,
        relationshipStatus: 'accepted',
        relationshipType,
        visibilityLevel: 'connected_partners_only',
        createdAt: now,
        acceptedAt: now,
        notes: 'Accepted from invitation.',
      },
      ...state.relationships,
    ]
    return
  }

  state.relationships = state.relationships.map((relationship) => {
    const relationshipFrom = normalizeText(relationship.organisationId || relationship.organisation_id)
    const relationshipTo = normalizeText(relationship.partnerOrganisationId || relationship.partner_organisation_id)
    if (
      (relationshipFrom === fromId && relationshipTo === toId) ||
      (relationshipFrom === toId && relationshipTo === fromId)
    ) {
      return {
        ...relationship,
        relationshipStatus: 'accepted',
        relationshipType: relationshipType || relationship.relationshipType || relationship.relationship_type || 'approved',
        acceptedAt: now,
      }
    }
    return relationship
  })
}

function getDemoState(organisationId, workspaceType) {
  const state = readDemoState()
  const next =
    state && state.organisationId === (normalizeText(organisationId) || 'demo-current-org') && state.workspaceType === normalizeOrganisationType(workspaceType)
      ? state
      : {
          organisationId: normalizeText(organisationId) || 'demo-current-org',
          workspaceType: normalizeOrganisationType(workspaceType),
          ...mapDemoRecord(organisationId, workspaceType),
        }
  writeDemoState(next)
  return next
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
    contactEmails: normalizeArray(
      [row.contact_email, row.contactEmail, settings.contactEmail, settings.contact_email, settings.email, settings.inviteEmail].filter(Boolean),
    ),
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

function mapInvitation(row = {}, organisationsById = new Map()) {
  const senderOrganisationId = normalizeText(row.sender_organisation_id || row.senderOrganisationId)
  const recipientOrganisationId = normalizeText(row.recipient_organisation_id || row.recipientOrganisationId)
  const senderOrganisation = organisationsById.get(senderOrganisationId)
  const recipientOrganisation = organisationsById.get(recipientOrganisationId)

  const invitedEmail = normalizeText(row.invited_email || row.invitedEmail || row.recipient_email || row.recipientEmail)

  const fromWorkspaceType = normalizeOrganisationType(
    row.from_workspace_type || row.fromWorkspaceType || senderOrganisation?.type || row.relationship_from_workspace_type || '',
  )
  const toWorkspaceType = normalizeOrganisationType(
    row.to_workspace_type || row.toWorkspaceType || recipientOrganisation?.type || row.relationship_to_workspace_type || '',
  )

  return {
    id: normalizeText(row.id),
    fromOrganisationId: senderOrganisationId,
    toOrganisationId: recipientOrganisationId,
    fromOrganisationName: normalizeText(row.from_organisation_name || row.fromOrganisationName || row.senderOrganisationName) || senderOrganisation?.name || '',
    toOrganisationName:
      normalizeText(row.to_organisation_name || row.toOrganisationName || row.to_company_name || row.toCompanyName || row.invited_company_name || row.invitedCompanyName) ||
      recipientOrganisation?.name ||
      '',
    invitedEmail,
    fromWorkspaceType,
    toWorkspaceType,
    relationshipType: normalizeText(row.relationship_type || row.relationshipType) || 'approved',
    status: normalizeText(row.status) || 'pending',
    message: normalizeText(row.message || row.inviteMessage || row.note || row.invite_note),
    createdAt: normalizeText(row.created_at || row.createdAt),
    expiresAt: normalizeText(row.expires_at || row.expiresAt),
    invitedByUserId: normalizeText(row.invited_by_user_id || row.invitedByUserId || row.created_by || row.createdBy),
    respondedByUserId: normalizeText(row.responded_by_user_id || row.respondedByUserId || row.respondedBy || row.updated_by || row.updatedBy),
    respondedAt: normalizeText(row.responded_at || row.respondedAt),
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

function enrichRelationships(relationships, organisations) {
  const organisationsById = new Map(organisations.map((item) => [item.id, item]))
  return relationships.map((relationship) => ({
    ...relationship,
    partner: organisationsById.get(relationship.counterpartOrganisationId || relationship.partnerOrganisationId) || null,
  }))
}

function enrichInvitations(invitations, organisations) {
  const organisationsById = new Map(organisations.map((item) => [item.id, item]))
  return invitations.map((item) => {
    const mapped = mapInvitation(item, organisationsById)
    return {
      ...mapped,
      fromOrganisationName:
        mapped.fromOrganisationName ||
        getFallbackInvitationName({
          organisationId: mapped.fromOrganisationId,
          organisationsById,
          invitedEmail: mapped.invitedEmail,
          direction: 'from',
        }),
      toOrganisationName:
        mapped.toOrganisationName ||
        getFallbackInvitationName({
          organisationId: mapped.toOrganisationId,
          organisationsById,
          invitedEmail: mapped.invitedEmail,
          direction: 'to',
        }),
      fromWorkspaceType: mapped.fromWorkspaceType || normalizeOrganisationType(organisationsById.get(mapped.fromOrganisationId)?.type || 'agency'),
      toWorkspaceType: mapped.toWorkspaceType || normalizeOrganisationType(organisationsById.get(mapped.toOrganisationId)?.type || 'agency'),
    }
  })
}

function getFallbackInvitationName({ organisationId = '', organisationsById, invitedEmail = '', direction = 'from' }) {
  const org = organisationsById.get(normalizeText(organisationId))
  if (org?.name) return org.name
  if (invitedEmail) {
    if (invitedEmail.includes('@bridge.internal') || invitedEmail.startsWith('organisation-')) {
      return direction === 'to' ? 'Unknown organisation' : 'Unknown organisation'
    }
    return invitedEmail
  }
  return 'Unknown organisation'
}

function buildDemoSnapshot(organisationId, workspaceType) {
  const state = getDemoState(organisationId, workspaceType)
  const currentType = normalizeOrganisationType(workspaceType)
  const organisations = DEMO_ORGANISATIONS
    .filter((item) => item.type !== currentType || item.id !== organisationId)
    .map(mapOrganisation)

  const relationships = enrichRelationships(
    state.relationships.map((item) => mapRelationship(item, organisationId)),
    organisations,
  )
  const invitations = enrichInvitations(state.invitations, organisations)
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

function normalizeInvitationPayloadText(value) {
  return normalizeText(value)
}

function filterInvitationPayload(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== ''))
}

async function fetchInvitationRows(scopedOrganisationId) {
  try {
    const baseResult = await supabase
      .from('partner_invitations')
      .select(
        'id, sender_organisation_id, recipient_email, recipient_organisation_id, invited_email, from_organisation_name, to_organisation_name, from_workspace_type, to_workspace_type, relationship_type, status, message, created_at, expires_at, invited_by_user_id, responded_by_user_id, responded_at',
      )
      .or(`sender_organisation_id.eq.${scopedOrganisationId},recipient_organisation_id.eq.${scopedOrganisationId}`)
      .order('created_at', { ascending: false })

    if (baseResult.error) throw baseResult.error
    return baseResult.data || []
  } catch (error) {
    if (!isRecoverablePartnerSchemaError(error)) throw error
  }

  const legacyResult = await supabase
    .from('partner_invitations')
    .select('id, sender_organisation_id, recipient_email, recipient_organisation_id, relationship_type, status, created_at, expires_at')
    .or(`sender_organisation_id.eq.${scopedOrganisationId},recipient_organisation_id.eq.${scopedOrganisationId}`)
    .order('created_at', { ascending: false })

  if (legacyResult.error) throw legacyResult.error
  return (legacyResult.data || []).map((row) => ({
    ...row,
    status: normalizeInvitationPayloadText(row.status),
  }))
}

function buildInvitePayloadBase({
  scopedOrganisationId,
  recipientEmail,
  recipientOrganisationId,
  relationshipType,
  userId,
  workspaceType,
  recipientOrganisationName,
  recipientWorkspaceType,
  senderOrganisationName = '',
  message,
}) {
  const toWorkspaceType = normalizeOrganisationType(recipientWorkspaceType || workspaceType)
  const fromOrganisationName = normalizeText(senderOrganisationName) || 'Bridge Organisation'
  return filterInvitationPayload({
    sender_organisation_id: scopedOrganisationId,
    recipient_email: recipientEmail,
    recipient_organisation_id: recipientOrganisationId || null,
    from_organisation_name: fromOrganisationName,
    to_organisation_name: recipientOrganisationName || null,
    from_workspace_type: normalizeOrganisationType(workspaceType),
    to_workspace_type: toWorkspaceType || null,
    relationship_type: normalizeText(relationshipType) || 'approved',
    message: message ? normalizeText(message) : null,
    created_by: normalizeText(userId) || null,
    invited_by_user_id: normalizeText(userId) || null,
  })
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
      fetchInvitationRows(scopedOrganisationId),
      supabase
        .from('partner_referrals')
        .select('id, referring_organisation_id, referred_organisation_id, transaction_id, referral_status, referral_date, referral_value')
        .or(`referring_organisation_id.eq.${scopedOrganisationId},referred_organisation_id.eq.${scopedOrganisationId}`)
        .order('referral_date', { ascending: false }),
      supabase
        .from('organisations')
        .select(
          'id, name, display_name, legal_name, type, logo_url, city, province, specialties, active_areas, discovery_visibility, verification_status, partner_rating, settings_json',
        )
        .neq('id', scopedOrganisationId)
        .neq('discovery_visibility', 'hidden')
        .order('display_name', { ascending: true }),
    ])

    const firstError = [relationshipResult, referralResult, organisationsResult].find((result) => result.error)?.error
    if (firstError) {
      if (isRecoverablePartnerSchemaError(firstError)) {
        return buildDemoSnapshot(scopedOrganisationId, workspaceType)
      }
      throw firstError
    }

    if (invitationResult instanceof Error) {
      throw invitationResult
    }

    const organisations = (organisationsResult.data || []).map(mapOrganisation)
    const relationships = enrichRelationships(
      (relationshipResult.data || []).map((item) => mapRelationship(item, scopedOrganisationId)),
      organisations,
    )
    const invitations = enrichInvitations(invitationResult || [], organisations)
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
  toWorkspaceType = '',
  recipientOrganisationName = '',
  message = '',
  userId = '',
  organisationName = '',
  workspaceType = 'agency',
  forceDemo = false,
} = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const email = normalizeText(recipientEmail).toLowerCase()
  if (!scopedOrganisationId) throw new Error('A workspace organisation is required.')
  if (!email && !recipientOrganisationId) throw new Error('Choose an organisation or enter an invitation email.')

  const resolvedRecipientId = normalizeText(recipientOrganisationId)
  const fallbackType = resolveWorkspaceTypeFromId({ recipientOrganisationId: resolvedRecipientId, toWorkspaceType })

  if (forceDemo || PARTNERS_DEMO_MODE || !isSupabaseConfigured || !supabase) {
    const state = getDemoState(scopedOrganisationId, workspaceType)
    const invitation = {
      id: `demo-invite-${Date.now()}`,
      fromOrganisationId: scopedOrganisationId,
      toOrganisationId: resolvedRecipientId,
      fromOrganisationName: normalizeText(organisationName) || 'Current Demo Organisation',
      toOrganisationName: recipientOrganisationName || email,
      status: 'pending',
      relationshipType,
      fromWorkspaceType: normalizeOrganisationType(workspaceType),
      toWorkspaceType: fallbackType,
      invitedEmail: email,
      message: normalizeText(message),
      invitedByUserId: normalizeText(userId) || '',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      respondedByUserId: '',
      respondedAt: '',
    }
    state.invitations = [invitation, ...state.invitations]
    writeDemoState(state)
    return invitation
  }

  const payload = buildInvitePayloadBase({
    scopedOrganisationId,
    recipientEmail: email,
    recipientOrganisationId: resolvedRecipientId,
    relationshipType,
    userId,
    workspaceType,
    recipientOrganisationName,
    recipientWorkspaceType: fallbackType,
    senderOrganisationName: organisationName,
    message,
  })

  const result = await supabase
    .from('partner_invitations')
    .insert(payload)
    .select('id, sender_organisation_id, recipient_email, recipient_organisation_id, invited_email, from_organisation_name, to_organisation_name, from_workspace_type, to_workspace_type, relationship_type, status, message, created_at, expires_at, invited_by_user_id, responded_by_user_id, responded_at')
    .single()

  if (result.error) {
    if (isRecoverablePartnerSchemaError(result.error)) {
      const fallbackResult = await supabase
        .from('partner_invitations')
        .insert({
          sender_organisation_id: scopedOrganisationId,
          recipient_email: email || null,
          recipient_organisation_id: resolvedRecipientId || null,
          relationship_type: normalizeText(relationshipType) || 'approved',
          created_by: normalizeText(userId) || null,
        })
        .select('id, sender_organisation_id, recipient_email, recipient_organisation_id, status, relationship_type, created_at, expires_at')
        .single()

      if (fallbackResult.error) throw fallbackResult.error
      return {
        ...mapInvitation(fallbackResult.data, new Map()),
        fromOrganisationName: normalizeText(organisationName) || 'Current Organisation',
        toOrganisationName: recipientOrganisationName || email,
        fromWorkspaceType: normalizeOrganisationType(workspaceType),
        toWorkspaceType: fallbackType,
      }
    }
    throw result.error
  }

  return mapInvitation(result.data)
}

async function ensureOrganisationRelationship({ relationshipId = '', senderOrganisationId = '', recipientOrganisationId = '', relationshipType = 'approved' } = {}) {
  if (!senderOrganisationId || !recipientOrganisationId || !isSupabaseConfigured || !supabase) return

  const now = new Date().toISOString()
  const found = await supabase
    .from('organisation_partners')
    .select('id')
    .or(
      `and(organisation_id.eq.${senderOrganisationId},partner_organisation_id.eq.${recipientOrganisationId}),and(organisation_id.eq.${recipientOrganisationId},partner_organisation_id.eq.${senderOrganisationId})`,
    )

  if (found.error) {
    if (isRecoverablePartnerSchemaError(found.error)) return
    throw found.error
  }

  if ((found.data || []).length) {
    const ids = (found.data || []).map((row) => row.id)
    await supabase.from('organisation_partners').update({ relationship_status: 'accepted', relationship_type: relationshipType, accepted_at: now }).in('id', ids)
    return
  }

  await supabase.from('organisation_partners').insert({
    organisation_id: senderOrganisationId,
    partner_organisation_id: recipientOrganisationId,
    relationship_status: 'accepted',
    relationship_type: relationshipType,
    visibility_level: 'connected_partners_only',
    accepted_at: now,
    created_by: null,
  })
}

function resolveWorkspaceTypeFromId({ recipientOrganisationId = '', toWorkspaceType = '' }) {
  if (toWorkspaceType) return normalizeOrganisationType(toWorkspaceType)
  if (recipientOrganisationId === 'demo-tuckers') return 'attorney_firm'
  if (recipientOrganisationId === 'demo-daagency') return 'agency'
  if (recipientOrganisationId === 'demo-harcourts') return 'agency_network'
  if (recipientOrganisationId === 'demo-betterbond') return 'bond_originator'
  if (recipientOrganisationId === 'demo-ooba-demo-originators' || recipientOrganisationId === 'demo-ooba') return 'bond_originator'
  if (recipientOrganisationId === 'demo-samlin') return 'developer_company'
  return 'agency'
}

async function updateInvitationResponse({ invitationId = '', status = 'accepted', userId = '' }) {
  const now = new Date().toISOString()
  const payload = {
    status,
    responded_at: now,
  }
  if (status === 'accepted') payload.accepted_at = now
  const withActor = normalizeText(userId) ? { ...payload, responded_by_user_id: normalizeText(userId) } : payload
  const result = await supabase.from('partner_invitations').update(withActor).eq('id', invitationId)
  if (result.error) {
    if (isRecoverablePartnerSchemaError(result.error)) {
      const legacyPayload = {
        status: status === 'declined' ? 'revoked' : status,
      }
      if (status === 'accepted') legacyPayload.accepted_at = now
      const fallback = await supabase.from('partner_invitations').update(legacyPayload).eq('id', invitationId)
      if (fallback.error) throw fallback.error
      return
    }
    throw result.error
  }
}

export async function acceptPartnerInvitation({
  invitationId = '',
  organisationId = '',
  userId = '',
  workspaceType = 'agency',
  forceDemo = false,
} = {}) {
  const id = normalizeText(invitationId)
  if (!id) throw new Error('A partner invitation is required.')

  if (forceDemo || PARTNERS_DEMO_MODE || !isSupabaseConfigured || !supabase) {
    const state = getDemoState(organisationId, workspaceType)
    const now = new Date().toISOString()
    let invite = null

    state.invitations = state.invitations.map((item) => {
      if (item.id !== id) return item
      invite = item
      return {
        ...item,
        status: 'accepted',
        respondedByUserId: normalizeText(userId) || item.respondedByUserId,
        respondedAt: now,
      }
    })

    if (!invite) throw new Error('Invitation not found.')

    const fromId = normalizeText(invite.fromOrganisationId || invite.senderOrganisationId)
    const toId = normalizeText(invite.toOrganisationId || invite.recipientOrganisationId)
    if (fromId && toId) {
      upsertDemoRelationship(state, fromId, toId, invite.relationshipType)
    }
    writeDemoState(state)
    return true
  }

  const invitationQuery = await supabase
    .from('partner_invitations')
    .select('id, sender_organisation_id, recipient_organisation_id, relationship_type')
    .eq('id', id)
    .single()

  if (invitationQuery.error) throw invitationQuery.error
  if (!invitationQuery.data) throw new Error('Invitation not found.')

  const invitation = invitationQuery.data
  const recipientId = normalizeText(invitation.recipient_organisation_id)
  if (recipientId && normalizeText(organisationId) && recipientId !== normalizeText(organisationId)) {
    throw new Error('This invitation is not available for your organisation.')
  }

  await updateInvitationResponse({ invitationId: id, status: 'accepted', userId })
  await ensureOrganisationRelationship({
    senderOrganisationId: normalizeText(invitation.sender_organisation_id),
    recipientOrganisationId: normalizeText(invitation.recipient_organisation_id),
    relationshipType: normalizeText(invitation.relationship_type) || 'approved',
  })

  return true
}

export async function declinePartnerInvitation({
  invitationId = '',
  organisationId = '',
  userId = '',
  workspaceType = 'agency',
  forceDemo = false,
} = {}) {
  const id = normalizeText(invitationId)
  if (!id) throw new Error('A partner invitation is required.')

  if (forceDemo || PARTNERS_DEMO_MODE || !isSupabaseConfigured || !supabase) {
    const state = getDemoState(organisationId, workspaceType)
    const now = new Date().toISOString()
    const hasInvite = state.invitations.some((item) => item.id === id)
    if (!hasInvite) throw new Error('Invitation not found.')

    state.invitations = state.invitations.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'declined',
            respondedByUserId: normalizeText(userId) || item.respondedByUserId,
            respondedAt: now,
          }
        : item,
    )

    writeDemoState(state)
    return true
  }

  const invitationQuery = await supabase
    .from('partner_invitations')
    .select('id, recipient_organisation_id')
    .eq('id', id)
    .single()

  if (invitationQuery.error) throw invitationQuery.error
  if (!invitationQuery.data) throw new Error('Invitation not found.')

  const recipientId = normalizeText(invitationQuery.data.recipient_organisation_id)
  if (recipientId && normalizeText(organisationId) && recipientId !== normalizeText(organisationId)) {
    throw new Error('This invitation is not available for your organisation.')
  }

  await updateInvitationResponse({ invitationId: id, status: 'declined', userId })
  return true
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
