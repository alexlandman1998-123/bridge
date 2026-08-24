import {
  getTransactionSalePartyModel,
  getTransactionSaleRouteBadge,
  resolveTransactionSaleProfile,
} from '../transactions/transactionSaleProfile.js'

export const CLIENT_PORTAL_KINDS = Object.freeze({
  NEW_DEVELOPMENT_BUYER: 'new_development_buyer_portal',
  AGENCY_INTRODUCED_DEVELOPMENT_BUYER: 'agency_introduced_development_buyer_portal',
  AGENCY_RESALE_BUYER: 'agency_resale_buyer_portal',
  GENERIC_BUYER: 'buyer_portal',
  SELLER: 'seller_portal',
})

export const CLIENT_PORTAL_NAVIGATION_MODES = Object.freeze({
  DEVELOPER_DEVELOPMENT: 'developer_development',
  AGENCY_DEVELOPMENT: 'agency_development',
  AGENCY_RESALE: 'agency_resale',
  GENERIC_BUYER: 'generic_buyer',
  SELLER: 'seller',
})

const BASE_BUYER_SECTIONS = Object.freeze({
  overview: true,
  progress: true,
  appointments: true,
  offers: true,
  details: true,
  account: true,
  documents: true,
  team: true,
  settings: true,
})

const DEVELOPMENT_ONLY_SECTION_KEYS = Object.freeze([
  'handover',
  'snags',
  'alterations',
  'review',
])

function normalizeWorkspace(value = 'shared') {
  const normalized = String(value || 'shared').trim().toLowerCase()
  if (normalized === 'selling' || normalized === 'seller') return 'selling'
  if (normalized === 'buying' || normalized === 'buyer') return 'buying'
  return 'shared'
}

function hasTruthySetting(settings = {}, ...keys) {
  if (!settings || typeof settings !== 'object') return false
  return keys.some((key) => {
    const value = settings[key]
    if (value === true || value === 1) return true
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'enabled'
  })
}

function buildEnabledSections({ isSellerPortal, isDevelopmentBuyerPortal, settings }) {
  if (isSellerPortal) {
    return Object.freeze({
      overview: true,
      progress: true,
      documents: true,
      activity: true,
      details: true,
      team: true,
      settings: true,
      handover: false,
      snags: false,
      alterations: false,
      review: false,
      bond_application: false,
    })
  }

  const developmentSections = DEVELOPMENT_ONLY_SECTION_KEYS.reduce((sections, key) => {
    if (!isDevelopmentBuyerPortal) {
      sections[key] = false
      return sections
    }

    if (key === 'handover') {
      sections[key] = true
      return sections
    }

    if (key === 'snags') {
      sections[key] = hasTruthySetting(settings, 'snag_reporting_enabled', 'snagReportingEnabled')
      return sections
    }

    if (key === 'alterations') {
      sections[key] = hasTruthySetting(settings, 'alteration_requests_enabled', 'alterationRequestsEnabled')
      return sections
    }

    sections[key] = hasTruthySetting(settings, 'service_reviews_enabled', 'serviceReviewsEnabled')
    return sections
  }, {})

  return Object.freeze({
    ...BASE_BUYER_SECTIONS,
    ...developmentSections,
    bond_application: true,
  })
}

function buildSupportLabels({ isSellerPortal, saleProfile }) {
  if (isSellerPortal) {
    return Object.freeze({
      primarySupportLabel: 'Listing Team',
      developerSupportLabel: '',
      agencySupportLabel: 'Agency / Agent',
      operationsSupportLabel: 'Seller Operations',
      transactionPartyLabel: 'Seller',
    })
  }

  if (saleProfile.isExternalAgencySale) {
    return Object.freeze({
      primarySupportLabel: 'Introducing Agency',
      developerSupportLabel: 'Developer Operations',
      agencySupportLabel: 'Agency / Introducing Agent',
      operationsSupportLabel: 'Developer Operations',
      transactionPartyLabel: 'Developer',
    })
  }

  if (saleProfile.isDeveloperAssignedSale) {
    return Object.freeze({
      primarySupportLabel: 'Assigned Sales Agent',
      developerSupportLabel: 'Developer',
      agencySupportLabel: '',
      operationsSupportLabel: 'Developer Operations',
      transactionPartyLabel: 'Developer',
    })
  }

  if (saleProfile.isDeveloperSale) {
    return Object.freeze({
      primarySupportLabel: 'Developer Sales Team',
      developerSupportLabel: 'Developer',
      agencySupportLabel: '',
      operationsSupportLabel: 'Developer Operations',
      transactionPartyLabel: 'Developer',
    })
  }

  return Object.freeze({
    primarySupportLabel: 'Agency / Agent',
    developerSupportLabel: '',
    agencySupportLabel: 'Agency / Agent',
    operationsSupportLabel: 'Conveyancing Team',
    transactionPartyLabel: 'Seller',
  })
}

function resolvePortalKind({ isSellerPortal, saleProfile }) {
  if (isSellerPortal) return CLIENT_PORTAL_KINDS.SELLER
  if (saleProfile.isExternalAgencySale) return CLIENT_PORTAL_KINDS.AGENCY_INTRODUCED_DEVELOPMENT_BUYER
  if (saleProfile.isDeveloperSale) return CLIENT_PORTAL_KINDS.NEW_DEVELOPMENT_BUYER
  if (saleProfile.isPrivateProperty) return CLIENT_PORTAL_KINDS.AGENCY_RESALE_BUYER
  return CLIENT_PORTAL_KINDS.GENERIC_BUYER
}

function resolveNavigationMode({ portalKind }) {
  if (portalKind === CLIENT_PORTAL_KINDS.SELLER) return CLIENT_PORTAL_NAVIGATION_MODES.SELLER
  if (portalKind === CLIENT_PORTAL_KINDS.AGENCY_INTRODUCED_DEVELOPMENT_BUYER) {
    return CLIENT_PORTAL_NAVIGATION_MODES.AGENCY_DEVELOPMENT
  }
  if (portalKind === CLIENT_PORTAL_KINDS.NEW_DEVELOPMENT_BUYER) {
    return CLIENT_PORTAL_NAVIGATION_MODES.DEVELOPER_DEVELOPMENT
  }
  if (portalKind === CLIENT_PORTAL_KINDS.AGENCY_RESALE_BUYER) {
    return CLIENT_PORTAL_NAVIGATION_MODES.AGENCY_RESALE
  }
  return CLIENT_PORTAL_NAVIGATION_MODES.GENERIC_BUYER
}

export function resolveClientPortalProfile({
  transaction = {},
  unit = {},
  settings = {},
  setup = {},
  sourceContext = {},
  lead = {},
  workspace = 'shared',
  hasBuyingContext = true,
  hasSellingContext = false,
} = {}) {
  const workspaceMode = normalizeWorkspace(workspace)
  const saleProfile = resolveTransactionSaleProfile({
    transaction,
    unit,
    setup,
    sourceContext,
    lead,
  })
  const portalKind = resolvePortalKind({
    isSellerPortal: workspaceMode === 'selling' || (hasBuyingContext === false && hasSellingContext),
    saleProfile,
  })
  const isSellerPortal = portalKind === CLIENT_PORTAL_KINDS.SELLER
  const isAgencyIntroducedDevelopmentPortal = portalKind === CLIENT_PORTAL_KINDS.AGENCY_INTRODUCED_DEVELOPMENT_BUYER
  const isNewDevelopmentBuyerPortal = portalKind === CLIENT_PORTAL_KINDS.NEW_DEVELOPMENT_BUYER
  const isAgencyResaleBuyerPortal = portalKind === CLIENT_PORTAL_KINDS.AGENCY_RESALE_BUYER
  const isDevelopmentBuyerPortal = isNewDevelopmentBuyerPortal || isAgencyIntroducedDevelopmentPortal
  const isAgencyBuyerPortal = isAgencyIntroducedDevelopmentPortal || isAgencyResaleBuyerPortal

  return Object.freeze({
    portalKind,
    navigationMode: resolveNavigationMode({ portalKind }),
    workspace: workspaceMode,
    saleProfile,
    saleRoute: saleProfile.saleRoute,
    saleChannel: saleProfile.saleChannel,
    transactionType: saleProfile.transactionType,
    sellerPartyType: saleProfile.sellerPartyType,
    saleRouteBadge: getTransactionSaleRouteBadge(saleProfile.saleRoute),
    partyModel: getTransactionSalePartyModel(saleProfile.saleRoute),
    isSellerPortal,
    isBuyerPortal: !isSellerPortal,
    isDevelopmentBuyerPortal,
    isDeveloperBuyerPortal: isNewDevelopmentBuyerPortal,
    isNewDevelopmentBuyerPortal,
    isAgencyBuyerPortal,
    isAgencyIntroducedDevelopmentPortal,
    isAgencyResaleBuyerPortal,
    isPrivatePropertyBuyerPortal: isAgencyResaleBuyerPortal,
    enabledSections: buildEnabledSections({
      isSellerPortal,
      isDevelopmentBuyerPortal,
      settings,
    }),
    supportLabels: buildSupportLabels({
      isSellerPortal,
      saleProfile,
    }),
  })
}
