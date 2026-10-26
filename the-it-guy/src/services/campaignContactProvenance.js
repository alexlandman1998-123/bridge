import * as provenanceModule from '../../../supabase/functions/_shared/campaignContactProvenance.js'

// Vercel can emit shared files outside the app root as CommonJS. Keep the
// same function references for native ESM and CommonJS default namespaces.
const provenance = provenanceModule.default ?? provenanceModule

export const PROPERTY_CONTACT_FIELDS = provenance.PROPERTY_CONTACT_FIELDS
export const GENERAL_CONTACT_FIELDS = provenance.GENERAL_CONTACT_FIELDS
export const createContactProvenance = provenance.createContactProvenance
export const cleanContactProvenance = provenance.cleanContactProvenance
export const withContactOverride = provenance.withContactOverride
export const contactProvenanceReview = provenance.contactProvenanceReview
export const assertCampaignContacts = provenance.assertCampaignContacts
export const confirmCampaignContacts = provenance.confirmCampaignContacts
