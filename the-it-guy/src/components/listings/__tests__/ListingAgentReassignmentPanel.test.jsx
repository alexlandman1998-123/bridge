import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ListingAgentReassignmentPanel from '../ListingAgentReassignmentPanel.jsx'

test('listing agent card renders before an agent directory match is loaded', () => {
  const html = renderToStaticMarkup(
    <ListingAgentReassignmentPanel
      listingId="listing-1"
      listing={{ id: 'listing-1', assignedAgentName: 'Avery Agent' }}
      agent={{ name: 'Avery Agent' }}
    />,
  )

  expect(html).toContain('Avery Agent')
  expect(html).toContain('listing-agent-reassignment')
})

test('listing agent card shows an unassigned state when no agent profile exists', () => {
  const html = renderToStaticMarkup(
    <ListingAgentReassignmentPanel listingId="listing-2" listing={{ id: 'listing-2' }} agent={null} />,
  )

  expect(html).toContain('Unassigned')
})
