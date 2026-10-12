import { describe, expect, it } from 'vitest'
import { listingRelistEditorPath, listingRelistReturnPath, relistChannelFromSearch } from '../listingRelistNavigation.js'

describe('update and relist navigation', () => {
  it.each(['Property24', 'Private Property'])('keeps %s selected through editing and saved return', channel => {
    const editor = new URL(listingRelistEditorPath('listing-123', channel), 'https://arch9.test')
    expect(editor.pathname).toBe('/listings/listing-123/edit')
    expect(editor.searchParams.get('step')).toBe('property')
    expect(editor.searchParams.get('scope')).toBe('listing-publication')
    expect(relistChannelFromSearch(editor.search)).toBe(channel)
    const savedReturn = new URL(listingRelistReturnPath('listing-123', relistChannelFromSearch(editor.search)), editor)
    expect(savedReturn.pathname).toBe('/agent/listings/listing-123')
    expect(savedReturn.searchParams.get('tab')).toBe('marketing')
    expect(relistChannelFromSearch(savedReturn.search)).toBe(channel)
    savedReturn.searchParams.delete('relist')
    expect(relistChannelFromSearch(savedReturn.search)).toBe('')
  })
  it.each(['', '?relist=agency_website', '?relist=anything', '?relist=Property24'])('ignores unrecognised intents: %s', search => {
    expect(relistChannelFromSearch(search)).toBe('')
  })
  it('keeps ordinary editing free of relist intent', () => {
    expect(listingRelistEditorPath('listing-123')).not.toContain('relist=')
    expect(listingRelistReturnPath('listing-123')).toBe('/agent/listings/listing-123?tab=marketing')
  })
})
