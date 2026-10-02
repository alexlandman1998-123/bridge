import { transformSellerOnboardingToFacts } from '../services/documents/sellerOnboardingFactTransformer.js'
import { resolveSellerComplianceRequiredSigners } from '../core/documents/sellerComplianceSignerResolver.js'

const text = (value) => String(value ?? '').trim()
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export function buildSellerSigningPlan({ sellerType = '', form = {} } = {}) {
  const facts = transformSellerOnboardingToFacts({ sellerType, ownershipType: sellerType, ...form })
  const resolved = resolveSellerComplianceRequiredSigners(facts)
  const roles = { spouse: 'Spouse', authorised_signatory: 'Authorised signatory', trustee: 'Authorised trustee', executor: 'Executor', representative: 'Authorised representative' }
  const recipients = resolved.signers.map((signer) => {
    const name = signer.identityCaptured ? text(signer.name) : ''
    const email = text(signer.email).toLowerCase()
    return { id: signer.id, name, email, role: roles[signer.role] || (resolved.sellerBranch === 'multiple_owners' ? 'Owner' : 'Seller'), valid: Boolean(name && validEmail(email)) }
  })
  const missing = recipients.filter((recipient) => !recipient.valid).map((recipient) => `Add a name and valid email for ${recipient.role.toLowerCase()}.`)
  const emails = recipients.map((recipient) => recipient.email).filter(Boolean)
  if (new Set(emails).size !== emails.length) missing.push('Give every required signer a distinct email address before sending individual signing links.')
  if (!recipients.length) missing.push('Add at least one required signer.')
  return {
    sellerType: text(sellerType) || resolved.sellerBranch || 'unknown',
    recipients,
    ready: missing.length === 0,
    manualReady: recipients.length > 0 && recipients.every((recipient) => recipient.name),
    missing,
    requiresIndividualSignatures: recipients.length > 1,
    summary: recipients.every((recipient) => !recipient.name)
      ? 'No signer has been captured yet.'
      : recipients.length === 1
        ? `${recipients[0].role} will receive one secure signing link.`
        : `${recipients.length} people must each sign from their own secure link.`,
  }
}
