const text = (value) => String(value || '').trim()
const email = (value) => text(value).toLowerCase()

function person({ name = '', email: address = '', role = '' } = {}) {
  return { name: text(name), email: email(address), role, valid: Boolean(text(name) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(address))) }
}

export function buildSellerSigningPlan({ sellerType = '', form = {} } = {}) {
  const type = text(sellerType).toLowerCase()
  let recipients = []
  if (type === 'multiple_owners') {
    recipients = (Array.isArray(form.multipleOwners) ? form.multipleOwners : []).map((owner) => person({ name: owner.fullName || [owner.name, owner.surname].filter(Boolean).join(' '), email: owner.email, role: 'Owner' }))
  } else if (type === 'company' || type === 'close_corporation') {
    recipients = [person({ name: form.authorisedSignatoryName, email: form.authorisedSignatoryEmail, role: 'Authorised signatory' })]
  } else if (type === 'trust') {
    recipients = [person({ name: form.authorisedTrusteeName, email: form.authorisedTrusteeEmail, role: 'Authorised trustee' })]
  } else if (type === 'deceased_estate') {
    recipients = [person({ name: form.executorName, email: form.executorEmail, role: 'Executor' })]
  } else {
    recipients = [person({ name: form.sellerName || form.fullName || [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' '), email: form.sellerEmail || form.email, role: 'Seller' })]
  }
  recipients = recipients.filter((recipient) => recipient.name || recipient.email)
  return { sellerType: type || 'unknown', recipients, ready: recipients.length > 0 && recipients.every((recipient) => recipient.valid), missing: recipients.length === 0 ? ['Add at least one required signer.'] : recipients.filter((recipient) => !recipient.valid).map((recipient) => `Add a name and valid email for ${recipient.role.toLowerCase()}.`) }
}
