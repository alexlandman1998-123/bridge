// Advisory only: descriptions can legitimately mention a separate cottage.
export function getListingDescriptionConflicts(form = {}, rental = false) {
  const description = String(rental ? form.description || '' : form.listingDescription || '')
  const words = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  const warnings = new Set()
  const pattern = /\b(\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]+(bedroom|bathroom)s?\b/gi
  for (const match of description.matchAll(pattern)) {
    const field = `${match[2].toLowerCase()}s`
    if (form[field] == null || String(form[field]).trim() === '') continue
    const stated = words[match[1].toLowerCase()] ?? Number(match[1])
    if (Number.isFinite(Number(form[field])) && stated !== Number(form[field])) warnings.add(`Check ${field}: the description says ${stated}, but Property details says ${form[field]}. If this describes a separate building, make that clear.`)
  }
  return [...warnings]
}
