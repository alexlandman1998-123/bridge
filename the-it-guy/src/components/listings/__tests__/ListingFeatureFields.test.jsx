// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import ListingFeatureFields from '../ListingFeatureFields'
import { mergeListingFeatureSelections, serializeListingFeatureFacts, setListingFeatureFact } from '../../../services/listings/listingFeatureCatalog'

afterEach(cleanup)

  function SavedFeatures() {
    const [facts, setFacts] = useState({ alarm: true, intercom: false, carports: 2 })
    return <><ListingFeatureFields facts={facts} presentation="cards" onChange={(key, value) => setFacts((previous) => setListingFeatureFact(previous, key, value))} /><output data-testid="saved">{JSON.stringify({ facts: serializeListingFeatureFacts(facts), selected: mergeListingFeatureSelections([], facts) })}</output></>
  }
it('keeps restored No answers and deliberately clears a Yes answer without losing other facts', () => {
  render(<SavedFeatures />)
  const alarm = screen.getByRole('group', { name: 'Alarm', hidden: true })
  const intercom = screen.getByRole('group', { name: 'Intercom', hidden: true })
  expect(within(intercom).getByText('No').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(within(alarm).getByText('No'))
  expect(JSON.parse(screen.getByTestId('saved').textContent)).toEqual({ facts: { alarm: false, intercom: false, carports: 2 }, selected: [] })
  fireEvent.click(within(alarm).getByText('Yes'))
  expect(JSON.parse(screen.getByTestId('saved').textContent).selected).toEqual(['alarm'])
  fireEvent.click(within(alarm).getByText('Unknown'))
  expect(JSON.parse(screen.getByTestId('saved').textContent)).toEqual({ facts: { alarm: 'unknown', intercom: false, carports: 2 }, selected: [] })
})
