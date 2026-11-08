import { expect, it } from 'vitest'
import { DEFAULT_DEVELOPMENT_PROFILE, normalizeMarketingContent, normalizeDevelopmentProfile, getDevelopmentProfileCoverImage } from '../profileNormalization'
it('preserves legacy marketing JSON and saved enquiry-facing titles', () => {
  const result = normalizeMarketingContent(JSON.stringify({ listing_title: '  Saved title  ' }))
  expect(result.listingOverview.listingTitle).toBe('Saved title')
})
it('handles unreadable or array marketing content without mutating shared defaults', () => {
  const before = structuredClone(DEFAULT_DEVELOPMENT_PROFILE)
  for (const input of [null, 'not-json', [], '[]']) expect(normalizeMarketingContent(input).listingOverview.listingTitle).toBe('')
  expect(DEFAULT_DEVELOPMENT_PROFILE).toEqual(before)
})
it('retains profile location fields, numeric coordinates and original cover precedence', () => {
  const profile = normalizeDevelopmentProfile({ country: '', latitude: '-33.9', longitude: '18.4', formatted_address: 'Saved address', image_links: ['fallback.jpg'], marketing_content: { media_library: { cover_image_url: 'cover.jpg' } } })
  expect(profile).toMatchObject({ country: 'South Africa', latitude: -33.9, longitude: 18.4, formattedAddress: 'Saved address' })
  expect(getDevelopmentProfileCoverImage(profile)).toBe('cover.jpg')
})
