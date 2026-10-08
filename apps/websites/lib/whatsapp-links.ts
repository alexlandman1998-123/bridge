import type { PublicProperty, ResolvedSite } from './types'

/** WhatsApp requires international digits, without the local trunk prefix. */
export function whatsappHref(phone?: string, message?: string): string | undefined {
  const value = phone?.trim()
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return undefined
  let number = value.replace(/\D/g, '')
  if (number.startsWith('00')) number = number.slice(2)
  else if (/^0\d{9}$/.test(number)) number = `27${number.slice(1)}`
  if (/^270\d{9}$/.test(number)) number = `27${number.slice(3)}`
  if (!/^[1-9]\d{7,14}$/.test(number)) return undefined
  if (number.startsWith('27') && number.length !== 11) return undefined
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

export function listingWhatsappHref(
  property: Pick<PublicProperty, 'consultant' | 'partnerListing' | 'title'>,
  site: Pick<ResolvedSite, 'whatsappNumber'>,
): string | undefined {
  const consultant = property.consultant
  const agentHref = whatsappHref(consultant?.phone, `Hello ${consultant?.name}, I’m interested in ${property.title}.`)
  if (agentHref) return agentHref
  // A partner listing must never route an enquiry to the host agency.
  return property.partnerListing ? undefined : whatsappHref(site.whatsappNumber, `Hello, I’m interested in ${property.title}.`)
}
