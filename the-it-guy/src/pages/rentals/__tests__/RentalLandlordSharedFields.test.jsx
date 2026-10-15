// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Portal from '../../../modules/rentals/shared/applications/RentalLandlordDiscoveryForm.jsx'
import Listing from '../RentalListingLandlordOnboardingEditor.jsx'
import SharedProfile from '../../../modules/rentals/shared/applications/RentalLandlordProfileEditor.jsx'
import { landlordAcceptanceScenarios } from '../../../../server/tests/fixtures/rentalLandlordProfileScenarios.js'
import { landlordProfileFields } from '../../../services/rentals/rentalLandlordProfileRules.js'
afterEach(cleanup)
function Editor({ initial, listing = false, agent = false }) {
 const [data,onChange] = useState({ profile: initial, portfolio: [{ id: 'p', listingId: 'listing', address: 'Road' }] })
 if (agent) return <SharedProfile profile={data.profile} portfolio={data.portfolio} onChange={profile => onChange({ ...data, profile })} />
 return listing ? <Listing data={data} listingId="listing" onChange={onChange} /> : <Portal data={data} onChange={onChange} />
}
it.each(landlordAcceptanceScenarios)('$label: renders the same applicable fields in the agent, portal and listing editors', scenario => {
 const type=scenario.structure
 const profile = { type: scenario.type, legalStructure: type, name: 'Owner', maritalStatus: 'married', maritalRegime: 'in_community', vatRegistered: 'yes', hasRepresentative: 'yes' }
 for (const surface of ['portal','listing','agent']) {
  const listing=surface==='listing', agent=surface==='agent'
  render(<Editor initial={profile} listing={listing} agent={agent} />)
  for (const title of ['Identity & family', 'Entity details', 'Tax & VAT', 'Signatories & authority']) {
   const button=screen.queryByRole('button',{name:new RegExp(`^${title}`)})
   if(button)fireEvent.click(button)
  }
  for (const [,label] of landlordProfileFields(profile, { publicSource: true })) expect(screen.getByLabelText(label)).toBeTruthy()
  expect(screen.getByLabelText('Email').type).toBe('email')
  expect(screen.getByLabelText('Resolution date').type).toBe('date')
  if (type !== 'individual') expect(screen.queryByLabelText('ID / passport number')).toBeNull()
  expect(screen.queryByLabelText('Notes')).toBe(listing || agent ? screen.getByLabelText('Notes') : null)
  cleanup()
 }
})
it.each([false,true])('changes conditional questions without erasing prior answers (listing=%s)', listing => {
 render(<Editor initial={{ type:'individual', name:'Owner', maritalStatus:'married', maritalRegime:'in_community', spouseName:'Saved Spouse', spouseIdNumber:'Saved ID', vatRegistered:'yes', vatNumber:'Saved VAT', hasRepresentative:'yes' }} listing={listing} />)
 for (const title of ['Identity & family','Tax & VAT','Signatories & authority']) fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${title}`)}))
 fireEvent.change(screen.getByLabelText('Marital status'),{target:{value:'single'}})
 expect(screen.queryByLabelText('Spouse name')).toBeNull()
 fireEvent.change(screen.getByLabelText('Marital status'),{target:{value:'married'}})
 expect(screen.getByLabelText('Spouse name').value).toBe('Saved Spouse')
 fireEvent.change(screen.getByLabelText('VAT registered?'),{target:{value:'no'}})
 expect(screen.queryByLabelText('VAT number')).toBeNull()
 fireEvent.change(screen.getByLabelText('VAT registered?'),{target:{value:'yes'}})
 expect(screen.getByLabelText('VAT number').value).toBe('Saved VAT')
 fireEvent.change(screen.getByLabelText('Someone else authorised to sign?'),{target:{value:'no'}})
 expect(screen.queryByLabelText('Signatory email')).toBeNull()
})
it.each([false,true])('collects consistent roles and signing authority for a draft person (listing=%s)', listing => {
 render(<Editor initial={{ type:'trust', name:'Trust', people:[{id:'p',name:'Person',role:'Trustee'}] }} listing={listing} />)
 fireEvent.click(screen.getByRole('button',{name:/^Owners & representatives/}))
 fireEvent.click(screen.getByRole('button',{name:'Edit person 1: Person'}))
 expect(screen.getByLabelText('Person 1 Role').value).toBe('Trustee')
 expect(screen.queryByLabelText('Person 1 Ownership share (%)')).toBeNull()
 fireEvent.click(screen.getByLabelText('Person 1 Authorised to sign'))
 expect(screen.getByLabelText('Person 1 Authorised to sign').checked).toBe(true)
})
