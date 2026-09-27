import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LeadDocumentWorkspace from '../LeadDocumentWorkspace.jsx'
import { summarizeLeadDocumentCategory } from '../leadDocumentProgressModel.js'

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

test('seller uploads under review remain outstanding', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="seller" categories={categories} getStatusMeta={getStatusMeta} />)
  expect(html).toContain('1 of 2 complete')
})

test('optional seller documents remain visible without changing either view’s progress', () => {
  const legalItems = [
    { key: 'signed_mandate', label: 'Signed Mandate', required: true, state: 'pending' },
    { key: 'signed_disclosure_form', label: 'Disclosure Form', required: true, state: 'complete' },
    { key: 'signed_fica_declaration', label: 'FICA Declaration', required: true, state: 'pending' },
    { key: 'optional_certificate', label: 'Optional Certificate', required: false, state: 'complete' },
  ]
  const progress = summarizeLeadDocumentCategory(legalItems, { getStatusMeta, partyType: 'seller' })
  const html = renderToStaticMarkup(<LeadDocumentWorkspace
    partyType="seller"
    categories={[{ key: 'legal', label: 'Legal Documents', items: legalItems, ...progress }]}
    getStatusMeta={getStatusMeta}
  />)

  expect(progress).toEqual({ completed: 1, total: 3, progress: 33 })
  expect(html).toContain('1 of 3 complete')
  expect(html).toContain('2 outstanding')
  expect(html).toContain('Optional Certificate')
})
