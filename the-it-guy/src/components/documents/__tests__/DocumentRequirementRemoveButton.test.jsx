// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DocumentRequirementRemoveButton, { documentRemovalRequirementId } from '../DocumentRequirementRemoveButton.jsx'
import LeadDocumentWorkspace from '../LeadDocumentWorkspace.jsx'
vi.mock('../DocumentRequirementManager.jsx', () => ({ default: props => <div role="dialog" aria-label={props.documentLabel} data-context={props.contextType} data-context-id={props.contextId} data-requirement={props.initialRequirementId}><button onClick={props.onClose}>Cancel</button></div> }))
afterEach(cleanup)
const client = {}

test('lead row cross opens the exact buyer requirement in its lead workspace', () => {
  render(<LeadDocumentWorkspace partyType="buyer" categories={[{ key: 'identity', label: 'Identity', items: [{ id: 'legacy', canonicalRequirementInstanceId: 'canonical', label: 'ID document' }] }]} getStatusMeta={() => ({ label: 'Required', pillClass: '' })} removalContext={{ client, contextType: 'buyer_lead', contextId: 'lead', party: 'buyer' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark ID document as not relevant' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog.getAttribute('data-context')).toBe('buyer_lead')
  expect(dialog.getAttribute('data-context-id')).toBe('lead')
  expect(dialog.getAttribute('data-requirement')).toBe('canonical')
})

test('transaction row resolves its nested requirement rather than the uploaded file ID', () => {
  const row = { id: 'library-row', displayName: 'Title deed', requirement: { id: 'legacy', canonical_requirement_instance_id: 'canonical' }, raw: { id: 'file' } }
  render(<DocumentRequirementRemoveButton row={row} client={client} contextType="transaction" contextId="matter" />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark Title deed as not relevant' }))
  expect(screen.getByRole('dialog').getAttribute('data-requirement')).toBe('canonical')
  expect(screen.getByRole('dialog').getAttribute('data-context')).toBe('transaction')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('unlinked files cannot be mistaken for requirement IDs and navigation closes the old dialog', () => {
  expect(documentRemovalRequirementId({ id: 'file', source: 'document' })).toBe('')
  const props = { row: { id: 'requirement', sharedRequirement: true, label: 'Mandate' }, client, contextType: 'seller_lead', contextId: 'lead-one' }
  const view = render(<DocumentRequirementRemoveButton {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark Mandate as not relevant' }))
  view.rerender(<DocumentRequirementRemoveButton {...props} contextId="lead-two" />)
  expect(screen.queryByRole('dialog')).toBeNull()
})
