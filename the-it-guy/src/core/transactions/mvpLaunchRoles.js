export const MVP_LAUNCH_ROLE_PLAN_VERSION = 'arch9_mvp_launch_roles_v1'

export const MVP_LAUNCH_ROLE_CATALOG = Object.freeze({
  internal_admin: {
    label: 'Internal Administrator',
    roleType: 'internal_admin',
    transactionRole: 'internal_admin',
    accessScope: 'Support and audited recovery only',
    responsibility: 'Resolve exceptions and recover failed setup without owning ordinary transaction work.',
  },
  agent: {
    label: 'Agent',
    roleType: 'agent',
    transactionRole: 'agent',
    accessScope: 'Deal coordination and client oversight',
    responsibility: 'Create the deal, keep participants aligned, and monitor blockers after offer acceptance.',
  },
  buyer: {
    label: 'Buyer / Purchaser',
    roleType: 'buyer',
    transactionRole: 'buyer',
    accessScope: 'Own onboarding, documents, and client-visible transaction progress',
    responsibility: 'Supply buyer information, evidence, and signatures.',
  },
  seller: {
    label: 'Seller',
    roleType: 'seller',
    transactionRole: 'seller',
    accessScope: 'Own seller documents and client-visible transaction progress',
    responsibility: 'Supply seller information, authority, property evidence, and signatures.',
  },
  buyer_company_signatory: {
    label: 'Buyer Company Signatory',
    roleType: 'client',
    transactionRole: 'buyer',
    accessScope: 'Buyer entity documents and signing actions only',
    responsibility: 'Provide company authority and sign where authorised.',
  },
  buyer_trustee: {
    label: 'Buyer Trustee',
    roleType: 'client',
    transactionRole: 'buyer',
    accessScope: 'Buyer trust documents and signing actions only',
    responsibility: 'Provide trust authority and sign where authorised.',
  },
  seller_company_signatory: {
    label: 'Seller Company Signatory',
    roleType: 'client',
    transactionRole: 'seller',
    accessScope: 'Seller entity documents and signing actions only',
    responsibility: 'Provide company authority and sign where authorised.',
  },
  seller_trustee: {
    label: 'Seller Trustee',
    roleType: 'client',
    transactionRole: 'seller',
    accessScope: 'Seller trust documents and signing actions only',
    responsibility: 'Provide trust authority and sign where authorised.',
  },
  bond_originator: {
    label: 'Bond Originator',
    roleType: 'bond_originator',
    transactionRole: 'bond_originator',
    accessScope: 'Finance lane and finance documents',
    responsibility: 'Collect, submit, and progress the bond application and finance evidence.',
  },
  transfer_attorney: {
    label: 'Transfer Attorney',
    roleType: 'attorney',
    legalRole: 'transfer',
    transactionRole: 'transfer_attorney',
    accessScope: 'Transfer lane, legal documents, and registration evidence',
    responsibility: 'Run the transfer matter through lodgement and registration.',
  },
  bond_attorney: {
    label: 'Bond Attorney',
    roleType: 'attorney',
    legalRole: 'bond',
    transactionRole: 'bond_attorney',
    accessScope: 'Bond-registration lane and related documents',
    responsibility: 'Run the bond registration matter when finance requires it.',
  },
  cancellation_attorney: {
    label: 'Cancellation Attorney',
    roleType: 'attorney',
    legalRole: 'cancellation',
    transactionRole: 'cancellation_attorney',
    accessScope: 'Seller bond-cancellation lane and related documents',
    responsibility: 'Obtain cancellation figures and complete the seller bond cancellation.',
  },
  developer_representative: {
    label: 'Developer Representative',
    roleType: 'developer',
    transactionRole: 'developer_contact',
    accessScope: 'Development sale coordination and developer documents',
    responsibility: 'Represent the developer as seller and supply the development-sale pack.',
  },
})

function uniqueByKey(items = []) {
  return [...new Map(items.map((item) => [item.key, item])).values()]
}

function roleRequirement(key, requiredBy, { requiredAtCreation = false, reason = '' } = {}) {
  const definition = MVP_LAUNCH_ROLE_CATALOG[key]
  if (!definition) throw new Error(`Unknown MVP launch role: ${key}`)
  return {
    key,
    ...definition,
    requiredBy,
    requiredAtCreation,
    reason: reason || definition.responsibility,
  }
}

export function getMvpLaunchRoleDefinition(roleKey = '') {
  return MVP_LAUNCH_ROLE_CATALOG[String(roleKey || '').trim()] || null
}

export function resolveMvpLaunchRolePlan(profile = {}) {
  const financeType = String(profile.financeType || '').trim().toLowerCase()
  const buyerEntityType = String(profile.buyerEntityType || '').trim().toLowerCase()
  const sellerEntityType = String(profile.sellerEntityType || '').trim().toLowerCase()
  const isDevelopmentSale = profile.transactionType === 'development_sale'
  const hasBondComponent = financeType === 'bond' || financeType === 'hybrid'
  const roles = [
    roleRequirement('internal_admin', 'exception_recovery', { reason: 'Internal recovery is available but is not an ordinary transaction participant.' }),
    roleRequirement('buyer', 'transaction_creation', { requiredAtCreation: true }),
    roleRequirement(isDevelopmentSale ? 'developer_representative' : 'seller', 'transaction_creation', { requiredAtCreation: true }),
    roleRequirement('transfer_attorney', 'transfer_ready'),
  ]

  if (!isDevelopmentSale) {
    roles.push(roleRequirement('agent', 'transaction_creation', { requiredAtCreation: true }))
  } else {
    roles.push(roleRequirement('agent', 'transaction_creation', { reason: 'Optional when the developer creates and stewards the deal directly.' }))
  }

  if (buyerEntityType === 'company') roles.push(roleRequirement('buyer_company_signatory', 'otp_executed'))
  if (buyerEntityType === 'trust') roles.push(roleRequirement('buyer_trustee', 'otp_executed'))
  if (sellerEntityType === 'company') roles.push(roleRequirement('seller_company_signatory', 'otp_executed'))
  if (sellerEntityType === 'trust') roles.push(roleRequirement('seller_trustee', 'otp_executed'))

  if (hasBondComponent) {
    roles.push(roleRequirement('bond_originator', 'finance_ready'))
    roles.push(roleRequirement('bond_attorney', 'transfer_ready'))
  }
  if (profile.requiresCancellationAttorney) roles.push(roleRequirement('cancellation_attorney', 'transfer_ready'))

  const uniqueRoles = uniqueByKey(roles)
  return {
    version: MVP_LAUNCH_ROLE_PLAN_VERSION,
    roles: uniqueRoles,
    requiredAtCreation: uniqueRoles.filter((role) => role.requiredAtCreation),
    requiredByOtp: uniqueRoles.filter((role) => role.requiredBy === 'otp_executed'),
    requiredByFinance: uniqueRoles.filter((role) => role.requiredBy === 'finance_ready'),
    requiredByTransfer: uniqueRoles.filter((role) => role.requiredBy === 'transfer_ready'),
  }
}
