export function createCataloguePortal({ town = 'Johannesburg', suburb = 'Sandton', suburbId = 12345, duplicateSuburb = false } = {}) {
  const calls = []
  const model = (type, id, name) => `<${type}><Id>${id}</Id><Name>${name}</Name></${type}>`
  return {
    catalogueCalls: calls,
    async getCountries() {
      calls.push(['countries'])
      return { data: model('CountryModel', 1, 'South Africa') }
    },
    async getProvinces(input) {
      calls.push(['provinces', input])
      return { data: model('ProvinceModel', 1, 'Gauteng') }
    },
    async getCities(input) {
      calls.push(['cities', input])
      return { data: model('CityModel', 2473, town) }
    },
    async getSuburbs(input) {
      calls.push(['suburbs', input])
      return { data: model('SuburbModel', suburbId, suburb) + (duplicateSuburb ? model('SuburbModel', suburbId + 1, suburb) : '') }
    },
  }
}
