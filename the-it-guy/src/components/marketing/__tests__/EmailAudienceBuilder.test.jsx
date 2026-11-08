// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import EmailAudienceBuilder from '../EmailAudienceBuilder'
const sharedMocks=vi.hoisted(()=>({load:vi.fn()}))
vi.mock('../../../services/marketingAudienceService',()=>({loadMarketingAudiences:sharedMocks.load}))
vi.mock('../MarketingAudiences',()=>({AudiencePreview:({audience,onApply})=><div>Review {audience.name}<button onClick={()=>onApply(['eligible-contact'],audience)}>Use reviewed recipients</button></div>}))
beforeEach(()=>{sharedMocks.load.mockReset().mockResolvedValue({audiences:[],total:0,canShare:true})})
vi.mock('../AudienceImportDialog',()=>({default:()=> <div>Import dialog</div>}))
vi.mock('../../../services/emailCampaignService',()=>({saveEmailAudience:vi.fn()}))
afterEach(cleanup)
const props={audienceFilter:{},contacts:[],savedAudiences:[{id:'saved',name:'Imported buyers',filter_json:{contact_ids:['one','two']}}],organisationId:'org',userId:'user',subscriptionId:'category',onRefresh:vi.fn(),setNotice:vi.fn(),setError:vi.fn()}
it('applies exactly the saved selection and opens the marketing contact import flow',()=>{
 const change=vi.fn();render(<EmailAudienceBuilder {...props} onChange={change}/>);fireEvent.change(screen.getByRole('combobox',{name:'Apply a saved audience'}),{target:{value:'saved'}});expect(change).toHaveBeenCalledWith({contact_ids:['one','two']});fireEvent.click(screen.getByRole('button',{name:'Import Excel / CSV'}));expect(screen.getByText('Import dialog')).toBeTruthy();
})
it('requires a category before importing and removes a saved rule reference when filters change',()=>{
 const change=vi.fn();render(<EmailAudienceBuilder {...props} subscriptionId="" audienceFilter={{saved_audience_id:'saved'}} onChange={change}/>);expect(screen.getByRole('button',{name:'Import Excel / CSV'}).disabled).toBe(true);fireEvent.change(screen.getByRole('combobox',{name:'Contact type'}),{target:{value:'buyer'}});expect(change).toHaveBeenCalledWith({role_type:'buyer'});
})

it('switches a live shared audience to explicit custom filters when editing',()=>{
 const change=vi.fn();render(<EmailAudienceBuilder {...props} audienceFilter={{shared_audience_id:'shared',audience_revision:3}} onChange={change}/>);fireEvent.change(screen.getByRole('combobox',{name:'Contact type'}),{target:{value:'buyer'}});expect(change).toHaveBeenCalledWith({role_type:'buyer'});
})

it('selects a saved shared audience directly without opening its contacts',async()=>{
 sharedMocks.load.mockResolvedValue({audiences:[{id:'crm',name:'Madison buyers',revision:1}],total:1,canShare:true})
 const change=vi.fn();render(<EmailAudienceBuilder {...props} onChange={change}/>)
 await screen.findByRole('option',{name:'Madison buyers · Shared CRM'})
 fireEvent.change(screen.getByRole('combobox',{name:'Apply a saved audience'}),{target:{value:'shared:crm'}})
 expect(change).toHaveBeenCalledWith({shared_audience_id:'crm',audience_revision:1})
 expect(screen.queryByText('Review Madison buyers')).toBeNull()
})
it('refreshes the shared library after an audience is created elsewhere',async()=>{
 render(<EmailAudienceBuilder {...props} onChange={vi.fn()}/>)
 await screen.findByRole('option',{name:'Imported buyers'})
 sharedMocks.load.mockResolvedValue({audiences:[{id:'fresh',name:'New audience'}],total:1})
 fireEvent.click(screen.getByRole('button',{name:'Refresh audiences'}))
 expect(await screen.findByRole('option',{name:'New audience · Shared CRM'})).toBeTruthy()
})
it('loads subsequent pages of shared audiences',async()=>{
 sharedMocks.load.mockImplementation(async(_org,_search,offset)=>({audiences:offset?[{id:'last',name:'Page two'}]:[{id:'first',name:'Page one'}],total:21}))
 render(<EmailAudienceBuilder {...props} onChange={vi.fn()}/>)
 expect(await screen.findByRole('option',{name:'Page two · Shared CRM'})).toBeTruthy()
 expect(sharedMocks.load).toHaveBeenCalledWith('org','',20)
})
