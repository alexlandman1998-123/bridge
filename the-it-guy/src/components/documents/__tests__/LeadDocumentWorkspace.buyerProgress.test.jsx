import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LeadDocumentWorkspace from '../LeadDocumentWorkspace.jsx'

const categories = [{
  key: 'buyer', label: 'Buyer Documents', items: [
    { key: 'id', label: 'ID', required: true, state: 'review' },
    { key: 'address', label: 'Address', required: true, state: 'complete' },
  ],
}]
const getStatusMeta = (row) => ({ state: row.state, label: row.state, pillClass: '', iconClass: '' })

test('buyer uploads under review do not count as completed requirements', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="buyer" categories={categories} getStatusMeta={getStatusMeta} />)
  expect(html).toContain('1 of 2 complete')
  expect(html).toContain('1 outstanding')
})

test('seller review progress retains the existing behavior', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="seller" categories={categories} getStatusMeta={getStatusMeta} />)
  expect(html).toContain('2 of 2 complete')
})
