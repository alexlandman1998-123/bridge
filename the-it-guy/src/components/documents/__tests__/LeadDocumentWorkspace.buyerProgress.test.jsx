// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
afterEach(cleanup)
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
  render(<LeadDocumentWorkspace {...props} partyType="seller" />)
  expect(screen.queryByRole('button', { name: 'Create printable mandate' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Seller documents' }))
  expect(screen.getByRole('button', { name: 'Create printable mandate' })).toBeTruthy()
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
  const review = vi.fn()
  render(<LeadDocumentWorkspace partyType="seller" categories={categories} getStatusMeta={getStatusMeta} reviewSigningAction={review} />)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Seller documents' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review signing routes' }))
  expect(review).toHaveBeenCalledOnce()
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

test('seller toolbar groups secondary actions and opens the shared request/upload dialog', () => {
  const manage = vi.fn(), portal = vi.fn()
  render(<LeadDocumentWorkspace partyType="seller" categories={categories} getStatusMeta={getStatusMeta} manageDocumentsAction={manage} portalAction={portal} portalActionDisabled />)
  expect(screen.queryByRole('button', { name: 'Manage document requirements' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Upload / Request document' }))
  expect(manage).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Seller documents' }))
  fireEvent.click(screen.getByRole('button', { name: 'Manage document requirements' }))
  expect(manage).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Seller documents' }))
  expect(screen.getByRole('button', { name: 'Send Seller Portal Link' }).disabled).toBe(true)
  expect(portal).not.toHaveBeenCalled()
})

test('seller document type tabs retain progress and reveal the matching saved file', () => {
  render(<LeadDocumentWorkspace partyType="seller" getStatusMeta={getStatusMeta} categories={[
    { key: 'property', label: 'Property Documents', items: [] },
    { key: 'seller', label: 'FICA', items: [{ key: 'identity', label: 'Seller ID', state: 'review' }] },
    { key: 'legal', label: 'Sale', items: [{ key: 'signed_mandate', label: 'Signed mandate', state: 'complete', fileName: 'mandate.pdf' }] },
  ]} />)
  expect(screen.getByText(/1 of 2 complete/)).toBeTruthy()
  expect(screen.getByText('Seller ID')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: /Sale/ }))
  expect(screen.queryByText('Seller ID')).toBeNull()
  expect(screen.getByText('Signed mandate')).toBeTruthy()
  expect(screen.getByText('mandate.pdf')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: /Property Documents/ }))
  expect(screen.getByText('No documents in this category yet.')).toBeTruthy()
})

test('signed review rows are green with inline decisions and still outstanding', () => {
  const review=vi.fn(),accept=vi.fn(),reject=vi.fn(),download=vi.fn()
  render(<LeadDocumentWorkspace partyType="seller" categories={[{key:'fica',label:'FICA',items:[{key:'signed_fica_declaration',label:'Signed FICA Declaration',required:true}]}]} getStatusMeta={()=>({state:'review',label:'Signed — awaiting agent review',signedAwaitingReview:true,pillClass:'bg-green-50'})}
    renderRowActions={()=><><button onClick={review}>Review</button><button onClick={reject}>Reject</button><button onClick={accept}>Accept</button></>}
    renderActions={()=><><button onClick={download}>Download</button><label>Upload / Replace<input type="file" aria-label="Replace FICA" /></label></>} />)
  expect(screen.getByText(/0 of 1 complete/)).toBeTruthy()
  expect(screen.getByText('Signed FICA Declaration').closest('[id^="lead-document-"]').className).toContain('bg-[#effaf3]')
  fireEvent.click(screen.getByRole('button',{name:'Review',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Reject',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Accept',exact:true}))
  expect(review).toHaveBeenCalledOnce();expect(reject).toHaveBeenCalledOnce();expect(accept).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button',{name:'Download',exact:true})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Signed FICA Declaration'}));fireEvent.click(screen.getByRole('button',{name:'Download',exact:true}))
  expect(download).toHaveBeenCalledOnce()
})
