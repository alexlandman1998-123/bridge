// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import EmailAudienceBuilder from '../EmailAudienceBuilder'
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
