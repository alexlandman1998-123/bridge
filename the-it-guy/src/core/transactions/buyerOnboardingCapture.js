// Shared personal answers only. Terms, documents, signatures and private seller
// state retain their own transaction authority.
export const BUYER_CAPTURE_KEYS = new Set(["purchaser_type", "first_name", "last_name", "email", "phone", "full_name", "physical_address", "spouse_identity_number", "personal_details", "date_of_birth", "identity_number", "residency_status", "nationality", "residential_address", "postal_address", "tax_number", "occupation", "income_source", "married_coc_details", "spouse_full_name", "spouse_id_number", "spouse_phone", "spouse_email", "spouse_residential_address", "marriage_date", "married_anc_details", "spouse_is_co_purchaser", "anc_available", "company_entity", "company", "company_name", "company_registration_number", "vat_number", "company_registered_address", "company_business_address", "nature_of_business", "company_tax_number", "company_contact_name", "company_contact_email", "company_contact_phone", "authorised_signatory_capacity", "board_resolution_available", "directors", "id_number", "role_title", "signing_authority", "trust_entity", "trust", "trust_name", "trust_registration_number", "trust_type", "masters_office_reference", "trust_registered_address", "trust_tax_number", "trust_contact_name", "trust_contact_email", "trust_contact_phone", "trust_deed_available", "letters_of_authority_available", "trust_resolution_available", "all_trustees_signing", "trustees", "purchasers", "purchaser_entity_type", "natural_person_purchase_mode", "passport_number", "street_address", "suburb", "city", "postal_code", "marital_status", "marital_regime", "ownership_share", "consent_to_purchase", "employment_type", "employer_name", "job_title", "employment_start_date", "business_name", "years_in_business", "gross_monthly_income", "net_monthly_income", "income_frequency", "number_of_dependants", "monthly_credit_commitments", "monthly_living_expenses", "first_time_buyer", "primary_residence", "investment_purchase", "under_debt_review", "under_administration", "ever_declared_insolvent", "surety_obligations", "authorised_signatory_name", "authorised_signatory_identity_number", "authorised_signatory_email", "authorised_signatory_phone", "authorised_trustee_name", "authorised_trustee_identity_number", "authorised_trustee_email", "authorised_trustee_phone"])

export function buyerCaptureProfile(profile = {}) {
  const primary = Array.isArray(profile.purchasers) ? profile.purchasers[0] || {} : {}
  return { ...primary, ...profile,
    ...(profile.residential_address === undefined && primary.street_address ? { residential_address: primary.street_address } : {}),
  }
}

export function hydrateBuyerOnboardingCapture(formData = {}, capture) {
  if (!capture?.revision || !capture?.profile) throw new Error('Buyer onboarding details could not be confirmed.')
  const base = Object.fromEntries(Object.entries(formData).filter(([key]) => !BUYER_CAPTURE_KEYS.has(key) && !key.startsWith('co_')))
  const profile = buyerCaptureProfile(capture.profile)
  return { ...base, ...profile,
    buyerParticipantId: capture.participantId || '', buyer_participant_id: capture.participantId || '',
    buyerPartyId: capture.buyerId || '', buyer_party_id: capture.buyerId || '',
    __bridge_buyer_capture_revision: capture.revision,
  }
}
