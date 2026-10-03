export function sellerContactEmail(value = '') {
  const email = String(value || '').trim()
  if (!/^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return ''
  const domain = email.split('@')[1].toLowerCase()
  if (/\.(test|invalid|example|localhost)$/.test(domain)
    || ['example.com', 'example.net', 'example.org'].includes(domain)) return ''
  return email
}
