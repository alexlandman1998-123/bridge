const text = (value) => String(value || '').trim()
const email = (value) => text(value).toLowerCase()

function person({ name = '', email: address = '', role = '' } = {}) {
  return { name: text(name), email: email(address), role, valid: Boolean(text(name) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(address))) }
}

function personName(value = {}) {
  return text(value.fullName || value.name || [value.firstName, value.surname || value.lastName].filter(Boolean).join(' '))
}

function uniqueRecipients(recipients = []) {
  const seen = new Set()
  return recipients.filter((recipient) => {
    const key = recipient.email || `${recipient.name}:${recipient.role}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildSellerSigningPlan({ sellerType = '', form = {} } = {}) {
  const type = text(sellerType).toLowerCase()
  let recipients = []
  if (type === 'multiple_owners') {
    recipients = (Array.isArray(form.multipleOwners || form.owners) ? (form.multipleOwners || form.owners) : []).map((owner) => person({ name: personName(owner), email: owner.email, role: 'Owner' }))
  } else if (type === 'married' || ['married_in_community', 'married_cop'].includes(text(form.maritalStatus || form.maritalRegime).toLowerCase())) {
    recipients = [
      person({ name: form.sellerName || form.fullName || [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' '), email: form.sellerEmail || form.email, role: 'Seller' }),
      person({ name: form.spouseName, email: form.spouseEmail, role: 'Spouse' }),
    ]
  } else if (['company', 'close_corporation', 'foreign_company'].includes(type)) {
    recipients = [person({ name: form.authorisedSignatoryName, email: form.authorisedSignatoryEmail, role: 'Authorised signatory' })]
  } else if (['trust', 'foreign_trust'].includes(type)) {
    recipients = [person({ name: form.authorisedTrusteeName, email: form.authorisedTrusteeEmail, role: 'Authorised trustee' })]
  } else if (type === 'deceased_estate') {
    recipients = [person({ name: form.executorName, email: form.executorEmail, role: 'Executor' })]
  } else if (type === 'power_of_attorney') {
    recipients = [person({ name: form.powerOfAttorneyName, email: form.powerOfAttorneyEmail, role: 'Authorised representative' })]
  } else {
    recipients = [person({ name: form.sellerName || form.fullName || [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' '), email: form.sellerEmail || form.email, role: 'Seller' })]
  }
  recipients = uniqueRecipients(recipients.filter((recipient) => recipient.name || recipient.email))
  const missing = recipients.length === 0
    ? ['Add at least one required signer.']
    : recipients.filter((recipient) => !recipient.valid).map((recipient) => `Add a name and valid email for ${recipient.role.toLowerCase()}.`)
  return {
    sellerType: type || 'unknown',
    recipients,
    ready: missing.length === 0,
    missing,
    requiresIndividualSignatures: recipients.length > 1,
    summary: recipients.length === 0
      ? 'No signer has been captured yet.'
      : recipients.length === 1
        ? `${recipients[0].role} will receive one secure signing link.`
        : `${recipients.length} people must each sign from their own secure link.`,
  }
}
