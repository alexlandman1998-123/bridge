// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import TransactionPartyCapture from '../TransactionPartyCapture.jsx'
import TransactionPartyDocumentPreview from '../TransactionPartyDocumentPreview.jsx'
import { buildTransactionPartiesSnapshot, createTransactionPartyPerson } from '../../../core/transactions/transactionPartyProfile.js'

afterEach(cleanup)
function Capture({ initial }) {
  const [value, setValue] = useState(initial || { entityType: 'individual', name: '', registrationNumber: '', people: [createTransactionPartyPerson()] })
  return <><TransactionPartyCapture side="Buyer" value={value} onChange={setValue} /><TransactionPartyDocumentPreview parties={buildTransactionPartiesSnapshot({ buyer: value })} financeType="cash" /></>
}
it('captures marriage, spouse ownership and signing roles separately and updates documents', () => {
  render(<Capture />)
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Jane' } })
  fireEvent.change(screen.getByLabelText('Marital status'), { target: { value: 'married' } })
  fireEvent.change(screen.getByLabelText('Marriage regime'), { target: { value: 'in_community' } })
  expect(screen.getByText(/Marriage Certificate — Jane/i)).toBeTruthy()
  expect(screen.getByLabelText('Signs for this transaction').checked).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Add buyer person' }))
  const second = within(screen.getByRole('group', { name: 'Buyer person 2' }))
  fireEvent.change(second.getByLabelText("Person's role"), { target: { value: 'spouse' } })
  fireEvent.change(second.getByLabelText('Full name'), { target: { value: 'Pat' } })
  fireEvent.change(second.getByLabelText('Spouse of'), { target: { value: screen.getByRole('option', { name: 'Jane' }).value } })
  expect(screen.getByText(/Spouse ID — Pat/i)).toBeTruthy()
  fireEvent.click(second.getByRole('button', { name: 'Remove person' }))
  expect(screen.queryByRole('group', { name: 'Buyer person 2' })).toBeNull()
})
it('keeps entity registration separate from trustee identity and shows trust documents', () => {
  render(<Capture initial={{ entityType: 'trust', name: '', registrationNumber: '', people: [{ ...createTransactionPartyPerson('trustee'), name: 'Jane Trustee' }] }} />)
  fireEvent.change(screen.getByLabelText('Buyer registered entity name'), { target: { value: 'Example Trust' } })
  fireEvent.change(screen.getByLabelText('Registration number / estate reference'), { target: { value: 'IT123/2026' } })
  expect(screen.getByLabelText('Full name').value).toBe('Jane Trustee')
  expect(screen.getByText(/Trust Deed/i)).toBeTruthy()
  expect(screen.getByText(/Trustee FICA — Jane Trustee/i)).toBeTruthy()
})
