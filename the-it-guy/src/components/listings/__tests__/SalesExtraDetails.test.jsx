// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import SalesExtraDetails from '../SalesExtraDetails'
import { setListingFeatureFact } from '../../../services/listings/listingFeatureCatalog'
afterEach(cleanup)
function Host({ category = 'residential' }) {
 const [form, setForm] = useState({ propertyCategory: category, listingType: 'sale', featureFacts: { alarm: true, intercom: false }, farmSize: '42.5', loadingAccess: false })
 return <><SalesExtraDetails form={form} onChange={(key,value)=>setForm(previous=>({...previous,[key]:value}))} onFeatureChange={(key,value)=>setForm(previous=>({...previous,featureFacts:setListingFeatureFact(previous.featureFacts,key,value)}))} /><output data-testid="saved">{JSON.stringify(form)}</output></>
}
it('edits one feature group at a time and retains explicit No and clearing when reopened', () => {
 render(<Host />)
 expect(screen.queryByRole('group', {name:'Alarm'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Open Security'}))
 expect(within(screen.getByRole('group',{name:'Intercom'})).getByRole('button',{name:'No'}).getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(within(screen.getByRole('group',{name:'Alarm'})).getByRole('button',{name:'No'}))
 fireEvent.click(screen.getByRole('button',{name:'Done'}))
 fireEvent.click(screen.getByRole('button',{name:'Open Security'}))
 const alarm=within(screen.getByRole('group',{name:'Alarm'}))
 expect(alarm.getByRole('button',{name:'No'}).getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(alarm.getByRole('button',{name:'Clear'}))
 expect(alarm.getByText('Not answered')).toBeTruthy()
 expect(JSON.parse(screen.getByTestId('saved').textContent).featureFacts).toMatchObject({alarm:null,intercom:false})
})
it('keeps category-specific measurements and zero values editable through their own card', () => {
 render(<Host category="agricultural" />)
 fireEvent.click(screen.getByRole('button',{name:'Open Category-specific details'}))
 expect(screen.getByRole('spinbutton',{name:'Farm size (hectares)'}).value).toBe('42.5')
 fireEvent.change(screen.getByRole('spinbutton',{name:'Farm size (hectares)'}),{target:{value:'0'}})
 fireEvent.click(screen.getByRole('button',{name:'Done'}))
 fireEvent.click(screen.getByRole('button',{name:'Open Category-specific details'}))
 expect(screen.getByRole('spinbutton',{name:'Farm size (hectares)'}).value).toBe('0')
})
it('shows land-appropriate groups without room and parking controls', () => {
 render(<Host category="vacant_land" />)
 expect(screen.queryByRole('button',{name:'Open Rooms & living'})).toBeNull()
 expect(screen.queryByRole('button',{name:'Open Parking & buildings'})).toBeNull()
 expect(screen.getByRole('button',{name:'Open Security'})).toBeTruthy()
})
