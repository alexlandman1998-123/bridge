// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LegalWorkspaceContext} from '../LegalWorkspaceContext';
import LegalWorkspacePage from '../LegalWorkspacePage';
import LegalFirmMatterRegister from '../LegalFirmMatterRegister';
import LegalFirmOverview from '../LegalFirmOverview';
import {firmOverviewAllowed,conveyancingRegisterRows} from '../legalFirmOverviewModel';
import {readConveyancingRegister} from '../legalConveyancingReader';
const readers=vi.hoisted(()=>({workspace:vi.fn(),snapshot:vi.fn(),rollout:vi.fn(),normalize:vi.fn()}));
vi.mock('../../../services/attorneyMatterWorkspace',()=>({buildAttorneyMatterWorkspace:readers.workspace,buildAttorneyMatterWorkspaceFromSnapshot:readers.normalize}));
vi.mock('../../../services/attorneyOperations',()=>({getAttorneyOperationalWorkspaceData:vi.fn(async(firmId,userId,options)=>({firmId,userId,...options}))}));
vi.mock('../../../services/attorneyMatterListSnapshotService',()=>({getAttorneyMatterListSnapshot:readers.snapshot}));
vi.mock('../../../services/attorneyMatterSnapshotRolloutService',()=>({getAttorneyMatterSnapshotRolloutStatus:readers.rollout}));
const workspace=()=>({firm:{id:'firm'},currentUser:{id:'partner'},scope:{canViewAllMatterLists:true},pagination:{totalRows:41,page:1,pageSize:20},tableRows:[{matterId:'same',reference:'CON-1',propertyLabel:'Property',status:'Active',actionHref:'/transactions/same'}]});
const legal=()=>({available:true,ready:true,firmId:'firm',userId:'partner',accessVersion:0,activeDiscipline:'wills_estates',disciplines:['wills_estates','trusts'],context:{capabilities:{can_manage:true,can_create:true},grants:[{}]},revoke:vi.fn(),service:{register:vi.fn(async()=>({rows:[{id:'same',reference:'LEG-1',title:'Will',status:'draft'}],total:22,page:1,page_size:20})),firmOverview:vi.fn(async()=>({as_of:'2026-10-11T12:00:00Z',total:22,active:20,intake:3,on_hold:2,overdue:1,workload:[{user_id:'u',name:'Attorney',matters:20}],practices:[{discipline:'wills_estates',active:20,total:22}],upcoming:[],interventions:[]}))}});
function show(component,value,path='/legal/matters'){render(<MemoryRouter initialEntries={[path]}><LegalWorkspaceContext.Provider value={value}>{component}</LegalWorkspaceContext.Provider></MemoryRouter>);}
beforeEach(()=>{vi.resetAllMocks();readers.rollout.mockResolvedValue({enabled:false});readers.workspace.mockImplementation(()=>workspace());});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});
it('overview gate requires existing pilot access, principal grants and explicit switch',()=>{
 const l=legal();expect(firmOverviewAllowed({},l)).toBe(false);expect(firmOverviewAllowed({VITE_ARCH9_LEGAL_OVERVIEW_ENABLED:'true'},l)).toBe(true);l.context.grants=[];expect(firmOverviewAllowed({VITE_ARCH9_LEGAL_OVERVIEW_ENABLED:'true'},l)).toBe(false);
});
it('disabled overview and ordinary attorneys do not call either reporting reader',()=>{
 const l=legal();show(<LegalWorkspacePage/>,l,'/legal/overview');expect(screen.getByText('Firm overview unavailable')).toBeTruthy();expect(l.service.firmOverview).not.toHaveBeenCalled();expect(readers.rollout).not.toHaveBeenCalled();
});
it('combined register keeps source identities, links, counts, search and independent pages',async()=>{
 const l=legal();show(<LegalFirmMatterRegister/>,l);await screen.findByText('Property');expect(screen.getByText('41 matters')).toBeTruthy();expect(screen.getByText('22 matters')).toBeTruthy();expect(screen.getByText('Property').closest('a').getAttribute('href')).toBe('/transactions/same');expect(screen.getByText('Will').closest('a').getAttribute('href')).toContain('/legal/matters/same');
 fireEvent.click(screen.getByRole('button',{name:'Next Conveyancing page'}));await waitFor(()=>expect(readers.workspace).toHaveBeenLastCalledWith(expect.objectContaining({force:true}),expect.objectContaining({page:2})));expect(l.service.register).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByLabelText('Search matters'),{target:{value:'needle'}});await waitFor(()=>expect(readers.workspace).toHaveBeenLastCalledWith(expect.objectContaining({force:true}),expect.objectContaining({search:'needle',page:1})));expect(l.service.register).toHaveBeenLastCalledWith('firm',expect.objectContaining({search:'needle',page:1}));
 fireEvent.change(screen.getByLabelText('Practice'),{target:{value:'trusts'}});await waitFor(()=>expect(l.service.register).toHaveBeenLastCalledWith('firm',expect.objectContaining({discipline:'trusts'})));expect(screen.queryByLabelText('Conveyancing register')).toBeNull();
});
it('source failure shows unavailable instead of zero and keeps Legal plus original workspace reachable',async()=>{
 readers.workspace.mockImplementation(()=>{throw new Error('offline');});const l=legal();show(<LegalFirmOverview/>,l,'/legal/overview');await screen.findByText('Summary unavailable');expect(screen.getByText('Legal matters')).toBeTruthy();expect(screen.getByRole('link',{name:'Open Conveyancing'}).getAttribute('href')).toBe('/attorney/dashboard');
});
it('uses canonical snapshot only under existing rollout and guard; fallback keeps reader scope',async()=>{
 readers.rollout.mockResolvedValue({enabled:true});readers.snapshot.mockResolvedValue({contract:'arch9-attorney-matter-list-snapshot-v2',rows:[{workflowProgress:{canonical:true},propertyLabel:'Property'}]});readers.normalize.mockReturnValue(workspace());await readConveyancingRegister({firmId:'firm',userId:'partner',page:2,search:'needle'});expect(readers.workspace).not.toHaveBeenCalled();expect(readers.snapshot).toHaveBeenCalledWith(expect.objectContaining({page:2,search:'needle'}));
 readers.snapshot.mockResolvedValue({contract:'arch9-attorney-matter-list-snapshot-v2',rows:[{workflowProgress:{canonical:true},propertyLabel:'Property pending'}]});const w=workspace();w.scope.canViewAllMatterLists=false;readers.workspace.mockReturnValue(w);expect((await readConveyancingRegister({firmId:'firm',userId:'partner'})).scope).toBe('assigned');
 w.firm.id='other';await expect(readConveyancingRegister({firmId:'firm',userId:'partner'})).rejects.toThrow('could not be verified');
});
it('adapter preserves canonical deduplicated transaction rows and does not invent legal actions',()=>{
 const w=workspace(),r=conveyancingRegisterRows(w,'firm');expect(r.rows).toHaveLength(1);expect(r.rows[0].key).toBe('conveyancing:firm:same');expect(Object.keys(r.rows[0]).sort()).toEqual(['href','key','reference','source','status','title']);
});
