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

test('an upload progress bar belongs to the selected document row for buyers and sellers', () => {
  for (const partyType of ['buyer', 'seller']) {
    const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType={partyType} categories={categories} getStatusMeta={getStatusMeta} uploadProgress={{ stage: 'saving', message: 'Saving securely', fileName: 'ID.pdf', requirementKey: 'id' }} />)
    expect((html.match(/role="progressbar"/g) || []).length).toBe(1)
    expect(html.indexOf('Saving securely')).toBeGreaterThan(html.indexOf('id="lead-document-buyer-id"'))
    expect(html).toContain('Uploading ID.pdf')
  }
})

test('printable mandate entry is available only in seller Documents', () => {
  const props = { categories, getStatusMeta, createMandateAction: () => {} }
  expect(renderToStaticMarkup(<LeadDocumentWorkspace {...props} partyType="seller" />)).toContain('Create printable mandate')
  expect(renderToStaticMarkup(<LeadDocumentWorkspace {...props} partyType="buyer" />)).not.toContain('Create printable mandate')
})

test('buyer uploads under review do not count as completed requirements', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="buyer" categories={categories} getStatusMeta={getStatusMeta} />)
  expect(html).toContain('1 of 2 complete')
  expect(html).toContain('1 outstanding')
})

test('seller uploads under review remain outstanding', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="seller" categories={categories} getStatusMeta={getStatusMeta} />)
  expect(html).toContain('1 of 2 complete')
})

test('a submitted seller can reopen signing route review from Documents', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="seller" categories={categories} getStatusMeta={getStatusMeta} reviewSigningAction={() => {}} />)
  expect(html).toContain('Review signing routes')
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

test('a saved seller mandate under review remains visible beside zero completed requirements', () => {
  const html = renderToStaticMarkup(<LeadDocumentWorkspace partyType="seller" categories={[{key:'sales',label:'Sales',items:[{key:'signed_mandate',required:true,status:'under_review',originalDocument:{id:'00000000-0000-4000-8000-000000000001',storage_path:'listing/mandate.pdf',status:'under_review'}}]}]} getStatusMeta={() => ({state:'review',label:'Awaiting review',pillClass:''})} />)
  expect(html).toContain('0 of 1 complete')
  expect(html).toMatch(/1.*file.*saved/)
  expect(html).toContain('1 awaiting review')
})
