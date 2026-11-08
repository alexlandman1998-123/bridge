// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({preview:vi.fn(),load:vi.fn(),from:vi.fn()}))
vi.mock('../../../services/marketingAudienceService',()=>({loadMarketingAudiences:mocks.load,previewMarketingAudience:mocks.preview}))
vi.mock('../../../lib/supabaseClient',()=>({supabase:{from:mocks.from}}))
vi.mock('../MarketingAudiences',()=>({default:({initialCreate,initialAudience})=><div>{initialCreate?'Audience builder':`Contacts for ${initialAudience?.name}`}</div>}))
import EmailAudienceCards,{loadAudienceOpenRate} from '../EmailAudienceCards'
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('shows audience cards and selects directly while hiding the builder until Add audience',async()=>{
 mocks.load.mockResolvedValue({audiences:[{id:'buyers',name:'Buyers',revision:1}],total:1});mocks.preview.mockResolvedValue({matched:6})
 mocks.from.mockReturnValue({select:()=>({eq:()=>({eq:()=>({order:()=>({range:async()=>({data:[]})})})})})})
 const select=vi.fn();render(<EmailAudienceCards organisationId='org' onSelect={select}/>)
 await screen.findByText('Buyers');await screen.findByText('6')
 expect(screen.getByText('No history')).toBeTruthy();expect(screen.queryByText('Audience builder')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Select audience'}));expect(select).toHaveBeenCalledWith(expect.objectContaining({id:'buyers'}))
 fireEvent.click(screen.getByRole('button',{name:'Add audience'}));expect(await screen.findByText('Audience builder')).toBeTruthy()
})
it('computes delivery-weighted open rates from the selected audience history',async()=>{
 mocks.from.mockImplementation(table=>({select:()=>({eq:()=>table==='email_campaigns'?{eq:()=>({order:()=>({range:async()=>({data:[{id:'c'}]})})})}:{in:async()=>({data:[{delivered:100,opened:20},{delivered:300,opened:120}]})}})}))
 expect(await loadAudienceOpenRate('org','buyers')).toBe(35)
})
