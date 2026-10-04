// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KingdomWebsitePublicationChannel from '../KingdomWebsitePublicationChannel'
import WebsiteListingPublicationPanel from '../WebsiteListingPublicationPanel'
const mocks=vi.hoisted(()=>({kingdom:vi.fn(),agency:vi.fn(),setKingdom:vi.fn(),setAgency:vi.fn()}))
vi.mock('../../../services/kingdomWebsitePublicationService',()=>({getKingdomWebsitePublicationStatus:mocks.kingdom,setKingdomWebsitePublication:mocks.setKingdom}))
vi.mock('../../../services/websiteListingPublicationService',()=>({getWebsiteListingPublicationStatus:mocks.agency,setWebsiteListingPublication:mocks.setAgency}))
const props={listingId:'rental-1',listingTitle:'Rental home',listingReference:'A9-TEST-000123',showConnectionState:true}
const connected={available:true,websiteSiteId:'site-1',hostname:'kingdom.example',websiteStatus:'published',status:'unpublished',eligible:true,blockers:[]}
beforeEach(()=>{vi.resetAllMocks();mocks.kingdom.mockResolvedValue(connected);mocks.agency.mockResolvedValue({...connected,projectionStatus:'Published'})})
afterEach(cleanup)
it('shows authorised Kingdom rentals and their separate publication history',async()=>{
 render(<KingdomWebsitePublicationChannel {...props} publicationState={{acceptedAt:'2026-10-04T10:00:00Z',changeCount:1}} />)
 await screen.findByRole('button',{name:'Manage'});expect(screen.getByText('Kingdom Website')).toBeTruthy();expect(screen.getByText('Accepted')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Manage'}));const dialog=await screen.findByRole('dialog',{name:'Manage Kingdom Website'});expect(within(dialog).getByRole('button',{name:'Publish to Kingdom'})).toBeTruthy()
})
it('omits Kingdom when there is no sharing grant',async()=>{
 mocks.kingdom.mockResolvedValue({available:false});const {container}=render(<KingdomWebsitePublicationChannel {...props} />)
 await waitFor(()=>expect(container.textContent).toBe(''));expect(screen.queryByRole('button',{name:'Manage'})).toBeNull()
})
it('shows a failed connection check and allows a read-only retry',async()=>{
 mocks.kingdom.mockRejectedValueOnce(new Error('Grant status unavailable')).mockResolvedValueOnce(connected)
 render(<KingdomWebsitePublicationChannel {...props} />)
 expect((await screen.findByRole('alert')).textContent).toContain('Grant status unavailable')
 fireEvent.click(screen.getByRole('button',{name:'Retry Kingdom Website status'}));await screen.findByRole('button',{name:'Manage'});expect(mocks.setKingdom).not.toHaveBeenCalled()
})
it('keeps the agency channel visible when disconnected',async()=>{
 mocks.agency.mockResolvedValue({blockers:['No agency website connected.']});render(<WebsiteListingPublicationPanel {...props} variant="channel" />)
 await screen.findByText('Not connected');expect(screen.getByText('Agency Website')).toBeTruthy();expect(screen.queryByRole('button',{name:'Publish to website'})).toBeNull()
})
it('keeps default sales behaviour for a disconnected website',async()=>{
 mocks.agency.mockResolvedValue({});const {container}=render(<WebsiteListingPublicationPanel {...props} showConnectionState={false} variant="channel" />)
 await waitFor(()=>expect(mocks.agency).toHaveBeenCalled());expect(container.textContent).toBe('')
})
it.each([['Kingdom',KingdomWebsitePublicationChannel,mocks.setKingdom,'Publish to Kingdom'],['agency',WebsiteListingPublicationPanel,mocks.setAgency,'Publish to website']])('does not mark an accepted %s publication as failed when activity persistence fails',async(_name,Component,setPublication,button)=>{
 const onEvent=vi.fn(async event=>{if(event.stage==='accepted')throw new Error('History unavailable')})
 setPublication.mockResolvedValue({...connected,status:'published',projectionStatus:'Published'})
 render(<Component {...props} variant="channel" onPrepare={async()=>({ok:true,publicationDraft:{headline:'Rental'}})} onPublicationAction={onEvent} />)
 fireEvent.click(await screen.findByRole('button',{name:'Manage'}))
 fireEvent.click(screen.getByRole('button',{name:button}))
 await waitFor(()=>expect(onEvent).toHaveBeenCalledTimes(2))
 expect(onEvent.mock.calls.map(([event])=>event.stage)).toEqual(['submitted','accepted'])
 expect(setPublication).toHaveBeenCalledTimes(1);expect(screen.getAllByRole('alert')[0].textContent).toContain('accepted the request')
})
