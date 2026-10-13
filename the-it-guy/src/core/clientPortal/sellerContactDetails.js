export function sellerContactName(...values) {
  return values.filter(value => typeof value === 'string').map(value => value.trim())
    .find(value => value && !/^(seller|agent|your agent|assigned agent|\[object object\])$/i.test(value)
      && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) || ''
}

export function sellerOnboardingDisplayName(listing = {}, formData = {}) {
  const saved = listing?.sellerOnboarding?.formData || listing?.seller_onboarding?.form_data || {}
  const facts = listing?.sellerOnboarding?.canonicalFacts || listing?.sellerCanonicalFacts || saved.canonicalSellerFacts || {}
  const seller = facts.seller || facts
  const name = source => sellerContactName(
    [source?.sellerFirstName || source?.firstName || source?.first_name, source?.sellerSurname || source?.lastName || source?.last_name || source?.surname].filter(Boolean).join(' '),
    source?.primaryContactName, source?.contactName, source?.fullName, source?.full_name, source?.sellerName, source?.name,
  )
  return sellerContactName(name(formData), name(saved), name(seller.contact), name(seller),
    facts.fullName, facts.sellerName, listing?.seller?.name, listing?.sellerName)
}

export function sellerContactEmail(value = '') {
  const email = String(value || '').trim()
  if (!/^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return ''
  const domain = email.split('@')[1].toLowerCase()
  if (/\.(test|invalid|example|localhost)$/.test(domain)
    || ['example.com', 'example.net', 'example.org'].includes(domain)) return ''
  return email
}
