import { extractPrivatePropertyXmlBlocks, extractPrivatePropertyXmlTag, normalizePrivatePropertyText } from './privatePropertyClient.js'

function key(value) {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function rows(response, model) {
  return extractPrivatePropertyXmlBlocks(response.data, model).map((block) => ({
    id: Number(extractPrivatePropertyXmlTag(block, 'Id')),
    name: extractPrivatePropertyXmlTag(block, 'Name'),
  })).filter((row) => row.id > 0 && row.name)
}

function exact(rows, name, field) {
  const matches = rows.filter((row) => key(row.name) === key(name))
  if (matches.length !== 1) throw new Error(`Private Property ${field} ${matches.length ? 'is ambiguous' : 'was not found'}: ${name}. Check the listing location before sending it.`)
  return matches[0]
}

// Always resolve the current hierarchy; a supplied ID cannot validate old text.
export async function resolvePrivatePropertyLocation({ portal, address = {}, country = 'South Africa' } = {}) {
  for (const field of ['suburb', 'town', 'province']) {
    if (!normalizePrivatePropertyText(address[field])) throw new Error(`Private Property needs the current ${field} to verify this listing's location.`)
  }
  const resolvedCountry = exact(rows(await portal.getCountries(), 'CountryModel'), country, 'country')
  const province = exact(rows(await portal.getProvinces({ countryId: resolvedCountry.id }), 'ProvinceModel'), address.province, 'province')
  const town = exact(rows(await portal.getCities({ provinceId: province.id }), 'CityModel'), address.town, 'town')
  const suburb = exact(rows(await portal.getSuburbs({ cityId: town.id }), 'SuburbModel'), address.suburb, 'suburb')
  if (address.suburbId && Number(address.suburbId) !== suburb.id) {
    throw new Error('The saved Private Property suburb ID does not match the current listing location. Clear or correct the mapping before sending it.')
  }
  return { country: resolvedCountry, province, town, suburb, suburbId: suburb.id }
}
