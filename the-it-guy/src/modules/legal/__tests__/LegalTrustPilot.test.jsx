// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import LegalMatterDetail from '../LegalMatterDetail';
import {LegalWorkspaceContext} from '../LegalWorkspaceContext';
const id='00000000-0000-4000-8000-000000000003',firm='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
function fixture({manager=true,enabled=false,version=null}={}) {
 const drafts=new Map(),matter={id,reference:'LEG-1',title:'Trust setup',discipline:'trusts',status:'draft',revision:1,responsible_user_id:user,restricted:false,conflict_decision:'pending',engagement_decision:'pending',conflict_note:'',engagement_note:''};
 const data={tasks_enabled:true,documents_enabled:true,work:{revision:0,dates:{},template_version:version},tasks:[],documents:[],pending_uploads:[]};
 const pilot={template_version:'trust_setup_manual_v1',tasks:['Record instructions','Review deed','Record handover'],can_configure:manager,settings:enabled?{enabled:true,revision:1}:null};
 const service={matter:vi.fn(async()=>({matter,team:[{user_id:user}],parties:[],activity:[],can_edit:true,can_review:true})),directory:vi.fn(async()=>[{user_id:user,name:'Attorney',can_edit:true}]),work:vi.fn(async()=>structuredClone(data)),trustPilot:vi.fn(async()=>structuredClone(pilot)),workCommand:vi.fn(async({action,payload})=>{
 if(action==='configure_trusts'){pilot.settings={enabled:payload.enabled,revision:1};return {settings:pilot.settings};}
 if(action==='start_trusts'){data.work.template_version='trust_setup_manual_v1';data.tasks=[{id:'task',title:'Record instructions',owner_id:user,status:'pending',note:'',due_on:null}];}
 if(action==='save_trust_dates')data.work.dates=payload.dates;
 data.work.revision++;return {work:data.work};})};
 const legal={service,firmId:firm,userId:user,context:{capabilities:{can_edit:true,can_review:true,can_manage:manager},grants:manager?[{}]:[]},recall:k=>drafts.get(k),remember:(k,v)=>drafts.set(k,v),forget:k=>drafts.delete(k),clearDrafts:()=>drafts.clear(),revoke:vi.fn(),confirmLeave:vi.fn(()=>true)};
 return {legal,data,pilot};
}
function show(legal){render(<MemoryRouter initialEntries={['/legal/matters/'+id+'?tab=Work']}><LegalWorkspaceContext.Provider value={legal}><LegalMatterDetail matterId={id}/></LegalWorkspaceContext.Provider></MemoryRouter>);}
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
it('off switch retains existing manual Trusts work without a pilot RPC',async()=>{
 const {legal}=fixture();show(legal);await screen.findByLabelText('Task');expect(legal.service.trustPilot).not.toHaveBeenCalled();expect(screen.queryByText('Trusts setup')).toBeNull();expect(screen.getByLabelText('Custody recorded')).toBeTruthy();
});
it('firm approves the displayed version, starts it once, and records Trusts dates',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture();show(legal);
 fireEvent.click(await screen.findByText('Review pilot checklist'));fireEvent.change(screen.getByLabelText('Firm approval note'),{target:{value:'Reviewed setup examples and firm approvals'}});fireEvent.click(screen.getByText('Approve checklist'));
 fireEvent.click(await screen.findByText('Start Trusts checklist'));await screen.findByText('Setup checklist · v1');expect(legal.service.workCommand.mock.calls[0][0]).toMatchObject({action:'configure_trusts',payload:{enabled:true,expected_revision:0,template_version:'trust_setup_manual_v1'}});expect(legal.service.workCommand.mock.calls[1][0]).toMatchObject({action:'start_trusts',payload:{matter_id:id,expected_revision:0,template_version:'trust_setup_manual_v1'}});
 fireEvent.change(screen.getByLabelText('Setup outcome recorded'),{target:{value:'2026-10-12'}});fireEvent.click(screen.getByText('Save Dates'));await waitFor(()=>expect(legal.service.workCommand).toHaveBeenLastCalledWith(expect.objectContaining({action:'save_trust_dates',payload:{matter_id:id,expected_revision:1,dates:{setup_on:'2026-10-12'}}})));
});
it('ordinary attorneys see the approved start but cannot configure the pilot',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture({manager:false,enabled:true});show(legal);await screen.findByText('Start Trusts checklist');expect(screen.queryByText('Pause checklist starts')).toBeNull();expect(screen.queryByText('Review pilot checklist')).toBeNull();
});
it('lost approval response retries the identical request and retains an unsaved task draft',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture();legal.remember('work:'+id,{revision:0,form:{title:'Unsaved task',owner_id:user,due_on:'',status:'pending',note:''}});
 const original=legal.service.workCommand.getMockImplementation();legal.service.workCommand.mockRejectedValueOnce(new Error('Response lost')).mockImplementation(original);show(legal);
 fireEvent.click(await screen.findByText('Review pilot checklist'));fireEvent.change(screen.getByLabelText('Firm approval note'),{target:{value:'Firm reviewed'}});fireEvent.click(screen.getByText('Approve checklist'));await screen.findByRole('alert');fireEvent.click(within(screen.getByRole('region',{name:'Trusts setup pilot'})).getByRole('button',{name:'Retry save'}));
 await screen.findByText('Start Trusts checklist');expect(legal.service.workCommand.mock.calls[0][0]).toEqual(legal.service.workCommand.mock.calls[1][0]);expect(legal.recall('work:'+id).form.title).toBe('Unsaved task');
});
it('an existing template keeps its recorded version when new starts are paused',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture({version:'trust_setup_manual_v1'});show(legal);await screen.findByText('Setup checklist · v1');expect(screen.queryByText('Start Trusts checklist')).toBeNull();expect(screen.getByLabelText('Task')).toBeTruthy();
});

it('a lost start response can retry its frozen request from the start button',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture({enabled:true});const original=legal.service.workCommand.getMockImplementation();legal.service.workCommand.mockRejectedValueOnce(new Error('Response lost')).mockImplementation(original);show(legal);
 fireEvent.click(await screen.findByText('Start Trusts checklist'));await screen.findByRole('alert');fireEvent.click(within(screen.getByRole('region',{name:'Trusts setup pilot'})).getByRole('button',{name:'Retry save'}));await screen.findByText('Setup checklist · v1');expect(legal.service.workCommand.mock.calls[0][0]).toEqual(legal.service.workCommand.mock.calls[1][0]);
});

it('switch-off preserves Trusts date editing for an already saved checklist',async()=>{
 const {legal,data}=fixture({version:'trust_setup_manual_v1'});data.work.dates={setup_on:'2026-10-12'};show(legal);await screen.findByLabelText('Setup outcome recorded');fireEvent.click(screen.getByText('Save Dates'));await waitFor(()=>expect(legal.service.workCommand).toHaveBeenCalledWith(expect.objectContaining({action:'save_trust_dates',payload:expect.objectContaining({dates:{setup_on:'2026-10-12'}})})));expect(legal.service.trustPilot).not.toHaveBeenCalled();
});

it('a recalled approval keeps its original revision and intent when settings changed',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture({enabled:true});legal.remember('trust-pilot:'+firm,{note:'Reviewed original version',approval:{enabled:true,expected_revision:0,template_version:'trust_setup_manual_v1'}});legal.service.workCommand.mockRejectedValue({code:'40001',message:'Pilot settings changed'});show(legal);fireEvent.click(await screen.findByText('Approve checklist'));await screen.findByRole('alert');expect(legal.service.workCommand).toHaveBeenCalledWith(expect.objectContaining({action:'configure_trusts',payload:expect.objectContaining({enabled:true,expected_revision:0})}));
});

it('saving matter dates preserves an unsaved pilot approval and its original revision',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture();show(legal);fireEvent.click(await screen.findByText('Review pilot checklist'));fireEvent.change(screen.getByLabelText('Firm approval note'),{target:{value:'Unsaved firm review'}});fireEvent.change(screen.getByLabelText('Deed review'),{target:{value:'2026-10-12'}});fireEvent.click(screen.getByText('Save Dates'));await waitFor(()=>expect(legal.service.workCommand).toHaveBeenCalled());await screen.findByLabelText('Firm approval note');expect(screen.getByLabelText('Firm approval note').value).toBe('Unsaved firm review');expect(legal.recall('trust-pilot:'+firm).approval.expected_revision).toBe(0);
});

it('retrying from another form still completes the original approval handler',async()=>{
 vi.stubEnv('VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED','true');const {legal}=fixture();legal.remember('work:'+id,{revision:0,form:{title:'Unsaved task',owner_id:user,due_on:'',status:'pending',note:''}});const original=legal.service.workCommand.getMockImplementation();legal.service.workCommand.mockRejectedValueOnce(new Error('Response lost')).mockImplementation(original);show(legal);fireEvent.click(await screen.findByText('Review pilot checklist'));fireEvent.change(screen.getByLabelText('Firm approval note'),{target:{value:'Firm reviewed'}});fireEvent.click(screen.getByText('Approve checklist'));await screen.findByRole('alert');const taskForm=screen.getByLabelText('Task').closest('form');fireEvent.click(within(taskForm).getByRole('button',{name:'Retry save'}));await screen.findByText('Start Trusts checklist');expect(legal.service.workCommand.mock.calls[0][0]).toEqual(legal.service.workCommand.mock.calls[1][0]);expect(screen.queryByRole('alert')).toBeNull();expect(legal.recall('work:'+id).form.title).toBe('Unsaved task');
});
