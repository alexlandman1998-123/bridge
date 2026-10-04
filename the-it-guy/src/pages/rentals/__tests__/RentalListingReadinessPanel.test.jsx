// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react'
import RentalListingReadinessPanel from '../RentalListingReadinessPanel'
afterEach(cleanup)
const detail={row:{address:'1 Main Road'},readinessItems:[{key:'property',label:'Property basics',complete:false}]}
it('shows exact missing fields, portal states and targeted editor actions',()=>{
 const onFix=vi.fn();render(<RentalListingReadinessPanel detail={detail} onFix={onFix} />)
 expect(screen.getByText('Missing: monthly rent, available from.')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Edit monthly rent'}));expect(onFix).toHaveBeenCalledWith(expect.objectContaining({kind:'editor',step:'terms'}))
 const portal=screen.getByRole('region',{name:'Property24 requirements'});expect(within(portal).getByRole('status').textContent).toBe('Not checked')
 fireEvent.click(within(portal).getByRole('button',{name:'Check Property24 requirements'}));expect(onFix).toHaveBeenLastCalledWith(expect.objectContaining({kind:'check',channel:'property24'}))
})
it('displays Private Property blockers and keeps recommendations separate',()=>{
 render(<RentalListingReadinessPanel detail={detail} onFix={()=>{}} privatePropertyPreview={{ready:false,readiness:{blockers:['missing_description','missing_private_property_agent_id'],warnings:['missing_marketing_title']}}} />)
 const portal=screen.getByRole('region',{name:'Private Property requirements'})
 expect(within(portal).getByText('Complete the listing description')).toBeTruthy();expect(within(portal).getByText('Assigned agent needs a portal mapping')).toBeTruthy()
 expect(within(portal).getByText('Recommendations')).toBeTruthy();expect(within(portal).getByText('These do not block this portal’s readiness check.')).toBeTruthy()
})
it('exposes failed checks with retry and photo preparation counts',()=>{
 render(<RentalListingReadinessPanel detail={detail} onFix={()=>{}} property24Preview={{report:{preview:{canSubmit:false,imageByteLoad:{summary:{loaded:2,failed:1}}}}}} privatePropertyError="Portal connection unavailable" />)
 expect(screen.getByRole('alert').textContent).toBe('Portal connection unavailable')
 expect(screen.getByText('Photos prepared: 2. Photos that failed: 1.')).toBeTruthy()
 expect(screen.getByText('Listing photos could not be prepared for the portal')).toBeTruthy()
})
