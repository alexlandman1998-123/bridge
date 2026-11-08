// @vitest-environment jsdom
import React from 'react'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import InboxEmailContactPanel from './InboxEmailContactPanel'
import {loadInboxContactSummary} from '../../services/inboxContactSummaryService'
vi.mock('../../services/inboxContactSummaryService',()=>({loadInboxContactSummary:vi.fn()}))
vi.mock('./InboxCrmActions',()=>({default:()=>null}))
const props={organisationId:'org',userId:'me',agentName:'Agent',conversation:{id:'thread',name:'pat@example.test',address:'pat@example.test'},onCreate:vi.fn(),onClose:vi.fn()}
const fixture=()=>({contacts:[{contact_id:'contact',first_name:'Pat',last_name:'Smith',email:'pat@example.test',phone:'0821234567'}],leads:[{lead_id:'lead',lead_category:'buyer',stage:'Viewing',status:'active',priority:'High',budget:1500000,assigned_user_id:'owner'}],transactions:[{id:'deal',transaction_reference:'A9-100',stage:'Bond approval',next_action:'Submit guarantee',sales_price:1400000}],enquiries:[{id:'property',title:'Madison Place',kind:'Development',path:'/developments/property',at:'2026-11-01'}],activities:[{activity_id:'activity',activity_type:'Viewing booked',activity_note:'Saturday viewing',created_at:'2026-11-02'}],conversations:[],people:[{id:'owner',full_name:'Alex Landman'}],issues:[]})
beforeEach(()=>{vi.resetAllMocks();loadInboxContactSummary.mockResolvedValue(fixture())});afterEach(cleanup)
const open=()=>render(<MemoryRouter><InboxEmailContactPanel {...props}/></MemoryRouter>)
it('shows a saved full name, email once, phone, active lead and transaction highlights',async()=>{
 open();await screen.findByText('Pat Smith');expect(screen.getAllByText('pat@example.test')).toHaveLength(1);expect(screen.getByText('0821234567')).toBeTruthy();expect(screen.getByText('Viewing')).toBeTruthy();expect(screen.getByText('Alex Landman')).toBeTruthy();expect(screen.getByText('Submit guarantee')).toBeTruthy();expect(screen.getByRole('link',{name:'A9-100'}).getAttribute('href')).toBe('/transactions/deal');
})
it('provides enquiries and history tabs with keyboard navigation',async()=>{
 open();await screen.findByText('Pat Smith');fireEvent.click(screen.getByRole('tab',{name:'Enquiries'}));expect(screen.getByRole('link',{name:/Madison Place/})).toBeTruthy();fireEvent.keyDown(screen.getByRole('tablist'),{key:'ArrowRight'});expect(screen.getByRole('tab',{name:'History'}).getAttribute('aria-selected')).toBe('true');expect(screen.getByText('Saturday viewing')).toBeTruthy();
})
it('does not repeat an email as the person’s name or display completed deals as active',async()=>{
 const data=fixture();data.contacts=[];data.leads=[];data.transactions=[{id:'closed',lifecycle_state:'completed',transaction_reference:'Done'}];loadInboxContactSummary.mockResolvedValue(data);open();await screen.findByText('Contact name not recorded');expect(screen.getAllByText('pat@example.test')).toHaveLength(1);expect(screen.queryByText('Done')).toBeNull();expect(screen.getByText('No active transaction found.')).toBeTruthy();
})
it('does not display a late result after switching the selected contact',async()=>{
 let done;loadInboxContactSummary.mockReturnValueOnce(new Promise(resolve=>{done=resolve}));const view=open();view.rerender(<MemoryRouter><InboxEmailContactPanel key="new" {...props} conversation={{id:'new',address:'other@example.test'}}/></MemoryRouter>);await screen.findByText('Pat Smith');done({...fixture(),contacts:[{first_name:'Wrong contact'}]});await waitFor(()=>expect(screen.queryByText('Wrong contact')).toBeNull());
})
