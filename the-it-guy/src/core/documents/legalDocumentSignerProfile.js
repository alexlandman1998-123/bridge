import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isMissingValue(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s._-]+/g, '_')
  return !normalized || ['missing', 'unknown', 'tbc', 'n_a', 'na', 'none', 'not_provided'].includes(normalized) || normalized.startsWith('[missing:')
}

function firstText(...values) {
  return values.map(normalizeText).find((value) => !isMissingValue(value)) || ''
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function buildSigner({ role, label, name, email, required = true, reason = '' }) {
  return {
    role,
    label,
    signerName: normalizeText(name),
    signerEmail: normalizeText(email).toLowerCase(),
    required: Boolean(required),
    reason: normalizeText(reason),
  }
}

export function resolveLegalDocumentSignerProfile(options = {}) {
  const placeholders = asRecord(options.placeholders)
  const context = asRecord(options.context)
  const buyer = asRecord(options.buyer || context.buyer || context.purchaser)
  const seller = asRecord(options.seller || context.seller || context.sellerDetails || context.seller_details)
  const transaction = asRecord(options.transaction || context.transaction)
  const onboarding = asRecord(context.onboardingFormData || context.onboarding_form_data)
  const scenarioProfile = options.scenarioProfile || resolveLegalDocumentScenarioProfile({
    packetType: options.packetType || 'otp',
    placeholders,
    buyer,
    seller,
    transaction,
    context,
  })

  if (scenarioProfile.packetType !== 'otp') {
    return {
      packetType: scenarioProfile.packetType,
      scenarioProfile,
      signers: [],
      missingRequiredSignerFacts: [],
      complete: true,
    }
  }

  const buyerIsEntity = ['company', 'trust'].includes(scenarioProfile.buyerClauseProfile)
  const sellerIsEntity = ['company', 'trust'].includes(scenarioProfile.sellerClauseProfile)
  const signers = [
    buildSigner({
      role: 'purchaser_1',
      label: buyerIsEntity ? 'Buyer representative' : 'Buyer',
      name: buyerIsEntity
        ? firstText(placeholders.buyer_representative_name, buyer.representativeName, buyer.representative_name)
        : firstText(placeholders.buyer_full_name, placeholders['buyer.display_name'], buyer.fullName, buyer.name),
      email: buyerIsEntity
        ? firstText(placeholders.buyer_representative_email, buyer.representativeEmail, buyer.representative_email, placeholders.buyer_email, buyer.email)
        : firstText(placeholders.buyer_email, placeholders['buyer.email'], buyer.email),
      reason: buyerIsEntity ? 'Authorised representative for the buyer entity' : 'Buyer party to the OTP',
    }),
  ]

  const coBuyerName = firstText(
    placeholders.buyer_2_full_name,
    placeholders.co_buyer_full_name,
    placeholders['buyer2.display_name'],
    buyer.coBuyerFullName,
    buyer.co_buyer_name,
    context.coBuyerFullName,
    onboarding.coBuyerName,
    onboarding.co_buyer_name,
  )
  const coBuyerEmail = firstText(
    placeholders.buyer_2_email,
    placeholders.co_buyer_email,
    placeholders['buyer2.email'],
    buyer.coBuyerEmail,
    buyer.co_buyer_email,
    context.coBuyerEmail,
    onboarding.coBuyerEmail,
    onboarding.co_buyer_email,
  )
  if (coBuyerName || coBuyerEmail) {
    signers.push(buildSigner({
      role: 'purchaser_2',
      label: 'Second buyer',
      name: coBuyerName,
      email: coBuyerEmail,
      reason: 'Additional buyer captured for the OTP',
    }))
  }

  if (scenarioProfile.buyerClauseProfile === 'individual_spouse_consent') {
    signers.push(buildSigner({
      role: 'buyer_spouse',
      label: 'Buyer spouse',
      name: firstText(placeholders.buyer_spouse_full_name, placeholders.buyer_spouse_name, buyer.spouseFullName, buyer.spouseName),
      email: firstText(placeholders.buyer_spouse_email, buyer.spouseEmail, buyer.spouse_email),
      reason: 'Buyer is married in community of property',
    }))
  }

  signers.push(buildSigner({
    role: 'seller',
    label: sellerIsEntity ? 'Seller representative' : 'Seller',
    name: sellerIsEntity
      ? firstText(placeholders.seller_representative_name, seller.representativeName, seller.representative_name)
      : firstText(placeholders.seller_full_name, placeholders['seller.display_name'], seller.fullName, seller.name, transaction.seller_name),
    email: sellerIsEntity
      ? firstText(placeholders.seller_representative_email, seller.representativeEmail, seller.representative_email, placeholders.seller_email, seller.email)
      : firstText(placeholders.seller_email, placeholders['seller.email'], seller.email),
    reason: sellerIsEntity ? 'Authorised representative for the seller entity' : 'Seller party to the OTP',
  }))

  if (scenarioProfile.sellerClauseProfile === 'individual_spouse_consent') {
    signers.push(buildSigner({
      role: 'seller_spouse',
      label: 'Seller spouse',
      name: firstText(placeholders.seller_spouse_full_name, placeholders.seller_spouse_name, seller.spouseFullName, seller.spouseName),
      email: firstText(placeholders.seller_spouse_email, seller.spouseEmail, seller.spouse_email),
      reason: 'Seller is married in community of property',
    }))
  }

  const missingRequiredSignerFacts = signers.flatMap((signer) => [
    ...(!signer.signerName ? [{ role: signer.role, field: 'name', label: `${signer.label} name` }] : []),
    ...(!signer.signerEmail ? [{ role: signer.role, field: 'email', label: `${signer.label} email` }] : []),
  ])

  return {
    packetType: 'otp',
    scenarioProfile,
    signers,
    missingRequiredSignerFacts,
    complete: missingRequiredSignerFacts.length === 0,
  }
}
