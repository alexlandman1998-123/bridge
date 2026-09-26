function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function resolveSellerLeadActionTokens({ lead = {}, listing = {} } = {}) {
  const leadOnboarding = { ...record(lead.seller_onboarding), ...record(lead.sellerOnboarding) }
  const listingOnboarding = { ...record(listing.seller_onboarding), ...record(listing.sellerOnboarding) }
  return {
    onboardingToken: text(
      lead.sellerOnboardingToken || lead.seller_onboarding_token ||
      leadOnboarding.token || listingOnboarding.token,
    ),
    portalToken: text(
      lead.sellerPortalToken || lead.seller_portal_token ||
      leadOnboarding.sellerPortalToken || leadOnboarding.seller_portal_token ||
      listing.sellerPortalToken || listing.seller_portal_token ||
      listingOnboarding.sellerPortalToken || listingOnboarding.seller_portal_token,
    ),
  }
}

export function buildLeadArchivePatch({ lead = {}, mode = 'archive', reason = '', notes = '' } = {}) {
  const lost = mode === 'lost'
  return {
    stage: lost ? 'Lost' : 'Archived',
    status: lost ? 'Lost' : 'Archived',
    ...(lost ? { lostReason: text(reason) } : {}),
    notes: [text(lead.notes), lost ? `Lost reason: ${text(reason)}` : 'Archived', text(notes)]
      .filter(Boolean).join(' | '),
  }
}
