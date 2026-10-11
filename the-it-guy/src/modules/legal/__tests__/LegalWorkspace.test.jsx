// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LegalWorkspaceContext, useLegalWorkspace } from '../LegalWorkspaceContext';
import LegalWorkspaceProvider from '../LegalWorkspaceProvider';
import LegalWorkspaceSwitcher from '../LegalWorkspaceSwitcher';
import LegalMatterCreate from '../LegalMatterCreate';
import LegalMatterDetail from '../LegalMatterDetail';
import LegalNavigation from '../LegalNavigation';
import { permittedDisciplines } from '../legalWorkspaceModel';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}));
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>({role:'attorney',profile:{id:'00000000-0000-4000-8000-000000000001'}})}));
vi.mock('../../../context/OrganisationContext',()=>({useOrganisation:()=>({organisation:{id:'org'},branding:{logoUrl:'/firm.svg'}})}));
vi.mock('../../../lib/supabaseClient',()=>({supabase:mocks}));
const user='00000000-0000-4000-8000-000000000001', colleague='00000000-0000-4000-8000-000000000002',firm='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000004';
function fixture(overrides={}) {
 const drafts=new Map();return {firmId:firm,userId:user,activeDiscipline:'wills_estates',disciplines:['wills_estates'],available:true,ready:true,context:{enabled:true,settings:{disciplines:['wills_estates']},capabilities:{disciplines:['wills_estates'],can_create:true,can_edit:true,can_review:true,can_manage:false},grants:[]},
 service:{clients:vi.fn().mockResolvedValue({rows:[]}),directory:vi.fn().mockResolvedValue([{user_id:user,name:'Alex Attorney',can_edit:true},{user_id:colleague,name:'Sam Attorney',can_edit:true}]),create:vi.fn().mockResolvedValue({matter:{id}})},
 remember:(key,value)=>drafts.set(key,value),recall:key=>drafts.get(key),clearDrafts:vi.fn(()=>drafts.clear()),confirmLeave:vi.fn(()=>true),revoke:vi.fn(),reload:vi.fn(),...overrides};
}
function wrap(child,legal,path='/legal/new') {return render(<MemoryRouter initialEntries={[path]}><LegalWorkspaceContext.Provider value={legal}><Routes><Route path="/legal/new" element={child}/><Route path="/legal/matters/:matterId" element={<h1>Saved matter</h1>}/></Routes></LegalWorkspaceContext.Provider></MemoryRouter>);}
beforeEach(()=>{vi.stubGlobal('scrollTo',vi.fn());vi.stubEnv('VITE_ARCH9_LEGAL_ENABLED','false');});
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.restoreAllMocks();mocks.from.mockReset();mocks.rpc.mockReset();});
describe('Legal workspace',()=>{
 it('disabled rollout makes no Legal or firm lookup requests and adds no selector',async()=>{
  render(<MemoryRouter><LegalWorkspaceProvider><LegalWorkspaceSwitcher/><span>Conveyancing</span></LegalWorkspaceProvider></MemoryRouter>);
  await act(async()=>{});expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();expect(screen.queryByLabelText('Legal workspace')).toBeNull();
 });
 it('shows only explicitly permitted enabled disciplines',()=>{
  const context=fixture().context;context.settings.disciplines=['wills_estates','trusts'];expect(permittedDisciplines(context)).toEqual(['wills_estates']);
  context.capabilities.can_manage=true;expect(permittedDisciplines(context)).toEqual(['wills_estates']); // no principal authority
  context.grants=[{}];expect(permittedDisciplines(context)).toEqual(['wills_estates','trusts']);
 });
 it('attorney and management menus have distinct matter scope without unbuilt destinations',()=>{
  const legal=fixture();legal.service.work=vi.fn(async()=>({tasks_enabled:false,documents_enabled:false,tasks:[],documents:[],pending_uploads:[],work:{revision:0,dates:{}}}));const tree=render(<MemoryRouter><LegalWorkspaceContext.Provider value={legal}><LegalNavigation/></LegalWorkspaceContext.Provider></MemoryRouter>);
  expect(screen.getByText('My Matters')).toBeTruthy();expect(screen.queryByText('Accounting')).toBeNull();
  legal.context.capabilities.can_manage=true;legal.context.grants=[{}];tree.rerender(<MemoryRouter><LegalWorkspaceContext.Provider value={legal}><LegalNavigation/></LegalWorkspaceContext.Provider></MemoryRouter>);expect(screen.getByText('All Matters')).toBeTruthy();
 });
 it('creates without property or OTP and submits client, intake and team in one request',async()=>{
  const legal=fixture();legal.service.work=vi.fn(async()=>({tasks_enabled:false,documents_enabled:false,tasks:[],documents:[],pending_uploads:[],work:{revision:0,dates:{}}}));wrap(<LegalMatterCreate/>,legal);
  fireEvent.change(screen.getByLabelText('Matter title'),{target:{value:'Will for Taylor'}});fireEvent.change(screen.getByLabelText('Client name'),{target:{value:'Taylor'}});
  await waitFor(()=>expect(screen.getByText('Continue').disabled).toBe(false));fireEvent.click(screen.getByText('Continue'));
  fireEvent.change(screen.getByLabelText('Conflict review'),{target:{value:'clear'}});fireEvent.change(screen.getByLabelText('Conflict review note'),{target:{value:'Reviewed manually'}});
  fireEvent.change(screen.getByLabelText('Engagement'),{target:{value:'accepted'}});fireEvent.change(screen.getByLabelText('Engagement note'),{target:{value:'Terms accepted'}});
  fireEvent.click(screen.getByText('Continue'));fireEvent.click(screen.getByLabelText('Sam Attorney'));fireEvent.click(screen.getByText('Create Matter'));
  await screen.findByText('Saved matter');const call=legal.service.create.mock.calls[0][0];expect(call.payload.client.name).toBe('Taylor');expect(call.payload.user_ids).toEqual([user,colleague]);expect(call.payload.intake.conflict_decision).toBe('clear');expect(call.payload).not.toHaveProperty('transaction_id');
 });
 it('uncertain creation retry freezes payload and keeps the original request identity',async()=>{
  const legal=fixture();legal.service.work=vi.fn(async()=>({tasks_enabled:false,documents_enabled:false,tasks:[],documents:[],pending_uploads:[],work:{revision:0,dates:{}}}));legal.service.create.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({matter:{id}});wrap(<LegalMatterCreate/>,legal);
  fireEvent.change(screen.getByLabelText('Matter title'),{target:{value:'Will'}});fireEvent.change(screen.getByLabelText('Client name'),{target:{value:'Client'}});
  await waitFor(()=>expect(screen.getByText('Continue').disabled).toBe(false));fireEvent.click(screen.getByText('Continue'));fireEvent.click(screen.getByText('Continue'));fireEvent.click(screen.getByText('Create Matter'));
  await screen.findByText('Connection lost');expect(screen.getByLabelText('Restricted matter').closest('fieldset').disabled).toBe(true);fireEvent.click(screen.getByText('Retry save'));await screen.findByText('Saved matter');
  expect(legal.service.create.mock.calls[0][0]).toEqual(legal.service.create.mock.calls[1][0]);
 });
 it('saves overview, closes and archives with current revisions and reloads persisted values',async()=>{
  const legal=fixture();legal.service.work=vi.fn(async()=>({tasks_enabled:false,documents_enabled:false,tasks:[],documents:[],pending_uploads:[],work:{revision:0,dates:{}}}));let record={id,title:'Will',reference:'LEG-2026-00000001',discipline:'wills_estates',status:'open',revision:1,responsible_user_id:user,restricted:false,conflict_decision:'clear',conflict_note:'Checked',engagement_decision:'accepted',engagement_note:'Accepted'};
  let team=[{user_id:user,removed_at:null}];
  legal.service.matter=vi.fn(async()=>({matter:{...record},team:[...team],parties:[],activity:[],can_edit:true,can_review:true}));
  legal.service.overview=vi.fn(async({payload})=>{record={...record,title:payload.title,revision:record.revision+1};team=payload.user_ids.map(user_id=>({user_id,removed_at:null}));return {matter:record};});
  legal.service.command=vi.fn(async({payload})=>{record={...record,status:payload.status,revision:record.revision+1};return {matter:record};});
  render(<MemoryRouter initialEntries={['/legal/matters/'+id]}><LegalWorkspaceContext.Provider value={legal}><LegalMatterDetail matterId={id}/></LegalWorkspaceContext.Provider></MemoryRouter>);
  await screen.findByLabelText('Title');await screen.findByLabelText('Sam Attorney');fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Updated Will'}});fireEvent.click(screen.getByLabelText('Sam Attorney'));fireEvent.click(screen.getByText('Save Overview'));
  await screen.findByRole('heading',{name:'Updated Will'});expect(legal.service.overview.mock.calls[0][0].payload.user_ids).toEqual([user,colleague]);expect(legal.service.overview.mock.calls[0][0].payload.expected_revision).toBe(1);
  fireEvent.click(screen.getByText('Work'));fireEvent.change(screen.getByLabelText('Status'),{target:{value:'closed'}});fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Complete'}});fireEvent.click(screen.getByText('Update Status'));
  await waitFor(()=>expect(record.status).toBe('closed'));await screen.findByLabelText('Status');fireEvent.change(screen.getByLabelText('Status'),{target:{value:'archived'}});fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'File closed'}});fireEvent.click(screen.getByText('Update Status'));
  await waitFor(()=>expect(record.status).toBe('archived'));expect(legal.service.command.mock.calls[1][0].payload.expected_revision).toBe(3);
 });
 it('recalled drafts retain their original revision after a newer record is fetched',async()=>{
  const legal=fixture();legal.service.work=vi.fn(async()=>({tasks_enabled:false,documents_enabled:false,tasks:[],documents:[],pending_uploads:[],work:{revision:0,dates:{}}}));const record={id,title:'Another attorney edit',reference:'LEG-2026-00000001',discipline:'wills_estates',status:'draft',revision:5,responsible_user_id:user,restricted:false,conflict_decision:'pending',engagement_decision:'pending',conflict_note:'',engagement_note:''};
  legal.remember('matter:'+id,{revision:1,form:{title:'My unsaved edit',restricted:false,responsible_user_id:user,user_ids:[user]}});
  legal.service.matter=vi.fn().mockResolvedValue({matter:record,team:[{user_id:user}],parties:[],activity:[],can_edit:true,can_review:true});
  legal.service.overview=vi.fn().mockRejectedValue({code:'40001',message:'Stale revision'});
  render(<MemoryRouter><LegalWorkspaceContext.Provider value={legal}><LegalMatterDetail matterId={id}/></LegalWorkspaceContext.Provider></MemoryRouter>);
  await screen.findByLabelText('Title');fireEvent.click(screen.getByText('Save Overview'));await screen.findByRole('alert');
  expect(legal.service.overview.mock.calls[0][0].payload.expected_revision).toBe(1);expect(screen.getByLabelText('Title').value).toBe('My unsaved edit');
 });
 it('does not render guessed or denied records',async()=>{
  const legal=fixture();legal.service.work=vi.fn(async()=>({tasks_enabled:false,documents_enabled:false,tasks:[],documents:[],pending_uploads:[],work:{revision:0,dates:{}}}));legal.service.matter=vi.fn().mockRejectedValue({code:'42501',message:'Denied'});
  render(<MemoryRouter><LegalWorkspaceContext.Provider value={legal}><LegalMatterDetail matterId={id}/></LegalWorkspaceContext.Provider></MemoryRouter>);await screen.findByRole('alert');expect(legal.revoke).toHaveBeenCalled();expect(screen.queryByLabelText('Title')).toBeNull();
 });
 it('restores the last conveyancing route and Legal register filters when switching',async()=>{
  vi.stubEnv('VITE_ARCH9_LEGAL_ENABLED','true');vi.stubEnv('VITE_ARCH9_LEGAL_FIRM_IDS',firm);
  const query={select:()=>query,eq:()=>query,in:()=>query,then:resolve=>Promise.resolve(resolve({data:[{id:firm,organisation_id:'org'}],error:null}))};mocks.from.mockReturnValue(query);mocks.rpc.mockResolvedValue({data:fixture().context,error:null});
  function Child(){const location=useLocation(),navigate=useNavigate();return <><LegalWorkspaceSwitcher/><button onClick={()=>navigate('/legal/matters?discipline=wills_estates&search=Taylor&page=2')}>Open register</button><span>{location.pathname+location.search}</span></>;}
  render(<MemoryRouter initialEntries={['/attorney/matters']}><LegalWorkspaceProvider><Child/></LegalWorkspaceProvider></MemoryRouter>);
  await screen.findByLabelText('Legal workspace');fireEvent.click(screen.getByText('Open register'));await screen.findByText('/legal/matters?discipline=wills_estates&search=Taylor&page=2');
  fireEvent.change(screen.getByLabelText('Legal workspace'),{target:{value:'conveyancing'}});await screen.findByText('/attorney/matters');
  fireEvent.change(screen.getByLabelText('Legal workspace'),{target:{value:'wills_estates'}});await screen.findByText('/legal/matters?discipline=wills_estates&search=Taylor&page=2');
 });
 it('guards dirty workspace switching and preserves selected context on cancellation',async()=>{
  vi.stubEnv('VITE_ARCH9_LEGAL_ENABLED','true');vi.stubEnv('VITE_ARCH9_LEGAL_FIRM_IDS',firm);
  const query={select:()=>query,eq:()=>query,in:()=>query,then:resolve=>Promise.resolve(resolve({data:[{id:firm,organisation_id:'org'}],error:null}))};mocks.from.mockReturnValue(query);mocks.rpc.mockResolvedValue({data:fixture().context,error:null});
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  function Child(){const legal=useLegalWorkspace(),location=useLocation();return <><LegalWorkspaceSwitcher/><button onClick={()=>legal.remember('create',{title:'Unsaved'})}>Edit draft</button><button onClick={()=>legal.remember('pending-save',{requestId:'pending'})}>Pending save</button><span>{location.pathname}</span></>;}
  render(<MemoryRouter initialEntries={['/legal/new']}><LegalWorkspaceProvider><Child/></LegalWorkspaceProvider></MemoryRouter>);
  await screen.findByLabelText('Legal workspace');fireEvent.click(screen.getByText('Edit draft'));fireEvent.change(screen.getByLabelText('Legal workspace'),{target:{value:'conveyancing'}});expect(confirm).toHaveBeenCalled();expect(screen.getByText('/legal/new')).toBeTruthy();
  confirm.mockReturnValue(true);fireEvent.change(screen.getByLabelText('Legal workspace'),{target:{value:'conveyancing'}});await screen.findByText('/attorney/dashboard');
  const alert=vi.spyOn(window,'alert').mockImplementation(()=>{});fireEvent.click(screen.getByText('Pending save'));fireEvent.change(screen.getByLabelText('Legal workspace'),{target:{value:'wills_estates'}});expect(alert).toHaveBeenCalledWith('Retry the pending save before leaving.');expect(screen.getByText('/attorney/dashboard')).toBeTruthy();
 });
});
