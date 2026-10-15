// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalTenantApplicationPanel from '../RentalTenantApplicationPanel.jsx'
afterEach(cleanup)
const vacancy={id:'vacancy',listingId:'listing',title:'Bougainvillea home',address:'1547 Bougainvillea Drive, Pretoria',unitLabel:'MAIN',askingRent:11000,eligible:true}
function setup(patch={}) {
 const onPrepare=vi.fn()
 render(<MemoryRouter><RentalTenantApplicationPanel lead={{stage:'application_pending'}} applications={[]} vacancies={[vacancy]} vacancyId="vacancy" onVacancyChange={vi.fn()} expiryDays="7" onExpiryChange={vi.fn()} onPrepare={onPrepare} onRevoke={vi.fn()} {...patch}/></MemoryRouter>)
 return onPrepare
}
it('names the selected property and unit and opens its canonical rental listing',()=>{
 const prepare=setup()
 expect(screen.getByRole('option',{name:/Bougainvillea home · MAIN/})).toBeTruthy()
 expect(screen.getByRole('link',{name:'Open selected listing'}).getAttribute('href')).toBe('/agent/rentals/listings/listing')
 fireEvent.click(screen.getByRole('button',{name:'Create application draft'}));expect(prepare).toHaveBeenCalledWith({invite:false})
 fireEvent.click(screen.getByRole('button',{name:'Create secure application link'}));expect(prepare).toHaveBeenLastCalledWith()
})
it('requires Application pending before creating a new application',()=>{
 setup({lead:{stage:'qualified'}})
 expect(screen.getByRole('button',{name:'Create application draft'}).disabled).toBe(true)
 expect(screen.getByRole('button',{name:'Create secure application link'}).disabled).toBe(true)
 expect(screen.getByText(/Complete qualification and viewing/)).toBeTruthy()
})
it('keeps a submitted legacy application and its listing accessible when intake has closed',()=>{
 const prepare=setup({lead:{stage:'screening_pending'},vacancies:[{...vacancy,eligible:false}],applications:[{id:'app',vacancyId:'vacancy',status:'submitted',submittedAt:'2026-10-14',data:{property:{address:'Signed address'},documentLinks:[{documentId:'saved-file'}]}}]})
 expect(screen.getByRole('link',{name:'Open rental listing'}).getAttribute('href')).toBe('/agent/rentals/listings/listing')
 expect(screen.getByText('Signed address')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Open existing application'}));expect(prepare).toHaveBeenCalledWith({invite:false})
 expect(screen.queryByRole('button',{name:'Create secure application link'})).toBeNull()
})
it('does not display a prepared secret link once the application is submitted',()=>{
 setup({applicationLink:'https://local.test/secret',applicationLinkId:'app',applications:[{id:'app',vacancyId:'vacancy',status:'submitted',data:{}}]})
 expect(screen.queryByDisplayValue('https://local.test/secret')).toBeNull()
})
