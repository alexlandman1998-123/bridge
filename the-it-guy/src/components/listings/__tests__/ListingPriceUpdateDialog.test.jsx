// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import ListingPriceUpdateDialog from '../ListingPriceUpdateDialog.jsx'
afterEach(cleanup)
it('publishes a new lower price with an optional Reduced selection',async()=>{
 const onPublish=vi.fn(async()=>({ok:true,results:[{channel:'Arch9',status:'saved',detail:'Saved'},{channel:'Property24',status:'sent',detail:'Accepted'}]}))
 render(<ListingPriceUpdateDialog currentPrice={1000000} listingStatus="active" onPublish={onPublish} onClose={()=>{}} />)
 fireEvent.change(screen.getByLabelText('New price (R)'),{target:{value:'900000'}});fireEvent.click(screen.getByLabelText('Mark as Reduced'))
 fireEvent.click(screen.getByRole('button',{name:'Save and publish price'}))
 await waitFor(()=>expect(onPublish).toHaveBeenCalledOnce())
 expect(onPublish.mock.calls[0][0]).toMatchObject({price:900000,previousPrice:1000000,showReducedBanner:true})
 await screen.findByText('Property24: Accepted')
 expect(screen.getByLabelText('New price (R)').disabled).toBe(true)
})
it('does not send an invalid reduced label or negative price',async()=>{
 const onPublish=vi.fn();render(<ListingPriceUpdateDialog currentPrice={1000000} listingStatus="active" onPublish={onPublish} onClose={()=>{}} />)
 fireEvent.click(screen.getByLabelText('Mark as Reduced'));fireEvent.click(screen.getByRole('button',{name:'Save and publish price'}))
 expect((await screen.findByRole('alert')).textContent).toContain('lower than');expect(onPublish).not.toHaveBeenCalled()
})
it('retains the original price for failed-channel retries after the saved listing rerenders',async()=>{
 const results=[{channel:'Arch9',status:'saved',detail:'Saved'},{channel:'Private Property',status:'failed',detail:'Validation rejected'}]
 const onPublish=vi.fn(async()=>({ok:false,results}))
 const view=render(<ListingPriceUpdateDialog currentPrice={1000000} listingStatus="active" onPublish={onPublish} onClose={()=>{}} />)
 fireEvent.change(screen.getByLabelText('New price (R)'),{target:{value:'900000'}});fireEvent.click(screen.getByLabelText('Mark as Reduced'));fireEvent.click(screen.getByRole('button',{name:'Save and publish price'}))
 await screen.findByRole('button',{name:'Retry failed channels'})
 view.rerender(<ListingPriceUpdateDialog currentPrice={900000} listingStatus="active" onPublish={onPublish} onClose={()=>{}} />)
 fireEvent.click(screen.getByRole('button',{name:'Retry failed channels'}))
 await waitFor(()=>expect(onPublish).toHaveBeenCalledTimes(2));expect(onPublish.mock.calls[1][0]).toMatchObject({previousPrice:1000000,price:900000,retryResults:results})
})

it('preserves an existing Reduced selection when refreshing its unchanged price',async()=>{
 const onPublish=vi.fn(async()=>({ok:true,results:[]}))
 render(<ListingPriceUpdateDialog currentPrice={900000} currentReduced listingStatus="active" onPublish={onPublish} onClose={()=>{}} />)
 expect(screen.getByLabelText('Mark as Reduced').checked).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Save and publish price'}))
 await waitFor(()=>expect(onPublish).toHaveBeenCalledOnce())
 expect(onPublish.mock.calls[0][0]).toMatchObject({price:900000,showReducedBanner:true,previousReduced:true})
})

it('requires a fresh review when advertising preparation failed rather than offering a send-only retry',async()=>{
 const onPublish=vi.fn(async()=>({ok:false,results:[{channel:'Arch9',status:'saved',detail:'Saved'},{channel:'Property24',status:'failed',retryable:false,detail:'Refresh advertising details.'}]}))
 render(<ListingPriceUpdateDialog currentPrice={900000} listingStatus="active" onPublish={onPublish} onClose={()=>{}} />)
 fireEvent.click(screen.getByRole('button',{name:'Save and publish price'}))
 await screen.findByText('Refresh advertising details.')
 expect(screen.queryByRole('button',{name:'Retry failed channels'})).toBe(null)
})
