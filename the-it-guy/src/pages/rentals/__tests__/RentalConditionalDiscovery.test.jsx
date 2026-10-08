// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RentalLandlordDiscoveryForm from '../../../modules/rentals/shared/applications/RentalLandlordDiscoveryForm.jsx'
import RentalApplicationDocuments from '../../../modules/rentals/shared/applications/RentalApplicationDocuments.jsx'
import RentalListingDocumentsPanel from '../RentalListingDocumentsPanel.jsx'
import { publicRentalLandlordDiscovery, mergeRentalLandlordDiscovery } from '../../../services/rentals/rentalLandlordOnboardingModel.js'
import { normalizeLandlordProperty } from '../../../services/rentals/rentalLandlordWorkspaceModel.js'
import { rentalLandlordRequirementDefinitions } from '../../../services/rentals/rentalOnboardingRequirementModel.js'
import { buildRentalListingLandlordMatrix } from '../../../services/rentals/rentalListingDocumentMatrixModel.js'
afterEach(cleanup)
const data = { profile: { type: 'individual', name: 'Owner' }, portfolio: [{ id: 'home', title: 'Home', address: 'One Road', listingId: 'listing', serviceType: 'letting_only', canonicalPropertyId: 'private-property', currentTenant: 'private-tenant' }] }
function Discovery() {
  const [value, setValue] = useState(publicRentalLandlordDiscovery(data))
  return <RentalLandlordDiscoveryForm data={value} onChange={setValue} />
}
it('offers explicit landlord branches and shows payout questions only for managed rentals', () => {
  render(<Discovery />)
  expect(screen.queryByLabelText('Property 1 Payout Account Holder')).toBeNull()
  fireEvent.change(screen.getByLabelText('Property 1 Service Type'), { target: { value: 'managed_rental' } })
  fireEvent.change(screen.getByLabelText('Property 1 Payout Beneficiary Type'), { target: { value: 'third_party' } })
  fireEvent.change(screen.getByLabelText('Property 1 Payout Account Holder'), { target: { value: 'Trustee' } })
  fireEvent.change(screen.getByLabelText('Property 1 Service Type'), { target: { value: 'letting_only' } })
  expect(screen.queryByLabelText('Property 1 Payout Account Holder')).toBeNull()
  fireEvent.change(screen.getByLabelText('Property 1 Service Type'), { target: { value: 'managed_rental' } })
  expect(screen.getByLabelText('Property 1 Payout Account Holder').value).toBe('Trustee')
})
it('persists the same conditional answers across public and agent capture without exposing internal links', () => {
  const publicData = publicRentalLandlordDiscovery(data)
  const property = { ...publicData.portfolio[0], serviceType: 'managed_rental', schemeType: 'hoa', payoutBeneficiaryType: 'third_party', payoutAccountHolder: 'Trustee' }
  const saved = mergeRentalLandlordDiscovery(data, { portfolio: [property] }, { publicSource: true })
  expect(publicData.portfolio[0].listingId).toBeUndefined()
  expect(publicData.portfolio[0].currentTenant).toBeUndefined()
  expect(saved.portfolio[0]).toMatchObject({ listingId: 'listing', currentTenant: 'private-tenant', serviceType: 'managed_rental' })
  const agent = { profile: data.profile, portfolio: [normalizeLandlordProperty({ ...data.portfolio[0], ...property })] }
  expect(rentalLandlordRequirementDefinitions(saved).map((row) => row.key).sort()).toEqual(rentalLandlordRequirementDefinitions(agent).map((row) => row.key).sort())
  expect(() => mergeRentalLandlordDiscovery(data, { portfolio: [{ ...property, serviceType: 'forged' }] }, { publicSource: true })).toThrow('valid service type')
  expect(() => normalizeLandlordProperty({ ...property, payoutBeneficiaryType: true })).toThrow('valid rental service')
})
it('previews current tenant entity, trust and named-person rules but displays only saved rows after save', () => {
  const tenant = { entity: { type: 'trust' }, people: [{ id: 'trustee', firstName: 'Sam', role: 'trustee' }] }
  const view = render(<RentalApplicationDocuments data={tenant} preview onUpload={() => {}} />)
  expect(screen.getByLabelText('Upload Entity: Letters of Authority')).toBeTruthy()
  expect(screen.getByLabelText('Upload Sam: authority to act')).toBeTruthy()
  expect(screen.getByLabelText('Upload Entity: ownership and control evidence')).toBeTruthy()
  view.rerender(<RentalApplicationDocuments data={tenant} requirements={[{ id: 'saved-id', generation: 1, active: true, mode: 'active', scopeKey: 'application', subjectId: 'primary', purpose: 'identity', required: true }]} onUpload={() => {}} />)
  expect(screen.getByLabelText('Upload Primary applicant identity')).toBeTruthy()
  expect(screen.queryByLabelText('Upload Entity: Letters of Authority')).toBeNull()
})
it('explains saved conditional rows and flags unresolved landlord or commercial discovery for review', () => {
  const discovery = { ...data, portfolio: [{ ...data.portfolio[0], serviceType: 'managed_rental', schemeType: 'hoa', category: 'commercial' }] }
  const requirements = rentalLandlordRequirementDefinitions(discovery).map((row, index) => ({ ...row, id: `row-${index}`, active: true, mode: 'preview', state: 'missing' }))
  const matrix = buildRentalListingLandlordMatrix({ id: 'listing' }, { id: 'lead' }, { data: discovery, requirements })
  const view = render(<RentalListingDocumentsPanel snapshot={{ documents: [], issues: [], documentMatrix: { landlords: [matrix], tenants: [], issues: [] } }} />)
  expect(screen.getByText(/Rental management includes paying proceeds/)).toBeTruthy()
  expect(screen.getByText(/needs a use-specific review/)).toBeTruthy()
  expect(screen.getByText('No active requirements')).toBeTruthy()
  const exceptional = buildRentalListingLandlordMatrix({ id: 'listing' }, { id: 'lead' }, { data: { ...discovery, profile: { type: 'other_entity' } }, requirements: [] })
  view.rerender(<RentalListingDocumentsPanel snapshot={{ documents: [], issues: [], documentMatrix: { landlords: [exceptional], tenants: [], issues: [] } }} />)
  expect(screen.getByText(/Resolve this landlord’s legal type/)).toBeTruthy()
})
