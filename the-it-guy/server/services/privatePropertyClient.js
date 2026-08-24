import { createHash, randomBytes } from 'node:crypto'

export const PRIVATE_PROPERTY_SANDBOX_BASE_URL = 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx'
export const PRIVATE_PROPERTY_DEFAULT_TIMEOUT_MS = 25000

export class PrivatePropertySoapError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'PrivatePropertySoapError'
    this.status = details.status || null
    this.statusText = details.statusText || ''
    this.method = details.method || ''
    this.responseBody = details.responseBody || ''
    this.faultCode = details.faultCode || ''
    this.faultString = details.faultString || ''
  }
}

export function normalizePrivatePropertyText(value = '') {
  return String(value || '').trim()
}

export function normalizePrivatePropertyBaseUrl(value = PRIVATE_PROPERTY_SANDBOX_BASE_URL) {
  const baseUrl = normalizePrivatePropertyText(value) || PRIVATE_PROPERTY_SANDBOX_BASE_URL
  return baseUrl.replace(/\/+$/g, '')
}

export function escapePrivatePropertyXml(value = '') {
  return normalizePrivatePropertyText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function createPrivatePropertyTimestamp(date = new Date()) {
  const localDate = new Date(date.getTime() + 2 * 60 * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return [
    localDate.getUTCFullYear(),
    '-',
    pad(localDate.getUTCMonth() + 1),
    '-',
    pad(localDate.getUTCDate()),
    'T',
    pad(localDate.getUTCHours()),
    ':',
    pad(localDate.getUTCMinutes()),
    ':',
    pad(localDate.getUTCSeconds()),
    '+02:00',
  ].join('')
}

export function createPrivatePropertyToken({
  username,
  password,
  uid = randomBytes(12).toString('hex'),
  stampTime = createPrivatePropertyTimestamp(),
  expires = createPrivatePropertyTimestamp(new Date(Date.now() + 30 * 60 * 1000)),
} = {}) {
  const user = normalizePrivatePropertyText(username)
  const pass = normalizePrivatePropertyText(password)
  const tokenUid = normalizePrivatePropertyText(uid)
  const tokenStampTime = normalizePrivatePropertyText(stampTime)
  const tokenExpires = normalizePrivatePropertyText(expires)

  if (!user) throw new Error('Private Property username is required.')
  if (!pass) throw new Error('Private Property password is required.')
  if (!tokenUid) throw new Error('Private Property token UID is required.')
  if (!tokenStampTime) throw new Error('Private Property token StampTime is required.')
  if (!tokenExpires) throw new Error('Private Property token Expires is required.')

  const digestInput = `${tokenUid}${tokenStampTime}${pass}${tokenExpires}`
  const digest = createHash('sha1').update(digestInput, 'utf8').digest('base64')

  return {
    digest,
    userName: user,
    stampTime: tokenStampTime,
    expires: tokenExpires,
    uid: tokenUid,
  }
}

export function privatePropertyTokenToXml(token = {}) {
  return [
    '<Token>',
    `<Digest>${escapePrivatePropertyXml(token.digest)}</Digest>`,
    `<UserName>${escapePrivatePropertyXml(token.userName)}</UserName>`,
    `<StampTime>${escapePrivatePropertyXml(token.stampTime)}</StampTime>`,
    `<Expires>${escapePrivatePropertyXml(token.expires)}</Expires>`,
    `<UID>${escapePrivatePropertyXml(token.uid)}</UID>`,
    '</Token>',
  ].join('')
}

export function buildPrivatePropertyAgentXml(agent = {}) {
  const branchId = normalizePrivatePropertyText(agent.branchId || agent.BranchId)
  const agentId = normalizePrivatePropertyText(agent.agentId || agent.AgentId)
  const email = normalizePrivatePropertyText(agent.email || agent.Email)
  const firstName = normalizePrivatePropertyText(agent.firstName || agent.FirstName)
  const lastName = normalizePrivatePropertyText(agent.lastName || agent.LastName)
  const telCell = normalizePrivatePropertyText(agent.telCell || agent.mobile || agent.TelCell)
  const telHome = normalizePrivatePropertyText(agent.telHome || agent.TelHome)
  const telWork = normalizePrivatePropertyText(agent.telWork || agent.workPhone || agent.TelWork || telCell)
  const privysealAlias = normalizePrivatePropertyText(agent.privysealAlias || agent.PrivysealAlias)
  const privatePropertyAgentId = normalizePrivatePropertyText(agent.privatePropertyAgentId || agent.PrivatePropertyAgentId)
  const active = agent.active === undefined || agent.active === null ? true : Boolean(agent.active)

  return [
    '<Agent>',
    `<Email>${escapePrivatePropertyXml(email)}</Email>`,
    `<FirstName>${escapePrivatePropertyXml(firstName)}</FirstName>`,
    `<LastName>${escapePrivatePropertyXml(lastName)}</LastName>`,
    `<AgentId>${escapePrivatePropertyXml(agentId)}</AgentId>`,
    `<PrivysealAlias>${escapePrivatePropertyXml(privysealAlias)}</PrivysealAlias>`,
    `<Active>${active ? 'true' : 'false'}</Active>`,
    `<TelCell>${escapePrivatePropertyXml(telCell)}</TelCell>`,
    `<TelHome>${escapePrivatePropertyXml(telHome)}</TelHome>`,
    `<TelWork>${escapePrivatePropertyXml(telWork)}</TelWork>`,
    `<BranchId>${escapePrivatePropertyXml(branchId)}</BranchId>`,
    `<PrivatePropertyAgentId>${escapePrivatePropertyXml(privatePropertyAgentId)}</PrivatePropertyAgentId>`,
    '</Agent>',
  ].join('')
}

export function buildPrivatePropertySoapEnvelope(method, innerXml = '', { soapPrefix = 'soap12' } = {}) {
  const normalizedMethod = normalizePrivatePropertyText(method)
  if (!normalizedMethod) throw new Error('Private Property SOAP method is required.')
  const prefix = normalizePrivatePropertyText(soapPrefix) || 'soap12'
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<${prefix}:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:${prefix}="http://www.w3.org/2003/05/soap-envelope">`,
    `<${prefix}:Body>`,
    `<${normalizedMethod} xmlns="http://tempuri.org/">`,
    innerXml || '',
    `</${normalizedMethod}>`,
    `</${prefix}:Body>`,
    `</${prefix}:Envelope>`,
  ].join('')
}

function decodeXmlText(value = '') {
  return normalizePrivatePropertyText(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

export function extractPrivatePropertyXmlTag(xml = '', tagName = '') {
  const tag = normalizePrivatePropertyText(tagName)
  if (!tag) return ''
  const pattern = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i')
  const match = String(xml || '').match(pattern)
  return match ? decodeXmlText(match[1]) : ''
}

export function extractPrivatePropertyXmlBlocks(xml = '', tagName = '') {
  const tag = normalizePrivatePropertyText(tagName)
  if (!tag) return []
  const pattern = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'gi')
  return [...String(xml || '').matchAll(pattern)].map((match) => match[1])
}

export function extractPrivatePropertySoapFault(xml = '') {
  const faultCode = extractPrivatePropertyXmlTag(xml, 'faultcode') || extractPrivatePropertyXmlTag(xml, 'Code')
  const faultString = extractPrivatePropertyXmlTag(xml, 'faultstring') || extractPrivatePropertyXmlTag(xml, 'Reason')
  if (!faultCode && !faultString && !String(xml || '').includes(':Fault') && !String(xml || '').includes('<Fault')) return null
  return { faultCode, faultString }
}

export function summarizePrivatePropertySoapResponse(method = '', xml = '') {
  const normalizedMethod = normalizePrivatePropertyText(method)
  const continuationKey = extractPrivatePropertyXmlTag(xml, 'ContinuationKey')
  const resultText = normalizedMethod ? extractPrivatePropertyXmlTag(xml, `${normalizedMethod}Result`) : ''
  const feedEventMatches = String(xml || '').match(/<LisitngEventFeedData\b|<ListingEventFeedData\b/gi) || []
  return {
    method: normalizedMethod,
    responseChars: String(xml || '').length,
    resultText: resultText ? resultText.slice(0, 240) : '',
    continuationKey: continuationKey || '',
    listingEventCount: feedEventMatches.length,
  }
}

export function createPrivatePropertyClient({
  baseUrl = PRIVATE_PROPERTY_SANDBOX_BASE_URL,
  username,
  password,
  timeoutMs = PRIVATE_PROPERTY_DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  tokenFactory = createPrivatePropertyToken,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')
  const normalizedBaseUrl = normalizePrivatePropertyBaseUrl(baseUrl)
  const user = normalizePrivatePropertyText(username)
  const pass = normalizePrivatePropertyText(password)
  if (!user) throw new Error('Private Property username is required.')
  if (!pass) throw new Error('Private Property password is required.')

  async function callSoap(method, innerXml = '', { soapAction = `http://tempuri.org/${method}` } = {}) {
    const normalizedMethod = normalizePrivatePropertyText(method)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = Date.now()
    const body = buildPrivatePropertySoapEnvelope(normalizedMethod, innerXml)

    try {
      const response = await fetchImpl(normalizedBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          ...(soapAction ? { SOAPAction: `"${soapAction}"` } : {}),
        },
        body,
        signal: controller.signal,
      })
      const responseBody = await response.text().catch(() => '')
      const fault = extractPrivatePropertySoapFault(responseBody)

      if (!response.ok || fault) {
        throw new PrivatePropertySoapError(
          fault?.faultString || `Private Property ${normalizedMethod} failed with ${response.status}.`,
          {
            status: response.status,
            statusText: response.statusText,
            method: normalizedMethod,
            responseBody,
            faultCode: fault?.faultCode || '',
            faultString: fault?.faultString || '',
          },
        )
      }

      return {
        ok: true,
        status: response.status,
        durationMs: Date.now() - startedAt,
        method: normalizedMethod,
        requestBody: body,
        data: responseBody,
        summary: summarizePrivatePropertySoapResponse(normalizedMethod, responseBody),
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new PrivatePropertySoapError(`Private Property ${normalizedMethod} timed out after ${timeoutMs}ms.`, {
          method: normalizedMethod,
        })
      }
      if (error.name === 'TypeError' && error.message === 'fetch failed') {
        const causeCode = normalizePrivatePropertyText(error.cause?.code)
        const causeMessage = normalizePrivatePropertyText(error.cause?.message)
        throw new PrivatePropertySoapError(
          `Private Property ${normalizedMethod} connection failed${causeCode ? ` (${causeCode})` : ''}${causeMessage ? `: ${causeMessage}` : '.'}`,
          {
            method: normalizedMethod,
          },
        )
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  function tokenXml() {
    return privatePropertyTokenToXml(tokenFactory({ username: user, password: pass }))
  }

  return {
    baseUrl: normalizedBaseUrl,
    callSoap,
    createToken: (options = {}) => tokenFactory({ username: user, password: pass, ...options }),
    getCountries: () => callSoap('GetCountries', tokenXml()),
    updateAgent: (agent = {}) => callSoap('UpdateAgent', [
      buildPrivatePropertyAgentXml(agent),
      tokenXml(),
    ].join('')),
    updateAgentImage: ({ agent = {}, imageUrl = '' } = {}) => {
      const normalizedImageUrl = normalizePrivatePropertyText(imageUrl)
      if (!normalizedImageUrl) throw new Error('Private Property agent image URL is required.')
      return callSoap('UpdateAgentImage', [
        buildPrivatePropertyAgentXml(agent),
        `<imgurl>${escapePrivatePropertyXml(normalizedImageUrl)}</imgurl>`,
        tokenXml(),
      ].join(''))
    },
    updateListing: (listingImportXml = '') => {
      const xml = normalizePrivatePropertyText(listingImportXml)
      if (!xml) throw new Error('Private Property ListingImport XML is required.')
      if (!/<ListingImport(?:\s|>)/i.test(xml)) throw new Error('Private Property ListingImport XML must include <ListingImport>.')
      return callSoap('UpdateListing', [
        xml,
        tokenXml(),
      ].join(''))
    },
    getProvinces: ({ countryId } = {}) => {
      const id = Number(countryId)
      if (!Number.isFinite(id) || id <= 0) throw new Error('Private Property country ID is required.')
      return callSoap('GetProvinces', [
        `<CountryId>${Math.round(id)}</CountryId>`,
        tokenXml(),
      ].join(''))
    },
    getCities: ({ provinceId } = {}) => {
      const id = Number(provinceId)
      if (!Number.isFinite(id) || id <= 0) throw new Error('Private Property province ID is required.')
      return callSoap('GetCities', [
        `<ProvinceID>${Math.round(id)}</ProvinceID>`,
        tokenXml(),
      ].join(''))
    },
    getSuburbs: ({ cityId } = {}) => {
      const id = Number(cityId)
      if (!Number.isFinite(id) || id <= 0) throw new Error('Private Property city ID is required.')
      return callSoap('GetSuburbs', [
        `<CityID>${Math.round(id)}</CityID>`,
        tokenXml(),
      ].join(''))
    },
    getListingStatus: ({ branchGuid, propertyId } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      const id = normalizePrivatePropertyText(propertyId)
      if (!guid) throw new Error('Private Property branch GUID is required.')
      if (!id) throw new Error('Private Property property ID is required.')
      return callSoap('GetListingStatus', [
        `<BranchId>${escapePrivatePropertyXml(guid)}</BranchId>`,
        `<PropertyId>${escapePrivatePropertyXml(id)}</PropertyId>`,
        tokenXml(),
      ].join(''))
    },
    getListingStatusVerbose: ({ branchGuid, propertyId } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      const id = normalizePrivatePropertyText(propertyId)
      if (!guid) throw new Error('Private Property branch GUID is required.')
      if (!id) throw new Error('Private Property property ID is required.')
      return callSoap('GetListingStatusVerbose', [
        `<BranchId>${escapePrivatePropertyXml(guid)}</BranchId>`,
        `<PropertyId>${escapePrivatePropertyXml(id)}</PropertyId>`,
        tokenXml(),
      ].join(''))
    },
    getReferenceNumberByListing: ({ branchGuid, uniqueListingId, listingType = 'Sale' } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      const id = normalizePrivatePropertyText(uniqueListingId)
      const type = normalizePrivatePropertyText(listingType) || 'Sale'
      if (!guid) throw new Error('Private Property branch GUID is required.')
      if (!id) throw new Error('Private Property unique listing ID is required.')
      return callSoap('GetReferenceNumberByListing', [
        `<BranchId>${escapePrivatePropertyXml(guid)}</BranchId>`,
        `<UniqueListingID>${escapePrivatePropertyXml(id)}</UniqueListingID>`,
        `<listingType>${escapePrivatePropertyXml(type)}</listingType>`,
        tokenXml(),
      ].join(''))
    },
    getListingsDetails: ({ branchGuid, uniqueListingId } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      const id = normalizePrivatePropertyText(uniqueListingId)
      if (!guid) throw new Error('Private Property branch GUID is required.')
      if (!id) throw new Error('Private Property unique listing ID is required.')
      return callSoap('GetListingsDetails', [
        `<BranchId>${escapePrivatePropertyXml(guid)}</BranchId>`,
        `<UniqueListingID>${escapePrivatePropertyXml(id)}</UniqueListingID>`,
        tokenXml(),
      ].join(''))
    },
    getActiveListings: ({ branchGuid } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      if (!guid) throw new Error('Private Property branch GUID is required.')
      return callSoap('GetActiveListings', [
        `<BranchId>${escapePrivatePropertyXml(guid)}</BranchId>`,
        tokenXml(),
      ].join(''))
    },
    listingStatusUpdate: ({ branchGuid, propertyId, listingType = 'Sale', propertyStatus = 'ForSale' } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      const id = normalizePrivatePropertyText(propertyId)
      const type = normalizePrivatePropertyText(listingType) || 'Sale'
      const status = normalizePrivatePropertyText(propertyStatus) || 'ForSale'
      if (!guid) throw new Error('Private Property branch GUID is required.')
      if (!id) throw new Error('Private Property property ID is required.')
      return callSoap('ListingStatusUpdate', [
        `<BranchId>${escapePrivatePropertyXml(guid)}</BranchId>`,
        `<PropertyId>${escapePrivatePropertyXml(id)}</PropertyId>`,
        `<ListingType>${escapePrivatePropertyXml(type)}</ListingType>`,
        `<PropertyStatus>${escapePrivatePropertyXml(status)}</PropertyStatus>`,
        tokenXml(),
      ].join(''))
    },
    getListingEventFeedByBranch: ({ branchGuid, continuationKey = '0', startDateTime = '' } = {}) => {
      const guid = normalizePrivatePropertyText(branchGuid)
      if (!guid) throw new Error('Private Property branch GUID is required.')
      const startDateXml = normalizePrivatePropertyText(startDateTime)
        ? `<startDateTime>${escapePrivatePropertyXml(startDateTime)}</startDateTime>`
        : '<startDateTime xsi:nil="true" />'
      return callSoap('GetListingEventFeedByBranch', [
        `<UniqueBranchId>${escapePrivatePropertyXml(guid)}</UniqueBranchId>`,
        tokenXml(),
        `<continuationKey>${escapePrivatePropertyXml(continuationKey || '0')}</continuationKey>`,
        startDateXml,
      ].join(''))
    },
  }
}
