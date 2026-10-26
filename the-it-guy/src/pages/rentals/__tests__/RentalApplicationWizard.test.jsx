// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RentalApplicationWizard from '../../../modules/rentals/shared/applications/RentalApplicationWizard.jsx'
import { initialiseRentalApplicationWizard } from '../../../services/rentals/rentalApplicationWizardModel.js'
afterEach(cleanup)
function Harness({ onSave, readOnly, initialData }) {
  const [data, setData] = useState(() => initialiseRentalApplicationWizard(initialData || { identity: { firstName: 'Primary' }, employment: { employmentType: 'employed', employer: 'Saved employer' } }))
  return <><RentalApplicationWizard data={data} onChange={setData} onSave={onSave} readOnly={readOnly} /><output data-testid="data">{JSON.stringify(data)}</output></>
}
it('changes conditional employment questions without discarding hidden saved answers', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Employment/ }))
  expect(screen.getByLabelText('Employer').value).toBe('Saved employer')
  fireEvent.change(screen.getByLabelText('Employment type'), { target: { value: 'self_employed' } })
  expect(screen.queryByLabelText('Employer')).toBeNull(); expect(screen.getByLabelText('Business name')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Employment type'), { target: { value: 'student' } })
  expect(screen.getByLabelText('Institution')).toBeTruthy(); expect(screen.getByLabelText('Income source')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Employment type'), { target: { value: 'employed' } })
  expect(screen.getByLabelText('Employer').value).toBe('Saved employer')
})
it('adds a person with a stable ID, uses Yes/No cards and removes only that person', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
  let data = JSON.parse(screen.getByTestId('data').textContent)
  const id = data.people[0].id; expect(id).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Application role'), { target: { value: 'co_tenant' } })
  expect(screen.queryByLabelText('Monthly income')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /Contributes to affordability: Yes/ }))
  fireEvent.change(screen.getByLabelText('Monthly income'), { target: { value: '20000' } })
  data = JSON.parse(screen.getByTestId('data').textContent)
  expect(data.people[0]).toMatchObject({ id, role: 'co_tenant', contributesToAffordability: true, monthlyIncome: '20000' })
  fireEvent.click(screen.getByRole('button', { name: 'Remove person 1' }))
  data = JSON.parse(screen.getByTestId('data').textContent)
  expect(data.people).toEqual([]); expect(data.identity.firstName).toBe('Primary')
})
it('uses Yes/No for pets and retains pet details while hidden', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Household & property/ }))
  fireEvent.click(screen.getByRole('radio', { name: /Pets: Yes/ }))
  fireEvent.change(screen.getByLabelText('Pet details'), { target: { value: 'One cat' } })
  fireEvent.click(screen.getByRole('radio', { name: /Pets: No/ }))
  expect(screen.queryByLabelText('Pet details')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /Pets: Yes/ }))
  expect(screen.getByLabelText('Pet details').value).toBe('One cat')
})
it('prevents editing a submitted application while keeping the steps readable', () => {
  render(<Harness readOnly onSave={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Company' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  expect(screen.getByLabelText('First name').disabled).toBe(true)
})

it('invalidates the saved representative assignment when their identity is edited or they are removed', () => {
  render(<Harness initialData={{ entity: { type: 'company' }, people: [{ id: 's', role: 'authorised_signatory', firstName: 'Sam', identityNumber: 'A' }], documentLinks: [{ documentId: 'signer', subjectId: 's', purpose: 'identity' }, { documentId: 'authority', subjectId: 'entity', purpose: 'authority' }] }} />)
  fireEvent.click(screen.getByRole('button', { name: /People & contacts/ }))
  fireEvent.change(screen.getAllByLabelText('ID / passport number')[1], { target: { value: 'B' } })
  let data = JSON.parse(screen.getByTestId('data').textContent)
  expect(data.documentLinks.every((link) => link.invalidated)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove person 1' }))
  data = JSON.parse(screen.getByTestId('data').textContent)
  expect(data.documentLinks.every((link) => link.invalidated)).toBe(true)
  expect(data.people).toEqual([])
})

it('captures occupants separately from applicants and reviews real answers with edit links', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Household & property/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add occupant' }))
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Resident' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Will sign the lease: No' }))
  expect(JSON.parse(screen.getByTestId('data').textContent).people).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: /Review & declarations/ }))
  expect(screen.getByText('Resident')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Household & property' }))
  expect(screen.getByLabelText('Last name').value).toBe('Resident')
})
it('keeps contract end date conditional and retains it when changing arrangements', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Employment/ }))
  fireEvent.change(screen.getByLabelText('Employment arrangement'), { target: { value: 'fixed_term' } })
  fireEvent.change(screen.getByLabelText('Contract end date'), { target: { value: '2027-06-30' } })
  fireEvent.change(screen.getByLabelText('Employment arrangement'), { target: { value: 'permanent' } })
  expect(screen.queryByLabelText('Contract end date')).toBeNull()
  fireEvent.change(screen.getByLabelText('Employment arrangement'), { target: { value: 'fixed_term' } })
  expect(screen.getByLabelText('Contract end date').value).toBe('2027-06-30')
})
