// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import KingdomWebsitePublicationChannel from '../KingdomWebsitePublicationChannel'
import WebsiteListingPublicationPanel from '../WebsiteListingPublicationPanel'
import ListingSyndicationChannelCard from '../ListingSyndicationChannelCard'
const mocks=vi.hoisted(()=>({kingdom:vi.fn(),agency:vi.fn(),setKingdom:vi.fn(),setAgency:vi.fn()}))
vi.mock('../../../services/kingdomWebsitePublicationService',()=>({getKingdomWebsitePublicationStatus:mocks.kingdom,setKingdomWebsitePublication:mocks.setKingdom}))
vi.mock('../../../services/websiteListingPublicationService',()=>({getWebsiteListingPublicationStatus:mocks.agency,setWebsiteListingPublication:mocks.setAgency}))
const props={listingId:'rental-1',listingTitle:'Rental home',listingReference:'A9-TEST-000123',showConnectionState:true}
const connected={available:true,websiteSiteId:'site-1',hostname:'kingdom.example',websiteStatus:'published',status:'unpublished',eligible:true,blockers:[]}
beforeEach(()=>{vi.resetAllMocks();mocks.kingdom.mockResolvedValue(connected);mocks.agency.mockResolvedValue({...connected,projectionStatus:'Published'})})
afterEach(cleanup)
it('shows authorised Kingdom rentals and their separate publication history',async()=>{
 render(<KingdomWebsitePublicationChannel {...props} publicationState={{acceptedAt:'2026-10-04T10:00:00Z',changeCount:1}} />)
 await screen.findByLabelText(/^Manage /);expect(screen.getByText('Kingdom Website')).toBeTruthy();expect(screen.getByText(/^Accepted · /)).toBeTruthy()
 fireEvent.click(screen.getByLabelText(/^Manage /));expect(screen.getByRole('button',{name:'Publish to Kingdom'})).toBeTruthy()
})
it('omits Kingdom when there is no sharing grant',async()=>{
 mocks.kingdom.mockResolvedValue({available:false});const {container}=render(<KingdomWebsitePublicationChannel {...props} />)
 await waitFor(()=>expect(container.textContent).toBe(''));expect(screen.queryByLabelText(/^Manage /)).toBeNull()
})
it('shows a failed connection check and allows a read-only retry',async()=>{
 mocks.kingdom.mockRejectedValueOnce(new Error('Grant status unavailable')).mockResolvedValueOnce(connected)
 render(<KingdomWebsitePublicationChannel {...props} />)
 expect((await screen.findByRole('alert')).textContent).toContain('Grant status unavailable')
 fireEvent.click(screen.getByRole('button',{name:'Retry Kingdom Website status'}));await screen.findByLabelText(/^Manage /);expect(mocks.setKingdom).not.toHaveBeenCalled()
})
it('keeps the agency channel visible when disconnected',async()=>{
 mocks.agency.mockResolvedValue({blockers:['No agency website connected.']});render(<WebsiteListingPublicationPanel {...props} variant="channel" />)
 await screen.findByText('Not connected');expect(screen.getByText('Agency Website')).toBeTruthy();expect(screen.queryByRole('button',{name:'Publish to website'})).toBeNull()
})
it('keeps default sales behaviour for a disconnected website',async()=>{
 mocks.agency.mockResolvedValue({});const {container}=render(<WebsiteListingPublicationPanel {...props} showConnectionState={false} variant="channel" />)
 await waitFor(()=>expect(mocks.agency).toHaveBeenCalled());expect(container.textContent).toBe('')
})
it('names the approved Kingdom destination instead of using the iSell agency identity',()=>{
 render(<ListingSyndicationChannelCard channel={{key:'agency_website',availability:{available:true,channel:'kingdom_website',label:'Kingdom Real Estate Website',hostname:'kingdomrealestate.co.za'}}} selected agencyLogo="/isell-logo.png" />)
 expect(screen.getByRole('button',{name:'Kingdom Real Estate Website'})).toBeTruthy()
 expect(screen.getByText('Publish on kingdomrealestate.co.za.')).toBeTruthy()
 expect(screen.queryByRole('img')).toBeNull()
})
it('omits a disconnected owned-site option when the Kingdom sharing channel is connected',async()=>{
 mocks.agency.mockResolvedValue({blockers:['Create the organisation website before publishing a listing.']})
 const {container}=render(<WebsiteListingPublicationPanel {...props} variant="channel" hideDisconnected />)
 await waitFor(()=>expect(mocks.agency).toHaveBeenCalled())
 expect(container.textContent).toBe('')
})
it('labels Kingdom’s own website with the same destination name',async()=>{
 mocks.agency.mockResolvedValue({...connected,projectionStatus:'Published',websiteLabel:'Kingdom Real Estate Website'})
 render(<WebsiteListingPublicationPanel {...props} variant="channel" />)
 fireEvent.click(await screen.findByLabelText(/^Manage /))
 expect(screen.getByLabelText('Manage Kingdom Real Estate Website').closest('details').open).toBe(true)
 expect(screen.getByRole('button',{name:'Publish to website'})).toBeTruthy()
})
it.each([['Kingdom',KingdomWebsitePublicationChannel,mocks.setKingdom,'Publish to Kingdom'],['agency',WebsiteListingPublicationPanel,mocks.setAgency,'Publish to website']])('does not mark an accepted %s publication as failed when activity persistence fails',async(_name,Component,setPublication,button)=>{
 const onEvent=vi.fn(async event=>{if(event.stage==='accepted')throw new Error('History unavailable')})
 setPublication.mockResolvedValue({...connected,status:'published',projectionStatus:'Published'})
 render(<Component {...props} variant="channel" onPrepare={async()=>({ok:true,publicationDraft:{headline:'Rental'}})} onPublicationAction={onEvent} />)
 fireEvent.click(await screen.findByLabelText(/^Manage /))
 fireEvent.click(screen.getByRole('button',{name:button}))
 await waitFor(()=>expect(onEvent).toHaveBeenCalledTimes(2))
 expect(onEvent.mock.calls.map(([event])=>event.stage)).toEqual(['submitted','accepted'])
 expect(setPublication).toHaveBeenCalledTimes(1);expect(screen.getAllByRole('alert')[0].textContent).toContain('accepted the request')
})
