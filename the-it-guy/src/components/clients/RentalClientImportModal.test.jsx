// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RentalClientImportModal from './RentalClientImportModal'
import { listRentalImportContacts, saveRentalImportedContact } from '../../services/rentals/rentalClientImportRepository.js'
vi.mock('../../services/rentals/rentalClientImportRepository.js', async (importOriginal) => ({...await importOriginal(), listRentalImportContacts:vi.fn(),saveRentalImportedContact:vi.fn()}))
afterEach(() => {cleanup();vi.clearAllMocks()})
async function upload(csv) {
 const file = new File([csv], 'clients.csv', {type:'text/csv'});file.text = async () => csv
 fireEvent.change(screen.getByLabelText('Choose clients CSV'),{target:{files:[file]}})
 await waitFor(() => expect(screen.getByText('clients.csv')).toBeTruthy())
}
describe('rental clients import dialog', () => {
 it('previews contacts and resumes remaining rows after a save failure', async () => {
  listRentalImportContacts.mockResolvedValue([])
  saveRentalImportedContact.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Save failed')).mockResolvedValueOnce({})
  const onImported = vi.fn()
  render(<RentalClientImportModal organisationId="org" actorId="agent" onImported={onImported} onClose={vi.fn()} />)
  await upload('Name,Email,Contact Type\nAlex,alex@example.com,tenant\nRiver Trust,river@example.com,landlord')
  const start = await screen.findByRole('button',{name:'Import 2 contacts'})
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start)
  const retry = await screen.findByRole('button',{name:'Retry 1 contacts'})
  expect(screen.getByRole('alert').textContent).toContain('Save failed')
  expect(saveRentalImportedContact.mock.calls.map(([,row]) => row.name)).toEqual(['Alex','River Trust'])
  fireEvent.click(retry)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2 imported'))
  expect(saveRentalImportedContact.mock.calls.map(([,row]) => row.name)).toEqual(['Alex','River Trust','River Trust'])
  expect(saveRentalImportedContact.mock.calls[1][1].contactId).toBe(saveRentalImportedContact.mock.calls[2][1].contactId)
  expect(onImported).toHaveBeenCalledTimes(2)
 })
 it('blocks imports with invalid rows and exposes skipped duplicates', async () => {
  listRentalImportContacts.mockResolvedValue([{email:'old@example.com'}])
  render(<RentalClientImportModal organisationId="org" onClose={vi.fn()} />)
  await upload('Name,Email\nOld,old@example.com\nBad,bad-email')
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 duplicates skipped · 1 need correction'))
  expect(screen.getByRole('button',{name:'Import 0 contacts'}).disabled).toBe(true)
  expect(saveRentalImportedContact).not.toHaveBeenCalled()
 })
})
